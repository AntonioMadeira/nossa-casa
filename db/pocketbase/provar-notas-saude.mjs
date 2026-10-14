// As notas, as receitas e as decisões de uma consulta — no servidor.
//
//   node db/pocketbase/provar-notas-saude.mjs
//
// ── Porque é que isto existe ─────────────────────────────────────────────────
//
// Estas três viviam só no dispositivo, e não por escolha de privacidade: não
// tinham para onde ir. A nota que a Rita escrevia no telefone dela não chegava
// ao Tomás — não por ser privada, mas por não sair daquele telefone.
//
// ── O que só isto prova ──────────────────────────────────────────────────────
//
// Os testes em `__tests__/notas-da-consulta.test.js` provam a regra do lado do
// cliente: quem edita, quem apaga, e que se mexe numa nota pelo `id`. Nenhum
// deles põe a regra do SERVIDOR à prova, e é aí que o INVARIANTE #3 se cumpre
// ou não: se o servidor devolver a nota de uma ficha que a pessoa não pode ver,
// não há interface que salve isso.
//
// Cada prova tenta o que a `docs/seguranca.html` diz que não pode acontecer, e
// falha se PASSAR.
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
// ⚠ Uma SEGUNDA criança, e não é enfeite: sem ela não se pode provar o caso que
// interessa — uma criança a escrever na ficha de OUTRA. Com uma criança só, a
// única coisa provável é ela na sua própria ficha, e isso deixa de fora o medo
// que uma casa com dois filhos tem.
const mia   = await mk('mia',   'crianca', { ...s('246813'), verified: true });

const ep = (membro, especialidade) => admin.collection('episodios_saude').create({
  casa: casa.id, membro, especialidade, dia: '2026-08-28' });
const epRita  = await ep(rita.id,  'Medicina geral');
const epTomas = await ep(tomas.id, 'Dermatologia');
const epLeo   = await ep(leo.id,   'Pediatria');
const epMia   = await ep(mia.id,   'Dentista');

const cRita  = await como('rita@x.pt',  'palavra-longa-1');
const cTomas = await como('tomas@x.pt', 'palavra-longa-2');
const cLeo   = await como(leo.login, '135790');
const cMia   = await como(mia.login, '246813');

// ── 1. A visibilidade herda-se do episódio ───────────────────────────────────
console.log('\n── a nota vê-se se e só se a consulta se vê ──');

const notaDoLeo = await admin.collection('notas_saude').create({
  casa: casa.id, episodio: epLeo.id, autor: rita.id, texto: 'Voltar em três meses' });
const notaDoTomas = await admin.collection('notas_saude').create({
  casa: casa.id, episodio: epTomas.id, autor: tomas.id, texto: 'Creme duas vezes ao dia' });

await prova('a Rita vê a nota da consulta do Léo', async () => {
  const v = await cRita.collection('notas_saude').getFullList();
  if (!v.some(x => x.id === notaDoLeo.id)) throw new Error('não a vê');
});

await prova('o Tomás também — as fichas das crianças são dos adultos', async () => {
  const v = await cTomas.collection('notas_saude').getFullList();
  if (!v.some(x => x.id === notaDoLeo.id)) throw new Error('não a vê');
});

await prova('⚠ mas a Rita NÃO vê a nota da consulta do Tomás', async () => {
  // A ficha de um adulto é só dele. Nem a administração.
  const v = await cRita.collection('notas_saude').getFullList();
  igual(v.filter(x => x.id === notaDoTomas.id).length, 0,
    v.map(x => x.texto).join(' / '));
});

await prova('⚠ e o telemóvel do LÉO não recebe nota nenhuma', async () => {
  // Nem as da própria ficha: a criança não lê a sua. O dado não pode CHEGAR ao
  // dispositivo — é o INVARIANTE #3, e é o servidor que o cumpre.
  igual((await cLeo.collection('notas_saude').getFullList()).length, 0);
});

