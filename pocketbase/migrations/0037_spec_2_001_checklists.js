// SPEC-2-001 (T2.01/T2.02) — modelos de checklist por disciplina e tipo (entrada/revisão),
// com tipologia opcional. O modelo guarda o rascunho; cada publicação grava uma versão
// imutável e numerada em checklist_versoes. Leitura para quem está logado; gravação só
// pelas rotas /backend/v1/checklists* (admin/diretor e coordenador).
// Só um modelo real vigente por disciplina + tipo + tipologia (índice parcial).
// Modelos de exemplo entram publicados e vigentes, marcados como "exemplo"; deixam de ser
// vigentes quando um modelo real é publicado para a mesma disciplina e tipo.
migrate(
  (app) => {
    const A =
      "@request.auth.id != '' && @request.auth.active = true && @request.auth.session_expires_at > @now"
    const disciplinas = app.findCollectionByNameOrId('disciplinas')
    const datas = [
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ]
    const usuario = (name) => ({
      name: name,
      type: 'relation',
      collectionId: '_pb_users_auth_',
      cascadeDelete: false,
      maxSelect: 1,
    })

    const modelos = new Collection({
      name: 'checklist_modelos',
      type: 'base',
      listRule: A,
      viewRule: A,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'disciplina',
          type: 'relation',
          required: true,
          collectionId: disciplinas.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['entrada', 'revisao'],
        },
        { name: 'tipologia', type: 'text', max: 120 },
        {
          name: 'estado',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['ativo', 'arquivado'],
        },
        { name: 'exemplo', type: 'bool' },
        { name: 'vigente', type: 'bool' },
        { name: 'versao_atual', type: 'number', onlyInt: true, min: 0 },
        { name: 'tem_rascunho', type: 'bool' },
        { name: 'rascunho', type: 'json', maxSize: 200000 },
        usuario('rascunho_por'),
        { name: 'rascunho_em', type: 'date' },
        usuario('criado_por'),
        { name: 'duplicado_de', type: 'text', max: 15 },
      ].concat(datas),
      indexes: [
        'CREATE INDEX idx_chk_modelos_disc ON checklist_modelos (disciplina, tipo)',
        'CREATE UNIQUE INDEX idx_chk_modelos_vigente ON checklist_modelos (disciplina, tipo, tipologia) WHERE vigente = TRUE AND exemplo = FALSE',
      ],
    })
    app.save(modelos)

    const versoes = new Collection({
      name: 'checklist_versoes',
      type: 'base',
      listRule: A,
      viewRule: A,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'modelo',
          type: 'relation',
          required: true,
          collectionId: modelos.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'numero', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'itens', type: 'json', required: true, maxSize: 200000 },
        { name: 'total_itens', type: 'number', onlyInt: true, min: 0 },
        { name: 'criticos', type: 'number', onlyInt: true, min: 0 },
        { name: 'nota', type: 'text', max: 500 },
        { name: 'republicada_de', type: 'number', onlyInt: true, min: 0 },
        usuario('autor'),
      ].concat(datas),
      indexes: ['CREATE UNIQUE INDEX idx_chk_versoes_num ON checklist_versoes (modelo, numero)'],
    })
    app.save(versoes)

    // ---------- modelos de exemplo ----------
    const EX = {
      hidraulica: {
        entrada: [
          ['Planta de arquitetura na revisão vigente', 'Base', 'critico', ''],
          ['Planta de estrutura com pilares, vigas e furações previstas', 'Base', 'critico', ''],
          ['Pontos de consumo e layout das áreas molhadas definidos', 'Base', 'normal', ''],
          [
            'Ponto de entrada de água e destino do esgoto informados',
            'Concessionária',
            'normal',
            '',
          ],
          ['Tipo de aquecimento definido (gás, elétrico, solar)', 'Definições', 'normal', ''],
        ],
        revisao: [
          [
            'Prumadas compatibilizadas com a estrutura (furos e shafts)',
            'Compatibilização',
            'critico',
            'Padrão interno',
          ],
          [
            'Pressões mínimas conferidas nos pontos mais desfavoráveis',
            'Dimensionamento',
            'critico',
            'NBR 5626',
          ],
          ['Tubos de queda e ventilação indicados', 'Esgoto', 'critico', 'NBR 8160'],
          ['Calhas e condutores com área de contribuição', 'Pluvial', 'normal', 'NBR 10844'],
          ['Legenda e simbologia no padrão Gavazzi', 'Apresentação', 'normal', 'Padrão interno'],
          ['Carimbo com revisão, data e responsável técnico', 'Apresentação', 'normal', ''],
        ],
      },
      eletrica: {
        entrada: [
          ['Planta de arquitetura na revisão vigente', 'Base', 'critico', ''],
          ['Planta de estrutura com pilares e vigas', 'Base', 'critico', ''],
          [
            'Carga e tipo de fornecimento informados pela concessionária',
            'Concessionária',
            'normal',
            '',
          ],
          ['Layout de mobiliário para pontos de tomada', 'Base', 'normal', ''],
          [
            'Lista de equipamentos especiais (elevador, bombas, ar-condicionado)',
            'Definições',
            'normal',
            '',
          ],
        ],
        revisao: [
          ['Quadro de cargas com balanceamento de fases', 'Dimensionamento', 'critico', 'NBR 5410'],
          [
            'Condutores e proteções dimensionados e coordenados',
            'Dimensionamento',
            'critico',
            'NBR 5410',
          ],
          ['DR e DPS indicados onde exigidos', 'Proteção', 'critico', 'NBR 5410'],
          [
            'Encaminhamentos compatibilizados com estrutura e hidráulica',
            'Compatibilização',
            'normal',
            '',
          ],
          ['Legenda e simbologia no padrão Gavazzi', 'Apresentação', 'normal', 'Padrão interno'],
          ['Carimbo com revisão, data e responsável técnico', 'Apresentação', 'normal', ''],
        ],
      },
      ppci: {
        entrada: [
          ['Planta de arquitetura na revisão vigente', 'Base', 'critico', ''],
          ['Ocupação, área e altura da edificação definidas', 'Classificação', 'critico', ''],
          [
            'Município e exigências locais do Corpo de Bombeiros levantados',
            'Classificação',
            'normal',
            '',
          ],
          ['Posição da reserva de incêndio definida', 'Definições', 'normal', ''],
        ],
        revisao: [
          [
            'Medidas de segurança exigidas para a ocupação conferidas',
            'Exigências',
            'critico',
            'Regulamentação local',
          ],
          [
            'Rotas de fuga, saídas e distâncias máximas conferidas',
            'Saídas',
            'critico',
            'Regulamentação local',
          ],
          ['Hidrantes, extintores e sinalização posicionados', 'Sistemas', 'normal', ''],
          ['Legenda e simbologia no padrão Gavazzi', 'Apresentação', 'normal', 'Padrão interno'],
          ['Carimbo com revisão, data e responsável técnico', 'Apresentação', 'normal', ''],
        ],
      },
      generico: {
        entrada: [
          ['Planta de arquitetura na revisão vigente', 'Base', 'critico', ''],
          ['Informações do cliente necessárias recebidas', 'Base', 'normal', ''],
          ['Interferências com outras disciplinas levantadas', 'Compatibilização', 'normal', ''],
        ],
        revisao: [
          ['Projeto compatibilizado com as demais disciplinas', 'Compatibilização', 'critico', ''],
          ['Cálculos e dimensionamentos conferidos', 'Dimensionamento', 'critico', ''],
          ['Legenda e simbologia no padrão Gavazzi', 'Apresentação', 'normal', 'Padrão interno'],
          ['Carimbo com revisão, data e responsável técnico', 'Apresentação', 'normal', ''],
        ],
      },
    }
    const chaveDe = (nome) => {
      const n = String(nome || '').toLowerCase()
      if (/hidr/.test(n)) return 'hidraulica'
      if (/el[eé]tr/.test(n)) return 'eletrica'
      if (/ppci|inc[eê]nd/.test(n)) return 'ppci'
      return 'generico'
    }
    let seq = 0
    const itensDe = (lista) =>
      lista.map((x) => {
        seq += 1
        return {
          id: 'ex' + seq,
          texto: x[0],
          grupo: x[1],
          severidade: x[2],
          referencia: x[3],
        }
      })
    for (const d of app.findRecordsByFilter('disciplinas', "id != ''", 'nome', 0, 0)) {
      if (d.getBool('personalizada')) continue
      const base = EX[chaveDe(d.getString('nome'))]
      for (const tipo of ['entrada', 'revisao']) {
        const itens = itensDe(base[tipo])
        const m = new Record(modelos)
        m.set('disciplina', d.id)
        m.set('tipo', tipo)
        m.set('tipologia', '')
        m.set('estado', 'ativo')
        m.set('exemplo', true)
        m.set('vigente', true)
        m.set('versao_atual', 1)
        m.set('tem_rascunho', false)
        app.save(m)
        const v = new Record(versoes)
        v.set('modelo', m.id)
        v.set('numero', 1)
        v.set('itens', itens)
        v.set('total_itens', itens.length)
        v.set('criticos', itens.filter((i) => i.severidade === 'critico').length)
        v.set('nota', 'Modelo de exemplo criado pelo sistema')
        app.save(v)
      }
    }
  },
  (app) => {
    for (const n of ['checklist_versoes', 'checklist_modelos']) {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    }
  },
)
