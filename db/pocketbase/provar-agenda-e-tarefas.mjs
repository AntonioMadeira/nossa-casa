// A agenda e as tarefas no servidor: quem vê, quem escreve, e o que não se
// pode anular.
//
//   node db/pocketbase/provar-agenda-e-tarefas.mjs
//
// ── Porque é que isto existe ─────────────────────────────────────────────────
//
// A base de dados tinha 31 coleções e o cliente escrevia em 10. As tarefas e a
// agenda — as duas coisas para que a app mais serve — viviam só no telefone de
// quem as escreveu, e dois telefones nunca se viam.
//
// ── As duas correções que estas provas prendem ───────────────────────────────
//
// 1. ⚠ Os `eventos` tinham `partilhado`, um BOOLEANO, e a app tem TRÊS níveis.
//    O do meio — `adultos` — é o que mais importa: a consulta de uma criança
//    entra na agenda como «adultos», e com um booleano ou a criança passava a
//    vê-la, ou o outro adulto deixava de a ver. A primeira hipótese é uma fuga,
//    e o ecrã da Saúde promete o contrário em letras.
//
// 2. As `tarefas_feitas` são ADITIVAS — uma linha por (tarefa, dia), com índice
//    único. É o INVARIANTE #2 posto em estrutura: dois telefones que marquem a
//    mesma tarefa no mesmo dia não se anulam, colidem no índice.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, resumo } from './provas.mjs';

const { pb: admin } = await comecar();

const como = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};

// ── A casa ───────────────────────────────────────────────────────────────────
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Bengui', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('rita',  'admin',   { email: 'rita@x.pt',  ...s('palavra-longa-1'), verified: true });
const tomas = await mk('tomas', 'adulto',  { email: 'tomas@x.pt', ...s('palavra-longa-2'), verified: true });
const leo   = await mk('leo',   'crianca', { ...s('135790'), verified: true });
const mia   = await mk('mia',   'crianca', { ...s('246813'), verified: true });

const cRita  = await como('rita@x.pt',  'palavra-longa-1');
const cTomas = await como('tomas@x.pt', 'palavra-longa-2');
const cLeo   = await como(leo.login, '135790');

// ═════════════════════════════════════════════════════════════════════════════
// 1. A AGENDA, e os três níveis
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── a agenda: os três níveis, e não um booleano ──');

const ev = (autor, titulo, visibilidade, extra = {}) =>
  admin.collection('eventos').create({
    casa: casa.id, dia: '2026-09-20', hora: '10:00', titulo, autor, visibilidade, ...extra });

const daFamilia = await ev(rita.id,  'Jantar de aniversário', 'familia');
const dosAdultos = await ev(rita.id, 'Consulta Dentista',     'adultos', { responsavel: leo.id, etiqueta: 'Saúde' });
const soDaRita   = await ev(rita.id, 'Médico',                'so-eu');
const soDoTomas  = await ev(tomas.id, 'Reunião de trabalho',  'so-eu');

const vistos = async (c) => (await c.collection('eventos').getFullList()).map(x => x.id);

await prova('`familia` — todos o vêem, crianças incluídas', async () => {
  for (const [quem, c] of [['rita', cRita], ['tomás', cTomas], ['léo', cLeo]]) {
    if (!(await vistos(c)).includes(daFamilia.id)) throw new Error(`${quem} não o vê`);
  }
});

await prova('⚠ `adultos` — os dois adultos vêem, a CRIANÇA não', async () => {
  // É a consulta do Léo. Ele não a pode ver, e o Tomás tem de a ver.
  if (!(await vistos(cRita)).includes(dosAdultos.id)) throw new Error('a Rita não o vê');
  if (!(await vistos(cTomas)).includes(dosAdultos.id)) throw new Error('o Tomás não o vê');
  const doLeo = await vistos(cLeo);
  igual(doLeo.includes(dosAdultos.id), false, 'o Léo VÊ a própria consulta');
});

await prova('⚠ `so-eu` — nem o outro adulto, nem a administração', async () => {
  igual((await vistos(cTomas)).includes(soDaRita.id), false, 'o Tomás vê o «só eu» da Rita');
  // E ao contrário: a Rita é administradora e não vê o dele.
  igual((await vistos(cRita)).includes(soDoTomas.id), false, 'a administradora vê o «só eu» do Tomás');
});

await prova('mas o dono vê sempre o seu', async () => {
  if (!(await vistos(cRita)).includes(soDaRita.id)) throw new Error('a Rita não vê o seu');
  if (!(await vistos(cTomas)).includes(soDoTomas.id)) throw new Error('o Tomás não vê o seu');
});

