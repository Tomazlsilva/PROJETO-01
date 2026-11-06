// SPEC-1-008 (T1.44) — indicadores de entregas: entregas por dia/semana/tipo, carga por
// pessoa (sem ranking), revisões depois da Final, ciclos prévia→final e final→revisões
// (dias corridos e úteis), horas por entrega/tipo/pessoa e apontamentos fora da janela.
// Cada número abre os registros que o compõem e pode ser exportado em CSV (auditado).
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import pb from '@/lib/pocketbase/client'
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
import { dataBR, horasTxt, hojeBR, somaDias } from '@/services/entregas'

type Par = { chave: string; valor: number }
interface Resumo {
  periodo: { de: string; ate: string }
  escopo: 'equipe' | 'todos'
  entregas: { total: number; entregues: number; por_tipo: Par[]; por_semana: Par[]; por_dia: Par[] }
  carga: { pessoa: string; dias_em_janela: number; entregas_em_aberto: number }[]
  revisoes: { total: number; por_cliente: Par[]; por_disciplina: Par[]; por_projeto: Par[] }
  ciclos: {
    projetos: number
    previa_final_dias: number | null
    previa_final_uteis: number | null
    final_revisoes_dias: number | null
    final_revisoes_uteis: number | null
  }
  horas: {
    total_seg: number
    por_tipo: { chave: string; seg: number }[]
    por_pessoa: { chave: string; seg: number }[]
    entregues: number
    entregues_com_apontamento: number
    situacao: 'conclusivo' | 'inconclusivo' | 'sem_dados'
    motivo: string
  }
  fora_janela: { total: number; seg: number }
}

const ROTULO: Record<string, string> = {
  entregas: 'Entregas do período',
  carga: 'Carga por pessoa',
  revisoes: 'Revisões depois da Final',
  ciclos: 'Ciclos por projeto',
  horas: 'Apontamentos nas entregas',
  fora_janela: 'Apontamentos fora da janela',
}

const url = (p: Record<string, string>) =>
  '/backend/v1/painel/entregas?' + new URLSearchParams(p).toString()

