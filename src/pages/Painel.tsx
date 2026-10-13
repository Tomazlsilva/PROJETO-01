import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Download, Gauge, Info, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { hojeBR, listDisciplinas, listMeusProjetos } from '@/services/projetos'
import {
  exportarCsv,
  getPainel,
  getRegistros,
  horas,
  pct,
  type FiltrosPainel,
  type ResumoPainel,
  type Situacao,
} from '@/services/painel'

const somaDias = (d: string, n: number) =>
  new Date(new Date(d + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10)

const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

const PAPEL: Record<string, string> = {
  admin: 'Administrador',
  coordenador: 'Coordenador',
  projetista: 'Projetista',
  revisor: 'Revisor',
  executivo: 'Executivo',
  sem_papel: 'Sem papel',
}

// SPEC-1-007: painel somente leitura. Cada número abre os registros que o compõem;
// sem dados aparece como "sem dados" (nunca zero) e abaixo de 80% como "inconclusivo".
export default function Painel() {
  const hoje = hojeBR()
  const [form, setForm] = useState<FiltrosPainel>({ de: somaDias(hoje, -29), ate: hoje })
  const [filtros, setFiltros] = useState<FiltrosPainel>(form)
  const [dados, setDados] = useState<ResumoPainel | null>(null)
  const [erro, setErro] = useState('')
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([])
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])
  const [drill, setDrill] = useState<{ metrica: string; titulo: string } | null>(null)

  useEffect(() => {
    listMeusProjetos()
      .then((l) => setProjetos(l.map((p) => ({ id: p.id, nome: p.nome }))))
      .catch(() => setProjetos([]))
    listDisciplinas()
      .then((l) => setDisciplinas(l.map((d) => ({ id: d.id, nome: d.nome }))))
      .catch(() => setDisciplinas([]))
  }, [])

  const carregar = useCallback(async () => {
    setErro('')
    try {
      setDados(await getPainel(filtros))
    } catch (err) {
      setDados(null)
      setErro(getErrorMessage(err))
    }
  }, [filtros])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const abrir = (metrica: string, titulo: string) => setDrill({ metrica, titulo })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-[#1E3A8A]" /> Painel
          </h1>
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Somente leitura ·{' '}
            {dados?.escopo === 'equipe' ? 'projetos que você coordena' : 'todos os projetos'} ·
            clique em um número para ver os registros
          </p>
        </div>
      </div>

      <form
        className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 md:grid-cols-6 gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault()
          setFiltros({ ...form })
        }}
      >
        <div>
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={form.de}
            onChange={(e) => setForm({ ...form, de: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            value={form.ate}
            onChange={(e) => setForm({ ...form, ate: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Projeto</Label>
          <select
            className={selectCls}
            value={form.projeto || ''}
            onChange={(e) => setForm({ ...form, projeto: e.target.value })}
          >
            <option value="">Todos</option>
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Disciplina</Label>
          <select
            className={selectCls}
            value={form.disciplina || ''}
            onChange={(e) => setForm({ ...form, disciplina: e.target.value })}
          >
            <option value="">Todas</option>
            {disciplinas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Etapa</Label>
          <select
            className={selectCls}
            value={form.etapa || ''}
            onChange={(e) => setForm({ ...form, etapa: e.target.value })}
          >
            <option value="">Todas</option>
            {(dados?.etapas || []).map((et) => (
              <option key={et.chave} value={et.chave}>
                {et.nome}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
          Aplicar
        </Button>
      </form>

      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {erro}
        </div>
      )}
      {!dados && !erro && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}

      {dados && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Numero
              rotulo="Projetos"
              valor={String(dados.projetos.valor)}
              onClick={() => abrir('projetos', 'Projetos')}
            />
            <Numero
              rotulo="Atrasados"
              valor={String(dados.atrasados.valor)}
              destaque={dados.atrasados.valor > 0 ? 'red' : undefined}
              onClick={() => abrir('atrasados', 'Disciplinas atrasadas')}
            />
            <Numero
              rotulo="Bloqueados"
              valor={String(dados.bloqueados.valor)}
              extra={dados.bloqueados.vencidos ? `${dados.bloqueados.vencidos} vencido(s)` : ''}
              destaque={dados.bloqueados.valor > 0 ? 'amber' : undefined}
              onClick={() => abrir('bloqueados', 'Disciplinas bloqueadas')}
            />
            <Numero
              rotulo="Movimentações no período"
              valor={
                dados.movimentacoes.valor === null ? 'Sem dados' : String(dados.movimentacoes.valor)
              }
              onClick={() => abrir('movimentacoes', 'Movimentações no período')}
            />
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Disciplinas por etapa</h2>
            <div className="flex flex-wrap gap-2">
              {dados.etapas
                .filter((et) => et.ativa || et.valor > 0)
                .map((et) => (
                  <button
                    key={et.chave}
                    type="button"
                    onClick={() => abrir('etapa:' + et.chave, 'Etapa: ' + et.nome)}
                    className="px-3 py-2 rounded-lg border border-slate-200 hover:border-[#1E3A8A] hover:bg-blue-50 text-left"
                  >
                    <div className="text-xs text-slate-500">{et.nome}</div>
                    <div className="text-lg font-bold tabular-nums text-slate-900">{et.valor}</div>
                  </button>
                ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Indicador
              titulo="Completude dos apontamentos"
              situacao={dados.completude.situacao}
              motivo={dados.completude.motivo}
              valor={pct(dados.completude.taxa)}
              detalhe={`${dados.completude.preenchidos} de ${dados.completude.esperados} etapas concluídas com tempo apontado`}
              onClick={() => abrir('completude', 'Completude — etapas concluídas')}
            />
            <Indicador
              titulo="Adoção"
              situacao={dados.adocao.situacao}
              motivo={dados.adocao.motivo}
              valor={pct(dados.adocao.taxa)}
              detalhe={
                dados.adocao.ativos === null
                  ? `${dados.adocao.vinculados} pessoa(s) vinculada(s)`
                  : `${dados.adocao.ativos} de ${dados.adocao.vinculados} pessoas vinculadas usaram no período`
              }
              onClick={() => abrir('adocao', 'Adoção — pessoas vinculadas')}
            >
              {Object.keys(dados.adocao.por_papel).length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {Object.entries(dados.adocao.por_papel).map(([p, v]) => (
                    <li key={p} className="flex justify-between">
                      <span>{PAPEL[p] || p}</span>
                      <span className="tabular-nums">
                        {v.ativos}/{v.vinculados} · {pct(v.taxa)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Indicador>
            <Indicador
              titulo="Touch time"
              situacao={dados.touch_time.situacao}
              motivo={dados.touch_time.motivo}
              valor={horas(dados.touch_time.touch_seg)}
              detalhe={`Elaboração ${horas(dados.touch_time.elaboracao_seg)} · Revisão ${horas(dados.touch_time.revisao_seg)} · Espera (à parte) ${horas(dados.touch_time.espera_seg)}`}
              onClick={() => abrir('touch_time', 'Touch time — apontamentos')}
            />
          </div>

          {dados.carga && (
            <section className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">Carga por responsável</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrir('carga', 'Carga — disciplinas em aberto')}
                >
                  Ver registros
                </Button>
              </div>
              {dados.carga.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma disciplina em aberto.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        <th className="py-1 pr-3">Responsável</th>
                        <th className="py-1 pr-3 text-right">Em aberto</th>
                        <th className="py-1 pr-3 text-right">Atrasadas</th>
                        <th className="py-1 text-right">Bloqueadas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dados.carga.map((c, i) => (
                        <tr key={c.responsavel?.id || 'sem-' + i}>
                          <td className="py-1.5 pr-3">
                            {c.responsavel?.nome || 'Sem responsável'}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{c.valor}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{c.atrasados}</td>
                          <td className="py-1.5 text-right tabular-nums">{c.bloqueados}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <p className="text-xs text-slate-500 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Indicadores com menos de 80% de
            completude ou adoção aparecem como inconclusivos e não devem ser usados para conclusões.
            A adoção mostra só totais por papel — não há ranking de pessoas.
          </p>
        </>
      )}

      {drill && dados && (
        <DrillDialog
          metrica={drill.metrica}
          titulo={drill.titulo}
          filtros={filtros}
          podeExportar={dados.pode_exportar}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  extra,
  destaque,
  onClick,
}: {
  rotulo: string
  valor: string
  extra?: string
  destaque?: 'red' | 'amber'
  onClick: () => void
}) {
  const cor =
    destaque === 'red' ? 'text-red-700' : destaque === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-[#1E3A8A] transition-colors"
    >
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${cor}`}>{valor}</div>
      {extra && <div className="text-xs text-red-700 mt-0.5">{extra}</div>}
    </button>
  )
}

function Selo({ s }: { s: Situacao }) {
  const m = {
    conclusivo: ['Conclusivo', 'bg-green-50 text-green-700 border-green-200'],
    inconclusivo: ['Inconclusivo', 'bg-amber-50 text-amber-800 border-amber-200'],
    sem_dados: ['Sem dados', 'bg-slate-50 text-slate-600 border-slate-200'],
  }[s]
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${m[1]}`}>{m[0]}</span>
  )
}

function Indicador({
  titulo,
  situacao,
  motivo,
  valor,
  detalhe,
  onClick,
  children,
}: {
  titulo: string
  situacao: Situacao
  motivo: string
  valor: string
  detalhe: string
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
        <Selo s={situacao} />
      </div>
      <button type="button" onClick={onClick} className="text-left mt-2 group">
        <div
          className={`text-2xl font-extrabold tabular-nums group-hover:text-[#1E3A8A] ${
            situacao === 'conclusivo' ? 'text-slate-900' : 'text-slate-400'
          }`}
        >
          {situacao === 'sem_dados' ? 'Sem dados' : valor}
        </div>
        <div className="text-xs text-slate-500">{detalhe}</div>
      </button>
      {motivo && <p className="text-xs text-amber-800 mt-1">{motivo}</p>}
      {children}
    </section>
  )
}

const ROTULO: Record<string, string> = {
  projeto: 'Projeto',
  disciplina: 'Disciplina',
  etapa: 'Etapa',
  etapa_nome: 'Etapa',
  responsavel: 'Responsável',
  prazo: 'Prazo',
  atrasado: 'Atrasado',
  bloqueado: 'Bloqueado',
  bloqueio_vencido: 'Bloqueio vencido',
  prioridade: 'Prioridade',
  preenchido: 'Com apontamento',
  papel: 'Papel',
  ativo: 'Usou no período',
  categoria: 'Categoria',
  duracao_seg: 'Duração (s)',
  quando: 'Quando',
  de: 'De',
  para: 'Para',
  autor: 'Autor',
  cards: 'Disciplinas',
  coordenador: 'Coordenador',
  nome: 'Nome',
}

const plano = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('nome' in o) return String(o.nome)
    return JSON.stringify(v)
  }
  return String(v)
}

function DrillDialog({
  metrica,
  titulo,
  filtros,
  podeExportar,
  onClose,
}: {
  metrica: string
  titulo: string
  filtros: FiltrosPainel
  podeExportar: boolean
  onClose: () => void
}) {
  const [dados, setDados] = useState<{ total: number; itens: Record<string, unknown>[] } | null>(
    null,
  )
  const [erro, setErro] = useState('')
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    getRegistros(metrica, filtros)
      .then(setDados)
      .catch((err) => setErro(getErrorMessage(err)))
  }, [metrica, filtros])

  const colunas =
    dados && dados.itens.length > 0
      ? Object.keys(dados.itens[0]).filter((k) => !k.endsWith('_id') && k !== 'id' && k !== 'card')
      : []

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Período {filtros.de?.split('-').reverse().join('/')} a{' '}
            {filtros.ate?.split('-').reverse().join('/')} · {dados ? dados.total : '…'} registro(s)
          </DialogDescription>
        </DialogHeader>
        {podeExportar && (
          <div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={exportando || !dados}
              onClick={async () => {
                setExportando(true)
                try {
                  await exportarCsv(metrica, filtros)
                  toast.success('CSV gerado. A exportação foi registrada na auditoria.')
                } catch (err) {
                  toast.error(getErrorMessage(err))
                } finally {
                  setExportando(false)
                }
              }}
            >
              <Download className="w-4 h-4" /> Exportar CSV
            </Button>
          </div>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        {!dados && !erro && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        {dados && dados.itens.length === 0 && (
          <p className="text-sm text-slate-500">Nenhum registro neste recorte.</p>
        )}
        {dados && dados.itens.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left">
                <tr>
                  {colunas.map((c) => (
                    <th key={c} className="px-2 py-1.5 whitespace-nowrap">
                      {ROTULO[c] || c.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dados.itens.map((it, i) => (
                  <tr key={i}>
                    {colunas.map((c) => (
                      <td key={c} className="px-2 py-1.5">
                        {plano(it[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
