import React from 'react'

interface CmxLogoProps {
  className?: string
  variant?: 'light' | 'dark'
  size?: 'sm' | 'md' | 'lg'
}

export const CmxLogo: React.FC<CmxLogoProps> = ({
  className = '',
  variant = 'light',
  size = 'md',
}) => {
  const isDark = variant === 'dark' // variant on dark background (e.g. white text)

  const sizeClasses = {
    sm: { icon: 'w-7 h-7', text: 'text-lg', badge: 'text-[9px] px-1 py-0.5' },
    md: { icon: 'w-9 h-9', text: 'text-2xl', badge: 'text-[10px] px-1.5 py-0.5' },
    lg: { icon: 'w-11 h-11', text: 'text-3xl', badge: 'text-xs px-2 py-0.5' },
  }[size]

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Geometria com ícone de funil/pipeline estilizado */}
      <div
        className={`${sizeClasses.icon} rounded-xl bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-800 flex items-center justify-center shadow-md shadow-blue-900/30 ring-1 ring-white/20`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-white"
        >
          {/* Funnel/Pipeline CRM icon */}
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-extrabold tracking-[-0.04em] ${sizeClasses.text} ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}
        >
          CMX
        </span>
        <span
          className={`font-semibold uppercase tracking-wider rounded font-mono ${sizeClasses.badge} ${
            isDark
              ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
              : 'bg-blue-100 text-blue-800 border border-blue-200'
          }`}
        >
          CRM
        </span>
      </div>
    </div>
  )
}
