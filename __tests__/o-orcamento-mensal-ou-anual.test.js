/**
 * O orçamento por mês, ou para o ano todo.
 *
 * A propriedade que importa: em qualquer distribuição, os doze meses SOMAM o
 * total do ano ao cêntimo — e o orçamento do mês continua a ser a soma dos
 * envelopes que o ecrã mostra.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { StoreProvider, useStore } = require('../src/store');
const O = require('../src/orcamento');

const loja = () => {
  let api = null;
  const Sonda = () => { api = useStore(); return null; };
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
  });
  return () => api;
};

describe('a conta dos meses', () => {
  it('doze partes somam o total, mesmo quando não dividem exatamente', () => {
    for (const total of [38400, 10000, 0.1, 1234.56, 99999.99]) {
      expect(O.somaDosMeses(O.repartirIgual(total))).toBeCloseTo(total, 2);
    }
    expect(O.repartirIgual(38400).every(v => v === 3200)).toBe(true);
  });

  it('⚠ ajustar um mês tira aos outros — o total do ano não mexe', () => {
    const meses = O.repartirIgual(38400);
    const novo = O.ajustarMes(meses, 11, 4800, 38400);
    expect(novo[11]).toBe(4800);
    expect(O.somaDosMeses(novo)).toBeCloseTo(38400, 2);
    expect(novo.every(v => v >= 0)).toBe(true);
  });

  it('um mês não passa do total nem desce de zero, e a soma aguenta', () => {
    const meses = O.repartirIgual(1200);
    const alto = O.ajustarMes(meses, 0, 999999, 1200);
    expect(alto[0]).toBe(1200);
    expect(O.somaDosMeses(alto)).toBeCloseTo(1200, 2);
    const baixo = O.ajustarMes(meses, 0, -50, 1200);
    expect(baixo[0]).toBe(0);
    expect(O.somaDosMeses(baixo)).toBeCloseTo(1200, 2);
  });

  it('com todos os outros a zero, reparte de igual em vez de perder dinheiro', () => {
    const meses = [1200, ...Array(11).fill(0)];
    const novo = O.ajustarMes(meses, 0, 600, 1200);
    expect(O.somaDosMeses(novo)).toBeCloseTo(1200, 2);
  });

  it('o fator do mês é 1 em modo mensal e acima de 1 num mês mais pesado', () => {
    expect(O.fatorDoMes(O.ORCAMENTO_BASE(), 3)).toBe(1);
    const orc = { modo: 'anual', ano: 2026, total: 38400, meses: O.ajustarMes(O.repartirIgual(38400), 11, 4800, 38400) };
    expect(O.fatorDoMes(orc, 11)).toBeCloseTo(1.5, 5);
    expect(O.fatorDoMes(orc, 0)).toBeLessThan(1);
  });

  it('lê com cuidado: o que vem estragado cai no modo mensal', () => {
    expect(O.normalizarOrcamento(null).modo).toBe('mensal');
    expect(O.normalizarOrcamento({ modo: 'anual', total: 'x', meses: [1, 2] }).meses).toBeNull();
    expect(O.normalizarOrcamento({ modo: 'outro' }).modo).toBe('mensal');
  });

  it('mensal → anual não muda de valor: só de unidade', () => {
    const a = O.doMensalParaAnual(3200, 2026);
    expect(a.total).toBe(38400);
    expect(O.rendimentoDoMes(a, 5, 0)).toBe(3200);
  });
});

describe('na loja', () => {
  it('uma casa nova corre no modo mensal, como sempre correu', () => {
    const ler = loja();
    expect(ler().s.orcamento.modo).toBe('mensal');
    expect(ler().rendimentoDoMes).toBe(ler().s.rendimento);
  });

  it('⚠ em modo anual, o orçamento do mês continua a ser a soma dos envelopes', () => {
    const ler = loja();
    const mes = new Date().getMonth();
    TestRenderer.act(() => { ler().definirOrcamento({ modo: 'anual', total: 38400 }); });
    TestRenderer.act(() => { ler().definirOrcamento({ meses: O.ajustarMes(O.repartirIgual(38400), mes, 4800, 38400) }); });
    const st = ler();
    expect(st.budget).toBeCloseTo(st.envelopes.reduce((a, e) => a + e.limit, 0), 2);
    // O mês corrente pesa 1,5 vezes o médio: o orçamento sobe na mesma medida.
    expect(st.budget).toBeCloseTo(1770 * 1.5, 0);
    expect(st.rendimentoDoMes).toBe(4800);
  });

  it('voltar a mensal fica com o rendimento do mês em que se estava', () => {
    const ler = loja();
    const mes = new Date().getMonth();
    TestRenderer.act(() => { ler().definirOrcamento({ modo: 'anual', total: 24000 }); });
    TestRenderer.act(() => { ler().definirOrcamento({ modo: 'mensal' }); });
    expect(ler().s.orcamento.modo).toBe('mensal');
    expect(ler().s.rendimento).toBe(O.repartirIgual(24000)[mes]);
    expect(ler().budget).toBeCloseTo(1770, 2);
  });

  it('o rendimento mensal muda e o ecrã vê-o', () => {
    const ler = loja();
    TestRenderer.act(() => { ler().definirOrcamento({ rendimento: 2800 }); });
    expect(ler().s.rendimento).toBe(2800);
    expect(ler().rendimentoDoMes).toBe(2800);
  });
});
