// A ordem das tarefas é da CASA, e o registo diz quem fez o quê.
//
//   node db/pocketbase/provar-ordem-e-registo.mjs
//
// ── As duas decisões que estavam por tomar ───────────────────────────────────
//
// Ficaram escritas no `o-que-sobe.js` durante dois dias, com a razão a dizer
// «está por decidir». São estas:
//
// **A ordem à mão é da casa.** Se fosse de quem olha, a Rita arrastava «Levar o
// lixo» para cima e o Tomás continuava a vê-la em terceiro — os dois a falar da
// «primeira tarefa» a pensar em tarefas diferentes. A urgência e o prazo já são
// da casa (INVARIANTE #6); a ordem dentro do grupo é a mesma espécie de coisa.
// Vai no campo `posto` da linha da tarefa.
//
// **O registo apende-se, e não há repetidas.** A dúvida escrita era o que fazer
// com as linhas repetidas ao juntar dois históricos — e a resposta é que não se
// juntam: a linha nasce no momento da ACÇÃO, escrita pelo telefone que a fez.
// Sem `updateRule` nem `deleteRule`, que um registo que se corrige não é um
// registo.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, semRecusa, comId, resumo,
  memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

// Cada chamada devolve um `Map` novo, e é isso que serve para trocar de
// telemóvel a meio: o do Tomás não sabe nada do da Rita.
configurar({ url: URL, storage: memoriaDeTelemovel() });

