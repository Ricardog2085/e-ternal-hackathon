import React, { useState } from 'react';
import {

  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// Interruptor del botón Facebook: false hasta pasar verificación Meta (modo Desarrollo bloquea el login).
const FACEBOOK_LOGIN_ENABLED = false;

function FacebookIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface LoginProps {
  onSuccess?: () => void;
}

const MIN_PASSWORD_LENGTH = 6;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function translateAuthError(errorMsg: string): string {
  const lower = errorMsg.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'El correo o la contraseña no coinciden. Por favor verifica los datos ingresados con calma.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists') || lower.includes('already registered')) {
    return 'Este correo ya está registrado. Puedes ingresar directamente con tu contraseña.';
  }
  if (lower.includes('password') && (lower.includes('short') || lower.includes('length') || lower.includes('least') || lower.includes('6'))) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (lower.includes('email') && lower.includes('invalid')) {
    return 'El correo electrónico no tiene un formato válido.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'No hay conexión con el servidor. Verifica tu conexión a internet e inténtalo nuevamente.';
  }
  if (lower.includes('not enabled') || lower.includes('unsupported provider') || lower.includes('provider disabled')) {
    return 'El acceso con Facebook aún no está configurado en Supabase. Usa tu correo por ahora.';
  }
  return `Aviso: ${errorMsg}. Inténtalo nuevamente con tranquilidad.`;
}

