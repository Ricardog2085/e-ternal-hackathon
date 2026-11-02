import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Motor de entrega post-mortem (Fase 3 + Fase 4 WhatsApp real).
// Acciones: activate-demo (dueño), veto (dueño), dispatch-demo (dueño,
// siempre simulado), dispatch-now (dueño, real si DEMO_MODE=false),
// dispatch (cron con x-cron-secret, respeta DEMO_MODE).
// Secretos (Edge Functions > Secrets):
//   CRON_SECRET (obligatorio para dispatch), DEMO_MODE=true|false,
//   Fase 4: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE.
// Plantilla requerida: solo texto (sin encabezado), idioma es, cuerpo con
// 2 variables: {{1}} nombre del destinatario, {{2}} texto del recuerdo.
// El video/audio se envía como segundo mensaje con enlace firmado (7 días).
// Fechas por recuerdo (unlock_condition con YYYY-MM-DD): solo el cron las
// respeta; dispatch-demo y dispatch-now envían de inmediato (forzado).

const SIGNED_URL_TTL_SECONDS = 604800; // 7 días, para que WhatsApp descargue el adjunto
const MAX_ATTEMPTS = 5;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );
}

function userClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_ANON_KEY") || "",
    { global: { headers: { Authorization: authHeader } } },
  );
}

async function ownUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const sb = userClient(auth);
  const { data: { user } } = await sb.auth.getUser();
  return user ? user.id : null;
}

function normalizeKind(typeRaw: unknown): "video" | "audio" | "letter" {
  const t = String(typeRaw || "").toLowerCase();
  if (t.includes("video")) return "video";
  if (t.includes("voz") || t.includes("audio")) return "audio";
  return "letter";
}

async function resolveAttachment(
  sb: ReturnType<typeof serviceClient>,
  stored: string | null,
): Promise<string | null> {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  const { data, error } = await sb.storage.from("vault").createSignedUrl(stored, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`signed url: ${error?.message || "sin URL"}`);
  return data.signedUrl;
}

