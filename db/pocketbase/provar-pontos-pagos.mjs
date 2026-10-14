// Os pontos pagos são uma SOMA, e a semanada paga-se uma vez.
//
//   node db/pocketbase/provar-pontos-pagos.mjs
//
// ── O defeito ────────────────────────────────────────────────────────────────
//
// «Quantos pontos de cada criança já foram pagos» era o `paidPts` da loja, e
// subia à mão em `Cofre.jsx`:
//
//     vaultAdd(kid, porPagar, 'semanada', ...);
//     set(x => ({ paidPts: { ...x.paidPts, [kid]: x.paidPts[kid] + pts } }));
//
// Um saldo escrito — o INVARIANTE #2 ao contrário, e desta vez com consequência
// em euros. O movimento de cofre subia para o servidor e chegava aos dois
// telefones, por isso o SALDO do cofre ficava certo nos dois. O `paidPts` não
// subia: no telemóvel do outro adulto continuava a zero, o ecrã dele dizia
// «catorze pontos por pagar», e ele pagava outra vez.
//
// O que a app mostra por pagar é `kidPts - paidPts`. Uma das metades era uma
// soma sobre linhas partilhadas e a outra um número privado de um telefone.
//
// ── O modelo certo ───────────────────────────────────────────────────────────
//
// Os pontos que um movimento pagou vão NO movimento — o campo `pontos` de
// `cofre_movimentos`. Os pontos pagos são a soma dele. Duas metades, duas
// somas, as mesmas linhas: dois telefones não se podem contradizer.
//
// ⚠ E guarda-se o NÚMERO de pontos, não se divide o valor pelo `valor_ponto`:
// o valor do ponto muda, e catorze pontos pagos a 0,10 € continuam a ser
// catorze pontos depois de a casa passar a 0,15 €. A última prova mede isso.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, semRecusa, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

configurar({ url: URL, storage: memoriaDeTelemovel() });

