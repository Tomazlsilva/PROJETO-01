import React from 'react'
import { LOGO_GAVAZZI } from '@/assets/marcaGavazzi'

// Marca da Central Gavazzi. Mantém o nome/props do componente antigo (CmxLogo)
// para não mexer em quem o usa.
// - variant "dark": sobre fundo escuro, o logo vai num cartão branco.
// - variant "light": logo + "Central Gavazzi". No modo escuro o bloco inteiro (logo e texto)
//   fica sobre um fundo branco arredondado ("logo-claro"), com as cores originais da marca.
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
  if (variant === 'dark') {
    const altura = { sm: 'h-16', md: 'h-24', lg: 'h-32' }[size]
    return (
      <div className={`inline-flex select-none ${className}`}>
        <div className="bg-white rounded-2xl p-3 shadow-lg shadow-black/20 ring-1 ring-white/30">
          <img src={LOGO_GAVAZZI} alt="Gavazzi Engenharia" className={`${altura} w-auto`} />
        </div>
      </div>
    )
  }

  const tam = {
    sm: { img: 'h-9', texto: 'text-sm' },
    md: { img: 'h-11', texto: 'text-base' },
    lg: { img: 'h-14', texto: 'text-lg' },
  }[size]
  // gray-* não é alterado pelo modo escuro (main.css), então o texto continua escuro
  // dentro do fundo branco
  return (
    <div
      className={`logo-claro flex items-center gap-2.5 select-none rounded-lg dark:px-2.5 dark:py-1 ${className}`}
    >
      <img src={LOGO_GAVAZZI} alt="Gavazzi Engenharia" className={`${tam.img} w-auto`} />
      <div className="leading-tight">
        <div className={`font-extrabold tracking-tight text-gray-900 ${tam.texto}`}>Central</div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Gavazzi
        </div>
      </div>
    </div>
  )
}

export const GavazziLogo = CmxLogo
