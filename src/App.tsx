import React, { useState, useEffect } from 'react';
import {
  Video,
  Mic,
  MessageCircle,
  PenTool,
  LayoutGrid,
  Lock,
  ShieldCheck,
  Sparkles,
  Heart,
  Plus,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Upload,
  Volume2
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import ProfileModal from './components/ProfileModal';
import MemoryCard, { type Memory } from './components/MemoryCard';
import { computeInitials } from './lib/user';
import MediaRecorderComponent from './components/MediaRecorder';
import GlassLayout from './components/GlassLayout';
import GlassNavbar from './components/GlassNavbar';
import GlassCard from './components/GlassCard';
import InterviewChat from './components/InterviewChat';
import ResetPassword from './components/ResetPassword';
import DeliveryPanel from './components/DeliveryPanel';
import { fetchRecipients, type Recipient } from './lib/vault';

// Lectura en voz alta con Web Speech API del navegador (sin servidor).

const NEW_MEMORY_COLS = ['recipient_id', 'unlock_condition'];

function stripNewColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row };
  for (const col of NEW_MEMORY_COLS) delete copy[col];
  return copy;
};

// Maps records from Supabase (whether columns are Spanish or English)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRecordToMemory(row: any): Memory {
  const typeRaw = (row.type || row.tipo || 'Carta').toString();
  let normalizedType: 'Video' | 'Nota de Voz' | 'Carta' = 'Carta';
  if (typeRaw.toLowerCase().includes('video')) normalizedType = 'Video';
  else if (typeRaw.toLowerCase().includes('voz') || typeRaw.toLowerCase().includes('audio')) normalizedType = 'Nota de Voz';
  else normalizedType = 'Carta';

  const previewText = row.context || row.contexto || row.content || row.contenido || row.preview || row.mensaje || '';
  const fileUrl = row.file_url || row.fileUrl || row.archivo_url || row.url || undefined;

  const dateStr = row.created_at
    ? new Date(row.created_at).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : (row.dateCreated || 'Reciente');

  const rawCondition = row.unlockCondition || row.unlock_condition || row.condicion || '';
  const dateMatch = /^(\d{4}-\d{2}-\d{2})\s*(?:·\s*(.*))?$/.exec(rawCondition.trim());
  const niceCondition = dateMatch
    ? `Entrega: ${new Date(`${dateMatch[1]}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}${dateMatch[2] ? ` · ${dateMatch[2]}` : ''}`
    : (rawCondition || 'Custodia en la nube');

  return {
    id: String(row.id),
    recipientId: row.recipient_id || undefined,
    title: row.title || row.titulo || 'Sin título',
    recipient: row.recipient || row.destinatario || 'Para alguien especial',
    type: normalizedType,
    preview: previewText,
    fileUrl: fileUrl,
    dateCreated: dateStr,
    unlockCondition: niceCondition,
    unlockRaw: rawCondition,
    durationOrWords: normalizedType === 'Carta' 
      ? `${previewText.split(/\s+/).filter(Boolean).length || 1} palabras` 
      : normalizedType === 'Video' 
      ? (fileUrl ? 'Video en la bóveda' : 'Video guardado') 
      : (fileUrl ? 'Audio en la bóveda' : 'Audio guardado'),
    thumbnailColor: 'from-[#FAF4E5] to-[#EFE9DE]',
    isPrivate: true,
  };
}

export default function App() {
  // Session & Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<'glass' | 'vault'>('vault');

  // State for memories loaded from Supabase (empty array initially)
  const [memories, setMemories] = useState<Memory[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsReady, setRecipientsReady] = useState(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal and toast states
  const [activeModal, setActiveModal] = useState<'Video' | 'Nota de Voz' | 'Carta' | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // File upload & live recording state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [mediaSourceTab, setMediaSourceTab] = useState<'record' | 'upload'>('record');

  // Async action loading states for UX
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [readingDraft, setReadingDraft] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [draftTtsSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states for creating a new memory modal
  const [formTitle, setFormTitle] = useState('');
  const [formRecipient, setFormRecipient] = useState('');
  const [formCondition, setFormCondition] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formContent, setFormContent] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'todos' | 'Video' | 'Nota de Voz' | 'Carta'>('todos');

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
  const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v'];
  const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'aac', 'webm', 'opus'];

  // Client-side upload guard (UX only: real enforcement is the Storage policy)
  const validateUploadFile = (file: File, kind: 'Video' | 'Nota de Voz' | 'Carta' | null): string | null => {
    if (file.size > MAX_UPLOAD_BYTES) {
      return `El archivo supera el límite de ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.`;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (kind !== 'Carta') {
      const allowed = kind === 'Nota de Voz' ? AUDIO_EXTENSIONS : VIDEO_EXTENSIONS;
      if (!allowed.includes(ext)) {
        return `Formato no permitido (.${ext || 'sin extensión'}). Usa: ${allowed.join(', ')}.`;
      }
      if (file.type) {
        const expected = kind === 'Nota de Voz' ? 'audio/' : 'video/';
        if (!file.type.startsWith(expected)) {
          return `El archivo no parece ser de tipo ${kind === 'Nota de Voz' ? 'audio' : 'video'}.`;
        }
      }
    }
    return null;
  };

  // Resolves a stored storage path into a short-lived signed URL (1h, refreshed on each read).
  // Legacy http(s) URLs (public bucket era) pass through unchanged.
  const resolveStorageUrl = async (stored?: string): Promise<string | undefined> => {
    if (!stored) return undefined;
    if (/^https?:\/\//i.test(stored)) return stored;
    try {
      const { data, error } = await supabase.storage.from('vault').createSignedUrl(stored, 3600);
      if (error || !data?.signedUrl) throw error || new Error('sin URL firmada');
      return data.signedUrl;
    } catch (err) {
      console.warn('No se pudo firmar la URL privada, usando fallback público:', err);
      return supabase.storage.from('vault').getPublicUrl(stored).data.publicUrl;
    }
  };

  const loadRecipients = async (userId: string) => {
    const result = await fetchRecipients(userId);
    setRecipients(result.recipients);
    setRecipientsReady(result.schemaReady);
  };

  // 1. READ: Fetch only the current user's memories from Supabase
  const fetchMemories = async (userId: string) => {
    if (!userId) {
      setMemories([]);
      setLoading(false);
      return;
    }
    const ownerId = userId;
    setLoading(true);
    setFetchError(null);
    try {
      let { data, error } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', ownerId)
        .order('id', { ascending: false });
      // Transición: si la columna user_id aún no existe, leer sin filtro
      if (error && /user_id|column/i.test(error.message || '')) {
        console.warn('Columna user_id ausente; leyendo sin filtro por usuario (aplica supabase/security-setup.md).');
        ({ data, error } = await supabase
          .from('memories')
          .select('*')
          .order('id', { ascending: false }));
      }

      if (error) {
        console.error('Error al consultar Supabase:', error);
        setFetchError(error.message);
      } else if (data) {
        const mapped = data.map(mapRecordToMemory);
        const resolved = await Promise.all(
          mapped.map(async (m) => ({ ...m, storagePath: m.fileUrl, fileUrl: await resolveStorageUrl(m.fileUrl) }))
        );
        setMemories(resolved);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido de conexión';
      console.error('Error de conexión:', err);
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  };

  // Listen to Supabase Session on Mount and Auth Changes in Real Time
  useEffect(() => {
    // 1. Fetch existing session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setAuthLoading(false);
      if (initialSession) {
        fetchMemories(initialSession.user.id);
        loadRecipients(initialSession.user.id);
      }
    });

    // 2. Real-time subscription to sign in / sign out events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession);
      setAuthLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
      if (currentSession) {
        fetchMemories(currentSession.user.id);
        loadRecipients(currentSession.user.id);
      } else {
        setMemories([]);
        setIsRecovery(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign out handler
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error al cerrar sesión:', error);
        triggerToast(`Error al cerrar sesión: ${error.message}`);
      } else {
        setMemories([]);
        triggerToast('Bóveda cerrada en paz.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cerrar sesión';
      triggerToast(`Error: ${msg}`);
    }
  };

  // Helper to handle INSERT directly using Supabase verified schema (English columns)
  const insertMemoryToSupabase = async (
    userId: string,
    title: string,
    recipient: string,
    type: string,
    context: string,
    fileUrl?: string | null,
    recipientId?: string | null,
    unlockCondition?: string
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowData: Record<string, any> = {
      user_id: userId,
      title: title,
      recipient: recipient,
      type: type,
      context: context,
    };
    if (fileUrl) rowData.file_url = fileUrl;
    if (recipientId) rowData.recipient_id = recipientId;
    if (unlockCondition) rowData.unlock_condition = unlockCondition;

    // English schema without owner (only used before supabase/security-setup.md is applied)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowDataLegacy: Record<string, any> = {
      title: title,
      recipient: recipient,
      type: type,
      context: context,
    };
    if (fileUrl) rowDataLegacy.file_url = fileUrl;
    if (recipientId) rowDataLegacy.recipient_id = recipientId;
    if (unlockCondition) rowDataLegacy.unlock_condition = unlockCondition;

    // Fallback: If table schema uses Spanish columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowSpanish: Record<string, any> = {
      user_id: userId,
      titulo: title,
      destinatario: recipient,
      tipo: type,
      contexto: context,
    };
    if (fileUrl) rowSpanish.file_url = fileUrl;
    if (recipientId) rowSpanish.recipient_id = recipientId;
    if (unlockCondition) rowSpanish.unlock_condition = unlockCondition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowSpanishLegacy: Record<string, any> = {
      titulo: title,
      destinatario: recipient,
      tipo: type,
      contexto: context,
    };
    if (fileUrl) rowSpanishLegacy.file_url = fileUrl;
    if (recipientId) rowSpanishLegacy.recipient_id = recipientId;
    if (unlockCondition) rowSpanishLegacy.unlock_condition = unlockCondition;

    const doInsert = (row: Record<string, unknown>) =>
      supabase.from('memories').insert([row]).select();

    // Base schemas in order; each is retried without the newest columns so the
    // app keeps working until supabase/vault-delivery-setup.sql is applied.
    const baseSchemas = [rowData, rowDataLegacy, rowSpanish, rowSpanishLegacy];
    let lastAttempt = null;
    for (const base of baseSchemas) {
      for (const row of [base, stripNewColumns(base)]) {
        const attempt = await doInsert(row);
        if (!attempt.error) return attempt;
        lastAttempt = attempt;
        const msg = attempt.error.message || '';
        if (row === base && /recipient_id|unlock_condition/i.test(msg)) continue;
        if (!/column|relation|schema|user_id|recipient_id|unlock_condition/i.test(msg)) return attempt;
        break;
      }
    }
    return lastAttempt ?? (await doInsert(baseSchemas[0]));
  };

  // 2. CREATE: Insert new memory into Supabase with optional Storage upload
  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const ownerId = session?.user?.id;
    if (!ownerId) {
      const msg = 'Tu sesión expiró. Ingresa nuevamente para guardar recuerdos.';
      setModalError(msg);
      triggerToast(msg);
      return;
    }

    if (!formTitle || !formRecipient) {
      const msg = 'Por favor completa al menos el título y el destinatario.';
      setModalError(msg);
      triggerToast(msg);
      return;
    }

    if ((activeModal === 'Video' || activeModal === 'Nota de Voz') && !selectedFile) {
      const msg = `Por favor selecciona un archivo celestial de ${activeModal === 'Video' ? 'video' : 'audio'} para resguardar.`;
      setModalError(msg);
      triggerToast(msg);
      return;
    }

    if (selectedFile) {
      const fileError = validateUploadFile(selectedFile, activeModal);
      if (fileError) {
        setModalError(fileError);
        triggerToast(fileError);
        return;
      }
    }

    setIsSaving(true);
    let uploadedFilePath: string | null = null;

    try {
      // 1. Subir archivo a Supabase Storage bucket 'vault'
      if (selectedFile && (activeModal === 'Video' || activeModal === 'Nota de Voz')) {
        setIsUploadingFile(true);
        const fileExt = selectedFile.name.split('.').pop() || 'bin';
        const cleanName = selectedFile.name
          .substring(0, selectedFile.name.lastIndexOf('.'))
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const storagePath = `${ownerId}/${Date.now()}_${cleanName}.${fileExt}`;

        console.log('Iniciando subida a Supabase Storage (vault):', storagePath);
        const { error: uploadError } = await supabase.storage
          .from('vault')
          .upload(storagePath, selectedFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Error al subir a Supabase Storage (vault):', uploadError);
          const errorMsg = `Error al subir archivo a Supabase Storage (vault): ${uploadError.message || JSON.stringify(uploadError)}`;
          setModalError(errorMsg);
          triggerToast(errorMsg);
          return;
        }

        // Guardar la ruta privada; la URL firmada se resuelve al leer
        uploadedFilePath = storagePath;
        console.log('Archivo subido con éxito al bucket vault:', uploadedFilePath);
        setIsUploadingFile(false);
      }

      // 2. Insertar en tabla memories con file_url
      console.log('Insertando recuerdo en tabla memories...', { formTitle, formRecipient, activeModal, uploadedFilePath });
      const conditionValue = formDate
        ? `${formDate}${formCondition && formCondition !== 'Entrega programada: Fecha especial' ? ` · ${formCondition}` : ''}`
        : formCondition;
      const { data, error } = await insertMemoryToSupabase(
        ownerId,
        formTitle,
        (selectedRecipientId ? recipients.find((r) => r.id === selectedRecipientId)?.name || formRecipient : formRecipient),
        activeModal || 'Carta',
        formContent,
        uploadedFilePath,
        selectedRecipientId,
        conditionValue
      );

      if (error) {
        console.error('Error al guardar en la tabla memories de Supabase:', error);
        const errorMsg = `Error al guardar en la tabla memories de Supabase: ${error.message || JSON.stringify(error)}`;
        setModalError(errorMsg);
        triggerToast(errorMsg);
        return;
      }

      if (data && data.length > 0) {
        // Immediately update state without needing to refresh page
        const fresh = mapRecordToMemory(data[0]);
        fresh.storagePath = fresh.fileUrl;
        fresh.fileUrl = await resolveStorageUrl(fresh.fileUrl);
        setMemories((prev) => [fresh, ...prev]);
      } else {
        await fetchMemories(ownerId);
      }

      setActiveModal(null);
      setFormTitle('');
      setFormRecipient('');
      setFormCondition('');
      setFormDate('');
      setFormContent('');
      setSelectedFile(null);
      setModalError(null);
      triggerToast(`Recuerdo para ${formRecipient} resguardado exitosamente en la bóveda celestial.`);
    } catch (err: unknown) {
      console.error('Error inesperado durante la subida o guardado:', err);
      const message = err instanceof Error ? err.message : String(err);
      const errorMsg = `Error inesperado: ${message}`;
      setModalError(errorMsg);
      triggerToast(errorMsg);
    } finally {
      setIsSaving(false);
      setIsUploadingFile(false);
    }
  };

  // 3. DELETE: Remove memory by ID from Supabase
  const handleDelete = async (id: string, title: string) => {
    const ownerId = session?.user?.id;
    if (!ownerId) {
      triggerToast('Tu sesión expiró. Ingresa nuevamente.');
      return;
    }
    setDeletingId(id);
    try {
      let { error } = await supabase
        .from('memories')
        .delete()
        .eq('id', id)
        .eq('user_id', ownerId);
      // Transición: si la columna user_id aún no existe, borrar solo por id
      if (error && /user_id|column/i.test(error.message || '')) {
        console.warn('Columna user_id ausente; borrando sin filtro por usuario (aplica supabase/security-setup.md).');
        ({ error } = await supabase
          .from('memories')
          .delete()
          .eq('id', id));
      }

      if (error) {
        console.error('Error al eliminar en Supabase:', error);
        triggerToast(`Error al eliminar: ${error.message}`);
      } else {
        // Immediate UI update
        setMemories((prev) => prev.filter((m) => m.id !== id));
        triggerToast(`"${title}" ha sido eliminado de la bóveda.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al eliminar';
      console.error('Error de red al eliminar:', err);
      triggerToast(`Error: ${message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Al cerrar el modal: apagar la lectura en voz alta.
  useEffect(() => {
    if (activeModal) return;
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      /* sin voz activa */
    }
    // En microtarea para no fijar estado sincrónicamente.
    Promise.resolve().then(() => {
      setReadingDraft(false);
    }).catch(() => {});
  }, [activeModal]);

  // La guía lee en voz alta lo que hay en el cuadro (texto o borrador).
  const toggleReadDraft = () => {
    if (!('speechSynthesis' in window)) return;
    if (readingDraft) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* sin voz activa */
      }
      setReadingDraft(false);
      return;
    }
    if (!formContent.trim()) {
      setDictError('Aún no hay nada que leer: escribe o redacta primero.');
      return;
    }
    setDictError(null);
    try {
      const utter = new SpeechSynthesisUtterance(formContent);
      utter.lang = 'es-ES';
      utter.rate = 0.95;
      utter.onend = () => setReadingDraft(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      setReadingDraft(true);
    } catch {
      setReadingDraft(false);
    }
  };

  // La guía redacta un borrador con lo que sabe de la familia; la persona
  // lo revisa, lo cambia a su gusto y lo guarda como carta normal.
  const handleDraftLetter = async () => {
    const name = formRecipient.trim()
      || recipients.find((r) => r.id === selectedRecipientId)?.name
      || '';
    if (!name) {
      setModalError('Elige primero el destinatario para convertir en carta.');
      return;
    }
    if (!formContent.trim()) {
      setModalError('Escribe primero unas palabras, y luego pulsa el botón.');
      return;
    }
    setIsDrafting(true);
    setModalError(null);
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      /* sin voz activa */
    }
    setReadingDraft(false);
    try {
      const { data, error } = await supabase.functions.invoke('interview', {
        body: { action: 'draft-letter', recipient_name: name, hint: formContent },
      });
      if (error) throw error;
      const draft = (data?.draft || '').toString().trim();
      if (!draft) throw new Error((data?.detail || data?.error || 'sin borrador').toString());
      setFormContent(draft);
      triggerToast('Carta lista. Escúchala con la bocina, revísala y pulsa Guardar.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to send|failed to fetch|not found/i.test(msg)) {
        setModalError('La guía aún no está desplegada en Supabase (redespliega la función interview).');
      } else {
        setModalError(`No pude redactar: ${msg}`);
      }
    } finally {
      setIsDrafting(false);
    }
  };

  // Editar entrega desde la tarjeta: destinatario y fecha programada.
  const handleUpdateDelivery = async (id: string, recipientId: string | null, deliveryDate: string) => {
    const ownerId = session?.user?.id;
    if (!ownerId) throw new Error('Tu sesión expiró. Ingresa nuevamente.');
    const rec = recipients.find((r) => r.id === recipientId) || null;
    const current = memories.find((m) => m.id === id);
    const rawPrev = (current?.unlockRaw || '').trim();
    const dm = /^(\d{4}-\d{2}-\d{2})\s*(?:·\s*(.*))?$/.exec(rawPrev);
    let tail = dm ? (dm[2] || '') : (/^\d{4}-\d{2}-\d{2}/.test(rawPrev) ? '' : rawPrev);
    if (tail === 'Entrega programada: Fecha especial') tail = '';
    let unlock = '';
    if (deliveryDate) unlock = tail ? `${deliveryDate} · ${tail}` : deliveryDate;
    else unlock = tail;
    const { error } = await supabase
      .from('memories')
      .update({
        recipient_id: recipientId,
        recipient: rec ? rec.name : 'Para alguien especial',
        unlock_condition: unlock,
      })
      .eq('id', id)
      .eq('user_id', ownerId);
    if (error) throw new Error(error.message);
    await fetchMemories(ownerId);
    triggerToast('Entrega actualizada.');
  };

  const handleOpenModal = (type: 'Video' | 'Nota de Voz' | 'Carta') => {
    setActiveModal(type);
    setDictError(null);
    setSelectedRecipientId(null);
    setMediaSourceTab('record');
    setFormTitle('');
    setFormRecipient('');
    setFormCondition('Entrega programada: Fecha especial');
    setFormDate('');
    setFormContent('');
    setSelectedFile(null);
    setModalError(null);
  };

  // 1. Celestial calm loader while checking initial auth session
  if (authLoading) {
    return (
      <GlassLayout className="flex items-center justify-center">
        <div 
          aria-hidden="true"
          className="pointer-events-none absolute w-[550px] h-[550px] rounded-full bg-gradient-to-b from-[#D4AF37]/18 via-[#FAF4E5]/80 to-transparent blur-3xl animate-celestial-breathe"
        />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FAF4E5] via-[#FFFFFF] to-[#E8D8A6] border border-[#D4AF37]/70 flex items-center justify-center shadow-md animate-celestial-glow">
            <span className="font-serif text-[#D4AF37] text-3xl font-bold tracking-widest pl-0.5">E</span>
          </div>
          <p className="font-serif text-lg font-bold tracking-[0.2em] uppercase text-[#2C241E]">
            E-TERNAL
          </p>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6B625B]">
            <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
            <span>Verificando Llave del Santuario...</span>
          </div>
        </div>
      </GlassLayout>
    );
  }

  // Enlace de recuperación: crear nueva contraseña antes de entrar.
  if (isRecovery) {
    return (
      <GlassLayout>
        <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 my-auto">
          <ResetPassword
            onDone={() => {
              setIsRecovery(false);
              window.history.replaceState({}, '', '/');
            }}
          />
        </main>
      </GlassLayout>
    );
  }

  // 2. Glassmorphism Architecture Showcase (Apple visual architecture & test card)
  if (activeView === 'glass') {
    return (
      <GlassLayout>
        {notification && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/20 transition-all animate-toast-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{notification}</span>
          </div>
        )}

        <GlassNavbar
          title="E-ternal"
          subtitle="Bóveda Digital"
          activeView="glassmorphism"
          onSelectView={(v: string) => setActiveView(v === 'vault' ? 'vault' : 'glass')}
        />

        <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 my-auto">
          <div className="w-full max-w-xl mx-auto flex flex-col items-center justify-center">
            <GlassCard
              onPrimaryClick={() => setActiveView('vault')}
              onSecondaryClick={() => setActiveView('vault')}
            />
          </div>
        </main>
      </GlassLayout>
    );
  }

  // 3. Vault Routing: If no active session, show Login screen
  if (!session) {
    return (
      <GlassLayout>
        <GlassNavbar
          title="E-ternal"
          subtitle="Acceso al Santuario"
          activeView="vault"
          onSelectView={(v: string) => setActiveView(v === 'vault' ? 'vault' : 'glass')}
        />
        <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md">
            <Login onSuccess={() => setActiveView('vault')} />
          </div>
        </div>
      </GlassLayout>
    );
  }

  // User details derived dynamically from Supabase user_metadata
  const userEmail = session.user.email || '';
  const userMetadataFullName = (session.user.user_metadata?.full_name || '').trim();
  const userDisplayName = userMetadataFullName || userEmail.split('@')[0] || 'Custodio';
  const userFirstName = userMetadataFullName 
    ? userMetadataFullName.split(' ')[0] 
    : (userEmail.split('@')[0] || 'Custodio');

  // Intelligent initials: 'Ricardo Castro' -> 'RC'. If no name set, first two letters of email.
  const userInitials = computeInitials(userMetadataFullName, userEmail);

  // Pestañas: filtrar recuerdos por tipo (Videos / Notas de voz / Cartas)
  const visibleMemories = activeTab === 'todos' ? memories : memories.filter((m) => m.type === activeTab);
  const tabCounts = {
    todos: memories.length,
    Video: memories.filter((m) => m.type === 'Video').length,
    'Nota de Voz': memories.filter((m) => m.type === 'Nota de Voz').length,
    Carta: memories.filter((m) => m.type === 'Carta').length,
  };

  return (
    <GlassLayout>
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-white/20 transition-all animate-toast-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      {/* Top Glass Navigation */}
      <GlassNavbar
        title="E-ternal"
        subtitle={`Santuario • ${userDisplayName}`}
        activeView="vault"
        onSelectView={(v: string) => setActiveView(v === 'vault' ? 'vault' : 'glass')}
      />

      {/* Bar with Cloud Sync and User Controls */}
      <div className="border-b border-white/30 bg-white/20 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FAF4E5] to-[#E8D8A6] border border-[#D4AF37]/50 flex items-center justify-center shadow-xs">
              <span className="font-serif text-[#D4AF37] text-xl font-bold tracking-widest">E</span>
            </div>
            <div>
              <span className="text-lg sm:text-xl font-serif font-bold tracking-[0.15em] sm:tracking-[0.2em] text-[#2C241E] uppercase">
                E-TERNAL
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-[#D4AF37] font-semibold">
                Santuario de Legado & Memorias
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-[#FAF4E5] border border-[#E8D8A6]/60 text-xs px-3.5 py-1.5 rounded-full text-[#6B625B]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span className="font-medium text-[#2C241E]">Supabase Cloud Sync</span>
            </div>

            <button
              onClick={() => {
                if (session?.user?.id) fetchMemories(session.user.id);
              }}
              title="Recargar recuerdos desde Supabase"
              className="p-2 rounded-full hover:bg-[#FAF4E5] text-[#6B625B] hover:text-[#2C241E] transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            </button>

            {/* User Profile (Clickable to open Identity Panel) & Discreet Sign Out */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-[#EFE9DE]">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                title="Editar nombre y apellido del custodio"
                className="group flex items-center gap-2 sm:gap-2.5 p-1 -m-1 rounded-xl hover:bg-[#FAF4E5] transition-all cursor-pointer text-left focus:outline-hidden focus:ring-1 focus:ring-[#D4AF37]"
              >
                <div className="w-9 h-9 rounded-full bg-[#2C241E] text-[#D4AF37] group-hover:ring-[#D4AF37] group-hover:scale-105 flex items-center justify-center text-xs font-semibold ring-2 ring-[#D4AF37]/30 shrink-0 select-none transition-all shadow-xs">
                  {userInitials}
                </div>
                <div className="hidden md:block text-left max-w-[130px]">
                  <p className="text-xs font-semibold text-[#2C241E] leading-tight truncate group-hover:text-[#D4AF37] transition-colors">
                    {userDisplayName}
                  </p>
                  <p className="text-[10px] text-[#6B625B]">Custodio Principal</p>
                </div>
              </button>

              {/* Botón discreto de cierre de sesión */}
              <button
                type="button"
                onClick={handleSignOut}
                title="Cerrar sesión sagrada"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6B625B] hover:text-[#2C241E] hover:bg-[#FAF4E5] border border-transparent hover:border-[#E8D8A6]/70 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden sm:inline">Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Feed Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 md:py-10 space-y-8">
        
        {/* Supabase Error Alert if needed */}
        {fetchError && (
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-950">Aviso de conexión con Supabase</p>
              <p className="text-xs text-amber-800 mt-1">
                {fetchError.includes('relation') || fetchError.includes('memories') 
                  ? 'Asegúrate de haber creado la tabla "memories" en tu panel de Supabase y de tener activadas las políticas de acceso (RLS) para SELECT, INSERT y DELETE.'
                  : fetchError}
              </p>
              <button
                onClick={() => {
                  if (session?.user?.id) fetchMemories(session.user.id);
                }}
                className="mt-2 text-xs font-semibold underline hover:text-amber-950"
              >
                Reintentar conexión
              </button>
            </div>
          </div>
        )}

        {/* 1. Cabecera con mensaje de bienvenida solemne */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#FFFFFF] to-[#FAF4E5]/50 border border-[#EFE9DE] p-5 sm:p-10 shadow-xs">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#D4AF37]/10 via-[#D4AF37]/5 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF4E5] border border-[#E8D8A6] text-[#2C241E] text-xs font-medium mb-4">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Espacio Privado e Íntimo</span>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold text-[#2C241E] tracking-tight leading-[1.15]">
              Bienvenido a tu santuario, <span className="italic font-normal text-[#D4AF37]">{userFirstName}</span>
            </h1>

            <p className="mt-3 sm:mt-4 text-[#6B625B] text-sm sm:text-base leading-relaxed">
              Este es tu feed personal de custodia conectado en tiempo real. Cada pensamiento, palabra y mirada grabada aquí permanecerá protegida en Supabase y será entregada a quienes amas exactamente cuando deba ser.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-[#6B625B] pt-4 border-t border-[#EFE9DE]">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Base de Datos Segura</span>
              </div>
              <span className="text-[#D4AF37]">•</span>
              <div className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{loading ? 'Cargando...' : `${memories.length} recuerdos en custodia`}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Entrevista del legado: la guía recibe y memoriza */}
        <section id="guia-eternal" className="space-y-2 scroll-mt-20">
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#2C241E]">
              Entrevista del legado
            </h2>
            <p className="text-xs sm:text-sm text-[#6B625B]">
              Tu guía te pregunta y memoriza a tu familia
            </p>
          </div>
          <InterviewChat />
        </section>

        {/* 3. Caja superior de creación con 3 botones visibles */}
        <section className="bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] shadow-xs p-5 sm:p-6 transition-all hover:border-[#E8D8A6]">
          {/* 4 botones: 'Grabar Video', 'Nota de Voz', 'Escribir Carta', 'Hablar con la guía' */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => handleOpenModal('Video')}
              className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#FAF4E5]/80 hover:bg-[#FAF4E5] text-[#2C241E] border border-[#E8D8A6]/70 hover:border-[#D4AF37] transition-all text-sm font-medium group active:scale-[0.99] cursor-pointer shadow-2xs"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] flex items-center justify-center text-[#D4AF37] group-hover:scale-110 transition-transform shadow-2xs">
                <Video className="w-4 h-4" />
              </div>
              <span className="font-semibold text-[#2C241E]">Grabar Video</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('Nota de Voz')}
              className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#FAF4E5]/80 hover:bg-[#FAF4E5] text-[#2C241E] border border-[#E8D8A6]/70 hover:border-[#D4AF37] transition-all text-sm font-medium group active:scale-[0.99] cursor-pointer shadow-2xs"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] flex items-center justify-center text-[#D4AF37] group-hover:scale-110 transition-transform shadow-2xs">
                <Mic className="w-4 h-4" />
              </div>
              <span className="font-semibold text-[#2C241E]">Nota de Voz</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal('Carta')}
              className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#FAF4E5]/80 hover:bg-[#FAF4E5] text-[#2C241E] border border-[#E8D8A6]/70 hover:border-[#D4AF37] transition-all text-sm font-medium group active:scale-[0.99] cursor-pointer shadow-2xs"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] flex items-center justify-center text-[#D4AF37] group-hover:scale-110 transition-transform shadow-2xs">
                <PenTool className="w-4 h-4" />
              </div>
              <span className="font-semibold text-[#2C241E]">Escribir Carta</span>
            </button>

            <button
              type="button"
              onClick={() => document.getElementById('guia-eternal')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-[#2C241E] hover:bg-[#3E342B] text-[#FAF4E5] border border-[#2C241E] transition-all text-sm font-medium group active:scale-[0.99] cursor-pointer shadow-2xs"
            >
              <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] group-hover:scale-110 transition-transform shadow-2xs">
                <MessageCircle className="w-4 h-4" />
              </div>
              <span className="font-semibold text-[#FAF4E5]">Hablar con la guía</span>
            </button>
          </div>
        </section>

        {/* Pestañas por tipo de recuerdo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="tablist" aria-label="Filtrar recuerdos por tipo">
          {([
            { id: 'todos', label: 'Todos', icon: LayoutGrid },
            { id: 'Video', label: 'Videos', icon: Video },
            { id: 'Nota de Voz', label: 'Notas de voz', icon: Mic },
            { id: 'Carta', label: 'Cartas', icon: PenTool },
          ] as const).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-[#2C241E] text-[#FAF4E5] border-[#2C241E] shadow-xs'
                    : 'bg-[#FFFFFF] text-[#2C241E] border-[#EFE9DE] hover:border-[#D4AF37]'
                }`}
              >
                <Icon className="w-4 h-4 text-[#D4AF37]" />
                {t.label}
                <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-[#D4AF37]/20 text-[#FAF4E5]' : 'bg-[#FAF4E5] text-[#6B625B]'}`}>
                  {tabCounts[t.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section title & counter */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#2C241E]">
              Memorias en Custodia
            </h2>
            <p className="text-xs sm:text-sm text-[#6B625B]">
              Tus recuerdos sincronizados directamente con la nube de Supabase
            </p>
          </div>

          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FAF4E5] text-[#2C241E] border border-[#E8D8A6]">
            {loading ? 'Consultando...' : `${visibleMemories.length} ${visibleMemories.length === 1 ? 'recuerdo' : 'recuerdos'}`}
          </span>
        </div>

        {/* 4. Grid de recuerdos conectados a Supabase, agrupados por destinatario */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" role="status" aria-label="Cargando recuerdos">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-[#FFFFFF] rounded-2xl border border-[#EFE9DE] p-5 space-y-3">
                <div className="skeleton h-4 w-2/3 rounded-lg" />
                <div className="skeleton h-24 w-full rounded-xl" />
                <div className="skeleton h-3 w-1/2 rounded-lg" />
              </div>
            ))}
            <span className="sr-only">Consultando tus memorias en Supabase...</span>
          </div>
        ) : visibleMemories.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white rounded-2xl border border-dashed border-[#EFE9DE]">
            <Heart className="w-10 h-10 text-[#D4AF37]/50 mx-auto mb-3" />
            <h3 className="font-serif text-lg font-bold text-[#2C241E]">
              {activeTab === 'todos'
                ? 'Tu bóveda en la nube está vacía'
                : activeTab === 'Video'
                  ? 'Sin videos todavía'
                  : activeTab === 'Nota de Voz'
                    ? 'Sin notas de voz todavía'
                    : 'Sin cartas todavía'}
            </h3>
            <p className="text-sm text-[#6B625B] mt-1 max-w-sm mx-auto">
              {activeTab === 'todos'
                ? 'Aún no tienes recuerdos guardados en Supabase. Utiliza los botones superiores para crear tu primer recuerdo perpetuo.'
                : 'Usa los botones superiores para crear tu primer recuerdo de este tipo.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {recipients.map((r) => {
              const own = visibleMemories.filter((m) => m.recipientId === r.id);
              if (own.length === 0) return null;
              return (
                <section key={r.id}>
                  <h3 className="text-lg sm:text-xl font-serif font-bold text-[#2C241E] mb-1">
                    Para {r.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B625B] mb-4">
                    {own.length} {own.length === 1 ? 'recuerdo' : 'recuerdos'}
                    {r.relation ? ` • ${r.relation}` : ''}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {own.map((memory) => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        isDeleting={deletingId === memory.id}
                        onDelete={handleDelete}
                        onEditDelivery={handleUpdateDelivery}
                        recipients={recipients}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {visibleMemories.some((m) => !m.recipientId) && (
              <section>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-[#2C241E] mb-1">
                  Sin asignar
                </h3>
                <p className="text-xs sm:text-sm text-[#6B625B] mb-4">
                  Recuerdos sin destinatario de la bóveda
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {visibleMemories.filter((m) => !m.recipientId).map((memory) => (
                    <MemoryCard
                      key={memory.id}
                      memory={memory}
                      isDeleting={deletingId === memory.id}
                      onDelete={handleDelete}
                      onEditDelivery={handleUpdateDelivery}
                      recipients={recipients}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {!recipientsReady && (
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-sm">
            Falta aplicar la guía <span className="font-mono text-xs">supabase/vault-delivery-setup.sql</span> en tu
            panel de Supabase para activar destinatarios, entrega y entrevista.
          </div>
        )}

        {/* 5. Entrega y destinatarios */}
        <section className="space-y-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#2C241E]">
              Entrega y destinatarios
            </h2>
            <p className="text-xs sm:text-sm text-[#6B625B]">
              Quién recibe tus recuerdos por WhatsApp y quién custodia la entrega
            </p>
          </div>
          <DeliveryPanel
            userId={session.user.id}
            recipients={recipients}
            memories={memories}
            onRecipientsChanged={() => loadRecipients(session.user.id)}
          />
        </section>

        {/* Solemn footer banner */}
        <footer className="text-center pt-8 pb-12 border-t border-[#EFE9DE] space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-[#D4AF37] uppercase tracking-widest font-semibold">
            <span>E-TERNAL</span>
            <span>•</span>
            <span>Privacidad Absoluta</span>
            <span>•</span>
            <span>Supabase Cloud Database</span>
          </div>
          <p className="text-xs text-[#6B625B]">
            Tus recuerdos se encuentran resguardados en Supabase bajo estándares de máxima seguridad y confidencialidad.
          </p>
        </footer>
      </main>

      {/* Creation Modal for 'Grabar Video', 'Nota de Voz', 'Escribir Carta' connected to Supabase INSERT */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C241E]/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#FFFFFF] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-[#E8D8A6] shadow-2xl p-6 relative animate-modal-in">
            <button
              onClick={() => !isSaving && setActiveModal(null)}
              disabled={isSaving}
              className="absolute top-4 right-4 text-[#6B625B] hover:text-[#2C241E] p-1 rounded-lg hover:bg-[#FAF4E5] transition-colors disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#FAF4E5] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37]">
                {activeModal === 'Video' && <Video className="w-4 h-4" />}
                {activeModal === 'Nota de Voz' && <Mic className="w-4 h-4" />}
                {activeModal === 'Carta' && <PenTool className="w-4 h-4" />}
              </div>
              <h3 className="font-serif text-xl font-bold text-[#2C241E]">
                Crear {activeModal} en Supabase
              </h3>
            </div>

            <p className="text-xs text-[#6B625B] mb-5">
              Este recuerdo se guardará directamente en tu base de datos en la nube.
            </p>

            {/* Mensaje de error visual en la interfaz si la subida a Storage o el INSERT en la tabla fallan */}
            {modalError && (
              <div
                role="alert"
                className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2.5 animate-fade-in shadow-xs"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <p className="font-semibold text-red-950">Aviso de Supabase:</p>
                  <p className="mt-0.5 font-mono text-[11px] break-words text-red-800">
                    {modalError}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveMemory} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider mb-1">
                  Título del Recuerdo *
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    activeModal === 'Video'
                      ? 'Ej: Para el día de tu boda...'
                      : activeModal === 'Nota de Voz'
                      ? 'Ej: Una lección que nunca debes olvidar...'
                      : 'Ej: Carta a mis nietos en el futuro...'
                  }
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                />
              </div>

              {recipients.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider mb-1">
                    Destinatario *
                  </label>
                  <select
                    required
                    value={selectedRecipientId || ''}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      setSelectedRecipientId(id);
                      const found = recipients.find((r) => r.id === id);
                      if (found) setFormRecipient(found.name);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                  >
                    <option value="">Elige quién lo recibe...</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.relation ? ` (${r.relation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider mb-1">
                    Destinatario *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Sofía (Hija), Mateo (Hijo), Elena (Esposa)..."
                    value={formRecipient}
                    onChange={(e) => setFormRecipient(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                  />
                  <p className="mt-1.5 text-[11px] text-[#6B625B]">
                    Tip: agrega destinatarios con teléfono en la sección Entrega para enviar por WhatsApp.
                  </p>
                </div>
              )}

              {/* Selector o Grabación en Vivo para Video y Nota de Voz */}
              {activeModal !== 'Carta' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider">
                      {activeModal === 'Video' ? 'Video Sagrado *' : 'Audio Sagrado *'}
                    </label>

                    <div className="flex items-center gap-1 bg-[#FAF4E5] p-0.5 rounded-lg border border-[#E8D8A6]">
                      <button
                        type="button"
                        onClick={() => setMediaSourceTab('record')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                          mediaSourceTab === 'record'
                            ? 'bg-[#FFFFFF] text-[#2C241E] shadow-2xs'
                            : 'text-[#6B625B] hover:text-[#2C241E]'
                        }`}
                      >
                        Grabar en Vivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaSourceTab('upload')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                          mediaSourceTab === 'upload'
                            ? 'bg-[#FFFFFF] text-[#2C241E] shadow-2xs'
                            : 'text-[#6B625B] hover:text-[#2C241E]'
                        }`}
                      >
                        Subir Archivo
                      </button>
                    </div>
                  </div>

                  {mediaSourceTab === 'record' ? (
                    <MediaRecorderComponent
                      key={activeModal}
                      mode={activeModal}
                      capturedFile={selectedFile}
                      onMediaCaptured={(file) => setSelectedFile(file)}
                      onClearMedia={() => setSelectedFile(null)}
                    />
                  ) : (
                    <div className="relative border-2 border-dashed border-[#E8D8A6] hover:border-[#D4AF37] rounded-2xl p-4 sm:p-5 bg-[#FAF4E5]/40 hover:bg-[#FAF4E5]/70 transition-all text-center group cursor-pointer">
                      <input
                        type="file"
                        id="celestial-file-input"
                        required={!selectedFile}
                        accept={activeModal === 'Video' ? 'video/*' : 'audio/*'}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedFile(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />

                      {selectedFile ? (
                        <div className="flex items-center justify-between gap-3 text-left">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[#FAF4E5] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] shrink-0 shadow-2xs">
                              {activeModal === 'Video' ? <Video className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                            </div>
                            <div className="truncate">
                              <p className="text-xs font-semibold text-[#2C241E] truncate">{selectedFile.name}</p>
                              <p className="text-[11px] text-[#6B625B]">
                                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Listo para la bóveda
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(null);
                            }}
                            className="p-1.5 rounded-lg text-[#6B625B] hover:text-red-700 hover:bg-red-50 z-20 cursor-pointer"
                            title="Quitar archivo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 py-2">
                          <div className="w-10 h-10 rounded-full bg-[#FAF4E5] border border-[#D4AF37]/60 flex items-center justify-center text-[#D4AF37] shadow-xs group-hover:scale-110 transition-transform">
                            <Upload className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[#2C241E]">
                              Seleccionar {activeModal === 'Video' ? 'video celestial' : 'grabación de voz'}
                            </p>
                            <p className="text-[11px] text-[#6B625B] mt-0.5">
                              {activeModal === 'Video' 
                                ? 'Acepta archivos de video (MP4, WebM, MOV...)' 
                                : 'Acepta archivos de audio (MP3, WAV, M4A, OGG...)'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider mb-1">
                  Fecha de entrega (día en que se libera el recuerdo)
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider mb-1">
                  Condición de Entrega o Fecha
                </label>
                <input
                  type="text"
                  placeholder="Ej: Al cumplir 18 años / En caso de partida / Fecha: 2030..."
                  value={formCondition}
                  onChange={(e) => setFormCondition(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2C241E] uppercase tracking-wider mb-1">
                  {activeModal === 'Carta' ? 'Contenido de la Carta / Contexto' : 'Contexto o Descripción (Opcional)'}
                </label>
                <div className="flex items-start gap-2">
                  <textarea
                    rows={4}
                    placeholder={
                      activeModal === 'Carta'
                        ? 'Escribe tus palabras aquí...'
                        : 'Describe brevemente el contexto de esta grabación...'
                    }
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E]"
                  />
                  {activeModal === 'Carta' && draftTtsSupported && (
                    <button
                      type="button"
                      onClick={toggleReadDraft}
                      disabled={isSaving || isDrafting}
                      title={readingDraft ? 'Dejar de leer' : 'Escuchar la carta en voz alta'}
                      aria-label={readingDraft ? 'Dejar de leer' : 'Escuchar la carta en voz alta'}
                      aria-pressed={readingDraft}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shrink-0 ${
                        readingDraft
                          ? 'bg-[#D4AF37] hover:bg-[#C59F2D] text-white'
                          : 'bg-[#FDFBF7] border border-[#EFE9DE] hover:border-[#D4AF37]/60 text-[#2C241E]'
                      }`}
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
                {activeModal === 'Carta' && dictError && (
                  <p className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{dictError}</p>
                )}
              </div>

              {activeModal === 'Carta' && (
                <div>
                  <button
                    type="button"
                    onClick={handleDraftLetter}
                    disabled={isDrafting || isSaving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-[#D4AF37]/60 bg-[#FAF4E5] hover:bg-[#F1E7C8] text-[#2C241E] text-sm font-bold transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isDrafting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                    )}
                    <span>{isDrafting ? 'Convirtiendo en carta...' : 'Convertir en carta'}</span>
                  </button>
                  <p className="mt-1.5 text-[11px] text-[#6B625B] text-center">
                    Escribe tus palabras y pulsa para convertirlas en una carta bonita.
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl border border-[#EFE9DE] text-[#6B625B] hover:text-[#2C241E] text-sm font-medium hover:bg-[#FDFBF7] transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C59F2D] text-[#FFFFFF] text-sm font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>
                        {isUploadingFile
                          ? 'Subiendo archivo celestial...'
                          : 'Guardando en la bóveda...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Guardar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Perfil para Nombre y Apellido */}
      {session && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          user={session.user}
          onProfileUpdated={(updatedUser) => {
            setSession((prev) => (prev ? { ...prev, user: updatedUser } : null));
            triggerToast('Tu identidad sagrada ha sido consagrada en Supabase.');
          }}
        />
      )}
    </GlassLayout>
  );
}
