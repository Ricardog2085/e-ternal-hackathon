import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  Mic,
  Square,
  RotateCcw,
  SwitchCamera,
  AlertCircle,
  Volume2
} from 'lucide-react';

export type MediaRecordingType = 'Video' | 'Nota de Voz';

interface MediaRecorderProps {
  mode: MediaRecordingType;
  onMediaCaptured: (file: File) => void;
  onClearMedia?: () => void;
  capturedFile?: File | null;
}

export const MediaRecorderComponent: React.FC<MediaRecorderProps> = ({
  mode,
  onMediaCaptured,
  onClearMedia,
  capturedFile,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Determinar MIME type compatible con el navegador (especialmente iOS Safari)
  const getSupportedMimeType = (type: 'video' | 'audio'): string => {
    if (typeof MediaRecorder === 'undefined') return '';

    if (type === 'video') {
      const videoTypes = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      for (const t of videoTypes) {
        if (MediaRecorder.isTypeSupported(t)) return t;
      }
    } else {
      const audioTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/wav',
      ];
      for (const t of audioTypes) {
        if (MediaRecorder.isTypeSupported(t)) return t;
      }
    }
    return '';
  };

  // Reasigna firmemente el stream activo de getUserMedia a videoRef.current.srcObject y reproduce
  const attachStreamToVideo = useCallback(() => {
    if (videoRef.current && streamRef.current) {
      const videoEl = videoRef.current;
      if (videoEl.srcObject !== streamRef.current) {
        videoEl.srcObject = streamRef.current;
      }
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.play().catch((err) => {
        console.warn('Error al reproducir preview de video:', err);
      });
    }
  }, []);

  // Garantiza que cuando los estados cambien al iniciar la grabación, el stream se asigne firmemente
  useEffect(() => {
    if (isRecording && mode === 'Video') {
      attachStreamToVideo();
    }
  }, [isRecording, mode, attachStreamToVideo]);

  // Detener todos los tracks del hardware (apaga la luz de cámara y micrófono de inmediato)
  const stopHardwareStreams = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Limpiar recursos al desmontar el componente
  useEffect(() => {
    return () => {
      stopHardwareStreams();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [stopHardwareStreams, previewUrl]);

  // Visualizador de audio (para dar feedback en tiempo real sin cámara)
  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!streamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 255) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch {
      // Ignorar si el navegador bloquea AudioContext automático
    }
  };

  /**
   * =========================================================================
   * 1. FUNCIÓN DEDICADA: GRABAR SOLO AUDIO (NOTA DE VOZ)
   * Exclusivamente audio: true, video: false para NO encender la cámara
   * =========================================================================
   */
  const startAudioRecording = async () => {
    try {
      stopHardwareStreams();
      setError(null);
      chunksRef.current = [];

      // REQUISITO CRÍTICO: video estrictamente false para micrófono dedicado
      const audioConstraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      streamRef.current = stream;

      setupAudioVisualizer(stream);

      const mimeType = getSupportedMimeType('audio');
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || 'audio/mp4';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);

        let ext = 'm4a';
        if (finalMime.includes('webm')) ext = 'webm';
        else if (finalMime.includes('ogg')) ext = 'ogg';
        else if (finalMime.includes('wav')) ext = 'wav';

        const timestamp = Date.now();
        const file = new File([blob], `nota_voz_${timestamp}.${ext}`, {
          type: finalMime,
          lastModified: timestamp,
        });

        onMediaCaptured(file);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      console.error('Error al iniciar grabación de audio:', err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setError('Permiso denegado para usar el micrófono. Concede acceso para grabar la nota de voz.');
      } else {
        setError(`No se pudo activar el micrófono: ${msg}`);
      }
      stopHardwareStreams();
    }
  };

  /**
   * =========================================================================
   * 2. FUNCIÓN DEDICADA: GRABAR VIDEO DE ALTA RESOLUCIÓN (IPHONE / MÓVIL)
   * Constraints de alta definición exigiendo 1920x1080 ideal y cámara frontal/trasera
   * =========================================================================
   */
  const startVideoRecording = async (targetFacing: 'user' | 'environment' = facingMode) => {
    try {
      stopHardwareStreams();
      setError(null);
      chunksRef.current = [];

      // REQUISITO CRÍTICO: Resolución vertical estricta 9:16 (modo retrato)
      const videoConstraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: {
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: 0.5625,
          facingMode: targetFacing,
          frameRate: { ideal: 30, max: 60 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      streamRef.current = stream;

      const mimeType = getSupportedMimeType('video');
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);

        let ext = 'mp4';
        if (finalMime.includes('webm')) ext = 'webm';

        const timestamp = Date.now();
        const file = new File([blob], `video_celestial_${timestamp}.${ext}`, {
          type: finalMime,
          lastModified: timestamp,
        });

        onMediaCaptured(file);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);

      // Reasignación inmediata para el elemento de video si ya está montado
      attachStreamToVideo();

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      console.error('Error al iniciar grabación de video HD:', err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setError('Permiso denegado para cámara o micrófono. Permite el acceso para continuar.');
      } else {
        setError(`No se pudo activar la cámara de alta calidad: ${msg}`);
      }
      stopHardwareStreams();
    }
  };

  // Botón principal de acción: dirige al canal correspondiente según el modo activo
  const handleStart = () => {
    if (mode === 'Video') {
      startVideoRecording(facingMode);
    } else {
      startAudioRecording();
    }
  };

  // Detener la grabación activa
  const handleStop = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopHardwareStreams();
    setIsRecording(false);
  };

  // Alternar cámara frontal / trasera para iPhone
  const handleToggleFacingMode = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (isRecording) {
      handleStop();
      startVideoRecording(nextFacing);
    }
  };

  // Repetir / Descartar grabación
  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setRecordingTime(0);
    setIsRecording(false);
    stopHardwareStreams();
    if (onClearMedia) {
      onClearMedia();
    }
  };

  // Formato mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-[#FAF4E5]/50 border border-[#E8D8A6] rounded-2xl p-4 sm:p-5 transition-all text-center">
      {/* Mensaje de error amigable */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2 text-left animate-fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Aviso de Dispositivo:</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* CASO 1: YA EXISTE UNA GRABACIÓN FINALIZADA O ARCHIVO ADJUNTO */}
      {previewUrl || capturedFile ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-full flex justify-center">
            {mode === 'Video' ? (
              <video
                src={previewUrl || (capturedFile ? URL.createObjectURL(capturedFile) : undefined)}
                controls
                playsInline
                className="w-full max-w-sm aspect-[9/16] object-cover rounded-xl shadow-lg border border-[#D4AF37]/50 bg-black"
              />
            ) : (
              <div className="w-full rounded-xl overflow-hidden bg-[#2C241E] border border-[#D4AF37]/50 shadow-inner py-8 px-4 flex flex-col items-center gap-3 bg-gradient-to-b from-[#2C241E] to-[#1F1915]">
                <div className="w-14 h-14 rounded-full bg-[#FAF4E5] border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-lg">
                  <Volume2 className="w-7 h-7" />
                </div>
                <p className="text-xs uppercase tracking-widest text-[#FAF4E5] font-semibold">
                  Nota de Voz Capturada
                </p>
                <audio
                  src={previewUrl || (capturedFile ? URL.createObjectURL(capturedFile) : undefined)}
                  controls
                  className="w-full max-w-sm mt-1 filter drop-shadow-sm"
                />
              </div>
            )}
          </div>

          <div className="w-full flex items-center justify-between gap-2 pt-1 text-xs">
            <span className="text-[#6B625B] font-medium truncate max-w-[200px]">
              {capturedFile ? capturedFile.name : `Grabación (${formatTime(recordingTime)})`}
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF4E5] hover:bg-[#EFE9DE] text-[#2C241E] font-medium border border-[#E8D8A6] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#D4AF37]" />
              Grabar de nuevo
            </button>
          </div>
        </div>
      ) : isRecording ? (
        /* CASO 2: GRABANDO EN CURSO */
        <div className="flex flex-col items-center gap-4">
          {mode === 'Video' ? (
            /* Visor de Video en Vivo para iPhone / Desktop con autoPlay, playsInline y muted en formato vertical estricto 9:16 */
            <div className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-black border-2 border-[#D4AF37] shadow-xl flex items-center justify-center mx-auto">
              <video
                ref={(el) => {
                  videoRef.current = el;
                  if (el && streamRef.current && el.srcObject !== streamRef.current) {
                    el.srcObject = streamRef.current;
                    el.muted = true;
                    el.playsInline = true;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                className="w-full max-w-sm aspect-[9/16] object-cover rounded-xl"
              />
              {/* Badge REC */}
              <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs border border-red-500/50 text-white text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                <span className="text-red-400 font-mono tracking-wider">REC {formatTime(recordingTime)}</span>
              </div>

              {/* Botón para cambiar cámara (Frontal / Trasera en iPhone) */}
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white border border-white/20 transition-all cursor-pointer"
                title="Cambiar Cámara"
              >
                <SwitchCamera className="w-4 h-4 text-[#D4AF37]" />
              </button>
            </div>
          ) : (
            /* Animación Celestial de Micrófono para Nota de Voz (Sin Cámara) */
            <div className="w-full py-8 px-4 rounded-2xl bg-gradient-to-b from-[#FAF4E5] via-[#FFFFFF] to-[#FAF4E5] border border-[#D4AF37]/40 shadow-inner flex flex-col items-center justify-center gap-4">
              <div className="relative flex items-center justify-center">
                {/* Ondas sonoras pulsantes basadas en audioLevel */}
                <div
                  className="absolute w-24 h-24 rounded-full bg-[#D4AF37]/20 animate-ping"
                  style={{ animationDuration: '2s' }}
                />
                <div
                  className="absolute w-20 h-20 rounded-full bg-[#D4AF37]/30 transition-transform duration-100"
                  style={{ transform: `scale(${1 + audioLevel * 0.008})` }}
                />
                <div className="relative z-10 w-16 h-16 rounded-full bg-[#FAF4E5] border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-md">
                  <Mic className="w-8 h-8 animate-pulse text-red-600" />
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-red-600 font-mono text-sm font-bold tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                  GRABANDO AUDIO ({formatTime(recordingTime)})
                </div>
                <p className="text-[11px] text-[#6B625B] mt-1">
                  Cámara apagada • Capturando solo tu voz con máxima fidelidad
                </p>
              </div>

              {/* Indicador de nivel sonoro */}
              <div className="w-48 h-1.5 bg-[#E8D8A6]/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#D4AF37] to-red-500 transition-all duration-75"
                  style={{ width: `${Math.max(10, audioLevel)}%` }}
                />
              </div>
            </div>
          )}

          {/* Botón para detener grabación */}
          <button
            type="button"
            onClick={handleStop}
            className="flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs tracking-wider uppercase shadow-lg shadow-red-600/30 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Square className="w-4 h-4 fill-white" />
            <span>Detener y Guardar Grabación</span>
          </button>
        </div>
      ) : (
        /* CASO 3: ESTADO INICIAL LISTO PARA GRABAR */
        <div className="flex flex-col items-center justify-center gap-3 py-2">
          <div className="w-14 h-14 rounded-full bg-[#FFFFFF] border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-sm">
            {mode === 'Video' ? <Video className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
          </div>

          <div>
            <h4 className="font-serif font-bold text-base text-[#2C241E]">
              {mode === 'Video' ? 'Grabación de Video en Alta Definición' : 'Grabación de Nota de Voz'}
            </h4>
            <p className="text-xs text-[#6B625B] max-w-sm mx-auto mt-0.5">
              {mode === 'Video'
                ? 'Optimizado para sensores iPhone / Full HD (1920x1080) con cámara frontal o principal.'
                : 'Canal de audio dedicado sin encendido de cámara. Máxima privacidad y fidelidad acústica.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8972E] hover:from-[#B8972E] hover:to-[#A38322] text-[#FDFBF7] font-semibold text-xs tracking-wider uppercase shadow-md shadow-[#D4AF37]/20 transition-all transform hover:scale-102 active:scale-98 cursor-pointer"
            >
              {mode === 'Video' ? (
                <>
                  <Video className="w-4 h-4" />
                  <span>Iniciar Video HD</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Iniciar Nota de Voz</span>
                </>
              )}
            </button>

            {mode === 'Video' && (
              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#E8D8A6] hover:border-[#D4AF37] text-[#2C241E] text-xs font-medium transition-colors cursor-pointer"
                title="Alternar entre cámara frontal o trasera antes de grabar"
              >
                <SwitchCamera className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{facingMode === 'user' ? 'Cámara Frontal' : 'Cámara Trasera'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaRecorderComponent;
