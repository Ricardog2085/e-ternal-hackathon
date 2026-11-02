import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Loader2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { computeInitials } from '../lib/user';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SupabaseUser;
  onProfileUpdated: (updatedUser: SupabaseUser) => void;
}

function ProfileModalDialog({
  onClose,
  user,
  onProfileUpdated,
}: Omit<ProfileModalProps, 'isOpen'>) {
  const existingFullName = (user.user_metadata?.full_name || '').trim();
  const parts = existingFullName.split(/\s+/).filter(Boolean);
  const initialFirst = parts.length > 0 ? parts[0] : '';
  const initialLast = parts.length > 1 ? parts.slice(1).join(' ') : '';

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Live preview of the full name and initials as the user types
  const previewFullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const previewInitials = computeInitials(previewFullName, user.email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const finalFullName = `${trimmedFirst} ${trimmedLast}`.trim();

    if (!finalFullName) {
      setErrorMessage('Por favor ingresa al menos tu nombre para identificar tu santuario.');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: finalFullName,
          first_name: trimmedFirst,
          last_name: trimmedLast,
        },
      });

      if (error) {
        setErrorMessage(`Detalle al actualizar: ${error.message}`);
      } else if (data.user) {
        setSuccessMessage('Tu identidad sagrada ha sido consagrada en Supabase.');
        onProfileUpdated(data.user);
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al guardar';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2C241E]/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#FFFFFF]/95 backdrop-blur-xl rounded-3xl max-w-md w-full border border-[#E8D8A6] shadow-2xl p-6 sm:p-8 relative overflow-hidden text-left">
        
        {/* Soft celestial background orb */}
        <div 
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 w-60 h-60 rounded-full bg-gradient-to-bl from-[#D4AF37]/15 via-[#FAF4E5] to-transparent blur-2xl animate-celestial-breathe"
        />

        {/* Close button */}
        <button
          onClick={() => !isSaving && onClose()}
          disabled={isSaving}
          className="absolute top-5 right-5 text-[#6B625B] hover:text-[#2C241E] p-1.5 rounded-xl hover:bg-[#FAF4E5] transition-colors disabled:opacity-40 cursor-pointer"
          title="Cerrar panel"
          aria-label="Cerrar panel de perfil"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header & Avatar Preview */}
        <div className="text-center mb-6 relative z-10">
          <div className="relative inline-block mb-3">
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[#2C241E] to-[#3E342B] text-[#D4AF37] border-2 border-[#D4AF37]/70 flex items-center justify-center text-xl sm:text-2xl font-serif font-bold shadow-lg shadow-[#D4AF37]/15 ring-4 ring-[#FAF4E5] transition-all">
              {previewInitials}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#D4AF37] text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#2C241E] tracking-tight">
            Identidad del Custodio
          </h2>
          <p className="text-xs text-[#6B625B] mt-1 max-w-xs mx-auto leading-relaxed">
            Reconoce tu nombre sagrado en el santuario para personalizar tus memorias y tu legado perpetuo.
          </p>
        </div>

        {/* Error Feedback */}
        {errorMessage && (
          <div 
            role="alert"
            className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 animate-fade-in"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Success Feedback */}
        {successMessage && (
          <div 
            role="status"
            className="mb-4 p-3 rounded-xl bg-[#FAF4E5] border border-[#E8D8A6] text-[#2C241E] text-xs flex items-start gap-2.5 animate-fade-in font-medium"
          >
            <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed">{successMessage}</span>
          </div>
        )}

        {/* Identity Form */}
        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label 
                htmlFor="profile-first-name"
                className="block text-[11px] font-semibold text-[#2C241E] uppercase tracking-wider mb-1"
              >
                Nombre *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B625B]">
                  <User className="w-3.5 h-3.5 text-[#D4AF37]/80" />
                </div>
                <input
                  id="profile-first-name"
                  type="text"
                  required
                  placeholder="Ej: Ricardo"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E] transition-all"
                />
              </div>
            </div>

            <div>
              <label 
                htmlFor="profile-last-name"
                className="block text-[11px] font-semibold text-[#2C241E] uppercase tracking-wider mb-1"
              >
                Apellido
              </label>
              <input
                id="profile-last-name"
                type="text"
                placeholder="Ej: Castro"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-hidden text-sm text-[#2C241E] transition-all"
              />
            </div>
          </div>

          {/* Email Info (Read-only) */}
          <div>
            <label className="block text-[11px] font-semibold text-[#6B625B] uppercase tracking-wider mb-1">
              Correo de la Cuenta (Llave Maestra)
            </label>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[#FAF4E5]/50 border border-[#EFE9DE] text-xs text-[#6B625B]">
              <Mail className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span className="font-medium text-[#2C241E] truncate">{user.email}</span>
              {user.email_confirmed_at ? (
                <span className="ml-auto text-[10px] text-[#D4AF37] font-semibold uppercase tracking-wider bg-[#FAF4E5] px-2 py-0.5 rounded-md border border-[#E8D8A6]/60">
                  Verificado
                </span>
              ) : (
                <span className="ml-auto text-[10px] text-amber-700 font-semibold uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  Sin confirmar
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-[#EFE9DE] text-[#6B625B] hover:text-[#2C241E] text-xs sm:text-sm font-medium hover:bg-[#FDFBF7] transition-all cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#C59F2D] hover:from-[#C59F2D] hover:to-[#B69024] text-[#FFFFFF] text-xs sm:text-sm font-semibold tracking-wide shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Guardando en Supabase...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Guardar Identidad</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer note */}
        <div className="mt-5 pt-3.5 border-t border-[#F3ECE0] flex items-center justify-center gap-1.5 text-[11px] text-[#6B625B]/80 text-center">
          <Sparkles className="w-3 h-3 text-[#D4AF37]" />
          <span>Sincronizado de forma segura con user_metadata en Supabase</span>
        </div>
      </div>
    </div>
  );
}

export default function ProfileModal(props: ProfileModalProps) {
  if (!props.isOpen) return null;
  return (
    <ProfileModalDialog
      key={props.user.id + (props.user.user_metadata?.full_name || '')}
      onClose={props.onClose}
      user={props.user}
      onProfileUpdated={props.onProfileUpdated}
    />
  );
}
