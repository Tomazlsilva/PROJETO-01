// SPEC-1-006 (T1.27, CA-1-006-10) — a cada 15 minutos, timer aberto há mais de 12h
// vira pendência de revisão: sai do cálculo do baseline até alguém confirmar o fim real.
cronAdd('tempo_timers_12h', '*/15 * * * *', () => {
  const limite = new Date(Date.now() - 12 * 3600000).toISOString().replace('T', ' ')
  for (const t of $app.findRecordsByFilter(
    'tempo_eventos',
    "(status = 'ativo' || status = 'pausado') && inicio < {:l}",
    '',
    0,
    0,
    { l: limite },
  )) {
    t.set('status', 'pendente_revisao')
    t.set('segmento_aberto_em', '')
    $app.save(t)
  }
})
