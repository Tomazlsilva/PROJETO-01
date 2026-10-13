// SPEC-1-003 — todo card novo (disciplina incluída em projeto) entra na primeira
// etapa ativa do fluxo vigente e ganha o registro de criação no histórico.
onRecordCreate((e) => {
  if (!e.record.getString('etapa')) {
    let primeira = 'entrada_pendente'
    try {
      const ativas = e.app.findRecordsByFilter('fluxo_versoes', 'ativa = true', '-numero', 1, 0)
      if (ativas.length > 0) {
        const etapas = JSON.parse(ativas[0].getString('config')).etapas || []
        const ordem = [
          'entrada_pendente',
          'pronto',
          'em_elaboracao',
          'aguardando_revisao',
          'em_correcao',
          'aprovado',
        ]
        for (const k of ordem) {
          const et = etapas.find((x) => x.chave === k)
          if (et && et.ativa) {
            primeira = k
            break
          }
        }
      }
    } catch (_) {}
    e.record.set('etapa', primeira)
  }
  e.record.set('bloqueado', false)
  e.next()
  try {
    const t = new Record(e.app.findCollectionByNameOrId('transicoes'))
    t.set('card', e.record.id)
    t.set('projeto', e.record.getString('projeto'))
    t.set('tipo', 'criacao')
    t.set('para', e.record.getString('etapa'))
    e.app.save(t)
  } catch (err) {
    e.app.logger().error('registro de criação do card falhou', 'card', e.record.id)
  }
}, 'projeto_disciplinas')
