// A troca de tarefas entre irmãos — no servidor.
//
//   node db/pocketbase/provar-trocas.mjs
//
// O Léo propõe uma tarefa sua por uma da Mia; ela aceita ou recusa; um adulto
// anula. A linha é do DIA e a atribuição deriva dela — nada se escreve na
// tarefa. 12/09/2026 — a oitava das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Trocas', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita-tr@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomás', 'adulto',  { email: 'tomas-tr@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });
const mia   = await mk('Mia',   'crianca', { ...s('246813') });

const tarefa = (titulo, quem) => admin.collection('tarefas').create({
  casa: casa.id, titulo, atribuido_a: quem.id, pontos: 2, recorrencia: 'diaria' });
const lixo    = await tarefa('Pôr o lixo na rua', leo);
const mochila = await tarefa('Arrumar a mochila', leo);
const plantas = await tarefa('Regar as plantas', mia);
const mesa    = await tarefa('Levantar a mesa', mia);
const roupa   = await tarefa('Estender a roupa', tomas);

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doTomas = await telemovel('tomas-tr@x.pt', 'palavra-longa-2');
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');
const doMia = await telemovel(`${casa.id}_Mia`, '246813');

const hoje = new Date().toISOString().slice(0, 10);
const diaHa = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const agora = new Date().toISOString();

// O Léo entra pela camada de ligação, como a app: é por ela que propõe.
await auth.entrarCrianca(`${casa.id}_Leo`, '135790');
const doLeoNaApp = sync.sessao();

console.log('\n── propor ──');

let troca = null;

await prova('o Léo propõe: o lixo pelas plantas, hoje — e a linha nasce por aceitar', async () => {
  const r = await comId(sync.trocaDeTarefas({ casa: doLeoNaApp.casa, dia: `d${hoje}`,
    tarefaDe: lixo.id, tarefaPara: plantas.id, propostaPor: doLeoNaApp.membro }), 'trocaDeTarefas');
  troca = r.id;
  const t = await admin.collection('trocas_tarefas').getOne(troca);
  igual(t.tarefa_de, lixo.id);
  igual(t.tarefa_para, plantas.id);
  igual(t.proposta_por, leo.id);
  igual(t.aceite_em, '');
  igual(t.aceite_por, '');
});

await prova('⚠ a Mia não propõe com a tarefa do Léo como sua', () =>
  recusado(() => doMia.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: lixo.id, tarefa_para: mesa.id, proposta_por: mia.id })));

await prova('⚠ o Léo não troca com um adulto', () =>
  recusado(() => doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: roupa.id, proposta_por: leo.id })));

await prova('⚠ nem nasce já aceite', () =>
  recusado(() => doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: mesa.id, proposta_por: leo.id, aceite_em: agora })));

await prova('⚠ e um adulto não propõe por ela — a troca é das crianças', () =>
  recusado(() => doTomas.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: mesa.id, proposta_por: tomas.id })));

await prova('⚠ o Léo não troca uma tarefa sua por outra sua, nem por uma tarefa de ninguém', async () => {
  await recusado(() => doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: lixo.id, proposta_por: leo.id }));
  const solta = await admin.collection('tarefas').create({ casa: casa.id, titulo: 'Sem dono', pontos: 1, recorrencia: 'diaria' });
  await recusado(() => doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: solta.id, proposta_por: leo.id }));
  await admin.collection('tarefas').delete(solta.id);
});

await prova('⚠ a mesma tarefa não entra em duas trocas no mesmo dia', () =>
  recusado(() => doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: plantas.id, proposta_por: leo.id })));

let segunda = null;
await prova('mas entra noutro dia — e a mochila pela mesa é outra troca de hoje', async () => {
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const r = await doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: amanha, tarefa_de: lixo.id, tarefa_para: plantas.id, proposta_por: leo.id });
  await admin.collection('trocas_tarefas').delete(r.id);
  segunda = (await doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: mesa.id, proposta_por: leo.id })).id;
});

console.log('\n── aceitar ──');

await prova('⚠ o Léo não aceita a sua própria troca', () =>
  recusado(() => doLeo.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: leo.id })));

