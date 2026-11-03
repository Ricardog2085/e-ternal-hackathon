import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResetPasswordProps {
  onDone: () => void;
}

const MIN_PASSWORD_LENGTH = 6;

export default function ResetPassword({ onDone }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [linkOk, setLinkOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // El enlace del correo abre sesión de recuperación; esperar a que llegue.
  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setLinkOk(true);
        setChecking(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        setLinkOk(true);
        setChecking(false);
      }
    });
    const t = window.setTimeout(() => {
      if (alive) setChecking(false);
    }, 8000);
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setErrorMessage('Las contraseñas no coinciden. Escríbelas de nuevo con calma.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const lower = error.message.toLowerCase();
        if (lower.includes('session') && lower.includes('missing')) {
          setErrorMessage('El enlace venció o ya se usó. Vuelve y pide uno nuevo.');
        } else {
          setErrorMessage(`Aviso: ${error.message}. Inténtalo nuevamente.`);
        }
      } else {
        setDone(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      setErrorMessage(`Aviso: ${msg}. Inténtalo nuevamente.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white/90 backdrop-blur-xl border border-[#E8D8A6]/90 rounded-3xl shadow-[0_20px_50px_rgba(44,36,30,0.08)] p-6 sm:p-9 transition-all">
        <div className="text-center mb-7">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#FAF4E5] to-[#E8D8A6] border border-[#D4AF37]/60 flex items-center justify-center mx-auto mb-4 shadow-sm">
            <span className="font-serif text-[#D4AF37] text-3xl sm:text-4xl font-bold select-none">
              E
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-[0.15em] text-[#2C241E] uppercase">
            E-TERNAL
          </h1>
          <p className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold mt-1">
            Nueva contraseña
          </p>
        </div>

        {checking ? (
          <p className="text-center text-sm text-[#6B625B] flex items-center justify-center gap-2 py-6">
            <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" />
            Verificando tu enlace...
          </p>
        ) : !linkOk ? (
          <div>
            <div role="alert" className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-snug">El enlace venció o ya se usó. Pide uno nuevo desde “¿Olvidaste tu contraseña?”.</p>
            </div>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#DDBE58] to-[#C59F2D] hover:from-[#C59F2D] hover:to-[#B69024] text-white text-base font-bold tracking-wide shadow-lg shadow-[#D4AF37]/25 transition-all cursor-pointer active:scale-[0.99]"
            >
              Volver al inicio
            </button>
          </div>
        ) : done ? (
          <div>
            <div role="status" className="mb-5 p-3.5 rounded-2xl bg-[#FAF4E5] border border-[#E8D8A6] text-[#2C241E] text-xs sm:text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <p className="font-medium leading-snug">Tu contraseña quedó actualizada. Ya puedes entrar a tu bóveda.</p>
            </div>
            <button
              type="button"
              onClick={onDone}
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#DDBE58] to-[#C59F2D] hover:from-[#C59F2D] hover:to-[#B69024] text-white text-base font-bold tracking-wide shadow-lg shadow-[#D4AF37]/25 transition-all cursor-pointer active:scale-[0.99]"
            >
              Entrar a mi bóveda
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMessage && (
              <div role="alert" className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-snug">{errorMessage}</p>
              </div>
            )}
            <div>
              <label htmlFor="reset-password" className="block text-xs font-bold text-[#2C241E] uppercase tracking-wider mb-1.5">
                Nueva contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D4AF37]">
                  <KeyRound className="w-5 h-5" />
                </div>
                <input
                  id="reset-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none text-base sm:text-lg font-medium text-[#2C241E] placeholder:text-[#6B625B]/40 shadow-xs transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6B625B] hover:text-[#2C241E] transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reset-confirm" className="block text-xs font-bold text-[#2C241E] uppercase tracking-wider mb-1.5">
                Repite la contraseña
              </label>
              <input
                id="reset-confirm"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                placeholder="Escríbela de nuevo"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3.5 py-3.5 rounded-2xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none text-base sm:text-lg font-medium text-[#2C241E] placeholder:text-[#6B625B]/40 shadow-xs transition-all"
              />
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving || password.length < MIN_PASSWORD_LENGTH || confirm.length < MIN_PASSWORD_LENGTH}
                className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#DDBE58] to-[#C59F2D] hover:from-[#C59F2D] hover:to-[#B69024] text-white text-base font-bold tracking-wide shadow-lg shadow-[#D4AF37]/25 hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar nueva contraseña</span>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-[#6B625B] text-center">
          <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
          <span>Acceso Blindado y Cifrado con Supabase</span>
        </div>
      </div>
    </div>
  );
}
