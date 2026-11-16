// SPEC-2-003 — revisão do coordenador no card: rodada item a item, aprovar / devolver para
// correção, exceção técnica, correção pelo projetista e histórico das rodadas.
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import { moverCard } from '@/services/kanban'
import type { ItemChecklist } from '@/services/checklists'
import {
  ROTULO_RESULTADO,
  abrirRodada,
  getRevisao,
  marcarCorrigido,
  marcarRevisao,
  reabrirRodada,
  type MarcacaoRevisao,
  type ResultadoRevisao,
  type RevisaoDoCard as Dados,
  type Rodada,
} from '@/services/revisao'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')

const mensagemErro = (err: unknown) => {
  if (err instanceof ClientResponseError && err.status === 409)
    return (err.response as { message?: string }).message || 'Operação recusada.'
  const f = extractFieldErrors(err)
  return Object.values(f)[0] || getErrorMessage(err)
}

const RES: Record<string, { rotulo: string; cls: string }> = {
  conforme: { rotulo: 'Conforme', cls: 'bg-emerald-50 text-emerald-700' },
  nao_conforme: { rotulo: 'Não conforme', cls: 'bg-red-50 text-red-700' },
  nao_se_aplica: { rotulo: 'Não se aplica', cls: 'bg-slate-100 text-slate-600' },
  excecao: { rotulo: 'Exceção técnica', cls: 'bg-purple-50 text-purple-700' },
}

const corResultado = (r: string) =>
  r === 'reprovado'
    ? 'bg-red-50 text-red-700 border-red-200'
    : r === 'aprovado_com_excecao'
      ? 'bg-purple-50 text-purple-700 border-purple-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200'

