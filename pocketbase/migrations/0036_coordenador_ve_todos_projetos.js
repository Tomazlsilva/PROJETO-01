// Coordenadores passam a ver (só ver) todos os projetos, como o administrativo.
// Editar continua só com administrador e o coordenador do próprio projeto.
const COLECOES = [
  'projetos',
  'projeto_disciplinas',
  'projeto_historico',
  'entregas',
  'entrega_alocacoes',
  'entrega_historico',
]
const ANTES = "@request.auth.role = 'administrativo'"
const DEPOIS = "@request.auth.role = 'administrativo' || @request.auth.role = 'coordenador'"

const trocar = (app, de, para) => {
  for (const nome of COLECOES) {
    let col = null
    try {
      col = app.findCollectionByNameOrId(nome)
    } catch (_) {
      continue
    }
    let mudou = false
    for (const r of ['listRule', 'viewRule']) {
      if (col[r] === null || col[r] === undefined) continue
      const atual = String(col[r])
      if (atual.indexOf(de) < 0) continue
      if (de === ANTES && atual.indexOf(DEPOIS) >= 0) continue
      col[r] = atual.split(de).join(para)
      mudou = true
    }
    if (mudou) app.save(col)
  }
}

migrate(
  (app) => trocar(app, ANTES, DEPOIS),
  (app) => trocar(app, DEPOIS, ANTES),
)
