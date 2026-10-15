// O orçamento da casa: por mês, ou para o ano todo.
//
// ── A forma ──────────────────────────────────────────────────────────────────
//
//   { modo: 'mensal' | 'anual', ano: 2026, total: 38400, meses: null | [12 valores] }
//
// `mensal` é como a app sempre funcionou: o `rendimento` da casa é o de todos os
// meses, e os limites dos envelopes são os de todos os meses.
//
// `anual` guarda o rendimento do ANO e a sua distribuição pelos meses: `meses`
// nulo quer dizer «igual todos os meses» (total ÷ 12); uma lista de doze valores
// é uma distribuição à mão, que soma sempre o total.
//
// ── Como chega aos envelopes ─────────────────────────────────────────────────
//
// O limite de um envelope continua a ser UM número — o do mês médio, aquele que
// a Gestão edita. Em modo anual o mês corrente multiplica-o pelo `fatorDoMes`:
// um mês que pesa o dobro da média dá o dobro do limite a cada envelope, e o
// orçamento do mês continua a ser a soma dos envelopes (a regra de
// `o-orcamento-e-a-soma-dos-envelopes`). Em modo mensal o fator é 1 e nada muda.
//
// ⚠ Tudo em cêntimos inteiros por dentro. 38 400 € em doze partes dá 3 200,00 €
// certos, mas 10 000 € não: 833,33 × 12 são 9 999,96 €. O que sobra dos
// arredondamentos vai para o último mês, para a soma bater sempre com o total.

export const MESES_DO_ANO = 12;
export const MODOS = ['mensal', 'anual'];

const cent = (v) => Math.round((Number(v) || 0) * 100);
const euros = (c) => c / 100;

export const ORCAMENTO_BASE = () => ({ modo: 'mensal', ano: null, total: 0, meses: null });

// Lê o que vem do servidor (ou do disco) sem confiar nele: uma casa que nunca
// escolheu nada tem `null`, e um valor estragado cai no modo mensal em vez de
// partir o ecrã.
export const normalizarOrcamento = (o) => {
  if (!o || typeof o !== 'object' || o.modo !== 'anual') return ORCAMENTO_BASE();
  const total = Math.max(0, Number(o.total) || 0);
  const meses = Array.isArray(o.meses) && o.meses.length === MESES_DO_ANO
    && o.meses.every(v => Number.isFinite(Number(v)) && Number(v) >= 0)
    ? o.meses.map(Number) : null;
  return { modo: 'anual', ano: Number(o.ano) || null, total, meses };
};

// total repartido em doze partes que SOMAM o total, ao cêntimo.
export const repartirIgual = (total) => {
  const c = cent(total);
  const base = Math.floor(c / MESES_DO_ANO);
  const partes = Array(MESES_DO_ANO).fill(base);
  partes[MESES_DO_ANO - 1] += c - base * MESES_DO_ANO;
  return partes.map(euros);
};

// Os doze valores do ano, quer sejam iguais quer à mão.
export const mesesDoOrcamento = (orc) => (orc.meses && orc.meses.length === MESES_DO_ANO
  ? orc.meses : repartirIgual(orc.total));

export const somaDosMeses = (meses) => euros(meses.reduce((a, v) => a + cent(v), 0));

// O rendimento de um mês (0 = janeiro). Em modo mensal é o da casa.
export const rendimentoDoMes = (orc, indice, rendimentoMensal) => (
  orc.modo === 'anual' ? mesesDoOrcamento(orc)[indice] : (Number(rendimentoMensal) || 0));

// Quanto o mês pesa contra o mês médio. 1 em modo mensal, e sem total não há
// nada contra que medir.
export const fatorDoMes = (orc, indice) => {
  if (orc.modo !== 'anual' || !(orc.total > 0)) return 1;
  return mesesDoOrcamento(orc)[indice] / (orc.total / MESES_DO_ANO);
};

// Muda UM mês e tira (ou dá) a diferença aos outros, em partes iguais, para o
// total do ano não mexer. Um mês nunca fica abaixo de zero nem acima do total, e
// os outros nunca ficam abaixo de zero: o que não couber fica no próprio mês.
export const ajustarMes = (meses, indice, novoValor, total) => {
  const t = cent(total);
  const atual = meses.map(cent);
  const alvo = Math.min(Math.max(cent(novoValor), 0), t);
  const outros = atual.map((_, i) => i).filter(i => i !== indice);
  const somaOutros = outros.reduce((a, i) => a + atual[i], 0);
  // Os outros têm de ficar com t - alvo; se não chegarem a somar isso (alvo
  // pequeno de mais, ou outros todos a zero) distribui-se de igual.
  let porRepartir = t - alvo;
  const novo = atual.slice();
  novo[indice] = alvo;
  if (somaOutros > 0) {
    let usado = 0;
    outros.forEach((i, k) => {
      const parte = k === outros.length - 1
        ? porRepartir - usado
        : Math.round(atual[i] * porRepartir / somaOutros);
      novo[i] = Math.max(0, parte);
      usado += novo[i];
    });
  } else {
    const base = Math.floor(porRepartir / outros.length);
    outros.forEach((i, k) => { novo[i] = k === outros.length - 1 ? porRepartir - base * (outros.length - 1) : base; });
  }
  // Corrige o resto de arredondamentos no último mês que o aguente.
  const resto = t - novo.reduce((a, v) => a + v, 0);
  if (resto !== 0) {
    const i = outros.slice().reverse().find(j => novo[j] + resto >= 0);
    if (i !== undefined) novo[i] += resto; else novo[indice] += resto;
  }
  return novo.map(euros);
};

// Passar de mensal a anual: o ano começa a doze vezes o rendimento que a casa
// já tem, distribuído por igual — nada muda de valor, só de unidade.
export const doMensalParaAnual = (rendimentoMensal, ano) => ({
  modo: 'anual', ano, total: euros(cent(rendimentoMensal) * MESES_DO_ANO), meses: null,
});

// E de anual a mensal: o rendimento mensal passa a ser o do mês corrente, que é
// o que a casa estava a viver.
export const doAnualParaMensal = (orc, indice) => ({
  orcamento: ORCAMENTO_BASE(), rendimento: mesesDoOrcamento(orc)[indice],
});
