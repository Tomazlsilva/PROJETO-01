// SPEC-1-008 (T1.46/T1.47) — importação do Planner "CRONOGRAMA" (últimos 45 dias).
// Simulação primeiro: total, aceitas e rejeitadas com o motivo de cada linha, projetos que
// já existem e os que serão criados, e a correspondência de nomes (o administrador revisa).
// Só grava depois da confirmação, em um lote que pode ser desfeito.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Upload, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { listAtribuiveis, type PessoaAtribuivel } from '@/services/projetos'
import { TIPO_LABEL, dataBR, type TipoEntrega } from '@/services/entregas'

interface Linha {
  id: string
  item: string
  tipo: TipoEntrega
  data: string
  pessoas: string[]
  entregue: boolean
  art_pendente: boolean
  situacao: 'aceita' | 'rejeitada'
  erro: string
  gravada: boolean
}
interface Cartao {
  cartao_id: string
  nome: string
  balde: string
  criado_por: string
  disciplinas: string[]
  projeto: { id: string; nome: string } | null
  linhas: Linha[]
}
interface Simulacao {
  lote: {
    id: string
    status: 'simulado' | 'gravado' | 'desfeito'
    exportado_em: string
    inicio_recorte: string
    gravado_em: string
    desfeito_em: string
    resumo: Record<string, unknown>
  } | null
  totais?: {
    linhas: number
    aceitas: number
    rejeitadas: number
    cartoes: number
    projetos_existentes: number
    projetos_novos: number
    nomes_sem_usuario: number
  }
  nomes?: { nome: string; ocorrencias: number; usuario: { id: string; nome: string } | null }[]
  cartoes?: Cartao[]
}

const SEM = '__texto__'
const ano = (d: string) => (d ? `${dataBR(d)}/${d.slice(0, 4)}` : '—')

