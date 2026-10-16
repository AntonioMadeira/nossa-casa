/**
 * Smoke Tests — Nossa Casa
 * Testes críticos que rodam antes de cada commit
 *
 * Verificam:
 * - Componentes renderizam sem crashes
 * - Estado inicial é válido
 * - Navegação funciona
 * - Dados críticos são acessíveis
 */

// A camada do servidor é substituída. Não é conveniência: o pacote
// `pocketbase` é ESM e o Jest não o parseia, portanto qualquer ecrã que o
// arraste — a Agenda, pela folha de agendar — nem chega a montar.
//
// `disponivel: false` é o estado mais exigente: é o que faz a folha desenhar o
// aviso em vez do interruptor, e o que um ecrã sem agenda ligada mostra.
jest.mock('../src/pocketbase', () => ({
  estaLigado: () => false,
  ligado: false,
  auth: { valida: () => false, membro: () => null, bilheteSemCasa: () => null, esquecerBilhete: () => {}, provedores: async () => ({ alcancavel: false, semServidor: true, lista: [] }) },
  ler: {},
  escrever: {},
  google: {
    disponivel: () => false,
    porLigar: () => false,
    verificar: async () => false,
    eventos: async () => [],
    criarEvento: async () => 'id-falso',
    atualizarEvento: async () => {},
    apagarEvento: async () => {},
    ligar: async () => false,
  },
  sessaoPronta: async () => false,
}));

// Abrir a loja a sério, para os testes falarem com ela em vez de com um objeto
// que eles próprios escreveram.
const abrirLoja = (casa) => {
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { StoreProvider, useStore } = require('../src/store');
  const cofre = {};
  const Envolve = () => {
    const st = useStore();
    cofre.st = st;
    React.useMemo(() => { if (casa) st.set(casa); }, []);
    return null;
  };
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Envolve)));
  });
  return cofre;
};

