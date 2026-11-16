// SPEC-2-001 — Administração › Checklists: modelos de entrada e de revisão por disciplina,
// com rascunho, publicação em versões imutáveis, duplicar, colar itens e exemplos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ClipboardList,
  ClipboardPaste,
  Copy,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  ROTULO_TIPO,
  arquivarChecklist,
  criarChecklist,
  descartarRascunho,
  getChecklist,
  itensDeTexto,
  listarChecklists,
  mudarTipologia,
  publicarChecklist,
  reativarChecklist,
  salvarRascunho,
  usarVersaoComoRascunho,
  type DisciplinaRef,
  type ItemChecklist,
  type ModeloDetalhe,
  type ResumoModelo,
  type Severidade,
  type TipoChecklist,
} from '@/services/checklists'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')
const novoId = () => Math.random().toString(36).slice(2, 12)
const selectCls =
  'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30'

const mensagemErro = (err: unknown) => {
  if (err instanceof ClientResponseError && err.status === 409) {
    return (err.response as { message?: string }).message || 'Conflito: recarregue a página.'
  }
  const f = extractFieldErrors(err)
  return Object.values(f)[0] || getErrorMessage(err)
}

function Selo({
  m,
}: {
  m: Pick<ResumoModelo, 'estado' | 'exemplo' | 'vigente' | 'versao_atual' | 'tem_rascunho'>
}) {
  const base = 'text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap'
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {m.estado === 'arquivado' && (
        <span className={`${base} bg-slate-100 text-slate-600`}>arquivado</span>
      )}
      {m.exemplo && <span className={`${base} bg-slate-100 text-slate-600`}>exemplo</span>}
      {m.vigente && m.versao_atual > 0 && (
        <span className={`${base} bg-emerald-50 text-emerald-700`}>v{m.versao_atual} vigente</span>
      )}
      {!m.vigente && m.versao_atual > 0 && m.estado === 'ativo' && (
        <span className={`${base} bg-slate-100 text-slate-600`}>v{m.versao_atual} fora de uso</span>
      )}
      {m.tem_rascunho && (
        <span className={`${base} bg-amber-50 text-amber-800`}>
          rascunho{m.versao_atual > 0 ? ` v${m.versao_atual + 1}` : ''}
        </span>
      )}
    </span>
  )
}

