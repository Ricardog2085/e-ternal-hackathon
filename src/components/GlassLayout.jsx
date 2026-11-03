import React from 'react';

/**
 * GlassLayout
 * Contenedor visual de altura completa (min-h-screen)
 * con fondo marfil cálido degradado para que resalten tarjetas y dorados.
 */
export default function GlassLayout({ children, className = '' }) {
  return (
    <div
      className={`min-h-screen w-full relative overflow-x-hidden bg-gradient-to-b from-[#F7F1DE] via-[#F3E8CC]/90 to-[#EBD9B6] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white ${className}`}
    >
      {/* Luces ambientales difuminadas sutiles para maximizar la refracción del cristal */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-gradient-to-tr from-amber-200/50 via-[#E8D8A6]/40 to-amber-100/30 blur-3xl opacity-60" />
        <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-gradient-to-br from-[#D4AF37]/30 via-amber-100/30 to-[#FAF4E5]/20 blur-3xl opacity-50" />
        <div className="absolute -bottom-20 left-1/3 h-96 w-96 rounded-full bg-gradient-to-tr from-amber-100/40 to-[#E8D8A6]/30 blur-3xl opacity-40" />
      </div>

      {/* Contenido principal */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {children}
      </div>
    </div>
  );
}