await prova('⚠ e nem pedindo pelo id, que é a porta do lado', async () => {
  // Uma regra de LISTA sem a de VISTA deixa passar quem souber o id.
  await recusado(() => cLeo.collection('eventos').getOne(dosAdultos.id));
  await recusado(() => cTomas.collection('eventos').getOne(soDaRita.id));
});

console.log('\n── e quem escreve na agenda ──');

await prova('um adulto cria um evento seu', async () => {
  const r = await cTomas.collection('eventos').create({
    casa: casa.id, dia: '2026-09-21', titulo: 'Ginásio', autor: tomas.id, visibilidade: 'so-eu' });
  igual(r.autor, tomas.id);
});

await prova('⚠ mas não cria um em nome da Rita', () =>
  recusado(() => cTomas.collection('eventos').create({
    casa: casa.id, dia: '2026-09-21', titulo: 'Assinado por ela', autor: rita.id, visibilidade: 'familia' })));

await prova('⚠ e uma criança não põe nada na agenda da casa', () =>
  recusado(() => cLeo.collection('eventos').create({
    casa: casa.id, dia: '2026-09-21', titulo: 'Playstation', autor: leo.id, visibilidade: 'familia' })));

await prova('⚠ o Tomás não altera nem apaga o evento da Rita', async () => {
  await recusado(() => cTomas.collection('eventos').update(daFamilia.id, { hora: '23:00' }));
  await recusado(() => cTomas.collection('eventos').delete(daFamilia.id));
});

await prova('⚠ e um nível que não existe é recusado', () =>
  recusado(() => cRita.collection('eventos').update(soDaRita.id, { visibilidade: 'meio-publico' })));

await prova('⚠ o `partilhado` já não existe — era o booleano de um só nível', async () => {
  const c = (await admin.collections.getFullList()).find(x => x.name === 'eventos');
  const nomes = c.fields.map(f => f.name);
  igual(nomes.includes('partilhado'), false, nomes.join(','));
  if (!nomes.includes('visibilidade')) throw new Error('e o `visibilidade` não entrou');
});

console.log('\n── a consulta É o evento ──');

await prova('um evento de saúde aponta para o episódio', async () => {
  const episodio = await admin.collection('episodios_saude').create({
    casa: casa.id, membro: leo.id, especialidade: 'Pediatria', dia: '2026-09-25' });
  const e = await admin.collection('eventos').create({
    casa: casa.id, dia: '2026-09-25', titulo: 'Consulta Pediatria', autor: rita.id,
    visibilidade: 'adultos', etiqueta: 'Saúde', episodio: episodio.id });
  igual(e.episodio, episodio.id);

  // ⚠ E apagar a consulta leva o evento — senão ficava um «Consulta Pediatria»
  // na agenda sem episódio nenhum, que é o «exame órfão» ao contrário.
  await admin.collection('episodios_saude').delete(episodio.id);
  await recusado(() => admin.collection('eventos').getOne(e.id));
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. AS TAREFAS
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── as tarefas: quem vê e quem escreve ──');

const tarefa = await admin.collection('tarefas').create({
  casa: casa.id, titulo: 'Pôr a mesa', atribuido_a: leo.id,
  recorrencia: 'diaria', pontos: 3, urgencia: 1 });

await prova('as tarefas são da casa — todos as vêem, crianças incluídas', async () => {
  for (const [quem, c] of [['rita', cRita], ['tomás', cTomas], ['léo', cLeo]]) {
    const v = await c.collection('tarefas').getFullList();
    if (!v.some(x => x.id === tarefa.id)) throw new Error(`${quem} não a vê`);
  }
});

await prova('um adulto cria uma tarefa', async () => {
  const r = await cRita.collection('tarefas').create({
    casa: casa.id, titulo: 'Aspirar a sala', atribuido_a: tomas.id, pontos: 0, urgencia: 2 });
  igual(r.titulo, 'Aspirar a sala');
});

await prova('⚠ uma criança NÃO cria, não altera e não apaga tarefas', async () => {
  await recusado(() => cLeo.collection('tarefas').create({
    casa: casa.id, titulo: 'Comer gelado', atribuido_a: leo.id, pontos: 20 }));
  await recusado(() => cLeo.collection('tarefas').update(tarefa.id, { pontos: 20 }));
  await recusado(() => cLeo.collection('tarefas').delete(tarefa.id));
});

await prova('⚠ e os pontos têm limites — 0 a 20, inteiros', async () => {
  // O 0 é válido: os pontos são opcionais e podem valer nada.
  const zero = await cRita.collection('tarefas').create({
    casa: casa.id, titulo: 'Sem pontos', atribuido_a: leo.id, pontos: 0 });
  igual(zero.pontos, 0);
  await recusado(() => cRita.collection('tarefas').update(zero.id, { pontos: 21 }));
  await recusado(() => cRita.collection('tarefas').update(zero.id, { pontos: -1 }));
});

console.log('\n── e marcar uma tarefa é ADITIVO (INVARIANTE #2) ──');

await prova('o Léo marca a SUA tarefa, e isso cria uma LINHA', async () => {
  const r = await cLeo.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefa.id, data: '2026-09-20', marcada_por: leo.id });
  igual(r.tarefa, tarefa.id);
  // Sem `confirmada_em`: os pontos ainda não contam.
  igual(!!r.confirmada_em, false);
});

