import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  ExternalLink,
  History,
  KanbanSquare,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  Users,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { AcessoNegado } from '@/components/AppShell'
import { canWriteReview } from '@/lib/permissions'
import { NOME_PADRAO, type Etapa } from '@/lib/fluxo'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  PRIORIDADES,
  arquivarProjeto,
  createRevisao,
  editarProjeto,
  formatarData,
  getProjeto,
  hojeBR,
  incluirDisciplina,
  listAtribuiveis,
  listDisciplinas,
  listRevisoes,
  restaurarProjeto,
  trocarResponsavel,
  updateRevisao,
  type Disciplina,
  type EventoHistorico,
  type PessoaAtribuivel,
  type Prioridade,
  type ProjetoDetalhe as Detalhe,
  type Revisao,
} from '@/services/projetos'

const HERDAR = '__herdar__'
const OUTRA = '__outra__'

const ACAO: Record<string, string> = {
  criado: 'Projeto criado',
  editado: 'Alteração',
  arquivado: 'Arquivado',
  restaurado: 'Restaurado',
  disciplina_incluida: 'Disciplina incluída',
}
const CAMPO: Record<string, string> = {
  nome: 'Nome',
  local: 'Local',
  tipologia: 'Tipologia',
  prazo: 'Prazo',
  prioridade: 'Prioridade',
  link_entrada: 'Link de entrada',
  coordenador: 'Coordenador',
  cliente: 'Cliente',
  responsavel: 'Responsável',
  disciplina: 'Disciplina',
  arquivado: 'Arquivado',
}

const quando = (s: string) => new Date(s.replace(' ', 'T')).toLocaleString('pt-BR')

