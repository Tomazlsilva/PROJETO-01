// SPEC-2-004 — emissões da disciplina (só com revisão aprovada) e correções após a emissão.
import { useCallback, useEffect, useState } from 'react'
import { FileCheck2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import { formatarData, hojeBR, type Pessoa } from '@/services/projetos'
import {
  ROTULO_ORIGEM,
  ROTULO_SEVERIDADE,
  ROTULO_TIPO_ENTREGA,
  cancelarEmissao,
  getEmissoes,
  registrarCorrecao,
  registrarEmissao,
  reverDecisao,
  type CorrecaoPosEmissao,
  type Emissao,
  type EmissoesDoCard as Dados,
  type TipoEntrega,
} from '@/services/emissoes'

const NOVA = '__nova__'
const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')
const sel = 'h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm'

const mensagemErro = (err: unknown) => {
  if (err instanceof ClientResponseError && err.status === 409)
    return (err.response as { message?: string }).message || 'Operação recusada.'
  const f = extractFieldErrors(err)
  return Object.values(f)[0] || getErrorMessage(err)
}

export function EmissoesDoCard({
  cardId,
  etapa,
  equipe,
  userId,
  onAlterado,
}: {
  cardId: string
  etapa: string
  equipe: Pessoa[]
  userId: string
  onAlterado: () => Promise<void>
}) {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [form, setForm] = useState(false)
  const [entrega, setEntrega] = useState('')
  const [tipo, setTipo] = useState<TipoEntrega>('final')
  const [rotulo, setRotulo] = useState('')
  const [data, setData] = useState(hojeBR())
  const [destinatario, setDestinatario] = useState('')
  const [resp, setResp] = useState(userId)

  const carregar = useCallback(async () => {
    try {
      const r = await getEmissoes(cardId)
      setD(r)
      setErro('')
      const emitidas = r.emissoes.filter((m) => m.status === 'emitida').length
      setRotulo((v) => v || `R${String(emitidas).padStart(2, '0')}`)
      const livre = r.entregas.find((x) => !x.emitida_aqui && !x.entregue)
      setEntrega((v) => v || (livre ? livre.id : NOVA))
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }, [cardId])

  useEffect(() => {
    void carregar()
  }, [carregar, etapa])

  if (erro) return <p className="text-xs text-red-600">{erro}</p>
  if (!d)
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando emissões…
      </div>
    )
  if (!d.aprovada && d.emissoes.length === 0) return null

  const rodar = async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true)
    try {
      await fn()
      if (ok) toast.success(ok)
      await carregar()
      await onAlterado()
      return true
    } catch (err) {
      toast.error(mensagemErro(err))
      await carregar()
      return false
    } finally {
      setOcupado(false)
    }
  }

  const podeRegistrar = d.pode_emitir && d.aprovada && d.etapa === 'aprovado'

  const emitir = async () => {
    const ok = await rodar(
      () =>
        registrarEmissao(cardId, {
          entrega: entrega === NOVA ? undefined : entrega,
          tipo: entrega === NOVA ? tipo : undefined,
          rotulo: rotulo.trim(),
          data,
          destinatario: destinatario.trim(),
          responsavel: resp,
        }),
      `Emissão ${rotulo.trim().toUpperCase()} registrada.`,
    )
    if (ok) {
      setForm(false)
      setRotulo('')
      setEntrega('')
      setDestinatario('')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5">
          <FileCheck2 className="w-3.5 h-3.5" /> Emissões
        </p>
        {podeRegistrar && !form && (
          <Button
            size="sm"
            className="h-7 gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            onClick={() => setForm(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Registrar emissão
          </Button>
        )}
      </div>

      {form && podeRegistrar && (
        <div className="rounded-md border border-blue-100 bg-blue-50/50 p-2.5 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Entrega do calendário *</Label>
              <select
                className={sel}
                value={entrega}
                onChange={(e) => setEntrega(e.target.value)}
                aria-label="Entrega"
              >
                {d.entregas.map((x) => (
                  <option key={x.id} value={x.id} disabled={x.emitida_aqui}>
                    {ROTULO_TIPO_ENTREGA[x.tipo] ?? x.tipo}
                    {x.tipo === 'revisao' && x.numero_revisao ? ` ${x.numero_revisao}` : ''} ·{' '}
                    {formatarData(x.data)}
                    {x.descricao ? ` · ${x.descricao}` : ''}
                    {x.emitida_aqui ? ' (já emitida)' : x.entregue ? ' (entregue)' : ''}
                  </option>
                ))}
                <option value={NOVA}>Não está no calendário: criar a entrega</option>
              </select>
            </div>
            {entrega === NOVA && (
              <div>
                <Label className="text-xs">Tipo da entrega *</Label>
                <select
                  className={sel}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoEntrega)}
                >
                  <option value="previa">Prévia</option>
                  <option value="final">Final</option>
                  <option value="revisao">Revisão</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs">Revisão *</Label>
              <Input
                value={rotulo}
                maxLength={20}
                onChange={(e) => setRotulo(e.target.value)}
                className="h-8 bg-white"
                placeholder="R00"
              />
            </div>
            <div>
              <Label className="text-xs">Data *</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-8 bg-white"
              />
            </div>
            <div>
              <Label className="text-xs">Responsável *</Label>
              <select className={sel} value={resp} onChange={(e) => setResp(e.target.value)}>
                {!equipe.some((p) => p.id === userId) && userId && (
                  <option value={userId}>Eu</option>
                )}
                {equipe.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Destinatário *</Label>
              <Input
                value={destinatario}
                maxLength={300}
                onChange={(e) => setDestinatario(e.target.value)}
                className="h-8 bg-white"
                placeholder="Ex.: construtora do cliente — eng. de obras"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
              disabled={
                ocupado || !rotulo.trim() || !data || destinatario.trim().length < 2 || !resp
              }
              onClick={() => void emitir()}
            >
              Registrar {rotulo.trim().toUpperCase() || 'emissão'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {d.pode_emitir && !d.aprovada && d.emissoes.length > 0 && (
        <p className="text-xs text-slate-500">
          Nova emissão só depois de a revisão ser aprovada de novo.
        </p>
      )}

      {d.emissoes.length === 0 ? (
        <p className="text-sm text-slate-500">
          Revisão aprovada. Nenhuma emissão registrada ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {d.emissoes.map((m) => (
            <LinhaEmissao
              key={m.id}
              m={m}
              cardId={cardId}
              correcoes={d.correcoes.filter((c) => c.emissao === m.id)}
              itens={d.itens_revisao}
              pode={d.pode_emitir}
              ocupado={ocupado}
              rodar={rodar}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function LinhaEmissao({
  m,
  cardId,
  correcoes,
  itens,
  pode,
  ocupado,
  rodar,
}: {
  m: Emissao
  cardId: string
  correcoes: CorrecaoPosEmissao[]
  itens: { id: string; texto: string }[]
  pode: boolean
  ocupado: boolean
  rodar: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>
}) {
  const [cancelar, setCancelar] = useState(false)
  const [just, setJust] = useState('')
  const [nova, setNova] = useState(false)
  const [origem, setOrigem] = useState('cliente')
  const [sev, setSev] = useState('media')
  const [descricao, setDescricao] = useState('')
  const [item, setItem] = useState('')
  const [decisao, setDecisao] = useState<'valida' | 'invalida'>('valida')
  const [justDec, setJustDec] = useState('')
  const cancelada = m.status === 'cancelada'

  return (
    <li
      className={`rounded-md border p-2.5 text-sm ${cancelada ? 'border-slate-200 bg-slate-50' : 'border-slate-200'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <strong className={cancelada ? 'line-through text-slate-500' : 'text-slate-900'}>
            {m.rotulo}
          </strong>
          <span className="text-slate-600">
            {m.entrega
              ? `${ROTULO_TIPO_ENTREGA[m.entrega.tipo] ?? m.entrega.tipo} de ${formatarData(m.entrega.data)}`
              : '—'}{' '}
            · {formatarData(m.data)} · para {m.destinatario}
          </span>
          {cancelada ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
              cancelada
            </span>
          ) : (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              emitida
            </span>
          )}
          {m.entrega_criada && (
            <span className="text-[11px] text-slate-500">entrega criada na emissão</span>
          )}
        </div>
        {pode && !cancelada && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setNova(!nova)}>
              Registrar correção
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-slate-500"
              onClick={() => setCancelar(!cancelar)}
            >
              Cancelar emissão
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-0.5">
        Responsável: {m.responsavel?.nome ?? '—'} · registrada por {m.autor?.nome ?? 'Sistema'} em{' '}
        {quando(m.created)}
        {m.rodada ? ` · revisão aprovada na rodada ${m.rodada}` : ''}
      </p>
      {cancelada && (
        <p className="text-xs text-slate-500 mt-0.5">
          Cancelada por {m.cancelada_por?.nome ?? '—'} em {quando(m.cancelada_em)}: “
          {m.cancelamento}”
        </p>
      )}

      {cancelar && (
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            value={just}
            maxLength={1000}
            onChange={(e) => setJust(e.target.value)}
            placeholder="Por que cancelar? (obrigatório)"
            className="h-8"
          />
          <Button
            size="sm"
            variant="outline"
            className="text-red-700 border-red-200"
            disabled={ocupado || just.trim().length < 3}
            onClick={() =>
              void rodar(
                () => cancelarEmissao(cardId, m.id, m.versao, just.trim()),
                'Emissão cancelada (fica no histórico).',
              ).then((ok) => ok && setCancelar(false))
            }
          >
            Confirmar cancelamento
          </Button>
        </div>
      )}

      {nova && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 space-y-2">
          <p className="text-xs font-semibold text-amber-900">
            Correção recebida depois da emissão {m.rotulo}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Origem *</Label>
              <select className={sel} value={origem} onChange={(e) => setOrigem(e.target.value)}>
                <option value="cliente">Cliente</option>
                <option value="obra">Obra</option>
                <option value="interna">Interna</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Severidade *</Label>
              <select className={sel} value={sev} onChange={(e) => setSev(e.target.value)}>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Item do checklist (opcional)</Label>
              <select className={sel} value={item} onChange={(e) => setItem(e.target.value)}>
                <option value="">—</option>
                {itens.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.texto}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <Label className="text-xs">Descrição *</Label>
              <Input
                value={descricao}
                maxLength={2000}
                onChange={(e) => setDescricao(e.target.value)}
                className="h-8 bg-white"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Decisão *</Label>
              <select
                className={sel}
                value={decisao}
                onChange={(e) => setDecisao(e.target.value as 'valida' | 'invalida')}
              >
                <option value="valida">
                  Válida: erro do projeto (volta para correção e conta no K3)
                </option>
                <option value="invalida">Inválida: não é erro (mudança de escopo etc.)</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">
                {decisao === 'invalida' ? 'Por que é inválida *' : 'Observação (opcional)'}
              </Label>
              <Input
                value={justDec}
                maxLength={1000}
                onChange={(e) => setJustDec(e.target.value)}
                className="h-8 bg-white"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={
                ocupado ||
                descricao.trim().length < 3 ||
                (decisao === 'invalida' && justDec.trim().length < 3)
              }
              onClick={() =>
                void rodar(
                  () =>
                    registrarCorrecao(cardId, m.id, {
                      origem,
                      severidade: sev,
                      descricao: descricao.trim(),
                      item: item || undefined,
                      decisao,
                      justificativa: justDec.trim(),
                    }),
                  decisao === 'valida'
                    ? 'Correção registrada; a disciplina voltou para correção na fila do responsável.'
                    : 'Correção registrada como inválida.',
                ).then((ok) => {
                  if (ok) {
                    setNova(false)
                    setDescricao('')
                    setJustDec('')
                    setItem('')
                  }
                })
              }
            >
              Salvar correção
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNova(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {correcoes.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {correcoes.map((c) => (
            <LinhaCorrecaoPos
              key={c.id}
              c={c}
              cardId={cardId}
              pode={pode}
              ocupado={ocupado}
              rodar={rodar}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function LinhaCorrecaoPos({
  c,
  cardId,
  pode,
  ocupado,
  rodar,
}: {
  c: CorrecaoPosEmissao
  cardId: string
  pode: boolean
  ocupado: boolean
  rodar: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>
}) {
  const [rever, setRever] = useState(false)
  const [just, setJust] = useState('')
  const outra = c.decisao === 'valida' ? 'invalida' : 'valida'
  return (
    <li className="rounded border border-slate-100 bg-white px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`font-semibold px-1.5 py-0.5 rounded-full ${
            c.decisao === 'valida' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {c.decisao === 'valida' ? 'Válida' : 'Inválida'}
        </span>
        <span className="text-slate-600">
          {ROTULO_ORIGEM[c.origem]} · severidade {ROTULO_SEVERIDADE[c.severidade]}
        </span>
        <span className="text-slate-800">{c.descricao}</span>
        {c.item_texto && <span className="text-slate-500">· item: {c.item_texto}</span>}
      </div>
      <p className="text-slate-500 mt-0.5">
        Decidido por {c.decidido_por?.nome ?? '—'} em {quando(c.decidido_em)}
        {c.justificativa ? ` · “${c.justificativa}”` : ''}
        {c.atividade &&
          ` · atividade para ${c.atividade.destinatario?.nome ?? '—'} (${c.atividade.status})`}
        {c.historico.length > 0 && ` · decisão revista ${c.historico.length}x`}
        {pode && (
          <button type="button" className="ml-2 underline" onClick={() => setRever(!rever)}>
            mudar para {outra === 'valida' ? 'válida' : 'inválida'}
          </button>
        )}
      </p>
      {rever && (
        <div className="flex flex-col sm:flex-row gap-2 mt-1">
          <Input
            value={just}
            maxLength={1000}
            onChange={(e) => setJust(e.target.value)}
            placeholder="Motivo da mudança (obrigatório)"
            className="h-7"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={ocupado || just.trim().length < 3}
            onClick={() =>
              void rodar(
                () =>
                  reverDecisao(cardId, c.id, {
                    versao: c.versao,
                    decisao: outra,
                    justificativa: just.trim(),
                  }),
                'Decisão revista.',
              ).then((ok) => ok && setRever(false))
            }
          >
            Confirmar
          </Button>
        </div>
      )}
    </li>
  )
}