await prova('⚠ e a MESMA tarefa no MESMO dia não entra duas vezes', async () => {
  // O índice único é o que faz dois telefones colidirem em vez de se anularem.
  // Sem ele, ficavam duas linhas e os pontos contavam a dobrar.
  await recusado(() => cLeo.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefa.id, data: '2026-09-20', marcada_por: leo.id }));
});

await prova('mas no dia seguinte entra — é uma tarefa diária', async () => {
  const r = await cLeo.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefa.id, data: '2026-09-21', marcada_por: leo.id });
  igual(r.data.slice(0, 10), '2026-09-21');
});

await prova('⚠ e um ADULTO marca a tarefa de uma criança', async () => {
  // É o que a app faz: uma mãe que viu o filho pôr a mesa dá a tarefa por
  // feita. A regra tinha só «só a si atribuída» e recusava isto — a marcação
  // caía na fila e ficava feita no telefone dela e por fazer no dele, em
  // silêncio. Apanhado pela prova de ponta a ponta, não por esta.
  const r = await cRita.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefa.id, data: '2026-09-25', marcada_por: rita.id });
  igual(r.marcada_por, rita.id);
});

await prova('⚠ a Mia não marca a tarefa do Léo', async () => {
  const cMia = await como(mia.login, '246813');
  await recusado(() => cMia.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefa.id, data: '2026-09-22', marcada_por: mia.id }));
});

await prova('⚠ nem marca a do Léo assinando com o nome dele', () =>
  recusado(async () => {
    const cMia = await como(mia.login, '246813');
    return cMia.collection('tarefas_feitas').create({
      casa: casa.id, tarefa: tarefa.id, data: '2026-09-23', marcada_por: leo.id });
  }));

await prova('um adulto confirma, e é a confirmação que vale os pontos', async () => {
  const feita = (await admin.collection('tarefas_feitas').getFullList())
    .find(x => x.tarefa === tarefa.id && x.data.slice(0, 10) === '2026-09-20');
  const r = await cRita.collection('tarefas_feitas').update(feita.id, {
    confirmada_por: rita.id, confirmada_em: '2026-09-20 20:00:00.000Z' });
  if (!r.confirmada_em) throw new Error('não gravou a confirmação');
});

await prova('⚠ e uma criança não confirma a sua própria tarefa', async () => {
  const feita = (await admin.collection('tarefas_feitas').getFullList())
    .find(x => x.tarefa === tarefa.id && x.data.slice(0, 10) === '2026-09-21');
  await recusado(() => cLeo.collection('tarefas_feitas').update(feita.id, {
    confirmada_por: leo.id, confirmada_em: '2026-09-21 20:00:00.000Z' }));
});

// Desmarcar APAGA a linha (INVARIANTE #2). A criança desmarca a sua enquanto
// está «a confirmar»; o que um adulto confirmou já são pontos contados.
// (10/09/2026 — a marcação da criança passou a subir ao servidor.)
await prova('o Léo DESMARCA a sua tarefa enquanto ninguém a confirmou — a linha apaga-se', async () => {
  const r = await cLeo.collection('tarefas_feitas').create({
    casa: casa.id, tarefa: tarefa.id, data: '2026-09-26', marcada_por: leo.id });
  await cLeo.collection('tarefas_feitas').delete(r.id);
  const resta = (await admin.collection('tarefas_feitas').getFullList())
    .find(x => x.id === r.id);
  if (resta) throw new Error('a linha ficou');
});