// ── A casa ───────────────────────────────────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({
  nome: PREFIXO + 'Ordem', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita-ord@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'adulto',  { email: 'tomas-ord@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

await auth.entrarAdulto('rita-ord@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── a ordem à mão é da casa ──');

let lixo = null, loica = null, cama = null;

await prova('três tarefas do mesmo grupo de urgência nascem sem posto', async () => {
  const nova = (titulo) =>
    comId(sync.tarefaDaCasa({ casa: daRita.casa, titulo, urgencia: 1 }), titulo);
  lixo  = (await nova('Levar o lixo')).id;
  loica = (await nova('Lavar a loiça')).id;
  cama  = (await nova('Fazer a cama')).id;

  const lida = await sync.puxarCasa();
  // ⚠ Sem posto NÃO há entrada no mapa, e é isto que obrigou os postos a contar
  // de um. Um campo `number` do PocketBase não é anulável: uma tarefa que nunca
  // foi arrastada lê-se 0, e com postos a contar de zero as três apareciam
  // todas em primeiro lugar, empatadas. Não dava erro — dava uma lista por
  // ordem qualquer, que é pior.
  //
  // Foi esta prova que o apanhou, e apanhou-o à primeira execução.
  igual(Object.keys(lida.taskOrder || {}).length, 0, JSON.stringify(lida.taskOrder));
});

await prova('arrastar escreve o posto na LINHA da tarefa', async () => {
  // A ordem nova: a cama primeiro, depois o lixo, depois a loiça. Os postos
  // contam de UM — ver a prova do zero, mais abaixo.
  await sync.alterarTarefa(cama,  { posto: 1 });
  await sync.alterarTarefa(lixo,  { posto: 2 });
  await sync.alterarTarefa(loica, { posto: 3 });

  const lida = await sync.puxarCasa();
  igual(lida.taskOrder[cama], 1, JSON.stringify(lida.taskOrder));
  igual(lida.taskOrder[lixo], 2);
  igual(lida.taskOrder[loica], 3);
});

await prova('⚠ e o OUTRO adulto vê a MESMA ordem — é a decisão toda', async () => {
  configurar({ url: URL, storage: memoriaDeTelemovel() });
  await auth.entrarAdulto('tomas-ord@x.pt', 'palavra-longa-2');

  const dele = await sync.puxarCasa();
  igual(dele.taskOrder[cama], 1, JSON.stringify(dele.taskOrder));
  igual(dele.taskOrder[lixo], 2);
  igual(dele.taskOrder[loica], 3);

  await auth.entrarAdulto('rita-ord@x.pt', 'palavra-longa-1');
});

await prova('e desarrumar uma tarefa tira-lhe o posto', async () => {
  await sync.alterarTarefa(loica, { posto: null });
  const lida = await sync.puxarCasa();
  if (loica in lida.taskOrder) throw new Error('o posto não saiu');
  igual(lida.taskOrder[cama], 1);
});

await prova('⚠ uma criança não muda a ordem das tarefas', async () => {
  const doLeo = new PocketBase(URL);
  doLeo.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await doLeo.collection('membros').authWithPassword(leo.login, '135790');
  await recusado(() => doLeo.collection('tarefas').update(cama, { posto: 9 }));
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e o registo diz quem fez o quê ──');

await prova('uma linha do registo sobe com o autor', async () => {
  await semRecusa(sync.registoDaCasa({
    casa: daRita.casa, texto: 'A casa passou a chamar-se Bengui',
    quem: daRita.membro, quando: Date.parse('2026-09-05T10:00:00Z') }), 'registo');

  const lida = await sync.puxarCasa();
  igual((lida.registo || []).length, 1, JSON.stringify(lida.registo));
  igual(lida.registo[0].t, 'A casa passou a chamar-se Bengui');
  igual(lida.registo[0].quem, 'Rita');
});

await prova('⚠ e o outro adulto vê quem foi — que é para o que serve', async () => {
  // Um registo só local nunca podia responder a «quem mudou isto?», porque a
  // pergunta é feita pela OUTRA pessoa.
  configurar({ url: URL, storage: memoriaDeTelemovel() });
  await auth.entrarAdulto('tomas-ord@x.pt', 'palavra-longa-2');

  const dele = await sync.puxarCasa();
  igual((dele.registo || []).length, 1);
  igual(dele.registo[0].quem, 'Rita');

  // E ele escreve a sua, que a Rita passa a ver.
  const seuId = (await sync.sessao()).membro;
  await semRecusa(sync.registoDaCasa({
    casa: daRita.casa, texto: 'Tomas apagou uma tarefa',
    quem: seuId, quando: Date.parse('2026-09-05T11:00:00Z') }), 'registo do Tomas');

  await auth.entrarAdulto('rita-ord@x.pt', 'palavra-longa-1');
  const dela = await sync.puxarCasa();
  igual(dela.registo.length, 2);
  // As mais recentes primeiro.
  igual(dela.registo[0].quem, 'Tomas');
  igual(dela.registo[1].quem, 'Rita');
});

await prova('⚠ um registo NÃO se altera nem se apaga', async () => {
  // Um registo que se corrige não é um registo: quem administra a casa apagava
  // a linha que diz que se deu administração a si próprio.
  const daRitaPb = new PocketBase(URL);
  daRitaPb.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await daRitaPb.collection('membros').authWithPassword('rita-ord@x.pt', 'palavra-longa-1');
  const linha = (await daRitaPb.collection('registo').getFullList())
    .find(r => r.casa === casa.id);
  await recusado(() => daRitaPb.collection('registo').update(linha.id, { texto: 'outra coisa' }));
  await recusado(() => daRitaPb.collection('registo').delete(linha.id));
});

await prova('⚠ uma criança não lê o registo da casa', async () => {
  // Diz quem passou a administrar, quem entrou e quem saiu. É administração da
  // casa, como o orçamento.
  const doLeo = new PocketBase(URL);
  doLeo.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await doLeo.collection('membros').authWithPassword(leo.login, '135790');
  igual((await doLeo.collection('registo').getFullList()).length, 0);
});

await prova('⚠ e a vizinha não assina uma linha desta casa', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-ord@x.pt', ...s('palavra-longa-9'), verified: true });
  const dela = new PocketBase(URL);
  dela.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await dela.collection('membros').authWithPassword('viz-ord@x.pt', 'palavra-longa-9');

  igual((await dela.collection('registo').getFullList()).length, 0);
  await recusado(() => dela.collection('registo').create({
    casa: casa.id, texto: 'inventado', quem: rita.id }));
  // Nem com o `casa` dela e um membro daqui: é o `quem.casa` a fechar a porta.
  await recusado(() => dela.collection('registo').create({
    casa: outra.id, texto: 'inventado', quem: tomas.id }));
});

resumo();
