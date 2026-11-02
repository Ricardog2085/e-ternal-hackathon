import React from 'react';

/**
 * GlassLayout
 * Contenedor visual de altura completa (min-h-screen)
 * con fondo gris súper claro y gradiente sutil de inspiración Apple.
 */
export default function GlassLayout({ children, className = '' }) {
  return (
    <div
      className={`min-h-screen w-full relative overflow-x-hidden bg-gradient-to-b from-zinc-50 via-neutral-50/90 to-zinc-100/80 text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white ${className}`}
    >
      {/* Luces ambientales difuminadas sutiles para maximizar la refracción del cristal */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-gradient-to-tr from-sky-100/40 via-indigo-50/30 to-purple-100/30 blur-3xl opacity-60" />
        <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-gradient-to-br from-amber-100/40 via-rose-50/30 to-amber-50/20 blur-3xl opacity-50" />
        <div className="absolute -bottom-20 left-1/3 h-96 w-96 rounded-full bg-gradient-to-tr from-emerald-50/40 to-teal-100/20 blur-3xl opacity-40" />
      </div>

      {/* Contenido principal */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {children}
      </div>
    </div>
  );
}