await prova('⚠ e nem pedindo a nota pelo id, que é a porta do lado', async () => {
  // Uma regra de LISTA sem a de VISTA deixa passar quem souber o id.
  await recusado(() => cLeo.collection('notas_saude').getOne(notaDoLeo.id));
  await recusado(() => cRita.collection('notas_saude').getOne(notaDoTomas.id));
});

// ── 2. Só o autor mexe na sua nota ───────────────────────────────────────────
console.log('\n── e só quem escreveu a nota lhe mexe ──');

await prova('a Rita altera a nota que escreveu', async () => {
  const r = await cRita.collection('notas_saude').update(notaDoLeo.id,
    { texto: 'Voltar em três meses, levar o raio-x' });
  igual(r.texto, 'Voltar em três meses, levar o raio-x');
});

await prova('⚠ o Tomás NÃO altera a nota da Rita, mesmo vendo-a', async () => {
  // Vê-a — é a consulta de uma criança — e não lhe mexe. São duas regras
  // diferentes, e é por isso que esta prova existe separada da de cima.
  const v = await cTomas.collection('notas_saude').getFullList();
  if (!v.some(x => x.id === notaDoLeo.id)) throw new Error('devia vê-la');
  await recusado(() => cTomas.collection('notas_saude').update(notaDoLeo.id, { texto: 'Outra coisa' }));
});

await prova('⚠ nem a apaga', () =>
  recusado(() => cTomas.collection('notas_saude').delete(notaDoLeo.id)));

await prova('⚠ e não escreve uma nota em nome da Rita', async () => {
  // Sem `autor = @request.auth.id` na criação, a regra de alteração não valia
  // nada: bastava criar a nota já assinada por outra pessoa.
  await recusado(() => cTomas.collection('notas_saude').create({
    casa: casa.id, episodio: epLeo.id, autor: rita.id, texto: 'Assinada por ela' }));
});

await prova('o Tomás escreve a sua, na mesma consulta', async () => {
  const r = await cTomas.collection('notas_saude').create({
    casa: casa.id, episodio: epLeo.id, autor: tomas.id, texto: 'Marquei a seguinte' });
  igual(r.autor, tomas.id);
});

await prova('⚠ e a criança não escreve nenhuma, nem na sua própria ficha', () =>
  recusado(() => cLeo.collection('notas_saude').create({
    casa: casa.id, episodio: epLeo.id, autor: leo.id, texto: 'Não me dói nada' })));

// ── ⚠ Uma criança na ficha de OUTRA criança ─────────────────────────────────
//
// Pedido em 07/09/2026: «uma criança não pode escrever notas noutra criança, só
// os adultos podem». A regra `ADULTO` já o impedia, e o ficheiro não o provava —
// tinha uma criança só, e com uma criança só o caso não se pode montar.
//
// Três portas, porque uma regra que só se testa pela porta da frente não está
// testada: escrever na ficha da outra, escrever pondo o id de um ADULTO no
// `autor`, e alterar o que a mãe escreveu.

await prova('⚠ o Léo NÃO escreve na ficha da Mia', () =>
  recusado(() => cLeo.collection('notas_saude').create({
    casa: casa.id, episodio: epMia.id, autor: leo.id, texto: 'A Mia disse que dói' })));

await prova('⚠ nem pondo a mãe no `autor` — a assinatura não é a autorização', () =>
  recusado(() => cLeo.collection('notas_saude').create({
    casa: casa.id, episodio: epMia.id, autor: rita.id, texto: 'A Mia disse que dói' })));

await prova('⚠ e a Mia também não escreve na do Léo', () =>
  recusado(() => cMia.collection('notas_saude').create({
    casa: casa.id, episodio: epLeo.id, autor: mia.id, texto: 'O Léo faltou' })));