async function exportar(metrica: string, de: string, ate: string) {
  const res = await fetch(pb.buildURL(url({ metrica, de, ate, formato: 'csv' })), {
    headers: { Authorization: pb.authStore.token },
  })
  if (!res.ok) throw new Error('Não foi possível exportar.')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(await res.blob())
  a.download = `entregas-${metrica}-${de}-${ate}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

const dias = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR') + ' d')

export default function PainelEntregas() {
  const [de, setDe] = useState(somaDias(hojeBR(), -29))
  const [ate, setAte] = useState(hojeBR())
  const [r, setR] = useState<Resumo | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [itens, setItens] = useState<Record<string, unknown>[] | null>(null)

  const carregar = useCallback(() => {
    setR(null)
    pb.send<Resumo>(url({ de, ate }), { method: 'GET', requestKey: null })
      .then(setR)
      .catch((err) => toast.error(getErrorMessage(err)))
  }, [de, ate])
  useEffect(() => carregar(), [carregar])

  const abrir = (m: string) => {
    setAberta(m)
    setItens(null)
    pb.send<{ itens: Record<string, unknown>[] }>(url({ metrica: m, de, ate }), {
      method: 'GET',
      requestKey: null,
    })
      .then((x) => setItens(x.itens))
      .catch((err) => toast.error(getErrorMessage(err)))
  }

  const Bloco = ({
    m,
    titulo,
    valor,
    children,
  }: {
    m: string
    titulo: string
    valor: string
    children?: ReactNode
  }) => (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">{titulo}</div>
          <button
            className="text-2xl font-extrabold text-[#1E3A8A] hover:underline"
            onClick={() => abrir(m)}
          >
            {valor}
          </button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          title="Exportar CSV"
          onClick={() => exportar(m, de, ate).catch((err) => toast.error(getErrorMessage(err)))}
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>
      <div className="text-sm text-slate-600">{children}</div>
    </div>
  )
  const Lista = ({
    pares,
    fmt,
  }: {
    pares: { chave: string; n: number }[]
    fmt?: (n: number) => string
  }) => (
    <ul className="space-y-0.5">
      {pares.length === 0 && <li className="text-slate-400">sem registros</li>}
      {pares.map((p) => (
        <li key={p.chave} className="flex justify-between gap-2">
          <span className="truncate">{p.chave || '—'}</span>
          <span className="tabular-nums">{fmt ? fmt(p.n) : p.n}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Entregas</h1>
          <p className="text-sm text-slate-500">
            {r?.escopo === 'equipe' ? 'Projetos que você coordena.' : 'Todos os projetos.'} Clique
            em um número para ver os registros que o compõem.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </div>

      {!r ? (
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Bloco m="entregas" titulo="Entregas" valor={String(r.entregas.total)}>
            <div className="mb-1">{r.entregas.entregues} marcadas como entregues</div>
            <Lista pares={r.entregas.por_tipo.map((p) => ({ chave: p.chave, n: p.valor }))} />
            <div className="mt-2 text-xs font-semibold text-slate-500">Por semana</div>
            <Lista
              pares={r.entregas.por_semana.map((p) => ({
                chave: 'semana de ' + dataBR(p.chave),
                n: p.valor,
              }))}
            />
          </Bloco>
          <Bloco m="carga" titulo="Carga por pessoa" valor={String(r.carga.length) + ' pessoas'}>
            <ul className="space-y-0.5">
              {r.carga.map((c) => (
                <li key={c.pessoa} className="flex justify-between gap-2">
                  <span className="truncate">{c.pessoa}</span>
                  <span className="tabular-nums text-xs">
                    {c.dias_em_janela} d em janela · {c.entregas_em_aberto} em aberto
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
          <Bloco m="revisoes" titulo="Revisões depois da Final" valor={String(r.revisoes.total)}>
            <div className="text-xs font-semibold text-slate-500">Por cliente</div>
            <Lista pares={r.revisoes.por_cliente.map((p) => ({ chave: p.chave, n: p.valor }))} />
            <div className="mt-2 text-xs font-semibold text-slate-500">Por disciplina</div>
            <Lista pares={r.revisoes.por_disciplina.map((p) => ({ chave: p.chave, n: p.valor }))} />
          </Bloco>
          <Bloco m="ciclos" titulo="Ciclo médio" valor={`${r.ciclos.projetos} projetos`}>
            <div className="flex justify-between">
              <span>Prévia → Final</span>
              <span>
                {dias(r.ciclos.previa_final_dias)} · {dias(r.ciclos.previa_final_uteis)} úteis
              </span>
            </div>
            <div className="flex justify-between">
              <span>Final → última revisão</span>
              <span>
                {dias(r.ciclos.final_revisoes_dias)} · {dias(r.ciclos.final_revisoes_uteis)} úteis
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Dias úteis descontam fins de semana e feriados.
            </p>
          </Bloco>
          <Bloco m="horas" titulo="Horas nas entregas" valor={horasTxt(r.horas.total_seg)}>
            <div
              className={`text-xs mb-1 ${r.horas.situacao === 'conclusivo' ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              {r.horas.situacao === 'conclusivo'
                ? `Conclusivo: ${r.horas.entregues_com_apontamento} de ${r.horas.entregues} entregas concluídas com horas.`
                : r.horas.situacao === 'inconclusivo'
                  ? `Inconclusivo — ${r.horas.motivo}`
                  : r.horas.motivo}
            </div>
            <Lista
              pares={r.horas.por_tipo.map((p) => ({ chave: p.chave, n: p.seg }))}
              fmt={horasTxt}
            />
            <div className="mt-2 text-xs font-semibold text-slate-500">Por pessoa</div>
            <Lista
              pares={r.horas.por_pessoa.map((p) => ({ chave: p.chave, n: p.seg }))}
              fmt={horasTxt}
            />
          </Bloco>
          <Bloco m="fora_janela" titulo="Fora da janela" valor={String(r.fora_janela.total)}>
            {horasTxt(r.fora_janela.seg)} apontadas fora da janela de execução combinada.
          </Bloco>
        </div>
      )}

      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{aberta ? ROTULO[aberta] : ''}</DialogTitle>
            <DialogDescription>
              {dataBR(de)}/{de.slice(0, 4)} a {dataBR(ate)}/{ate.slice(0, 4)} ·{' '}
              {itens?.length ?? '…'} registros
            </DialogDescription>
          </DialogHeader>
          {!itens ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : itens.length === 0 ? (
            <p className="text-sm text-slate-500">Sem registros no período.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  {Object.keys(itens[0])
                    .filter((k) => !k.endsWith('_id'))
                    .map((k) => (
                      <th key={k} className="px-2 py-1 whitespace-nowrap">
                        {k.replace(/_/g, ' ')}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((it, i) => (
                  <tr key={i}>
                    {Object.keys(itens[0])
                      .filter((k) => !k.endsWith('_id'))
                      .map((k) => {
                        const v = it[k]
                        return (
                          <td key={k} className="px-2 py-1 whitespace-nowrap">
                            {typeof v === 'boolean'
                              ? v
                                ? 'sim'
                                : ''
                              : k === 'duracao_seg'
                                ? horasTxt(Number(v))
                                : v === null || v === undefined
                                  ? '—'
                                  : String(v)}
                          </td>
                        )
                      })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
