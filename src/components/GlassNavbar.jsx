import React, { useState } from 'react';
import { Menu, X, Shield, Compass, Lock, LayoutGrid, Check } from 'lucide-react';
import logoTernal from '../assets/logo-ternal.jpg';

/**
 * GlassNavbar
 * Barra de navegación con efecto de cristal translúcido (Glassmorphism),
 * clases exactas: backdrop-blur-xl bg-white/40 border-b border-white/20 shadow-sm sticky top-0 z-50
 * Título a la izquierda y botón de menú a la derecha.
 */
export default function GlassNavbar({
  title = "E-ternal",
  subtitle = "Bóveda Digital",
  activeView = "glassmorphism",
  onSelectView,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleNavClick = (viewName) => {
    if (onSelectView) {
      onSelectView(viewName);
    }
    setIsOpen(false);
  };

  return (
    <header
      className={`backdrop-blur-xl bg-white/40 border-b border-white/20 shadow-sm sticky top-0 z-50 transition-all duration-300 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Título y Marca a la izquierda */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl overflow-hidden shadow-md shadow-zinc-900/10 ring-1 ring-white/40 shrink-0">
              <img src={logoTernal} alt="E-ternal" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg sm:text-xl tracking-tight text-zinc-900">
                  {title}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900/5 text-zinc-600 border border-zinc-900/10">
                  <Shield className="w-2.5 h-2.5 text-zinc-500" />
                  Meta Hackathon
                </span>
              </div>
              {subtitle && (
                <span className="text-xs text-zinc-500 font-normal -mt-0.5 tracking-wide">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          {/* Acciones de navegación rápida en desktop */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavClick('glassmorphism')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeView === 'glassmorphism'
                  ? 'bg-white/80 text-zinc-900 shadow-xs border border-white/80'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/40'
              }`}
            >
              Inicio
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('vault')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                activeView === 'vault'
                  ? 'bg-white/80 text-zinc-900 shadow-xs border border-white/80'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/40'
              }`}
            >
              Bóveda de Recuerdos
            </button>
          </div>

          {/* Botón de Menú solo en móvil (en escritorio ya hay navegación directa) */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              id="glass-navbar-menu-btn"
              onClick={handleToggle}
              aria-label="Abrir menú"
              className="group relative inline-flex items-center justify-center p-2.5 rounded-2xl bg-white/50 hover:bg-white/80 active:scale-95 text-zinc-700 hover:text-zinc-900 border border-white/60 shadow-sm backdrop-blur-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-400/40"
            >
              {isOpen ? (
                <X className="w-5 h-5 transition-transform duration-200 rotate-90 group-hover:rotate-0" />
              ) : (
                <Menu className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
              )}
            </button>
          </div>
        </div>

        {/* Menú desplegable Glassmorphic al presionar el botón */}
        {isOpen && (
          <div className="pb-4 pt-1 md:hidden">
            <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-white/60 p-3 shadow-xl space-y-1">
              <button
                type="button"
                onClick={() => handleNavClick('glassmorphism')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-800 hover:bg-white/60 transition-all text-left"
              >
                <div className="flex items-center gap-2.5">
                  <LayoutGrid className="w-4 h-4 text-zinc-500" />
                  <span>Inicio</span>
                </div>
                {activeView === 'glassmorphism' && <Check className="w-4 h-4 text-zinc-800" />}
              </button>
              <button
                type="button"
                onClick={() => handleNavClick('vault')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-800 hover:bg-white/60 transition-all text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-zinc-500" />
                  <span>Bóveda de Recuerdos</span>
                </div>
                {activeView === 'vault' && <Check className="w-4 h-4 text-zinc-800" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
