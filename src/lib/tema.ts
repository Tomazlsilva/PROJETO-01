// Tema claro/escuro. A escolha fica guardada neste navegador; sem escolha, segue o
// sistema (Windows/celular).
export type Tema = 'claro' | 'escuro'

const CHAVE = 'central.tema'

export function temaSalvo(): Tema {
  try {
    const v = window.localStorage.getItem(CHAVE)
    if (v === 'claro' || v === 'escuro') return v
  } catch {
    // sem armazenamento: segue o sistema
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function aplicarTema(t: Tema) {
  document.documentElement.classList.toggle('dark', t === 'escuro')
  document.documentElement.style.colorScheme = t === 'escuro' ? 'dark' : 'light'
}

export function salvarTema(t: Tema) {
  try {
    window.localStorage.setItem(CHAVE, t)
  } catch {
    // sem armazenamento: vale só nesta visita
  }
  aplicarTema(t)
}
