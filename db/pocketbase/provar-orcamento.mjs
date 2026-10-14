// O orçamento na base de dados — e dois telemóveis a mover dinheiro sem se
// anularem.
//
//   node db/pocketbase/provar-orcamento.mjs
//
// ── O que se encontrou ───────────────────────────────────────────────────────
//
// Duas coisas, e a segunda é a grave.
//
// 1. Os envelopes eram SEMENTES NO CÓDIGO (`ENV_BASE`). A lista da casa não
//    existia em lado nenhum, e «criar um envelope» acrescentava uma chave a um
//    mapa de limites — que o ecrã nem sequer lia.
//
// 2. ⚠ O `envMove` — o ajuste de cada envelope dentro do mês — era um SALDO
//    ESCRITO: um mapa `nome → número` que cada telefone reescrevia por inteiro.
//    É o INVARIANTE #2 ao contrário, e o CLAUDE.md descreve exactamente a
//    consequência: «é isto que impede dois telefones de se anularem quando
//    ambos alteram a mesma casa — e é a diferença entre uma app que funciona a
//    dois e uma que perde dinheiro».
//
// O servidor já tinha a resposta: `transferencias`, aditiva e com chave de
// idempotência. O `envMove` passa a ser a SOMA delas.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, semRecusa, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

configurar({ url: URL, storage: memoriaDeTelemovel() });

// ── A casa ───────────────────────────────────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({
  nome: PREFIXO + 'Bengui', valor_ponto: 0.1, rendimento_mensal: 3200 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',  { email: 'rita@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'admin',  { email: 'tomas@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doTomas = await telemovel('tomas@x.pt', 'palavra-longa-2');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── os envelopes deixam de ser sementes no código ──');

let mercearia = null, lazer = null, casaEContas = null;

await prova('criar um envelope cria uma linha, e devolve o id', async () => {
  const r = await comId(sync.criarEnvelope({
    casa: daRita.casa, nome: 'Mercearia', limite: 550, cor: '#1890FF' }), 'criarEnvelope');
  mercearia = r.id;
  const e = await admin.collection('envelopes').getOne(mercearia);
  // ⚠ `limite_base` e não `limit`; `nome` e não `name`. O PocketBase ignora em
  // silêncio o que não conhece.
  igual(e.nome, 'Mercearia');
  igual(e.limite_base, 550);
  igual(e.cor, '#1890FF');
});

await prova('e mais dois', async () => {
  lazer = (await comId(sync.criarEnvelope({
    casa: daRita.casa, nome: 'Sair & lazer', limite: 180 }), 'criarEnvelope(lazer)')).id;
  casaEContas = (await comId(sync.criarEnvelope({
    casa: daRita.casa, nome: 'Casa & contas', limite: 700 }), 'criarEnvelope(casa)')).id;
  igual((await admin.collection('envelopes').getFullList()).filter(e => e.casa === casa.id).length, 3);
});

await prova('⚠ e o `puxarCasa` traz a lista na forma que os ecrãs leem', async () => {
  const lida = await sync.puxarCasa();
  const m = (lida.envelopesDaCasa || []).find(e => e.name === 'Mercearia');
  if (!m) throw new Error('a Mercearia não veio');
  igual(m.limit, 550);
  igual(m.color, '#1890FF');
  igual(m.id, mercearia);
});

await prova('alterar muda a linha, e apagar apaga-a', async () => {
  await sync.alterarEnvelope(lazer, { nome: 'Lazer', limite: 200 });
  const e = await admin.collection('envelopes').getOne(lazer);
  igual(e.nome, 'Lazer');
  igual(e.limite_base, 200);

  // ⚠ Sem o `comId` a metade de apagar passava com o envelope POR CRIAR: o
  // `temporario` ficava `undefined` e o `getOne(undefined)` rebentava, que é o
  // que o `recusado` quer ver. Verde sem nada ter sido criado nem apagado.
  const temporario = (await comId(sync.criarEnvelope({
    casa: daRita.casa, nome: 'Temporário', limite: 10 }), 'criarEnvelope(temporário)')).id;
  await sync.apagarEnvelope(temporario);
  await recusado(() => admin.collection('envelopes').getOne(temporario));
});

console.log('\n── e quem os vê ──');

await prova('⚠ uma CRIANÇA não recebe o orçamento — ausente, não escondido', async () => {
  const doLeo = await telemovel(leo.login, '135790');
  igual((await doLeo.collection('envelopes').getFullList()).length, 0);
  await recusado(() => doLeo.collection('envelopes').getOne(mercearia));
});