async function sendWhatsApp(
  to: string,
  kind: "video" | "audio" | "letter",
  recipientName: string,
  text: string,
  mediaUrl: string | null,
): Promise<string> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const template = Deno.env.get("WHATSAPP_TEMPLATE") || "";
  if (!token || !phoneId || !template) {
    throw new Error("faltan secretos WHATSAPP_TOKEN/PHONE_ID/TEMPLATE");
  }
  const digits = to.replace(/\D/g, "");
  if (!digits) throw new Error("destinatario sin teléfono");
  const excerpt = text.length > 900 ? text.slice(0, 900) + "..." : text;
  const mediaType = kind === "video" ? "video" : kind === "audio" ? "audio" : null;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const url = `https://graph.facebook.com/v23.0/${phoneId}/messages`;
  // 1) Plantilla de texto (abre la ventana de conversación de 24 h).
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digits,
      type: "template",
      template: {
        name: template,
        language: { code: "es" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: recipientName },
            { type: "text", text: excerpt || "(sin texto)" },
          ],
        }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp plantilla ${res.status}: ${await res.text()}`);
  const out = await res.json();
  const firstId = out?.messages?.[0]?.id || "plantilla-enviada";
  // 2) Si hay video/audio, enviarlo como segundo mensaje con enlace firmado.
  if (mediaType && mediaUrl) {
    const res2 = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: mediaType,
        [mediaType]: { link: mediaUrl },
      }),
    });
    if (!res2.ok) throw new Error(`WhatsApp medio ${res2.status}: ${await res2.text()}`);
    const out2 = await res2.json();
    return `${firstId}+${out2?.messages?.[0]?.id || "medio-enviado"}`;
  }
  return firstId;
}

async function runDispatch(sb: ReturnType<typeof serviceClient>, onlyUserId: string | null, demo: boolean, forceDates = false) {
  const now = new Date().toISOString();
  let q = sb.from("custodians").select("*").eq("status", "active").eq("vetoed", false).eq("executed", false)
    .lte("waiting_until", now);
  if (onlyUserId) q = q.eq("user_id", onlyUserId);
  const { data: custodians, error: custErr } = await q;
  if (custErr) throw new Error(`custodios: ${custErr.message}`);
  const summary: unknown[] = [];
  for (const cust of custodians || []) {
    const { data: memories, error: memErr } = await sb.from("memories").select("*").eq("user_id", cust.user_id);
    if (memErr) throw new Error(`memories: ${memErr.message}`);
    const { data: recipients } = await sb.from("recipients").select("*").eq("user_id", cust.user_id);
    const byId = new Map((recipients || []).map((r) => [r.id, r]));
    let pendingLeft = 0;
    for (const mem of memories || []) {
      const rec = mem.recipient_id ? byId.get(mem.recipient_id) : null;
      if (!rec || !rec.phone) continue; // sin destinatario con teléfono no hay entrega
      const { data: existing } = await sb.from("deliveries")
        .select("*").eq("user_id", cust.user_id).eq("memory_id", String(mem.id)).eq("recipient_id", rec.id)
        .maybeSingle();
      let del = existing;
      if (!del) {
        const ins = await sb.from("deliveries").insert([{
          user_id: cust.user_id,
          memory_id: String(mem.id),
          recipient_id: rec.id,
          status: "pending",
          scheduled_for: now,
          log: "creada por reparto",
        }]).select().single();
        if (ins.error) throw new Error(`delivery insert: ${ins.error.message}`);
        del = ins.data;
      }
      if (del.status === "sent") continue;
      if (del.status === "failed" && del.attempts >= MAX_ATTEMPTS) continue;
      pendingLeft++;
      if (!forceDates) {
        const dm = /(\d{4}-\d{2}-\d{2})/.exec(String(mem.unlock_condition || mem.unlockCondition || ""));
        if (dm) {
          const due = new Date(`${dm[1]}T09:00:00`).getTime();
          if (Number.isFinite(due) && due > Date.now()) {
            summary.push({ memory_id: del.memory_id, status: "scheduled", note: `programado ${dm[1]}` });
            continue; // sigue pendiente: el cron lo reintentará al llegar la fecha
          }
        }
      }
      const kind = normalizeKind(mem.type || mem.tipo);
      const text = mem.context || mem.contexto || mem.content || mem.contenido || mem.preview || mem.mensaje || "";
      const stored = mem.file_url || mem.fileUrl || mem.archivo_url || mem.url || null;
      try {
        let note = "";
        if (demo) {
          note = `simulado (${kind})`;
        } else {
          const mediaUrl = kind === "letter" ? null : await resolveAttachment(sb, stored);
          const waId = await sendWhatsApp(rec.phone, kind, rec.name, String(text || ""), mediaUrl);
          note = `whatsapp:${waId}`;
        }
        await sb.from("deliveries").update({
          status: "sent",
          attempts: (del.attempts || 0) + 1,
          sent_at: new Date().toISOString(),
          last_error: null,
          log: `${del.log || ""}\n${now} ${note}`.slice(-2000),
        }).eq("id", del.id);
        pendingLeft--;
        summary.push({ memory_id: del.memory_id, status: "sent", note });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await sb.from("deliveries").update({
          status: "failed",
          attempts: (del.attempts || 0) + 1,
          last_error: message,
          log: `${del.log || ""}\n${now} fallo: ${message}`.slice(-2000),
        }).eq("id", del.id);
        if ((del.attempts || 0) + 1 >= MAX_ATTEMPTS) pendingLeft--;
        summary.push({ memory_id: del.memory_id, status: "failed", error: message });
      }
    }
    if (pendingLeft === 0) {
      await sb.from("custodians").update({ executed: true }).eq("id", cust.id);
    }
  }
  return summary;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "activate-demo" || action === "veto" || action === "dispatch-demo" || action === "dispatch-now") {
      const userId = await ownUserId(req);
      if (!userId) return json({ error: "unauthorized" }, 401);
      const sb = userClient(req.headers.get("Authorization") || "");
      if (action === "veto") {
        const { error } = await sb.from("custodians")
          .update({ vetoed: true, status: "vetoed" })
          .eq("user_id", userId).eq("executed", false);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, vetoed: true });
      }
      if (action === "activate-demo") {
        const minutes = Number(body?.waiting_minutes ?? 7 * 24 * 60);
        const until = new Date(Date.now() + minutes * 60000).toISOString();
        const { data, error } = await sb.from("custodians")
          .update({ status: "active", activated_at: new Date().toISOString(), waiting_until: until })
          .eq("user_id", userId).eq("status", "nominated").select();
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, activated: (data || []).length, waiting_until: until });
      }
      // dispatch-now: solo dueño, real si DEMO_MODE=false (botón "Enviar por WhatsApp").
      if (action === "dispatch-now") {
        const demo = (Deno.env.get("DEMO_MODE") || "true").toLowerCase() !== "false";
        const summary = await runDispatch(serviceClient(), userId, demo, true);
        return json({ ok: true, demo, summary });
      }
      // dispatch-demo: solo dueño, siempre simulado
      const summary = await runDispatch(serviceClient(), userId, true, true);
      return json({ ok: true, demo: true, summary });
    }

    if (action === "dispatch") {
      const cronSecret = Deno.env.get("CRON_SECRET") || "";
      if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
        return json({ error: "forbidden" }, 403);
      }
      const demo = (Deno.env.get("DEMO_MODE") || "true").toLowerCase() !== "false";
      const summary = await runDispatch(serviceClient(), null, demo);
      return json({ ok: true, demo, summary });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
