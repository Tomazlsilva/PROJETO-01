import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Download, FileUp, Info, Loader2 } from 'lucide-react'
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
import { useAuth } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  baixarBaselineCsv,
  getBaseline,
  importarHistorico,
  type Baseline as Dados,
  type GrupoBaseline,
  type ResultadoImportacao,
} from '@/services/tempo'

const h = (seg: number) => (seg / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

// SPEC-1-006: baseline "antes" (histórico importado) × "depois" (apontado na Central).
// Só números agregados — nenhum indicador individual.
export default function Baseline() {
  const { role } = useAuth()
  const [tipologia, setTipologia] = useState('')
  const [disciplina, setDisciplina] = useState('')
  const [aplicados, setAplicados] = useState({ tipologia: '', disciplina: '' })
  const [dados, setDados] = useState<Dados | null>(null)
  const [importar, setImportar] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setDados(await getBaseline(aplicados.tipologia, aplicados.disciplina))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [aplicados])

  useEffect(() => {
    void carregar()
  }, [carregar])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#1E3A8A]" /> Baseline de touch time
          </h1>
          <p className="text-sm text-slate-500">
            “Antes” = histórico importado · “Depois” = apontado na Central (modo sombra).
          </p>
        </div>
        <div className="flex gap-2">
          {role === 'admin' && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setImportar(true)}>
              <FileUp className="w-4 h-4" /> Importar histórico
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
            onClick={() =>
              baixarBaselineCsv(aplicados.tipologia, aplicados.disciplina).catch((err) =>
                toast.error(getErrorMessage(err)),
              )
            }
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      <form
        className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setAplicados({ tipologia: tipologia.trim(), disciplina: disciplina.trim() })
        }}
      >
        <div className="w-full sm:w-64">
          <Label className="text-xs">Tipologia (exata)</Label>
          <Input
            value={tipologia}
            onChange={(e) => setTipologia(e.target.value)}
            placeholder="Todas"
          />
        </div>
        <div className="w-full sm:w-64">
          <Label className="text-xs">Disciplina (exata)</Label>
          <Input
            value={disciplina}
            onChange={(e) => setDisciplina(e.target.value)}
            placeholder="Todas"
          />
        </div>
        <Button type="submit" variant="outline">
          Aplicar filtros
        </Button>
      </form>

      {!dados ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {dados.comparacao.situacao === 'inconclusivo' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>Comparação inconclusiva.</strong> Os dados abaixo valem como registro, mas a
              amostra ainda não permite comparar “antes” e “depois”.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Grupo titulo="Antes (histórico)" g={dados.grupos.antes} />
            <Grupo titulo="Depois (Central)" g={dados.grupos.depois} />
          </div>
          {dados.comparacao.situacao === 'conclusivo' &&
            dados.comparacao.diferenca_media_horas !== null && (
              <p className="text-sm text-slate-700">
                Diferença na média de touch time por projeto (depois − antes):{' '}
                <strong>{dados.comparacao.diferenca_media_horas.toLocaleString('pt-BR')} h</strong>
              </p>
            )}
          <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-2">
            <p className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#1E3A8A]" /> {dados.protocolo}
            </p>
            <p>
              Fora do cálculo: {dados.excluidos.pendentes} timer(s) esquecido(s) aguardando revisão,{' '}
              {dados.excluidos.em_andamento} em andamento, {dados.excluidos.excluidos} excluído(s)
              com justificativa e {dados.excluidos.substituidos} versão(ões) substituída(s) por
              correção.
            </p>
            <p className="font-semibold text-slate-700">{dados.aviso}</p>
          </div>
        </>
      )}

      {importar && (
        <ImportarDialog
          onClose={() => setImportar(false)}
          onFeito={async () => {
            setImportar(false)
            await carregar()
          }}
        />
      )}
    </div>
  )
}

function Grupo({ titulo, g }: { titulo: string; g: GrupoBaseline }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
            g.situacao === 'conclusivo'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          {g.situacao === 'conclusivo' ? 'Amostra suficiente' : 'Inconclusivo'}
        </span>
      </div>
      {g.motivo && <p className="text-xs text-amber-800">{g.motivo}</p>}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Item rotulo="Projetos" valor={String(g.n_projetos)} />
        <Item rotulo="Apontamentos" valor={String(g.n_eventos)} />
        <Item rotulo="Touch time total" valor={h(g.touch_seg) + ' h'} />
        <Item
          rotulo="Média por projeto"
          valor={g.media_touch_horas_por_projeto.toLocaleString('pt-BR') + ' h'}
        />
        <Item
          rotulo="Mediana por projeto"
          valor={g.mediana_touch_horas_por_projeto.toLocaleString('pt-BR') + ' h'}
        />
        <Item rotulo="Elaboração" valor={h(g.elaboracao_seg) + ' h'} />
        <Item rotulo="Revisão" valor={h(g.revisao_seg) + ' h'} />
        <Item rotulo="Espera (à parte)" valor={h(g.espera_seg) + ' h'} />
      </dl>
    </section>
  )
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="font-semibold text-slate-900 tabular-nums">{valor}</dd>
    </div>
  )
}

function ImportarDialog({
  onClose,
  onFeito,
}: {
  onClose: () => void
  onFeito: () => Promise<void>
}) {
  const [arquivo, setArquivo] = useState<{ nome: string; texto: string } | null>(null)
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null)
  const [enviando, setEnviando] = useState(false)

  const ler = async (f: File | undefined) => {
    setPrevia(null)
    if (!f) return
    if (f.size > 2_000_000) {
      toast.error('Arquivo acima de 2 MB.')
      return
    }
    const texto = await f.text()
    setArquivo({ nome: f.name, texto })
    try {
      setPrevia(await importarHistorico(f.name, texto, true))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const confirmar = async () => {
    if (!arquivo) return
    setEnviando(true)
    try {
      const r = await importarHistorico(arquivo.nome, arquivo.texto, false)
      toast.success(`${r.aceitas} linha(s) importada(s); ${r.rejeitadas} rejeitada(s).`)
      await onFeito()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar histórico (grupo “antes”)</DialogTitle>
          <DialogDescription>
            CSV com as colunas <code>projeto; disciplina; tipologia; categoria; duracao_horas</code>{' '}
            e, se houver, <code>fonte; data; qualidade; etapa</code>. Categoria: elaboracao, revisao
            ou espera. Linhas inválidas são recusadas e listadas; as válidas guardam arquivo, fonte
            e data da importação.
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => void ler(e.target.files?.[0])} />
        {previa && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{previa.total}</strong> linha(s):{' '}
              <strong className="text-green-700">{previa.aceitas}</strong> válida(s),{' '}
              <strong className="text-red-700">{previa.rejeitadas}</strong> com erro.
            </p>
            {previa.erros.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-red-100 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 text-left">
                    <tr>
                      <th className="px-2 py-1">Linha</th>
                      <th className="px-2 py-1">Campo</th>
                      <th className="px-2 py-1">Problema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {previa.erros.map((e, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1 tabular-nums">{e.linha}</td>
                        <td className="px-2 py-1">{e.campo}</td>
                        <td className="px-2 py-1">{e.mensagem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void confirmar()}
            disabled={enviando || !previa || previa.aceitas === 0}
            className="bg-[#1E3A8A] hover:bg-[#1E2A6B]"
          >
            {enviando ? 'Importando…' : `Importar ${previa?.aceitas ?? 0} linha(s) válida(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
