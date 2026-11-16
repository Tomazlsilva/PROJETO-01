// SPEC-2-005 — Acompanhamento › Qualidade: K2 (conforme na 1ª revisão), K3 (correções após
// emissão), retorno para correção e rodadas até aprovar, com filtros, drill-down e CSV.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, RefreshCw, Settings2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarData } from '@/services/projetos'
import {
  getQualidade,
  salvarLimiares,
  type FiltrosQualidade,
  type GrupoQualidade,
  type PainelQualidade,
} from '@/services/qualidade'

const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800'
const RES: Record<string, string> = {
  conforme: 'Conforme',
  nao_conforme: 'Não conforme',
  nao_se_aplica: 'Não se aplica',
  excecao: 'Exceção técnica',
  sem_marcacao: 'Sem marcação',
  aprovado: 'Aprovado',
  aprovado_com_excecao: 'Aprovado com exceção',
  reprovado: 'Devolvido',
}
const ORIGEM: Record<string, string> = { cliente: 'Cliente', obra: 'Obra', interna: 'Interna' }
const SEV: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }
const num = (v: number | null, suf = '') =>
  v === null ? '—' : `${String(v).replace('.', ',')}${suf}`
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)
const diasAtras = (n: number) =>
  new Date(Date.now() - 3 * 3600000 - n * 86400000).toISOString().slice(0, 10)

type Detalhe = 'k2' | 'k3' | 'retorno' | 'rodadas'