function Selo({ r }: { r?: MarcacaoRevisao }) {
  if (!r || !r.resultado) return <span className="text-xs text-slate-400">—</span>
  const x = RES[r.resultado]
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${x.cls}`}
    >
      {x.rotulo}
    </span>
  )
}

export function RevisaoDoCard({
  card,
  onAlterado,
}: {
  card: { id: string; etapa: string; versao: string }
  onAlterado: () => Promise<void>
}) {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [comentario, setComentario] = useState('')
  const [verRodada, setVerRodada] = useState<string | null>(null)
  const [reabrir, setReabrir] = useState('')

  const carregar = useCallback(async () => {
    try {
      setD(await getRevisao(card.id))
      setErro('')
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }, [card.id])

  useEffect(() => {
    void carregar()
  }, [carregar, card.etapa, card.versao])

  if (erro) return <p className="text-xs text-red-600">{erro}</p>
  if (!d)
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando revisão…
      </div>
    )

  const aberta = d.rodadas.find((r) => r.status === 'aberta') ?? null
  const encerradas = d.rodadas.filter((r) => r.status === 'encerrada')
  const ultima = d.rodadas[0] ?? null
  const anterior = aberta ? (d.rodadas.find((r) => r.numero === aberta.numero - 1) ?? null) : null
  const emRevisao = d.etapa === 'aguardando_revisao'
  const itens = d.checklist?.itens ?? []
  const marc = aberta?.itens ?? {}
  const faltam = itens.filter((it) => !marc[it.id]?.resultado).length
  const nc = itens.filter((it) => marc[it.id]?.resultado === 'nao_conforme').length
  const exc = itens.filter((it) => marc[it.id]?.resultado === 'excecao').length

  const rodar = async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      await carregar()
      await onAlterado()
    } catch (err) {
      toast.error(mensagemErro(err))
      await carregar()
    } finally {
      setOcupado(false)
    }
  }

  const encerrar = (para: 'aprovado' | 'em_correcao') =>
    rodar(
      () =>
        moverCard(
          card.id,
          para,
          card.versao,
          comentario.trim(),
          undefined,
          aberta ? { rodada: aberta.id, versao: aberta.versao } : undefined,
        ),
      para === 'aprovado' ? 'Revisão aprovada.' : 'Devolvido para correção.',
    ).then(() => setComentario(''))

  const reabrivel =
    d.pode_revisar &&
    !aberta &&
    !!ultima &&
    ultima.status === 'encerrada' &&
    (d.etapa === 'em_correcao' || d.etapa === 'aprovado')

  // nada para mostrar fora da revisão quando ainda não houve rodada
  if (!emRevisao && d.rodadas.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" /> Revisão do coordenador
          {d.checklist && (
            <span className="normal-case font-normal text-slate-400">
              · checklist v{d.checklist.numero}
            </span>
          )}
        </p>
        {encerradas.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {[...encerradas].reverse().map((r) => (
              <span
                key={r.id}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${corResultado(r.resultado)}`}
              >
                Rodada {r.numero}: {ROTULO_RESULTADO[r.resultado] ?? r.resultado}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* ---- card aguardando revisão ---- */}
      {emRevisao && !d.pode_revisar && (
        <p className="text-sm text-slate-600">Aguardando a revisão do coordenador do projeto.</p>
      )}

      {emRevisao && d.pode_revisar && !d.checklist && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Sem checklist de revisão para esta disciplina: registre o resultado geral. Fica marcado
            como “sem checklist” e não entra no K2.
          </p>
          <Textarea
            rows={2}
            maxLength={1000}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentário (obrigatório para devolver: o que precisa ser corrigido)"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={ocupado}
              className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
              onClick={() => void encerrar('aprovado')}
            >
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-200 hover:bg-red-50"
              disabled={ocupado || comentario.trim().length < 3}
              onClick={() => void encerrar('em_correcao')}
            >
              Devolver para correção
            </Button>
          </div>
        </div>
      )}

      {emRevisao && d.pode_revisar && d.checklist && !aberta && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {ultima
              ? `Projetista reenviou. Abra a rodada ${ultima.numero + 1} para conferir as correções.`
              : 'Comece a revisão item por item.'}
          </p>
          <Button
            size="sm"
            disabled={ocupado}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            onClick={() => void rodar(() => abrirRodada(card.id))}
          >
            Iniciar rodada {(ultima?.numero ?? 0) + 1}
          </Button>
        </div>
      )}

      {emRevisao && aberta && d.checklist && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Rodada {aberta.numero} aberta{aberta.aberta_por ? ` por ${aberta.aberta_por.nome}` : ''}{' '}
            · {quando(aberta.created)}
            {anterior && ' · itens já resolvidos na rodada anterior vêm marcados'}
          </p>
          <ul className="divide-y divide-slate-100">
            {itens.map((it) => (
              <LinhaRevisao
                key={it.id}
                item={it}
                marca={marc[it.id]}
                anterior={anterior?.itens[it.id]}
                podeMarcar={d.pode_revisar}
                onMarcar={(resultado, observacao, justificativa) =>
                  rodar(() =>
                    marcarRevisao(card.id, aberta.id, {
                      versao: aberta.versao,
                      item: it.id,
                      resultado,
                      observacao,
                      justificativa,
                    }),
                  )
                }
                ocupado={ocupado}
              />
            ))}
          </ul>
          {d.pode_revisar && (
            <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5 space-y-2">
              <p className="text-xs text-slate-600">
                {faltam > 0 ? `Faltam ${faltam} item(ns) para marcar. ` : ''}
                {nc > 0
                  ? `${nc} não conforme(s): o card volta para o responsável em “Em correção”. `
                  : ''}
                {exc > 0
                  ? `${exc} exceção(ões) técnica(s): a aprovação fica marcada “com exceção”.`
                  : ''}
              </p>
              <Input
                value={comentario}
                maxLength={1000}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentário geral (opcional)"
                className="bg-white h-8"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
                  disabled={ocupado || faltam > 0 || nc > 0}
                  onClick={() => void encerrar('aprovado')}
                >
                  {exc > 0 ? 'Aprovar com exceção' : 'Aprovar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700 border-red-200 hover:bg-red-50"
                  disabled={ocupado || faltam > 0 || nc === 0}
                  onClick={() => void encerrar('em_correcao')}
                >
                  Devolver para correção
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- card em correção: projetista marca o que corrigiu ---- */}
      {d.etapa === 'em_correcao' && ultima && ultima.resultado === 'reprovado' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            Voltou da rodada {ultima.numero}
            {ultima.encerrada_por ? ` (${ultima.encerrada_por.nome})` : ''}
            {ultima.motivo ? `: “${ultima.motivo}”` : ''}.
            {ultima.sem_checklist
              ? ''
              : ' Marque cada item corrigido e depois reenvie para “Aguardando revisão”.'}
          </p>
          {!ultima.sem_checklist && (
            <ul className="divide-y divide-slate-100">
              {itens
                .filter((it) => ultima.itens[it.id]?.resultado === 'nao_conforme')
                .map((it) => (
                  <LinhaCorrecao
                    key={it.id}
                    item={it}
                    marca={ultima.itens[it.id]}
                    pode={d.pode_corrigir}
                    ocupado={ocupado}
                    onSalvar={(corrigido, nota) =>
                      rodar(() =>
                        marcarCorrigido(card.id, ultima.id, {
                          versao: ultima.versao,
                          item: it.id,
                          corrigido,
                          nota,
                        }),
                      )
                    }
                  />
                ))}
            </ul>
          )}
        </div>
      )}

      {/* ---- histórico das rodadas ---- */}
      {encerradas.length > 0 && (
        <div className="space-y-1">
          {encerradas.map((r) => (
            <HistoricoRodada
              key={r.id}
              r={r}
              itens={itens}
              aberto={verRodada === r.id}
              onToggle={() => setVerRodada(verRodada === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}

      {reabrivel && ultima && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={reabrir}
            maxLength={1000}
            onChange={(e) => setReabrir(e.target.value)}
            placeholder={`Justificativa para reabrir a rodada ${ultima.numero}`}
            className="h-8"
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={ocupado || reabrir.trim().length < 3}
            onClick={() =>
              void rodar(
                () => reabrirRodada(card.id, ultima.id, ultima.versao, reabrir.trim()),
                `Rodada ${ultima.numero} reaberta; o card voltou para “Aguardando revisão”.`,
              ).then(() => setReabrir(''))
            }
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reabrir rodada
          </Button>
        </div>
      )}
    </div>
  )
}

function LinhaRevisao({
  item,
  marca,
  anterior,
  podeMarcar,
  ocupado,
  onMarcar,
}: {
  item: ItemChecklist
  marca?: MarcacaoRevisao
  anterior?: MarcacaoRevisao
  podeMarcar: boolean
  ocupado: boolean
  onMarcar: (r: ResultadoRevisao, observacao?: string, justificativa?: string) => Promise<void>
}) {
  const [abrir, setAbrir] = useState<'' | 'nao_conforme' | 'nao_se_aplica' | 'excecao'>('')
  const [texto, setTexto] = useState('')
  const atual = marca?.resultado ?? ''

  const clicar = (r: Exclude<ResultadoRevisao, ''>) => {
    if (!podeMarcar || ocupado) return
    if (atual === r && !abrir) {
      void onMarcar('')
      return
    }
    if (r === 'conforme') {
      void onMarcar('conforme')
      return
    }
    setTexto(r === 'nao_conforme' ? (marca?.observacao ?? '') : (marca?.justificativa ?? ''))
    setAbrir(r)
  }
  const btn = (r: Exclude<ResultadoRevisao, ''>, rotulo: string, cor: string) => (
    <button
      type="button"
      disabled={!podeMarcar || ocupado}
      aria-pressed={atual === r}
      onClick={() => clicar(r)}
      className={`px-2 h-8 text-xs font-medium border-r last:border-r-0 border-slate-300 disabled:cursor-not-allowed ${
        atual === r || abrir === r ? cor : 'bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {rotulo}
    </button>
  )
  return (
    <li className="py-2 space-y-1.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-[200px] text-sm text-slate-800">
          {item.texto}
          {item.severidade === 'critico' && (
            <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-700">
              Crítico
            </span>
          )}
          {item.referencia && (
            <span className="ml-1.5 text-xs text-slate-400">{item.referencia}</span>
          )}
          {anterior && (
            <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-1">
              Rodada anterior: <Selo r={anterior} />
              {anterior.observacao && <span>“{anterior.observacao}”</span>}
              {anterior.corrigido && (
                <span className="text-emerald-700">
                  · corrigido{anterior.correcao_nota ? `: “${anterior.correcao_nota}”` : ''}
                </span>
              )}
            </div>
          )}
          {marca?.resultado && (marca.observacao || marca.justificativa) && (
            <div className="text-[11px] text-slate-500">
              “{marca.observacao || marca.justificativa}”
            </div>
          )}
        </div>
        <div
          className="inline-flex rounded-md border border-slate-300 overflow-hidden"
          role="group"
          aria-label="Resultado"
        >
          {btn('conforme', 'Conforme', 'bg-emerald-700 text-white')}
          {btn('nao_conforme', 'Não conforme', 'bg-red-700 text-white')}
          {btn('nao_se_aplica', 'N/A', 'bg-slate-600 text-white')}
          {btn('excecao', 'Exceção', 'bg-purple-700 text-white')}
        </div>
      </div>
      {abrir && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label className="text-xs">
              {abrir === 'nao_conforme'
                ? 'O que corrigir *'
                : abrir === 'excecao'
                  ? 'Justificativa da exceção técnica *'
                  : 'Por que não se aplica *'}
            </Label>
            <Input
              autoFocus
              value={texto}
              maxLength={1000}
              onChange={(e) => setTexto(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex gap-2 sm:items-end">
            <Button
              size="sm"
              disabled={ocupado || texto.trim().length < 3}
              onClick={() =>
                void onMarcar(
                  abrir,
                  abrir === 'nao_conforme' ? texto.trim() : undefined,
                  abrir === 'nao_conforme' ? undefined : texto.trim(),
                ).then(() => setAbrir(''))
              }
            >
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbrir('')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function LinhaCorrecao({
  item,
  marca,
  pode,
  ocupado,
  onSalvar,
}: {
  item: ItemChecklist
  marca: MarcacaoRevisao
  pode: boolean
  ocupado: boolean
  onSalvar: (corrigido: boolean, nota: string) => Promise<void>
}) {
  const [nota, setNota] = useState(marca.correcao_nota ?? '')
  return (
    <li className="py-2 space-y-1.5">
      <div className="text-sm text-slate-800">
        {item.texto}
        {marca.observacao && (
          <div className="text-xs text-red-700">Revisão: “{marca.observacao}”</div>
        )}
      </div>
      {marca.corrigido ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-700">
          ✓ Corrigido{marca.corrigido_por ? ` por ${marca.corrigido_por.nome}` : ''}
          {marca.correcao_nota ? `: “${marca.correcao_nota}”` : ''}
          {pode && (
            <button
              type="button"
              className="underline text-slate-500"
              disabled={ocupado}
              onClick={() => void onSalvar(false, '')}
            >
              desfazer
            </button>
          )}
        </div>
      ) : pode ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={nota}
            maxLength={1000}
            onChange={(e) => setNota(e.target.value)}
            placeholder="O que foi feito (opcional)"
            className="h-8"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={() => void onSalvar(true, nota.trim())}
          >
            Marcar como corrigido
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Aguardando correção.</p>
      )}
    </li>
  )
}

function HistoricoRodada({
  r,
  itens,
  aberto,
  onToggle,
}: {
  r: Rodada
  itens: ItemChecklist[]
  aberto: boolean
  onToggle: () => void
}) {
  return (
    <div className="border border-slate-100 rounded-md">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-left text-xs"
      >
        {aberto ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
        <strong className="text-slate-800">Rodada {r.numero}</strong>
        <span
          className={`font-semibold px-2 py-0.5 rounded-full border ${corResultado(r.resultado)}`}
        >
          {ROTULO_RESULTADO[r.resultado] ?? r.resultado}
        </span>
        {r.sem_checklist && <span className="text-slate-500">sem checklist</span>}
        <span className="text-slate-500">
          {r.encerrada_por?.nome ?? 'Sistema'} · {quando(r.encerrada_em)}
          {r.reaberturas.length > 0 && ` · reaberta ${r.reaberturas.length}x`}
        </span>
      </button>
      {aberto && (
        <div className="px-3 pb-2 space-y-1 text-xs">
          {r.motivo && <p className="text-slate-600">“{r.motivo}”</p>}
          {!r.sem_checklist &&
            itens.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-1.5">
                <Selo r={r.itens[it.id]} /> <span className="text-slate-700">{it.texto}</span>
                {r.itens[it.id]?.observacao && (
                  <span className="text-slate-500">— {r.itens[it.id].observacao}</span>
                )}
                {r.itens[it.id]?.justificativa && (
                  <span className="text-slate-500">— {r.itens[it.id].justificativa}</span>
                )}
                {r.itens[it.id]?.excecao_por && (
                  <span className="text-purple-700">
                    · decidido por {r.itens[it.id].excecao_por?.nome}
                  </span>
                )}
                {r.itens[it.id]?.corrigido && <span className="text-emerald-700">· corrigido</span>}
              </div>
            ))}
          {r.reaberturas.map((h, i) => (
            <p key={i} className="text-slate-500">
              Reaberta por {h.por?.nome ?? '—'} em {quando(h.em)}: “{h.justificativa}” (antes:{' '}
              {ROTULO_RESULTADO[h.resultado_anterior] ?? h.resultado_anterior})
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
