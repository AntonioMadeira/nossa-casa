// As compras na base de dados — e dois telemóveis na mesma loja.
//
//   node db/pocketbase/provar-compras.mjs
//
// ── O defeito, que o próprio esquema já avisava ──────────────────────────────
//
// O comentário da coleção `artigos`, escrito antes de eu lá chegar:
//
//   «O estado vive na linha do artigo. Se fosse uma lista de identificadores
//    confirmados, dois telefones na mesma loja anulavam-se; assim, fundem-se.»
//
// O cliente tinha exactamente a lista que o comentário proíbe: um mapa `status`
// que cada telefone reescrevia por inteiro. Dois adultos a dividir os
// corredores — um nos frescos, outro na mercearia — anulavam o trabalho um do
// outro, e o último a gravar ganhava.
//
// É a terceira vez que este projeto encontra a mesma forma: o `envMove` do
// orçamento, o `done` das tarefas, e agora o `status` das compras. Todas as
// três estão agora em linhas.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
// ⚠ A grafia do estado vem de quem é dono dela, e não escrita aqui. Escrita
// aqui era o que fazia esta prova concordar com a tabela e discordar dos ecrãs.
const { ESTADOS_DA_LOJA } = await import('../../src/compras-estado.js');
const SEM_STOCK = ESTADOS_DA_LOJA.find(e => /stock/.test(e));

configurar({ url: URL, storage: memoriaDeTelemovel() });

// ── A casa ───────────────────────────────────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Bengui', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'adulto',  { email: 'tomas@x.pt', ...s('palavra-longa-2') });
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
console.log('\n── a ida às compras, e os artigos dela ──');

let loja = null, lista = null;

await prova('a Rita abre uma ida às compras', async () => {
  loja = (await comId(sync.acrescentarNaLista('stores',
    { casa: daRita.casa, nome: 'Continente' }), 'acrescentarNaLista(stores)')).id;
  const r = await comId(sync.listaDeCompras({
    casa: daRita.casa, loja, comprador: daRita.membro, planeadaPara: 'd2026-09-28' }),
    'listaDeCompras');
  lista = r.id;
  const l = await admin.collection('listas_compras').getOne(lista);
  igual(l.loja, loja);
  igual(l.comprador, daRita.membro);
  igual(String(l.planeada_para).slice(0, 10), '2026-09-28');
  igual(!!l.fechada_em, false, 'nasceu fechada');
});

let banana = null, leite = null;

await prova('⚠ e os artigos vão para a linha, com todos os campos', async () => {
  const r = await comId(sync.artigoDeCompras({
    casa: daRita.casa, lista, rotulo: 'Bananas', seccao: 0,
    pedidoPor: daRita.membro, habitual: true, estimativa: 1.8 }), 'artigoDeCompras');
  banana = r.id;
  const a = await admin.collection('artigos').getOne(banana);
  // `rotulo` e não `label`; `seccao` e não `s`. O PocketBase ignora em
  // silêncio o que não conhece.
  igual(a.rotulo, 'Bananas');
  igual(a.seccao, 0);
  igual(a.habitual, true);
  igual(a.estimativa, 1.8);
  igual(a.estado, 'por_comprar');
});

await prova('e o telemóvel do Tomás vê-os', async () => {
  leite = (await comId(sync.artigoDeCompras({
    casa: daRita.casa, lista, rotulo: 'Leite', seccao: 1 }), 'artigoDeCompras(leite)')).id;
  const v = await doTomas.collection('artigos').getFullList();
  igual(v.filter(a => a.lista === lista).length, 2);
});