await prova('⚠ o Tomás não aceita pela Mia', () =>
  recusado(() => doTomas.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: tomas.id })));

await prova('⚠ a Mia não aceita assinando como o Léo, nem a mexer na troca', async () => {
  await recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: leo.id }));
  await recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: mia.id, tarefa_de: mochila.id }));
  await recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: mia.id, dia: diaHa(1) }));
});

await prova('⚠ a Mia não muda a troca de casa ao aceitá-la', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Vizinhos', valor_ponto: 0.1 });
  await recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: mia.id, casa: outra.id }));
  igual((await admin.collection('trocas_tarefas').getOne(troca)).casa, casa.id);
});

await prova('⚠ nem assina sem datar — a assinatura sem `aceite_em` lia-se «por aceitar» e repetia-se', async () => {
  await recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_por: mia.id }));
  await recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_por: mia.id, aceite_em: '' }));
  const t = await admin.collection('trocas_tarefas').getOne(troca);
  igual(t.aceite_por, '');
  igual(t.aceite_em, '');
});

await prova('a Mia aceita — e assina', async () => {
  await doMia.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: mia.id });
  const t = await admin.collection('trocas_tarefas').getOne(troca);
  igual(t.aceite_por, mia.id);
  igual(!!t.aceite_em, true);
});

await prova('⚠ aceite, não se aceita outra vez', () =>
  recusado(() => doMia.collection('trocas_tarefas').update(troca, { aceite_em: agora, aceite_por: mia.id })));

console.log('\n── desfazer ──');

await prova('⚠ aceite, nem o Léo nem a Mia a desfazem', async () => {
  await recusado(() => doLeo.collection('trocas_tarefas').delete(troca));
  await recusado(() => doMia.collection('trocas_tarefas').delete(troca));
});

await prova('a Mia recusa a segunda, por aceitar — apaga-a', async () => {
  await doMia.collection('trocas_tarefas').delete(segunda);
  await recusado(() => admin.collection('trocas_tarefas').getOne(segunda));
});

await prova('o Léo retira uma proposta sua por aceitar', async () => {
  const r = await doLeo.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: mochila.id, tarefa_para: mesa.id, proposta_por: leo.id });
  await doLeo.collection('trocas_tarefas').delete(r.id);
  await recusado(() => admin.collection('trocas_tarefas').getOne(r.id));
});

await auth.entrarAdulto('rita-tr@x.pt', 'palavra-longa-1');

await prova('a Rita anula a troca aceite', async () => {
  await sync.apagarTrocaDeTarefas(troca);
  await recusado(() => admin.collection('trocas_tarefas').getOne(troca));
});

console.log('\n── o que desce ──');

await prova('o `puxarCasa` traz as trocas de hoje pelos nomes — e a de anteontem não desce', async () => {
  const deHoje = await admin.collection('trocas_tarefas').create({
    casa: casa.id, dia: hoje, tarefa_de: lixo.id, tarefa_para: plantas.id, proposta_por: leo.id });
  const velha = await admin.collection('trocas_tarefas').create({
    casa: casa.id, dia: diaHa(2), tarefa_de: mochila.id, tarefa_para: mesa.id, proposta_por: leo.id,
    aceite_em: agora, aceite_por: mia.id });
  const c = await sync.puxarCasa();
  const t = c.trocas.find(x => x.id === deHoje.id);
  igual(!!t, true);
  igual(t.dia, `d${hoje}`);
  igual(t.de, lixo.id);
  igual(t.para, plantas.id);
  igual(t.propostaPor, 'Leo');
  igual(t.aceiteEm, null);
  igual(c.trocas.some(x => x.id === velha.id), false);
});

await prova('⚠ uma adulta de outra casa não lê nem escreve trocas desta', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-tr@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-tr@x.pt', 'palavra-longa-9');
  igual((await cVizinha.collection('trocas_tarefas').getFullList()).length, 0);
  await recusado(() => cVizinha.collection('trocas_tarefas').create({
    casa: outra.id, dia: hoje, tarefa_de: lixo.id, tarefa_para: plantas.id, proposta_por: leo.id }));
});

resumo();