function exportarHistorico(p: Detalhe) {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const linhas = [['data_hora', 'autor', 'acao', 'campo', 'antes', 'depois', 'detalhes']]
  for (const h of [...p.detalhe.historico].reverse()) {
    linhas.push([
      quando(h.created),
      h.autor?.nome ?? '',
      ACAO[h.acao] ?? h.acao,
      CAMPO[h.campo] ?? h.campo,
      h.antes,
      h.depois,
      h.detalhes ? JSON.stringify(h.detalhes) : '',
    ])
  }
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `historico-${p.nome.replace(/[^\w-]+/g, '_').slice(0, 60)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ProjetoDetalhe() {
  const { id = '' } = useParams()
  const { user, role } = useAuth()
  const [projeto, setProjeto] = useState<Detalhe | 'negado' | null>(null)
  const [revisoes, setRevisoes] = useState<Revisao[]>([])
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([])
  const [catalogo, setCatalogo] = useState<Disciplina[]>([])
  const [editando, setEditando] = useState(false)
  const [arquivar, setArquivar] = useState(false)
  const [incluir, setIncluir] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const p = await getProjeto(id)
      setProjeto(p)
      if (p !== 'negado')
        listRevisoes(id)
          .then(setRevisoes)
          .catch(() => setRevisoes([]))
    } catch {
      setProjeto('negado')
    }
  }, [id])

  useEffect(() => {
    setProjeto(null)
    void carregar()
  }, [carregar])

  const podeEditar = projeto !== null && projeto !== 'negado' && projeto.pode_editar
  useEffect(() => {
    if (!podeEditar) return
    listAtribuiveis()
      .then(setPessoas)
      .catch(() => setPessoas([]))
    listDisciplinas()
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
  }, [podeEditar])

  if (projeto === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    )
  }
  if (projeto === 'negado') return <AcessoNegado />

  const p = projeto
  const editavel = p.pode_editar && !p.arquivado

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast.success(ok)
      await carregar()
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 409) {
        toast.error((err.response as { message?: string }).message || 'Operação recusada.')
        await carregar()
      } else toast.error(getErrorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      {p.arquivado && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-center justify-between gap-3">
          <span>
            Projeto arquivado: fora das listas ativas e sem edição. O histórico está preservado.
          </span>
          {p.pode_editar && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => acao(() => restaurarProjeto(p.id), 'Projeto restaurado.')}
            >
              <ArchiveRestore className="w-4 h-4" /> Restaurar
            </Button>
          )}
        </div>
      )}

      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              {p.detalhe.cliente?.nome ?? 'Sem cliente'}
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">{p.nome}</h1>
          </div>
          {editavel && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setEditando(true)}
              >
                <Pencil className="w-4 h-4" /> Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-slate-600"
                onClick={() => setArquivar(true)}
              >
                <Archive className="w-4 h-4" /> Arquivar
              </Button>
            </div>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 text-sm">
          <Info rotulo="Local" valor={p.local || '—'} />
          <Info rotulo="Tipologia" valor={p.tipologia || '—'} />
          <Info rotulo="Coordenador" valor={p.detalhe.coordenador?.nome ?? '—'} />
          <Info rotulo="Prazo" valor={formatarData(p.prazo)} />
          <Info rotulo="Prioridade" valor={p.prioridade || '—'} />
          <div>
            <dt className="text-xs font-semibold uppercase text-slate-500">Link de entrada</dt>
            <dd className="mt-0.5">
              {p.link_entrada ? (
                <a
                  href={p.link_entrada}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline break-all"
                >
                  Abrir <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#1E3A8A]" />
            <h2 className="text-base font-bold text-slate-900">Disciplinas e responsáveis</h2>
          </div>
          <div className="flex gap-2">
            {!p.arquivado && (
              <Button size="sm" variant="outline" className="gap-1" asChild>
                <Link to={`/kanban?projeto=${p.id}`}>
                  <KanbanSquare className="w-4 h-4" /> Ver no Kanban
                </Link>
              </Button>
            )}
            {editavel && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setIncluir(true)}
              >
                <Plus className="w-4 h-4" /> Disciplina
              </Button>
            )}
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {p.detalhe.disciplinas.map((d) => (
            <li key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium text-slate-800">
                {d.disciplina.nome}
                {d.disciplina.personalizada && (
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    personalizada
                  </span>
                )}
                {d.etapa && (
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {NOME_PADRAO[d.etapa as Etapa] ?? d.etapa}
                  </span>
                )}
                {d.bloqueado && (
                  <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                    bloqueado
                  </span>
                )}
              </span>
              {editavel ? (
                <div className="w-full sm:w-72">
                  <Select
                    value={d.herdado ? HERDAR : d.responsavel?.id}
                    onValueChange={(v) =>
                      acao(
                        () => trocarResponsavel(p.id, d.id, v === HERDAR ? '' : v),
                        'Responsável atualizado.',
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={HERDAR}>
                        Herdar do coordenador ({p.detalhe.coordenador?.nome})
                      </SelectItem>
                      {pessoas.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <span className="text-sm text-slate-600">
                  {d.responsavel?.nome ?? '—'}
                  {d.herdado && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      herdado do coordenador
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Revisoes
        projeto={p}
        revisoes={revisoes}
        recarregar={() => listRevisoes(id).then(setRevisoes)}
        userId={user?.id ?? ''}
        podeRevisar={
          canWriteReview(role) &&
          (role === 'admin' || p.coordenador === user?.id || p.membros.includes(user?.id ?? ''))
        }
      />

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#1E3A8A]" />
            <h2 className="text-base font-bold text-slate-900">Histórico</h2>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => exportarHistorico(p)}
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>
        {p.detalhe.historico.length === 0 ? (
          <p className="text-sm text-slate-500">Sem registros.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {p.detalhe.historico.map((h) => (
              <ItemHistorico key={h.id} h={h} />
            ))}
          </ul>
        )}
      </section>

      {editando && (
        <EditarDialog
          projeto={p}
          pessoas={pessoas}
          isAdmin={role === 'admin'}
          onClose={() => setEditando(false)}
          onSaved={carregar}
        />
      )}

      <ArquivarDialog
        aberto={arquivar}
        onClose={() => setArquivar(false)}
        onConfirm={(motivo) => {
          setArquivar(false)
          void acao(() => arquivarProjeto(p.id, motivo), 'Projeto arquivado.')
        }}
      />

      <IncluirDialog
        aberto={incluir}
        catalogo={catalogo.filter(
          (c) => !p.detalhe.disciplinas.some((d) => d.disciplina.id === c.id),
        )}
        pessoas={pessoas}
        nomeCoordenador={p.detalhe.coordenador?.nome ?? ''}
        onClose={() => setIncluir(false)}
        onConfirm={(disc, resp) => {
          setIncluir(false)
          void acao(() => incluirDisciplina(p.id, disc, resp), 'Disciplina incluída.')
        }}
      />
    </div>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-slate-500">{rotulo}</dt>
      <dd className="mt-0.5 text-slate-800">{valor}</dd>
    </div>
  )
}

function ItemHistorico({ h }: { h: EventoHistorico }) {
  const det = h.detalhes || {}
  const extra =
    h.campo === 'responsavel' && det.disciplina
      ? ` (${String(det.disciplina)})`
      : h.acao === 'arquivado' && det.motivo
        ? ` — motivo: ${String(det.motivo)}`
        : ''
  const fmt = (v: string) => (h.campo === 'prazo' ? formatarData(v) : v || '—')
  return (
    <li className="py-2.5 flex flex-wrap gap-x-3 gap-y-0.5">
      <span className="text-slate-500 whitespace-nowrap">{quando(h.created)}</span>
      <span className="text-slate-800">
        <strong>{h.autor?.nome ?? 'Sistema'}</strong> · {ACAO[h.acao] ?? h.acao}
        {h.acao === 'editado' && (
          <>
            {' '}
            de <em>{CAMPO[h.campo] ?? h.campo}</em>
            {extra}: {fmt(h.antes)} → {fmt(h.depois)}
          </>
        )}
        {h.acao === 'disciplina_incluida' && <>: {h.depois}</>}
        {h.acao === 'arquivado' && extra}
      </span>
    </li>
  )
}

function EditarDialog({
  projeto,
  pessoas,
  isAdmin,
  onClose,
  onSaved,
}: {
  projeto: Detalhe
  pessoas: PessoaAtribuivel[]
  isAdmin: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [nome, setNome] = useState(projeto.nome)
  const [local, setLocal] = useState(projeto.local)
  const [tipologia, setTipologia] = useState(projeto.tipologia)
  const [prazo, setPrazo] = useState(projeto.prazo.slice(0, 10))
  const [prioridade, setPrioridade] = useState<Prioridade>(
    (projeto.prioridade || 'Normal') as Prioridade,
  )
  const [link, setLink] = useState(projeto.link_entrada)
  const [coordenador, setCoordenador] = useState(projeto.coordenador)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    const campos: Record<string, string> = {}
    if (nome !== projeto.nome) campos.nome = nome
    if (local !== projeto.local) campos.local = local
    if (tipologia !== projeto.tipologia) campos.tipologia = tipologia
    if (prazo !== projeto.prazo.slice(0, 10)) campos.prazo = prazo
    if (prioridade !== projeto.prioridade) campos.prioridade = prioridade
    if (link !== projeto.link_entrada) campos.link_entrada = link
    if (isAdmin && coordenador !== projeto.coordenador) campos.coordenador = coordenador
    if (Object.keys(campos).length === 0) {
      onClose()
      return
    }
    setSalvando(true)
    setErros({})
    try {
      await editarProjeto(projeto.id, projeto.updated, campos)
      toast.success('Alterações salvas e registradas no histórico.')
      onClose()
      await onSaved()
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 409) {
        toast.error((err.response as { message?: string }).message || 'Conflito de edição.')
        onClose()
        await onSaved()
      } else {
        const f = extractFieldErrors(err)
        setErros(f)
        toast.error(Object.keys(f).length ? 'Revise os campos destacados.' : getErrorMessage(err))
      }
    } finally {
      setSalvando(false)
    }
  }

  const cls = (c: string) => (erros[c] ? 'border-red-500' : '')
  const Erro = ({ c }: { c: string }) =>
    erros[c] ? <p className="text-xs text-red-600 mt-1">{erros[c]}</p> : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar projeto</DialogTitle>
          <DialogDescription>
            Cada alteração fica no histórico com antes, depois, autor e horário.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={cls('nome')}
              maxLength={200}
            />
            <Erro c="nome" />
          </div>
          <div>
            <Label>Local</Label>
            <Input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className={cls('local')}
              maxLength={300}
            />
            <Erro c="local" />
          </div>
          <div>
            <Label>Tipologia</Label>
            <Input
              value={tipologia}
              onChange={(e) => setTipologia(e.target.value)}
              className={cls('tipologia')}
              maxLength={120}
            />
            <Erro c="tipologia" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prazo</Label>
              <Input
                type="date"
                min={hojeBR()}
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className={cls('prazo')}
              />
              <Erro c="prazo" />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isAdmin && (
            <div>
              <Label>Coordenador</Label>
              <Select value={coordenador} onValueChange={setCoordenador}>
                <SelectTrigger className={cls('coordenador')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pessoas
                    .filter((u) => u.papel === 'coordenador' || u.papel === 'admin')
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Erro c="coordenador" />
            </div>
          )}
          <div>
            <Label>Link de entrada</Label>
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              className={cls('link_entrada')}
            />
            <Erro c="link_entrada" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ArquivarDialog({
  aberto,
  onClose,
  onConfirm,
}: {
  aberto: boolean
  onClose: () => void
  onConfirm: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    if (aberto) setMotivo('')
  }, [aberto])
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar projeto</DialogTitle>
          <DialogDescription>
            Sai das listas ativas e deixa de aceitar edição. Nada é apagado e é possível restaurar.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)"
          maxLength={500}
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(motivo)} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
            Arquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IncluirDialog({
  aberto,
  catalogo,
  pessoas,
  nomeCoordenador,
  onClose,
  onConfirm,
}: {
  aberto: boolean
  catalogo: Disciplina[]
  pessoas: PessoaAtribuivel[]
  nomeCoordenador: string
  onClose: () => void
  onConfirm: (disciplina: string | { nome: string }, responsavel: string) => void
}) {
  const [disc, setDisc] = useState('')
  const [livre, setLivre] = useState('')
  const [resp, setResp] = useState(HERDAR)
  useEffect(() => {
    if (aberto) {
      setDisc('')
      setLivre('')
      setResp(HERDAR)
    }
  }, [aberto])
  const pronto = disc === OUTRA ? livre.trim().length >= 2 : !!disc
  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Incluir disciplina</DialogTitle>
          <DialogDescription>Escolha a disciplina e o responsável.</DialogDescription>
        </DialogHeader>
        {
          <div className="space-y-3">
            <Select value={disc || undefined} onValueChange={setDisc}>
              <SelectTrigger>
                <SelectValue placeholder="Disciplina" />
              </SelectTrigger>
              <SelectContent>
                {catalogo.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
                <SelectItem value={OUTRA}>Outra (digitar)…</SelectItem>
              </SelectContent>
            </Select>
            {disc === OUTRA && (
              <Input
                placeholder="Nome da disciplina"
                value={livre}
                maxLength={80}
                autoFocus
                onChange={(e) => setLivre(e.target.value)}
              />
            )}
            <Select value={resp} onValueChange={setResp}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={HERDAR}>Herdar do coordenador ({nomeCoordenador})</SelectItem>
                {pessoas.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!pronto}
            onClick={() =>
              onConfirm(disc === OUTRA ? { nome: livre.trim() } : disc, resp === HERDAR ? '' : resp)
            }
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            Incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Revisoes({
  projeto,
  revisoes,
  recarregar,
  userId,
  podeRevisar,
}: {
  projeto: Detalhe
  revisoes: Revisao[]
  recarregar: () => Promise<unknown>
  userId: string
  podeRevisar: boolean
}) {
  const [parecer, setParecer] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const registrar = async () => {
    if (!parecer.trim()) return
    setSalvando(true)
    try {
      await createRevisao(projeto.id, userId, parecer.trim())
      setParecer('')
      toast.success('Revisão registrada.')
      await recarregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }
  const salvarEdicao = async (revId: string) => {
    if (!texto.trim()) return
    try {
      await updateRevisao(revId, texto.trim())
      setEditando(null)
      toast.success('Revisão atualizada.')
      await recarregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquareText className="w-5 h-5 text-[#1E3A8A]" />
        <h2 className="text-base font-bold text-slate-900">Revisões</h2>
      </div>
      {podeRevisar && (
        <div className="space-y-2">
          <Textarea
            value={parecer}
            onChange={(e) => setParecer(e.target.value)}
            placeholder="Registre o parecer da revisão"
            maxLength={5000}
            rows={3}
          />
          <Button
            onClick={registrar}
            disabled={salvando || !parecer.trim()}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {salvando ? 'Registrando…' : 'Registrar revisão'}
          </Button>
        </div>
      )}
      {revisoes.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma revisão registrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {revisoes.map((r) => {
            const minha = r.autor === userId
            const autorNome =
              (r.expand?.autor?.name as string) || (minha ? 'Você' : 'Membro da equipe')
            return (
              <li key={r.id} className="py-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    <strong className="text-slate-700">{minha ? 'Você' : autorNome}</strong> ·{' '}
                    {quando(r.created)}
                  </span>
                  {minha && editando !== r.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(r.id)
                        setTexto(r.parecer)
                      }}
                      className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                  )}
                </div>
                {editando === r.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      rows={3}
                      maxLength={5000}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => salvarEdicao(r.id)}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.parecer}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
