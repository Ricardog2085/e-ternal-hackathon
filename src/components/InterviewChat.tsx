import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Sparkles, Mic, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Voz con Web Speech API del navegador (Chrome/Edge, gratis, sin servidor):
// micrófono para dictar respuestas y lectura en voz alta de la guía.
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

const GREETING =
  'Hola, soy tu guía de E-ternal. Te haré unas preguntas sencillas sobre tu familia para ayudarte a dejar tu legado. ¿Empezamos? ¿Cuántos hijos tienes?';

export default function InterviewChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ]);
  const [draft, setDraft] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failDetail, setFailDetail] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [micSupported] = useState(() => getSpeechRecognition() !== null);
  const [ttsSupported] = useState(() => ttsAvailable());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wantListening = useRef(false);
  const [conversing, setConversing] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Al salir: apagar micrófono y voz para no dejar audio colgado.
  useEffect(() => {
    return () => {
      wantListening.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* sin micrófono activo */
      }
      try {
        if (ttsAvailable()) window.speechSynthesis.cancel();
      } catch {
        /* sin voz activa */
      }
    };
  }, []);

  const speakNow = (text: string) => {
    if (!ttsSupported || !text.trim()) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-ES';
      utter.rate = 0.95;
      synth.speak(utter);
    } catch {
      /* voz no disponible: el chat sigue normal */
    }
  };

  const speak = (text: string) => {
    if (!voiceReply) return;
    speakNow(text);
  };

  // Habla y avisa al terminar (para reabrir el micro en conversación).
  const speakThen = (text: string, after: () => void) => {
    if (!ttsSupported || !text.trim()) {
      after();
      return;
    }
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-ES';
      utter.rate = 0.95;
      utter.onend = () => after();
      utter.onerror = () => after();
      synth.speak(utter);
    } catch {
      after();
    }
  };

  const stopListening = () => {
    wantListening.current = false;
    setConversing(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      /* sin micrófono activo */
    }
    setListening(false);
  };

  // Pausa momentánea (la guía piensa o habla): la conversación sigue abierta.
  const pauseListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* sin micrófono activo */
    }
    setListening(false);
  };

  // Abre el micrófono: primera pulsación o reanudación de la conversación.
  const openMic = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    try {
      if (ttsSupported) window.speechSynthesis.cancel();
    } catch {
      /* sin voz activa */
    }
    const rec = new Ctor();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last && last[0] ? last[0].transcript : '';
      if (transcript.trim()) {
        setDraft((prev) => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
        setMicError(null);
      }
    };
    rec.onerror = (event: unknown) => {
      setListening(false);
      const code = (event as { error?: string })?.error || '';
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        wantListening.current = false;
        setConversing(false);
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setMicError('El navegador bloqueó el micrófono: pulsa el candado de la barra de dirección, permite el micrófono y recarga la página.');
      } else if (code === 'no-speech') {
        setMicError('No te escuché: acércate al micrófono y sigue hablando.');
      } else if (code === 'audio-capture') {
        setMicError('No encontré ningún micrófono en este equipo.');
      } else if (code === 'network') {
        setMicError('El dictado necesita conexión a internet.');
      } else if (code) {
        setMicError(`El micrófono falló (${code}). Vuelve a pulsar.`);
      }
    };
    rec.onend = () => {
      // Si el navegador corta al pausar, reabrir mientras la conversación siga abierta.
      // Con pequeña espera: Chrome rechaza reabrir de inmediato.
      if (wantListening.current) {
        window.setTimeout(() => {
          if (!wantListening.current) return;
          try {
            rec.start();
          } catch {
            wantListening.current = false;
            setConversing(false);
            setListening(false);
          }
        }, 150);
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = rec;
    wantListening.current = true;
    setConversing(true);
    try {
      rec.start();
      setListening(true);
    } catch {
      wantListening.current = false;
      setConversing(false);
      setListening(false);
      setMicError('No pude abrir el micrófono. Revisa el permiso en el candado de la barra de dirección.');
    }
  };

  const toggleListen = () => {
    if (!getSpeechRecognition()) return;
    setMicError(null);
    if (wantListening.current) {
      stopListening();
      return;
    }
    openMic();
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    pauseListening();
    setDraft('');
    setSavedNote(null);
    setFailed(false);
    setFailDetail(null);
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('interview', {
        body: { messages: next.slice(-12) },
      });
      if (error) throw error;
      if (data?.error) {
        const detail = data?.detail ? `: ${String(data.detail).slice(0, 200)}` : '';
        throw new Error(`${String(data.code || data.error)}${detail}`);
      }
      const reply = (data?.reply || '').toString() || 'Perdona, no pude responder. Inténtalo de nuevo.';
      const saved = Array.isArray(data?.saved) ? data.saved.filter(Boolean) : [];
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      if (wantListening.current) {
        // Conversación abierta: al terminar de hablar la guía, reabrir el micro.
        if (voiceReply) {
          speakThen(reply, () => {
            if (wantListening.current) openMic();
          });
        } else {
          openMic();
        }
      } else {
        speak(reply);
      }
      if (saved.length > 0) {
        setSavedNote(`He guardado en tu perfil: ${saved.join(', ')}`);
      }
    } catch (err) {
      console.error('Error en entrevista:', err);
      const status = (err as { context?: { status?: number } })?.context?.status;
      let hint = '';
      if (status === 401) hint = ' Tu sesión venció: vuelve a entrar.';
      else if (status === 502) hint = ' El guía no pudo responder (revisa clave o créditos).';
      else if (status === 500) hint = ' Revisa el secreto MODEL_API_KEY y redespliega interview.';
      else if (status === 400) hint = ' Escribe un mensaje primero.';
      if (status) {
        console.error('Interview status:', status);
        setFailDetail(` (código ${status}).${hint}`);
      } else {
        setFailDetail(hint || null);
      }
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-[#F3ECE0] flex items-center gap-2.5 bg-[#FDFBF7]">
        <div className="w-9 h-9 rounded-full bg-[#2C241E] text-[#D4AF37] flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#2C241E]">Guía E-ternal</p>
          <p className="text-xs text-[#6B625B]">Te pregunto y memorizo a tu familia</p>
        </div>
        {ttsSupported && (
          <button
            type="button"
            onClick={() => {
              if (voiceReply) {
                try {
                  window.speechSynthesis.cancel();
                } catch {
                  /* sin voz activa */
                }
                setVoiceReply(false);
              } else {
                setVoiceReply(true);
                speakNow('Voz activada. A partir de ahora te leeré mis respuestas.');
              }
            }}
            title={voiceReply ? 'Silenciar voz de la guía' : 'Escuchar respuestas en voz alta'}
            aria-label={voiceReply ? 'Silenciar voz de la guía' : 'Escuchar respuestas en voz alta'}
            aria-pressed={voiceReply}
            className={`ml-auto p-2.5 rounded-xl border transition-all cursor-pointer shrink-0 ${
              voiceReply
                ? 'bg-[#FAF4E5] border-[#D4AF37]/60 text-[#D4AF37]'
                : 'bg-[#FFFFFF] border-[#EFE9DE] text-[#6B625B] hover:text-[#2C241E]'
            }`}
          >
            {voiceReply ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        )}
      </div>

      <div ref={scrollRef} className="px-5 sm:px-6 py-5 space-y-3.5 max-h-[380px] overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <p
              className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#2C241E] text-[#FDFBF7] rounded-br-md'
                  : 'bg-[#FAF4E5] text-[#2C241E] border border-[#E8D8A6]/70 rounded-bl-md'
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <p className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-[#FAF4E5] border border-[#E8D8A6]/70 text-[#6B625B] text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
              Pensando...
            </p>
          </div>
        )}
      </div>

      {savedNote && (
        <p className="mx-5 sm:mx-6 mb-3 px-3.5 py-2 rounded-xl bg-[#FAF4E5] border border-[#E8D8A6] text-xs text-[#2C241E]">
          {savedNote}
        </p>
      )}

      {micError && (
        <p className="mx-5 sm:mx-6 mb-3 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          {micError}
        </p>
      )}

      {failed && (
        <p className="mx-5 sm:mx-6 mb-3 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          No pude responder. Revisa tu conexión o que la función interview esté desplegada, e inténtalo de nuevo.{failDetail}
        </p>
      )}

      {conversing && (
        <p className="mx-5 sm:mx-6 mb-3 px-3.5 py-2 rounded-xl bg-[#FAF4E5] border border-[#D4AF37]/50 text-[#2C241E] text-xs">
          {listening
            ? 'Conversación abierta: habla, pulsa Enviar, y sigue. Pulsa el micrófono para terminar.'
            : 'La guía está respondiendo... tu turno sigue.'}
        </p>
      )}

      <div className="px-5 sm:px-6 pb-5 flex items-center gap-2.5">
        {micSupported && (
          <button
            type="button"
            onClick={toggleListen}
            title={conversing ? 'Terminar conversación' : 'Hablar con la guía'}
            aria-label={conversing ? 'Terminar conversación' : 'Hablar con la guía'}
            aria-pressed={conversing}
            className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0 ${
              conversing
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                : 'bg-[#FDFBF7] border border-[#EFE9DE] hover:border-[#D4AF37]/60 text-[#2C241E]'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={conversing ? 'Conversación abierta: habla y pulsa Enviar' : 'Escribe o pulsa el micrófono...'}
          disabled={sending}
          className="flex-1 px-4 py-3 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-[15px] text-[#2C241E] disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          title="Enviar respuesta"
          className="w-12 h-12 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2D] text-white flex items-center justify-center shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
