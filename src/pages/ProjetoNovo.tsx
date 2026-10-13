import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  PRIORIDADES,
  criarProjeto,
  hojeBR,
  listAtribuiveis,
  listClientes,
  listDisciplinas,
  type Cliente,
  type Disciplina,
  type NovoProjeto,
  type PessoaAtribuivel,
  type Prioridade,
  type Similar,
} from '@/services/projetos'

const NOVO_CLIENTE = '__novo__'
const HERDAR = '__herdar__'
const OUTRA = '__outra__'

interface LinhaDisciplina {
  chave: number
  disciplina: string
  livre: string
  responsavel: string
}

export default function ProjetoNovo() {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const pode = role === 'admin' || role === 'coordenador'

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([])

  const [nome, setNome] = useState('')
  const [clienteSel, setClienteSel] = useState(NOVO_CLIENTE)
  const [clienteNome, setClienteNome] = useState('')
  const [local, setLocal] = useState('')
  const [tipologia, setTipologia] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('Normal')
  const [link, setLink] = useState('')
  const [coordenador, setCoordenador] = useState(user?.id ?? '')
  const [linhas, setLinhas] = useState<LinhaDisciplina[]>([
    { chave: 1, disciplina: '', livre: '', responsavel: HERDAR },
  ])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [similares, setSimilares] = useState<Similar[] | null>(null)

  useEffect(() => {
    if (!pode) return
    listClientes()
      .then(setClientes)
      .catch(() => setClientes([]))
    listDisciplinas()
      .then(setDisciplinas)
      .catch(() => setDisciplinas([]))
    listAtribuiveis()
      .then(setPessoas)
      .catch(() => setPessoas([]))
  }, [pode])

  const coordenadores = useMemo(
    () => pessoas.filter((p) => p.papel === 'coordenador' || p.papel === 'admin'),
    [pessoas],
  )
  const nomeCoordenador =
    pessoas.find((p) => p.id === coordenador)?.nome || (user?.name as string) || 'coordenador'

  if (!pode) return <AcessoNegado />

  const montar = (confirmar: boolean): NovoProjeto => ({
    nome,
    ...(clienteSel === NOVO_CLIENTE ? { cliente_nome: clienteNome } : { cliente: clienteSel }),
    local,
    tipologia,
    prazo,
    prioridade,
    link_entrada: link,
    ...(role === 'admin' ? { coordenador } : {}),
    disciplinas: linhas
      .filter((l) => l.disciplina)
      .map((l) => ({
        ...(l.disciplina === OUTRA ? { disciplina_nome: l.livre } : { disciplina: l.disciplina }),
        ...(l.responsavel && l.responsavel !== HERDAR ? { responsavel: l.responsavel } : {}),
      })),
    confirmar_duplicidade: confirmar,
  })

  const salvar = async (confirmar = false) => {
    setSalvando(true)
    setErros({})
    try {
      const r = await criarProjeto(montar(confirmar))
      if (r.tipo === 'duplicidade') {
        setSimilares(r.similares)
        return
      }
      setSimilares(null)
      toast.success('Projeto cadastrado.')
      navigate(`/projetos/${r.id}`)
    } catch (err) {
      const campos = extractFieldErrors(err)
      setErros(campos)
      toast.error(
        Object.keys(campos).length ? 'Revise os campos destacados.' : getErrorMessage(err),
      )
    } finally {
      setSalvando(false)
    }
  }

  const campoCls = (campo: string) =>
    erros[campo] ? 'border-red-500 focus-visible:ring-red-400' : ''
  const Erro = ({ campo }: { campo: string }) =>
    erros[campo] ? <p className="text-xs text-red-600 mt-1">{erros[campo]}</p> : null

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Novo projeto</h1>
        <p className="text-sm text-slate-500">
          Todos os campos são obrigatórios, exceto o link de entrada.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          void salvar(false)
        }}
        className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="np-nome">Nome do projeto</Label>
            <Input
              id="np-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={200}
              className={campoCls('nome')}
            />
            <Erro campo="nome" />
          </div>

          <div>
            <Label>Cliente</Label>
            <Select value={clienteSel} onValueChange={setClienteSel}>
              <SelectTrigger className={campoCls('cliente')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOVO_CLIENTE}>Informar cliente pelo nome…</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clienteSel === NOVO_CLIENTE && (
              <Input
                className={`mt-2 ${campoCls('cliente')}`}
                placeholder="Nome do cliente"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                maxLength={200}
              />
            )}
            <Erro campo="cliente" />
          </div>

          <div>
            <Label htmlFor="np-tipologia">Tipologia</Label>
            <Input
              id="np-tipologia"
              value={tipologia}
              onChange={(e) => setTipologia(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Residencial multifamiliar"
              className={campoCls('tipologia')}
            />
            <Erro campo="tipologia" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="np-local">Local</Label>
            <Input
              id="np-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              maxLength={300}
              placeholder="Endereço ou identificação do local"
              className={campoCls('local')}
            />
            <Erro campo="local" />
          </div>

          <div>
            <Label htmlFor="np-prazo">Prazo</Label>
            <Input
              id="np-prazo"
              type="date"
              min={hojeBR()}
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className={campoCls('prazo')}
            />
            <Erro campo="prazo" />
          </div>

          <div>
            <Label>Prioridade inicial</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {role === 'admin' && (
            <div>
              <Label>Coordenador</Label>
              <Select value={coordenador} onValueChange={setCoordenador}>
                <SelectTrigger className={campoCls('coordenador')}>
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {coordenadores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Erro campo="coordenador" />
            </div>
          )}

          <div className="sm:col-span-2">
            <Label htmlFor="np-link">Link de entrada (opcional)</Label>
            <Input
              id="np-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
              className={campoCls('link_entrada')}
            />
            <p className="text-xs text-slate-500 mt-1">
              Somente https:// com nome de domínio. O sistema não acessa o link; ele só fica
              registrado.
            </p>
            <Erro campo="link_entrada" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Disciplinas e responsáveis</Label>
          {linhas.map((l, i) => (
            <div key={l.chave} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              <Select
                value={l.disciplina || undefined}
                onValueChange={(v) =>
                  setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, disciplina: v } : x)))
                }
              >
                <SelectTrigger className={`sm:w-56 ${campoCls('disciplinas')}`}>
                  <SelectValue placeholder="Disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                  <SelectItem value={OUTRA}>Outra (digitar)…</SelectItem>
                </SelectContent>
              </Select>
              {l.disciplina === OUTRA && (
                <Input
                  className={`sm:w-56 ${campoCls('disciplinas')}`}
                  placeholder="Nome da disciplina"
                  value={l.livre}
                  maxLength={80}
                  autoFocus
                  onChange={(e) =>
                    setLinhas(
                      linhas.map((x) =>
                        x.chave === l.chave ? { ...x, livre: e.target.value } : x,
                      ),
                    )
                  }
                />
              )}
              <Select
                value={l.responsavel}
                onValueChange={(v) =>
                  setLinhas(linhas.map((x) => (x.chave === l.chave ? { ...x, responsavel: v } : x)))
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HERDAR}>Herdar do coordenador ({nomeCoordenador})</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linhas.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover disciplina ${i + 1}`}
                  onClick={() => setLinhas(linhas.filter((x) => x.chave !== l.chave))}
                >
                  <Trash2 className="w-4 h-4 text-slate-500" />
                </Button>
              )}
            </div>
          ))}
          <Erro campo="disciplinas" />
          <p className="text-xs text-slate-500">
            Não encontrou a disciplina? Escolha “Outra (digitar)…”. Ela fica disponível para os
            próximos projetos.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() =>
              setLinhas([
                ...linhas,
                { chave: Date.now(), disciplina: '', livre: '', responsavel: HERDAR },
              ])
            }
          >
            <Plus className="w-4 h-4" /> Disciplina
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando} className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
            {salvando ? 'Salvando…' : 'Cadastrar projeto'}
          </Button>
        </div>
      </form>

      <Dialog open={similares !== null} onOpenChange={(o) => !o && setSimilares(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Possível projeto duplicado
            </DialogTitle>
            <DialogDescription>
              Já existe projeto com o mesmo cliente e tipologia, e mesmo local ou nome. Nada foi
              salvo ainda.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {(similares || []).map((s, i) =>
              s.visivel && s.id ? (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3"
                >
                  <span>
                    <span className="font-medium text-slate-800">{s.nome}</span>
                    <span className="block text-xs text-slate-500">{s.local}</span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/projetos/${s.id}`)}>
                    Abrir
                  </Button>
                </li>
              ) : (
                <li
                  key={`oculto-${i}`}
                  className="border border-slate-200 rounded-lg p-3 text-slate-500"
                >
                  Um projeto semelhante ao qual você não tem acesso.
                </li>
              ),
            )}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimilares(null)}>
              Voltar e revisar
            </Button>
            <Button
              onClick={() => void salvar(true)}
              disabled={salvando}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Cadastrar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
