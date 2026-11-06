/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'
import { aplicarTema, temaSalvo } from './lib/tema'

// tema claro/escuro antes do primeiro desenho, para não piscar
aplicarTema(temaSalvo())

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(<App />)
