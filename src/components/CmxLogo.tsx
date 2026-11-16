import React, { useEffect, useState } from 'react'
import { LOGO_GAVAZZI } from '@/assets/marcaGavazzi'

// Marca da Central Gavazzi. Mantém o nome/props do componente antigo (CmxLogo)
// para não mexer em quem o usa.
// - variant "dark": sobre fundo escuro, o logo vai num cartão branco.
// - variant "light": sobre fundo claro, logo + "Central Gavazzi". No modo escuro usa o
//   logo sem o fundo branco (transparente), mantendo as cores originais da Gavazzi.

// Tira o fundo branco sem mudar as cores: cada pixel é tratado como "cor sobre branco" e
// recebe a opacidade mínima que reproduz a cor original (borda suave, sem halo branco).
let brancoCache: string | null = null
let brancoPromessa: Promise<string> | null = null

function gerarLogoBranco(): Promise<string> {
  if (brancoCache) return Promise.resolve(brancoCache)
  if (brancoPromessa) return brancoPromessa
  brancoPromessa = new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (!ctx) throw new Error('sem canvas')
        ctx.drawImage(img, 0, 0)
        const dados = ctx.getImageData(0, 0, c.width, c.height)
        const p = dados.data
        for (let i = 0; i < p.length; i += 4) {
          const r = p[i]
          const g = p[i + 1]
          const b = p[i + 2]
          let a = Math.max(255 - r, 255 - g, 255 - b) / 255
          if (a < 0.03) a = 0
          if (a > 0) {
            p[i] = Math.round((r - 255 * (1 - a)) / a)
            p[i + 1] = Math.round((g - 255 * (1 - a)) / a)
            p[i + 2] = Math.round((b - 255 * (1 - a)) / a)
          }
          p[i + 3] = Math.round(a * p[i + 3])
        }
        ctx.putImageData(dados, 0, 0)
        brancoCache = c.toDataURL('image/png')
        resolve(brancoCache)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('logo não carregou'))
    img.src = LOGO_GAVAZZI
  })
  return brancoPromessa
}

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
  const [branco, setBranco] = useState<string | null>(brancoCache)

  useEffect(() => {
    if (variant !== 'light' || branco) return
    let vivo = true
    gerarLogoBranco()
      .then((s) => vivo && setBranco(s))
      .catch(() => {
        /* sem a versão branca, o modo escuro mostra o logo original */
      })
    return () => {
      vivo = false
    }
  }, [variant, branco])

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
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <img
        src={LOGO_GAVAZZI}
        alt="Gavazzi Engenharia"
        className={`${tam.img} w-auto ${branco ? 'dark:hidden' : ''}`}
      />
      {branco && (
        <img
          src={branco}
          alt="Gavazzi Engenharia"
          className={`${tam.img} w-auto hidden dark:block`}
        />
      )}
      <div className="leading-tight">
        <div className={`font-extrabold tracking-tight text-slate-900 ${tam.texto}`}>Central</div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Gavazzi
        </div>
      </div>
    </div>
  )
}

export const GavazziLogo = CmxLogo
