// SPEC-1-008 (CA-1-008-02) — o prazo do projeto e a Final principal são o mesmo dado.
// Projeto criado com prazo → nasce a Final principal nessa data.
// Prazo do projeto alterado (por qualquer rota) → a Final principal muda junto, na mesma
// transação, com registro no histórico da entrega. O caminho inverso (mudar a data da
// Final principal no calendário) é feito pela rota de entregas, que grava o prazo.
onRecordCreate((e) => {
  e.next()
  const prazo = e.record.getString('prazo')
  if (!prazo) return
  try {
    const col = e.app.findCollectionByNameOrId('entregas')
    const f = new Record(col)
    f.set('projeto', e.record.id)
    f.set('tipo', 'final')
    f.set('principal', true)
    f.set('data', prazo.slice(0, 10) + ' 12:00:00.000Z')
    f.set('origem', 'central')
    e.app.save(f)
    const h = new Record(e.app.findCollectionByNameOrId('entrega_historico'))
    h.set('entrega', f.id)
    h.set('projeto', e.record.id)
    h.set('acao', 'criada')
    h.set('depois', prazo.slice(0, 10))
    h.set('detalhes', { origem: 'prazo do projeto', tipo: 'final', principal: true })
    e.app.save(h)
  } catch (err) {
    e.app.logger().error('Final principal não criada', 'projeto', e.record.id, 'erro', String(err))
    throw err
  }
}, 'projetos')

onRecordUpdate((e) => {
  const antes = e.record.original().getString('prazo').slice(0, 10)
  const depois = e.record.getString('prazo').slice(0, 10)
  e.next()
  if (!depois || antes === depois) return
  const lista = e.app.findRecordsByFilter(
    'entregas',
    "projeto = {:p} && tipo = 'final' && principal = true",
    '',
    1,
    0,
    { p: e.record.id },
  )
  const hcol = e.app.findCollectionByNameOrId('entrega_historico')
  if (lista.length === 0) {
    const f = new Record(e.app.findCollectionByNameOrId('entregas'))
    f.set('projeto', e.record.id)
    f.set('tipo', 'final')
    f.set('principal', true)
    f.set('data', depois + ' 12:00:00.000Z')
    f.set('origem', 'central')
    e.app.save(f)
    const h = new Record(hcol)
    h.set('entrega', f.id)
    h.set('projeto', e.record.id)
    h.set('acao', 'criada')
    h.set('depois', depois)
    h.set('detalhes', { origem: 'prazo do projeto', tipo: 'final', principal: true })
    e.app.save(h)
    return
  }
  const f = lista[0]
  const atual = f.getString('data').slice(0, 10)
  if (atual === depois) return // a mudança veio do próprio calendário
  f.set('data', depois + ' 12:00:00.000Z')
  e.app.save(f)
  const h = new Record(hcol)
  h.set('entrega', f.id)
  h.set('projeto', e.record.id)
  h.set('acao', 'data_alterada')
  h.set('antes', atual)
  h.set('depois', depois)
  h.set('detalhes', { origem: 'prazo do projeto' })
  e.app.save(h)
}, 'projetos')
