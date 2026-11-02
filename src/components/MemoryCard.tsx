import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Recipient } from '../lib/vault';
import {
  Video,
  Volume2,
  FileText,
  Send,
  Trash2,
  Loader2,
  Play,
  Clock,
  Lock,
  Calendar,
  RotateCw,
} from 'lucide-react';

export interface Memory {
  id: string;
  title: string;
  recipient: string;
  type: 'Video' | 'Nota de Voz' | 'Carta';
  dateCreated: string;
  unlockCondition: string;
  preview: string;
  recipientId?: string;
  fileUrl?: string;
  storagePath?: string;
  durationOrWords?: string;
  thumbnailColor?: string;
  isPrivate: boolean;
}

interface MemoryCardProps {
  memory: Memory;
  isDeleting: boolean;
  onDelete: (id: string, title: string) => void;
  recipients?: Recipient[];
}

export default function MemoryCard({ memory, isDeleting, onDelete, recipients = [] }: MemoryCardProps) {
  // Estado local de rotación para videos (inicia en 0 grados)
  const [rotation, setRotation] = useState<number>(0);
  // Si el archivo murió (era pública), mostrar aviso honesto en vez de reproductor roto
  const [mediaDead, setMediaDead] = useState<boolean>(false);
  const [sendingWa, setSendingWa] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [poster, setPoster] = useState<string | undefined>(undefined);

  // Miniatura local: captura el primer cuadro para que el video no se vea
  // negro en celular (donde el navegador no precarga). Si falla, no rompe nada.
  const capturePoster = () => {
    const v = videoRef.current;
    if (!v || poster || v.readyState < 2 || v.videoWidth === 0) return;
    try {
      if (v.currentTime < 0.05 && (v.duration || 0) > 0.2) {
        v.currentTime = 0.1;
        return;
      }
      const canvas = document.createElement('canvas');
      const w = 320;
      canvas.width = w;
      canvas.height = Math.max(1, Math.round((w * v.videoHeight) / Math.max(1, v.videoWidth)));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      setPoster(canvas.toDataURL('image/jpeg', 0.7));
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    } catch {
      /* sin acceso al cuadro (CORS/formato): queda como antes */
    }
  };

  // Envío directo por video: abre wa.me con mensaje + enlace.
  // Con teléfono va al chat; sin teléfono abre el selector de chats.
  const sendWa = async () => {
    setSendingWa(true);
    try {
      let media = '';
      const stored = memory.storagePath;
      if (stored && !/^https?:\/\//i.test(stored)) {
        const { data, error } = await supabase.storage.from('vault').createSignedUrl(stored, 604800);
        if (!error && data?.signedUrl) media = data.signedUrl;
      } else if (stored) {
        media = stored;
      } else if (memory.fileUrl) {
        media = memory.fileUrl;
      }
      const text = memory.preview || memory.title || '';
      const excerpt = text.length > 900 ? text.slice(0, 900) + '...' : text;
      const phone = (recipients.find((r) => r.id === memory.recipientId)?.phone || '').replace(/\D/g, '');
      const msg = `Hola ${memory.recipient}, E-ternal te entrega un legado: ${excerpt || '(ver adjunto)'}${media ? `\n${media}` : ''}`;
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank', 'noopener');
    } finally {
      setSendingWa(false);
    }
  };

  // Lógica de Giro: suma 90 grados sucesivamente (0, 90, 180, 270 y vuelta a 0)
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const isVideo = memory.type === 'Video';
  const isAudio = memory.type === 'Nota de Voz';
  const isLetter = memory.type === 'Carta';
  const isSideways = rotation === 90 || rotation === 270;

  return (
    <article
      className={`group relative bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] hover:border-[#D4AF37]/70 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden ${
        isDeleting ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      <div className="h-1 w-full bg-gradient-to-r from-transparent via-[#D4AF37]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between">
        <div>
          {/* Header of the Card: Destinatario + Tipo de Archivo + Botón Eliminar con estado de carga */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-[#FAF4E5] text-[#2C241E] border-[#E8D8A6]">
                {isVideo && <Video className="w-3.5 h-3.5 text-[#D4AF37]" />}
                {isAudio && <Volume2 className="w-3.5 h-3.5 text-[#D4AF37]" />}
                {isLetter && <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />}
                <span>{memory.type}</span>
              </span>

              <span className="text-xs font-medium text-[#6B625B] bg-[#FDFBF7] px-2.5 py-1 rounded-md border border-[#EFE9DE]">
                Para: <strong className="text-[#2C241E] font-semibold">{memory.recipient}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={sendWa}
                disabled={sendingWa}
                title="Enviar este recuerdo por WhatsApp (se abre el chat listo)"
                aria-label={`Enviar recuerdo para ${memory.recipient} por WhatsApp`}
                className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-white bg-[#25D366] hover:bg-[#1FB857] transition-all cursor-pointer disabled:opacity-60"
              >
                {sendingWa ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span className="text-[11px] font-semibold">WhatsApp</span>
              </button>
              {/* Botón de papelera para DELETE con texto de carga 'Eliminando...' */}
              <button
                type="button"
                onClick={() => onDelete(memory.id, memory.title)}
                disabled={isDeleting}
                title="Eliminar recuerdo de Supabase"
                aria-label={`Eliminar recuerdo para ${memory.recipient}`}
                className="h-8 px-2 rounded-lg flex items-center gap-1 text-[#6B625B] hover:text-red-700 hover:bg-red-50/80 border border-transparent hover:border-red-200 transition-all cursor-pointer shrink-0 disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                    <span className="text-[11px] text-red-600 font-medium">Eliminando...</span>
                  </>
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Title */}
          <h3 className="font-serif text-lg sm:text-xl font-bold text-[#2C241E] leading-snug group-hover:text-[#2C241E] transition-colors">
            {memory.title}
          </h3>

          {/* Visual Preview or Real Player */}
          {isVideo && memory.fileUrl && !mediaDead && (
            <div
              className={`mt-3.5 relative rounded-2xl border border-[#E8D8A6]/80 bg-[#1A1410] overflow-hidden shadow-xs flex items-center justify-center transition-all duration-300 ${
                isSideways ? 'min-h-[300px] sm:min-h-[340px] p-2' : 'min-h-[180px]'
              }`}
            >
              {/* Botón celestial de rotación */}
              <div className="absolute top-2.5 right-2.5 z-20">
                <button
                  type="button"
                  onClick={handleRotate}
                  title="Girar video"
                  aria-label="Girar video"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2C241E]/85 hover:bg-[#2C241E] text-[#D4AF37] hover:text-[#FAF4E5] border border-[#D4AF37]/50 hover:border-[#D4AF37] backdrop-blur-xs text-xs font-medium transition-all shadow-md cursor-pointer group/rotate"
                >
                  <RotateCw className="w-3.5 h-3.5 transition-transform duration-300 group-hover/rotate:90" />
                  <span className="text-[11px] font-mono tracking-tight">
                    Girar {rotation > 0 ? `(${rotation}°)` : ''}
                  </span>
                </button>
              </div>

              {/* Reproductor de video con transformación rotacional animada */}
              <video
                ref={videoRef}
                playsInline
                controls
                src={memory.fileUrl}
                poster={poster}
                onLoadedData={capturePoster}
                onSeeked={capturePoster}
                onError={() => setMediaDead(true)}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 0.3s ease',
                }}
                className={`rounded-xl object-contain bg-black/90 transition-all duration-300 ${
                  isSideways ? 'max-h-72 max-w-[260px]' : 'w-full max-h-56'
                }`}
                preload="metadata"
              >
                Tu navegador no soporta la reproducción de video.
              </video>
            </div>
          )}

          {isVideo && memory.fileUrl && mediaDead && (
            <div className="mt-3.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              Este video ya no está disponible en la bóveda (es de antes del modo privado). Crea de nuevo el recuerdo para restaurarlo.
            </div>
          )}

          {isVideo && !memory.fileUrl && (
            <div className="mt-3.5 relative rounded-xl h-32 bg-gradient-to-br from-[#2C241E]/5 via-[#D4AF37]/10 to-[#2C241E]/10 border border-[#EFE9DE] overflow-hidden flex items-center justify-center group/preview">
              <div className="absolute inset-0 bg-[#2C241E]/5 backdrop-blur-[1px]" />
              <div className="relative z-10 w-11 h-11 rounded-full bg-[#FFFFFF] border border-[#D4AF37] shadow-md flex items-center justify-center text-[#D4AF37] group-hover/preview:scale-110 transition-transform">
                <Play className="w-4 h-4 fill-[#D4AF37] ml-0.5" />
              </div>
              <div className="absolute bottom-2.5 right-2.5 bg-[#2C241E]/80 backdrop-blur-xs text-[#FDFBF7] text-[11px] px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#D4AF37]" />
                {memory.durationOrWords}
              </div>
            </div>
          )}

          {isAudio && memory.fileUrl && !mediaDead && (
            <div className="mt-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-[#FAF4E5] to-[#FDFBF7] border border-[#E8D8A6] flex flex-col gap-2 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-[#6B625B]">
                <div className="flex items-center gap-1.5 font-medium text-[#2C241E]">
                  <Volume2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>Nota de Voz en Custodia</span>
                </div>
                <span className="text-[10px] text-[#D4AF37] uppercase tracking-wider font-semibold bg-[#FAF4E5] px-2 py-0.5 rounded-md border border-[#E8D8A6]/60">
                  Vault Audio
                </span>
              </div>
              <audio
                controls
                src={memory.fileUrl}
                onError={() => setMediaDead(true)}
                className="w-full h-10 rounded-lg accent-[#D4AF37]"
                preload="metadata"
              >
                Tu navegador no soporta la reproducción de audio.
              </audio>
            </div>
          )}

          {isAudio && memory.fileUrl && mediaDead && (
            <div className="mt-3.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              Este audio ya no está disponible en la bóveda (es de antes del modo privado). Crea de nuevo el recuerdo para restaurarlo.
            </div>
          )}

          {isAudio && !memory.fileUrl && (
            <div className="mt-3.5 p-3 rounded-xl bg-[#FAF4E5]/50 border border-[#EFE9DE] flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#FFFFFF] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shrink-0">
                <Play className="w-3.5 h-3.5 fill-[#D4AF37] ml-0.5" />
              </div>
              <div className="flex-1 flex items-center gap-1 h-6">
                {[40, 65, 30, 85, 95, 45, 70, 30, 90, 60, 40, 75, 50, 80, 45, 60, 35, 70].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[#D4AF37]/50 rounded-full transition-all"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <span className="text-[11px] font-mono text-[#6B625B] shrink-0">
                {memory.durationOrWords}
              </span>
            </div>
          )}

          {isLetter && memory.preview && (
            <div className="mt-3.5 p-3.5 rounded-xl bg-[#FAF4E5]/40 border border-[#E8D8A6]/50 border-l-2 border-l-[#D4AF37] italic font-serif text-sm text-[#2C241E]/90 leading-relaxed">
              "{memory.preview}"
            </div>
          )}

          {!isLetter && memory.preview && (
            <p className="mt-2.5 text-xs text-[#6B625B] line-clamp-2 leading-relaxed">
              {memory.preview}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3.5 border-t border-[#F3ECE0] flex items-center justify-between text-xs text-[#6B625B]">
          <div className="flex items-center gap-1.5 truncate pr-2">
            <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span className="truncate font-medium text-[#2C241E]/80">
              {memory.unlockCondition}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-[#6B625B]/70" />
            <span>{memory.dateCreated}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
