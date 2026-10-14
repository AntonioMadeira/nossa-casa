/**
 * Os ecrãs a correr — o texto que eles produzem, não o que está escrito neles.
 *
 * As provas de leitura garantem que nenhum ecrã tem um nome escrito à mão.
 * Não garantem que o que aparece no lugar desse nome está certo: um
 * `adultos[1]` indefinido dá «undefined deve à Rita» e passa em todas elas.
 */

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { StoreProvider, useStore } = require('../src/store');

const { buildTheme } = require('../src/theme');
// As folhas leem as margens seguras, como na app a sério. Sem o fornecedor
// por cima, abrir uma folha rebenta com «No safe area value available» — e a
// app tem-no na raiz, portanto o teste também.
const { SafeAreaProvider } = require('react-native-safe-area-context');
const comMargens = (filho) => React.createElement(SafeAreaProvider,
  { initialMetrics: { frame: { x: 0, y: 0, width: 402, height: 874 },
                      insets: { top: 47, left: 0, right: 0, bottom: 34 } } }, filho);

const Inicio = require('../src/screens/Inicio').default;
const Tarefas = require('../src/screens/Tarefas').default;
const Dinheiro = require('../src/screens/Dinheiro').default;

// Renderiza um ecrã dentro da loja e devolve todo o texto que ele produz.
const textoDe = (Ecra, props = {}) => {
  let arvore = null;
  const t = buildTheme('violet', false);
  const Envolve = () => {
    useStore();   // garante que o ecrã corre com a loja montada
    return React.createElement(Ecra, { t, user: 'Rita', go: () => {}, onSaude: () => {},
      onEquip: () => {}, onClose: () => {}, ...props });
  };
  TestRenderer.act(() => {
    arvore = TestRenderer.create(
      React.createElement(StoreProvider, null, React.createElement(Envolve)));
  });
  const junta = (n) => {
    if (n === null || n === undefined || n === false) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(junta).join(' ');
    return junta(n.children || (n.props && n.props.children) || null);
  };
  return junta(arvore.toJSON());
};