// ── A casa: dois adultos e uma criança ───────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({
  nome: PREFIXO + 'Pontos', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita-pts@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'adulto',  { email: 'tomas-pts@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

await auth.entrarAdulto('rita-pts@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── os pontos pagos são uma soma ──');

await prova('uma casa sem movimentos tem a criança a zero, não a `undefined`', async () => {
  // `kidPts - undefined` é NaN, e um NaN num ecrã de dinheiro não diz que está
  // errado — diz «—», e quem olha julga que não há nada a pagar.
  const lida = await sync.puxarCasa();
  igual(lida.paidPts.Leo, 0, JSON.stringify(lida.paidPts));
});

await prova('pagar catorze pontos escreve-os no movimento', async () => {
  await semRecusa(sync.movimentoDeCofre({
    casa: daRita.casa, membro: leo.id, tipo: 'semanada', valor: 1.4,
    motivo: 'Semanada desta semana', data: '2026-09-05',
    autorizadoPor: daRita.membro, pontos: 14 }), 'semanada');

  const linhas = (await admin.collection('cofre_movimentos').getFullList())
    .filter(m => m.casa === casa.id);
  igual(linhas.length, 1);
  igual(linhas[0].pontos, 14, 'o campo `pontos` não chegou ao servidor');
});

await prova('⚠ e a leitura devolve-os como SOMA, não como campo', async () => {
  const lida = await sync.puxarCasa();
  igual(lida.paidPts.Leo, 14);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e a semanada não se paga duas vezes ──');

await prova('⚠ o SEGUNDO adulto vê os pontos como pagos, e é o defeito todo', async () => {
  // Este é o telemóvel do Tomás: nunca viu a loja da Rita, e a única coisa que
  // tem é o que o servidor lhe responde. Antes desta correção respondia com os
  // movimentos e não com os pontos pagos, e o ecrã dele oferecia pagar outra
  // vez uma semanada que já tinha sido paga.
  configurar({ url: URL, storage: memoriaDeTelemovel() });
  await auth.entrarAdulto('tomas-pts@x.pt', 'palavra-longa-2');

  const dele = await sync.puxarCasa();
  igual(dele.paidPts.Leo, 14, 'o telemóvel do Tomás não sabe que a semanada foi paga');
  // E o cofre bate certo dos dois lados: um movimento, 1,40 €.
  igual(dele.vaultMoves.length, 1);
  igual(dele.vaultMoves[0].delta, 1.4);
});

await prova('e um bónus não paga pontos nenhuns', async () => {
  // Um bónus é dinheiro dado, não pontos convertidos. Se contasse como pontos
  // pagos, dar um euro de bónus tirava dez pontos por pagar à criança.
  await semRecusa(sync.movimentoDeCofre({
    casa: daRita.casa, membro: leo.id, tipo: 'bonus', valor: 1,
    motivo: 'Bónus', data: '2026-09-05', autorizadoPor: daRita.membro }), 'bónus');
  const lida = await sync.puxarCasa();
  igual(lida.paidPts.Leo, 14, 'o bónus contou como pontos pagos');
  igual(lida.vaultMoves.length, 2);
});

await prova('e duas semanadas somam-se, como manda o INVARIANTE #2', async () => {
  await semRecusa(sync.movimentoDeCofre({
    casa: daRita.casa, membro: leo.id, tipo: 'semanada', valor: 0.6,
    motivo: 'Semanada desta semana', data: '2026-09-12',
    autorizadoPor: daRita.membro, pontos: 6 }), 'segunda semanada');
  const lida = await sync.puxarCasa();
  igual(lida.paidPts.Leo, 20);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e o valor do ponto pode mudar ──');

await prova('⚠ mudar o `valor_ponto` NÃO mexe nos pontos já pagos', async () => {
  // É por isto que se guarda o número de pontos e não se divide o valor pelo
  // preço do ponto. Com a divisão, passar de 0,10 € para 0,15 € transformava
  // 2,00 € pagos em 13 pontos em vez de 20 — a criança ganhava sete pontos por
  // pagar que já lhe tinham sido pagos, e ninguém via de onde vieram.
  //
  // ⚠ De volta ao telemóvel da Rita: a prova anterior deixou a sessão no do
  // Tomás, que é adulto mas não administra a casa. O PocketBase responde 404 a
  // uma alteração que a regra não deixa — «não encontrado», não «não pode» — e
  // eu ia a caminho de procurar a casa que nunca esteve perdida.
  await auth.entrarAdulto('rita-pts@x.pt', 'palavra-longa-1');
  await sync.regrasDaCasa(daRita.casa, { pointValue: 0.15 });
  const lida = await sync.puxarCasa();
  igual(lida.regras.pointValue, 0.15, 'o valor do ponto não mudou');
  igual(lida.paidPts.Leo, 20, 'os pontos pagos mexeram-se com o preço do ponto');
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e quem pode escrever no cofre ──');

await prova('⚠ uma criança não escreve no seu próprio cofre', async () => {
  const doLeo = new PocketBase(URL);
  doLeo.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await doLeo.collection('membros').authWithPassword(leo.login, '135790');
  let passou = false;
  try {
    await doLeo.collection('cofre_movimentos').create({
      casa: casa.id, membro: leo.id, tipo: 'semanada', valor: 100,
      pontos: 1000, idem_key: 'roubo' });
    passou = true;
  } catch { /* recusado, que é o esperado */ }
  if (passou) throw new Error('PASSOU — a criança pagou-se a si própria');
});

await prova('⚠ e um movimento não se ALTERA depois de escrito', async () => {
  // `updateRule: null`. Se se pudesse alterar, os pontos pagos deixavam de ser
  // um livro aditivo e voltavam a ser um número que alguém corrige.
  const daRitaPb = new PocketBase(URL);
  daRitaPb.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await daRitaPb.collection('membros').authWithPassword('rita-pts@x.pt', 'palavra-longa-1');
  const linha = (await daRitaPb.collection('cofre_movimentos').getFullList())
    .find(m => m.casa === casa.id);
  let passou = false;
  try { await daRitaPb.collection('cofre_movimentos').update(linha.id, { pontos: 0 }); passou = true; }
  catch { /* recusado */ }
  if (passou) throw new Error('PASSOU — alterou-se um movimento de cofre');
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e o acerto de contas também VOLTA ──');

// A mesma história, no outro livro de dinheiro: o `acerto` escrevia e ninguém
// lia de volta. A coleção `acertos` nem sequer estava na lista que o
// `ler.casa()` puxa. O Tomás pagava à Rita e o telemóvel dela continuava a
// dizer que a dívida estava por acertar.
let setembro = null;

await prova('um acerto entre os dois adultos volta na leitura', async () => {
  setembro = (await comId(sync.abrirMes({
    casa: daRita.casa, mes: 'd2026-09-01', rendimento: 3200, limites: {} }), 'abrirMes')).id;
  await semRecusa(sync.acerto({
    casa: daRita.casa, de: tomas.id, para: rita.id, valor: 86.5,
    data: '2026-09-05' }), 'acerto');

  const lida = await sync.puxarCasa();
  igual(lida.acertoMovs.length, 1, JSON.stringify(lida.acertoMovs));
  igual(lida.acertoMovs[0].valor, 86.5);
  igual(lida.acertoMovs[0].de, 'Tomas');
  igual(lida.acertoMovs[0].para, 'Rita');
});

await prova('⚠ e o OUTRO adulto vê-o pago — que é o defeito todo', async () => {
  configurar({ url: URL, storage: memoriaDeTelemovel() });
  await auth.entrarAdulto('tomas-pts@x.pt', 'palavra-longa-2');
  const dele = await sync.puxarCasa();
  igual(dele.acertoMovs.length, 1, 'o telemóvel do Tomás não sabe que já pagou');
  igual(dele.acertoMovs[0].valor, 86.5);
});

await prova('⚠ e um acerto do mês ANTERIOR não conta no mês novo', async () => {
  // Fechar o mês fazia `acertoMovs: []` — zero por cima de uma soma cujas
  // linhas ficam no servidor. É o mesmo defeito do mês que reabria sozinho, e
  // resolve-se da mesma maneira: filtra-se, não se apaga.
  await auth.entrarAdulto('rita-pts@x.pt', 'palavra-longa-1');
  await semRecusa(sync.acerto({
    casa: daRita.casa, de: tomas.id, para: rita.id, valor: 40,
    data: '2026-08-20' }), 'acerto de agosto');

  const lida = await sync.puxarCasa();
  igual(lida.acertoMovs.length, 1, 'o acerto de agosto entrou no mês de setembro');
  igual(lida.acertoMovs[0].valor, 86.5);

  // E a linha de agosto CONTINUA no servidor: não conta, mas não desapareceu.
  const todas = (await admin.collection('acertos').getFullList())
    .filter(a => a.casa === casa.id);
  igual(todas.length, 2, 'o acerto de agosto foi apagado');
});

resumo();