await prova('⚠ uma CRIANÇA também vê a lista, e pode pedir', async () => {
  // A lista é de todos: as crianças também pedem artigos. É a regra escrita
  // na coleção, e não um descuido.
  const doLeo = await telemovel(leo.login, '135790');
  igual((await doLeo.collection('artigos').getFullList()).length, 2);
  const r = await doLeo.collection('artigos').create({
    casa: casa.id, lista, rotulo: 'Cereais', seccao: 2, pedido_por: leo.id });
  igual(r.rotulo, 'Cereais');
  await admin.collection('artigos').delete(r.id);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── alterar um artigo, e a ordem dele no corredor ──');

await prova('⚠ o `alterarArtigo` muda o rótulo, a estimativa e o habitual', async () => {
  // Havia criar e apagar, e mais nada: mudar o nome era apagar e voltar a
  // escrever, e com isso perdia-se o estado desta ida e o lugar no corredor.
  await sync.alterarArtigo(banana, { rotulo: 'Bananas da Madeira', estimativa: 2.4, habitual: false });
  const a = await admin.collection('artigos').getOne(banana);
  igual(a.rotulo, 'Bananas da Madeira');
  igual(a.estimativa, 2.4);
  igual(a.habitual, false);
});

await prova('⚠ e não apaga o que não lhe mandaram', async () => {
  // Um `campos.rotulo` ausente não pode virar `rotulo: ''`. É a forma do
  // `alterarEquipamento`, e a razão pela qual cada campo entra por
  // `!== undefined`.
  await sync.alterarArtigo(banana, { estimativa: 2.9 });
  const a = await admin.collection('artigos').getOne(banana);
  igual(a.rotulo, 'Bananas da Madeira', 'o rótulo foi apagado por uma alteração que não o mandava');
  igual(a.estimativa, 2.9);
});

await prova('⚠ o `posto` existe na coleção, e o que se escreve volta', async () => {
  // ⚠ Terceira vez que um campo declarado no `criar-colecoes.mjs` não estava
  // no servidor a andar — esse ficheiro APAGA e recria, e por isso um campo
  // novo precisa do `acrescentar-campos.mjs`. E o PocketBase aceita um
  // `update` e ignora em silêncio o campo que não conhece: uma escrita que não
  // se lê de volta passa por boa.
  await sync.reordenarArtigos([leite, banana]);
  const l = await admin.collection('artigos').getOne(leite);
  const b = await admin.collection('artigos').getOne(banana);
  igual(l.posto, 1, 'o posto do leite não ficou gravado');
  igual(b.posto, 2, 'o posto da banana não ficou gravado');
});

await prova('⚠ e a ordem DESCE para a loja, sem os postos a zero', async () => {
  // Um campo novo nasce a zero em todas as linhas que já existem, e zero quer
  // dizer «nunca foi arrastado». Sem esse filtro a lista inteira ficava
  // empatada em primeiro e saía por ordem qualquer.
  const cereais = await admin.collection('artigos').create({
    casa: casa.id, lista, rotulo: 'Cereais sem posto' });
  const lida = await sync.puxarCasa();
  igual(lida.itemOrder[leite], 1);
  igual(lida.itemOrder[banana], 2);
  igual(lida.itemOrder[cereais.id], undefined, 'um posto a zero entrou no mapa');
  await admin.collection('artigos').delete(cereais.id);
});

await prova('o corredor muda pelo `mudarCorredor`, que é o mesmo caminho', async () => {
  const sec = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Frescos', posto: 1 });
  await sync.mudarCorredor(leite, sec.id);
  igual((await admin.collection('artigos').getOne(leite)).corredor, sec.id);
  // E limpa-se: nulo é um corredor válido enquanto a migração não correu.
  await sync.mudarCorredor(leite, null);
  igual((await admin.collection('artigos').getOne(leite)).corredor, '');
  await admin.collection('seccoes').delete(sec.id);

  // ⚠ E o artigo volta ao que era. As provas seguintes leem «Bananas» pelo
  // nome e esperam-no habitual, e este bloco mudou-lhe as duas coisas — uma
  // prova que deixa o mundo diferente de como o encontrou faz falhar a que vem
  // depois por uma razão que não é a dela. Levou uma corrida a descobrir.
  await sync.alterarArtigo(banana, { rotulo: 'Bananas', habitual: true });
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e dois telemóveis na mesma loja NÃO se anulam ──');

await prova('a Rita apanha as bananas', async () => {
  await sync.marcarArtigo(banana, 'done', 1.75);
  const a = await admin.collection('artigos').getOne(banana);
  igual(a.estado, 'confirmado');
  igual(a.preco_real, 1.75);
});

await prova('o Tomás marca o leite como sem stock, do telemóvel dele', async () => {
  await doTomas.collection('artigos').update(leite, { estado: 'sem_stock' });
  igual((await admin.collection('artigos').getOne(leite)).estado, 'sem_stock');
});

await prova('⚠ e as DUAS marcações ficam — cada um alterou a sua linha', async () => {
  // É aqui que a lista partilhada falhava: quem gravasse por último reescrevia
  // o mapa inteiro e apagava o trabalho do outro.
  const lida = await sync.puxarCasa();
  igual(lida.status[banana], 'done', JSON.stringify(lida.status));
  // ⚠ Estava aqui `'sem stock'`, com espaço — a grafia da tabela do `sync.js`,
  // não a dos ecrãs. Esta prova comparava a tabela CONSIGO PRÓPRIA e ficou
  // verde todos os meses em que os ecrãs falavam «sem-stock» com hífen e um
  // artigo esgotado voltava à lista como se estivesse por comprar.
  //
  // Agora a grafia vem do `compras-estado.js`, que é o dono dela, e uma
  // divergência entre a tabela e os ecrãs falha do lado do Jest —
  // `__tests__/o-estado-do-artigo-tem-uma-grafia.test.js`.
  igual(lida.status[leite], SEM_STOCK, JSON.stringify(lida.status));
});

await prova('⚠ e o `puxarCasa` traduz os estados de volta para a forma da loja', async () => {
  // O servidor tem `por_comprar | confirmado | sem_stock`; a loja fala
  // `open | done | sem-stock`. Uma tabela só, nos dois sentidos, e num
  // ficheiro só: `src/compras-estado.js`.
  const lida = await sync.puxarCasa();
  const b = (lida.newItems || []).find(a => a.id === banana);
  if (!b) throw new Error('a banana não veio');
  igual(b.label, 'Bananas');
  // ⚠ `s` e `staple`, que são os nomes da LOJA. Esta prova pedia `section` e
  // `habitual` — os nomes do servidor — e ficou a falhar quando o `sync.js`
  // passou a montar a forma que os ecrãs leem, em 07/09/2026. Era ela que
  // estava desactualizada: com `section`, as quatro secções do Modo Compras
  // apareciam vazias.
  //
  // ⚠ E depois pediu `s === 0`, que também deixou de ser verdade: a secção
  // passou a ser o NOME do corredor em 08/09/2026, e numa casa sem corredores
  // nenhum nome existe — o `s` é NULO, e isso é o estado de uma casa por
  // migrar, não um defeito. Ficou a falhar dois dias porque empurrei o
  // `sync.js` sem correr as provas do servidor.
  igual(b.s, null, 'uma casa sem corredores não tem nome para dar ao artigo');
  igual(b.staple, true);
  // E o plano: a loja pelo ÍNDICE na lista `stores`, que é o que o ecrã lê.
  igual(lida.shopPlan.who, 'Rita');
  igual(lida.shopPlan.day, 'd2026-09-28');
  igual(lida.shopPlan.idServidor, lista);
});

await prova('⚠ e com corredores na casa, o `s` é o NOME e vem pela ordem deles', async () => {
  // O caso da casa a sério, que a prova de cima não cobre: os ecrãs agrupam
  // por `i.s === sec`, e uma comparação de nome contra número dava quatro
  // secções vazias. E a ordem é o dado — a lista É o percurso da loja.
  const frutas = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Frutas', posto: 2 });
  const frescos = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Frescos', posto: 1 });
  await sync.mudarCorredor(banana, frutas.id);

  const lida = await sync.puxarCasa();
  igual((lida.newItems || []).find(a => a.id === banana).s, 'Frutas');
  // Pelo POSTO, e não pela ordem em que o servidor devolveu as linhas.
  igual(JSON.stringify(lida.seccoesDaCasa), JSON.stringify(['Frescos', 'Frutas']));

  // E deixa o mundo como o encontrou.
  await sync.mudarCorredor(banana, null);
  await admin.collection('seccoes').delete(frutas.id);
  await admin.collection('seccoes').delete(frescos.id);
});

await prova('desmarcar volta a `por_comprar`', async () => {
  await sync.marcarArtigo(banana, 'open');
  igual((await admin.collection('artigos').getOne(banana)).estado, 'por_comprar');
  const lida = await sync.puxarCasa();
  // `open` não entra no mapa: é a ausência que quer dizer «por comprar».
  igual(lida.status[banana], undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── fechar a conta fecha a ida ──');

await prova('⚠ a lista fechada deixa de ser a aberta', async () => {
  await sync.alterarListaDeCompras(lista, { fechadaEm: 'd2026-09-28', total: 62.4 });
  const lida = await sync.puxarCasa();
  igual(lida.shopPlan, null, 'a lista fechada continua a ser a aberta');
  // E os artigos dela não vêm mais — a próxima ida nasce vazia sem ninguém
  // apagar nada.
  igual((lida.newItems || []).length, 0);
});

await prova('e a ida seguinte é uma lista nova', async () => {
  // ⚠ Sem o `comId` esta prova passava com a lista POR CRIAR: o `r.id` vinha
  // `undefined`, o `shopPlan.idServidor` também, e `igual(undefined, undefined)`
  // dá certo. Uma recusa aqui não se via de todo.
  const r = await comId(sync.listaDeCompras({
    casa: daRita.casa, loja, comprador: daRita.membro }), 'listaDeCompras, a seguinte');
  const lida = await sync.puxarCasa();
  igual(lida.shopPlan.idServidor, r.id);
  igual((lida.newItems || []).length, 0);
  // A fechada fica: é o histórico.
  igual((await admin.collection('listas_compras').getFullList())
    .filter(l => l.casa === casa.id).length, 2);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── ⚠ e o histórico das idas é da casa, não do telefone ──');

// O `shopHistory` era uma lista escrita no telefone de quem foi ao
// supermercado, e mais nada. Quem não tinha ido via o histórico vazio — e a
// comparação com a ida anterior, que é para o que ele serve, não funcionava
// para metade da casa. Agora deriva-se das listas FECHADAS.

await prova('a ida fechada entra no histórico, com o total e a loja', async () => {
  const lida = await sync.puxarCasa();
  const h = (lida.shopHistory || [])[0];
  if (!h) throw new Error('histórico vazio: ' + JSON.stringify(lida.shopHistory));
  igual(h.total, 62.4, 'o total da ida não voltou');
  igual(h.who, 'Rita');
  if (!h.store) throw new Error('a loja não voltou');
});

await prova('⚠ e o OUTRO adulto vê o mesmo histórico', async () => {
  // É o defeito todo: o histórico existia só onde foi escrito.
  const memoriaDele = new Map();
  configurar({
    url: URL,
    storage: {
      getItem: async (k) => (memoriaDele.has(k) ? memoriaDele.get(k) : null),
      setItem: async (k, v) => { memoriaDele.set(k, v); },
      removeItem: async (k) => { memoriaDele.delete(k); },
    },
  });
  await auth.entrarAdulto('tomas@x.pt', 'palavra-longa-2');
  const dele = await sync.puxarCasa();
  igual((dele.shopHistory || []).length, 1, JSON.stringify(dele.shopHistory));
  igual(dele.shopHistory[0].total, 62.4);
  // E volta-se ao telemóvel da Rita, para as provas seguintes.
  await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
});

await prova('a lista ABERTA não entra no histórico', async () => {
  // Só entra quem tem `fechada_em`. A ida a meio ainda não custou nada.
  const lida = await sync.puxarCasa();
  igual((lida.shopHistory || []).length, 1);
});

// ═════════════════════════════════════════════════════════════════════════════
// As prendas: um artigo «só os adultos» não chega ao telemóvel da criança.
// (11/09/2026 — INVARIANTE #3 aplicado à lista de compras.)
console.log('\n── as prendas: o que a criança NÃO recebe ──');

let prenda = null;
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');

await prova('a Rita põe uma prenda na lista, «só os adultos»', async () => {
  const r = await comId(sync.artigoDeCompras({
    casa: daRita.casa, lista, rotulo: 'Prenda de anos do Leo', pedidoPor: daRita.membro,
    estimativa: 14.9, visibilidade: 'adultos' }), 'artigoDeCompras(prenda)');
  prenda = r.id;
  const a = await admin.collection('artigos').getOne(prenda);
  igual(a.visibilidade, 'adultos');
});

await prova('⚠ o telemóvel do Léo pede a lista e a prenda NÃO vem', async () => {
  const dele = await doLeo.collection('artigos').getFullList();
  if (dele.some(a => a.id === prenda)) throw new Error('a prenda chegou à criança');
  // E os outros artigos vêm: a lista continua a ser dele também.
  if (!dele.some(a => a.id === banana)) throw new Error('a criança deixou de ver a lista');
});

await prova('⚠ nem pedindo a linha pelo id', () =>
  recusado(() => doLeo.collection('artigos').getOne(prenda)));

await prova('o Tomás vê a prenda — é adulto', async () => {
  const a = await doTomas.collection('artigos').getOne(prenda);
  igual(a.rotulo, 'Prenda de anos do Leo');
});

await prova('e o Léo PEDE um artigo, com o nome dele', async () => {
  const r = await doLeo.collection('artigos').create({
    casa: casa.id, lista, rotulo: 'Iogurtes de morango', pedido_por: leo.id, estado: 'por_comprar' });
  igual(r.pedido_por, leo.id);
  // Sem visibilidade escrita, lê-se como «familia»: a Rita vê-o.
  const naRita = await admin.collection('artigos').getOne(r.id);
  igual(naRita.visibilidade === 'adultos', false);
});

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ apagar a lista leva os artigos dela', async () => {
  // `cascadeDelete` na relação. Sem isso ficavam artigos a apontar para uma
  // lista que já não existe — invisíveis, e a acumular.
  const l = await admin.collection('listas_compras').create({ casa: casa.id, loja });
  const a = await admin.collection('artigos').create({ casa: casa.id, lista: l.id, rotulo: 'X' });
  await admin.collection('listas_compras').delete(l.id);
  await recusado(() => admin.collection('artigos').getOne(a.id));
});

await prova('⚠ a vizinha não vê nem escreve nas compras desta casa', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  const nela = await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-compras@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-compras@x.pt', 'palavra-longa-9');

  igual((await cVizinha.collection('artigos').getFullList()).length, 0);
  igual((await cVizinha.collection('listas_compras').getFullList()).length, 0);
  // E não marca um artigo nosso como apanhado.
  await recusado(() => cVizinha.collection('artigos').update(leite, { estado: 'confirmado' }));
});

resumo();