export default function Checklists() {
  const [lista, setLista] = useState<ResumoModelo[] | null>(null)
  const [disciplinas, setDisciplinas] = useState<DisciplinaRef[]>([])
  const [tipologias, setTipologias] = useState<string[]>([])
  const [filtro, setFiltro] = useState('')
  const [verArquivados, setVerArquivados] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [novo, setNovo] = useState<null | {
    duplicar?: { modelo: string; versao?: number; rotulo: string }
  }>(null)

  const carregarLista = useCallback(async () => {
    try {
      const r = await listarChecklists()
      setLista(r.modelos)
      setDisciplinas(r.disciplinas)
      setTipologias(r.tipologias)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    void carregarLista()
  }, [carregarLista])

  const visiveis = useMemo(() => {
    const l = (lista ?? []).filter(
      (m) => (verArquivados || m.estado === 'ativo') && (!filtro || m.disciplina.id === filtro),
    )
    return l.sort(
      (a, b) =>
        a.disciplina.nome.localeCompare(b.disciplina.nome, 'pt-BR') ||
        a.tipo.localeCompare(b.tipo) ||
        Number(a.exemplo) - Number(b.exemplo) ||
        a.tipologia.localeCompare(b.tipologia, 'pt-BR'),
    )
  }, [lista, filtro, verArquivados])

  useEffect(() => {
    if (!selId && visiveis.length > 0) setSelId(visiveis[0].id)
  }, [selId, visiveis])

  if (!lista) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#1E3A8A]" /> Checklists
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Modelos de checklist de entrada e de revisão por disciplina. Cada publicação vira uma
            versão que não muda mais; projetos que já usam uma versão continuam nela.
          </p>
        </div>
        <Button onClick={() => setNovo({})} className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]">
          <Plus className="w-4 h-4" /> Novo modelo
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <section className="w-full lg:w-80 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-200 space-y-2">
            <select
              aria-label="Filtrar por disciplina"
              className={`${selectCls} w-full`}
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            >
              <option value="">Todas as disciplinas</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="w-4 h-4 accent-[#1E3A8A]"
                checked={verArquivados}
                onChange={(e) => setVerArquivados(e.target.checked)}
              />
              Mostrar arquivados
            </label>
          </div>
          {visiveis.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nenhum modelo com esse filtro.</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {visiveis.map((m) => {
                const ativo = m.id === selId
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelId(m.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        ativo ? 'bg-blue-50 shadow-[inset_3px_0_0_#1E3A8A]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${ativo ? 'text-[#1E3A8A]' : 'text-slate-800'}`}
                        >
                          {m.disciplina.nome} · {ROTULO_TIPO[m.tipo]}
                        </span>
                        <Selo m={m} />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {m.tipologia ? `Tipologia: ${m.tipologia} · ` : ''}
                        {m.total_itens} itens · {m.criticos} críticos
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="flex-1 min-w-0 w-full">
          {selId ? (
            <Editor
              key={selId}
              id={selId}
              tipologias={tipologias}
              onMudou={carregarLista}
              onDuplicar={(modelo, versao, rotulo) =>
                setNovo({ duplicar: { modelo, versao, rotulo } })
              }
            />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-sm text-slate-500">
              Escolha um modelo na lista ou crie um novo.
            </div>
          )}
        </div>
      </div>

      {novo && (
        <NovoModeloDialog
          disciplinas={disciplinas}
          tipologias={tipologias}
          duplicar={novo.duplicar}
          onClose={() => setNovo(null)}
          onCriado={async (id) => {
            setNovo(null)
            await carregarLista()
            setVerArquivados(false)
            setFiltro('')
            setSelId(id)
          }}
        />
      )}
    </div>
  )
}

function Editor({
  id,
  tipologias,
  onMudou,
  onDuplicar,
}: {
  id: string
  tipologias: string[]
  onMudou: () => Promise<void>
  onDuplicar: (modelo: string, versao: number | undefined, rotulo: string) => void
}) {
  const [m, setM] = useState<ModeloDetalhe | null>(null)
  const [itens, setItens] = useState<ItemChecklist[]>([])
  const [sujo, setSujo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [colar, setColar] = useState(false)
  const [publicar, setPublicar] = useState(false)
  const [verVersao, setVerVersao] = useState<number | null>(null)
  const [tipologia, setTipologia] = useState('')
  const [editTip, setEditTip] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const d = await getChecklist(id)
      setM(d)
      const vig = d.versoes.find((v) => v.numero === d.versao_atual)
      setItens((d.rascunho ?? vig?.itens ?? []).map((i) => ({ ...i })))
      setSujo(false)
      setTipologia(d.tipologia)
      setEditTip(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (!m) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando modelo…
      </div>
    )
  }

  const editavel = m.pode_editar && m.estado === 'ativo'
  const emRascunho = m.tem_rascunho || sujo
  const proxima = m.versao_atual + 1
  const titulo = `${m.disciplina.nome} · ${ROTULO_TIPO[m.tipo]}`

  const rodar = async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      await Promise.all([carregar(), onMudou()])
    } catch (err) {
      toast.error(mensagemErro(err))
      if (err instanceof ClientResponseError && err.status === 409) await carregar()
    } finally {
      setOcupado(false)
    }
  }

  const mudar = (i: number, campo: Partial<ItemChecklist>) => {
    setItens(itens.map((x, k) => (k === i ? { ...x, ...campo } : x)))
    setSujo(true)
  }
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= itens.length) return
    const n = [...itens]
    ;[n[i], n[j]] = [n[j], n[i]]
    setItens(n)
    setSujo(true)
  }
  const remover = (i: number) => {
    setItens(itens.filter((_, k) => k !== i))
    setSujo(true)
  }
  const adicionar = () => {
    setItens([
      ...itens,
      { id: novoId(), texto: '', grupo: '', severidade: 'normal', referencia: '' },
    ])
    setSujo(true)
  }

  const salvar = () => rodar(() => salvarRascunho(m.id, m.updated, itens), 'Rascunho salvo.')

  const vazios = itens.filter((i) => !i.texto.trim()).length

  return (
    <section className="bg-white rounded-xl border border-slate-200">
      <div className="p-5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 flex flex-wrap items-center gap-2">
            {titulo} <Selo m={m} />
          </h2>
          <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            {editTip ? (
              <>
                <Input
                  list="tipologias-chk"
                  value={tipologia}
                  maxLength={120}
                  onChange={(e) => setTipologia(e.target.value)}
                  placeholder="Sem tipologia (vale para todas)"
                  className="h-8 w-64"
                />
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={() =>
                    rodar(() => mudarTipologia(m.id, m.updated, tipologia), 'Tipologia alterada.')
                  }
                >
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditTip(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <>
                <span>Tipologia: {m.tipologia || 'todas'}</span>
                {editavel && (
                  <button
                    type="button"
                    className="text-[#1E3A8A] font-medium hover:underline"
                    onClick={() => setEditTip(true)}
                  >
                    alterar
                  </button>
                )}
              </>
            )}
          </div>
          {m.exemplo && (
            <p className="text-xs text-slate-500 mt-1">
              Modelo de exemplo, só para testar o fluxo. Ao publicar um checklist real desta
              disciplina e tipo, o exemplo deixa de valer.
            </p>
          )}
        </div>
        {m.pode_editar && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => onDuplicar(m.id, undefined, titulo)}
            >
              <Copy className="w-4 h-4" /> Duplicar
            </Button>
            {m.estado === 'ativo' ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={ocupado}
                onClick={() =>
                  rodar(
                    () => arquivarChecklist(m.id),
                    'Modelo arquivado. Projetos que já usam continuam com a versão deles.',
                  )
                }
              >
                <Archive className="w-4 h-4" /> Arquivar
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={ocupado}
                onClick={() => rodar(() => reativarChecklist(m.id), 'Modelo reativado.')}
              >
                <RotateCcw className="w-4 h-4" /> Reativar
              </Button>
            )}
          </div>
        )}
      </div>

      {editavel && m.versao_atual > 0 && emRascunho && (
        <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Você está editando o rascunho da <strong>versão {proxima}</strong>
          {m.rascunho_origem ? ` (a partir da v${m.rascunho_origem})` : ''}. Projetos que já usam a
          v{m.versao_atual} continuam nela; a v{proxima} só vale para disciplinas que receberem
          checklist depois da publicação.
        </div>
      )}
      {!editavel && m.estado === 'arquivado' && (
        <div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Modelo arquivado: não é aplicado a projetos novos. As versões continuam consultáveis
          abaixo.
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 bg-slate-50 border-y border-slate-200">
              <th className="py-2 pl-5 pr-2 w-10">#</th>
              <th className="py-2 px-2 min-w-[260px]">Item *</th>
              <th className="py-2 px-2 w-40">Grupo</th>
              <th className="py-2 px-2 w-32">Severidade</th>
              <th className="py-2 px-2 w-40">Referência</th>
              {editavel && <th className="py-2 pl-2 pr-5 w-28" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-slate-500">
                  Nenhum item ainda. Use “Adicionar item” ou “Colar itens”.
                </td>
              </tr>
            )}
            {itens.map((it, i) =>
              editavel ? (
                <tr key={it.id} className="align-top">
                  <td className="py-2 pl-5 pr-2 text-slate-400 pt-4">{i + 1}</td>
                  <td className="py-2 px-2">
                    <Textarea
                      rows={1}
                      value={it.texto}
                      maxLength={500}
                      aria-label={`Texto do item ${i + 1}`}
                      onChange={(e) => mudar(i, { texto: e.target.value })}
                      className={`min-h-9 py-1.5 ${it.texto.trim() ? '' : 'border-red-400'}`}
                    />
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      value={it.grupo}
                      maxLength={80}
                      aria-label={`Grupo do item ${i + 1}`}
                      onChange={(e) => mudar(i, { grupo: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <select
                      aria-label={`Severidade do item ${i + 1}`}
                      className={`${selectCls} w-full ${it.severidade === 'critico' ? 'text-red-700 font-semibold' : ''}`}
                      value={it.severidade}
                      onChange={(e) => mudar(i, { severidade: e.target.value as Severidade })}
                    >
                      <option value="normal">Normal</option>
                      <option value="critico">Crítico</option>
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <Input
                      value={it.referencia}
                      maxLength={200}
                      placeholder="Norma, padrão…"
                      aria-label={`Referência do item ${i + 1}`}
                      onChange={(e) => mudar(i, { referencia: e.target.value })}
                      className="h-9"
                    />
                  </td>
                  <td className="py-2 pl-2 pr-5">
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        type="button"
                        aria-label="Subir item"
                        disabled={i === 0}
                        onClick={() => mover(i, -1)}
                        className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Descer item"
                        disabled={i === itens.length - 1}
                        onClick={() => mover(i, 1)}
                        className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remover item"
                        onClick={() => remover(i)}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={it.id}>
                  <td className="py-3 pl-5 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-3 px-2 text-slate-800">{it.texto}</td>
                  <td className="py-3 px-2 text-slate-600">{it.grupo || '—'}</td>
                  <td className="py-3 px-2">
                    {it.severidade === 'critico' ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                        Crítico
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-slate-500">{it.referencia || '—'}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {editavel && (
        <div className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={adicionar}>
              <Plus className="w-4 h-4" /> Adicionar item
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setColar(true)}>
              <ClipboardPaste className="w-4 h-4" /> Colar itens
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {vazios > 0 && (
              <span className="text-xs text-red-600">
                {vazios} item(ns) sem texto: preencha ou remova antes de publicar.
              </span>
            )}
            {(m.tem_rascunho || sujo) && m.versao_atual > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={ocupado}
                onClick={() =>
                  sujo && !m.tem_rascunho
                    ? void carregar()
                    : rodar(() => descartarRascunho(m.id, m.updated), 'Rascunho descartado.')
                }
              >
                Descartar alterações
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={ocupado || !sujo}
              onClick={salvar}
            >
              <Save className="w-4 h-4" /> Salvar rascunho
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
              disabled={ocupado || !emRascunho || itens.length === 0 || vazios > 0}
              onClick={() => setPublicar(true)}
            >
              <Send className="w-4 h-4" /> Publicar versão {proxima}
            </Button>
          </div>
        </div>
      )}

      <div className="px-5 py-4 border-t border-slate-200">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <History className="w-4 h-4 text-[#1E3A8A]" /> Versões
        </h3>
        {m.versoes.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">Ainda não publicado.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {m.versoes.map((v) => (
              <li key={v.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        v.numero === m.versao_atual && m.vigente
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      v{v.numero}
                      {v.numero === m.versao_atual && m.vigente ? ' vigente' : ''}
                    </span>
                    <span className="text-slate-700">
                      {v.autor?.nome ?? 'Sistema'} · {quando(v.created)}
                    </span>
                    <span className="text-slate-500">
                      · {v.total_itens} itens, {v.criticos} críticos
                      {v.republicada_de ? ` · republicada da v${v.republicada_de}` : ''}
                      {v.nota ? ` · ${v.nota}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVerVersao(verVersao === v.numero ? null : v.numero)}
                    >
                      {verVersao === v.numero ? 'Ocultar itens' : 'Ver itens'}
                    </Button>
                    {editavel && v.numero !== m.versao_atual && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={ocupado}
                        onClick={() =>
                          rodar(
                            () => usarVersaoComoRascunho(m.id, m.updated, v.numero),
                            `Itens da v${v.numero} copiados para o rascunho. Publique para criar a v${proxima}.`,
                          )
                        }
                      >
                        Usar como rascunho
                      </Button>
                    )}
                    {m.pode_editar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDuplicar(m.id, v.numero, `${titulo} v${v.numero}`)}
                      >
                        Duplicar
                      </Button>
                    )}
                  </div>
                </div>
                {verVersao === v.numero && (
                  <ol className="mt-2 ml-1 space-y-1 text-slate-700 list-decimal list-inside">
                    {v.itens.map((it) => (
                      <li key={it.id}>
                        {it.texto}
                        <span className="text-slate-400">
                          {it.grupo ? ` · ${it.grupo}` : ''}
                          {it.severidade === 'critico' ? ' · crítico' : ''}
                          {it.referencia ? ` · ${it.referencia}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <datalist id="tipologias-chk">
        {tipologias.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {colar && (
        <ColarDialog
          onClose={() => setColar(false)}
          onColar={(novos) => {
            setItens([...itens, ...novos])
            setSujo(true)
            setColar(false)
            toast.success(`${novos.length} item(ns) incluído(s). Salve o rascunho ou publique.`)
          }}
        />
      )}

      {publicar && (
        <PublicarDialog
          numero={proxima}
          itens={itens}
          titulo={titulo}
          onClose={() => setPublicar(false)}
          onPublicar={async (nota) => {
            setOcupado(true)
            try {
              let base = m.updated
              // o servidor publica a partir do rascunho: grava antes se ainda não existe
              if (!m.tem_rascunho || sujo) {
                const r = await salvarRascunho(m.id, base, itens)
                base = r.updated
              }
              const r = await publicarChecklist(m.id, base, itens, nota)
              toast.success(`Versão ${r.numero} publicada e vigente.`)
              setPublicar(false)
              await Promise.all([carregar(), onMudou()])
            } catch (err) {
              toast.error(mensagemErro(err))
              await carregar()
            } finally {
              setOcupado(false)
            }
          }}
          ocupado={ocupado}
        />
      )}
    </section>
  )
}

function ColarDialog({
  onClose,
  onColar,
}: {
  onClose: () => void
  onColar: (itens: ItemChecklist[]) => void
}) {
  const [texto, setTexto] = useState('')
  const [grupo, setGrupo] = useState('')
  const [sev, setSev] = useState<Severidade>('normal')
  const itens = itensDeTexto(texto, { grupo: grupo.trim().slice(0, 80), severidade: sev })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Colar itens</DialogTitle>
          <DialogDescription>
            Uma linha vira um item. Linhas vazias são ignoradas; marcadores como “-” ou “1.” no
            começo da linha são removidos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            rows={8}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              'Planta de arquitetura na revisão vigente\nPlanta de estrutura com pilares e vigas'
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="colar-grupo">Grupo (opcional)</Label>
              <Input
                id="colar-grupo"
                value={grupo}
                maxLength={80}
                onChange={(e) => setGrupo(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="colar-sev">Severidade</Label>
              <select
                id="colar-sev"
                className={`${selectCls} w-full mt-1`}
                value={sev}
                onChange={(e) => setSev(e.target.value as Severidade)}
              >
                <option value="normal">Normal</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={itens.length === 0}
            onClick={() => onColar(itens)}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            Incluir {itens.length} item(ns)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PublicarDialog({
  numero,
  itens,
  titulo,
  ocupado,
  onClose,
  onPublicar,
}: {
  numero: number
  itens: ItemChecklist[]
  titulo: string
  ocupado: boolean
  onClose: () => void
  onPublicar: (nota: string) => Promise<void>
}) {
  const [nota, setNota] = useState('')
  const criticos = itens.filter((i) => i.severidade === 'critico').length
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Publicar {titulo} v{numero}
          </DialogTitle>
          <DialogDescription>
            A versão publicada não pode mais ser alterada. Para mudar depois, edite e publique uma
            versão nova.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-slate-700">
          {itens.length} itens, {criticos} críticos.
        </p>
        <div>
          <Label htmlFor="pub-nota">O que mudou (opcional)</Label>
          <Textarea
            id="pub-nota"
            rows={2}
            maxLength={500}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="mt-1"
            placeholder="Ex.: incluídos os isométricos dos banheiros"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={ocupado}
            onClick={() => void onPublicar(nota.trim())}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {ocupado ? 'Publicando…' : `Publicar v${numero}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NovoModeloDialog({
  disciplinas,
  tipologias,
  duplicar,
  onClose,
  onCriado,
}: {
  disciplinas: DisciplinaRef[]
  tipologias: string[]
  duplicar?: { modelo: string; versao?: number; rotulo: string }
  onClose: () => void
  onCriado: (id: string) => Promise<void>
}) {
  const [disciplina, setDisciplina] = useState('')
  const [tipo, setTipo] = useState<TipoChecklist>('revisao')
  const [tipologia, setTipologia] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    setEnviando(true)
    try {
      const r = await criarChecklist({
        disciplina,
        tipo,
        tipologia: tipologia.trim(),
        duplicar_de: duplicar ? { modelo: duplicar.modelo, versao: duplicar.versao } : undefined,
      })
      toast.success(duplicar ? 'Modelo duplicado como rascunho.' : 'Modelo criado como rascunho.')
      await onCriado(r.id)
    } catch (err) {
      toast.error(mensagemErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{duplicar ? 'Duplicar modelo' : 'Novo modelo de checklist'}</DialogTitle>
          <DialogDescription>
            {duplicar
              ? `Os itens de “${duplicar.rotulo}” serão copiados para um rascunho novo.`
              : 'O modelo começa como rascunho; ele só passa a valer depois de publicado.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="nm-disc">Disciplina *</Label>
            <select
              id="nm-disc"
              className={`${selectCls} w-full mt-1`}
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
            >
              <option value="">Escolha…</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="nm-tipo">Tipo *</Label>
            <select
              id="nm-tipo"
              className={`${selectCls} w-full mt-1`}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoChecklist)}
            >
              <option value="entrada">Entrada (o que precisa chegar antes de começar)</option>
              <option value="revisao">Revisão (o que o coordenador confere)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="nm-tip">Tipologia (opcional)</Label>
            <Input
              id="nm-tip"
              list="tipologias-novo"
              value={tipologia}
              maxLength={120}
              onChange={(e) => setTipologia(e.target.value)}
              placeholder="Em branco = vale para todas"
              className="mt-1"
            />
            <datalist id="tipologias-novo">
              {tipologias.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={enviando || !disciplina}
            onClick={enviar}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {enviando ? 'Criando…' : duplicar ? 'Duplicar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
