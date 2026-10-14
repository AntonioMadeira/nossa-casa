/**
 * Regressões — Nossa Casa
 *
 * Ao contrário de smoke.test.js, estes testes lêem o código-fonte e as
 * sementes. Cada um corresponde a um defeito que chegou a estar em produção
 * e que os testes existentes não apanharam, porque comparavam literais
 * consigo próprios.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// Estes testes descrevem os defeitos pelo nome. Sem isto, a busca por
// `flex: 0` ou `new Date()` apanhava a própria explicação do erro.
const semComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const jsxFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.jsx?$/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  return out;
};

describe('Contratos dos componentes partilhados', () => {
  // Pill é um View de estado: não aceita selected/onPress. Quatro folhas
  // passavam-lhos, e as pastilhas ficavam sem preenchimento e sem toque.
  test('Pill nunca recebe selected ou onPress — para isso existe Choice', () => {
    const offenders = [];
    for (const f of jsxFiles()) {
      const src = read(f);
      for (const tag of src.match(/<Pill\b[\s\S]*?\/>/g) || []) {
        if (/\bselected=|\bonPress=/.test(tag)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Toggle declara {on, onPress} e não desenha o rótulo. Quem passava
  // value/onChange ficava com um interruptor inerte e sem legenda.
  test('Toggle nunca recebe value ou onChange', () => {
    const offenders = [];
    for (const f of jsxFiles()) {
      const src = read(f);
      for (const tag of src.match(/<Toggle\b[\s\S]*?\/>/g) || []) {
        if (/\bvalue=|\bonChange=/.test(tag)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Passar strings cruas dava três segmentos em branco, todos «selecionados»
  // porque undefined === undefined.
  test('Segmented normaliza opções em string', () => {
    expect(read('src/ui.jsx')).toMatch(/typeof raw === 'string'/);
  });

  test('Choice existe e o seu alvo de toque tem 44', () => {
    const ui = read('src/ui.jsx');
    // Fatiar até ao `export` SEGUINTE, e não até um nome fixo: pus dois
    // componentes entre o Choice e o Tap e a fatia passou a incluí-los, com as
    // cores deles a fazer a prova falhar por um motivo que não era o dela.
    // A fatia é o componente e mais nada: até à linha em branco a seguir. O
    // corte anterior ia até ao `export` seguinte e apanhava o que estivesse
    // pelo meio — o `#FFFFFF` de outro componente fazia esta prova falhar por
    // um motivo que não era o dela.
    const i = ui.indexOf('export const Choice');
    const choice = ui.slice(i, ui.indexOf('\n\n', i));
    expect(choice).toMatch(/minHeight: 44/);
    expect(choice).toMatch(/t\.accent/);          // cor de ação lida do tema
    expect(choice).not.toMatch(/#[0-9a-fA-F]{6}(?!')/); // sem literais de cor de ação
  });
});

describe('INVARIANTE #1 — o cabeçalho e o rodapé cabem no que mostram', () => {
  // O CLAUDE.md conta três quebras deste invariante, todas por o rodapé sair
  // da coluna flex. Esta é a quarta variante, e é silenciosa: o cabeçalho
  // continuou no sítio mas encolheu.
  //
  // `flex: 0` parece dizer «não cresces nem encolhes». O react-native-web
  // traduz para `0 1 0%` — base zero e ENCOLHÍVEL — portanto a caixa fica com
  // a altura do minHeight independentemente do conteúdo. Com os três números
  // do Início, o cabeçalho precisava de 135 px, tinha 80, e havia
  // `overflow: 'hidden'` a esconder a diferença. Ninguém via um erro; via-se
  // uma saudação cortada ao meio.
  const app = semComentarios(read('App.jsx'));

  // Este teste olhava só para o App.jsx, e por isso não apanhou a mesma
  // quebra no KidApp: o modo criança tinha o cabeçalho com 24 px onde
  // precisava de 46 e o rodapé com 16 onde precisava de 54. Uma regressão
  // que cobre um ficheiro não cobre um invariante.
  it('nenhum ficheiro usa o atalho `flex: 0`', () => {
    const culpados = [];
    for (const f of ['App.jsx', ...jsxFiles()]) {
      semComentarios(read(f)).split('\n').forEach((l, i) => {
        // `\b` sozinho casava dentro de `flex: 0.6` — a fronteira de palavra
        // fica entre o zero e o ponto. É preciso excluir o que vem a seguir.
        if (/\bflex:\s*0(?![.\d])/.test(l)) culpados.push(`${f}:${i + 1}`);
      });
    }
    expect(culpados).toEqual([]);
  });

  it('o KidApp tem a raiz de três caixas, como a app dos adultos', () => {
    const kid = semComentarios(read('src/KidApp.jsx'));
    const fixas = kid.match(/flexGrow:\s*0,\s*flexShrink:\s*0,\s*flexBasis:\s*'auto'/g) || [];
    expect(fixas.length).toBe(2);   // cabeçalho e rodapé
  });

  // `done` vive dentro de `s`. Desestruturá-lo à cabeça da loja dava
  // undefined, e o modo criança inteiro ficava em branco.
  // Um componente usado e não importado é um ReferenceError no render: ecrã
  // branco, e o erro só na consola. Aconteceu duas vezes ao extrair ficheiros
  // nesta sessão — o `Label` do Carrinho e o `Pill` da Gestão.
  it('todo o componente usado em JSX está importado ou definido no ficheiro', () => {
    const problemas = [];
    for (const f of ['App.jsx', ...jsxFiles()]) {
      const src = semComentarios(read(f));
      const usados = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map(m => m[1]));
      const conhecidos = new Set();
      for (const m of src.matchAll(/import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
        if (m[1]) conhecidos.add(m[1]);
        if (m[2]) for (const x of m[2].split(',')) {
          const n = x.trim().split(/\s+as\s+/).pop().trim();
          if (n) conhecidos.add(n);
        }
      }
      for (const m of src.matchAll(/(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/g)) conhecidos.add(m[1]);
      for (const u of usados) if (!conhecidos.has(u)) problemas.push(`${f} → <${u}>`);
    }
    expect(problemas).toEqual([]);
  });

  // O KidApp pedia `done` à loja e a loja só tem `s.done`: ecrã branco. O
  // Login pediu `verificarPin` antes de a loja o expor: entrada de criança
  // partida. As duas vezes o defeito só aparece a correr, porque desestruturar
  // o que não existe dá undefined em silêncio.
  it('tudo o que os ecrãs pedem à loja existe na loja', () => {
    const store = read('src/store.jsx');
    const devolve = store.slice(store.lastIndexOf('  return {'));
    const expostos = new Set([...devolve.matchAll(/\b([a-zA-Z_$][\w$]*)\b\s*[,:]/g)].map(m => m[1]));
    expostos.add('s'); expostos.add('set');
    const emFalta = [];
    for (const f of jsxFiles().concat('App.jsx')) {
      for (const m of semComentarios(read(f)).matchAll(/const \{([^}]*)\} = (?:st|useStore\(\))/g)) {
        for (const bruto of m[1].split(',')) {
          const nome = bruto.trim().split(':')[0].trim();
          if (nome && !expostos.has(nome)) emFalta.push(`${f} → ${nome}`);
        }
      }
    }
    expect(emFalta).toEqual([]);
  });

  it('ninguém desestrutura campos de estado à cabeça da loja', () => {
    const campos = ['done', 'pending', 'status', 'pins', 'roles', 'urg', 'due'];
    const culpados = [];
    for (const f of jsxFiles()) {
      for (const m of semComentarios(read(f)).matchAll(/const \{([^}]*)\} = (?:st|useStore\(\))/g)) {
        for (const nome of m[1].split(',').map(x => x.trim().split(':')[0].trim())) {
          if (campos.includes(nome)) culpados.push(`${f} → ${nome}`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });

  it('as três caixas fixas declaram flexShrink 0, para caberem no conteúdo', () => {
    // Eram duas — o cabeçalho e o rodapé. Em 15/09/2026 juntou-se-lhes a barra
    // da AÇÃO DO ECRÃ («move o botão para o fundo e assim aproveita-se mais o
    // ecrã»): o «acrescentar» de cada ecrã, entre o que rola e o rodapé. É
    // irmã das outras duas e obedece à mesma regra — não encolhe, e o que
    // encolhe é a área do meio.
    const fixas = app.match(/flexGrow:\s*0,\s*flexShrink:\s*0,\s*flexBasis:\s*'auto'/g) || [];
    expect(fixas.length).toBe(3);   // cabeçalho, ação do ecrã, rodapé
  });

  it('⚠ e a barra da ação vem ANTES do rodapé, nunca por cima dele', () => {
    // Um elemento a flutuar por cima do rodapé tapa a primeira linha dele em
    // metade dos telemóveis. A barra é irmã, e é a ordem que o garante.
    const raiz = app.slice(app.indexOf('backgroundColor: t.page'));
    expect(raiz.indexOf('{acaoDoEcra ? (')).toBeGreaterThan(raiz.indexOf('<ScrollView'));
    expect(raiz.indexOf('minHeight: 60')).toBeGreaterThan(raiz.indexOf('{acaoDoEcra ? ('));
    expect(app).not.toMatch(/position: 'absolute'[^}]*acaoDoEcra/);
  });

  it('o rodapé continua a ser o último filho da raiz', () => {
    const raiz = app.slice(app.indexOf('backgroundColor: t.page'));
    const rodape = raiz.indexOf('minHeight: 60');
    const scroll = raiz.indexOf('<ScrollView');
    expect(scroll).toBeGreaterThan(-1);
    expect(rodape).toBeGreaterThan(scroll);
  });
});

describe('Início — alinhado com 04-inicio.png', () => {
  const inicio = read('src/screens/Inicio.jsx');
  const app = semComentarios(read('App.jsx'));

  // A saudação estava nos dois sítios: o cabeçalho do App.jsx e o conteúdo do
  // Inicio.jsx. A app cumprimentava duas vezes, e os números («2 eventos e 3
  // tarefas por concluir») eram uma linha de texto no conteúdo em vez das três
  // caixas do cabeçalho.
  it('a saudação existe uma vez só, no cabeçalho', () => {
    expect(app).toMatch(/\{greet\}, \{user\}/);
    expect(inicio).not.toMatch(/\{greet\}/);
  });

  it('os três números estão no cabeçalho', () => {
    for (const rot of ['Disponível', 'Tarefas hoje', 'Eventos']) {
      expect(app).toContain(rot);
    }
  });

  // O cabeçalho lia `new Date()` e o conteúdo lia TODAY_KEY, portanto a app
  // dizia «Sábado, 29/08» em cima e «Quinta, 20/08» duas linhas abaixo.
  it('a data vem do TODAY da app, não do relógio da máquina', () => {
    expect(app).not.toMatch(/new Date\(\)/);
    expect(app).toMatch(/dayLabel\(TODAY_KEY\)/);
  });
});

describe('Nenhum ecrã fica sem entrada', () => {
  // Os quatro botões do Início (Saúde/Equip./Gestão/Docs) não estão na
  // referência e saíram. Mas as linhas do Perfil que os deviam substituir
  // tinham `onPress={() => {}}` — não faziam nada. Removê-los sem ligar isto
  // teria deixado três ecrãs inteiros inalcançáveis, sem erro nenhum.
  const perfil = read('src/screens/Perfil.jsx');
  const dinheiro = read('src/screens/Dinheiro.jsx');

  it('nenhuma linha do Perfil tem um handler vazio', () => {
    expect(perfil).not.toMatch(/onPress=\{\(\)\s*=>\s*\{\}\}/);
  });

  it('a linha de equipamentos do Dinheiro leva a algum lado', () => {
    expect(dinheiro).not.toMatch(/onPress=\{\(\)\s*=>\s*\{\}\}/);
    expect(dinheiro).toMatch(/onPress=\{onEquip\}/);
  });

  // ⚠ Verifica a INTENÇÃO, e não a forma exacta do corpo.
  //
  // Era `onSaude=\{\(\) => set`, e passou a falhar quando cada saída deixou de
  // ser uma chamada só: agora fecham as outras vistas antes de abrir a sua
  // (`onSaude={() => { fecharVistas(); setSaude(true); }}`), porque abrir uma
  // por cima de outra não mudava nada no ecrã. Uma prova que fixa a forma
  // impede a correcção em vez de a guardar.
  it('o Perfil recebe as três saídas do App, e cada uma abre a sua vista', () => {
    const app = read('App.jsx');
    const PARES = { onSaude: 'setSaude(true)', onDoc: 'setDoc(true)', onGestao: 'setGestao(true)' };
    for (const [p, abre] of Object.entries(PARES)) {
      // A propriedade é passada, e o corpo dela chama o setter respetivo.
      const i = app.indexOf(`${p}={`);
      expect(i).toBeGreaterThan(0);
      expect(app.slice(i, i + 90)).toContain(abre);
      expect(perfil).toContain(p);
    }
  });

  // A Gestão vivia em dois sítios: uma folha dentro do Perfil (valor do ponto,
  // dia de pagamento, dividir a meias) e o Gestao.jsx (rendimento, envelopes,
  // membros). A linha prometia as quatro coisas e abria só metade.
  it('as definições da casa estão todas no Gestao.jsx', () => {
    const gestao = read('src/screens/Gestao.jsx');
    for (const chave of ['pointValue', 'payDay', 'splitHalf']) {
      expect(gestao).toContain(chave);
      expect(perfil).not.toContain(chave);
    }
  });
});

describe('Vistas de ecrã inteiro — cabeçalho próprio, rodapé intacto', () => {
  const app = semComentarios(read('App.jsx'));

  // Abriam como cartão centrado com véu por cima da área de conteúdo, e o
  // cabeçalho da app ficava cortado a meio por trás. As referências 11, 13,
  // 15 e 17 mostram-nas com cabeçalho próprio e o rodapé da app por baixo.
  it('não sobrou nenhum cartão centrado com véu', () => {
    expect(app).not.toMatch(/rgba\(0,0,0,0\.3\)/);
    expect(app).not.toMatch(/maxHeight: '85vh'/);
  });

  // ⚠ Isto exigia CINCO, com os cinco nomes escritos à mão. Uma prova que fixa
  // o número de hoje envelhece a fechar os olhos: a sexta vista — «Como
  // fazemos compras», 08/09/2026 — fê-la falhar sem que houvesse nada de errado,
  // e a saída fácil era mudar o 5 para 6 e voltar a esperar.
  //
  // A propriedade não é «são cinco»: é que CADA vista registada declare o que o
  // cabeçalho precisa. Enumera-se do próprio registo.
  it('⚠ cada vista de ecrã inteiro declara ícone, título e como fechar', () => {
    const nomes = [...app.matchAll(/^    (\w+): \{\n      icon: /gm)].map(m => m[1]);
    // Se isto der pouco, o registo mudou de forma e a prova deixou de o ler.
    expect(nomes.length).toBeGreaterThan(4);

    const semTudo = [];
    for (const nome of nomes) {
      const i = app.indexOf(`    ${nome}: {\n      icon: `);
      const fim = app.indexOf('\n    },', i);
      const bloco = app.slice(i, fim === -1 ? app.length : fim);
      const falta = ['icon:', 'titulo:', 'fechar:', 'render:'].filter(k => !bloco.includes(k));
      if (falta.length) semTudo.push(`${nome} → falta ${falta.join(', ')}`);
    }
    expect(semTudo).toEqual([]);
  });

  it('a raiz continua a ter três filhos, com o rodapé em último', () => {
    const raiz = app.slice(app.indexOf('backgroundColor: t.page'));
    expect(raiz.indexOf('minHeight: 60')).toBeGreaterThan(raiz.indexOf('<ScrollView'));
  });

  // O modo de loja era um <Modal>, que no react-native-web escapa à raiz da
  // app: elementFromPoint no meio do rodapé devolvia o painel, portanto os
  // separadores não se conseguiam tocar. É o INVARIANTE #1, e o CLAUDE.md
  // nomeia este ecrã.
  it('o modo de loja não usa Modal', () => {
    const modo = semComentarios(read('src/screens/ModoCompras.jsx'));
    expect(modo).not.toMatch(/<Modal/);
    expect(read('src/screens/Compras.jsx')).not.toMatch(/setShop/);
  });

  it('o modo de loja tem as duas acções por linha e a barra da loja', () => {
    const modo = read('src/screens/ModoCompras.jsx');
    expect(modo).toContain('Sem stock');
    expect(modo).toContain('ordem do corredor');
    expect((modo.match(/minHeight: 44/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('O dinheiro gasto é uma soma, não um número escrito', () => {
  // Estava `1687.4` à mão e os envelopes somam 1387,00 — 300,40 € a mais. O
  // «Disponível» dava 82,60 € onde a referência 05-dinheiro.png mostra
  // 383,00 €, e o cabeçalho do Início repetia o erro em todos os ecrãs.
  const { ENV_BASE } = require('../src/data.js');

  it('não sobrou nenhum total de despesa escrito à mão', () => {
    expect(semComentarios(read('src/store.jsx'))).not.toMatch(/1687\.4/);
  });

  it('o gasto deriva dos envelopes', () => {
    expect(read('src/store.jsx')).toMatch(/const spent = envelopes\.reduce/);
  });

  it('as sementes somam o que a referência mostra', () => {
    expect(ENV_BASE.reduce((a, e) => a + e.used, 0)).toBe(1387);
    expect(ENV_BASE.reduce((a, e) => a + e.limit, 0)).toBe(1770);
    // 1770 − 1387 = 383,00 €, o «Disponível» da referência
    expect(ENV_BASE.reduce((a, e) => a + e.limit - e.used, 0)).toBe(383);
  });
});

describe('Equipamentos e Dinheiro — o que a referência mostra e faltava', () => {
  // Os dados estavam lá desde sempre: price, maint, maintDate. O ecrã é que
  // não os mostrava, e agrupava por estado de garantia em três secções onde a
  // referência 11 tem uma lista só com o estado na pastilha.
  const equip = read('src/screens/Equipamentos.jsx');
  const { EQUIP } = require('../src/data.js');

  it('o resumo mostra os cinco números da referência', () => {
    for (const rot of ['Equipamentos', 'Valor registado', 'Garantias a expirar',
      'Garantias expiradas', 'Próxima manutenção']) {
      expect(equip).toContain(rot);
    }
  });

  it('é uma lista só, não três secções por garantia', () => {
    expect(equip).toContain('Registados');
    expect(semComentarios(equip)).not.toMatch(/title="A Expirar \(90 dias\)"/);
  });

  it('cada linha mostra preço e manutenção', () => {
    expect(equip).toMatch(/EUR\(e\.price\)/);
    expect(equip).toMatch(/\{e\.maint\}/);
  });

  it('o valor registado é o das sementes', () => {
    expect(EQUIP.reduce((a, e) => a + e.price, 0)).toBe(3797);
  });

  const dinheiro = read('src/screens/Dinheiro.jsx');

  it('o cartão do saldo mostra o gasto, não só o orçamento', () => {
    expect(dinheiro).toMatch(/EUR\(spent\)\} gastos/);
  });

  it('registar despesa e abrir o mês são linhas próprias', () => {
    expect(dinheiro).toContain('Registar Despesa');
    expect(dinheiro).toMatch(/Abrir \$\{proximoMes\}/);
  });

  it('o envelope no limite oferece o passo seguinte', () => {
    expect(dinheiro).toContain('neste envelope');
    expect(dinheiro).toContain('Reforçar');
  });

  // Nem só «tu»: «vocês» também é tratamento de segunda pessoa, e o registo
  // desta app é a terceira.
  it('não há tratamento por «vocês»', () => {
    const re = /(?<![\p{L}])(voc[êe]s?)(?![\p{L}])/iu;
    expect(jsxFiles().filter(f => re.test(semComentarios(read(f))))).toEqual([]);
  });
});

describe('O PIN não fica gravado em claro', () => {
  // O armazenamento local tinha `{"Léo": "2470"}`, legível por qualquer coisa
  // com acesso à página. O db/README.md diz «resumo, não o valor», e é isso
  // que o servidor faz — o cliente não fazia.
  const { resumoPin, MIGRATIONS } = require('../src/store.jsx');

  it('o resumo não contém o PIN', () => {
    const r = resumoPin('Léo', '2470');
    expect(r).not.toContain('2470');
    expect(r).toMatch(/^h[a-z0-9]+$/);
  });

  it('o mesmo PIN em dois membros dá resumos diferentes', () => {
    expect(resumoPin('Léo', '2470')).not.toBe(resumoPin('Mia', '2470'));
  });

  it('o mesmo par dá sempre o mesmo resumo', () => {
    expect(resumoPin('Léo', '2470')).toBe(resumoPin('Léo', '2470'));
    expect(resumoPin('Léo', '2470')).not.toBe(resumoPin('Léo', '2471'));
  });

  it('v3 → v4 converte os PIN já gravados', () => {
    const r = MIGRATIONS[4]({ v: 3, pins: { 'Léo': '2470', 'Mia': 'hjaja' } });
    expect(r.pins['Léo']).toBe(resumoPin('Léo', '2470'));
    expect(r.pins['Mia']).toBe('hjaja');           // já era resumo, fica
    expect(JSON.stringify(r.pins)).not.toContain('2470');
  });

  it('v3 → v4 aguenta um estado sem PIN nenhum', () => {
    expect(MIGRATIONS[4]({ v: 3 }).pins).toEqual({});
  });

  it('⚠ nenhuma folha desliza na web — o `slide` do Modal ficava preso fora do ecrã', () => {
    // Duas folhas empilhadas (o avatar sobre o Perfil): a segunda arrancava com
    // `translateY(100%)` à espera do fim de uma animação CSS que não chegava, e
    // ficava a 794 px, invisível e a bloquear a de baixo. Medido duas vezes em
    // 09/09/2026. Na web a folha abre sem animação (`ANIMACAO_DA_FOLHA`); no
    // telemóvel desliza. Nenhum `Modal` da app escreve `"slide"` à mão.
    const culpados = [];
    const percorrer = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) percorrer(p);
        else if (/\.jsx$/.test(e.name) && /animationType="slide"/.test(semComentarios(fs.readFileSync(p, 'utf8')))) {
          culpados.push(path.relative(path.join(__dirname, '..'), p));
        }
      }
    };
    percorrer(path.join(__dirname, '..', 'src'));
    expect(culpados).toEqual([]);
    expect(read('src/Sheet.jsx')).toMatch(/Platform\.OS === 'web' \? 'none' : 'slide'/);
  });

  it('a entrada nunca compara o PIN em claro — pergunta à loja, que vai ao servidor', () => {
    // Era `verificarPin(kid, p)` — resumo contra resumo, no dispositivo. Desde
    // 09/09/2026 é `entrarCrianca`, que entra no servidor e só sem ele compara
    // o resumo. Ver `a-entrada-da-crianca-e-no-servidor`.
    const login = semComentarios(read('src/screens/Login.jsx'));
    expect(login).not.toMatch(/p === s\.pins\[kid\]/);
    expect(login).not.toMatch(/s\.pins\[/);
    expect(login).toMatch(/await entrarCrianca\(kid, p\)/);
  });

  // A única comparação legítima é resumo com resumo, e vive na loja. O que
  // não pode existir é alguém comparar `s.pins[x]` com o que o utilizador
  // escreveu.
  it('só se compara s.pins contra um resumo', () => {
    const culpados = [];
    for (const f of jsxFiles()) {
      for (const m of semComentarios(read(f)).matchAll(/s\.pins\[[^\]]+\]\s*===\s*([^;)\n]+)/g)) {
        if (!/resumoPin\(/.test(m[1])) culpados.push(`${f} → ${m[1].trim()}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});

describe('INVARIANTE #3 — a visibilidade da saúde não é do ecrã', () => {
  // O «Precisa de Si» passou a mostrar receitas e consultas. São dados de
  // saúde, e uma linha dessas no Início do membro errado é a fuga exacta que
  // o INVARIANTE #3 existe para impedir. Estas provas correm sem React: as
  // funções são puras precisamente para poderem ser provadas.
  //
  // A regra do servidor é a que conta (db/pocketbase/provar-saude.mjs, 15
  // provas). Esta é a do cliente, e tem de concordar com ela.
  const { podeVerSaude, receitasAExpirarDe, consultasProximasDe } = require('../src/store.jsx');

  const receita = (member, expires) => ({
    id: `r-${member}`, member, kind: 'Receita', title: 'Prova', expires,
  });
  const consulta = (member, day) => ({ id: `c-${member}`, member, day, specialty: 'Prova' });

  test('um adulto vê a sua própria ficha e nenhuma outra de adulto', () => {
    expect(podeVerSaude('Rita', 'Rita')).toBe(true);
    expect(podeVerSaude('Tomás', 'Rita')).toBe(false);
    expect(podeVerSaude('Rita', 'Tomás')).toBe(false);
  });

  test('as fichas das crianças são dos adultos, e não das próprias', () => {
    expect(podeVerSaude('Léo', 'Rita')).toBe(true);
    expect(podeVerSaude('Léo', 'Tomás')).toBe(true);
    expect(podeVerSaude('Léo', 'Léo')).toBe(false);
    expect(podeVerSaude('Mia', 'Léo')).toBe(false);
  });

  // O que a prova do browser não conseguiu mostrar por causa das fibras
  // velhas do React: a receita de um adulto não entra na lista do outro.
  test('a receita da Rita não chega à lista do Tomás', () => {
    const docs = [receita('Rita', 'd2026-08-25'), receita('Léo', 'd2026-09-10')];
    expect(receitasAExpirarDe(docs, 'Rita').map(d => d.member)).toEqual(['Rita', 'Léo']);
    expect(receitasAExpirarDe(docs, 'Tomás').map(d => d.member)).toEqual(['Léo']);
    expect(receitasAExpirarDe(docs, 'Léo')).toEqual([]);
  });

  test('a consulta de um adulto não chega ao outro nem às crianças', () => {
    const cs = [consulta('Tomás', 'd2026-08-22'), consulta('Mia', 'd2026-08-23')];
    expect(consultasProximasDe(cs, 'Tomás').map(c => c.member)).toEqual(['Tomás', 'Mia']);
    expect(consultasProximasDe(cs, 'Rita').map(c => c.member)).toEqual(['Mia']);
    expect(consultasProximasDe(cs, 'Mia')).toEqual([]);
  });

  // Contra o TODAY da app (20/08/2026), não contra o relógio da máquina.
  test('as janelas de tempo contam a partir do TODAY da app', () => {
    const docs = [receita('Léo', 'd2026-09-10'), receita('Mia', 'd2027-01-01')];
    expect(receitasAExpirarDe(docs, 'Rita').map(d => d.dias)).toEqual([21]);

    const cs = [consulta('Léo', 'd2026-08-22'), consulta('Mia', 'd2026-08-28'),
                consulta('Léo', 'd2026-08-10')];
    expect(consultasProximasDe(cs, 'Rita').map(c => c.dias)).toEqual([2]);  // 28/08 são 8 dias; 10/08 já passou
  });

  test('uma receita já expirada continua a aparecer — deixar de a mostrar é escondê-la', () => {
    const docs = [receita('Léo', 'd2026-08-01')];
    expect(receitasAExpirarDe(docs, 'Rita').map(d => d.dias)).toEqual([-19]);
  });
});

describe('Saúde — o ecrã e a loja contam a mesma coisa', () => {
  const saude = read('src/screens/Saude.jsx');

  // O ecrã lia `s.health` — só o gravado. As sementes são código, portanto
  // dizia «Sem registos de saúde.» enquanto o cartão do membro logo acima,
  // que lê pela loja, dizia «1 consulta». O mesmo ecrã contradizia-se.
  it('lê pela loja, não pelo estado gravado', () => {
    expect(saude).toMatch(/st\.allHealth\(\)/);
    expect(semComentarios(saude)).not.toMatch(/\bs\.health\b\s*\|\|/);
  });

  // Havia aqui uma cópia do canSeeHealth, e mais permissiva: devolvia true
  // para qualquer criança sem verificar se quem vê é adulto.
  it('não tem uma cópia própria da regra de visibilidade', () => {
    expect(saude).toMatch(/st\.canSeeHealth\(member, user\)/);
    expect(semComentarios(saude)).not.toMatch(/const canSeeHealth\s*=/);
  });

  // Ordenava com `new Date('28/08/2026')`, que é Invalid Date.
  it('ordena pelas chaves, não por new Date de um texto', () => {
    expect(semComentarios(saude)).not.toMatch(/new Date\([ab]\.date\)/);
    expect(saude).toMatch(/localeCompare\(String\(a\.day/);
  });

  // O «marcar consulta» abria com o membro por omissão, viesse de onde viesse.
  // Depois de a ficha passar a vista do App, o membro faz a viagem
  // ficha → App → Saúde; sem isso voltava a abrir no predefinido, e foi o
  // que aconteceu ao fazer esse refactor.
  it('o marcar consulta recebe o membro de onde foi aberto', () => {
    // O que interessa é a precedência: o membro por onde a folha foi aberta
    // ganha ao valor por omissão. Este teste exigia o nome literal `'Léo'` e
    // partiu-se quando o valor por omissão passou a ser a primeira criança da
    // casa — que é o mesmo em Bengui, mas já não é um nome escrito à mão.
    expect(saude).toMatch(/member: membro \|\|/);
    expect(read('App.jsx')).toMatch(/setMarcarPara\(ficha\)/);
    expect(saude).toMatch(/abrirMarcacao\(marcarPara\)/);
  });

  // ⚠ O rascunho da consulta SUBIU para o ecrã quando as especialidades
  // passaram a ter folha própria: «Gerir» troca a folha, e um formulário meio
  // preenchido perdia-se a caminho de acrescentar a especialidade que falta.
  //
  // Isto guarda a consequência: quem abrir a folha tem de passar pelo
  // `abrirMarcacao`, que semeia o rascunho. Um `setSheet('consulta')` solto
  // abria a folha por cima do rascunho anterior — com o membro errado, que é
  // exactamente o defeito que a prova acima existe para apanhar.
  it('⚠ e ninguém abre a folha sem semear o rascunho', () => {
    const c = semComentarios(saude);
    const linhas = c.split('\n').filter(l => l.includes("setSheet('consulta')"));

    // São duas, e são estas duas:
    //   a de dentro do `abrirMarcacao`, que semeia
    //   a do `onClose` das especialidades, que VOLTA — e que não pode semear,
    //   senão a viagem apagava o formulário, que é o defeito ao contrário
    expect(linhas).toHaveLength(2);
    expect(linhas.filter(l => l.includes('onClose'))).toHaveLength(1);

    const i = c.indexOf('const abrirMarcacao');
    expect(i).toBeGreaterThan(0);
    expect(c.slice(i, c.indexOf("setSheet('consulta')", i))).toContain('setConsulta(');
  });

  // A ficha de um membro desenhava um cabeçalho próprio dentro do conteúdo, e
  // ficavam dois empilhados: o «Saúde da Família» da vista e o «Saúde do Léo»
  // dela. Passou a vista do App, como as outras.
  it('a ficha é uma vista do App, não um ramo da Saúde', () => {
    expect(semComentarios(saude)).not.toMatch(/<FichaSaude/);
    expect(semComentarios(read('App.jsx'))).toMatch(/\n    ficha: \{/);
    expect(semComentarios(read('src/screens/FichaSaude.jsx')))
      .not.toMatch(/backgroundColor: t\.chrome/);
  });

  // Um nome de ícone que não existe devolve um SVG vazio, sem erro nenhum.
  it('todos os nomes de ícone usados existem no Icon.jsx', () => {
    const icones = read('src/Icon.jsx');
    const conhecidos = new Set([
      ...[...icones.matchAll(/^\s{2}([a-zA-Z]+):\s*'/gm)].map(m => m[1]),
      ...[...icones.matchAll(/name === '([a-zA-Z]+)'/g)].map(m => m[1]),
    ]);
    const usados = new Set();
    for (const f of jsxFiles()) {
      for (const m of semComentarios(read(f)).matchAll(/(?:<Icon\s+name|\bicon)=["']([a-zA-Z]+)["']/g)) {
        usados.add(m[1]);
      }
    }
    const desconhecidos = [...usados].filter(n => !conhecidos.has(n));
    expect(desconhecidos).toEqual([]);
  });
});

describe('INVARIANTE #2 — saldos são somas de movimentos', () => {
  test('o cofre não é um campo escrito', () => {
    const store = read('src/store.jsx');
    expect(store).not.toMatch(/^\s*vault:\s*\{/m);
    expect(store).toMatch(/vaultMoves/);
  });

  test('nenhum ecrã lê um saldo de cofre directamente', () => {
    const offenders = jsxFiles().filter(f => /s\.vault\s*\[/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  test('os movimentos semeados somam os saldos da demonstração', () => {
    const { VAULT } = require('../src/data.js');
    const soma = (kid) => Math.round(
      VAULT.reduce((n, m) => (m.kid === kid ? n + m.delta : n), 0) * 100) / 100;
    expect(soma('Léo')).toBe(12.40);
    expect(soma('Mia')).toBe(8.90);
  });
});

describe('Armazenamento local — versão e migração', () => {
  const store = read('src/store.jsx');

  test('o formato gravado tem versão e uma cadeia de migrações', () => {
    expect(store).toMatch(/const SCHEMA = \d+/);
    expect(store).toMatch(/const MIGRATIONS = \{/);
    // grava a versão do código, não um literal preso no 1
    expect(store).toMatch(/\{ v: SCHEMA, savedAt/);
    // e recusa ler um formato mais recente do que sabe interpretar
    expect(store).toMatch(/v > SCHEMA/);
  });

  test('ler mal nunca leva a gravar por cima', () => {
    // Era um `try` só a envolver a leitura E as migrações, com o `ready` fora
    // dele. Uma migração que atirasse ficava engolida por um `catch` que dizia
    // «armazenamento indisponível», o estado ficava o INICIAL, e a gravação
    // seguinte escrevia-o por cima de tudo com `v: SCHEMA` — eventos, cofre,
    // preços, em silêncio, e a migração nunca voltava a correr.
    //
    // As provas do comportamento estão em `__tests__/migracoes.test.js`, com
    // um disco a sério e uma migração que atira de propósito. Isto guarda as
    // duas peças de que elas dependem.
    expect(store).toMatch(/gravavelRef/);
    // a guarda tem de estar no efeito de gravação, não só declarada
    const gravar = store.slice(store.indexOf('// gravar a cada alteração'));
    expect(gravar).toMatch(/if \(!gravavelRef\.current\) return;/);
    // e uma cópia do disco antes de lhe mexer
    expect(store).toMatch(/antes-de-v/);
  });

  // As sementes eram gravadas, por isso mudá-las não tinha efeito em quem já
  // tinha a app aberta — vi ícones errados no cofre por causa disto.
  test('as sementes do cofre vivem no código, não no estado gravado', () => {
    expect(read('src/data.js')).toMatch(/export const VAULT = \[/);
    // O DEMO não semeia: `vaultMoves` arranca vazio. A versão anterior desta
    // linha exigia `vaultMoves: [], paidPts` na mesma linha e partiu-se quando
    // o `paidPts` deixou de ser dois nomes escritos à mão; olhava para a
    // formatação, não para o invariante.
    expect(semComentarios(store)).toMatch(/vaultMoves: \[\]\s*,/);
    expect(store).toMatch(/s\.clearedSeeds \? \[\] : VAULT/);  // a derivação junta-as
  });

  // As migrações correm aqui, importadas — não recortadas do ficheiro por
  // texto. A versão anterior deste teste fatiava o código-fonte de `2: (o) =>`
  // até `export const DEMO`, e ao acrescentar a migração 3 a fatia passou a
  // apanhar as duas: o teste partiu-se por a app ter crescido, que é o pior
  // motivo possível para um teste falhar.
  const { MIGRATIONS, SCHEMA } = require('../src/store.jsx');

  test('há uma migração para cada salto até à versão actual', () => {
    for (let n = 2; n <= SCHEMA; n++) expect(typeof MIGRATIONS[n]).toBe('function');
  });

  test('v1 → v2 preserva o dinheiro e deixa de gravar as sementes', () => {
    const { VAULT } = require('../src/data.js');
    const mig = MIGRATIONS[2];
    const soma = (mv, kid) => Math.round(
      [...VAULT, ...mv].reduce((n, m) => (m.kid === kid ? n + m.delta : n), 0) * 100) / 100;

    // saldo antigo diferente das sementes: a diferença tem de sobreviver
    const a = mig({ v: 1, vault: { 'Léo': 20.00, 'Mia': 8.90 } });
    expect('vault' in a).toBe(false);
    expect(soma(a.vaultMoves, 'Léo')).toBe(20.00);
    expect(soma(a.vaultMoves, 'Mia')).toBe(8.90);

    // estado intermédio: sementes gravadas + um movimento do utilizador
    const b = mig({ v: 1, vaultMoves: [...VAULT, { id: 'vm-x', kid: 'Léo', delta: 1 }] });
    expect(b.vaultMoves).toHaveLength(1);          // as sementes saíram
    expect(soma(b.vaultMoves, 'Léo')).toBe(13.40); // 12,40 + 1,00
  });

  // v2 → v3: os registos de saúde tinham duas formas — `date` com o texto do
  // formulário nos gravados, `day` em chave nas sementes. O ecrã lia `date` e
  // por isso estava apontado só aos gravados, que estavam sempre vazios.
  test('v2 → v3 põe os registos de saúde todos na mesma forma', () => {
    const r = MIGRATIONS[3]({
      v: 2,
      health: [
        { id: 'a', member: 'Léo', date: '28/08/2026', specialty: 'Dentista' },
        { id: 'b', member: 'Mia', day: 'd2026-09-01', time: '10:00', specialty: 'Pediatria' },
        { id: 'c', member: 'Léo', date: 'para a semana', specialty: 'Ilegível' },
      ],
    });
    // o texto do formulário passa a chave
    expect(r.health[0]).toEqual({ id: 'a', member: 'Léo', day: 'd2026-08-28', time: '', specialty: 'Dentista' });
    // quem já tinha a forma certa fica como estava
    expect(r.health[1]).toEqual({ id: 'b', member: 'Mia', day: 'd2026-09-01', time: '10:00', specialty: 'Pediatria' });
    // uma data que não se consegue ler não faz o registo desaparecer
    expect(r.health[2].day).toBe('para a semana');
    expect(r.health.every(h => !('date' in h))).toBe(true);
  });

  test('v2 → v3 aguenta um estado sem registos de saúde nenhuns', () => {
    expect(MIGRATIONS[3]({ v: 2 }).health).toEqual([]);
  });
});

describe('PIN', () => {
  // setPin grava. Chamá-lo no JSX comprometia o PIN a meio da escrita.
  test('Gestao valida com pinError e só grava no manipulador do botão', () => {
    const src = read('src/screens/Gestao.jsx');
    const renderPart = src.slice(src.indexOf('return ('));
    const calls = renderPart.match(/setPin\(/g) || [];
    expect(calls.length).toBe(1);                       // só a do onPress
    expect(renderPart).toMatch(/onPress=\{\(\) => \{\s*if \(setPin\(/);
    expect(src).toMatch(/pinError\(selectedMember, input\)/);
  });

  test('não há PIN de fábrica', () => {
    expect(read('src/store.jsx')).toMatch(/pins:\s*\{\}/);
    const offenders = jsxFiles().filter(f =>
      /pins\s*\[[^\]]+\]\s*\|\|\s*['"]\d{4}['"]/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('Equipamentos', () => {
  // As sementes IMPORTAM-SE, não se raspam do ficheiro.
  //
  // Isto era uma expressão regular sobre o texto de `src/data.js`, à procura
  // de `bought: '12/03/2025'`. No dia em que as datas passaram a ser
  // deslocamentos — `dmyRelativo(-526)`, para a demonstração não envelhecer —
  // a expressão deixou de casar, `equip` ficou vazio, e dois testes falharam
  // sem que nada estivesse errado.
  //
  // É o mesmo erro que já está registado mais acima neste ficheiro: olhar
  // para a formatação em vez do invariante. Importar dá os VALORES, que é o
  // que estes testes querem medir.
  const { EQUIP: equip } = require('../src/data');

  test('as sementes foram lidas', () => {
    expect(equip.length).toBe(4);
    // E têm os campos que o resto deste bloco mede — se um deles se chamar
    // outra coisa, falha aqui e não três testes abaixo.
    for (const e of equip) {
      expect(typeof e.bought).toBe('string');
      expect(e.bought).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect(e.warrantyEnd).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
  });

  // O ecrã lia e.category/e.purchase; as sementes têm cat/bought. Todas as
  // linhas mostravam «undefined · Data desconhecida».
  test('o ecrã lê os campos que as sementes carregam', () => {
    const src = read('src/screens/Equipamentos.jsx');
    expect(src).not.toMatch(/e\.category|e\.purchase\b|e\.warrantyDays|e\.purchaseAt/);
    expect(src).toMatch(/e\.bought/);
    expect(src).toMatch(/e\.price/);
    // A categoria saiu da linha: a referência 11 mostra «Comprado a … · preço»,
    // não a categoria. Continua a existir no formulário de registo.
    expect(src).toMatch(/cat: CATS\[0\]/);
  });

  test('gravar um equipamento produz a forma das sementes', () => {
    const src = read('src/screens/Equipamentos.jsx');
    const save = src.slice(src.indexOf('const handleSave'), src.indexOf('const estadoDe'));
    for (const field of ['cat:', 'bought:', 'warrantyEnd:']) expect(save).toContain(field);
  });

  // Antes: tudo caía em today+365, e a caldeira expirada aparecia em garantia.
  test('as sementes povoam os três estados de garantia', () => {
    const { warrantyDaysLeft } = require('../src/format.js');
    const bucket = (e) => {
      const d = warrantyDaysLeft(e);
      return d > 90 ? 'em' : d > 0 ? 'a-expirar' : 'fora';
    };
    const states = new Set(equip.map(bucket));
    expect([...states].sort()).toEqual(['a-expirar', 'em', 'fora']);
    expect(bucket(equip.find(e => /Caldeira/.test(e.name)))).toBe('fora');
  });
});

describe('Ficha do equipamento — alinhada com 12-ficha-equipamento.png', () => {
  const ficha = read('src/sheets/FichaEquipamento.jsx');

  test('tem as secções que a referência mostra', () => {
    for (const s of ['Garantia', 'Fotografias', 'Preço de compra', 'Comprado a']) {
      expect(ficha).toContain(s);
    }
  });

  test('tem as três ações, com os ícones que a referência usa', () => {
    for (const [rotulo, icone] of [['Agendar manutenção', 'calendar'],
                                   ['Exportar fatura', 'printer'],
                                   ['Remover equipamento', 'trash']]) {
      expect(ficha).toContain(rotulo);
      expect(ficha).toContain(`"${icone}"`);
    }
  });

  // O defeito que esta sessão passou a corrigir: controlos que não fazem nada.
  // Cada ação ou está ligada, ou está desativada com o motivo à vista.
  test('nenhuma ação é um botão morto', () => {
    expect(ficha).toMatch(/removeEquip\(equip\.id\)/);        // remover liga
    expect(ficha).toMatch(/editEquip\(equip\.id, manut\)/);   // manutenção liga
    expect(ficha).toMatch(/launchImageLibraryAsync/);         // fotografias ligam
    // exportar não é possível sem fatura, e diz porquê em vez de não fazer nada
    // (e também enquanto o PDF se prepara — 13/09/2026, o botão passou a exportar)
    expect(ficha).toMatch(/desativado=\{!equip\.fatura/);
    expect(ficha).toMatch(/Ainda não há fatura para exportar/);
  });

  test('remover pede confirmação — não se desfaz', () => {
    expect(ficha).toMatch(/<Confirm[\s\S]*?destructive/);
    expect(ficha).toContain('Remover equipamento?');
  });

  test('as edições não escrevem sobre as sementes', () => {
    const store = read('src/store.jsx');
    expect(store).toMatch(/equipEdits/);
    expect(store).toMatch(/\.\.\.\(\(s\.equipEdits \|\| \{\}\)\[e\.id\] \|\| \{\}\)/);
    expect(read('src/data.js')).toMatch(/export const EQUIP = \[/);   // sementes intactas
  });
});

describe('Português europeu', () => {
  const BR = [
    [/\bCompartilh/i, 'compartilhar → partilhar'],
    [/\bgerenci/i, 'gerenciar → gerir'],
    [/\bAguardando\b/, 'Aguardando → A aguardar'],
    [/\bplanejar\b/i, 'planejar → planear'],
    [/\busuário/i, 'usuário → utilizador'],
    [/\bdeletar\b/i, 'deletar → eliminar'],
    // Este estava no ecrã de entrada, e está também no protótipo. O protótipo
    // ganha nas medidas; no registo da língua ganha o CLAUDE.md.
    [/\bacess(ar|ando|e)\b/i, 'acessar → aceder'],
    [/\bsalvar\b/i, 'salvar → guardar'],
    [/\bcadastr(o|ar|e)\b/i, 'cadastrar → registar'],
    [/\bregistr(o|ar|ado)\b/i, 'registro → registo (registar)'],
    [/\baplicativo\b/i, 'aplicativo → aplicação'],
    [/\bsenha\b/i, 'senha → palavra-passe'],
    [/\bcelular\b/i, 'celular → telemóvel'],
    [/\btela\b/i, 'tela → ecrã'],
  ];

  // Sem comentários: o que conta é o que o membro lê. Um comentário que
  // explica o brasileirismo corrigido não é um brasileirismo — e sem isto o
  // teste dava-se por falhado a si próprio.
  test.each(BR)('nenhum ficheiro usa %s', (re, hint) => {
    const offenders = jsxFiles().filter(f => re.test(semComentarios(read(f))));
    expect({ hint, offenders }).toEqual({ hint, offenders: [] });
  });

  // O gerúndio de acção contínua é brasileiro: «está carregando» em vez de
  // «está a carregar». Não aparece em nenhum ficheiro hoje e é a construção
  // mais fácil de deixar entrar sem dar por isso.
  test('não há gerúndio de acção contínua', () => {
    const re = /\b(está|estão|estamos|estou|continua|vai)\s+[a-zà-ÿ]+ndo\b/iu;
    const offenders = jsxFiles().filter(f => re.test(semComentarios(read(f))));
    expect(offenders).toEqual([]);
  });

  // O género gramatical é dado da pessoa, não coisa que se adivinhe do nome.
  // Três sítios adivinhavam-no com `nome === 'Rita' || nome === 'Mia'`, e um
  // esquecia-se: a ficha da Mia dizia «Saúde do Mia».
  test('o género vem dos dados, e nenhum ecrã o adivinha pelo nome', () => {
    const { MEMBERS, DE, FEM } = require('../src/data.js');
    for (const [nome, m] of Object.entries(MEMBERS)) {
      expect(typeof m.fem).toBe('boolean');
      expect(DE(nome)).toBe(m.fem ? 'da' : 'do');
      expect(FEM(nome)).toBe(m.fem);
    }
    const adivinhas = jsxFiles().filter(f => /=== '(Rita|Mia)'\s*\|\|/.test(semComentarios(read(f))));
    expect(adivinhas).toEqual([]);
    const artigoFixo = jsxFiles().filter(f => /Saúde d[oa] \$\{/.test(semComentarios(read(f))));
    expect(artigoFixo).toEqual([]);
  });

  // Fronteiras em Unicode: \b parte-se nos acentos, e /\bvocê\b/ casava dentro
  // de «vocês». As fronteiras aqui são «não é letra».
  test('não há tratamento por «tu»', () => {
    const re = /(?<![\p{L}])(tu|teu|teus|tua|tuas|contigo|ti)(?![\p{L}])/iu;
    const offenders = jsxFiles().filter(f => re.test(semComentarios(read(f))));
    expect(offenders).toEqual([]);
  });
});

describe('Camada de ligação ao servidor — PocketBase', () => {
  const cliente = read('src/pocketbase.js');
  const colecoes = read('db/pocketbase/criar-colecoes.mjs');

  // Estes testes leem código. As regras do servidor não se verificam assim —
  // verificam-se a correr, em db/pocketbase/provar-regras.mjs (19 provas) e
  // provar-hooks.mjs (12). Aqui só se guarda o que o cliente não pode fazer.
  test('a ligação é opcional: sem URL, a app corre local', () => {
    expect(cliente).toMatch(/export const ligado = Boolean\(URL\)/);
    expect(cliente).toMatch(/process\.env\.EXPO_PUBLIC_PB_URL/);
  });

  // INVARIANTE #3: quem decide o que existe é o servidor.
  test('o PIN é verificado no servidor, nunca comparado aqui', () => {
    expect(cliente).toMatch(/authWithPassword\(login, pin\)/);
    expect(cliente).not.toMatch(/pin\s*===|===\s*pin\b/);
    // e a coleção de membros é de autenticação, que é o que faz o hash
    expect(colecoes).toMatch(/name: 'membros', type: 'auth'/);
  });

  // INVARIANTE #2: sem regra de update nem de delete, o servidor recusa-os.
  test('o cofre é uma coleção de inserções', () => {
    const bloco = colecoes.slice(colecoes.indexOf("name: 'cofre_movimentos'"),
                                 colecoes.indexOf("name: 'equipamentos'"));
    expect(bloco).toMatch(/updateRule: null/);
    expect(bloco).toMatch(/deleteRule: null/);
    expect(cliente).not.toMatch(/update\([^)]*saldo/i);
  });

  // §5: ausentes da resposta, não escondidos na interface.
  test('o orçamento exclui perfis de criança na própria regra', () => {
    const bloco = colecoes.slice(colecoes.indexOf("name: 'envelopes'"),
                                 colecoes.indexOf("name: 'despesas'"));
    expect(bloco).toMatch(/listRule: `\$\{DA_CASA\} && \$\{ADULTO\}`/);
  });

  // §6 e §9: nenhuma operação de dinheiro sem chave.
  //
  // ⚠ Esta prova ESCONDEU o defeito que devia apanhar, e vale a pena dizer como.
  //
  // Estava escrita a fixar a lista literal: `new Set(['despesas',
  // 'cofre_movimentos'])`. Entretanto nasceram as `transferencias` e os
  // `acertos`, com o mesmo índice único e sem entrarem na lista — e a prova
  // continuou verde, porque o que ela media era se as duas de sempre lá
  // estavam, não se lá estavam TODAS. A segunda transferência de cada casa era
  // recusada com um 400 que a fila engolia.
  //
  // É a mesma forma do tecto de 2500 caracteres que tirei daqui há dois dias:
  // uma prova que fotografa o estado de hoje em vez de exigir uma propriedade
  // envelhece a fechar os olhos.
  //
  // A propriedade — quem tem o índice está na lista, e mais ninguém — está em
  // `__tests__/idem-key-em-todas.test.js`, que a ENUMERA a partir do esquema.
  // Aqui fica só o que é do §6: que as quatro operações de dinheiro têm índice.
  test('as operações de dinheiro levam chave de idempotência', () => {
    for (const c of ['despesas', 'cofre_movimentos', 'transferencias', 'acertos']) {
      expect(colecoes).toMatch(new RegExp(`CREATE UNIQUE INDEX \\w+ ON ${c} \\(casa, idem_key\\)`));
    }
    expect(cliente).toMatch(/const COM_IDEM = new Set\(\[/);
  });

  // §5 chama-lhe «a regra mais restritiva do sistema». Aqui só se guarda que a
  // condição existe com a forma certa; que ela FUNCIONA prova-se a correr, em
  // provar-saude.mjs — incluindo a transição de papel retroativa.
  test('a ficha de um adulto exclui os outros adultos, na própria regra', () => {
    expect(colecoes).toMatch(/const SAUDE_VISIVEL =/);
    // Tenho de ser ADULTO, e o registo é meu ou de uma criança. Um adulto
    // nunca cai no segundo ramo por outro adulto.
    //
    // ⚠ A condição era `membro = @request.auth.id || (ADULTO && ...)`, e o
    // primeiro ramo servia QUALQUER membro — criança incluída. Uma criança
    // lia a sua própria ficha, contra o que o `podeVerSaude` do cliente diz e
    // contra o que o ecrã da Saúde promete em letras. Trocado em 03/09/2026.
    expect(colecoes).toContain('${DA_CASA} && ${ADULTO} && (membro = @request.auth.id || membro.papel = "crianca")');
    expect(colecoes).not.toContain('membro = @request.auth.id || (${ADULTO}');
  });

  test('⚠ e a leitura ficou IGUAL à escrita, porque era a criança que as separava', () => {
    // Sem a leitura da criança, quem pode ver é exactamente quem pode
    // escrever — uma regra a menos para manter em dois sítios.
    const i = colecoes.indexOf("name: 'episodios_saude'");
    // A janela cresceu com o comentário que explica o `membro.casa` (12/09/2026).
    const bloco = colecoes.slice(i, i + 2600);
    // ⚠ Com `membro.casa = @request.auth.casa` desde 12/09/2026: sem ele, uma
    // adulta de outra casa criava uma consulta a uma criança desta.
    const condicao = '${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")';
    for (const regra of ['createRule', 'updateRule', 'deleteRule']) {
      expect(bloco).toContain(`${regra}: \`${condicao}\``);
    }
  });

  test('⚠ recriar as coleções não apaga uma casa habitada', () => {
    // Isto custou a autorização da agenda da Google de uma casa a sério: o
    // script apagava e recriava TUDO, `membros` e `casas` incluídos, e a
    // `credenciais_agenda` levava com ela o refresh_token — que não se
    // recupera de cópia nenhuma, só voltando à Google.
    expect(colecoes).toMatch(/const casaHabitada =/);
    expect(colecoes).toContain("'membros', 'casas', 'credenciais_agenda'");
    // E a reconstrução total continua possível, mas tem de ser pedida.
    expect(colecoes).toMatch(/process\.env\.PB_RECRIAR/);
  });

  test('⚠ e a reconstrução total pede-se pelo NOME da casa, nunca por um «1»', () => {
    // O «1» escreve-se igual para a casa de simulação e para a casa a sério:
    // não prova que se sabe QUAL está do outro lado, e fica no histórico da
    // consola à espera da seta para cima. O valor passou a ser o nome da casa
    // a destruir, conferido contra as casas que o servidor tem.
    expect(colecoes).toMatch(/const nomeBateCerto =/);
    expect(colecoes).toMatch(/casaHabitada = !nomeBateCerto/);
    // Um valor que não bate certo RECUSA e sai — como o `simular-casa.mjs`
    // recusa a porta 8095 —, sem apagar nada.
    expect(colecoes).toMatch(/RECUSADO: PB_RECRIAR/);
    // ⚠ E sai pelo `exitCode`, NÃO por um `process.exit(2)`.
    //
    // Esta linha dizia `toMatch(/process\.exit\(2\)/)` e passava com a recusa
    // avariada. Corrida a sério contra um servidor — um PocketBase de deitar
    // fora, com uma casa dentro —, a recusa imprimia o texto todo e depois
    // rebentava: «Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file
    // src\win\async.c, line 76», código de saída 127. O `simular-casa.mjs`
    // recusa ANTES de falar com o servidor e pode sair com `process.exit(2)`;
    // esta recusa só se sabe DEPOIS do `authWithPassword` e dos dois
    // `getFullList`, e sair com ligações do `fetch` abertas rebenta no Windows.
    //
    // Um guião que anuncia o código 2 em três sítios e devolve 127 com um
    // despejo do libuv parece ter ido abaixo em vez de ter recusado.
    //
    // ⚠ E a busca do `process.exit(2)` corre SEM COMENTÁRIOS: a explicação aqui
    // em cima nomeia o defeito, e a primeira versão desta linha apanhou-se a si
    // própria — o guarda ficou vermelho a apontar para o texto que o explica.
    expect(colecoes).toMatch(/process\.exitCode = 2;\s*\n\s*await new Promise\(\(\) => \{\}\);/);
    expect(semComentarios(colecoes)).not.toMatch(/process\.exit\(2\)/);
    // E nenhuma linha do ficheiro volta a ensinar o «1», nem em comentário nem
    // na instrução que se imprime a quem corre isto numa casa habitada.
    expect(colecoes).not.toMatch(/PB_RECRIAR\s*=\s*1\b/);
  });

  test('⚠ e semear a casa pede-se pelo NOME dela, com o mesmo travão', () => {
    // O `semear-simulacao.mjs` escreve na casa A SÉRIO de propósito — sem isso
    // não se passeia pela app inteira. Mas pega na PRIMEIRA casa que encontra,
    // sem perguntar qual, e faz duas coisas que NÃO se desfazem: reescreve as
    // regras do orçamento (rendimento, valor do ponto, dia de pagamento) e
    // fecha o mês que estiver aberto. O caminho de volta era um comentário a
    // dizer «copie o pb_data antes», e um comentário não é um travão.
    //
    // Medido em 27/09/2026 contra um servidor de mentira, cinco casos: sem
    // SEMEAR, com «1», com o nome errado e com o nome em minúsculas, sai com 2
    // e não faz UMA escrita; com o nome exacto, passa — e a primeira escrita
    // que sai é o PATCH às regras do orçamento.
    const semear = read('db/pocketbase/semear-simulacao.mjs');
    expect(semear).toMatch(/process\.env\.SEMEAR/);
    expect(semear).toMatch(/RECUSADO: SEMEAR/);
    // A comparação é contra o nome da casa que está NO SERVIDOR, não contra um
    // literal escrito no ficheiro — senão mudava de casa e o travão ficava a
    // guardar a errada.
    expect(semear).toMatch(/pedido !== String\(casa\.nome\)\.trim\(\)/);
    // E sai pelo `sair()`, como todos os guiões que falam com o servidor.
    expect(semear).toMatch(/await sair\(2\)/);
    expect(semComentarios(semear)).not.toMatch(/process\.exit\(/);
  });

  test('⚠ e uma coleção COM LINHAS também não se apaga', () => {
    // Os três nomes acima eram escolhidos à mão, e chegavam enquanto as outras
    // coleções estavam vazias — até esta semana o cliente escrevia em 10 de 31.
    // Agora as tarefas, a agenda, as despesas, o cofre, as compras e as fichas
    // de saúde da família vivem lá, e o script apagava-as a cada execução:
    // aplicar uma mudança de regra levava atrás o que a casa tinha escrito.
    expect(colecoes).toMatch(/const temLinhas = async/);
    expect(colecoes).toMatch(/\.\.\.comDados/);
    // ⚠ E uma VISTA nunca se preserva: não tem dados nenhuns — as linhas que
    // devolve são das coleções de base —, ficava com o SQL antigo, e impedia
    // apagar as coleções que ela lê. Apanhado a correr, com o `v_acerto_saldo`
    // na lista de preservadas e a limpeza a parar em «Failed to delete».
    expect(colecoes).toMatch(/c\.type === 'view'/);
  });

  test('⚠ e o script das coleções ANALISA', () => {
    // Tinha dois `const ADMIN` — a credencial e a regra do papel — e um
    // SyntaxError. Desde o commit que tirou as credenciais do código, o
    // script que cria as coleções nunca mais correu; as provas continuavam
    // verdes porque corriam contra as coleções criadas ANTES disso.
    const parser = require('@babel/parser');
    expect(() => parser.parse(colecoes, { sourceType: 'module' })).not.toThrow();
  });

  test('a saúde não vem na leitura em massa — pede-se ficha a ficha', () => {
    const bloco = cliente.slice(cliente.indexOf('const COLECOES'), cliente.indexOf('export const ler'));
    expect(bloco).not.toMatch(/episodios_saude|anexos/);
    expect(cliente).toMatch(/async saude\(membroId\)/);
  });

  test('nenhum segredo ficou no código', () => {
    expect(cliente).not.toMatch(/eyJ[A-Za-z0-9_-]{20}|service_role/);
    // a palavra-passe de superutilizador só existe nos scripts de prova locais
    expect(cliente).not.toMatch(/casa-de-testes/);
  });

  test('as provas do servidor existem e dizem se passaram', () => {
    // ⚠ Isto exigia `process.exit(mau ? 1 : 0)` LITERAL em quatro ficheiros
    // escolhidos à mão — a expressão de hoje, não a propriedade. Quando o
    // preâmbulo repetido foi para o `provas.mjs` e o fim passou a `resumo()`,
    // esta prova ficou vermelha sem nada estar partido.
    //
    // A propriedade é: cada prova acaba a devolver um código de saída, e o
    // `provar-tudo.mjs` lê-o para saber se a corrida passou. A lista sai da
    // pasta, não de quatro nomes.
    const fs = require('fs');
    const path = require('path');
    const pasta = path.join(__dirname, '..', 'db', 'pocketbase');
    const provas = fs.readdirSync(pasta).filter(f => /^provar-.*\.mjs$/.test(f));
    expect(provas.length).toBeGreaterThan(20);

    const semFim = provas.filter((f) => {
      const s = fs.readFileSync(path.join(pasta, f), 'utf8');
      return !/\bresumo\(\)/.test(s) && !/process\.exit\(/.test(s);
    });
    expect(semFim).toEqual([]);

    // E o `resumo()` é mesmo quem devolve o código, senão isto não mede nada.
    expect(read('db/pocketbase/provas.mjs')).toMatch(/process\.exit\(mau \? 1 : 0\)/);
  });
});

describe('O que a interface promete, o código faz', () => {
  // O texto anunciava 30 % para as metas (Dinheiro) e para os cofres (Gestão);
  // o manipulador não fazia nem uma coisa nem outra.
  // Sem comentários: o que se mede é o que o utilizador lê, não as notas ao lado.
  const withoutComments = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  test('fechar o mês não promete mover dinheiro', () => {
    for (const f of ['src/screens/Dinheiro.jsx', 'src/screens/Gestao.jsx']) {
      expect(withoutComments(read(f))).not.toMatch(/30\s*%|\*\s*0\.30/);
    }
  });

  test('não sobra o cálculo morto dos 30 %', () => {
    expect(read('src/screens/Dinheiro.jsx')).not.toMatch(/toGoals/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A casa pode ter outros membros além dos quatro da demonstração. Enquanto os
// nomes estiveram escritos à mão, acrescentar uma Ana dava-lhe um avatar e
// mais nada: não aparecia no filtro das tarefas, não tinha cofre, não podia
// ficar responsável por um evento, e o texto do acerto chamava-lhe «o Ana».
describe('A casa não são quatro nomes escritos à mão', () => {
  const semComs = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Os quatro nomes da demonstração só podem viver onde são dados: as
  // sementes (data.js) e as duas constantes de demonstração da loja.
  const PODEM_TER_NOMES = new Set(['src/data.js']);
  const ECRAS = [
    'src/screens/Inicio.jsx', 'src/screens/Tarefas.jsx', 'src/screens/Agenda.jsx',
    'src/screens/Dinheiro.jsx', 'src/screens/Saude.jsx', 'src/screens/Login.jsx',
    'src/screens/Compras.jsx', 'src/screens/Perfil.jsx', 'src/screens/Gestao.jsx',
    'src/screens/ModoCompras.jsx', 'src/sheets/NovoEvento.jsx', 'src/sheets/NovaTarefa.jsx',
    'src/sheets/Cofre.jsx', 'src/KidApp.jsx', 'src/ui.jsx',
  ];

  test.each(ECRAS)('%s não decide nada a partir de um nome', (f) => {
    if (PODEM_TER_NOMES.has(f)) return;
    const src = semComs(read(f));
    // Um nome dentro de uma lista, de uma comparação ou de uma indexação é
    // uma decisão tomada sobre quem vive na casa — e essa não é do ecrã.
    for (const nome of ['Rita', 'Tomás', 'Léo', 'Mia']) {
      expect(src).not.toMatch(new RegExp(`['"\`]${nome}['"\`]`));
    }
  });

  test('as listas de membros vêm da loja, e são expostas', () => {
    const loja = read('src/store.jsx');
    const devolve = loja.slice(loja.lastIndexOf('  return {'));
    for (const nome of ['membrosDaCasa', 'criancas', 'adultos']) {
      expect(loja).toMatch(new RegExp(`const ${nome} = `));
      expect(devolve).toContain(nome);      // não basta derivar; tem de sair
    }
    // e são derivadas do quadro da casa, não da constante das sementes
    expect(loja).toMatch(/const quadro = s\.membros \|\| MEMBERS/);
    expect(loja).toMatch(/const criancas = membrosDaCasa\.filter/);
    expect(loja).toMatch(/const adultos = membrosDaCasa\.filter/);
  });

  test('a cor de um membro responde a qualquer nome', () => {
    const { corDoMembro, PALETA_MEMBROS } = require('../src/theme');
    expect(corDoMembro('Rita')).toBe('#722ED1');       // as sementes não mudam
    const ana = corDoMembro('Ana');
    expect(PALETA_MEMBROS).toContain(ana);
    expect(corDoMembro('Ana')).toBe(ana);              // estável entre chamadas
    expect(corDoMembro('Ana', '#123456')).toBe('#123456');  // a do servidor ganha
  });

  // INVARIANTE #2: o acerto entre adultos era `settled: true` mais o montante
  // somado ao livro dos pontos das crianças. Dois telefones a acertar metade
  // cada um davam a conta fechada com metade paga.
  test('o acerto entre adultos é uma soma de movimentos', () => {
    const loja = semComs(read('src/store.jsx'));
    expect(loja).toMatch(/acertoMovs \|\| \[\]\)\.reduce/);
    expect(loja).toMatch(/acertoMovs: \[\.\.\.\(x\.acertoMovs \|\| \[\]\)/);
    // e ninguém escreve o booleano de volta
    for (const f of ['src/store.jsx', ...ECRAS]) {
      expect(semComs(read(f))).not.toMatch(/settled:\s*true/);
    }
  });

  test('a migração 5 não faz a dívida ressuscitar a quem já acertou', () => {
    const { MIGRATIONS, SCHEMA } = require('../src/store');
    expect(SCHEMA).toBeGreaterThanOrEqual(5);
    const antes = MIGRATIONS[5]({ settled: true });
    expect(antes.settled).toBeUndefined();
    expect(antes.acertoMovs.reduce((a, m) => a + m.valor, 0)).toBeCloseTo(86.5);
    // e quem não tinha acertado continua a dever
    expect(MIGRATIONS[5]({ settled: false }).acertoMovs).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A entrada pela Google partiu-se por causa de uma linha: `scopes` no
// PocketBase SUBSTITUI os pedidos por omissão em vez de acrescentar. Pedindo
// só `calendar.readonly`, a troca do token corria bem e o passo seguinte —
// ir buscar o nome e o e-mail — respondia 401. O erro que chegava ao ecrã era
// «Failed to fetch OAuth2 user», que soa a credencial errada e manda quem o vê
// procurar na consola da Google um problema que não existe.
describe('A entrada pela Google pede sempre a identidade', () => {
  const fonte = semComentarios(read('src/pocketbase.js'));

  test('os scopes de identidade vão em todos os caminhos', () => {
    for (const s of ['openid', 'userinfo.email', 'userinfo.profile']) {
      expect(fonte).toContain(s);
    }
  });

  test('a agenda acrescenta-se à identidade, nunca a substitui', () => {
    // O ramo do calendário tem de espalhar a identidade lá para dentro.
    // `calendar.events`, e não `readonly`: a app passou a criar eventos.
    expect(fonte).toMatch(/\.\.\.IDENTIDADE[\s\S]{0,400}calendar\.events/);
    // e nenhum ramo pede uma lista vazia, que é o que devolvia o token sem
    // identidade nenhuma
    expect(fonte).not.toMatch(/scopes:[\s\S]{0,120}\[\s*\]/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Entrar pela Google dava ecrã branco: `Cannot read properties of undefined
// (reading 'kid')`. A loja lê a casa uma vez, no arranque, quando ainda não há
// sessão — as regras recusam e a leitura volta vazia. Quem entrava ficava com
// o seu nome e o quadro da família de demonstração, e a app lia
// `MEMBERS[user].kid` de um membro que não estava lá.
//
// São dois defeitos, e são precisos os dois: reler a casa depois de entrar, e
// não rebentar quando o membro não está no quadro.
describe('Entrar não pode dar ecrã branco', () => {
  const app = semComentarios(read('App.jsx'));

  test('entrar relê a casa do servidor', () => {
    expect(app).toMatch(/const entrar = async[\s\S]{0,160}lerDoServidor\(\)/);
    expect(app).toMatch(/<Login[^>]*onEnter=\{entrar\}/);
  });

  test('a loja expõe a releitura, em vez de a ter presa no arranque', () => {
    const loja = semComentarios(read('src/store.jsx'));
    expect(loja).toMatch(/const lerDoServidor = async \(\) =>/);
    expect(loja.slice(loja.lastIndexOf('  return {'))).toContain('lerDoServidor');
  });

  // Nenhuma leitura do membro ligado pode assumir que ele está no quadro.
  test('ninguém lê o membro ligado sem guarda', () => {
    const culpados = [];
    for (const f of ['App.jsx', ...jsxFiles()]) {
      semComentarios(read(f)).split('\n').forEach((linha, i) => {
        // `MEMBERS[user].campo` sem `?.` e sem um `MEMBERS[user] &&` antes
        if (/MEMBERS\[(user|kid)\]\.[a-z]/i.test(linha)
            && !/\?\./.test(linha)
            && !/MEMBERS\[(user|kid)\]\s*(&&|\|\|)/.test(linha)) {
          culpados.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(culpados).toEqual([]);
  });

  test('e quem entrou sem estar na casa vê uma explicação, não um ecrã em branco', () => {
    expect(app).toMatch(/if \(!euNaCasa\)/);
    expect(app).toContain('não faz parte desta casa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O servidor mandava os membros e a loja ficava com os PAPÉIS da demonstração.
// O efeito era o contrário do esperado: o servidor dizia que o António
// administra a casa, `s.roles` continuava a ser `{Rita: admin, …}` — onde não
// há nenhum António — e `isAdmin` respondia que não. Quem administra a casa
// entrava e não via a Gestão, que é o único sítio onde a podia gerir.
describe('O que o servidor manda chega inteiro à loja', () => {
  const loja = semComentarios(read('src/store.jsx'));
  // A região é só a função da leitura. O corte anterior ia até
  // `// ler ao arrancar` — um COMENTÁRIO, que o `semComentarios` já tinha
  // apagado: o `indexOf` dava −1, a região era o ficheiro quase todo, e o
  // teste passava com a linha que devia exigir apagada. Uma prova que não
  // morde é pior do que nenhuma, porque dá a impressão de que morde.
  const inicio = loja.indexOf('const lerDoServidor');
  const leitura = loja.slice(inicio, loja.indexOf('useEffect(', inicio));

  test('a região medida é mesmo a da leitura, e não meio ficheiro', () => {
    // ⚠ Isto prendia o COMPRIMENTO — «menos de 2500 caracteres» — e envelheceu
    // mal: entre 04 e 05/09/2026 a função da leitura cresceu seis vezes, uma
    // por cada coisa que passou a vir do servidor (regras, listas, envelopes,
    // compras, equipamentos, preferências). A prova falhava por o código ter
    // crescido, que não é o defeito que ela existe para apanhar.
    //
    // O defeito é o `indexOf` devolver −1 e a região passar a ser o ficheiro
    // quase todo — foi o que aconteceu quando o corte era feito num COMENTÁRIO,
    // que o `semComentarios` já tinha apagado. Então prende-se isso: os dois
    // cortes existem, e a região acaba ANTES do que vem muito depois.
    expect(inicio).toBeGreaterThan(0);
    expect(loja.indexOf('useEffect(', inicio)).toBeGreaterThan(inicio);
    expect(leitura.length).toBeGreaterThan(200);
    // Se a região tivesse engolido meio ficheiro, teria isto lá dentro.
    expect(leitura).not.toContain('const DATA_KEYS');
    expect(leitura).not.toContain('const criarTarefa');
    expect(leitura).not.toContain('const removerTarefa');
  });

  test('a leitura da casa traz os membros, os papéis e o nome', () => {
    for (const campo of ['membros:', 'roles:', 'nomeDaCasa:', 'deDemonstracao:']) {
      expect(leitura).toContain(campo);
    }
  });

  test('os papéis derivam do que o servidor diz, não de uma constante', () => {
    expect(leitura).toMatch(/m\.papel/);
    expect(leitura).not.toMatch(/\bROLES\b/);
  });

  // `isAdmin` lê `s.roles`. Se o servidor mandar um administrador que não
  // esteja lá, a casa fica sem quem a gira — e sem forma de o corrigir pela
  // app, porque o que corrige isso é ser administrador.
  test('isAdmin lê os papéis, e os papéis vêm do servidor', () => {
    expect(loja).toMatch(/const isAdmin = \(name\) => s\.roles\[name\] === 'admin'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A casa vinha do servidor e as tarefas das sementes: o Início mostrava
// tarefas do Léo e do Tomás, e eventos com o avatar a «?», numa casa onde
// nenhum deles vive. Duas casas ao mesmo tempo, no mesmo ecrã.
describe('Uma casa a sério não mostra a família de demonstração', () => {
  const loja = semComentarios(read('src/store.jsx'));
  const inicio = loja.indexOf('const lerDoServidor');
  const leitura = loja.slice(inicio, loja.indexOf('useEffect(', inicio));

  test('a leitura da casa desliga as sementes', () => {
    expect(leitura).toMatch(/clearedSeeds: true/);
  });

  test('e só uma vez — quem já limpou não volta a ser mexido', () => {
    expect(leitura).toMatch(/x\.clearedSeeds \? \{\} :/);
  });

  test('o que a pessoa criou não é semente, e não sai', () => {
    // As derivações juntam sementes com o que foi criado; `clearedSeeds` só
    // tira a primeira metade.
    for (const par of ['clearedSeeds ? [] : TASKS', 'clearedSeeds ? [] : EVENTS',
                       'clearedSeeds ? [] : ITEMS', 'clearedSeeds ? [] : VAULT']) {
      expect(loja).toContain(par);
    }
    expect(loja).toMatch(/clearedSeeds \? \[\] : TASKS\), \.\.\.s\.newTasks/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A janela da Google ficava aberta depois de entrar: o PocketBase serve
// /api/oauth2-redirect com COOP «same-origin», o que a põe num grupo de
// contextos diferente do da app e faz o Chrome recusar o window.close() que
// essa página faz no fim.
describe('A janela da entrada fecha-se', () => {
  // Sem comentários: o cabeçalho do ficheiro EXPLICA a correção e nomeia
  // `same-origin-allow-popups` mais do que uma vez. Ler o ficheiro inteiro
  // fazia o teste passar com a linha trocada, porque casava com a própria
  // explicação — é o erro que o CLAUDE.md já descreve.
  const hook = semComentarios(read('db/pocketbase/pb_hooks/oauth-redirect.pb.js'));

  test('o cabeçalho é ajustado, e só na rota do redirecionamento', () => {
    expect(hook).toContain('/api/oauth2-redirect');
    expect(hook).toContain('same-origin-allow-popups');
    expect(hook).not.toMatch(/unsafe-none/);   // não é um afrouxamento geral
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Um comentário JSX com `*/` lá dentro fecha-se a meio, e o resto do texto vai
// PARAR AO ECRÃ. Aconteceu no «Agendar Evento»: por cima do campo da data
// apareceu «}` — um controlo que parecia tocável e não fazia nada…».
//
// O código compila, o teste de tipos não diz nada, e só se vê a olhar. É
// exatamente o tipo de defeito que uma prova apanha melhor do que uma pessoa.
describe('Nenhum comentário JSX se fecha a meio', () => {
  test('nenhum bloco {/* … */} tem um fecho lá dentro', () => {
    const culpados = [];
    for (const f of ['App.jsx', ...jsxFiles()]) {
      const src = read(f);
      // Cada `{/*` tem de chegar ao seu `*/` sem outro `*/` pelo meio.
      let i = 0;
      while ((i = src.indexOf('{/*', i)) !== -1) {
        const fim = src.indexOf('*/', i + 3);
        const dentro = src.slice(i + 3, fim);
        if (dentro.includes('/*')) {
          culpados.push(`${f}: ${src.slice(i, i + 60).replace(/\n/g, ' ')}`);
        }
        i = fim === -1 ? src.length : fim + 2;
      }
    }
    expect(culpados).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Os números da família de demonstração estavam ESCRITOS em três ecrãs — `550`
// (o limite da Mercearia) e `412` (o que ela lá gastou). Corrigi o primeiro,
// depois o segundo, e o terceiro só apareceu quando o vi no ecrã. Um valor que
// devia ser derivado, escrito à mão em três sítios, diverge em três ritmos.
describe('Nenhum ecrã tem números do orçamento escritos à mão', () => {
  // 700 e 180 saíram da lista: são também espessura de tipo e graus de matiz,
  // e uma prova que apanha `fontWeight: '700'` reprova o ecrã por um motivo
  // que não é o dela. Ficam os que só podem ser dinheiro.
  const DA_DEMONSTRACAO = [550, 412, 318, 486, 171, 1770, 1387, 3200];

  test.each(jsxFiles().filter(f => /screens|sheets/.test(f)))('%s', (f) => {
    const src = semComentarios(read(f));
    const culpados = [];
    for (const n of DA_DEMONSTRACAO) {
      // O número sozinho, não como parte de outro (`1550`), nem numa cor, nem
      // entre aspas (que é sempre tipografia, nunca um euro).
      if (new RegExp(`(?<!['"\d.#])${n}(?!['"\d.])`).test(src)) culpados.push(n);
    }
    expect(culpados).toEqual([]);
  });

  test('e os que os mostram derivam-nos dos envelopes', () => {
    for (const f of ['src/screens/Compras.jsx', 'src/screens/ModoCompras.jsx']) {
      expect(semComentarios(read(f))).toMatch(/envelopes\.find\(e => e\.name === 'Mercearia'\)/);
    }
  });
});

describe('Concordância de género nos nomes dos membros', () => {
  // «Cofre do Mia», visto no ecrã. É o mesmo erro que já tinha dado «Saúde do
  // Mia» — o `deNome`/`oNome`/`aoNome` existem na loja desde então, e estes
  // sítios não os usavam. O género é uma propriedade da pessoa, não coisa que
  // se adivinhe do nome.
  const jsx = () => {
    const fs = require('fs');
    const path = require('path');
    const dirs = ['src', 'src/screens', 'src/sheets', 'src/modals'];
    return dirs.flatMap(d => {
      const p = path.join(__dirname, '..', d);
      if (!fs.existsSync(p)) return [];
      return fs.readdirSync(p).filter(f => f.endsWith('.jsx')).map(f => `${d}/${f}`);
    });
  };

  test('nenhum artigo ou preposição está colado a um nome de membro', () => {
    const culpados = [];
    for (const f of jsx()) {
      const linhas = read(f).split('\n');
      linhas.forEach((l, i) => {
        // `do ${kid}`, `da ${nome}`, `ao ${membro}` — o artigo escrito à mão
        // antes de uma variável que é o nome de uma pessoa.
        if (/\b(do|da|ao|à|pelo|pela|no|na)\s+\$\{(?:st\.)?(nome|membro|kid|k|m|user|quem|name)\}/.test(l)) {
          culpados.push(`${f}:${i + 1}  ${l.trim()}`);
        }
      });
    }
    expect(culpados).toEqual([]);
  });
});

describe('O fundo à volta da coluna, no monitor', () => {
  const app = read('App.jsx');

  test('é a imagem do ecrã de entrada, e não uma cor lisa', () => {
    // Uma cor lisa ao lado da coluna é uma moldura que ninguém escolheu. A app
    // assenta na mesma imagem onde se entra nela.
    expect(app).toMatch(/login-bg.jpg/);
    expect(app).toMatch(/document\.body\.style\.backgroundImage/);
  });

  test('leva o mesmo véu do ecrã de entrada', () => {
    // O Login põe `rgba(0,0,0,0.6)` por cima da fotografia. Se os dois véus
    // divergirem, a passagem da entrada para a app dá um salto de brilho.
    const login = read('src/screens/Login.jsx');
    const veuNoLogin = (login.match(/rgba\(0,0,0,0\.6\)/) || [])[0];
    expect(veuNoLogin).toBeDefined();
    expect(app).toMatch(/rgba\(0, ?0, ?0, ?0\.6\)/);
  });

  test('a imagem não é pedida ao `.uri` e mais nada', () => {
    // O `require` de um asset devolve coisas diferentes em nativo e na web:
    // um número lá, a própria URL cá. Pedir só `.uri` dava `undefined`, e o
    // fundo ficava liso sem um erro a dizer porquê.
    const bloco = app.slice(app.indexOf('document.body.style.backgroundColor'),
                            app.indexOf('backgroundAttachment'));
    expect(bloco).toMatch(/typeof fonte === 'string'/);
    expect(bloco).toMatch(/resolveAssetSource/);
  });

  test('há uma cor por baixo, para o instante antes de a imagem chegar', () => {
    expect(app).toMatch(/document\.body\.style\.backgroundColor = t\.chrome/);
  });

  test('em nativo não se toca no documento, que não existe', () => {
    const bloco = app.slice(app.indexOf('// O que fica ao lado da coluna'),
                            app.indexOf('backgroundAttachment'));
    expect(bloco).toMatch(/typeof document === 'undefined'/);
  });
});

describe('As modais correm dentro da coluna da app', () => {
  // O `<Modal>` do react-native-web sai da raiz e vai para o topo do DOM — é
  // isso que o faz escapar ao `maxWidth` da coluna. No monitor, a folha do
  // Perfil abria com 909 px sobre uma app de 460, e o escurecido apanhava a
  // fotografia à volta, que não é da app.
  const fs = require('fs');
  const path = require('path');
  const raiz = path.join(__dirname, '..');

  // ⚠ ENUMERA-SE do disco: todo o ficheiro que desenhe um `<Modal` entra aqui
  // sozinho. Era uma lista escrita à mão com cinco nomes, e envelheceu nos dois
  // sentidos ao mesmo tempo (08/09/2026): a Gestão deixou de ter modais suas —
  // os dois diálogos passaram ao `Confirm` — e a lista continuava a exigir-lhe
  // um `LARGURA_APP` que já não tinha onde estar; e um ficheiro novo com um
  // `<Modal` a 909 px passava sem ninguém lhe perguntar nada. Uma prova que
  // fixa a lista de hoje é a classe 8 do registo desta casa.
  //
  // ⚠ E lê-se o CÓDIGO, sem os comentários. O Compras e o Modo Compras dizem
  // «era um <Modal>, que no react-native-web escapa à raiz» num comentário que
  // explica porque é que DEIXARAM de o ser — e a primeira versão deste
  // enumerador exigia-lhes um `LARGURA_APP` por causa dessa frase. Um guarda que
  // proíbe o comentário que documenta o defeito é a classe 20.
  const soCodigo = (txt) => txt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const COM_MODAL = (() => {
    const fora = [];
    const percorrer = (dir) => {
      for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) percorrer(rel);
        else if (/\.jsx$/.test(e.name) && /<Modal\b/.test(soCodigo(read(rel)))) fora.push(rel);
      }
    };
    percorrer('src');
    return fora.sort();
  })();

  test('há ficheiros com modal para conferir — senão isto não prova nada', () => {
    expect(COM_MODAL.length).toBeGreaterThan(2);
    // E a Gestão já não está entre eles: os diálogos dela são o `Confirm`.
    expect(COM_MODAL).not.toContain('src/screens/Gestao.jsx');
  });

  test('a largura vive no tema, e não repetida em cada ficheiro', () => {
    // Dois 460 em sítios diferentes divergem no dia em que um deles muda.
    expect(read('src/theme.js')).toMatch(/export const LARGURA_APP = \d+/);
  });

  for (const f of COM_MODAL) {
    test(`${f} limita a modal à largura da app`, () => {
      const c = read(f);
      expect(c).toMatch(/maxWidth: LARGURA_APP/);
      expect(c).toMatch(/LARGURA_APP.*from '.*theme'/s);
    });
  }

  test('nenhum ficheiro escreve o 460 à mão', () => {
    const culpados = [];
    for (const f of [...COM_MODAL, 'App.jsx']) {
      if (/maxWidth: 460\b/.test(read(f))) culpados.push(f);
    }
    expect(culpados).toEqual([]);
  });
});
