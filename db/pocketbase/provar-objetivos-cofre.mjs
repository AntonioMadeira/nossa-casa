// O objetivo do cofre de cada criança — «Bicicleta, 120 €».
//
//   node db/pocketbase/provar-objetivos-cofre.mjs
//
// A criança define o SEU objetivo; os adultos leem os de todas; a irmã não lê
// o dela. É uma linha por criança (índice único), só com o nome e o alvo: o
// que está juntado é o saldo do cofre, a soma dos `cofre_movimentos`, e nunca
// um campo daqui (INVARIANTE #2). 11/09/2026 — a segunda das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Objetivos', valor_ponto: 0.4 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita = await mk('Rita', 'admin',   { email: 'rita-obj@x.pt', ...s('palavra-longa-1') });
const leo  = await mk('Leo',  'crianca', { ...s('135790') });
const mia  = await mk('Mia',  'crianca', { ...s('246813') });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');
const daMia = await telemovel(`${casa.id}_Mia`, '246813');

console.log('\n── a criança define o SEU objetivo ──');

let objetivo = null;

await prova('o Léo cria o seu objetivo: Bicicleta, 120 €', async () => {
  objetivo = await doLeo.collection('objetivos_cofre').create({
    casa: casa.id, membro: leo.id, nome: 'Bicicleta', alvo: 120 });
  igual(objetivo.nome, 'Bicicleta');
  igual(objetivo.alvo, 120);
});

await prova('⚠ e não cria um SEGUNDO — é uma linha por criança', () =>
  recusado(() => doLeo.collection('objetivos_cofre').create({
    casa: casa.id, membro: leo.id, nome: 'Consola', alvo: 300 })));

await prova('⚠ nem cria o da Mia', () =>
  recusado(() => doLeo.collection('objetivos_cofre').create({
    casa: casa.id, membro: mia.id, nome: 'Patins', alvo: 60 })));

await prova('muda o alvo do seu — 150 €', async () => {
  const r = await doLeo.collection('objetivos_cofre').update(objetivo.id, { alvo: 150 });
  igual(r.alvo, 150);
});

await prova('⚠ o alvo tem limites: nem 0 €, nem 5 000 €', async () => {
  await recusado(() => doLeo.collection('objetivos_cofre').update(objetivo.id, { alvo: 0 }));
  await recusado(() => doLeo.collection('objetivos_cofre').update(objetivo.id, { alvo: 5000 }));
});

await prova('⚠ e a linha NÃO tem onde escrever o juntado — é o saldo do cofre', async () => {
  const c = await admin.collections.getOne('objetivos_cofre');
  const nomes = c.fields.map(f => f.name);
  for (const proibido of ['juntado', 'atual', 'saldo', 'progresso']) {
    if (nomes.includes(proibido)) throw new Error(`há um campo «${proibido}» — um saldo escrito`);
  }
});

console.log('\n── quem lê o quê ──');

await prova('a Mia não vê o objetivo do Léo', async () => {
  const dela = await daMia.collection('objetivos_cofre').getFullList();
  igual(dela.length, 0);
  await recusado(() => daMia.collection('objetivos_cofre').getOne(objetivo.id));
});

await prova('a Rita vê o do Léo — e pelo `puxarCasa`, por NOME da criança', async () => {
  await auth.entrarAdulto('rita-obj@x.pt', 'palavra-longa-1');
  const lida = await sync.puxarCasa();
  const o = (lida.objetivosCofre || {}).Leo;
  if (!o) throw new Error('o `puxarCasa` não trouxe o objetivo: ' + JSON.stringify(lida.objetivosCofre));
  igual(o.nome, 'Bicicleta');
  igual(o.alvo, 150);
  igual(o.id, objetivo.id);
});

await prova('a Rita ajuda a Mia a começar: define-lhe um objetivo, e a Mia vê-o', async () => {
  const daRita = sync.sessao();
  const r = await sync.definirObjetivoDoCofre({ casa: daRita.casa, membro: mia.id, nome: 'Patins', alvo: 60 });
  igual(r.membro, mia.id);
  const dela = await daMia.collection('objetivos_cofre').getFullList();
  igual(dela.length, 1);
  igual(dela[0].nome, 'Patins');
});

await prova('⚠ definir OUTRA vez altera a linha em vez de criar uma segunda', async () => {
  const daRita = sync.sessao();
  const r = await sync.definirObjetivoDoCofre({ casa: daRita.casa, membro: mia.id, nome: 'Patins em linha', alvo: 75 });
  const todas = (await admin.collection('objetivos_cofre').getFullList()).filter(o => o.membro === mia.id);
  igual(todas.length, 1);
  igual(r.nome, 'Patins em linha');
  igual(r.alvo, 75);
});

console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ a vizinha não lê nem escreve objetivos desta casa', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-obj@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-obj@x.pt', 'palavra-longa-9');
  igual((await cVizinha.collection('objetivos_cofre').getFullList()).length, 0);
  // Nem assinando a casa dela e apontando ao Léo: o `membro.casa` prende.
  await recusado(() => cVizinha.collection('objetivos_cofre').create({
    casa: outra.id, membro: leo.id, nome: 'X', alvo: 10 }));
});

resumo();