await prova('⚠ mas não desfaz a que um adulto JÁ confirmou', async () => {
  const feita = (await admin.collection('tarefas_feitas').getFullList())
    .find(x => x.tarefa === tarefa.id && x.data.slice(0, 10) === '2026-09-20');
  if (!feita.confirmada_em) throw new Error('a prova anterior devia tê-la confirmado');
  await recusado(() => cLeo.collection('tarefas_feitas').delete(feita.id));
});

await prova('⚠ e a Mia não apaga a marcação do Léo, mesmo por confirmar', async () => {
  const cMia = await como(mia.login, '246813');
  const doLeo = (await admin.collection('tarefas_feitas').getFullList())
    .find(x => x.tarefa === tarefa.id && x.data.slice(0, 10) === '2026-09-21');
  if (doLeo.confirmada_em) throw new Error('esta devia estar por confirmar');
  await recusado(() => cMia.collection('tarefas_feitas').delete(doLeo.id));
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. E NADA DISTO ATRAVESSA CASAS
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e nada disto atravessa casas ──');

const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
const nela = await admin.collection('membros').create({
  nome: 'vizinha', login: `${outra.id}_vizinha`, casa: outra.id, papel: 'admin',
  email: 'vizinha-ag@x.pt', ...s('palavra-longa-9'), verified: true });
const cVizinha = await como('vizinha-ag@x.pt', 'palavra-longa-9');

await prova('⚠ a vizinha não vê evento nem tarefa desta casa', async () => {
  for (const c of ['eventos', 'tarefas', 'tarefas_feitas']) {
    igual((await cVizinha.collection(c).getFullList()).length, 0, c);
  }
});

await prova('⚠ nem marca a tarefa do Léo com a casa dela na linha', async () => {
  // É o buraco que os anexos tinham: o `casa` da linha é escolhido por quem
  // escreve, e sozinho não prova nada. Aqui a regra do `tarefas_feitas` prende
  // ao `tarefa.atribuido_a`, que é de outra casa — e recusa.
  await recusado(() => cVizinha.collection('tarefas_feitas').create({
    casa: outra.id, tarefa: tarefa.id, data: '2026-09-24', marcada_por: nela.id }));
});

// ⚠ A primeira versão desta prova estava ERRADA e falhou por bem: pedia que a
// vizinha não criasse um evento com `casa: outra.id` e `autor: nela.id` — que é
// um evento legítimo na casa DELA, e nada nele toca nesta. A prova dizia
// «PASSOU, devia ter sido recusado» sobre uma operação que devia mesmo passar.
//
// O que interessa é o mesmo que os anexos ensinaram: o `casa` da linha é
// escolhido por quem escreve, e as RELAÇÕES podem apontar para outra casa sem
// que a regra pergunte.
await prova('e um evento na casa dela é legítimo — não é isso que se testa', async () => {
  const r = await cVizinha.collection('eventos').create({
    casa: outra.id, dia: '2026-09-24', titulo: 'Olá', autor: nela.id, visibilidade: 'familia' });
  igual(r.casa, outra.id);
});

await prova('⚠ mas não aponta o `responsavel` para uma criança DESTA casa', async () => {
  // Se passasse, ela punha o nome do Léo num evento da casa dela — e a linha da
  // agenda dela diria «Léo». Não é fuga de dados nossos, é escrita no nosso
  // quadro de membros a partir de fora, e é o mesmo defeito de forma.
  await recusado(() => cVizinha.collection('eventos').create({
    casa: outra.id, dia: '2026-09-24', titulo: 'Buscar o Léo',
    autor: nela.id, visibilidade: 'familia', responsavel: leo.id }));
});

await prova('⚠ nem liga um evento dela a uma consulta desta casa', async () => {
  const episodio = await admin.collection('episodios_saude').create({
    casa: casa.id, membro: leo.id, especialidade: 'Dermatologia', dia: '2026-09-26' });
  await recusado(() => cVizinha.collection('eventos').create({
    casa: outra.id, dia: '2026-09-26', titulo: 'Consulta',
    autor: nela.id, visibilidade: 'familia', episodio: episodio.id }));
});

await prova('⚠ nem atribui uma tarefa dela a uma criança desta casa', async () => {
  // A mesma forma de defeito na terceira coleção. Se passasse, a lista de
  // tarefas da casa dela mostrava o Léo — e pior, o `tarefas_feitas` dela
  // ficava a poder referir uma tarefa cujo `atribuido_a` é nosso.
  await recusado(() => cVizinha.collection('tarefas').create({
    casa: outra.id, titulo: 'Arrumar o meu quarto', atribuido_a: leo.id, pontos: 5 }));
});

resumo();