export default function Qualidade() {
  const [f, setF] = useState<FiltrosQualidade>({ inicio: diasAtras(90), fim: hoje() })
  const [d, setD] = useState<PainelQualidade | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [detalhe, setDetalhe] = useState<Detalhe>('k2')
  const [config, setConfig] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setD(await getQualidade(f))
      setErro('')
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [f])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const exportar = () => {
    if (!d) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const L: unknown[][] = []
    const t = d.total
    L.push([
      'Filtros',
      `período ${d.filtros.inicio || '—'} a ${d.filtros.fim || '—'}`,
      `projeto ${d.filtros.projeto || 'todos'}`,
      `disciplina ${d.filtros.disciplina || 'todas'}`,
      `pessoa ${d.filtros.pessoa || 'todas'}`,
      `tipologia ${d.filtros.tipologia || 'todas'}`,
    ])
    L.push([])
    L.push(['Indicador', 'Valor', 'Numerador', 'Denominador', 'Amostra', 'Situação'])
    L.push([
      'K2 (conforme na 1ª revisão)',
      num(t.k2, '%'),
      t.conformes,
      t.aplicaveis,
      `${t.disciplinas_revisadas} disciplinas`,
      t.k2_inconclusivo ? `inconclusivo (${t.disciplinas_revisadas} de ${d.limiares.k2})` : 'ok',
    ])
    L.push(['K2 fora da conta: não se aplica', t.na])
    L.push(['K2 fora da conta: exceção técnica', t.excecoes])
    L.push([
      'K3 (correções válidas por disciplina emitida)',
      num(t.k3),
      t.correcoes_validas,
      t.emitidas,
      `${t.emitidas} disciplinas emitidas`,
      t.k3_inconclusivo ? `inconclusivo (${t.emitidas} de ${d.limiares.k3})` : 'ok',
    ])
    L.push(['Retorno para correção', num(t.retorno, '%'), t.reprovadas, t.rodadas])
    L.push(['Rodadas até aprovar (média)', num(t.rodadas_ate_aprovar), '', t.aprovadas])
    L.push([])
    L.push([
      'Pessoa',
      'Disciplinas revisadas',
      'Conformes 1ª rodada',
      'Aplicáveis 1ª rodada',
      'K2',
      'Rodadas',
      'Reprovadas',
      'Retorno',
      'Rodadas até aprovar',
      'Emitidas',
      'Correções válidas',
      'K3',
    ])
    for (const g of d.por_pessoa)
      L.push([
        g.nome,
        g.disciplinas_revisadas,
        g.conformes,
        g.aplicaveis,
        num(g.k2, '%'),
        g.rodadas,
        g.reprovadas,
        num(g.retorno, '%'),
        num(g.rodadas_ate_aprovar),
        g.emitidas,
        g.correcoes_validas,
        num(g.k3),
      ])
    L.push([])
    L.push(['Itens da 1ª rodada (K2)'])
    L.push(['Data', 'Projeto', 'Disciplina', 'Pessoa', 'Item', 'Severidade', 'Resultado'])
    for (const r of d.linhas.k2)
      L.push([
        r.data,
        r.projeto,
        r.disciplina,
        r.pessoa,
        r.item,
        r.severidade,
        RES[r.resultado] ?? r.resultado,
      ])
    L.push([])
    L.push(['Correções válidas após emissão (K3)'])
    L.push([
      'Data',
      'Projeto',
      'Disciplina',
      'Pessoa',
      'Emissão',
      'Origem',
      'Severidade',
      'Descrição',
    ])
    for (const r of d.linhas.correcoes)
      L.push([
        r.data,
        r.projeto,
        r.disciplina,
        r.pessoa,
        r.emissao,
        ORIGEM[r.origem],
        SEV[r.severidade],
        r.descricao,
      ])
    L.push([])
    L.push(['Rodadas de revisão'])
    L.push(['Data', 'Projeto', 'Disciplina', 'Pessoa', 'Rodada', 'Resultado', 'Sem checklist'])
    for (const r of d.linhas.rodadas)
      L.push([
        r.data,
        r.projeto,
        r.disciplina,
        r.pessoa,
        r.rodada,
        RES[r.resultado] ?? r.resultado,
        r.sem_checklist ? 'sim' : '',
      ])
    const csv = '﻿' + L.map((l) => l.map(esc).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `qualidade_${d.filtros.inicio || 'inicio'}_${d.filtros.fim || 'hoje'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#1E3A8A]" /> Qualidade
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Quanto sai certo na primeira revisão (K2) e quanto volta depois da emissão (K3). Clique
            num indicador para ver os registros que formam o número.
            {d?.escopo === 'proprio' && ' Você vê só os seus números.'}
            {d?.escopo === 'equipe' && ' Você vê os projetos que coordena.'}
          </p>
        </div>
        <div className="flex gap-2">
          {d?.pode_configurar && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setConfig(!config)}
            >
              <Settings2 className="w-4 h-4" /> Limiares
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => void carregar()}>
            <RefreshCw className="w-4 h-4" /> Atualizar
          </Button>
          <Button
            size="sm"
            className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            disabled={!d}
            onClick={exportar}
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {config && d && (
        <ConfigLimiares
          atual={d.limiares}
          onSalvo={async () => {
            setConfig(false)
            await carregar()
          }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input
            type="date"
            value={f.inicio ?? ''}
            onChange={(e) => setF({ ...f, inicio: e.target.value })}
            className="h-9 w-40"
          />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input
            type="date"
            value={f.fim ?? ''}
            onChange={(e) => setF({ ...f, fim: e.target.value })}
            className="h-9 w-40"
          />
        </div>
        <select
          aria-label="Projeto"
          className={sel}
          value={f.projeto ?? ''}
          onChange={(e) => setF({ ...f, projeto: e.target.value })}
        >
          <option value="">Todos os projetos</option>
          {d?.opcoes.projetos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
        <select
          aria-label="Disciplina"
          className={sel}
          value={f.disciplina ?? ''}
          onChange={(e) => setF({ ...f, disciplina: e.target.value })}
        >
          <option value="">Todas as disciplinas</option>
          {d?.opcoes.disciplinas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
        {d?.escopo !== 'proprio' && (
          <select
            aria-label="Pessoa"
            className={sel}
            value={f.pessoa ?? ''}
            onChange={(e) => setF({ ...f, pessoa: e.target.value })}
          >
            <option value="">Todas as pessoas</option>
            {d?.opcoes.pessoas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Tipologia"
          className={sel}
          value={f.tipologia ?? ''}
          onChange={(e) => setF({ ...f, tipologia: e.target.value })}
        >
          <option value="">Todas as tipologias</option>
          {d?.opcoes.tipologias.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        {carregando && <Loader2 className="w-4 h-4 animate-spin text-slate-400 mb-2.5" />}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!d ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Cartao
              ativo={detalhe === 'k2'}
              onClick={() => setDetalhe('k2')}
              titulo="K2 · conforme na 1ª revisão"
              valor={d.total.k2_inconclusivo ? null : num(d.total.k2, '%')}
              inconclusivo={
                d.total.k2_inconclusivo
                  ? `${d.total.disciplinas_revisadas} de ${d.limiares.k2} disciplinas revisadas`
                  : ''
              }
              linhas={[
                `${d.total.conformes} de ${d.total.aplicaveis} itens · ${d.total.disciplinas_revisadas} disciplinas`,
                `Fora da conta: ${d.total.na} não se aplica, ${d.total.excecoes} exceção(ões)`,
              ]}
            />
            <Cartao
              ativo={detalhe === 'k3'}
              onClick={() => setDetalhe('k3')}
              titulo="K3 · correções após emissão"
              valor={d.total.k3_inconclusivo ? null : `${num(d.total.k3)} por disciplina`}
              inconclusivo={
                d.total.k3_inconclusivo
                  ? `${d.total.emitidas} de ${d.limiares.k3} disciplinas emitidas`
                  : ''
              }
              linhas={[
                `${d.total.correcoes_validas} correção(ões) válida(s) · ${d.total.emitidas} disciplina(s) emitida(s)`,
                `${d.correcoes_invalidas} inválida(s) fora da conta`,
              ]}
            />
            <Cartao
              ativo={detalhe === 'retorno'}
              onClick={() => setDetalhe('retorno')}
              titulo="Retorno para correção"
              valor={num(d.total.retorno, '%')}
              linhas={[`${d.total.reprovadas} de ${d.total.rodadas} rodadas devolvidas`]}
            />
            <Cartao
              ativo={detalhe === 'rodadas'}
              onClick={() => setDetalhe('rodadas')}
              titulo="Rodadas até aprovar"
              valor={num(d.total.rodadas_ate_aprovar)}
              linhas={[`média de ${d.total.aprovadas} disciplina(s) aprovada(s)`]}
            />
          </div>

          <div className="flex flex-col lg:flex-row gap-5 items-start">
            <Tabela titulo="Por pessoa" grupos={d.por_pessoa} limiares={d.limiares} />
            <section className="w-full lg:w-96 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">Correções válidas após emissão</h2>
                <p className="text-xs text-slate-500">por origem e severidade</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 bg-slate-50">
                    <th className="text-left px-4 py-2">Origem</th>
                    <th className="text-right px-3 py-2">Alta</th>
                    <th className="text-right px-3 py-2">Média</th>
                    <th className="text-right px-4 py-2">Baixa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(['cliente', 'obra', 'interna'] as const).map((o) => (
                    <tr key={o}>
                      <td className="px-4 py-2">{ORIGEM[o]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.k3_matriz[o].alta}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.k3_matriz[o].media}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{d.k3_matriz[o].baixa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <Tabela titulo="Por disciplina" grupos={d.por_disciplina} limiares={d.limiares} />

          <Drill d={d} detalhe={detalhe} />
        </>
      )}
    </div>
  )
}

function Cartao({
  titulo,
  valor,
  inconclusivo,
  linhas,
  ativo,
  onClick,
}: {
  titulo: string
  valor: string | null
  inconclusivo?: string
  linhas: string[]
  ativo: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-shadow hover:shadow-sm ${
        inconclusivo ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
      } ${ativo ? 'ring-2 ring-[#1E3A8A]/40' : ''}`}
    >
      <div
        className={`text-sm font-semibold ${inconclusivo ? 'text-amber-900' : 'text-slate-600'}`}
      >
        {titulo}
      </div>
      {inconclusivo ? (
        <div className="text-xl font-bold text-amber-900 my-1.5">Inconclusivo</div>
      ) : (
        <div className="text-3xl font-extrabold text-slate-900 tabular-nums my-1">{valor}</div>
      )}
      {inconclusivo && <div className="text-xs text-amber-900">Amostra: {inconclusivo}</div>}
      {linhas.map((l) => (
        <div key={l} className={`text-xs ${inconclusivo ? 'text-amber-800' : 'text-slate-500'}`}>
          {l}
        </div>
      ))}
    </button>
  )
}

