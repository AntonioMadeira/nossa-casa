// As metas da família na base de dados — e dois telemóveis a reforçar a mesma
// meta sem se anularem.
//
//   node db/pocketbase/provar-metas.mjs
//
// ── O que se encontrou ───────────────────────────────────────────────────────
//
// A coleção `metas` estava aqui desde o primeiro dia, com regras e tudo, e o
// cliente NUNCA lhe escreveu nem leu: a lista da app era a constante `GOALS` do
// `data.js`, desenhada e mais nada. Não havia como criar, alterar, apagar nem
// reforçar uma meta — e uma meta que a Rita quisesse criar não existia em sítio
// nenhum, nem no telemóvel dela.
//
// ⚠ E a coleção tinha um `num('atual')`: um SALDO ESCRITO, o INVARIANTE #2 ao
// contrário. É a quinta vez que esta forma aparece neste projeto — o `envMove`
// do orçamento, o `done` das tarefas, o `status` das compras, o `paidPts` dos
// pontos pagos, e agora as metas. Dois telemóveis a reforçar a meta das férias
// no mesmo dia escreviam cada um o seu total e o último ganhava: os 50 € do
// outro desapareciam sem erro nenhum.
//
// O `atual` saiu e nasceram os `meta_movimentos`: aditivos, sem `updateRule`
// nem `deleteRule`, com chave de idempotência. O juntado é a SOMA deles.
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