describe('Os ecrãs dizem os nomes da casa, não nomes escritos à mão', () => {
  test('o Início anuncia quem deve a quem, com a concordância certa', () => {
    const texto = textoDe(Inicio);
    expect(texto).toContain('O Tomás deve à Rita');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('NaN');
    // e o valor está no formato do euro, com espaço inquebrável antes do €
    expect(texto).toMatch(/86,50 €/);
  });

  test('as Tarefas filtram por todos os membros da casa, e só por eles', () => {
    // O filtro passou a avatares (12/09/2026, `design/filtro-de-membros.dc.html`):
    // o nome já não está escrito na fila, está no rótulo em voz de cada bola —
    // «Mostrar só as tarefas do Léo». Lê-se a árvore, não o texto.
    let arvore = null;
    const t = buildTheme('violet', false);
    const Envolve = () => { useStore(); return React.createElement(Tarefas, { t, user: 'Rita' }); };
    TestRenderer.act(() => {
      arvore = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Envolve)));
    });
    const rotulos = arvore.root.findAll(n => typeof n.type === 'string' && n.props
      && typeof n.props.accessibilityLabel === 'string').map(n => n.props.accessibilityLabel);
    expect(rotulos).toContain('Todos');
    for (const n of ['Rita', 'Tomás', 'Léo', 'Mia']) {
      expect(rotulos.some(l => new RegExp(`^Mostrar só as tarefas d[oa] ${n}$`).test(l))).toBe(true);
    }
    // E só por eles: quatro bolas, nem uma a mais.
    expect(rotulos.filter(l => /^Mostrar só as tarefas /.test(l))).toHaveLength(4);
    expect(textoDe(Tarefas)).not.toContain('undefined');
  });

  test('o Dinheiro mostra o acerto entre os adultos da casa', () => {
    const texto = textoDe(Dinheiro);
    expect(texto).toContain('O Tomás deve à Rita');
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('NaN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A Gestão da casa: as quatro operações têm de estar no ecrã, não só na loja.
const Gestao = require('../src/screens/Gestao').default;

describe('A Gestão põe as quatro operações no ecrã', () => {
  // O separador arranca no Orçamento; o texto de Membros só aparece depois de
  // se lá tocar. Renderiza-se e procura-se pela árvore inteira, incluindo o
  // que está por trás do separador ativo — o que interessa é que existe.
  const arvoreDe = (Ecra, props = {}) => {
    let r = null;
    const t = buildTheme('violet', false);
    TestRenderer.act(() => {
      r = TestRenderer.create(comMargens(React.createElement(StoreProvider, null,
        React.createElement(Ecra, { t, user: 'Rita', onClose: () => {}, ...props }))));
    });
    return r;
  };

  test('a Gestão monta para quem administra a casa', () => {
    const r = arvoreDe(Gestao);
    expect(r.toJSON()).toBeTruthy();
  });

  // Os separadores são Pressable com o rótulo dentro; toca-se no de Membros e
  // lê-se o que aparece. Sem isto o teste passava com o ecrã vazio.
  const abrirMembros = (r) => {
    const alvo = r.root.findAll(n => n.props
      && n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === 'Membros')[0];
    TestRenderer.act(() => { alvo.props.onPress(); });
    const junta = (n) => {
      if (n === null || n === undefined || n === false) return '';
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(junta).join(' ');
      return junta(n.children || (n.props && n.props.children) || null);
    };
    return junta(r.toJSON());
  };

  test('o separador Membros mostra o nome da casa e o botão de acrescentar', () => {
    const texto = abrirMembros(arvoreDe(Gestao));
    expect(texto).toContain('Nome da família');
    expect(texto).toContain('Bengui');            // o nome atual, não um literal no ecrã
    expect(texto).toContain('acrescentar membro');
    expect(texto).toContain('Membros e PIN');
    for (const n of ['Rita', 'Tomás', 'Léo', 'Mia']) expect(texto).toContain(n);
    expect(texto).not.toContain('undefined');
  });

  // Sem servidor a casa é a de demonstração, e o ecrã tem de o dizer em vez
  // de oferecer quatro botões que não fazem nada.
  test('sem servidor, a Gestão explica que a casa é de demonstração', () => {
    const texto = abrirMembros(arvoreDe(Gestao));
    expect(texto).toContain('casa de demonstração');
  });

  // A folha do membro tem de trazer o nome já preenchido — se abrisse vazia,
  // tocar em Guardar renomeava para nada.
  test('a folha do membro abre com o nome, e o botão de renomear só aparece a mudar', () => {
    const r = arvoreDe(Gestao);
    abrirMembros(r);
    const linha = r.root.findAll(n => n.props
      && n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Léo')[0];
    TestRenderer.act(() => { linha.props.onPress(); });
    const campoNome = r.root.findAll(n => n.props && n.props.maxLength === 30
      && typeof n.props.onChangeText === 'function')[0];
    expect(campoNome.props.value).toBe('Léo');

    const junta = (n) => {
      if (n === null || n === undefined || n === false) return '';
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(junta).join(' ');
      return junta(n.children || (n.props && n.props.children) || null);
    };
    // Com o nome por mudar, não há botão: renomear para o mesmo nome não é
    // uma operação, e um botão que não faz nada é pior do que nenhum.
    expect(junta(r.toJSON())).not.toContain('Guardar nome');
    TestRenderer.act(() => { campoNome.props.onChangeText('Leonardo'); });
    expect(junta(r.toJSON())).toContain('Guardar nome');

    // O Léo da demonstração ainda não tem PIN, por isso não há PIN a perder e
    // o aviso não aparece. Avisar de uma perda que não acontece é ruído.
    expect(junta(r.toJSON())).not.toContain('O PIN é apagado');
  });

  // E com PIN definido, o aviso aparece ANTES de se guardar. Um PIN apagado
  // sem avisar é uma criança que não entra e não percebe porquê.
  test('quem tem PIN é avisado de que o perde, antes de guardar', () => {
    const r = arvoreDe(Gestao);
    abrirMembros(r);
    // define-se um PIN ao Léo pela própria loja, como um adulto faria
    const loja = r.root.findAll(n => n.props && n.props.accessibilityLabel === 'Léo')[0];
    TestRenderer.act(() => { loja.props.onPress(); });
    const campoPin = r.root.findAll(n => n.props && n.props.maxLength === 6)[0];
    TestRenderer.act(() => { campoPin.props.onChangeText('482016'); });
    const guardar = r.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Guardar PIN')[0];
    TestRenderer.act(() => { guardar.props.onPress(); });

    // reabre-se e muda-se o nome
    TestRenderer.act(() => {
      r.root.findAll(n => n.props && n.props.accessibilityLabel === 'Léo')[0].props.onPress();
    });
    const campoNome = r.root.findAll(n => n.props && n.props.maxLength === 30
      && typeof n.props.onChangeText === 'function')[0];
    TestRenderer.act(() => { campoNome.props.onChangeText('Leonardo'); });

    const junta = (n) => {
      if (n === null || n === undefined || n === false) return '';
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(junta).join(' ');
      return junta(n.children || (n.props && n.props.children) || null);
    };
    expect(junta(r.toJSON())).toContain('O PIN é apagado quando o nome muda');
  });

  // O papel muda-se dentro da folha do membro. O diálogo antigo escolhia o
  // rótulo com `FEM(name)`, e `name` não existia nesse âmbito.
  // Duas coisas de uma vez: o `FEM(name)` do diálogo lia uma variável fora
  // de âmbito, e o `FEM` de que dependia lê a constante das sementes — uma
  // Ana acrescentada à casa saía «Administrador». O género do membro está no
  // quadro da casa, não numa constante.
  test('o rótulo do papel lê o género do membro, não uma constante', () => {
    const fonte = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src/screens/Gestao.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(fonte).not.toMatch(/FEM\(name\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `0/0` é NaN, e NaN não rebenta: escreve «NaN %» no ecrã. Numa casa sem
// orçamento definido — que é toda a casa nova — isso aparecia no Início e no
// Dinheiro, que são os dois ecrãs mais lidos.
describe('Sem orçamento definido, nenhum ecrã escreve NaN', () => {
  const { SEM_DINHEIRO_SEMEADO } = require('../src/store');

  const semOrcamento = (Ecra) => {
    let arvore = null;
    const t = buildTheme('violet', false);
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    const Envolve = () => React.createElement(Ecra, { t, user: 'Rita', go: () => {},
      onSaude: () => {}, onEquip: () => {}, onClose: () => {} });
    TestRenderer.act(() => {
      arvore = TestRenderer.create(React.createElement(StoreProvider, null,
        React.createElement(React.Fragment, null,
          React.createElement(Sonda), React.createElement(Envolve))));
    });
    TestRenderer.act(() => { api.set(SEM_DINHEIRO_SEMEADO()); });
    const junta = (n) => {
      if (n === null || n === undefined || n === false) return '';
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(junta).join(' ');
      return junta(n.children || (n.props && n.props.children) || null);
    };
    return junta(arvore.toJSON());
  };

  test('o Início não escreve NaN nem Infinity', () => {
    const texto = semOrcamento(Inicio);
    expect(texto).not.toMatch(/NaN|Infinity/);
    // INVARIANTE #4 de caminho: o zero também leva espaço inquebrável antes
    // do €. Escrevi esta linha com um espaço normal à primeira e ela falhou —
    // que é exatamente o que se quer de uma prova do formato.
    expect(texto).toContain('0,00 €');
  });

  test('o Dinheiro não escreve NaN nem Infinity', () => {
    const texto = semOrcamento(Dinheiro);
    expect(texto).not.toMatch(/NaN|Infinity/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A folha de exportação, a correr. A casa a sério tem um adulto só, portanto o
// seletor de destinatário nunca aparece lá — é aqui que se prova que aparece
// quando há a quem enviar, e que não aparece quando não há.
describe('A folha de exportar a saúde', () => {
  const ExportarSaude = require('../src/sheets/ExportarSaude').default;
  const { StoreProvider: SP } = require('../src/store');

  const CONSULTAS = [
    { id: 'h1', member: 'Léo', specialty: 'Dentista', doctor: 'Dr. Cardoso', day: 'd2026-08-28', time: '10:00' },
    { id: 'h2', member: 'Léo', specialty: 'Pediatria', doctor: 'Dra. Nunes', day: 'd2026-06-12', time: '09:30' },
  ];

  const abrir = (props) => {
    let r = null;
    const t = buildTheme('violet', false);
    TestRenderer.act(() => {
      r = TestRenderer.create(comMargens(React.createElement(SP, null,
        React.createElement(ExportarSaude, {
          t, membro: 'Léo', casa: 'Bengui', consultas: CONSULTAS, docs: [], notas: {},
          onClose: () => {}, ...props }))));
    });
    return r;
  };
  const junta = (n) => {
    if (n === null || n === undefined || n === false) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(junta).join(' ');
    return junta(n.children || (n.props && n.props.children) || null);
  };

  test('abre no âmbito por onde foi aberta, e diz o que vai sair', () => {
    const texto = junta(abrir({ user: 'Rita', ambitoInicial: 'consulta', alvoInicial: 'h1' }).toJSON());
    expect(texto).toContain('Só uma consulta');
    expect(texto).toContain('Dentista');                 // o detalhe diz qual
    expect(texto).toContain('1 consulta');
    expect(texto).toContain('Guardar como PDF');
  });

  test('a ficha completa conta as duas', () => {
    const texto = junta(abrir({ user: 'Rita', ambitoInicial: 'tudo' }).toJSON());
    expect(texto).toContain('2 consultas');
  });

  // Um endereço escrito à pressa é irreversível. Só os adultos da casa.
  test('oferece os outros adultos da casa, e o endereço só ao escolher', () => {
    const r = abrir({ user: 'Rita', ambitoInicial: 'tudo' });
    expect(junta(r.toJSON())).toContain('Enviar a');
    expect(junta(r.toJSON())).toContain('Tomás');
    // O endereço não está no ecrã até alguém ser escolhido.
    expect(junta(r.toJSON())).not.toContain('tomas.bengui@gmail.com');
    expect(junta(r.toJSON())).toContain('Escolha quem recebe');

    // `findAll` devolve também os elementos anfitriões, que levam o rótulo mas
    // não o manipulador. Escolhe-se o que tem mesmo um `onPress`.
    const chip = r.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Tomás'
      && typeof n.props.onPress === 'function')[0];
    expect(chip).toBeTruthy();
    TestRenderer.act(() => { chip.props.onPress(); });

    const depois = junta(r.toJSON());
    expect(depois).toContain('tomas.bengui@gmail.com');
    expect(depois).toContain('Enviar ao Tomás');   // concordância do quadro da casa
  });

  test('nenhuma criança da casa aparece como destinatário', () => {
    const texto = junta(abrir({ user: 'Rita', ambitoInicial: 'tudo' }).toJSON());
    const depoisDoEnviarA = texto.slice(texto.indexOf('Enviar a'));
    for (const crianca of ['Léo', 'Mia']) expect(depoisDoEnviarA).not.toContain(crianca);
  });

  test('quem está a exportar não se oferece a si própria', () => {
    const texto = junta(abrir({ user: 'Tomás', ambitoInicial: 'tudo' }).toJSON());
    expect(texto).toContain('Rita');
    expect(texto).not.toContain('tomas.bengui@gmail.com');
  });

  test('o aviso diz que a app não envia sozinha, e que o correio não vai cifrado', () => {
    const texto = junta(abrir({ user: 'Rita', ambitoInicial: 'tudo' }).toJSON());
    expect(texto).toContain('não envia nada sozinha');
    expect(texto).toContain('não vai cifrado');
    expect(texto).not.toContain('Não é enviado para lado nenhum');
  });

  test('sem consultas, não há nada a exportar e diz-se', () => {
    const texto = junta(abrir({ user: 'Rita', consultas: [], ambitoInicial: 'tudo' }).toJSON());
    expect(texto).toContain('Nada a exportar neste âmbito.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// «Só uma consulta» estava apagada quando a folha abria pelo botão do topo: a
// opção existia, não se podia tocar, e não havia forma de dizer QUAL. O mesmo
// para a especialidade, que escolhia a primeira sozinha.
describe('Cada âmbito deixa escolher o seu alvo', () => {
  const ExportarSaude = require('../src/sheets/ExportarSaude').default;

  const CONSULTAS = [
    { id: 'h1', specialty: 'Dentista', doctor: 'Dr. Cardoso', day: 'd2026-08-28', time: '10:00' },
    { id: 'h2', specialty: 'Pediatria', doctor: 'Dra. Nunes', day: 'd2026-06-12', time: '09:30' },
    { id: 'h3', specialty: 'Dentista', doctor: 'Dr. Cardoso', day: 'd2026-03-04', time: '' },
  ];
  const abrir = (props = {}) => {
    let r = null;
    const t = buildTheme('violet', false);
    TestRenderer.act(() => {
      r = TestRenderer.create(comMargens(React.createElement(StoreProvider, null,
        React.createElement(ExportarSaude, {
          t, membro: 'Léo', casa: 'Bengui', user: 'Rita', consultas: CONSULTAS,
          docs: [], notas: {}, ambitoInicial: 'tudo', onClose: () => {}, ...props }))));
    });
    return r;
  };
  const junta = (n) => {
    if (n === null || n === undefined || n === false) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(junta).join(' ');
    return junta(n.children || (n.props && n.props.children) || null);
  };
  const tocar = (r, rot) => {
    const n = r.root.findAll(x => x.props && x.props.accessibilityLabel === rot
      && typeof x.props.onPress === 'function')[0];
    expect(n).toBeTruthy();
    TestRenderer.act(() => { n.props.onPress(); });
  };

  test('«Só uma consulta» já não está apagada quando se abre pelo topo', () => {
    const r = abrir();
    const opcao = r.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Só uma consulta'
      && typeof n.props.onPress === 'function')[0];
    expect(opcao).toBeTruthy();
    expect(opcao.props.accessibilityState.disabled).toBeFalsy();
  });

  test('escolher «uma consulta» mostra as consultas para escolher', () => {
    const r = abrir();
    expect(junta(r.toJSON())).not.toContain('Qual consulta');
    tocar(r, 'Só uma consulta');
    const texto = junta(r.toJSON());
    expect(texto).toContain('Qual consulta');
    expect(texto).toContain('Escolha qual consulta.');   // e diz que falta
  });

  test('e escolher uma delas conta uma só', () => {
    const r = abrir();
    tocar(r, 'Só uma consulta');
    tocar(r, 'Pediatria');
    const texto = junta(r.toJSON());
    expect(texto).toContain('1 consulta');
    expect(texto).not.toContain('Escolha qual consulta.');
  });

  // ⚠ 25/09/2026: a especialidade deixou de ser pastilhas em fila e passou a
  // ser o `CampoDeEscolha` (opção B de `design/escolher-corredor.dc.html`) —
  // as especialidades de uma casa crescem com cada consulta nova, e a fila
  // crescia com elas. São dois toques: o campo abre a lista, a lista escolhe.
  const escolherEspecialidade = (r, esp) => {
    tocar(r, 'Qual especialidade — por escolher');
    tocar(r, esp);
  };

  test('escolher «por especialidade» mostra as especialidades, sem adivinhar', () => {
    const r = abrir();
    tocar(r, 'Por especialidade');
    const texto = junta(r.toJSON());
    expect(texto).toContain('Qual especialidade');
    expect(texto).toContain('Escolha qual especialidade.');   // não escolhe por si
    escolherEspecialidade(r, 'Dentista');
    expect(junta(r.toJSON())).toContain('2 consultas');       // as duas de dentista
  });

  // Trocar de âmbito e voltar não pode apagar o que já se tinha escolhido.
  test('cada âmbito lembra-se do seu alvo', () => {
    const r = abrir();
    tocar(r, 'Só uma consulta');
    tocar(r, 'Pediatria');
    tocar(r, 'Por especialidade');
    escolherEspecialidade(r, 'Dentista');
    tocar(r, 'Só uma consulta');
    expect(junta(r.toJSON())).toContain('1 consulta');    // a Pediatria continua lá
  });

  test('abrir pelo ícone de uma consulta já traz essa escolhida', () => {
    const r = abrir({ ambitoInicial: 'consulta', alvoInicial: 'h2' });
    expect(junta(r.toJSON())).toContain('1 consulta');
    expect(junta(r.toJSON())).not.toContain('Escolha qual consulta.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O «Precisa de Si» desaparecia quando não havia nada. Uma secção que some faz
// a app parecer meia carregada — e tira a única coisa que diz que se olhou e
// está tudo em dia.
describe('O «Precisa de Si» fica sempre, e leva ao sítio certo', () => {
  const { SEM_DINHEIRO_SEMEADO, BLANK } = require('../src/store');

  const comEstado = (patch, props = {}) => {
    let arvore = null, api = null;
    const t = buildTheme('violet', false);
    const Sonda = () => { api = useStore(); return null; };
    const Ecra = () => React.createElement(Inicio, { t, user: 'Rita', go: () => {},
      onSaude: () => {}, onEquip: () => {}, onFicha: () => {}, ...props });
    TestRenderer.act(() => {
      arvore = TestRenderer.create(React.createElement(StoreProvider, null,
        React.createElement(React.Fragment, null,
          React.createElement(Sonda), React.createElement(Ecra))));
    });
    if (patch) TestRenderer.act(() => { api.set(patch); });
    const junta = (n) => {
      if (n === null || n === undefined || n === false) return '';
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(junta).join(' ');
      return junta(n.children || (n.props && n.props.children) || null);
    };
    return { texto: junta(arvore.toJSON()), arvore };
  };

  test('com coisas a fazer, mostra-as', () => {
    const { texto } = comEstado(null);
    expect(texto).toContain('Precisa de Si');
    expect(texto).toContain('Contas por acertar');
  });

  test('sem nada, o título fica e diz que está tudo em dia', () => {
    // Uma casa sem sementes: nada por acertar, nada por fazer, nada a expirar.
    const { texto } = comEstado({ ...BLANK(), ...SEM_DINHEIRO_SEMEADO() });
    expect(texto).toContain('Precisa de Si');
    expect(texto).toContain('Nada à sua espera');
    expect(texto).not.toContain('Contas por acertar');
  });

  // Uma linha que diz «Frigorífico» e abre uma lista de doze obriga a fazer a
  // busca outra vez, depois de a app já a ter feito.
  test('a garantia abre o equipamento, e não a lista', () => {
    let pedido = null;
    const { arvore } = comEstado(null, { onEquip: (id) => { pedido = id; } });
    const linha = arvore.root.findAll(n => n.props
      && /Garantia a expirar/.test(n.props.accessibilityLabel || '')
      && typeof n.props.onPress === 'function')[0];
    expect(linha).toBeTruthy();
    TestRenderer.act(() => { linha.props.onPress(); });
    expect(pedido).toBeTruthy();
    expect(typeof pedido).toBe('string');     // o id do equipamento, não `true`
  });

  test('a receita abre a ficha do membro a que pertence', () => {
    let pedido = null;
    const { arvore } = comEstado(null, { onFicha: (m) => { pedido = m; } });
    const linha = arvore.root.findAll(n => n.props
      && /Receita a expirar/.test(n.props.accessibilityLabel || '')
      && typeof n.props.onPress === 'function')[0];
    expect(linha).toBeTruthy();
    TestRenderer.act(() => { linha.props.onPress(); });
    expect(pedido).toBe('Léo');               // a receita das sementes é do Léo
  });

  // Toda a linha tem de levar a algum lado: uma linha sem destino num ecrã
  // onde as vizinhas todas têm é a que faz duvidar de todas.
  test('nenhuma linha fica sem destino', () => {
    const { arvore } = comEstado(null);
    // Cada rótulo tem de ter PELO MENOS um nó com manipulador. `findAll`
    // devolve também os elementos anfitriões, que levam o rótulo e não o
    // `onPress` — exigir a todos que o tenham reprova o ecrã por um motivo
    // que não é dele.
    const rotulos = [...new Set(arvore.root.findAll(n => n.props
      && n.props.accessibilityRole === 'button'
      && /Contas por acertar|Envelope|Garantia|Receita|Consulta|tarefas por fazer/
        .test(n.props.accessibilityLabel || ''))
      .map(n => n.props.accessibilityLabel))];
    expect(rotulos.length).toBeGreaterThan(2);
    for (const rot of rotulos) {
      const comDestino = arvore.root.findAll(n => n.props
        && n.props.accessibilityLabel === rot && typeof n.props.onPress === 'function');
      expect(comDestino.length).toBeGreaterThan(0);
    }
  });
});
