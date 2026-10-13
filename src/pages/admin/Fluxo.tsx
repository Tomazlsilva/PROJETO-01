import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, History, Loader2, RotateCcw, Save, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { ClientResponseError } from 'pocketbase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  CAMPOS_ETAPA,
  NOME_PADRAO,
  ROTULO_CAMPO,
  TRANSICOES,
  type CampoEtapa,
  type EtapaConfig,
} from '@/lib/fluxo'
import {
  getFluxo,
  restaurarFluxo,
  salvarFluxo,
  type Requisitos,
  type VersaoFluxo,
} from '@/services/kanban'

const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')

type Dados = Awaited<ReturnType<typeof getFluxo>>

export default function Fluxo() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [etapas, setEtapas] = useState<EtapaConfig[]>([])
  const [requisitos, setRequisitos] = useState<Requisitos>({})
  const [remap, setRemap] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [restaurar, setRestaurar] = useState<VersaoFluxo | null>(null)

  const carregar = useCallback(async () => {
    try {
      const d = await getFluxo()
      setDados(d)
      if (d.ativa) {
        setEtapas(
          [...d.ativa.config.etapas].sort((a, b) => a.ordem - b.ordem).map((e) => ({ ...e })),
        )
        setRequisitos(JSON.parse(JSON.stringify(d.ativa.config.requisitos || {})))
      }
      setRemap({})
      setMotivo('')
      setErros({})
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const contagem = dados?.cards_por_etapa ?? {}
  const ativas = etapas.filter((e) => e.ativa)
  const precisamRemap = etapas.filter((e) => !e.ativa && (contagem[e.chave] ?? 0) > 0)
  const nome = (k: string) =>
    etapas.find((e) => e.chave === k)?.nome ?? NOME_PADRAO[k as keyof typeof NOME_PADRAO] ?? k

  const alterado = useMemo(() => {
    if (!dados?.ativa) return false
    const orig = [...dados.ativa.config.etapas].sort((a, b) => a.ordem - b.ordem)
    return (
      JSON.stringify(orig.map((e) => [e.chave, e.nome, e.ativa])) !==
        JSON.stringify(etapas.map((e) => [e.chave, e.nome.trim(), e.ativa])) ||
      JSON.stringify(dados.ativa.config.requisitos || {}) !== JSON.stringify(requisitos)
    )
  }, [dados, etapas, requisitos])

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= etapas.length) return
    const n = [...etapas]
    ;[n[i], n[j]] = [n[j], n[i]]
    setEtapas(n.map((e, k) => ({ ...e, ordem: k + 1 })))
  }
  const alterar = (i: number, campo: Partial<EtapaConfig>) =>
    setEtapas(etapas.map((e, k) => (k === i ? { ...e, ...campo } : e)))

  const alternarRequisito = (chave: string, campo: CampoEtapa) => {
    const atual = requisitos[chave] ?? []
    const novo = atual.includes(campo) ? atual.filter((c) => c !== campo) : [...atual, campo]
    const r = { ...requisitos }
    if (novo.length) r[chave] = novo
    else delete r[chave]
    setRequisitos(r)
  }

  const salvar = async () => {
    if (!dados?.ativa) return
    setSalvando(true)
    setErros({})
    try {
      const r = await salvarFluxo({
        base: dados.ativa.id,
        etapas: etapas.map((e) => ({ ...e, nome: e.nome.trim() })),
        requisitos,
        motivo: motivo.trim(),
        remapeamentos: remap,
      })
      toast.success(`Fluxo salvo como versão ${r.numero}.`)
      await carregar()
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 409) {
        toast.error(
          (err.response as { message?: string }).message ||
            'Configuração alterada por outra pessoa.',
        )
        await carregar()
      } else {
        const f = extractFieldErrors(err)
        setErros(f)
        toast.error(Object.values(f)[0] || getErrorMessage(err))
      }
    } finally {
      setSalvando(false)
    }
  }

  if (!dados) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Workflow className="w-6 h-6 text-[#1E3A8A]" /> Fluxo do Kanban
        </h1>
        <p className="text-sm text-slate-500">
          Versão vigente: {dados.ativa?.numero ?? '—'}. Cada alteração cria uma versão nova e pode
          ser desfeita restaurando uma versão anterior.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Etapas</h2>
        {erros.etapas && <p className="text-sm text-red-600">{erros.etapas}</p>}
        <ul className="divide-y divide-slate-100">
          {etapas.map((e, i) => (
            <li key={e.chave} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Subir"
                  disabled={i === 0}
                  onClick={() => mover(i, -1)}
                  className="text-slate-400 hover:text-slate-800 disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Descer"
                  disabled={i === etapas.length - 1}
                  onClick={() => mover(i, 1)}
                  className="text-slate-400 hover:text-slate-800 disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
              <span className="w-6 text-sm font-semibold text-slate-400">{i + 1}</span>
              <Input
                value={e.nome}
                maxLength={40}
                onChange={(ev) => alterar(i, { nome: ev.target.value })}
                className={`flex-1 min-w-[160px] ${e.nome.trim() ? '' : 'border-red-500'}`}
              />
              <span className="text-xs text-slate-400 w-40 hidden sm:block">
                padrão: {NOME_PADRAO[e.chave]}
              </span>
              <span className="text-xs text-slate-500 w-16">{contagem[e.chave] ?? 0} card(s)</span>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={e.ativa}
                  disabled={e.chave === 'aprovado'}
                  onCheckedChange={(v) => alterar(i, { ativa: v })}
                />
                {e.ativa ? 'Ativa' : 'Inativa'}
              </label>
              {!e.ativa && (contagem[e.chave] ?? 0) > 0 && (
                <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 text-sm">
                  <span className={erros[e.chave] ? 'text-red-600' : 'text-amber-700'}>
                    Mover cards para:
                  </span>
                  <Select
                    value={remap[e.chave] || undefined}
                    onValueChange={(v) => setRemap({ ...remap, [e.chave]: v })}
                  >
                    <SelectTrigger className={`h-9 w-52 ${erros[e.chave] ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder="Escolha a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {ativas.map((a) => (
                        <SelectItem key={a.chave} value={a.chave}>
                          {a.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          “Aprovado” não pode ser inativada. Etapa inativa some do Kanban e o fluxo passa direto por
          ela.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Campos obrigatórios por transição</h2>
        <p className="text-sm text-slate-500">
          Marque o que precisa ser preenchido para o card passar de uma etapa para outra.
        </p>
        {erros.requisitos && <p className="text-sm text-red-600">{erros.requisitos}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Transição</th>
                {CAMPOS_ETAPA.map((c) => (
                  <th key={c} className="py-2 px-3 text-center whitespace-nowrap">
                    {ROTULO_CAMPO[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TRANSICOES.map(([de, para]) => {
                const k = `${de}>${para}`
                return (
                  <tr key={k}>
                    <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">
                      {nome(de)} → {nome(para)}
                    </td>
                    {CAMPOS_ETAPA.map((c) => (
                      <td key={c} className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[#1E3A8A]"
                          checked={(requisitos[k] ?? []).includes(c)}
                          onChange={() => alternarRequisito(k, c)}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <Label>Motivo da alteração *</Label>
        <Textarea
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: separar a revisão interna da revisão do cliente"
        />
        {precisamRemap.some((e) => !remap[e.chave]) && (
          <p className="text-sm text-amber-700">
            Escolha para onde vão os cards das etapas que serão inativadas.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            onClick={salvar}
            disabled={
              salvando ||
              !alterado ||
              motivo.trim().length < 3 ||
              etapas.some((e) => !e.nome.trim()) ||
              precisamRemap.some((e) => !remap[e.chave])
            }
            className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            <Save className="w-4 h-4" /> {salvando ? 'Salvando…' : 'Salvar nova versão'}
          </Button>
          {alterado && (
            <Button variant="outline" onClick={() => void carregar()}>
              Descartar
            </Button>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <History className="w-5 h-5 text-[#1E3A8A]" /> Versões
        </h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {dados.versoes.map((v) => (
            <li key={v.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-800">
                  Versão {v.numero}
                  {v.ativa && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                      vigente
                    </span>
                  )}
                  {v.restaurada_de && (
                    <span className="ml-2 text-xs text-slate-500">
                      (restaurada da versão {v.restaurada_de})
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {quando(v.created)} · {v.autor?.nome ?? 'Sistema'}
                  {v.motivo ? ` · ${v.motivo}` : ''}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {[...v.config.etapas]
                    .sort((a, b) => a.ordem - b.ordem)
                    .map((e) => (e.ativa ? e.nome : `(${e.nome})`))
                    .join(' → ')}
                </p>
              </div>
              {!v.ativa && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => setRestaurar(v)}
                >
                  <RotateCcw className="w-4 h-4" /> Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {restaurar && dados.ativa && (
        <RestaurarDialog
          versao={restaurar}
          baseId={dados.ativa.id}
          contagem={contagem}
          onClose={() => setRestaurar(null)}
          onDone={async () => {
            setRestaurar(null)
            await carregar()
          }}
        />
      )}
    </div>
  )
}

function RestaurarDialog({
  versao,
  baseId,
  contagem,
  onClose,
  onDone,
}: {
  versao: VersaoFluxo
  baseId: string
  contagem: Record<string, number>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [remap, setRemap] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const ativas = versao.config.etapas.filter((e) => e.ativa)
  const precisam = versao.config.etapas.filter((e) => !e.ativa && (contagem[e.chave] ?? 0) > 0)

  const enviar = async () => {
    setEnviando(true)
    try {
      const r = await restaurarFluxo(versao.id, {
        base: baseId,
        motivo: motivo.trim(),
        remapeamentos: remap,
      })
      toast.success(`Configuração da versão ${versao.numero} restaurada como versão ${r.numero}.`)
      await onDone()
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 409) {
        toast.error(
          (err.response as { message?: string }).message ||
            'Configuração alterada por outra pessoa.',
        )
        await onDone()
      } else {
        const f = extractFieldErrors(err)
        toast.error(Object.values(f)[0] || getErrorMessage(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restaurar versão {versao.numero}</DialogTitle>
          <DialogDescription>
            Nada é apagado: a configuração antiga vira uma versão nova, e a atual continua no
            histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {precisam.map((e) => (
            <div key={e.chave} className="text-sm">
              <Label>
                Cards em “{e.nome}” ({contagem[e.chave]}) vão para:
              </Label>
              <Select
                value={remap[e.chave] || undefined}
                onValueChange={(v) => setRemap({ ...remap, [e.chave]: v })}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Escolha a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {ativas.map((a) => (
                    <SelectItem key={a.chave} value={a.chave}>
                      {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div>
            <Label>Motivo *</Label>
            <Textarea
              rows={2}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={enviar}
            disabled={enviando || motivo.trim().length < 3 || precisam.some((e) => !remap[e.chave])}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {enviando ? 'Restaurando…' : 'Restaurar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
