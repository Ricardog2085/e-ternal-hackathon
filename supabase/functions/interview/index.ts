import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Entrevista del legado: conversa en español y guarda hechos familiares.
// Modo normal: usa MODEL_API_KEY (clave LLM_... de Meta Model API) + MODEL_ID.
// Modo demo (sin clave o si el modelo falla): guía con preguntas fijas que
// igual guarda en family_members. Así el hackathon nunca se bloquea.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function j(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

function trunc(s: string, n = 300): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

const SYSTEM_PROMPT = [
  "Eres 'Guía E-ternal', un entrevistador cálido y paciente que habla español sencillo para adultos mayores.",
  "Tu trabajo: conocer a su familia de a una pregunta corta por mensaje (máximo 40 palabras).",
  "Temas en orden: cuántos hijos tiene, nombres, cumpleaños, pareja, nietos, qué le gustaría decirles y en qué ocasiones.",
  "Cuando el usuario te dé un dato familiar (nombre, parentesco, cumpleaños, mensaje), llama a save_family_fact ANTES de responder.",
  "Cuando termines un tema, llama a save_interview_progress con la lista de temas terminados.",
  "Nunca inventes datos. Usa SOLO los nombres de tu memoria guardada y de esta conversación: si no sabes un nombre o una fecha, pregunta; jamás inventes nombres ni fechas. Si algo no está claro, pregunta de nuevo con amabilidad.",
  "Nunca menciones herramientas, funciones, llamadas ni tu proceso interno, y jamás escribas etiquetas como [TOOL]: solo escribe tu frase para el usuario.",
].join(" ");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "save_family_fact",
      description: "Guarda un dato familiar mencionado por el usuario.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nombre de la persona" },
          relation: { type: "string", description: "Parentesco: hijo, hija, esposo, esposa, nieto, etc." },
          birthdate: { type: "string", description: "Cumpleaños en formato YYYY-MM-DD, o null si no se sabe" },
          notes: { type: "string", description: "Qué le gustaría decirle o notas sobre esa persona" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_interview_progress",
      description: "Guarda los temas de la entrevista ya terminados.",
      parameters: {
        type: "object",
        properties: {
          topics_done: { type: "array", items: { type: "string" } },
        },
        required: ["topics_done"],
      },
    },
  },
];

// ---------- Modo demo (sin LLM): funciona siempre ----------

const DEMO_STOP = new Set([
  "tengo", "hijos", "hijas", "hijo", "hija", "dos", "tres", "cuatro", "cinco",
  "uno", "una", "son", "se", "llaman", "llama", "mis", "son", "son:",
  "el", "la", "los", "las", "de", "del", "con", "para", "por", "que", "qué",
  "mi", "tu", "su", "es", "pareja", "esposo", "esposa", "marido", "mujer",
  "yo", "ella", "ellas", "ellos", "nosotros", "me", "te", "le", "les", "lo", "nos",
  "tienes", "tiene", "tenemos", "tienen", "años", "juntos", "juntas",
  "mensaje", "decir", "decirle", "dejar", "dejarle", "donde", "mucho", "muy", "quiero",
]);