await prova('⚠ nem uma criança LÊ a nota da ficha da outra', async () => {
  // A escrita recusada não chega: se ela conseguisse ler, sabia o que a mãe
  // escreveu sobre a irmã. É o INVARIANTE #3 — o dado não pode CHEGAR ao
  // dispositivo.
  const notaDaMia = await admin.collection('notas_saude').create({
    casa: casa.id, episodio: epMia.id, autor: rita.id, texto: 'Aparelho a incomodar' });
  igual((await cLeo.collection('notas_saude').getFullList()).length, 0);
  await recusado(() => cLeo.collection('notas_saude').getOne(notaDaMia.id));
  await recusado(() => cMia.collection('notas_saude').getOne(notaDaMia.id));
});

await prova('⚠ nem altera nem apaga o que a mãe escreveu', async () => {
  const nota = (await admin.collection('notas_saude').getFullList())
    .find(n => n.episodio === epMia.id);
  await recusado(() => cLeo.collection('notas_saude').update(nota.id, { texto: 'mudei' }));
  await recusado(() => cMia.collection('notas_saude').update(nota.id, { texto: 'mudei' }));
  await recusado(() => cMia.collection('notas_saude').delete(nota.id));
});

await prova('e os dois adultos escrevem na ficha da Mia, que é o que se quer', async () => {
  // Uma prova de recusas sem uma de permissão não distingue «está protegido» de
  // «está partido».
  const r = await cTomas.collection('notas_saude').create({
    casa: casa.id, episodio: epMia.id, autor: tomas.id, texto: 'Levei-a eu' });
  igual(r.autor, tomas.id);
  const vistas = await cRita.collection('notas_saude').getFullList();
  igual(vistas.filter(n => n.episodio === epMia.id).length, 2);
});

// ── 3. As receitas ───────────────────────────────────────────────────────────
console.log('\n── as receitas, pela mesma porta ──');

const receita = await admin.collection('receitas_saude').create({
  casa: casa.id, episodio: epLeo.id, nome: 'Ferro', dose: '10 mg',
  quantidade: '30', unidade: 'comprimidos', expira_em: '2026-12-31', decisao: 'comprar' });

await prova('os adultos vêem a receita da criança', async () => {
  const v = await cRita.collection('receitas_saude').getFullList();
  if (!v.some(x => x.id === receita.id)) throw new Error('não a vê');
});

await prova('⚠ e o telemóvel do Léo não a recebe', async () => {
  igual((await cLeo.collection('receitas_saude').getFullList()).length, 0);
  await recusado(() => cLeo.collection('receitas_saude').getOne(receita.id));
});

await prova('a decisão de uma receita altera-se por qualquer adulto', async () => {
  // Ao contrário da nota, uma receita não é o relato de ninguém: é um
  // medicamento, e quem for à farmácia decide.
  const r = await cTomas.collection('receitas_saude').update(receita.id, { decisao: 'ja-tem' });
  igual(r.decisao, 'ja-tem');
});

// ── 4. A decisão da consulta, uma por episódio ───────────────────────────────
console.log('\n── e a decisão, uma por consulta ──');

const decisao = await admin.collection('decisoes_saude').create({
  casa: casa.id, episodio: epLeo.id, tipo: 'seguimento', estado: 'pendente' });

await prova('os adultos vêem-na', async () => {
  const v = await cRita.collection('decisoes_saude').getFullList();
  if (!v.some(x => x.id === decisao.id)) throw new Error('não a vê');
});

await prova('⚠ e a criança não', async () => {
  igual((await cLeo.collection('decisoes_saude').getFullList()).length, 0);
  await recusado(() => cLeo.collection('decisoes_saude').getOne(decisao.id));
});

await prova('⚠ uma SEGUNDA decisão para a mesma consulta é recusada', async () => {
  // Uma decisão é um estado, não um movimento — não se soma. Dois telefones que
  // decidam ao mesmo tempo criavam duas linhas e o ecrã escolhia uma ao acaso.
  // O índice único é o que os faz encontrar-se.
  await recusado(() => cRita.collection('decisoes_saude').create({
    casa: casa.id, episodio: epLeo.id, tipo: 'seguimento', estado: 'resolvido' }));
});

