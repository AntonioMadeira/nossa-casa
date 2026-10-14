// A ementa da semana — os pratos da casa e o jantar de cada dia.
//
//   node db/pocketbase/provar-ementa.mjs
//
// Um prato é um molde (nome e ingredientes em JSON); a ementa é um jantar por
// dia, e marcar outra vez ALTERA a linha do dia. Os adultos escrevem, a
// criança lê — é o jantar dela. 11/09/2026 — a terceira das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Ementa', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

await mk('Rita', 'admin',   { email: 'rita-ementa@x.pt', ...s('palavra-longa-1') });
await mk('Leo',  'crianca', { ...s('135790') });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');

await auth.entrarAdulto('rita-ementa@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

console.log('\n── os pratos ──');

let frango = null;

await prova('a Rita cria um prato com os ingredientes dentro', async () => {
  const r = await comId(sync.pratoDaCasa({ casa: daRita.casa, nome: 'Frango no forno',
    ingredientes: [{ rotulo: 'Frango inteiro', s: 'Frescos' }, { rotulo: 'Batata · 2 kg', s: 'Frutas & Legumes' }] }),
    'pratoDaCasa');
  frango = r.id;
  const p = await admin.collection('pratos').getOne(frango);
  igual(p.nome, 'Frango no forno');
  igual(p.ingredientes.length, 2);
  igual(p.ingredientes[1].s, 'Frutas & Legumes');
});

await prova('⚠ dois pratos com o mesmo nome não entram', () =>
  recusado(() => admin.collection('pratos').create({ casa: casa.id, nome: 'Frango no forno', ingredientes: [] })));

await prova('⚠ o Léo lê os pratos mas não os cria nem altera', async () => {
  const dele = await doLeo.collection('pratos').getFullList();
  igual(dele.length, 1);
  await recusado(() => doLeo.collection('pratos').create({ casa: casa.id, nome: 'Pizza', ingredientes: [] }));
  await recusado(() => doLeo.collection('pratos').update(frango, { nome: 'Frango à Léo' }));
});

console.log('\n── o jantar de cada dia ──');

await prova('a Rita marca o jantar de segunda', async () => {
  const r = await comId(sync.jantarDoDia({ casa: daRita.casa, dia: 'd2026-09-14', prato: frango }), 'jantarDoDia');
  igual(r.prato, frango);
  igual(String(r.dia).slice(0, 10), '2026-09-14');
});

await prova('⚠ marcar outra vez no MESMO dia altera a linha em vez de criar outra', async () => {
  const pizza = await comId(sync.pratoDaCasa({ casa: daRita.casa, nome: 'Pizza', ingredientes: [{ rotulo: 'Massa de pizza', s: 'Frescos' }] }), 'pratoDaCasa(pizza)');
  const r = await comId(sync.jantarDoDia({ casa: daRita.casa, dia: 'd2026-09-14', prato: pizza.id }), 'jantarDoDia, segunda vez');
  igual(r.prato, pizza.id);
  const dias = (await admin.collection('ementa').getFullList()).filter(e => String(e.dia).startsWith('2026-09-14'));
  igual(dias.length, 1, 'ficaram ' + dias.length + ' linhas para o mesmo dia');
});

await prova('⚠ e sem prato o dia fica SEM linha — «sem jantar» é a ausência', async () => {
  // `comId` também aqui: o que volta é a linha APAGADA, com o id dela.
  const r = await comId(sync.jantarDoDia({ casa: daRita.casa, dia: 'd2026-09-14', prato: null }), 'jantarDoDia(sem prato)');
  igual(r.apagada, true);
  const dias = (await admin.collection('ementa').getFullList()).filter(e => String(e.dia).startsWith('2026-09-14'));
  igual(dias.length, 0);
});

await prova('o `puxarCasa` traz a ementa por CHAVE de dia e os pratos na forma da loja', async () => {
  await comId(sync.jantarDoDia({ casa: daRita.casa, dia: 'd2026-09-15', prato: frango }), 'jantarDoDia(15)');
  const lida = await sync.puxarCasa();
  igual(lida.ementa['d2026-09-15'], frango);
  const p = lida.pratos.find(x => x.id === frango);
  if (!p) throw new Error('o prato não veio');
  igual(p.ingredientes[0].rotulo, 'Frango inteiro');
  igual(p.ingredientes[0].s, 'Frescos');
});

await prova('⚠ o Léo lê a ementa — é o jantar dele — mas não a marca', async () => {
  const dele = await doLeo.collection('ementa').getFullList();
  igual(dele.length, 1);
  await recusado(() => doLeo.collection('ementa').create({ casa: casa.id, dia: '2026-09-16 00:00:00.000Z', prato: frango }));
});

await prova('⚠ apagar o prato leva os dias que o tinham', async () => {
  await admin.collection('pratos').delete(frango);
  const dias = (await admin.collection('ementa').getFullList()).filter(e => e.prato === frango);
  igual(dias.length, 0);
});

console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ um prato de outra casa não entra na ementa desta', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-ementa@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-ementa@x.pt', 'palavra-longa-9');
  const dela = await cVizinha.collection('pratos').create({ casa: outra.id, nome: 'Sopa', ingredientes: [] });
  igual((await cVizinha.collection('ementa').getFullList()).length, 0);
  // A Rita, com um prato de FORA, não consegue pô-lo na ementa desta casa: o
  // `prato.casa` prende. Pelo cliente cru — a `jantarDoDia` só chegaria aqui
  // com um prato da casa, e o que se prova é a regra.
  const { pb: daRitaCru } = await import('../../src/pocketbase.js');
  await recusado(() => daRitaCru.collection('ementa').create({
    casa: casa.id, dia: '2026-09-17 00:00:00.000Z', prato: dela.id }));
  igual((await cVizinha.collection('pratos').getFullList()).length, 1);
});

resumo();
