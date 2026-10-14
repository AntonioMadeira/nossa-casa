// Os equipamentos da casa na base de dados.
//
//   node db/pocketbase/provar-equipamentos.mjs
//
// ── O que faltava ────────────────────────────────────────────────────────────
//
// A coleção `equipamentos` existia desde o primeiro dia e NINGUÉM escrevia
// nela. A garantia da máquina de lavar, quanto custou e quando acaba eram
// conhecidas de um telefone só — e é precisamente o género de coisa que se
// procura no telefone errado quando a máquina avaria.
//
// ── O que esta prova cobre, além do óbvio ────────────────────────────────────
//
// As DATAS. A loja guarda-as como texto «dd/mm/aaaa», a chave interna é
// `d2026-09-20`, e o servidor quer ISO — duas traduções em cada sentido, e é
// onde este género de coisa se parte em silêncio. Aqui a viagem é de ida e
// volta: o que sai da loja tem de voltar igual.
//
// E o `daysLeft`, que NÃO sobe: é derivado da garantia e do dia de hoje, e um
// número gravado fica errado no dia seguinte.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

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
console.log('\n── um equipamento, com todos os campos ──');

let maquina = null;

await prova('a Rita regista a máquina de lavar', async () => {
  const r = await comId(sync.equipamentoDaCasa({
    casa: daRita.casa,
    nome: 'Máquina de lavar roupa Bosch',
    categoria: 'Eletrodomésticos',
    compradoEm: '14/03/2025',
    loja: 'Worten · Colombo',
    preco: 549,
    garantiaAte: '14/03/2027',
    manutencao: 'Limpeza do filtro',
    manutencaoAte: '01/10/2026',
  }), 'equipamentoDaCasa');
  maquina = r.id;
});

await prova('⚠ e TODOS os campos chegaram — é aqui que um nome errado se vê', async () => {
  // `nome` e não `name`; `comprado_em` e não `bought`; `garantia_ate` e não
  // `warrantyEnd`. O PocketBase ignora em silêncio o que não conhece.
  const e = await admin.collection('equipamentos').getOne(maquina);
  igual(e.nome, 'Máquina de lavar roupa Bosch');
  igual(e.categoria, 'Eletrodomésticos');
  igual(e.loja, 'Worten · Colombo');
  igual(e.preco, 549);
  igual(e.manutencao, 'Limpeza do filtro');
  igual(String(e.comprado_em).slice(0, 10), '2025-03-14');
  igual(String(e.garantia_ate).slice(0, 10), '2027-03-14');
  igual(String(e.manutencao_ate).slice(0, 10), '2026-10-01');
});

await prova('⚠ e a viagem de ida e volta das DATAS devolve o mesmo texto', async () => {
  // Duas traduções em cada sentido — «dd/mm/aaaa» → chave → ISO e de volta. É
  // onde este género de coisa se parte, e sem esta prova partia-se em silêncio:
  // o ecrã mostrava a data de outro dia, ou vazia.
  const lida = await sync.puxarCasa();
  const m = (lida.newEquip || []).find(e => e.id === maquina);
  if (!m) throw new Error('o equipamento não veio no puxarCasa');
  igual(m.name, 'Máquina de lavar roupa Bosch');
  igual(m.cat, 'Eletrodomésticos');
  igual(m.bought, '14/03/2025');
  igual(m.warrantyEnd, '14/03/2027');
  igual(m.maintDate, '01/10/2026');
  igual(m.shop, 'Worten · Colombo');
  igual(m.price, 549);
  igual(m.idServidor, maquina);
});

await prova('⚠ e o `daysLeft` NÃO vem — um número gravado fica errado amanhã', async () => {
  // A garantia que falta é a diferença entre a data e hoje. Guardá-la seria
  // gravar uma resposta que envelhece sozinha.
  const lida = await sync.puxarCasa();
  const m = (lida.newEquip || []).find(e => e.id === maquina);
  igual('daysLeft' in m, false, Object.keys(m).join(','));
});

