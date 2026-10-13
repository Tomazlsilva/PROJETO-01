import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { listMeusProjetos } from '@/services/projetos'
import {
  getMudancas,
  getPolitica,
  TIPO_MUDANCA_LABEL,
  type Mudanca,
  type Politica,
  type TipoMudanca,
} from '@/services/painel'

const selectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

const quando = (s: string) => {
  if (!s) return '—'
  return new Date(s.replace(' ', 'T')).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

const valor = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return 'nome' in o ? String(o.nome) : JSON.stringify(v)
  }
  return String(v)
}

// SPEC-1-007 (CA-1-007-07/11): trilha de mudanças, somente leitura.
// Administrador vê tudo; coordenador, os projetos que coordena.
export default function Mudancas() {
  const [form, setForm] = useState({ tipo: '', projeto: '', de: '', ate: '' })
  const [filtros, setFiltros] = useState(form)
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<{ total: number; itens: Mudanca[] } | null>(null)
  const [erro, setErro] = useState('')
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([])
  const [politica, setPolitica] = useState<Politica | null>(null)

  useEffect(() => {
    listMeusProjetos(true)
      .then((l) => setProjetos(l.map((p) => ({ id: p.id, nome: p.nome }))))
      .catch(() => setProjetos([]))
    getPolitica()
      .then(setPolitica)
      .catch(() => setPolitica(null))
  }, [])

  const carregar = useCallback(async () => {
    setErro('')
    setDados(null)
    try {
      setDados(await getMudancas({ ...filtros, pagina }))
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }, [filtros, pagina])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const paginas = dados ? Math.max(1, Math.ceil(dados.total / 50)) : 1

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <History className="w-6 h-6 text-[#1E3A8A]" /> Histórico de mudanças
        </h1>
        <p className="text-sm text-slate-500">
          Estado, prioridade, responsável, prazo, bloqueios, pendências e correções de tempo. Os
          registros não podem ser alterados nem apagados.
        </p>
      </div>

      <form
        className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 md:grid-cols-5 gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault()
          setPagina(1)
          setFiltros({ ...form })
        }}
      >
        <div>
          <Label className="text-xs">Tipo</Label>
          <select
            className={selectCls}
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="">Todos</option>
            {(Object.keys(TIPO_MUDANCA_LABEL) as TipoMudanca[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_MUDANCA_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Projeto</Label>
          <select
            className={selectCls}
            value={form.projeto}
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
        <Button type="submit" className="bg-[#1E3A8A] hover:bg-[#1E2A6B]">
          Filtrar
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
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">
            {dados.total} registro(s)
          </div>
          {dados.itens.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nenhuma mudança neste recorte.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Quando</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Onde</th>
                    <th className="px-3 py-2">O que mudou</th>
                    <th className="px-3 py-2">Quem</th>
                    <th className="px-3 py-2">Justificativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dados.itens.map((m, i) => (
                    <tr key={m.id + '-' + i} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {quando(m.quando)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{TIPO_MUDANCA_LABEL[m.tipo]}</td>
                      <td className="px-3 py-2">
                        {m.projeto_id ? (
                          <Link
                            to={`/projetos/${m.projeto_id}`}
                            className="text-[#1E3A8A] hover:underline"
                          >
                            {m.projeto || '—'}
                          </Link>
                        ) : (
                          '—'
                        )}
                        {m.disciplina && (
                          <div className="text-xs text-slate-500">{m.disciplina}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {m.descricao}
                        {m.campo && (
                          <div className="text-xs text-slate-500">
                            {valor(m.antes)} → {valor(m.depois)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{m.autor?.nome || 'Sistema'}</td>
                      <td className="px-3 py-2 text-slate-600">{m.justificativa || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {paginas > 1 && (
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-slate-100 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1}
                onClick={() => setPagina(pagina - 1)}
              >
                Anterior
              </Button>
              <span className="tabular-nums">
                {pagina} / {paginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= paginas}
                onClick={() => setPagina(pagina + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </section>
      )}

      {politica && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-1">
          <h2 className="font-bold text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#1E3A8A]" /> Política de auditoria
          </h2>
          <p>
            Registros somente de inclusão; retenção mínima de {politica.retencao_meses} meses. Quem
            consulta: {politica.consulta}
          </p>
          <p>
            Backup: {politica.backup_automatico} Cópias guardadas por{' '}
            {politica.backup_retencao_dias} dias. {politica.backup_criptografia}{' '}
            {politica.restauracao}
          </p>
        </section>
      )}
    </div>
  )
}