function extractNames(text: string): string[] {
  // Solo extraer de listas explícitas (comas), señales ("se llama") o mensajes cortos.
  const sig = /(?:se\s+llama(?:n)?|llama|llaman|nombres?)(?:\s+es)?\s*:?\s+(.+)/i.exec(text);
  const source = sig ? sig[1] : text;
  if (!sig) {
    if (/,/.test(text)) {
      // lista con comas: ok, se procesa abajo
    } else if (text.trim().split(/\s+/).length > 4) {
      return []; // oración larga sin señal: no adivinar
    }
  }
  const clean = source.replace(/[.!?;:()"]/g, ",");
  const parts = clean.split(/,|\s+y\s+|\s+e\s+|\s*\/\s*|\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/).filter((w) => w && !DEMO_STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
    if (words.length === 0) continue;
    const name = words.slice(0, 2).join(" ");
    if (name.length < 2 || name.length > 60) continue;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    if (!out.includes(cap)) out.push(cap);
    if (out.length >= 6) break;
  }
  return out;
}

const CHILD_WORDS: Record<string, number> = {
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
};

function detectCount(text: string): number | null {
  const d = text.match(/\d+/);
  if (d) {
    const v = parseInt(d[0], 10);
    return v >= 1 && v <= 12 ? v : null;
  }
  const low = text.toLowerCase();
  for (const [w, n] of Object.entries(CHILD_WORDS)) {
    if (low.includes(w)) return n;
  }
  return null;
}

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

// Mensajes que NO son nombres: saludos, muletillas, fechas, despedidas.
function isNoNameMessage(text: string): boolean {
  const low = text.toLowerCase().trim();
  return /^(hola|buenas|buenos d[ií]as|buenas tardes|hey)\b/.test(low)
    || /^(preguntame|pregunta|preguntas|empieza|empecemos|empezamos|dale|ok|okay|vale|si|sí|claro|bueno|adelante)\b/.test(low)
    || /gracias/.test(low)
    || /\b(adi[oó]s|chao|hasta luego|nos vemos)\b/.test(low)
    || /no s[eé]|no me acuerdo|no recuerdo/.test(low)
    || /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/.test(low)
    || /\d{4}-\d{2}-\d{2}/.test(text)
    || /\bcumple/.test(low);
}

function nextDemoQuestion(userCount: number, savedNames: string[], knownNames: string[], lastUser: string): string {
  const seed = `${userCount}:${lastUser}`;
  if (userCount <= 1) {
    if (savedNames.length > 0) {
      return pick([
        `Qué alegría. Ya guardé a ${savedNames.join(", ")} en tu perfil. Y cuéntame, ¿cuándo cumplen años?`,
        `Nombres hermosos: ${savedNames.join(", ")}. Los dejé anotados. ¿Me dices sus cumpleaños?`,
      ], seed);
    }
    const n = detectCount(lastUser);
    if (n !== null) {
      return pick([
        n === 1
          ? "¡Un hijo, qué bendición! ¿Cómo se llama?"
          : `¡${n} hijos, qué familia tan linda! ¿Cómo se llaman? Escríbelos separados por coma.`,
        n === 1
          ? "Qué bonito. ¿Me dices su nombre?"
          : `Me encanta. Dime sus nombres separaditos por coma.`,
      ], seed);
    }
    return pick([
      "Qué bonito. ¿Cómo se llaman? Escríbelos separados por coma.",
      "Gracias por contarme. ¿Me dices sus nombres?",
    ], seed);
  }
  if (userCount === 2) {
    const who = savedNames.length > 0 ? savedNames.join(", ") : knownNames.slice(0, 3).join(", ");
    if (who) {
      return pick([
        `Perfecto, ${who} quedan guardados. Y cuéntame, ¿tienes pareja? ¿Cómo se llama?`,
        `Anotado: ${who}. Ahora dime, ¿hay alguien especial a tu lado? ¿Cómo se llama tu pareja?`,
      ], seed);
    }
    return pick([
      "Gracias. ¿Tienes pareja? ¿Cómo se llama?",
      "Muy bien. ¿Y tu pareja, cómo se llama?",
    ], seed);
  }
  if (userCount === 3) {
    const who = savedNames.length > 0 ? savedNames[0] : knownNames[0];
    if (who) {
      return pick([
        `Si ${who} leyera esto dentro de unos años, ¿qué te gustaría decirle?`,
        `${who} debe ser muy especial para ti. ¿Qué mensaje te gustaría dejarle para el futuro?`,
      ], seed);
    }
    return "¿Qué mensaje te gustaría dejarles a tus seres queridos para el futuro?";
  }
  return pick([
    "Qué hermoso lo que me cuentas, ya lo anoté en tu perfil. ¿Hay algo más de tu familia que quieras contarme?",
    "Lo he guardado con cariño. ¿Qué otra cosa te gustaría que recuerden de ti?",
    "Gracias por confiarme esto. ¿Algo más que quieras agregar sobre los tuyos?",
  ], seed);
}

function demoReply(userCount: number, savedNames: string[], lastUser: string, knownNames: string[]): string {
  const low = lastUser.toLowerCase();
  if (/\b(adi[oó]s|chao|hasta luego|nos vemos)\b/.test(low)) {
    return "Ha sido un gusto conversar contigo. Lo que me contaste queda guardado en tu bóveda. Vuelve cuando quieras seguir.";
  }
  if (/gracias/.test(low)) {
    return `Con mucho gusto, para eso estoy. ${nextDemoQuestion(userCount, [], knownNames, lastUser)}`;
  }
  if (/^(hola|buenas|buenos d[ií]as|buenas tardes|hey)\b/.test(low.trim()) && userCount <= 1 && savedNames.length === 0) {
    return "¡Hola! Me alegra saludarte. Para empezar, cuéntame: ¿cuántos hijos tienes?";
  }
  if (/^(preguntame|pregunta|preguntas|empieza|empecemos|empezamos|dale|ok|okay|vale|si|sí|claro|bueno|adelante)\b/.test(low.trim())) {
    return nextDemoQuestion(userCount, [], knownNames, "");
  }
  if (/no s[eé]|no me acuerdo|no recuerdo/.test(low)) {
    return `No te preocupes, eso lo dejamos para después. ${nextDemoQuestion(userCount + 1, [], knownNames, "")}`;
  }
  return nextDemoQuestion(userCount, savedNames, knownNames, lastUser);
}

const DEMO_TOPICS = ["hijos", "nombres", "pareja", "mensaje", "extra"];

async function demoAnswer(
  sb: ReturnType<typeof createClient>,
  userId: string,
  history: { role: string; content: string }[],
) {
  const userMsgs = history.filter((m) => m.role === "user");
  const lastUser = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : "";
  const { data: known } = await sb.from("family_members").select("name").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
  const knownNames = ((known || []) as { name: string }[]).map((r) => r.name).filter(Boolean);
  const saved: string[] = [];
  // No extraer nombres de saludos, muletillas, fechas ni respuestas vagas.
  const skipExtract = isNoNameMessage(lastUser);
  // Solo intenta extraer nombres en los primeros 3 mensajes del usuario.
  if (!skipExtract && userMsgs.length <= 3 && lastUser.trim().length >= 2) {
    const names = extractNames(lastUser);
    for (const n of names) {
      if (knownNames.some((k) => k.toLowerCase() === n.toLowerCase())) {
        saved.push(n); // ya existe: no duplicar
        continue;
      }
      const { error } = await sb.from("family_members").insert([{
        user_id: userId,
        name: n,
        relation: userMsgs.length === 3 ? "pareja" : "hijo/a",
        birthdate: null,
        notes: null,
      }]);
      if (error) {
        console.error("demo family_members insert error:", error.message);
      } else {
        saved.push(n);
      }
    }
  }
  const topics = DEMO_TOPICS.slice(0, Math.min(userMsgs.length, DEMO_TOPICS.length));
  const { error: stErr } = await sb.from("interview_state").upsert(
    [{ user_id: userId, topics_done: topics, updated_at: new Date().toISOString() }],
    { onConflict: "user_id" },
  );
  if (stErr) console.error("demo interview_state error:", stErr.message);
  console.log(`interview demo ok: user_msgs=${userMsgs.length} saved=${saved.length}`);
  return j({ reply: demoReply(userMsgs.length, saved, lastUser, knownNames), saved, demo: true });
}

// ---------- Borrador de carta con la voz de la persona ----------

const DRAFT_SYSTEM = [
  "Eres 'Pluma E-ternal': redactas cartas de legado en español sencillo, cálido y corto para adultos mayores.",
  "Usa SOLO los nombres y datos reales de la memoria familiar y del mensaje: jamás inventes nombres, fechas ni hechos.",
  "Escribe en primera persona, como si fuera la persona despidiéndose con amor. Tono tierno, sin palabras difíciles.",
  "Entre 120 y 220 palabras. Cierra con 'Con todo mi amor,' SIN firmar ningún nombre (la persona firma).",
  "Devuelve SOLO el texto de la carta, sin comillas ni explicaciones.",
].join(" ");

function letterText(row: Record<string, unknown>): string {
  const v = row.context ?? row.contexto ?? row.content ?? row.contenido ?? row.preview ?? row.mensaje ?? "";
  return String(v || "");
}

function demoDraftLetter(
  recipient: string,
  memRows: { name: string; relation: string | null; notes: string | null }[],
  hint: string,
): string {
  const names = memRows.map((r) => r.name).filter(Boolean);
  const detail = memRows.map((r) => r.notes ? `${r.name}: ${r.notes.slice(0, 120)}` : "").filter(Boolean).join(" ");
  const others = names.filter((n) => n.toLowerCase() !== recipient.toLowerCase()).slice(0, 4);
  const lines = [
    `Querida ${recipient}:`,
    "",
    "Te escribo estas líneas para que siempre tengas un pedazo de mí contigo, aun cuando yo ya no esté.",
    hint.trim()
      ? `Esto es lo que siento: ${hint.trim().slice(0, 400)}`
      : "Quiero que sepas que eres una de las personas que más he amado en esta vida.",
    detail ? `Guardo en mi corazón: ${detail.slice(0, 300)}.` : "",
    others.length > 0
      ? `Cuida mucho a ${others.join(", ")} y mantengan a la familia unida.`
      : "Mantén a nuestra familia unida, que es lo más valioso que dejamos.",
    "Sé buena persona, trabaja con alegría y nunca tengas miedo de empezar de nuevo.",
    "",
    "Con todo mi amor,",
  ];
  return lines.filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

async function draftLetter(
  sb: ReturnType<typeof createClient>,
  userId: string,
  recipientName: string,
  hint: string,
  apiKey: string,
  model: string,
  forceDemo: boolean,
) {
  const { data: memRows } = await sb.from("family_members")
    .select("name, relation, birthdate, notes").eq("user_id", userId)
    .order("created_at", { ascending: true }).limit(30);
  const fam = ((memRows || []) as { name: string; relation: string | null; birthdate: string | null; notes: string | null }[]);
  const memList = fam
    .map((r) => `- ${r.name}${r.relation ? ` (${r.relation})` : ""}${r.birthdate ? `, cumpleaños ${r.birthdate}` : ""}${r.notes ? `: ${r.notes.slice(0, 150)}` : ""}`)
    .join("\n");
  let styleSamples = "";
  try {
    const { data: letters } = await sb.from("memories").select("*")
      .eq("user_id", userId).ilike("type", "%carta%")
      .order("created_at", { ascending: false }).limit(2);
    const samples = ((letters || []) as Record<string, unknown>[])
      .map((r) => trunc(letterText(r), 500).trim()).filter((s) => s.length > 20);
    if (samples.length > 0) {
      styleSamples = `\nMuestras de cómo escribe esta persona (imita su tono y palabras sencillas):\n${samples.map((s) => `"${s}"`).join("\n")}`;
    }
  } catch {
    /* sin muestras: se redacta igual */
  }
  const recipient = recipientName.trim().slice(0, 120) || "mi amor";
  if (!apiKey || forceDemo) {
    console.log("interview draft demo (no key)");
    return j({ draft: demoDraftLetter(recipient, fam, hint), demo: true });
  }
  const userMsg = [
    `Destinatario: ${recipient}.`,
    memList ? `Memoria familiar real (úsala):\n${memList}` : "Memoria familiar: aún vacía.",
    styleSamples,
    hint.trim()
      ? `La persona ya empezó así (continúa y mejora manteniendo SU voz, sin contradecirla): "${hint.trim().slice(0, 800)}"`
      : "Redacta la carta desde cero con calidez.",
  ].filter(Boolean).join("\n\n");
  try {
    const answer = await chatCompletions(apiKey, model, [
      { role: "system", content: DRAFT_SYSTEM },
      { role: "user", content: userMsg },
    ], [], 1500);
    const draft = ((answer as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content || "").trim();
    if (draft.length >= 40) {
      console.log("interview draft ok");
      return j({ draft, demo: false });
    }
    console.error("interview draft empty, using template");
  } catch (e) {
    console.error("interview draft model failed, using template:", e instanceof Error ? e.message : e);
  }
  return j({ draft: demoDraftLetter(recipient, fam, hint), demo: true });
}

// ---------- Llamada al modelo ----------

async function chatCompletions(apiKey: string, model: string, messages: unknown[], tools: unknown[], maxTokens = 800) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  const reasoningEffort = (Deno.env.get("MODEL_REASONING") || "").trim();
  try {
    const res = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        // Llamadas cortas por defecto; los borradores de carta piden más.
        max_tokens: maxTokens,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(Array.isArray(tools) && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("model api error:", res.status, trunc(text, 500));
      const hint =
        res.status === 401
          ? "Clave MODEL_API_KEY inválida o revocada."
          : res.status === 402 || res.status === 429
            ? "Sin créditos o límite excedido en Meta Model API."
            : res.status === 404
              ? `Modelo no encontrado (${model}).`
              : `Model API ${res.status}`;
      const err = new Error(hint) as Error & { code?: string; status?: number };
      err.code = "model_error";
      err.status = res.status;
      throw err;
    }
    return res.json();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      console.error("model api timeout after 25s");
      const err = new Error("Model API tardó demasiado.") as Error & { code?: string };
      err.code = "model_timeout";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") {
      return j({ error: "method_not_allowed", code: "method_not_allowed" }, 405);
    }
    console.log("interview invoke start");

    const rawKey = Deno.env.get("MODEL_API_KEY");
    const apiKey = (rawKey || "").trim();
    const forceDemo = (Deno.env.get("INTERVIEW_DEMO") || "").trim().toLowerCase() === "true";
    const model = (Deno.env.get("MODEL_ID") || "muse-spark-1.3").trim();
    if (apiKey) console.log(`interview env ok: key_len=${apiKey.length} model=${model}`);
    else console.log("interview demo mode: no MODEL_API_KEY visible");

    const supaUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
    if (!supaUrl || !anonKey) {
      console.error("interview misconfigured: SUPABASE_URL or SUPABASE_ANON_KEY missing");
      return j(
        { error: "misconfigured", code: "missing_supabase_env", detail: "Falta SUPABASE_URL o ANON_KEY en runtime." },
        500,
      );
    }

    const auth = req.headers.get("Authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      console.error("interview unauthorized: missing Authorization Bearer");
      return j({ error: "unauthorized", code: "no_auth_header", detail: "Falta sesión. Vuelve a entrar." }, 401);
    }
    const sb = createClient(supaUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("interview unauthorized:", userErr?.message || "no user from JWT");
      return j({ error: "unauthorized", code: "no_session", detail: "Sesión vencida. Vuelve a entrar." }, 401);
    }
    const user = userData.user;
    console.log(`interview user ok: ${user.id}`);

    let body: { messages?: unknown; action?: unknown; recipient_name?: unknown; hint?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return j({ error: "bad_request", code: "bad_json", detail: "Envía { messages: [...] } en JSON." }, 400);
    }
    if (body?.action === "draft-letter") {
      const recipientName = typeof body.recipient_name === "string" ? body.recipient_name : "";
      const hint = typeof body.hint === "string" ? body.hint : "";
      return await draftLetter(sb, user.id, recipientName, hint, apiKey, model, forceDemo);
    }
    const rawMsgs = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
    const history = rawMsgs.filter(
      (m): m is { role: string; content: string } =>
        !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string",
    ).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.slice(0, 2000),
    }));
    if (history.length === 0) {
      return j({ error: "bad_request", code: "empty_messages", detail: "Escribe un mensaje primero." }, 400);
    }

    // Sin clave o demo forzado: responde siempre y guarda.
    if (!apiKey || forceDemo) {
      return await demoAnswer(sb, user.id, history);
    }

    // Memoria REAL: leer lo guardado para no olvidar ni inventar (cruza sesiones).
    const { data: memRows } = await sb.from("family_members")
      .select("name, relation, birthdate, notes").eq("user_id", user.id)
      .order("created_at", { ascending: true }).limit(30);
    const memList = ((memRows || []) as { name: string; relation: string | null; birthdate: string | null; notes: string | null }[])
      .map((r) => `- ${r.name}${r.relation ? ` (${r.relation})` : ""}${r.birthdate ? `, cumpleaños ${r.birthdate}` : ""}${r.notes ? `: ${r.notes.slice(0, 120)}` : ""}`)
      .join("\n");
    const { data: istate } = await sb.from("interview_state")
      .select("topics_done").eq("user_id", user.id).maybeSingle();
    const topicsDone = ((istate as unknown as { topics_done?: string[] } | null)?.topics_done || []).join(", ");
    const sysContent = SYSTEM_PROMPT
      + (memList ? `\nMemoria guardada de esta familia (úsala, no la contradigas, no inventes otros nombres):\n${memList}` : "\nMemoria guardada: aún vacía.")
      + (topicsDone ? `\nTemas ya conversados: ${topicsDone}.` : "");

    const base = [{ role: "system", content: sysContent }, ...history];
    let answer: unknown;
    try {
      answer = await chatCompletions(apiKey, model, base, TOOLS);
    } catch (modelErr) {
      // Si el modelo falla en plena demo, no rompemos: usamos modo demo.
      console.error("interview model failed, fallback to demo:", modelErr instanceof Error ? modelErr.message : modelErr);
      return await demoAnswer(sb, user.id, history);
    }
    const saved: string[] = [];
    const firstCalls = (answer as { choices?: { message?: { tool_calls?: unknown[] } }[] })?.choices?.[0]?.message?.tool_calls || [];
    if (firstCalls.length > 0) {
      const notes: string[] = [];
      for (const c of firstCalls as { id: string; function: { name: string; arguments: string } }[]) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c?.function?.arguments || "{}");
        } catch {
          args = {};
        }
        if (c?.function?.name === "save_family_fact" && typeof args.name === "string" && args.name.trim()) {
          const cleanName = args.name.trim().slice(0, 120);
          const birth = typeof args.birthdate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.birthdate)
            ? args.birthdate
            : null;
          const newRel = typeof args.relation === "string" && args.relation.trim() ? args.relation.trim().slice(0, 60) : null;
          const newNotes = typeof args.notes === "string" && args.notes.trim() ? args.notes.trim().slice(0, 2000) : null;
          // Anti-duplicados: si ya existe (sin importar mayúsculas), solo rellenar vacíos.
          const { data: dup } = await sb.from("family_members")
            .select("id, relation, birthdate, notes").eq("user_id", user.id)
            .ilike("name", cleanName).limit(1).maybeSingle();
          if (dup) {
            const patch: Record<string, unknown> = {};
            if (!dup.relation && newRel) patch.relation = newRel;
            if (!dup.birthdate && birth) patch.birthdate = birth;
            if (newNotes && !(dup.notes || "").includes(newNotes.slice(0, 60))) {
              patch.notes = [dup.notes, newNotes].filter(Boolean).join(" | ").slice(0, 2000);
            }
            if (Object.keys(patch).length > 0) {
              const { error: upErr } = await sb.from("family_members").update(patch).eq("id", dup.id);
              if (upErr) {
                console.error("family_members update error:", upErr.message);
                saved.push(`error: ${upErr.message}`);
                notes.push(`error al actualizar ${cleanName}`);
              } else {
                console.log(`family_members updated: ${cleanName.slice(0, 60)}`);
                saved.push(cleanName);
                notes.push(`actualizado: ${cleanName}`);
              }
            } else {
              console.log(`family_members ya estaba: ${cleanName.slice(0, 60)}`);
              notes.push(`ya estaba: ${cleanName}`);
            }
          } else {
            const { error } = await sb.from("family_members").insert([{
              user_id: user.id,
              name: cleanName,
              relation: newRel,
              birthdate: birth,
              notes: newNotes,
            }]);
            if (error) {
              console.error("family_members insert error:", error.message);
              saved.push(`error: ${error.message}`);
              notes.push(`error al guardar ${cleanName}`);
            } else {
              console.log(`family_members saved: ${cleanName.slice(0, 60)}`);
              saved.push(cleanName);
              notes.push(`guardado: ${cleanName}`);
            }
          }
        } else if (c?.function?.name === "save_interview_progress" && Array.isArray(args.topics_done)) {
          const { error } = await sb.from("interview_state").upsert(
            [{ user_id: user.id, topics_done: args.topics_done, updated_at: new Date().toISOString() }],
            { onConflict: "user_id" },
          );
          if (error) console.error("interview_state upsert error:", error.message);
          notes.push(error ? "error en progreso" : "progreso guardado");
        } else {
          notes.push("acción ignorada");
        }
      }
      // Segunda llamada en texto plano, SIN reinyectar tool_calls ni herramientas:
      // este modelo razona sin fin cuando le devuelves el protocolo de tools.
      const lastUserText = [...history].reverse().find((m) => m.role === "user")?.content || "";
      try {
        answer = await chatCompletions(apiKey, model, [
          { role: "system", content: sysContent },
          ...history.slice(-6),
          {
            role: "user",
            content: `Dato ya guardado: ${notes.join("; ") || "ninguno"}. Último mensaje del usuario: "${lastUserText.slice(0, 500)}". Continúa la entrevista en español con una frase corta. Si aún falta guardar algún dato, no lo menciones ni intentes guardarlo: solo conversa.`,
          },
        ], []);
      } catch (modelErr2) {
        console.error("interview model round2 failed, fallback to demo:", modelErr2 instanceof Error ? modelErr2.message : modelErr2);
        return await demoAnswer(sb, user.id, history);
      }
    }

    let reply = (answer as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content || "";
    if (!reply.trim()) {
      try {
        console.error("interview empty answer shape:", trunc(JSON.stringify(answer), 600));
      } catch {
        /* ignore */
      }
      console.error("interview empty content, retrying plain text");
      try {
        const follow = await chatCompletions(apiKey, model, [
          ...base,
          { role: "user", content: "Respóndeme en español con una frase corta: confirma lo guardado y hazme la siguiente pregunta sobre mi familia." },
        ], []);
        reply = (follow as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content || "";
      } catch (e) {
        console.error("interview plain retry failed:", e instanceof Error ? e.message : e);
      }
    }
    const cleanSaved = saved.filter((s) => !s.startsWith("error"));
    if (/\[TOOL|save_family_fact|save_interview_progress|procedo a guardar|voy a registrar|llamo a|no puedo llamar a herramientas/i.test(reply)) {
      console.error("interview leaked tool narration, using demo fallback");
      return await demoAnswer(sb, user.id, history);
    }
    if (!reply.trim()) {
      console.error("interview model gave no content twice, using demo fallback");
      return await demoAnswer(sb, user.id, history);
    }
    console.log("interview reply ok");
    return j({ reply, saved: cleanSaved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code || "internal";
    console.error("interview error:", code, trunc(message, 500));
    return j({ error: "internal", code, detail: trunc(message, 300) }, 500);
  }
});
