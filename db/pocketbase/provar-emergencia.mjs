// A ficha de emergência — as alergias no servidor, com as regras da ficha.
//
//   node db/pocketbase/provar-emergencia.mjs
//
// Uma alergia é do MEMBRO, não de uma consulta. Quem a vê é quem vê a ficha: os
// adultos veem as das crianças, um adulto vê só a sua, a criança não vê nenhuma
// — nem a sua. Travão de casa. 12/09/2026 — a sétima das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Emergencia', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita-em@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomás', 'adulto',  { email: 'tomas-em@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doTomas = await telemovel('tomas-em@x.pt', 'palavra-longa-2');
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');

await auth.entrarAdulto('rita-em@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

console.log('\n── a alergia é do membro ──');

let amendoim = null;

await prova('a Rita escreve uma alergia ao Léo — nome, gravidade, nota', async () => {
  const r = await comId(sync.alergiaDeSaude({ casa: daRita.casa, membro: leo.id, nome: 'Amendoim', gravidade: 'grave',
    nota: 'Caneta de adrenalina na mochila' }), 'alergiaDeSaude');
  amendoim = r.id;
  const a = await admin.collection('alergias_saude').getOne(amendoim);
  igual(a.membro, leo.id);
  igual(a.gravidade, 'grave');
  igual(a.nota, 'Caneta de adrenalina na mochila');
});

await prova('⚠ a mesma alergia não se escreve duas vezes na mesma pessoa', () =>
  recusado(() => admin.collection('alergias_saude').create({ casa: casa.id, membro: leo.id, nome: 'Amendoim' })));

await prova('⚠ e uma gravidade que não existe é recusada', () =>
  recusado(() => admin.collection('alergias_saude').create({ casa: casa.id, membro: leo.id, nome: 'Pólen', gravidade: 'terrível' })));

console.log('\n── quem vê ──');

await prova('o Tomás vê a alergia do Léo — as fichas das crianças são dos adultos', async () => {
  const v = await doTomas.collection('alergias_saude').getFullList();
  igual(v.some(a => a.id === amendoim), true);
});

await prova('⚠ e o telemóvel do LÉO não recebe nenhuma — nem a sua', async () => {
  igual((await doLeo.collection('alergias_saude').getFullList()).length, 0);
  await recusado(() => doLeo.collection('alergias_saude').getOne(amendoim));
  await recusado(() => doLeo.collection('alergias_saude').create({ casa: casa.id, membro: leo.id, nome: 'Chocolate' }));
});

await prova('⚠ a Rita NÃO vê uma alergia do Tomás — a ficha de um adulto é só dele', async () => {
  const doTomasAlergia = await admin.collection('alergias_saude').create({ casa: casa.id, membro: tomas.id, nome: 'Penicilina', gravidade: 'moderada' });
  const { pb: daRitaCru } = await import('../../src/pocketbase.js');
  igual((await daRitaCru.collection('alergias_saude').getFullList()).some(a => a.id === doTomasAlergia.id), false);
  await recusado(() => daRitaCru.collection('alergias_saude').getOne(doTomasAlergia.id));
  // Mas o Tomás vê a sua, e escreve na sua.
  igual((await doTomas.collection('alergias_saude').getFullList()).some(a => a.id === doTomasAlergia.id), true);
  await doTomas.collection('alergias_saude').create({ casa: casa.id, membro: tomas.id, nome: 'Marisco', gravidade: 'leve' });
});

await prova('o `puxarSaude` traz as alergias pelo nome do membro, e só as que quem pergunta vê', async () => {
  const ficha = await sync.puxarSaude({ Leo: leo.id, Rita: rita.id, 'Tomás': tomas.id });
  const doLeoLista = ficha.alergias.filter(a => a.member === 'Leo');
  igual(doLeoLista.length, 1);
  igual(doLeoLista[0].nome, 'Amendoim');
  igual(doLeoLista[0].gravidade, 'grave');
  // A Rita não recebe as do Tomás.
  igual(ficha.alergias.filter(a => a.member === 'Tomás').length, 0);
});

console.log('\n── apagar, e nada atravessa casas ──');

await prova('a Rita tira a alergia do Léo', async () => {
  await sync.apagarAlergiaDeSaude(amendoim);
  await recusado(() => admin.collection('alergias_saude').getOne(amendoim));
});

await prova('⚠ uma adulta de outra casa não escreve nem lê alergias desta', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-em@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-em@x.pt', 'palavra-longa-9');
  igual((await cVizinha.collection('alergias_saude').getFullList()).length, 0);
  await recusado(() => cVizinha.collection('alergias_saude').create({ casa: outra.id, membro: leo.id, nome: 'Ovo' }));
});

await prova('⚠ e para um servidor FORA de casa a alergia SOBE na mesma', async () => {
  // ⚠ INVERTIDA EM 30/09/2026. Esta prova defendia que a saúde NÃO subia para
  // um servidor fora de casa. A casa mudou-se para uma máquina alugada e o dono
  // decidiu que sobe na mesma — o cabeçalho do `src/endereco.js` tem a decisão,
  // a data e o custo.
  //
  // O defeito que interessa apanhar passou a ser o contrário: a saúde DEIXAR de
  // subir no dia da mudança, sem ninguém pedir isso.
  //
  // ⚠ E o endereço é o `localtest.me`, que resolve para 127.0.0.1 e não conta
  // como de casa. A versão anterior usava `nossa-casa.exemplo.com`, que não
  // existe: servia para provar uma recusa, mas não serve para provar uma
  // SUBIDA — nada subiria de qualquer maneira, e a prova ficaria verde por
  // engano.
  const foraDeCasa = URL.replace('127.0.0.1', 'localtest.me');
  const antes = (await admin.collection('alergias_saude').getList(1, 1, { filter: `casa = "${casa.id}"` })).totalItems;
  configurar({ url: foraDeCasa });
  let mensagem = null;
  try { await sync.alergiaDeSaude({ casa: casa.id, membro: leo.id, nome: 'sobe de fora' }); }
  catch (e) { mensagem = e.message; }
  configurar({ url: URL });
  if (mensagem) throw new Error('foi recusada: ' + mensagem);
  const depois = (await admin.collection('alergias_saude').getList(1, 1, { filter: `casa = "${casa.id}"` })).totalItems;
  if (depois !== antes + 1) throw new Error(`a alergia não chegou ao servidor: ${antes} -> ${depois}`);
});

resumo();
