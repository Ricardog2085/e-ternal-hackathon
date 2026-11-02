import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Trash2,
  UserPlus,
  Send,
  ShieldCheck,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Recipient } from '../lib/vault';
import type { Memory } from './MemoryCard';

interface DeliveryPanelProps {
  userId: string;
  recipients: Recipient[];
  memories: Memory[];
  onRecipientsChanged: () => void;
}

interface Custodian {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  activated_at: string | null;
  waiting_until: string | null;
  vetoed: boolean;
  executed: boolean;
}

interface Delivery {
  id: string;
  memory_id: string;
  recipient_id: string;
  status: string;
  attempts: number;
  scheduled_for: string | null;
  sent_at: string | null;
  last_error: string | null;
}

function isMissingTable(msg: string): boolean {
  return /relation|does not exist|schema/i.test(msg || '');
}

function isCustodianReleased(c: Custodian | null, nowMs: number): boolean {
  return !!c && c.status === 'active' && !c.vetoed && !c.executed
    && !!c.waiting_until && new Date(c.waiting_until).getTime() <= nowMs;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function DeliveryPanel({ userId, recipients, memories, onRecipientsChanged }: DeliveryPanelProps) {
  const [custodian, setCustodian] = useState<Custodian | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [schemaHint, setSchemaHint] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [rName, setRName] = useState('');
  const [rRelation, setRRelation] = useState('');
  const [rPhone, setRPhone] = useState('');

  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [waitDateTime, setWaitDateTime] = useState('');

  const refresh = useCallback(async () => {
    const { data: cust, error: custErr } = await supabase
      .from('custodians')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (custErr) {
      if (isMissingTable(custErr.message)) {
        setSchemaHint(true);
        return;
      }
    } else {
      setCustodian((cust as unknown as Custodian | null) ?? null);
    }
    const { data: dels, error: delErr } = await supabase
      .from('deliveries')
      .select('*')
      .eq('user_id', userId)
      .order('scheduled_for', { ascending: false })
      .limit(50);
    if (delErr) {
      if (isMissingTable(delErr.message)) {
        setSchemaHint(true);
        return;
      }
    } else {
      setDeliveries(((dels || []) as unknown) as Delivery[]);
    }
  }, [userId]);

  useEffect(() => {
    // Carga inicial tras montar (en microtarea para no fijar estado sincrónicamente).
    Promise.resolve()
      .then(() => refresh())
      .catch(() => {});
  }, [refresh]);

  const addRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rName.trim()) {
      setNotice('Escribe al menos el nombre del destinatario.');
      return;
    }
    setBusy('recipient');
    setNotice(null);
    const { error } = await supabase.from('recipients').insert([{
      user_id: userId,
      name: rName.trim(),
      relation: rRelation.trim() || null,
      phone: rPhone.trim() || null,
    }]);
    setBusy(null);
    if (error) {
      if (isMissingTable(error.message)) setSchemaHint(true);
      else setNotice(`No se pudo guardar: ${error.message}`);
      return;
    }
    setRName('');
    setRRelation('');
    setRPhone('');
    onRecipientsChanged();
  };

  const deleteRecipient = async (id: string, name: string) => {
    if (!window.confirm(`¿Eliminar a ${name} de tus destinatarios? Sus recuerdos quedarán sin asignar.`)) return;
    setBusy(`del-${id}`);
    const { error } = await supabase.from('recipients').delete().eq('id', id).eq('user_id', userId);
    setBusy(null);
    if (error) {
      setNotice(`No se pudo eliminar: ${error.message}`);
      return;
    }
    onRecipientsChanged();
  };

  const nominateCustodian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cEmail.trim() && !cPhone.trim()) {
      setNotice('Indica un correo o un teléfono del custodio.');
      return;
    }
    setBusy('custodian');
    setNotice(null);
    const { error } = await supabase.from('custodians').insert([{
      user_id: userId,
      name: cName.trim() || null,
      email: cEmail.trim() || null,
      phone: cPhone.trim() || null,
      status: 'nominated',
    }]);
    setBusy(null);
    if (error) {
      if (isMissingTable(error.message)) setSchemaHint(true);
      else setNotice(`No se pudo guardar: ${error.message}`);
      return;
    }
    setCName('');
    setCEmail('');
    setCPhone('');
    refresh();
  };

  const callDispatch = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    setNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke('dispatch-deliveries', {
        body: { action, ...(extra || {}) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const summary = Array.isArray(data?.summary) ? data.summary : [];
      const sent = summary.filter((s: { status?: string }) => s?.status === 'sent').length;
      const failed = summary.filter((s: { status?: string }) => s?.status === 'failed').length;
      if (data?.demo === false) {
        setNotice(`Enviado por WhatsApp real: ${sent} entregado(s)${failed ? `, ${failed} fallido(s)` : ''}. Revisa el estado abajo.`);
      } else {
        setNotice(`Listo (simulado): ${sent} marcado(s)${failed ? `, ${failed} fallido(s)` : ''}. Para envío real pon DEMO_MODE=false y usa "Enviar por WhatsApp".`);
      }
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to send|failed to fetch|not found/i.test(msg)) {
        setNotice('La función dispatch-deliveries aún no está desplegada en Supabase (ver guía de despliegue).');
      } else {
        setNotice(`Aviso: ${msg}`);
      }
    } finally {
      setBusy(null);
    }
  };

  const programDelivery = () => {
    if (!waitDateTime) {
      setNotice('Elige fecha y hora para programar la entrega.');
      return;
    }
    const target = new Date(waitDateTime);
    if (Number.isNaN(target.getTime())) {
      setNotice('Fecha y hora no válidas.');
      return;
    }
    const minutes = Math.round((target.getTime() - Date.now()) / 60000);
    if (minutes < 1) {
      setNotice('Elige una fecha y hora futura.');
      return;
    }
    callDispatch('activate-demo', { waiting_minutes: minutes });
  };

  // Modo custodio: abre WhatsApp con el mensaje + enlace al video listos.
  // La persona pulsa Enviar (manual, sin API ni verificación de empresa).
  const sendViaWaMe = async (d: Delivery) => {
    const mem = memories.find((m) => m.id === d.memory_id);
    const rec = recipients.find((r) => r.id === d.recipient_id);
    if (!rec?.phone) {
      setNotice('Ese destinatario no tiene teléfono guardado.');
      return;
    }
    const digits = rec.phone.replace(/\D/g, '');
    if (!digits) {
      setNotice('Teléfono inválido.');
      return;
    }
    setBusy(`wa-${d.id}`);
    setNotice(null);
    try {
      let media = '';
      const stored = mem?.storagePath;
      if (stored && !/^https?:\/\//i.test(stored)) {
        const { data, error } = await supabase.storage.from('vault').createSignedUrl(stored, 604800);
        if (!error && data?.signedUrl) media = data.signedUrl;
      } else if (stored) {
        media = stored;
      }
      const text = mem ? (mem.preview || mem.title) : '';
      const excerpt = text.length > 900 ? text.slice(0, 900) + '...' : text;
      const msg = `Hola ${rec.name}, E-ternal te entrega un legado: ${excerpt || '(ver adjunto)'}${media ? `\n${media}` : ''}`;
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    } finally {
      setBusy(null);
    }
  };

  const memoryTitle = (id: string): string =>
    memories.find((m) => m.id === id)?.title || `#${id.slice(0, 8)}`;

  const recipientName = (id: string): string =>
    recipients.find((r) => r.id === id)?.name || 'Destinatario';

  const statusBadge = (s: string) => {
    if (s === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" /> Enviado
        </span>
      );
    }
    if (s === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">
          <XCircle className="w-3 h-3" /> Fallido
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
        <Clock3 className="w-3 h-3" /> Pendiente
      </span>
    );
  };

  const [nowMs] = useState(() => Date.now());
  const assignedCount = memories.filter((m) => m.recipientId).length;
  const phoneCount = recipients.filter((r) => r.phone && r.phone.replace(/\D/g, '')).length;
  const custodianReleased = isCustodianReleased(custodian, nowMs);
  const custodianHint = !custodian
    ? 'Sin custodio: desígnalo arriba.'
    : custodian.executed
      ? 'Ya ejecutado: no reenvía.'
      : custodian.vetoed
        ? 'Vetado por ti: cancelado.'
        : custodian.status === 'active'
          ? (custodianReleased ? 'Liberado: listo para enviar.' : `En espera hasta ${formatDate(custodian.waiting_until)}.`)
          : 'Designado: actívalo con fecha/hora o 1 min.';

  return (
    <div className="space-y-6">
      {schemaHint && (
        <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p>
            Falta aplicar la guía <span className="font-mono text-xs">supabase/vault-delivery-setup.sql</span> en tu
            panel de Supabase para activar destinatarios, custodio y entregas.
          </p>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-xl bg-[#FAF4E5] border border-[#E8D8A6] text-[#2C241E] text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
          <p>{notice}</p>
        </div>
      )}

      {/* Destinatarios */}
      <section className="bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] shadow-xs p-5 sm:p-6">
        <h3 className="font-serif text-lg font-bold text-[#2C241E]">Destinatarios</h3>
        <p className="text-xs sm:text-sm text-[#6B625B] mt-1">
          Las personas que recibirán tus recuerdos. El teléfono debe incluir código de país (ej: +52...).
        </p>

        {recipients.length > 0 && (
          <ul className="mt-4 space-y-2">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#2C241E] truncate">
                    {r.name}
                    {r.relation ? <span className="font-normal text-[#6B625B]"> • {r.relation}</span> : null}
                  </p>
                  {r.phone ? <p className="text-xs text-[#6B625B]">{r.phone}</p> : (
                    <p className="text-xs text-amber-700">Sin teléfono: no podrá recibir por WhatsApp</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteRecipient(r.id, r.name)}
                  disabled={busy === `del-${r.id}`}
                  title={`Eliminar a ${r.name}`}
                  className="p-2 rounded-lg text-[#6B625B] hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {busy === `del-${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addRecipient} className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            type="text"
            required
            placeholder="Nombre *"
            value={rName}
            onChange={(e) => setRName(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
          />
          <input
            type="text"
            placeholder="Parentesco (hija, nieto...)"
            value={rRelation}
            onChange={(e) => setRRelation(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
          />
          <input
            type="tel"
            placeholder="WhatsApp (+52...)"
            value={rPhone}
            onChange={(e) => setRPhone(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
          />
          <button
            type="submit"
            disabled={busy === 'recipient'}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2C241E] hover:bg-[#3E342B] text-[#FAF4E5] text-sm font-semibold transition-all cursor-pointer disabled:opacity-60"
          >
            {busy === 'recipient' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-[#D4AF37]" />}
            Agregar
          </button>
        </form>
      </section>

      {/* Custodio */}
      <section className="bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] shadow-xs p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FAF4E5] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
            <UserPlus className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-[#2C241E]">Custodio de entrega</h3>
            <p className="text-xs sm:text-sm text-[#6B625B]">
              Persona de confianza que podrá activar la entrega. Nada se envía sin un período de espera que tú puedes cancelar.
            </p>
          </div>
        </div>

        {!custodian ? (
          <form onSubmit={nominateCustodian} className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <input
              type="text"
              placeholder="Nombre"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
            />
            <input
              type="email"
              placeholder="Correo"
              value={cEmail}
              onChange={(e) => setCEmail(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={cPhone}
              onChange={(e) => setCPhone(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
            />
            <button
              type="submit"
              disabled={busy === 'custodian'}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2D] text-white text-sm font-semibold transition-all cursor-pointer disabled:opacity-60"
            >
              {busy === 'custodian' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Designar
            </button>
          </form>
        ) : (
          <div className="mt-4 px-4 py-3.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] space-y-2">
            <p className="text-sm font-semibold text-[#2C241E]">
              {custodian.name || 'Custodio'} • {custodian.email || custodian.phone || 'sin contacto'}
            </p>
            <p className="text-xs text-[#6B625B]">
              Estado: <strong className="text-[#2C241E]">{custodian.executed ? 'Ejecutado' : custodian.vetoed ? 'Vetado por ti' : custodian.status === 'active' ? 'Activo' : 'Designado'}</strong>
              {custodian.waiting_until ? ` • Se libera: ${formatDate(custodian.waiting_until)}` : null}
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              {custodian.status === 'nominated' && !custodian.vetoed && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#2C241E]">
                    Fecha y hora de liberación
                    <input
                      type="datetime-local"
                      value={waitDateTime}
                      onChange={(e) => setWaitDateTime(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={programDelivery}
                    disabled={busy === 'activate-demo'}
                    title="Programa el envío por WhatsApp para esa fecha (lo ejecuta el reparto diario)"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2C241E] hover:bg-[#3E342B] text-[#FAF4E5] text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                  >
                    {busy === 'activate-demo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#D4AF37]" />}
                    Programar entrega
                  </button>
                  <button
                    type="button"
                    onClick={() => callDispatch('activate-demo', { waiting_minutes: 1 })}
                    disabled={busy === 'activate-demo'}
                    title="Prueba rápida: libera la entrega en 1 minuto"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAF4E5] hover:bg-[#EFE9DE] text-[#2C241E] border border-[#E8D8A6] text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                  >
                    Probar en 1 min
                  </button>
                </div>
              )}
              {custodian.status === 'active' && !custodian.vetoed && !custodian.executed && (
                <button
                  type="button"
                  onClick={() => callDispatch('veto')}
                  disabled={busy === 'veto'}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-red-50 text-red-800 border border-red-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
                >
                  {busy === 'veto' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  Cancelar entrega (veto)
                </button>
              )}
              <button
                type="button"
                onClick={() => callDispatch('dispatch-now')}
                disabled={busy === 'dispatch-now'}
                title="Envía ahora mismo aunque la fecha sea futura. Real si DEMO_MODE=false; si no, simula"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
              >
                {busy === 'dispatch-now' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Enviar por WhatsApp ahora
              </button>
              <button
                type="button"
                onClick={() => callDispatch('dispatch-demo')}
                disabled={busy === 'dispatch-demo'}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAF4E5] hover:bg-[#EFE9DE] text-[#2C241E] border border-[#E8D8A6] text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
              >
                {busy === 'dispatch-demo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#D4AF37]" />}
                Ejecutar reparto ahora (demo)
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Entregas */}
      <section className="bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] shadow-xs p-5 sm:p-6">
        <h3 className="font-serif text-lg font-bold text-[#2C241E]">Entregas</h3>
        <p className="text-xs sm:text-sm text-[#6B625B] mt-1">
          Estado de cada recuerdo programado para sus destinatarios.
        </p>
        {deliveries.length === 0 ? (
          <div className="mt-4 bg-[#FDFBF7] border border-dashed border-[#EFE9DE] rounded-xl px-4 py-4 space-y-2">
            <p className="text-sm font-semibold text-[#2C241E]">Aún no hay entregas. Para crearlas necesitas:</p>
            <ul className="space-y-1.5 text-[13px] text-[#6B625B]">
              <li className="flex items-center gap-2">
                {assignedCount > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                Recuerdos asignados a una persona: {assignedCount} de {memories.length}
              </li>
              <li className="flex items-center gap-2">
                {phoneCount > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                Destinatarios con teléfono: {phoneCount} de {recipients.length}
              </li>
              <li className="flex items-center gap-2">
                {custodianReleased ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                Custodio: {custodianHint}
              </li>
            </ul>
            <p className="text-xs text-[#6B625B]">
              {assignedCount > 0 && phoneCount > 0 && custodianReleased
                ? 'Todo listo: pulsa Ejecutar reparto o Enviar por WhatsApp.'
                : 'Completa lo marcado y pulsa Ejecutar reparto. Para enviar un video ya, usa su botón WhatsApp directo.'}
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {deliveries.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#2C241E] truncate">
                    {memoryTitle(d.memory_id)} <span className="font-normal text-[#6B625B]">→ {recipientName(d.recipient_id)}</span>
                  </p>
                  <p className="text-[11px] text-[#6B625B]">
                    Programada: {formatDate(d.scheduled_for)}
                    {d.sent_at ? ` • Enviada: ${formatDate(d.sent_at)}` : null}
                    {d.status === 'failed' && d.last_error ? ` • ${d.last_error}` : null}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {statusBadge(d.status)}
                  <button
                    type="button"
                    onClick={() => sendViaWaMe(d)}
                    disabled={busy === `wa-${d.id}`}
                    title="Abrir WhatsApp con el mensaje y el video listos (tú pulsas Enviar)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#1FB857] text-white text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-60"
                  >
                    {busy === `wa-${d.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    WhatsApp
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
