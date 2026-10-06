// SPEC-1-002 (CA-1-002-08) — trava de último nível: nenhum caminho grava link de
// entrada inseguro. Somente HTTPS com nome de domínio público; sem IP, nome interno,
// porta fora do padrão ou credencial. O servidor nunca acessa o link.
onRecordValidate((e) => {
  const valor = e.record.getString('link_entrada')
  if (valor) {
    const s = valor.trim()
    let motivo = ''
    const m = /^https:\/\/([^\/?#]+)(?:[\/?#].*)?$/.exec(s)
    if (s.length > 2000 || /[\s\\<>"]/.test(s) || !m) motivo = 'formato'
    else {
      const autoridade = m[1]
      const pm = /^([^:]*)(?::(\d+))?$/.exec(autoridade)
      const host = pm ? pm[1].toLowerCase() : ''
      const internos = [
        'localhost',
        'local',
        'internal',
        'intranet',
        'lan',
        'home',
        'corp',
        'localdomain',
        'arpa',
        'test',
        'invalid',
        'example',
      ]
      if (autoridade.indexOf('@') >= 0 || autoridade.charAt(0) === '[' || !pm) motivo = 'host'
      else if (pm[2] && pm[2] !== '443') motivo = 'porta'
      else if (
        !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(
          host,
        )
      )
        motivo = 'host'
      else if (internos.indexOf(host.split('.').pop()) >= 0) motivo = 'interno'
    }
    if (motivo) {
      throw new BadRequestError('Link de entrada não permitido.', {
        link_entrada: new ValidationError('link_inseguro', 'Link de entrada não permitido.'),
      })
    }
  }
  return e.next()
}, 'projetos')
