import React from 'react';
import { Sparkles, ShieldCheck, ArrowRight, Heart, Lock } from 'lucide-react';
import { Button } from './ui/button';

/**
 * GlassCard
 * Tarjeta de prueba con estilo Apple / Glassmorphism:
 * - Bordes curvos amplios: rounded-3xl
 * - Sombra difuminada: shadow-2xl shadow-black/5
 * - Fondo translúcido: bg-white/50 backdrop-blur-lg border border-white/60
 */
export default function GlassCard({
  title = "Tu Santuario de Memorias",
  subtitle = "MEMORIA, DIGNIDAD Y PAZ",
  description = "Un espacio privado y blindado diseñado para preservar tu historia y la de tu familia. Acceso simplificado para que tus recuerdos vivan por siempre sin complicaciones tecnológicas.",
  onPrimaryClick,
  onSecondaryClick,
  children = null,
  className = "",
}) {
  return (
    <div
      className={`rounded-3xl shadow-2xl shadow-black/5 bg-white/50 backdrop-blur-lg border border-white/60 p-6 sm:p-8 md:p-10 transition-all duration-300 hover:shadow-black/10 hover:border-white/80 ${className}`}
    >
      {children || (
        <div className="flex flex-col items-center text-center max-w-md mx-auto">
          {/* Badge superior */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/70 border border-white/80 shadow-xs text-xs font-medium text-zinc-700 mb-6 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Legado Digital Seguro</span>
          </div>

          {/* Ícono de estado central */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-zinc-900 via-zinc-800 to-zinc-700 flex items-center justify-center text-white shadow-xl shadow-zinc-900/10 ring-4 ring-white/60">
              <ShieldCheck className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white/90 border border-white shadow-sm flex items-center justify-center text-zinc-800">
              <Lock className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Textos y tipografía */}
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 mb-2">
            {title}
          </h2>
          <p className="text-xs sm:text-sm font-medium uppercase tracking-wider text-zinc-400 mb-3">
            {subtitle}
          </p>
          <p className="text-sm sm:text-base text-zinc-600 leading-relaxed mb-8">
            {description}
          </p>

          {/* Mini tarjetas de estado / métricas */}
          <div className="grid grid-cols-2 gap-3 w-full mb-8">
            <div className="p-3.5 rounded-2xl bg-white/40 border border-white/50 backdrop-blur-md text-left">
              <span className="text-[11px] font-medium text-zinc-400 block uppercase">
                Acceso
              </span>
              <span className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5 mt-0.5">
                Correo Seguro
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/40 border border-white/50 backdrop-blur-md text-left">
              <span className="text-[11px] font-medium text-zinc-400 block uppercase">
                Seguridad
              </span>
              <span className="text-sm font-semibold text-zinc-800 flex items-center gap-1.5 mt-0.5">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
                Cifrado Perpetuo
              </span>
            </div>
          </div>

          {/* Botones de acción usando componentes shadcn */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <Button
              onClick={onPrimaryClick}
              className="w-full sm:flex-1 h-11 rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 active:scale-98 shadow-sm transition-all cursor-pointer"
            >
              <span>Explorar Bóveda</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSecondaryClick}
              className="w-full sm:w-auto h-11 rounded-2xl bg-white/60 hover:bg-white/80 border-white/70 text-zinc-700 active:scale-98 shadow-xs backdrop-blur-sm transition-all cursor-pointer"
            >
              Crear Llave Maestra
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