function Tabela({
  titulo,
  grupos,
  limiares,
}: {
  titulo: string
  grupos: GrupoQualidade[]
  limiares: { k2: number; k3: number }
}) {
  return (
    <section className="flex-1 min-w-0 w-full bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
      </div>
      {grupos.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">Sem dados com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 bg-slate-50 whitespace-nowrap">
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-right px-3 py-2">Itens 1ª rodada</th>
                <th className="text-left px-3 py-2 min-w-[160px]">K2</th>
                <th className="text-right px-3 py-2">Retorno</th>
                <th className="text-right px-3 py-2">Rodadas</th>
                <th className="text-right px-4 py-2">K3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grupos.map((g) => (
                <tr key={g.id}>
                  <td className="px-4 py-2 text-slate-800">{g.nome}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {g.conformes} de {g.aplicaveis}
                  </td>
                  <td className="px-3 py-2">
                    {g.k2 === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full bg-[#1E3A8A]" style={{ width: `${g.k2}%` }} />
                        </div>
                        <strong className="tabular-nums">{num(g.k2, '%')}</strong>
                        {g.k2_inconclusivo && (
                          <span
                            className="text-[10px] text-amber-700"
                            title={`Menos de ${limiares.k2} disciplinas revisadas`}
                          >
                            amostra pequena
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{num(g.retorno, '%')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(g.rodadas_ate_aprovar)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {num(g.k3)}
                    {g.k3 !== null && g.k3_inconclusivo && (
                      <span className="ml-1 text-[10px] text-amber-700">amostra pequena</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Drill({ d, detalhe }: { d: PainelQualidade; detalhe: Detalhe }) {
  const [so, setSo] = useState(true)
  const k2 = useMemo(
    () => (so ? d.linhas.k2.filter((r) => r.resultado !== 'conforme') : d.linhas.k2),
    [d, so],
  )
  const rodadas = d.linhas.rodadas
  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            {detalhe === 'k2'
              ? 'Registros do K2 (itens da 1ª rodada)'
              : detalhe === 'k3'
                ? 'Registros do K3 (correções válidas e emissões)'
                : 'Rodadas de revisão'}
          </h2>
        </div>
        {detalhe === 'k2' && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[#1E3A8A]"
              checked={so}
              onChange={(e) => setSo(e.target.checked)}
            />
            Só os que não saíram conformes
          </label>
        )}
      </div>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        {detalhe === 'k2' && (
          <TabelaLinhas
            cab={['Data', 'Projeto · disciplina', 'Pessoa', 'Item', 'Resultado']}
            linhas={k2.map((r) => [
              formatarData(r.data),
              `${r.projeto} · ${r.disciplina}`,
              r.pessoa,
              r.item + (r.severidade === 'critico' ? ' (crítico)' : ''),
              RES[r.resultado] ?? r.resultado,
            ])}
          />
        )}
        {detalhe === 'k3' && (
          <>
            <TabelaLinhas
              cab={[
                'Data',
                'Projeto · disciplina',
                'Pessoa',
                'Emissão',
                'Origem',
                'Severidade',
                'Descrição',
              ]}
              linhas={d.linhas.correcoes.map((r) => [
                formatarData(r.data),
                `${r.projeto} · ${r.disciplina}`,
                r.pessoa,
                r.emissao,
                ORIGEM[r.origem],
                SEV[r.severidade],
                r.descricao,
              ])}
            />
            <p className="px-4 pt-4 pb-1 text-xs font-semibold uppercase text-slate-500">
              Emissões no período
            </p>
            <TabelaLinhas
              cab={['Data', 'Projeto · disciplina', 'Pessoa', 'Revisão']}
              linhas={d.linhas.emissoes.map((r) => [
                formatarData(r.data),
                `${r.projeto} · ${r.disciplina}`,
                r.pessoa,
                r.rotulo,
              ])}
            />
          </>
        )}
        {(detalhe === 'retorno' || detalhe === 'rodadas') && (
          <TabelaLinhas
            cab={['Data', 'Projeto · disciplina', 'Pessoa', 'Rodada', 'Resultado']}
            linhas={rodadas.map((r) => [
              formatarData(r.data),
              `${r.projeto} · ${r.disciplina}`,
              r.pessoa,
              String(r.rodada),
              (RES[r.resultado] ?? r.resultado) + (r.sem_checklist ? ' · sem checklist' : ''),
            ])}
          />
        )}
      </div>
    </section>
  )
}

function TabelaLinhas({ cab, linhas }: { cab: string[]; linhas: string[][] }) {
  if (linhas.length === 0)
    return <p className="px-4 py-6 text-sm text-slate-500">Nenhum registro com esses filtros.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500 bg-slate-50 whitespace-nowrap">
          {cab.map((c) => (
            <th key={c} className="text-left px-4 py-2">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {linhas.map((l, i) => (
          <tr key={i}>
            {l.map((c, j) => (
              <td key={j} className="px-4 py-2 text-slate-700 align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ConfigLimiares({
  atual,
  onSalvo,
}: {
  atual: { k2: number; k3: number }
  onSalvo: () => Promise<void>
}) {
  const [k2, setK2] = useState(String(atual.k2))
  const [k3, setK3] = useState(String(atual.k3))
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">Mínimo de disciplinas revisadas (K2)</Label>
        <Input
          type="number"
          min={1}
          value={k2}
          onChange={(e) => setK2(e.target.value)}
          className="h-9 w-32"
        />
      </div>
      <div>
        <Label className="text-xs">Mínimo de disciplinas emitidas (K3)</Label>
        <Input
          type="number"
          min={1}
          value={k3}
          onChange={(e) => setK3(e.target.value)}
          className="h-9 w-32"
        />
      </div>
      <div className="flex-1 min-w-[200px]">
        <Label className="text-xs">Motivo *</Label>
        <Input
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          className="h-9"
        />
      </div>
      <Button
        disabled={enviando || motivo.trim().length < 3}
        className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
        onClick={async () => {
          setEnviando(true)
          try {
            await salvarLimiares(Number(k2), Number(k3), motivo.trim())
            toast.success('Limiares atualizados (fica no registro de acessos e ações).')
            await onSalvo()
          } catch (err) {
            toast.error(getErrorMessage(err))
          } finally {
            setEnviando(false)
          }
        }}
      >
        Salvar
      </Button>
    </div>
  )
}