await prova('⚠ nem as transferências, nem as despesas', async () => {
  const doLeo = await telemovel(leo.login, '135790');
  igual((await doLeo.collection('transferencias').getFullList()).length, 0);
  igual((await doLeo.collection('despesas').getFullList()).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e dois telemóveis a mover dinheiro NÃO se anulam ──');

await prova('a Rita move 50 € da Mercearia para o Lazer', async () => {
  await semRecusa(sync.transferenciaEntreEnvelopes({
    casa: daRita.casa, de: mercearia, para: lazer, valor: 50,
    mes: '2026-09-01', por: daRita.membro }), 'transferência da Rita');
  const t = (await admin.collection('transferencias').getFullList()).filter(x => x.casa === casa.id);
  igual(t.length, 1);
});

await prova('o Tomás move 30 € do Lazer para a Casa & contas, do telemóvel dele', async () => {
  await doTomas.collection('transferencias').create({
    casa: casa.id, de_envelope: lazer, para_envelope: casaEContas,
    valor: 30, mes: '2026-09-01', por: tomas.id, idem_key: 'prova-tomas-1' });
  const t = (await admin.collection('transferencias').getFullList()).filter(x => x.casa === casa.id);
  igual(t.length, 2, 'uma das duas apagou a outra');
});

await prova('⚠ e o ajuste de cada envelope é a SOMA — as duas contam', async () => {
  // É aqui que o saldo escrito falhava: o último a gravar apagava o outro.
  // Mercearia  −50
  // Lazer      +50 −30 = +20
  // Casa       +30
  const lida = await sync.puxarCasa();
  igual(lida.envMove['Mercearia'], -50);
  igual(lida.envMove['Lazer'], 20, JSON.stringify(lida.envMove));
  igual(lida.envMove['Casa & contas'], 30);
});

await prova('⚠ e a soma de todos os ajustes é ZERO — não sai dinheiro da conta', async () => {
  // Mover dinheiro entre envelopes redistribui o orçamento; não o aumenta nem
  // o diminui. Se esta soma não for zero, criou-se ou perdeu-se dinheiro.
  const lida = await sync.puxarCasa();
  const total = Object.values(lida.envMove).reduce((a, b) => a + b, 0);
  igual(Math.round(total * 100) / 100, 0, JSON.stringify(lida.envMove));
});

await prova('⚠ e a mesma transferência reenviada não conta duas vezes', async () => {
  // A chave de idempotência é o que impede a fila de duplicar um movimento
  // depois de uma reconexão.
  await recusado(() => doTomas.collection('transferencias').create({
    casa: casa.id, de_envelope: lazer, para_envelope: casaEContas,
    valor: 30, mes: '2026-09-01', por: tomas.id, idem_key: 'prova-tomas-1' }));
  const lida = await sync.puxarCasa();
  igual(lida.envMove['Casa & contas'], 30);
});

console.log('\n── e uma transferência não se reescreve ──');

await prova('⚠ nem a Rita altera ou apaga a transferência do Tomás', async () => {
  // `updateRule: null, deleteRule: null` — a coleção é aditiva, e uma linha
  // aditiva que se possa editar deixa de o ser.
  const t = (await admin.collection('transferencias').getFullList())
    .find(x => x.idem_key === 'prova-tomas-1');
  const dela = await telemovel('rita@x.pt', 'palavra-longa-1');
  await recusado(() => dela.collection('transferencias').update(t.id, { valor: 999 }));
  await recusado(() => dela.collection('transferencias').delete(t.id));
});

await prova('⚠ e ninguém move dinheiro entre envelopes de OUTRA casa', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  const nela = await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'vizinha-orc@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('vizinha-orc@x.pt', 'palavra-longa-9');

  // A mesma forma de defeito que apareceu quatro vezes: uma relação que a
  // regra nunca pergunta de que casa é.
  await recusado(() => cVizinha.collection('transferencias').create({
    casa: outra.id, de_envelope: mercearia, para_envelope: lazer,
    valor: 10, mes: '2026-09-01', por: nela.id, idem_key: 'intrusa-1' }));

  const t = (await admin.collection('transferencias').getFullList()).filter(x => x.casa === casa.id);
  igual(t.length, 2, 'entrou uma transferência de fora');

  // ⚠ E o mesmo nas DESPESAS, que têm um `envelope` da mesma forma. Uma
  // despesa lançada de fora contra um envelope desta casa aparecia como gasta
  // no orçamento desta família.
  await recusado(() => cVizinha.collection('despesas').create({
    casa: outra.id, envelope: mercearia, valor: 999, pagador: nela.id,
    descricao: 'Intrusa', idem_key: 'intrusa-despesa-1' }));
  const d = (await admin.collection('despesas').getFullList()).filter(x => x.envelope === mercearia);
  igual(d.length, 0, 'entrou uma despesa de fora');
});

resumo();