await prova('mas altera-se a que existe', async () => {
  const r = await cRita.collection('decisoes_saude').update(decisao.id, { estado: 'resolvido' });
  igual(r.estado, 'resolvido');
});

await prova('⚠ e um `estado` que não existe é recusado', () =>
  recusado(() => cRita.collection('decisoes_saude').update(decisao.id, { estado: 'mais-ou-menos' })));

// ── 5. Nada disto atravessa casas ────────────────────────────────────────────
console.log('\n── e nada disto atravessa casas ──');

const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
const nela = await admin.collection('membros').create({
  nome: 'vizinha', login: `${outra.id}_vizinha`, casa: outra.id, papel: 'admin',
  email: 'vizinha@x.pt', ...s('palavra-longa-9'), verified: true });
const cVizinha = await como('vizinha@x.pt', 'palavra-longa-9');

await prova('⚠ a vizinha não vê nota, receita nem decisão desta casa', async () => {
  for (const c of ['notas_saude', 'receitas_saude', 'decisoes_saude']) {
    igual((await cVizinha.collection(c).getFullList()).length, 0, c);
  }
});

// ⚠ Esta prova encontrou um buraco a sério, e não era só nas coleções novas.
//
// A regra dizia `casa = @request.auth.casa && adulto && (episodio.membro = eu
// || episodio.membro.papel = "crianca")`. O `casa` é o da PRÓPRIA LINHA — e
// quem escreve escolhe-o. A vizinha punha a casa dela na nota, apontava o
// `episodio` para a consulta do Léo desta casa, e passava: é adulta, e o Léo é
// criança. A regra nunca perguntava de que casa era o EPISÓDIO.
//
// Ela não conseguia LER a consulta. Conseguia pendurar-lhe notas, e depois
// lê-las — porque a nota era dela.
//
// A correção é `episodio.casa = @request.auth.casa`: o vínculo passa a ser ao
// episódio, e não à etiqueta que quem escreve põe na linha.
await prova('⚠ nem escreve uma nota na consulta do Léo', () =>
  recusado(() => cVizinha.collection('notas_saude').create({
    casa: outra.id, episodio: epLeo.id, autor: nela.id, texto: 'Olá' })));

await prova('⚠ nem uma receita, nem uma decisão', async () => {
  await recusado(() => cVizinha.collection('receitas_saude').create({
    casa: outra.id, episodio: epLeo.id, nome: 'Qualquer coisa' }));
  await recusado(() => cVizinha.collection('decisoes_saude').create({
    casa: outra.id, episodio: epLeo.id, estado: 'pendente' }));
});

await prova('⚠ e nem um ANEXO — o buraco era anterior a estas coleções', async () => {
  // Os `anexos` tinham a regra com a mesma forma, e as onze provas deles nunca
  // tentaram isto. Um ficheiro clínico pendurado na consulta de outra família é
  // pior do que uma nota.
  await recusado(() => cVizinha.collection('anexos').create({
    casa: outra.id, episodio: epLeo.id, titulo: 'Exame intruso', tipo: 'exame' }));
});

// ── 6. E apagar a consulta leva tudo atrás ───────────────────────────────────
console.log('\n── apagar a consulta não deixa órfãos ──');

await prova('⚠ apagada a consulta, as notas, receitas e decisões vão com ela', async () => {
  // `cascadeDelete: true` na relação. Sem isto ficavam linhas a apontar para um
  // episódio que já não existe — invisíveis, e a acumular dados clínicos que
  // ninguém sabe que lá estão.
  await admin.collection('episodios_saude').delete(epLeo.id);
  for (const c of ['notas_saude', 'receitas_saude', 'decisoes_saude']) {
    const restantes = (await admin.collection(c).getFullList())
      .filter(x => x.episodio === epLeo.id);
    igual(restantes.length, 0, c);
  }
});

resumo();
