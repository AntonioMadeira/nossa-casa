/**
 * Os pontos das tarefas são opcionais — e desligá-los não apaga nada.
 *
 * ── O que se pediu ───────────────────────────────────────────────────────────
 *
 * «Atribuir pontos a tarefas deve ser opcional (poder ligar e desligar e se
 * estiver ligado pode-se atribuir qualquer valor, mesmo 0 €).»
 *
 * Duas coisas, portanto:
 *
 *   um INTERRUPTOR   na Gestão da Casa, ao lado da semanada
 *   qualquer VALOR   incluindo 0 €, onde o mínimo era 0,01 €
 *
 * ── A parte que precisa de rede, não de nota ──────────────────────────────────
 *
 * ⚠ Desligar tem de ser reversível SEM PERDA. Os pontos são somas de movimentos
 * (INVARIANTE #2), e a tentação de «limpar ao desligar» é real — seria perda de
 * dados disfarçada de arrumação. A prova mais dura deste ficheiro desliga,
 * confere que o estado ficou intacto, liga outra vez e exige os mesmos números.
 *
 * ⚠ E uma casa gravada ANTES desta alteração não tem o campo. Ausente tem de
 * significar LIGADO, que é o que a app fazia — um `!!s.pontosLigados` desligava
 * os pontos a quem já os usava, em silêncio, ao actualizar.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { SafeAreaProvider } = require('react-native-safe-area-context');
const { StoreProvider, useStore, DEMO, BLANK } = require('../src/store');
const { buildTheme } = require('../src/theme');

const comLoja = (estado) => {
  let api = null;
  const Sonda = () => { api = useStore(); return null; };
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
  });
  if (estado) TestRenderer.act(() => { api.set(() => estado); });
  return () => api;
};

describe('o interruptor', () => {
  it('nasce ligado — é o que a app fazia até 04/09/2026', () => {
    expect(DEMO().pontosLigados).toBe(true);
    // O `comLoja()` devolve uma FUNÇÃO que lê a loja — daí os dois pares de
    // parênteses. Sem o segundo, isto lia uma propriedade da função.
    expect(comLoja()().pontosNasTarefas).toBe(true);
  });

  it('⚠ e vem no DEMO, portanto chega também ao BLANK', () => {
    // O `BLANK()` espalha o `DEMO()`. Pôr o valor só no BLANK é um defeito já
    // cometido duas vezes neste ficheiro, com o `healthArchived` — e a mesma
    // prova de fumo apanhou-o as duas.
    expect(BLANK().pontosLigados).toBe(true);
  });

  it('⚠ e uma casa gravada SEM o campo lê-se como ligada', () => {
    // Ausente significa ligado. Um `!!s.pontosLigados` desligava os pontos a
    // quem já os usava, em silêncio, ao actualizar a app.
    const loja = comLoja({ ...DEMO(), pontosLigados: undefined });
    expect(loja().pontosNasTarefas).toBe(true);
  });

  it('desliga e volta a ligar', () => {
    const loja = comLoja();
    TestRenderer.act(() => { loja().set({ pontosLigados: false }); });
    expect(loja().pontosNasTarefas).toBe(false);
    TestRenderer.act(() => { loja().set({ pontosLigados: true }); });
    expect(loja().pontosNasTarefas).toBe(true);
  });
});

describe('⚠ desligar não apaga nada — INVARIANTE #2', () => {
  it('os pontos, o que foi pago e o cofre ficam exactamente como estavam', () => {
    const loja = comLoja();
    const antes = {
      pontos: { ...loja().kidPts },
      pagos: JSON.parse(JSON.stringify(loja().s.paidPts || {})),
      movimentos: JSON.parse(JSON.stringify(loja().s.vaultMoves || [])),
      cofres: Object.fromEntries(loja().criancas.map(k => [k, loja().vaultOf(k)])),
    };
    // Havia o que perder — senão esta prova não provava nada.
    expect(Object.values(antes.pontos).some(v => v > 0)).toBe(true);

    TestRenderer.act(() => { loja().set({ pontosLigados: false }); });

    expect(loja().s.paidPts).toEqual(antes.pagos);
    expect(loja().s.vaultMoves).toEqual(antes.movimentos);
    expect({ ...loja().kidPts }).toEqual(antes.pontos);

    TestRenderer.act(() => { loja().set({ pontosLigados: true }); });

    expect({ ...loja().kidPts }).toEqual(antes.pontos);
    expect(loja().s.paidPts).toEqual(antes.pagos);
    expect(Object.fromEntries(loja().criancas.map(k => [k, loja().vaultOf(k)])))
      .toEqual(antes.cofres);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pelos ecrãs.
// ─────────────────────────────────────────────────────────────────────────────
const comMargens = (filho) => React.createElement(SafeAreaProvider,
  { initialMetrics: { frame: { x: 0, y: 0, width: 412, height: 915 },
                      insets: { top: 47, left: 0, right: 0, bottom: 34 } } }, filho);

const junta = (n) => {
  if (n === null || n === undefined || n === false) return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(junta).join(' ');
  return junta(n.children || (n.props && n.props.children) || null);
};

// Monta um ecrã com a loja num estado escolhido. A sonda entra na mesma árvore
// para se poder mexer no estado e voltar a ler o ecrã.
const ecraCom = (Ecra, patch, props = {}) => {
  let r = null, api = null;
  const t = buildTheme('violet', false);
  const Sonda = () => { api = useStore(); return null; };
  TestRenderer.act(() => {
    r = TestRenderer.create(comMargens(React.createElement(StoreProvider, null,
      React.createElement(React.Fragment, null,
        React.createElement(Sonda),
        React.createElement(Ecra, { t, user: 'Rita', onClose: () => {}, ...props })))));
  });
  if (patch) TestRenderer.act(() => { api.set(patch); });
  return { r, loja: () => api, texto: () => junta(r.toJSON()) };
};

describe('a Gestão da Casa', () => {
  const Gestao = require('../src/screens/Gestao').default;

  it('tem o interruptor, e diz que desligar não apaga', () => {
    const { texto } = ecraCom(Gestao, null);
    expect(texto()).toContain('Atribuir pontos às tarefas');
    expect(texto()).toContain('não apaga nada');
  });

  it('⚠ desligado, o quanto-vale-um-ponto e o dia de pagamento saem do ecrã', () => {
    const ligado = ecraCom(Gestao, null);
    expect(ligado.texto()).toContain('Quanto vale um ponto');
    expect(ligado.texto()).toContain('Pagar às');

    const { texto } = ecraCom(Gestao, { pontosLigados: false });
    expect(texto()).not.toContain('Quanto vale um ponto');
    expect(texto()).not.toContain('Pagar às');
    // E diz o que fica: o que estava contado não se perde.
    expect(texto()).toContain('fica guardado');
  });

  it('⚠ a 0 € a frase deixa de falar de dinheiro', () => {
    // «Os 14 pontos por pagar valem 0,00 €» é uma frase que não informa
    // ninguém. A zero, os pontos contam e não valem.
    const { texto } = ecraCom(Gestao, { pointValue: 0 });
    expect(texto()).toContain('não valem dinheiro');
    expect(texto()).not.toMatch(/valem 0,00/);
  });

  it('⚠ e o menos desce até 0, que era o que faltava', () => {
    // O mínimo era 0,01 €: os pontos tinham de valer sempre algo.
    //
    // ⚠ Esta prova fixava a EXPRESSÃO — `Math.max(0, +(s.pointValue - 0.05)`
    // — e não a propriedade. Quando o controlo passou a ser o `NumField`
    // partilhado, que já traz o mínimo e o arredondamento, a prova falhou sem
    // que nada tivesse regredido. É a mesma forma do tecto de 2500 caracteres
    // e da lista literal do `COM_IDEM`: uma fotografia do estado de hoje
    // envelhece a impedir a arrumação de amanhã.
    //
    // O que interessa é o LIMITE, venha ele de onde vier.
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'src/screens/Gestao.jsx'), 'utf8');
    // O campo do valor do ponto — o separador Orçamento tem outros NumField acima
    // (rendimento, meses), e o primeiro do ficheiro já não é este.
    const inicio = codigo.indexOf('<NumField t={t} value={pontoAEscrever');
    const campo = codigo.slice(inicio, inicio + 220);
    // ⚠ O valor mostrado é o rascunho ENQUANTO se escreve, e o da casa quando
    // não se está a escrever (15/09/2026): o `NumField` passou a dar o valor a
    // cada tecla, e a casa só se escreve no valor assente — ver o
    // `aoTerminar` e o guarda em `editar-muda-o-titulo`.
    expect(campo).toMatch(/value=\{pontoAEscrever \?\? s\.pointValue\}/);
    expect(campo).toMatch(/min=\{0\}/);
    // E o máximo do ecrã é o do servidor: `num('valor_ponto', { min: 0, max: 5 })`.
    expect(campo).toMatch(/max=\{5\}/);
    expect(codigo).not.toMatch(/Math\.max\(0\.01,/);
  });

  it('⚠ e o SERVIDOR aceita o mesmo mínimo — senão a escolha era recusada', () => {
    // Eu baixei o mínimo no ecrã em 04/09/2026 e deixei o servidor em 0,01. A
    // escolha de 0 € era aceite no telefone e recusada ao subir: a mesma forma
    // de falha silenciosa do `tarefas_feitas`, onde a regra era mais apertada
    // do que a app. Os dois lados têm de dizer a mesma coisa.
    const fs = require('fs');
    const path = require('path');
    const esquema = fs.readFileSync(
      path.join(__dirname, '..', 'db/pocketbase/criar-colecoes.mjs'), 'utf8');
    expect(esquema).toMatch(/num\('valor_ponto', \{ min: 0, max: 5 \}\)/);
  });

  it('⚠ e a mudança passa pela loja, não por um `set` solto no ecrã', () => {
    // Uma regra da casa mudada com `set(...)` fica no telefone de quem a mudou.
    const fs = require('fs');
    const path = require('path');
    const codigo = fs.readFileSync(path.join(__dirname, '..', 'src/screens/Gestao.jsx'), 'utf8');
    for (const regra of ['pointValue', 'payDay', 'splitHalf', 'pontosLigados']) {
      expect(codigo).toMatch(new RegExp(`mudarRegraDaCasa\\(\\{ ${regra}`));
    }
  });
});

describe('as Tarefas', () => {
  const Tarefas = require('../src/screens/Tarefas').default;

  it('⚠ desligados, as pastilhas de pontos saem — e a semanada já não vive aqui', () => {
    // A «Semanada das Crianças» passou ao Dinheiro em 10/09/2026 («Cofres das
    // Crianças»): o dono da casa achou que não fazia sentido junto das tarefas.
    const ligado = ecraCom(Tarefas, null);
    expect(ligado.texto()).not.toContain('Semanada das Crianças');
    expect(ligado.texto()).toMatch(/\d+ pt/);

    const { texto } = ecraCom(Tarefas, { pontosLigados: false });
    expect(texto()).not.toMatch(/\d+ pt\b/);
  });
});

describe('o Dinheiro — os cofres das crianças', () => {
  const Dinheiro = require('../src/screens/Dinheiro').default;

  it('mostra os cofres com o câmbio e o que está por pagar', () => {
    const { texto } = ecraCom(Dinheiro, null);
    expect(texto()).toContain('Cofres das Crianças');
    // `\s+`: o «1 pt = » e o valor são dois nós de texto, e o `junta` põe um
    // espaço entre eles.
    expect(texto()).toMatch(/1 pt =\s+\d+,\d{2}\s*€/);
    expect(texto()).toMatch(/por pagar/);
    expect(texto()).toMatch(/no cofre/);
  });

  it('⚠ desligados, os cofres FICAM — são dinheiro, não pontos — mas sem câmbio nem «por pagar»', () => {
    const { texto } = ecraCom(Dinheiro, { pontosLigados: false });
    expect(texto()).toContain('Cofres das Crianças');
    expect(texto()).toContain('Pontos desligados');
    expect(texto()).not.toMatch(/1 pt =/);
    expect(texto()).not.toMatch(/por pagar/);
  });

  it('a 0 € o câmbio não se escreve, e ninguém tem «0,00 € por pagar»', () => {
    const { texto } = ecraCom(Dinheiro, { pointValue: 0 });
    expect(texto()).not.toMatch(/1 pt = 0,00/);
    expect(texto()).not.toMatch(/0,00\s*€\s*por pagar/);
    expect(texto()).toMatch(/\d+ pontos?\b/);
  });
});

describe('a folha de Nova Tarefa', () => {
  const NovaTarefa = require('../src/sheets/NovaTarefa').default;

  it('⚠ desligados, não pede pontos — pedia um número que ninguém usava', () => {
    const ligado = ecraCom(NovaTarefa, null);
    expect(ligado.texto()).toContain('Pontos');

    const { texto } = ecraCom(NovaTarefa, { pontosLigados: false });
    expect(texto()).not.toContain('Pontos');
    // E o resto da folha fica.
    expect(texto()).toContain('Urgência');
  });
});

describe('o modo criança', () => {
  const KidApp = require('../src/KidApp').default;

  const kid = (patch, tab) => ecraCom(KidApp, patch,
    { kid: 'Léo', kidTab: tab || 'tarefas', setKidTab: () => {}, onLogout: () => {} });

  it('⚠ desligados, o cartão «Pontos da semana» sai e o cabeçalho não os conta', () => {
    const ligado = kid(null);
    expect(ligado.texto()).toContain('Pontos da semana');
    expect(ligado.texto()).toContain('por pagar');

    const { texto } = kid({ pontosLigados: false });
    expect(texto()).not.toContain('Pontos da semana');
    expect(texto()).not.toContain('por pagar');
    // O cofre continua a ser dito: um bónus não é um ponto.
    expect(texto()).toContain('no cofre');
    // E o que resta do resumo fica.
    expect(texto()).toContain('Por fazer hoje');
  });

  it('⚠ e no cofre não promete uma semanada de 0,00 €', () => {
    // «Mais 0,00 € quando a semanada for paga» é uma promessa vazia dita a uma
    // criança.
    const { texto } = kid({ pointValue: 0 }, 'cofre');
    expect(texto()).not.toMatch(/Mais 0,00.*semanada/);
  });
});