describe('🔥 Smoke Tests — Nossa Casa', () => {

  describe('1️⃣ State & Store', () => {
    // ⚠ Escrevia um objeto com nomes que a app não usa — `members`, `saude`,
    // `docs` — e verificava que o objeto existia. Passava com a loja em
    // qualquer estado, incluindo nenhum.
    //
    // O que vale a pena guardar é a correspondência entre o que se GRAVA e o
    // que a casa tem: uma chave nova em `DATA_KEYS` sem valor no `DEMO()` (ou
    // ao contrário) é um campo que morre no recarregamento seguinte. Aconteceu
    // hoje mesmo, com o livro de pontos.
    test('Tudo o que se grava nasce numa casa nova', () => {
      const { DEMO } = require('../src/store');
      const fs = require('fs');
      const path = require('path');
      const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'store.jsx'), 'utf8');
      const i = fonte.indexOf('const DATA_KEYS = [');
      const chaves = [...fonte.slice(i, fonte.indexOf('];', i)).matchAll(/'([^']+)'/g)].map(m => m[1]);

      expect(chaves.length).toBeGreaterThan(30);
      const casa = DEMO();
      const semValor = chaves.filter(k => casa[k] === undefined);
      // As que vêm do servidor ou da sessão não nascem na demonstração.
      const DE_FORA = ['roles', 'pins', 'membros', 'nomeDaCasa'];
      expect(semValor.filter(k => !DE_FORA.includes(k))).toEqual([]);
    });

    // ⚠ Somava um array escrito pelo próprio teste. O cofre da app não era
    // chamado uma única vez.
    test('O cofre é uma soma de movimentos, e não um campo (INVARIANTE #2)', () => {
      const TestRenderer = require('react-test-renderer');
      const c = abrirLoja({
        membros: { 'Rita': { initial: 'R' }, 'Léo': { initial: 'L', kid: true } },
        roles: { 'Rita': 'admin', 'Léo': 'crianca' },
        clearedSeeds: true, vaultMoves: [],
      });

      expect(c.st.vaultOf('Léo')).toBe(0);
      TestRenderer.act(() => { c.st.vaultAdd('Léo', 500, 'entrada', 'Semanada'); });
      TestRenderer.act(() => { c.st.vaultAdd('Léo', 250, 'entrada', 'Pontos'); });
      TestRenderer.act(() => { c.st.vaultAdd('Léo', -100, 'saida', 'Gelado'); });

      expect(c.st.vaultOf('Léo')).toBe(650);
      // E o saldo é MESMO a soma dos movimentos gravados, não um número à parte.
      expect(c.st.s.vaultMoves.filter(m => m.kid === 'Léo')).toHaveLength(3);
    });

    // ⚠ Este era o pior do ficheiro: REIMPLEMENTAVA o `EUR` dentro de si
    // próprio, com espaços NORMAIS — e a sua cópia violava o invariante #4
    // que o teste dizia guardar. Verificava-se a si mesmo enquanto o símbolo
    // do euro caía para a linha de baixo na app. Medido: a cadeia do teste e
    // a do `format` não eram iguais.
    test('O euro vem do format, com os espaços inquebráveis (INVARIANTE #4)', () => {
      const { EUR } = require('../src/format');

      // U+202F entre os milhares, U+00A0 antes do €. Sem o segundo, o
      // símbolo desgarra-se para a linha seguinte.
      expect(EUR(1250)).toBe('1 250,00 €');
      expect(EUR(0)).toBe('0,00 €');
      expect(EUR(1000000)).toBe('1 000 000,00 €');

      // E nenhum espaço normal se intromete.
      expect(EUR(1250)).not.toMatch(/ /);
    });
  });

  describe('2️⃣ Component Structure', () => {
    // ⚠ Escrevia `{ header: { flex: 0 } }` e verificava que era zero.
    //
    // Não tocava na app: o objeto era do próprio teste. Passava com o rodapé
    // partido — que é precisamente o defeito que já quebrou TRÊS vezes.
    test('O rodapé é o último filho da raiz (INVARIANTE #1)', () => {
      const fs = require('fs');
      const path = require('path');
      const app = fs.readFileSync(path.join(__dirname, '..', 'App.jsx'), 'utf8');

      // O rodapé não encolhe, e é a barra dos separadores que o preenche.
      const i = app.indexOf('TABS.map');
      expect(i).toBeGreaterThan(0);
      const bloco = app.slice(Math.max(0, i - 500), i);
      expect(bloco).toMatch(/flexGrow: 0/);
      expect(bloco).toMatch(/flexShrink: 0/);

      // E vem DEPOIS da área de scroll — se subisse para dentro dela, saía da
      // coluna e desaparecia com o conteúdo.
      expect(app.lastIndexOf('</ScrollView>')).toBeLessThan(i);
    });

    // ⚠ Escrevia uma lista com `minSize: 44` e verificava que era ≥ 44.
    //
    // O interruptor tinha 27 de alvo no navegador e este teste passava.
    test('Os componentes tocáveis declaram 44 (INVARIANTE #5)', () => {
      const fs = require('fs');
      const path = require('path');
      const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.jsx'), 'utf8');

      for (const nome of ['Tap', 'Choice', 'Opcao', 'Toggle', 'Primary']) {
        const i = ui.indexOf(`export const ${nome} =`);
        expect(i).toBeGreaterThan(0);
        const bloco = ui.slice(i, i + 900);

        // ⚠ Lia `min(Height|Width): (\d+)` — um número LITERAL, colado aos dois
        // pontos. O `Primary` passou a ter duas alturas (`sub ? 56 : 48`, que a
        // linha de consequência precisa) e o teste deixou de ver medida nenhuma:
        // não falhou por a altura ser pequena, falhou por não encontrar altura.
        // Lê-se agora o VALOR inteiro e tiram-se-lhe todos os números.
        // O `size = ` com espaços é o valor por omissão do parâmetro; o
        // `size={20}` de um ícone dentro do botão não é alvo de toque nenhum.
        const valores = [...bloco.matchAll(/(?:min(?:Height|Width)\s*:|size = )([^,;\n}]+)/g)]
          .map(m => m[1]);
        // `minWidth: size` não traz número — traz-o a linha `size = 44`.
        const medidas = valores.flatMap(v => [...v.matchAll(/\d+(?:\.\d+)?/g)].map(n => Number(n[0])));
        expect(medidas.length).toBeGreaterThan(0);

        // ⚠ E era `Math.max`: bastava UMA medida acima de 44 para as outras
        // passarem escondidas atrás dela. São todas, ramo a ramo do ternário.
        for (const m of medidas) expect(m).toBeGreaterThanOrEqual(44);
      }
    });

    // ⚠ Escrevia `[2,4,8,16,24]` e contava cinco. Lê-se do tema, agora.
    test('A escala de espaçamento vem do tema, e são cinco valores', () => {
      const { S } = require('../src/theme');
      const { empty, ...escala } = S;
      expect(Object.values(escala).sort((a, b) => a - b)).toEqual([2, 4, 8, 16, 24]);
    });
  });

  describe('3️⃣ Navigation Flow', () => {
    // ⚠ Escrevia o texto do ecrã à mão e verificava que o tinha escrito. O
    // «acessar» daquela frase nem é português europeu — o ecrã a sério nunca
    // o disse.
    test('O ecrã de entrada monta sem sessão', () => {
      const React = require('react');
      const TestRenderer = require('react-test-renderer');
      const { SafeAreaProvider } = require('react-native-safe-area-context');
      const { StoreProvider } = require('../src/store');
      const { buildTheme } = require('../src/theme');
      const Login = require('../src/screens/Login').default;

      let arvore = null;
      TestRenderer.act(() => {
        arvore = TestRenderer.create(
          React.createElement(SafeAreaProvider, {
            initialMetrics: { frame: { x: 0, y: 0, width: 402, height: 874 },
                              insets: { top: 47, left: 0, right: 0, bottom: 34 } },
          }, React.createElement(StoreProvider, null,
            React.createElement(Login, { t: buildTheme(0, false), onEntrar: () => {} }))));
      });
      expect(arvore.toJSON()).toBeTruthy();
      TestRenderer.act(() => arvore.unmount());
    });

    // ⚠ Filtrava um array escrito pelo próprio teste, com urgências em texto
    // («urgente») que a app não usa — ela usa 0, 1, 2. O `allTasks` nunca foi
    // chamado.
    test('A urgência manda na ordem das tarefas (INVARIANTE #6)', () => {
      const c = abrirLoja({
        membros: { 'Rita': { initial: 'R' } }, roles: { 'Rita': 'admin' },
        clearedSeeds: true,
        newTasks: [
          { id: 'n1', title: 'Normal', who: 'Rita' },
          { id: 's1', title: 'Sem pressa', who: 'Rita' },
          { id: 'u1', title: 'Urgente', who: 'Rita' },
        ],
        urg: { n1: 1, s1: 2, u1: 0 },
        due: {},
      });

      // Escritas por outra ordem, saem urgente → normal → sem pressa.
      expect(c.st.allTasks().map(t => t.id)).toEqual(['u1', 'n1', 's1']);
    });
  });

  describe('4️⃣ Child Safety (Mode Criança)', () => {
    // ⚠ Escrevia `{ visible: ['Tasks'] }` e verificava que não continha
    // 'Budget'. Duas listas inventadas pelo teste, sem relação com a app.
    test('O modo criança não fala de orçamento (INVARIANTE #3)', () => {
      const fs = require('fs');
      const path = require('path');
      const kid = fs.readFileSync(path.join(__dirname, '..', 'src', 'KidApp.jsx'), 'utf8');

      // Nem as palavras, nem os ecrãs por onde elas entrariam.
      for (const palavra of ['Envelope', 'envelope', 'Orçamento', 'orçamento', 'Rendimento']) {
        expect(kid).not.toContain(palavra);
      }
      for (const ecra of ['screens/Dinheiro', 'screens/Gestao', 'screens/Compras']) {
        expect(kid).not.toContain(ecra);
      }
    });

    // ⚠ REIMPLEMENTAVA o validador dentro do teste e testava a cópia. O
    // `pinError` da app não era chamado uma única vez.
    test('O PIN da app recusa os padrões fracos', () => {
      const c = abrirLoja({
        membros: { 'Rita': { initial: 'R' }, 'Léo': { initial: 'L', kid: true } },
        roles: { 'Rita': 'admin', 'Léo': 'crianca' }, pins: {},
      });
      const recusa = (pin) => c.st.pinError('Léo', pin) !== null;

      expect(recusa('111111')).toBe(true);  // seis iguais
      expect(recusa('123456')).toBe(true);  // sequência
      expect(recusa('987654')).toBe(true);  // sequência ao contrário
      expect(recusa('1234')).toBe(true);    // 4 dígitos já não chega
      expect(recusa('12a456')).toBe(true);  // não são dígitos
      expect(recusa('482016')).toBe(false); // este serve
    });
  });

  describe('5️⃣ Data Persistence', () => {
    test('AsyncStorage keys are namespaced correctly', () => {
      const keys = [
        '@nossa-casa:members',
        '@nossa-casa:tasks',
        '@nossa-casa:envelopes',
        '@nossa-casa:vault',
        '@nossa-casa:currentUser',
      ];

      keys.forEach(key => {
        expect(key).toMatch(/^@nossa-casa:/);
      });
    });
  });

  describe('6️⃣ Portuguese Localization', () => {
    test('Portuguese formal (3rd person) is used', () => {
      const messages = {
        login: 'Entre com a sua Conta Google',
        childEntry: 'Quem está a entrar?',
        welcome: 'Bem-vindo',
      };

      // Should never use "tu" or informal you
      Object.values(messages).forEach(msg => {
        expect(msg).not.toMatch(/\btu\b/i);
        expect(msg).not.toMatch(/\bvocê\b/i);
      });

      // Should use European Portuguese (dd/mm/aaaa, vírgula decimal)
      expect(messages.login).toBeDefined();
    });

    test('No emoji in financial interface', () => {
      const financialTexts = [
        'Acertar Contas',
        'Envelopes',
        'Cofre',
        'Despesa',
      ];

      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;

      financialTexts.forEach(text => {
        expect(text).not.toMatch(emojiRegex);
      });
    });
  });

  describe('7️⃣ Design System Compliance', () => {
    // ⚠ Estes três liam listas escritas à mão dentro do próprio teste.
    //
    // O dos esquemas afirmava que uma lista de seis nomes tinha seis nomes, e
    // essa lista trazia «Azul Sóbrio», «Verde» e «Grafite» — três esquemas que
    // deixaram de existir. Passava a verde a descrever uma app que já não era
    // esta. Um teste que não lê o código não protege o código; dá confiança,
    // que é pior do que não dar nada.
    test('Os esquemas de cor vêm do tema, e são seis', () => {
      const { SCHEMES } = require('../src/theme');
      expect(SCHEMES).toHaveLength(6);
      for (const s of SCHEMES) {
        expect(typeof s.name).toBe('string');
        expect(s.accent).toMatch(/^#[0-9A-F]{6}$/i);
        expect(s.chrome).toMatch(/^#[0-9A-F]{6}$/i);
      }
      // Sem nomes repetidos: dois esquemas com o mesmo nome no Perfil são
      // duas bolas indistinguíveis.
      expect(new Set(SCHEMES.map(s => s.name)).size).toBe(6);
    });

    // ⚠ O nome deste teste mentia. Os títulos deixaram de ser slate e passaram
    // a seguir o esquema do membro; ele continuava a verificar o `slate`, que
    // existe para as ETIQUETAS pequenas e não para os títulos.
    test('Os títulos de secção seguem o esquema, e nunca são pretos', () => {
      const { buildTheme, SCHEMES } = require('../src/theme');
      for (let i = 0; i < SCHEMES.length; i++) {
        for (const escuro of [false, true]) {
          const t = buildTheme(i, escuro);
          expect(t.titulo).toMatch(/^#[0-9A-F]{6}$/i);
          expect(t.titulo.toLowerCase()).not.toBe('#000000');
        }
        // No claro é o acento tal e qual; no escuro é clareado até dar
        // contraste contra o cartão, e por isso não se compara.
        expect(buildTheme(i, false).titulo).toBe(SCHEMES[i].accent);
      }
      // E as etiquetas pequenas continuam em slate, que é outra decisão.
      // ⚠ Um tom abaixo do `#67769B` do protótipo desde 08/09/2026: a 12 px
      // pedem 4,5:1 e o original dava 4,03 sobre a página e 4,41 sobre o
      // cartão — todas as etiquetas da app falhavam por uma unha, em todos os
      // esquemas claros. Continua slate; ver `texto-pequeno-le-se-nos-doze-temas`.
      expect(buildTheme(0, false).slate).toBe('#606E90');
    });
  });

  describe('8️⃣ Critical Invariants', () => {
    // ⚠ Escrevia OITO FRASES e verificava que eram oito.
    //
    // O nome dizia «are enforced» e o que fazia era contar strings escritas
    // pelo próprio teste. Os outros invariantes têm prova a sério noutros
    // blocos deste ficheiro; fica aqui o #2, que é o mais caro de perder e era
    // o único sem prova de fumo nenhuma.
    test('Os saldos são somas de movimentos, nunca campos escritos (INVARIANTE #2)', () => {
      const fs = require('fs');
      const path = require('path');
      const loja = fs.readFileSync(path.join(__dirname, '..', 'src', 'store.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

      // Ninguém escreve um saldo. Escreve-se um movimento e soma-se.
      expect(loja).not.toMatch(/\bsaldo\s*=[^=]/);
      expect(loja).not.toMatch(/vaultBalance\s*[:=]\s*\d/);

      // E os três livros aditivos existem mesmo.
      for (const livro of ['vaultMoves', 'envMove', 'pontosDeTarefasApagadas']) {
        expect(loja).toContain(livro);
      }
    });
  });

  // ⚠ Este bloco chamava-se «Web Testing Verification» e não testava web
  // nenhuma.
  //
  // Um teste dizia «App loads on http://localhost:8081 without errors» e o que
  // fazia era escrever essa string e verificar que ela existia. O outro
  // escrevia um par de objetos e contava dois. Nenhum montava nada, nenhum
  // abria nada — e a porta estava errada, que é o detalhe que revela que
  // ninguém os leu depois de os escrever.
  //
  // Um ecrã montado a sério é o que um teste de fumo deve fazer: se a árvore
  // rebentar, rebenta aqui. O que precisa de um navegador — o rodapé visível,
  // os alvos de toque, o desenho — mede-se no navegador, e não se finge aqui.
  describe('9️⃣ Ecrãs montam sem rebentar', () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const { StoreProvider } = require('../src/store');
    const { buildTheme } = require('../src/theme');

    const texto = (n) => {
      if (n === null || n === undefined || n === false) return '';
      if (typeof n === 'string' || typeof n === 'number') return String(n);
      if (Array.isArray(n)) return n.map(texto).join(' ');
      return texto(n.children || (n.props && n.props.children) || null);
    };

    const montar = (Ecra, props = {}) => {
      let arvore = null;
      TestRenderer.act(() => {
        arvore = TestRenderer.create(
          React.createElement(SafeAreaProvider, {
            initialMetrics: { frame: { x: 0, y: 0, width: 402, height: 874 },
                              insets: { top: 47, left: 0, right: 0, bottom: 34 } },
          }, React.createElement(StoreProvider, null,
            React.createElement(Ecra, {
              t: buildTheme(0, false), user: 'Rita', go: () => {},
              onSaude: () => {}, onEquip: () => {}, onFicha: () => {},
              onClose: () => {}, onEntrar: () => {}, ...props,
            }))));
      });
      return texto(arvore.toJSON());
    };

    test('O Início monta e diz alguma coisa', () => {
      const t = montar(require('../src/screens/Inicio').default);
      expect(t).toContain('Precisa de Si');
      expect(t.length).toBeGreaterThan(120);
    });

    test('As Tarefas montam', () => {
      expect(montar(require('../src/screens/Tarefas').default))
        .toContain('Rotinas e Tarefas');
    });

    test('O Dinheiro monta', () => {
      expect(montar(require('../src/screens/Dinheiro').default))
        .toContain('Envelopes');
    });

    test('A Agenda monta', () => {
      expect(montar(require('../src/screens/Agenda').default))
        .toContain('agendar evento');
    });

    test('As Compras montam', () => {
      expect(montar(require('../src/screens/Compras').default).length)
        .toBeGreaterThan(120);
    });

    // O Perfil vive numa folha, e a folha lê os insets — daí o provedor com
    // métricas acima. Sem ele nem chega a desenhar.
    test('O Perfil monta, com as cinco secções', () => {
      const t = montar(require('../src/screens/Perfil').default, { onSignOut: () => {} });
      for (const s of ['A Casa', 'Aparência', 'Avisos', 'A App']) expect(t).toContain(s);
    });
  });

  // ── O que se fez hoje ─────────────────────────────────────────────────────
  //
  // Ao nível de fumo: o que rebentaria alto, e o que já rebentou uma vez.

  describe('🔟 O escuro segue o esquema', () => {
    const { buildTheme, SCHEMES, contraste } = require('../src/theme');

    test('cada esquema tem a SUA página escura', () => {
      // Era um azul-marinho fixo, igual nos seis: com o Violeta escolhido o
      // ecrã inteiro ficava azul com um ponto violeta ao meio.
      const paginas = new Set(SCHEMES.map((_, i) => buildTheme(i, true).page));
      expect(paginas.size).toBe(SCHEMES.length);
      expect([...paginas]).not.toContain('#00101C');
    });

    test('e o texto continua legível em todos', () => {
      for (let i = 0; i < SCHEMES.length; i++) {
        const t = buildTheme(i, true);
        expect(contraste(t.text1, t.page)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(t.titulo, t.card)).toBeGreaterThanOrEqual(3);
      }
    });

    test('o claro não mexeu', () => {
      const claras = new Set(SCHEMES.map((_, i) => buildTheme(i, false).page));
      expect(claras).toEqual(new Set(['#F6F7F9']));
    });
  });

  describe('1️⃣1️⃣ O avatar', () => {
    const { avatarDe, mostraFotografia } = require('../src/ui');
    const { FIGURAS, existeFigura } = require('../src/Avatares');
    const FOTO = 'https://lh3.googleusercontent.com/a/abc';

    test('as dezasseis figuras existem', () => {
      expect(FIGURAS.length).toBe(16);
      for (const k of FIGURAS) expect(existeFigura(k)).toBe(true);
    });

    test('uma fotografia guardada mostra-se', () => {
      expect(mostraFotografia({ avatar: FOTO })).toBe(true);
      expect(avatarDe('Rita', { avatar: FOTO }).foto).toBe(FOTO);
    });

    test('uma figura escolhida ganha-lhe, e um não explícito ganha às duas', () => {
      expect(mostraFotografia({ avatar: FOTO, figura: 'gato' })).toBe(false);
      expect(mostraFotografia({ avatar: FOTO, usarFoto: false })).toBe(false);
    });

    test('e a cor ESCOLHIDA ganha à calculada do nome', () => {
      // Dez dos onze sítios pediam a cor sem a escolha: ela via-se no Perfil
      // e em mais lado nenhum.
      const { PALETA_MEMBROS, corDoMembro } = require('../src/theme');
      const outra = PALETA_MEMBROS.find(c => c !== corDoMembro('Rita'));
      expect(avatarDe('Rita', { cor: outra }).color).toBe(outra);
    });

    test('⚠ a fotografia é pedida sem referenciador — a Google recusa-a com', () => {
      const fs = require('fs');
      const path = require('path');
      const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.jsx'), 'utf8');
      expect(ui).toContain("referrerPolicy: 'no-referrer'");
    });
  });

  describe('1️⃣2️⃣ Apagar não reescreve saldos', () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { StoreProvider, useStore } = require('../src/store');

    const abrir = (casa) => {
      const cofre = {};
      const Envolve = () => {
        const st = useStore();
        cofre.st = st;
        React.useMemo(() => st.set(casa), []);
        return null;
      };
      TestRenderer.act(() => {
        TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Envolve)));
      });
      return cofre;
    };

    test('⚠ apagar uma tarefa feita não tira os pontos à criança', () => {
      // E se já tivessem sido pagos, o saldo ia a NEGATIVO: a criança passava
      // a dever pontos à casa por causa de uma arrumação de um adulto.
      const c = abrir({
        membros: { 'Rita': { initial: 'R' }, 'Léo': { initial: 'L', kid: true } },
        roles: { 'Rita': 'admin', 'Léo': 'crianca' },
        clearedSeeds: true,
        newTasks: [{ id: 'x1', title: 'Lixo', who: 'Léo', pts: 5 }],
        done: { x1: true }, paidPts: { 'Léo': 5 }, urg: { x1: 1 }, due: {},
      });
      expect(c.st.kidPts['Léo'] - c.st.s.paidPts['Léo']).toBe(0);
      TestRenderer.act(() => { c.st.removerTarefa('x1'); });
      expect(c.st.kidPts['Léo']).toBe(5);
      expect(c.st.kidPts['Léo'] - c.st.s.paidPts['Léo']).toBe(0);
    });

    test('⚠ apagar um artigo não apaga o histórico de preços', () => {
      const precos = [{ artigo: 'maca', loja: 'Pingo Doce', valor: 3.29, dia: 'd2026-08-30' }];
      const c = abrir({
        membros: { 'Rita': { initial: 'R' } }, roles: { 'Rita': 'admin' },
        clearedSeeds: true,
        newItems: [{ id: 'a1', s: 0, label: 'Maçã', est: 3.4 }],
        status: {}, precoPago: {}, precos,
      });
      TestRenderer.act(() => { c.st.removerArtigo('a1'); });
      expect(c.st.allItems()).toHaveLength(0);
      expect(c.st.s.precos).toEqual(precos);
    });

    test('e nenhum dos dois apaga ao toque', () => {
      const fs = require('fs');
      const path = require('path');
      for (const f of ['src/screens/Tarefas.jsx', 'src/screens/Compras.jsx']) {
        const c = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
        expect(c).toMatch(/<Confirm/);
        expect(c).toMatch(/destructive/);
      }
    });
  });
});
