// SPEC-2-006 (T2.18) — Administração › Pastas: modelo de pastas padrão com variáveis,
// prévia da árvore, versões e simulação para os projetos existentes. A criação real no
// OneDrive fica desligada até o Microsoft 365 liberar o acesso (T2.17).
import { useCallback, useEffect, useState } from 'react'
import { FolderTree, History, Loader2, PlayCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { extractFieldErrors, getErrorMessage } from '@/lib/pocketbase/errors'
import {
  getPastas,
  previaPastas,
  publicarPastas,
  simularTodos,
  type ArvoreProjeto,
  type DadosPastas,
} from '@/services/pastas'

const PADRAO_CAMINHO = '{cliente}/{local}/{projeto}'
const PADRAO_SUB = [
  '{disciplina}/Recebidos',
  '{disciplina}/Revisões',
  '{disciplina}/PDF',
  '{disciplina}/DWG',
]
const VARS = ['{cliente}', '{local}', '{projeto}', '{disciplina}']
const quando = (s: string) => (s ? new Date(s.replace(' ', 'T')).toLocaleString('pt-BR') : '—')
const erroDe = (err: unknown) => {
  const f = extractFieldErrors(err)
  return Object.values(f)[0] || getErrorMessage(err)
}

export default function Pastas() {
  const [d, setD] = useState<DadosPastas | null>(null)
  const [caminho, setCaminho] = useState(PADRAO_CAMINHO)
  const [sub, setSub] = useState(PADRAO_SUB.join('\n'))
  const [motivo, setMotivo] = useState('')
  const [projeto, setProjeto] = useState('')
  const [previa, setPrevia] = useState<ArvoreProjeto | null>(null)
  const [erroPrevia, setErroPrevia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [simulacao, setSimulacao] = useState<Awaited<ReturnType<typeof simularTodos>> | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await getPastas()
      setD(r)
      if (r.vigente) {
        setCaminho(r.vigente.caminho_projeto)
        setSub(r.vigente.subpastas.join('\n'))
      }
      setProjeto((p) => p || r.projetos[0]?.id || '')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const linhas = sub
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  // prévia ao vivo (com pequeno atraso para não chamar a cada tecla)
  useEffect(() => {
    if (!projeto) return
    const t = setTimeout(() => {
      previaPastas(projeto, caminho, linhas)
        .then((r) => {
          setPrevia(r)
          setErroPrevia('')
        })
        .catch((err) => {
          setPrevia(null)
          setErroPrevia(erroDe(err))
        })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto, caminho, sub])

  if (!d) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
      </div>
    )
  }

  const alterado =
    !d.vigente ||
    d.vigente.caminho_projeto !== caminho.trim() ||
    d.vigente.subpastas.join('\n') !== linhas.join('\n')
  const proxima = (d.vigente?.numero ?? 0) + 1

  const publicar = async () => {
    setEnviando(true)
    try {
      const r = await publicarPastas(caminho.trim(), linhas, motivo.trim())
      toast.success(`Modelo de pastas publicado como versão ${r.numero}.`)
      setMotivo('')
      await carregar()
    } catch (err) {
      toast.error(erroDe(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <FolderTree className="w-6 h-6 text-[#1E3A8A]" /> Pastas padrão no OneDrive
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Estrutura que todo projeto novo vai receber.{' '}
          {d.vigente ? `Versão vigente: v${d.vigente.numero}.` : 'Ainda não há modelo publicado.'}
        </p>
      </div>

      {!d.config.acesso_liberado && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Criação automática desligada.</strong> Falta o administrador do Microsoft 365
          liberar o acesso a arquivos para o aplicativo da Central e informar a pasta raiz dos
          clientes. O modelo já pode ser montado e publicado; quando o acesso for liberado, a
          Central passa a criar as pastas e dá para criar as dos projetos que já existem (com
          simulação antes).
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <section className="flex-1 min-w-0 w-full bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Modelo</h2>
          <div>
            <Label>Pasta raiz</Label>
            <p className="text-sm text-slate-500 mt-1">
              {d.config.pasta_raiz || '[a informar pelo administrador do Microsoft 365]'}
            </p>
          </div>
          <div>
            <Label htmlFor="caminho">Caminho da pasta do projeto *</Label>
            <Input
              id="caminho"
              value={caminho}
              maxLength={500}
              onChange={(e) => setCaminho(e.target.value)}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sub">Subpastas (uma por linha)</Label>
            <Textarea
              id="sub"
              rows={7}
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Linha com {'{disciplina}'} se repete para cada disciplina do projeto. Linha sem ela é
              criada uma vez na pasta do projeto.
            </p>
          </div>
          <div>
            <Label>Variáveis</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() =>
                    setSub(
                      sub +
                        (sub.endsWith('\n') || !sub ? '' : '\n') +
                        (v === '{disciplina}' ? '{disciplina}/' : v),
                    )
                  }
                  className="font-mono text-xs font-semibold text-[#1E3A8A] bg-blue-50 border border-blue-200 rounded px-2 py-1 hover:bg-blue-100"
                  title="Inserir nas subpastas"
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Campo vazio sai do caminho. Caracteres que o OneDrive não aceita (como / : * ? " &lt;
              &gt; |) viram “-”.
            </p>
          </div>
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <Label htmlFor="motivo">O que mudou (opcional)</Label>
            <Input
              id="motivo"
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                className="gap-1 bg-[#1E3A8A] hover:bg-[#1E2A6B]"
                disabled={enviando || !alterado || !!erroPrevia}
                onClick={() => void publicar()}
              >
                <Send className="w-4 h-4" /> Publicar versão {proxima}
              </Button>
              {alterado && d.vigente && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCaminho(d.vigente!.caminho_projeto)
                    setSub(d.vigente!.subpastas.join('\n'))
                  }}
                >
                  Descartar
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="w-full lg:w-[420px] shrink-0 bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900">Prévia da árvore</h2>
          <select
            aria-label="Projeto da prévia"
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"
            value={projeto}
            onChange={(e) => setProjeto(e.target.value)}
          >
            {d.projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          {erroPrevia ? (
            <p className="text-sm text-red-600">{erroPrevia}</p>
          ) : !previa ? (
            <p className="text-sm text-slate-500">
              {d.projetos.length ? 'Montando…' : 'Cadastre um projeto para ver a prévia.'}
            </p>
          ) : (
            <>
              {previa.campos_vazios.length > 0 && (
                <p className="text-xs text-amber-700">
                  Este projeto está sem {previa.campos_vazios.join(' e ')}: o trecho sai do caminho.
                </p>
              )}
              <Arvore caminhos={previa.caminhos} />
            </>
          )}
          <p className="text-xs text-slate-500">
            Pasta que já existir com o mesmo nome será aproveitada. A Central só cria pastas: nunca
            apaga, move ou renomeia nada no OneDrive.
          </p>
        </section>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Projetos que já existem</h2>
            <p className="text-sm text-slate-500">
              Simule o que seria criado com o modelo vigente. Nada é criado agora.
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-1"
            disabled={!d.vigente}
            onClick={async () => {
              try {
                setSimulacao(await simularTodos())
              } catch (err) {
                toast.error(erroDe(err))
              }
            }}
          >
            <PlayCircle className="w-4 h-4" /> Simular
          </Button>
        </div>
        {simulacao && (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">
              {simulacao.projetos} projeto(s) · {simulacao.pastas} pasta(s) no total.{' '}
              {simulacao.aviso}
            </p>
            <ul className="divide-y divide-slate-100 text-sm max-h-80 overflow-y-auto border border-slate-100 rounded-lg">
              {simulacao.lista.map((x) => (
                <li key={x.projeto.id} className="px-3 py-2">
                  <span className="font-semibold text-slate-800">{x.projeto.nome}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {x.pasta_projeto} · {x.caminhos.length} pasta(s), {x.disciplinas}{' '}
                    disciplina(s)
                    {x.campos_vazios.length > 0 && ` · sem ${x.campos_vazios.join(' e ')}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <History className="w-5 h-5 text-[#1E3A8A]" /> Versões
        </h2>
        {d.versoes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma versão publicada.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {d.versoes.map((v, i) => (
              <li key={v.id} className="py-2.5">
                <p className="font-semibold text-slate-800">
                  Versão {v.numero}
                  {i === 0 && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                      vigente
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {quando(v.created)} · {v.autor?.nome ?? 'Sistema'}
                  {v.motivo ? ` · ${v.motivo}` : ''}
                </p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {v.caminho_projeto} · {v.subpastas.join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Arvore({ caminhos }: { caminhos: string[] }) {
  const ordenados = [...caminhos].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800 max-h-96 overflow-auto">
      <div className="text-slate-500">[pasta raiz]/</div>
      {ordenados.map((c) => {
        const partes = c.split('/')
        return (
          <div
            key={c}
            style={{ paddingLeft: `${partes.length * 14}px` }}
            className="whitespace-nowrap"
          >
            └ {partes[partes.length - 1]}/
          </div>
        )
      })}
    </div>
  )
}