export default function ImportarPlanner() {
  const [s, setS] = useState<Simulacao | null>(null)
  const [pessoas, setPessoas] = useState<PessoaAtribuivel[]>([])
  const [filtro, setFiltro] = useState('')
  const [so, setSo] = useState<'todas' | 'aceita' | 'rejeitada'>('todas')
  const [confirmar, setConfirmar] = useState<'gravar' | 'desfazer' | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    pb.send<Simulacao>('/backend/v1/importacao/planner', { method: 'GET', requestKey: null })
      .then(setS)
      .catch((err) => toast.error(getErrorMessage(err)))
  }, [])
  useEffect(() => {
    carregar()
    listAtribuiveis()
      .then(setPessoas)
      .catch(() => setPessoas([]))
  }, [carregar])

  const cartoes = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return (s?.cartoes || [])
      .filter((c) => !f || c.nome.toLowerCase().includes(f))
      .map((c) => ({ ...c, linhas: c.linhas.filter((l) => so === 'todas' || l.situacao === so) }))
      .filter((c) => c.linhas.length > 0)
  }, [s, filtro, so])

  const mapear = async (nome: string, usuario: string) => {
    try {
      await pb.send('/backend/v1/importacao/planner/nomes', {
        method: 'POST',
        body: { nome, usuario: usuario === SEM ? '' : usuario },
      })
      carregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }
  const executar = async (acao: 'gravar' | 'desfazer') => {
    setOcupado(true)
    try {
      const r = await pb.send<Record<string, number | string>>(
        `/backend/v1/importacao/planner/${acao}`,
        {
          method: 'POST',
          body: { confirmar: true },
        },
      )
      toast.success(
        acao === 'gravar'
          ? `Importado: ${r.entregas} entregas, ${r.projetos_criados} projetos novos.`
          : `Desfeito: ${r.entregas_removidas} entregas removidas, ${r.entregas_mantidas} mantidas (já mexidas).`,
      )
      setConfirmar(null)
      carregar()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setOcupado(false)
    }
  }

  if (!s) return <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
  if (!s.lote)
    return <p className="text-sm text-slate-500">Nenhuma exportação do Planner carregada.</p>
  const t = s.totais!
  const st = s.lote.status

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Importar Planner</h1>
          <p className="text-sm text-slate-500">
            CRONOGRAMA exportado em {ano(s.lote.exportado_em)} · recorte desde{' '}
            {ano(s.lote.inicio_recorte)} (45 dias) mais os itens futuros dos cartões abertos.
          </p>
          <p className="text-sm mt-1">
            Situação:{' '}
            <span className="font-semibold">
              {st === 'simulado'
                ? 'simulação (nada gravado)'
                : st === 'gravado'
                  ? 'gravado'
                  : 'desfeito'}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {st === 'simulado' && (
            <Button
              className="bg-[#1E3A8A] hover:bg-[#1E2A6B] gap-1.5"
              onClick={() => setConfirmar('gravar')}
            >
              <Upload className="w-4 h-4" /> Gravar importação
            </Button>
          )}
          {st === 'gravado' && (
            <Button
              variant="outline"
              className="gap-1.5 text-red-600"
              onClick={() => setConfirmar('desfazer')}
            >
              <Undo2 className="w-4 h-4" /> Desfazer lote
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Linhas', t.linhas],
          ['Aceitas', t.aceitas],
          ['Rejeitadas', t.rejeitadas],
          ['Cartões', t.cartoes],
          ['Projetos já na Central', t.projetos_existentes],
          ['Projetos a criar', t.projetos_novos],
          ['Nomes sem usuário', t.nomes_sem_usuario],
        ].map(([r, v]) => (
          <div key={r as string} className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-500 font-semibold">{r}</div>
            <div className="text-2xl font-extrabold text-[#1E3A8A]">{v}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <h2 className="font-bold text-slate-900">Correspondência de nomes</h2>
        <p className="text-xs text-slate-500">
          Nome como aparece no Planner → pessoa da Central. Sem pessoa, o nome fica como texto no
          card.
          {st === 'gravado' &&
            ' Com o lote já gravado, mudar aqui corrige na hora as pessoas das entregas importadas.'}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(s.nomes || []).map((n) => (
            <div key={n.nome} className="flex items-center gap-2">
              <span className="w-36 truncate text-sm" title={n.nome}>
                {n.nome} <span className="text-slate-400">({n.ocorrencias})</span>
              </span>
              <Select
                value={n.usuario?.id || SEM}
                disabled={st === 'desfeito'}
                onValueChange={(v) => mapear(n.nome, v)}
              >
                <SelectTrigger className={`h-8 flex-1 ${n.usuario ? '' : 'text-slate-400'}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Fica como texto</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar cartão"
          className="h-9 w-56"
        />
        {(['todas', 'aceita', 'rejeitada'] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={so === k ? 'default' : 'outline'}
            onClick={() => setSo(k)}
          >
            {k === 'todas' ? 'Todas' : k === 'aceita' ? 'Aceitas' : 'Rejeitadas'}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {cartoes.map((c) => (
          <div key={c.cartao_id} className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold text-slate-800">{c.nome}</div>
              <div className="text-xs text-slate-500">
                {c.balde} · criado por {c.criado_por || '—'} ·{' '}
                {c.projeto ? (
                  <span className="text-emerald-700">
                    vai para o projeto existente “{c.projeto.nome}”
                  </span>
                ) : (
                  <span className="text-amber-700">projeto novo</span>
                )}
                {c.disciplinas.length ? ' · ' + c.disciplinas.join(', ') : ''}
              </div>
            </div>
            <table className="w-full text-xs mt-2">
              <tbody className="divide-y divide-slate-100">
                {c.linhas.map((l) => (
                  <tr key={l.id} className={l.situacao === 'aceita' ? '' : 'text-red-700'}>
                    <td className="py-1 pr-2 w-20">{ano(l.data)}</td>
                    <td className="py-1 pr-2 w-20">{TIPO_LABEL[l.tipo] || l.tipo}</td>
                    <td className="py-1 pr-2">{l.item}</td>
                    <td className="py-1 pr-2 text-slate-500">{l.pessoas.join(', ')}</td>
                    <td className="py-1 pr-2 w-28">
                      {l.situacao === 'aceita'
                        ? (l.entregue ? 'entregue' : 'em aberto') + (l.art_pendente ? ' · ART' : '')
                        : l.erro}
                    </td>
                    <td className="py-1 w-16 text-emerald-700">{l.gravada ? 'gravada' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmar === 'gravar' ? 'Gravar a importação?' : 'Desfazer o lote?'}
            </DialogTitle>
            <DialogDescription>
              {confirmar === 'gravar'
                ? `Serão gravadas ${t.aceitas} entregas no calendário e criados ${t.projetos_novos} projetos. As ${t.rejeitadas} linhas rejeitadas ficam de fora. Dá para desfazer depois.`
                : 'As entregas do lote que ninguém mexeu (sem histórico nem horas) serão removidas; os projetos criados que ficarem vazios serão arquivados.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado}
              className={
                confirmar === 'gravar'
                  ? 'bg-[#1E3A8A] hover:bg-[#1E2A6B]'
                  : 'bg-red-600 hover:bg-red-700'
              }
              onClick={() => confirmar && executar(confirmar)}
            >
              {ocupado ? 'Processando…' : confirmar === 'gravar' ? 'Gravar' : 'Desfazer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
