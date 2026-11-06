import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen,
  Download,
  ExternalLink,
  ArrowLeft,
  FileText,
  AlertCircle,
  Maximize2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MANUAL_PDF_URL, MANUAL_FILENAME, MANUAL_TITULO, MANUAL_SUBTITULO } from '@/assets/manual'
import { useAuth } from '@/contexts/AuthContext'

export default function Manual() {
  const { isAuthenticated } = useAuth()
  const [iframeError, setIframeError] = useState(false)

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[640px] gap-4">
      {/* Cabeçalho da página */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 text-[#1E3A8A] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                {MANUAL_TITULO}
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-[#1E3A8A]">
                v1.1 · 41 páginas
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{MANUAL_SUBTITULO}</p>
          </div>
        </div>

        {/* Ações: Voltar, Abrir em nova aba e Baixar */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isAuthenticated ? (
            <Button variant="outline" size="sm" asChild className="gap-1.5 text-slate-700">
              <Link to="/">
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar ao login</span>
              </Link>
            </Button>
          ) : null}

          <Button variant="outline" size="sm" asChild className="gap-1.5 text-slate-700">
            <a
              href={MANUAL_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir PDF em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Nova aba</span>
            </a>
          </Button>

          <Button size="sm" asChild className="gap-1.5 bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white">
            <a
              href={MANUAL_PDF_URL}
              download={MANUAL_FILENAME}
              title="Baixar arquivo PDF do manual"
            >
              <Download className="w-4 h-4" />
              <span>Baixar PDF</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Visualizador do PDF */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col relative">
        {iframeError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">
              Visualização integrada indisponível neste navegador
            </h2>
            <p className="text-sm text-slate-500 max-w-md mt-1 mb-5">
              O seu navegador bloqueou a incorporação direta do documento PDF ou não suporta
              visualização de PDFs incorporados.
            </p>
            <div className="flex items-center gap-3">
              <Button asChild className="bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white gap-2">
                <a href={MANUAL_PDF_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  Abrir manual em nova aba
                </a>
              </Button>
              <Button variant="outline" asChild className="gap-2">
                <a href={MANUAL_PDF_URL} download={MANUAL_FILENAME}>
                  <Download className="w-4 h-4" />
                  Baixar arquivo
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <object
            data={MANUAL_PDF_URL}
            type="application/pdf"
            className="w-full h-full flex-1 border-0"
            onError={() => setIframeError(true)}
          >
            {/* Fallback interno quando o elemento <object> não carregar */}
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1E3A8A] border border-blue-200 flex items-center justify-center mb-4 shadow-sm">
                <FileText className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                Visualizar Manual da Central Gavazzi
              </h2>
              <p className="text-sm text-slate-500 max-w-md mb-6">
                Guia completo com 41 páginas cobrindo todas as telas, apontamento de horas,
                calendário, aprovações e boas práticas.
              </p>
              <div className="flex items-center gap-3 flex-wrap justify-center">
                <Button asChild className="bg-[#1E3A8A] hover:bg-[#1E2A6B] text-white gap-2">
                  <a href={MANUAL_PDF_URL} target="_blank" rel="noopener noreferrer">
                    <Maximize2 className="w-4 h-4" />
                    Abrir manual completo (41 páginas)
                  </a>
                </Button>
                <Button variant="outline" asChild className="gap-2">
                  <a href={MANUAL_PDF_URL} download={MANUAL_FILENAME}>
                    <Download className="w-4 h-4" />
                    Baixar PDF
                  </a>
                </Button>
              </div>
            </div>
          </object>
        )}
      </div>
    </div>
  )
}