export default function Login({ onSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [isForgot, setIsForgot] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFacebookLogin = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: window.location.origin,
          scopes: 'public_profile email',
        },
      });

      if (error) {
        setErrorMessage(translateAuthError(error.message));
      }
      // Si no hay error, el navegador redirige a Facebook y vuelve solo
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      setErrorMessage(translateAuthError(msg));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      setErrorMessage('Por favor escribe un correo electrónico válido.');
      return;
    }

    if (isForgot) {
      // Enviar enlace de recuperación al correo
      setIsLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });
        if (error) {
          setErrorMessage(translateAuthError(error.message));
        } else {
          setSuccessMessage('Te enviamos un correo con el enlace para crear una nueva contraseña. Revisa tu bandeja y el spam.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error inesperado';
        setErrorMessage(translateAuthError(msg));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // Registro de nuevo usuario con correo electrónico
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
        });

        if (error) {
          setErrorMessage(translateAuthError(error.message));
        } else if (data.session) {
          setSuccessMessage('Tu cuenta ha sido creada con éxito. Ingresando...');
          if (onSuccess) onSuccess();
        } else {
          setSuccessMessage('Cuenta creada con éxito. Revisa tu correo para confirmarla y luego ingresa.');
          setIsSignUp(false);
        }
      } else {
        // Inicio de sesión con correo electrónico
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password,
        });

        if (error) {
          setErrorMessage(translateAuthError(error.message));
        } else if (data.session) {
          setSuccessMessage('Bienvenido de vuelta a tu santuario.');
          if (onSuccess) onSuccess();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      setErrorMessage(translateAuthError(msg));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white/90 backdrop-blur-xl border border-[#E8D8A6]/90 rounded-3xl shadow-[0_20px_50px_rgba(44,36,30,0.08)] p-6 sm:p-9 transition-all">
        
        {/* Encabezado */}
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
            Acceso Seguro • Correo Electrónico
          </p>

          <p className="mt-2.5 text-xs sm:text-sm text-[#6B625B]">
            {isForgot
              ? 'Escribe tu correo y te enviamos el enlace para una nueva contraseña.'
              : isSignUp
                ? 'Crea tu cuenta con tu correo para custodiar tus memorias.'
                : 'Ingresa con tu correo y tu contraseña.'}
          </p>
        </div>

        {/* Mensajes de Alerta */}
        {errorMessage && (
          <div role="alert" className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-snug">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div role="status" className="mb-5 p-3.5 rounded-2xl bg-[#FAF4E5] border border-[#E8D8A6] text-[#2C241E] text-xs sm:text-sm flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
            <p className="font-medium leading-snug">{successMessage}</p>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Campo: Correo Electrónico */}
          <div>
            <label htmlFor="login-email" className="block text-xs font-bold text-[#2C241E] uppercase tracking-wider mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D4AF37]">
                <Mail className="w-5 h-5" />
              </div>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                placeholder="Ej. tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-3.5 py-3.5 rounded-2xl bg-[#FDFBF7] border border-[#EFE9DE] focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none text-base sm:text-lg font-medium text-[#2C241E] placeholder:text-[#6B625B]/40 shadow-xs transition-all"
              />
            </div>
          </div>

          {/* Campo: Contraseña (se oculta al recuperar) */}
          {!isForgot && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="block text-xs font-bold text-[#2C241E] uppercase tracking-wider">
                Contraseña
              </label>
              <span className="text-[11px] font-semibold text-[#D4AF37] bg-[#FAF4E5] px-2 py-0.5 rounded-md border border-[#E8D8A6]">
                Mínimo 6 caracteres
              </span>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#D4AF37]">
                <KeyRound className="w-5 h-5" />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required={!isForgot}
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="Tu contraseña"
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
          )}

          {/* Botón Principal de Gran Tamaño */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !email.trim() || (!isForgot && password.length < MIN_PASSWORD_LENGTH)}
              className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#D4AF37] via-[#DDBE58] to-[#C59F2D] hover:from-[#C59F2D] hover:to-[#B69024] text-white text-base font-bold tracking-wide shadow-lg shadow-[#D4AF37]/25 hover:shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>{isForgot ? 'Enviando enlace...' : 'Verificando acceso...'}</span>
                </>
              ) : isForgot ? (
                <>
                  <Mail className="w-5 h-5" />
                  <span>Enviar enlace</span>
                </>
              ) : isSignUp ? (
                <>
                  <KeyRound className="w-5 h-5" />
                  <span>Crear Mi Cuenta</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>INGRESAR A MI BÓVEDA</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Botón Facebook pausado hasta pasar verificación Meta */}
        {FACEBOOK_LOGIN_ENABLED && (
          <>
        {/* Separador */}
        <div className="mt-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-[#6B625B]/70">
          <span className="flex-1 border-t border-[#F3ECE0]" />
          <span>o continúa con</span>
          <span className="flex-1 border-t border-[#F3ECE0]" />
        </div>

        {/* Acceso con Facebook */}
        <button
          type="button"
          onClick={handleFacebookLogin}
          disabled={isLoading}
          className="mt-4 w-full py-3.5 px-5 rounded-2xl bg-[#FFFFFF] hover:bg-[#FDFBF7] text-[#2C241E] text-sm font-bold tracking-wide border border-[#E8D8A6] hover:border-[#D4AF37]/60 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#1877F2]" />
          ) : (
            <FacebookIcon className="w-5 h-5 text-[#1877F2]" />
          )}
          <span>Continuar con Facebook</span>
        </button>
          </>
        )}

        {/* Alternar entre Ingresar, Crear Cuenta y Recuperar */}
        <div className="mt-6 pt-5 border-t border-[#F3ECE0] text-center space-y-2.5">
          {isForgot ? (
            <button
              type="button"
              onClick={() => {
                setIsForgot(false);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className="text-xs sm:text-sm text-[#6B625B] hover:text-[#2C241E] transition-colors cursor-pointer"
            >
              Volver a <span className="text-[#D4AF37] font-bold underline ml-1">Ingresar</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-xs sm:text-sm text-[#6B625B] hover:text-[#2C241E] transition-colors cursor-pointer block w-full"
              >
                {isSignUp ? (
                  <>¿Ya tienes cuenta? <span className="text-[#D4AF37] font-bold underline ml-1">Ingresar</span></>
                ) : (
                  <>¿Es tu primera vez aquí? <span className="text-[#D4AF37] font-bold underline ml-1">Crear cuenta</span></>
                )}
              </button>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgot(true);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-xs sm:text-sm text-[#6B625B] hover:text-[#2C241E] transition-colors cursor-pointer block w-full"
                >
                  ¿Olvidaste tu contraseña? <span className="text-[#D4AF37] font-bold underline ml-1">Recuperarla</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Garantía de Seguridad */}
        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-[#6B625B] text-center">
          <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
          <span>Acceso Blindado y Cifrado con Supabase</span>
        </div>

      </div>
    </div>
  );
}