const rita  = await mk('Rita',  'admin',   { email: 'rita@x.pt',   ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'admin',   { email: 'tomas@x.pt',  ...s('palavra-longa-2') });
const dina  = await mk('Dina',  'adulto',  { email: 'dina@x.pt',   ...s('palavra-longa-3') });
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
const daDina = await telemovel('dina@x.pt', 'palavra-longa-3');

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── a meta é uma linha da casa, e o alvo é em euros ──');

let ferias = null;

await prova('a Rita cria uma meta', async () => {
  const r = await comId(sync.criarMeta({
    casa: daRita.casa, nome: 'Férias no Algarve', alvo: 3000, quando: 'julho de 2027' }),
    'criarMeta');
  ferias = r.id;
  const m = await admin.collection('metas').getOne(ferias);
  // `nome` e `alvo`, que são os nomes da COLEÇÃO. O PocketBase ignora em
  // silêncio o que não conhece.
  igual(m.nome, 'Férias no Algarve');
  igual(m.alvo, 3000);
  igual(m.quando, 'julho de 2027');
});

await prova('⚠ e a meta NÃO tem campo de saldo — nem para escrever nem para ler', async () => {
  // Era `num('atual', { min: 0 })`. Um campo desses não se deixa lá «por não
  // incomodar»: fica à espera de que alguém lhe escreva, e quem lhe escrever
  // não vai ver erro nenhum.
  const c = await admin.collections.getOne('metas');
  const campos = c.fields.map(f => f.name);
  igual(campos.includes('atual'), false, `a coleção ainda tem: ${campos.join(', ')}`);
  igual(campos.includes('alvo'), true);
});

await prova('a meta nasce a ZERO, porque o juntado é uma soma de nada', async () => {
  const lida = await sync.puxarCasa();
  const m = (lida.metas || []).find(x => x.id === ferias);
  if (!m) throw new Error('a meta não veio');
  igual(m.of, 3000);
  // ⚠ E vem SEM `at`: quem soma é a loja, sobre os movimentos. Um `at` já
  // somado aqui dava duas contas do mesmo número a viver lado a lado.
  igual(m.at, undefined, 'o servidor devolveu um total já somado');
  igual((lida.metaMovs || []).filter(mv => mv.meta === ferias).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e dois telemóveis a reforçar a mesma meta NÃO se anulam ──');

await prova('a Rita reforça 50 €', async () => {
  await semRecusa(sync.reforcarMeta({
    casa: daRita.casa, meta: ferias, valor: 50, motivo: 'Sobra do mês', por: daRita.membro }),
    'reforcarMeta(Rita)');
  const linhas = await admin.collection('meta_movimentos').getFullList({ filter: `meta = "${ferias}"` });
  igual(linhas.length, 1);
  igual(linhas[0].valor, 50);
  igual(linhas[0].motivo, 'Sobra do mês');
});

await prova('o Tomás reforça 50 €, do telemóvel dele', async () => {
  await doTomas.collection('meta_movimentos').create({
    casa: casa.id, meta: ferias, valor: 50, motivo: 'Prémio', por: tomas.id,
    idem_key: 'tomas-1' });
  const linhas = await admin.collection('meta_movimentos').getFullList({ filter: `meta = "${ferias}"` });
  igual(linhas.length, 2);
});

await prova('⚠ e a meta tem 100 € — não 50', async () => {
  // Com um saldo escrito, o último a gravar punha 50 e os 50 € do outro
  // desapareciam. É a diferença entre uma app que funciona a dois e uma que
  // perde dinheiro.
  const lida = await sync.puxarCasa();
  const soma = (lida.metaMovs || [])
    .filter(mv => mv.meta === ferias)
    .reduce((n, mv) => n + mv.delta, 0);
  igual(soma, 100);
});

await prova('e o movimento diz de onde veio e quem o lançou', async () => {
  const lida = await sync.puxarCasa();
  const mv = (lida.metaMovs || []).find(x => x.label === 'Prémio');
  if (!mv) throw new Error('o movimento não veio');
  igual(mv.por, 'Tomas');
  igual(mv.delta, 50);
});

await prova('⚠ um movimento NEGATIVO tira dinheiro — é como se corrige', async () => {
  // A linha não se edita nem se apaga. Corrigir é lançar o contrário, como nas
  // despesas.
  await semRecusa(sync.reforcarMeta({
    casa: daRita.casa, meta: ferias, valor: -20, motivo: 'Enganei-me', por: daRita.membro }),
    'reforcarMeta(negativo)');
  const lida = await sync.puxarCasa();
  const soma = (lida.metaMovs || [])
    .filter(mv => mv.meta === ferias)
    .reduce((n, mv) => n + mv.delta, 0);
  igual(soma, 80);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e um movimento não se corrige por cima ──');

await prova('o servidor RECUSA alterar um movimento', async () => {
  const linha = (await admin.collection('meta_movimentos').getFullList())[0];
  await recusado(() => doTomas.collection('meta_movimentos').update(linha.id, { valor: 9999 }));
});

await prova('e RECUSA apagá-lo', async () => {
  const linha = (await admin.collection('meta_movimentos').getFullList())[0];
  await recusado(() => doTomas.collection('meta_movimentos').delete(linha.id));
});

await prova('⚠ e a chave de idempotência impede reforçar duas vezes', async () => {
  // Reenviar a fila não pode pôr 50 € na meta outra vez. Sem o índice único, a
  // rede a falhar e a app a tentar de novo somavam duas vezes.
  await recusado(() => doTomas.collection('meta_movimentos').create({
    casa: casa.id, meta: ferias, valor: 50, por: tomas.id, idem_key: 'tomas-1' }));
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── quem pode o quê ──');

await prova('⚠ uma adulta que não administra VÊ as metas mas não as reforça', async () => {
  // É a regra da coleção — `metas` e `meta_movimentos` são `ADMIN` para
  // escrever. A app esconde o botão a quem o servidor recusa, e é essa a ordem
  // certa: o servidor decide, a interface acompanha.
  igual((await daDina.collection('metas').getFullList()).length, 1);
  await recusado(() => daDina.collection('meta_movimentos').create({
    casa: casa.id, meta: ferias, valor: 50, idem_key: 'dina-1' }));
  await recusado(() => daDina.collection('metas').create({
    casa: casa.id, nome: 'Da Dina', alvo: 100 }));
});

await prova('⚠ e uma CRIANÇA não vê meta nenhuma', async () => {
  // Metas são orçamento da casa, e o modo criança não mostra orçamento — está
  // no CLAUDE.md como coisa a confirmar. Aqui o dado nem CHEGA ao dispositivo
  // (INVARIANTE #3), que é a única forma que vale.
  const doLeo = await telemovel(leo.login, '135790');
  igual((await doLeo.collection('metas').getFullList()).length, 0);
  igual((await doLeo.collection('meta_movimentos').getFullList()).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── alterar e apagar ──');

await prova('alterar muda o alvo sem tocar no juntado', async () => {
  await sync.alterarMeta(ferias, { alvo: 3500, nome: 'Férias na Madeira' });
  const m = await admin.collection('metas').getOne(ferias);
  igual(m.alvo, 3500);
  igual(m.nome, 'Férias na Madeira');
  const lida = await sync.puxarCasa();
  const soma = (lida.metaMovs || [])
    .filter(mv => mv.meta === ferias)
    .reduce((n, mv) => n + mv.delta, 0);
  igual(soma, 80, 'alterar o alvo mexeu no juntado');
});

await prova('⚠ e não apaga o que não lhe mandaram', async () => {
  await sync.alterarMeta(ferias, { alvo: 4000 });
  const m = await admin.collection('metas').getOne(ferias);
  igual(m.nome, 'Férias na Madeira', 'o nome foi apagado por uma alteração que não o mandava');
  igual(m.alvo, 4000);
});

await prova('⚠ apagar a meta leva os MOVIMENTOS dela', async () => {
  // `cascadeDelete` na relação. Sem isso ficavam linhas a apontar para uma meta
  // que já não existe: invisíveis, a acumular, e a somar para nada.
  const antes = (await admin.collection('meta_movimentos').getFullList({ filter: `meta = "${ferias}"` })).length;
  igual(antes > 0, true);
  await sync.apagarMeta(ferias);
  await recusado(() => admin.collection('metas').getOne(ferias));
  igual((await admin.collection('meta_movimentos').getFullList({ filter: `meta = "${ferias}"` })).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ a vizinha não vê nem escreve nas metas desta casa', async () => {
  const nossa = await comId(sync.criarMeta({ casa: daRita.casa, nome: 'Telhado', alvo: 4000 }), 'criarMeta');
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  const nela = await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-metas@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-metas@x.pt', 'palavra-longa-9');

  igual((await cVizinha.collection('metas').getFullList()).length, 0);
  igual((await cVizinha.collection('meta_movimentos').getFullList()).length, 0);
  // E não reforça uma meta nossa nem lhe muda o alvo.
  await recusado(() => cVizinha.collection('meta_movimentos').create({
    casa: outra.id, meta: nossa.id, valor: 50, idem_key: 'viz-1' }));
  await recusado(() => cVizinha.collection('metas').update(nossa.id, { alvo: 1 }));
});

await prova('⚠ e o movimento tem de apontar para uma meta DESTA casa', async () => {
  // O `casa` da linha é escolhido por quem escreve e não prova nada. É a sexta
  // vez que esta forma aparece — ver `provar-relacoes-ancoradas.mjs`.
  const outra = (await admin.collection('casas').getFullList())
    .find(c => c.nome === PREFIXO + 'Outra');
  const daOutra = await admin.collection('metas').create({
    casa: outra.id, nome: 'Meta da outra', alvo: 100 });
  await recusado(() => doTomas.collection('meta_movimentos').create({
    casa: casa.id, meta: daOutra.id, valor: 50, idem_key: 'atravessa-1' }));
});

resumo();
