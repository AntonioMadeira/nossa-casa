/**
 * O orçamento é a SOMA dos envelopes que o ecrã mostra. Sempre.
 *
 * ⚠ É o INVARIANTE #2 na sua terceira roupagem, e desta vez em euros, à vista,
 * no primeiro número que a família lê.
 *
 * O `budget` vinha de `Object.values(s.monthLimits)` — uma segunda fonte para a
 * mesma coisa, ao lado da lista que o ecrã desenha. Divergiam no uso normal:
 *
 *   apagar   um envelope saía da lista e o limite dele FICAVA no mapa. O
 *            orçamento continuava a contá-lo, e o «Disponível» do Início ficava
 *            alto para sempre.
 *   renomear a lista mudava de nome e o mapa não: o orçamento passava a contar
 *            um envelope que já não existe.
 *   o limite ia para o servidor e não para o mapa; o orçamento só se mexia na
 *            leitura seguinte.
 *
 * E `{}` é verdadeiro em JavaScript: com o mapa vazio o orçamento dava ZERO
 * enquanto o ecrã listava quatro envelopes. Foi assim que se viu — «0 % dos
 * 0,00 € atribuídos aos envelopes» por cima de uma lista que soma 1 770,00 €.
 *
 * As 1375 provas de então passavam todas. Nenhuma comparava as duas metades.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { StoreProvider, useStore } = require('../src/store');

const loja = () => {
  let api = null;
  const Sonda = () => { api = useStore(); return null; };
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
  });
  return () => api;
};

// A propriedade, num sítio só: o total é a soma do que se vê.
const bate = (ler) => {
  const st = ler();
  const soma = st.envelopes.reduce((a, e) => a + e.limit, 0);
  expect(st.budget).toBeCloseTo(soma, 2);
  return { soma, envelopes: st.envelopes };
};

describe('⚠ o orçamento bate certo com a lista', () => {
  it('numa casa acabada de abrir', () => {
    const ler = loja();
    const { soma } = bate(ler);
    expect(soma).toBeGreaterThan(0);   // senão isto não prova nada
  });

  it('depois de criar um envelope', () => {
    const ler = loja();
    const antes = ler().budget;
    TestRenderer.act(() => { ler().criarEnvelope('Férias', 300); });
    bate(ler);
    expect(ler().budget).toBeCloseTo(antes + 300, 2);
  });

  it('⚠ depois de APAGAR um — o limite não pode ficar para trás', () => {
    const ler = loja();
    const alvo = ler().envelopes[0];
    const antes = ler().budget;
    TestRenderer.act(() => { ler().apagarEnvelope(alvo.name); });
    bate(ler);
    expect(ler().budget).toBeCloseTo(antes - alvo.limit, 2);
    expect(ler().envelopes.some(e => e.name === alvo.name)).toBe(false);
  });

  it('⚠ depois de RENOMEAR um — o ajuste do mês acompanha o nome', () => {
    const ler = loja();
    const alvo = ler().envelopes[0];
    const antes = ler().budget;
    TestRenderer.act(() => { ler().alterarEnvelope(alvo.name, { nome: 'Outro nome' }); });
    bate(ler);
    // Renomear não é mudar de valor: o total fica onde estava.
    expect(ler().budget).toBeCloseTo(antes, 2);
    expect(ler().envelopes.some(e => e.name === 'Outro nome')).toBe(true);
  });

  it('⚠ depois de MUDAR o limite — sem esperar pela leitura seguinte', () => {
    const ler = loja();
    const alvo = ler().envelopes[0];
    const antes = ler().budget;
    TestRenderer.act(() => { ler().alterarEnvelope(alvo.name, { limite: alvo.limit + 100 }); });
    bate(ler);
    expect(ler().budget).toBeCloseTo(antes + 100, 2);
  });

  it('e depois de mover dinheiro entre dois — um transfere, não cria', () => {
    const ler = loja();
    const [a, b] = ler().envelopes;
    const antes = ler().budget;
    TestRenderer.act(() => { ler().moverEntreEnvelopes(a.name, b.name, 50); });
    bate(ler);
    // Uma transferência não muda o total da casa: tira de um e põe no outro.
    expect(ler().budget).toBeCloseTo(antes, 2);
  });

  it('⚠ e com a casa esvaziada, o total segue a lista em vez de dar zero', () => {
    // `{}` é verdadeiro: o ramo das sementes nunca corria, e o orçamento dava
    // zero por cima de uma lista com envelopes lá dentro.
    const ler = loja();
    TestRenderer.act(() => { ler().set({ monthLimits: {}, envelopesDaCasa: [] }); });
    const { soma, envelopes } = bate(ler);
    expect(envelopes.length).toBeGreaterThan(0);
    expect(soma).toBeGreaterThan(0);
    expect(ler().budget).not.toBe(0);
  });

  it('⚠ apagar TODOS os envelopes deixa a lista vazia — as sementes não voltam', () => {
    // Uma lista vazia era lida como «ninguém mexeu» e trazia as quatro
    // sementes de volta. A bandeira `envelopesProprios` é quem decide.
    const ler = loja();
    ler().envelopes.map(e => e.name).forEach((nome) => {
      TestRenderer.act(() => { ler().apagarEnvelope(nome); });
    });
    expect(ler().envelopes).toHaveLength(0);
    expect(ler().budget).toBe(0);
    // E criar um a seguir não ressuscita os antigos.
    TestRenderer.act(() => { ler().criarEnvelope('Férias', 300); });
    expect(ler().envelopes.map(e => e.name)).toEqual(['Férias']);
  });

  it('e o que sobra sem envelope nunca é negativo nem maior que o rendimento', () => {
    const ler = loja();
    const st = ler();
    const sobra = Math.max(0, (st.s.rendimento || 0) - st.budget);
    expect(sobra).toBeGreaterThanOrEqual(0);
    expect(sobra).toBeLessThanOrEqual(st.s.rendimento || 0);
  });
});

describe('o `budget` sai de uma fonte só', () => {
  const fs = require('fs');
  const path = require('path');
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'store.jsx'), 'utf8');

  it('⚠ é a soma dos envelopes, e não uma segunda contagem ao lado', () => {
    expect(codigo).toMatch(/const budget = envelopes\.reduce\(/);
    expect(codigo).not.toMatch(/const budget = s\.monthLimits/);
  });

  it('e o `spent` continua a ser a soma dos mesmos', () => {
    expect(codigo).toMatch(/const spent = envelopes\.reduce\(/);
  });
});