await prova('o telemóvel do Tomás vê-o', async () => {
  const v = await doTomas.collection('equipamentos').getFullList();
  if (!v.some(e => e.id === maquina)) throw new Error('não o vê');
});

console.log('\n── alterar e apagar ──');

await prova('alterar muda os campos, e as datas continuam a viajar', async () => {
  await sync.alterarEquipamento(maquina, {
    nome: 'Máquina de lavar Bosch (nova)', preco: 599, garantiaAte: '31/12/2028' });
  const e = await admin.collection('equipamentos').getOne(maquina);
  igual(e.nome, 'Máquina de lavar Bosch (nova)');
  igual(e.preco, 599);
  igual(String(e.garantia_ate).slice(0, 10), '2028-12-31');

  const lida = await sync.puxarCasa();
  igual((lida.newEquip || []).find(x => x.id === maquina).warrantyEnd, '31/12/2028');
});

await prova('e apagar apaga', async () => {
  // ⚠ Sem o `comId` esta prova passava sem NADA acontecer: recusada a criação,
  // o `outro` ficava `undefined`, o `apagarEquipamento(undefined)` devolvia
  // `{pendente:true}` calado, e o `getOne(undefined)` rebentava — que é
  // precisamente o que o `recusado` lá em baixo quer ver. Verde de ponta a
  // ponta, e a torradeira nunca existiu.
  const outro = (await comId(sync.equipamentoDaCasa({
    casa: daRita.casa, nome: 'Torradeira', compradoEm: '01/01/2026' }),
    'equipamentoDaCasa(torradeira)')).id;
  await sync.apagarEquipamento(outro);
  await recusado(() => admin.collection('equipamentos').getOne(outro));
});

console.log('\n── e quem os vê ──');

await prova('⚠ uma CRIANÇA não recebe os equipamentos — ausente, não escondido', async () => {
  // A regra é `casa && adulto`: o que a casa tem e quanto custou não é
  // conversa para as crianças, e o servidor não o devolve.
  const doLeo = await telemovel(leo.login, '135790');
  igual((await doLeo.collection('equipamentos').getFullList()).length, 0);
  await recusado(() => doLeo.collection('equipamentos').getOne(maquina));
});

await prova('⚠ nem as manutenções', async () => {
  await admin.collection('manutencoes').create({
    casa: casa.id, equipamento: maquina, descricao: 'Revisão anual', a_fazer_ate: '2026-12-01' });
  const doLeo = await telemovel(leo.login, '135790');
  igual((await doLeo.collection('manutencoes').getFullList()).length, 0);
});

await prova('⚠ e apagar o equipamento leva as manutenções dele', async () => {
  // `cascadeDelete` na relação. Sem isso ficavam manutenções a apontar para um
  // equipamento que já não existe — invisíveis, e a avisar de nada.
  const e = await admin.collection('equipamentos').create({ casa: casa.id, nome: 'Caldeira' });
  const m = await admin.collection('manutencoes').create({
    casa: casa.id, equipamento: e.id, descricao: 'Revisão' });
  await admin.collection('equipamentos').delete(e.id);
  await recusado(() => admin.collection('manutencoes').getOne(m.id));
});

console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ a vizinha não vê nem escreve nos equipamentos desta casa', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  const nela = await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-eq@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-eq@x.pt', 'palavra-longa-9');

  igual((await cVizinha.collection('equipamentos').getFullList()).length, 0);
  await recusado(() => cVizinha.collection('equipamentos').update(maquina, { preco: 1 }));
  // E não pendura uma manutenção no nosso equipamento — a relação está
  // ancorada à casa, como todas as outras.
  await recusado(() => cVizinha.collection('manutencoes').create({
    casa: outra.id, equipamento: maquina, descricao: 'Intrusa' }));
});

resumo();
