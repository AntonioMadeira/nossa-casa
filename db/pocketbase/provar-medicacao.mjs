// A medicação a partir da receita — o plano na receita, e as tomas como linhas.
//
//   node db/pocketbase/provar-medicacao.mjs
//
// Cada toma é uma linha (receita, quando, quem): aditiva, duas no mesmo instante
// colidem, só quem marcou desmarca. A visibilidade herda-se da receita e do
// episódio — a criança não vê as suas tomas — e tudo sobe pelo travão de casa,
// por decisão do dono da casa em 12/09/2026. A sexta das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Medicacao', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita-med@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomás', 'adulto',  { email: 'tomas-med@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doTomas = await telemovel('tomas-med@x.pt', 'palavra-longa-2');
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');

await auth.entrarAdulto('rita-med@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

const episodio = await admin.collection('episodios_saude').create({
  casa: casa.id, membro: leo.id, especialidade: 'Pediatria', dia: '2026-09-09' });

console.log('\n── o plano vive na receita ──');

let ferro = null;

await prova('a Rita escreve a receita com o plano: 1 por dia, 14 dias, caixa de 20', async () => {
  const r = await comId(sync.receitaDeSaude({ casa: daRita.casa, episodio: episodio.id, nome: 'Ferro 30 mg', dose: '1 comprimido',
    expiraEm: '2026-12-31', frequencia: 1, duracaoDias: 14, caixa: 20 }), 'receitaDeSaude');
  ferro = r.id;
  const rec = await admin.collection('receitas_saude').getOne(ferro);
  igual(rec.frequencia, 1);
  igual(rec.duracao_dias, 14);
  igual(rec.caixa, 20);
});

await prova('e muda-o depois — a receita antiga ganha plano', async () => {
  await sync.alterarReceitaDeSaude(ferro, { frequencia: 2, duracaoDias: 10, caixa: 20 });
  const rec = await admin.collection('receitas_saude').getOne(ferro);
  igual(rec.frequencia, 2);
  igual(rec.duracao_dias, 10);
});

console.log('\n── as tomas são linhas ──');

const quando = '2026-09-10T08:10:00.000Z';
let toma = null;

await prova('a Rita marca uma toma — com quem e quando', async () => {
  const r = await comId(sync.tomaDeSaude({ casa: daRita.casa, receita: ferro, quando, por: daRita.membro }), 'tomaDeSaude');
  toma = r.id;
  const t = await admin.collection('tomas_saude').getOne(toma);
  igual(t.receita, ferro);
  igual(t.por, rita.id);
  igual(String(t.quando).slice(0, 16).replace(' ', 'T'), '2026-09-10T08:10');
});

await prova('⚠ a MESMA toma no MESMO instante colide — nunca conta duas vezes', () =>
  recusado(() => admin.collection('tomas_saude').create({ casa: casa.id, receita: ferro, quando, por: tomas.id })));

await prova('o Tomás marca a da noite, na mesma receita', async () => {
  const r = await doTomas.collection('tomas_saude').create({
    casa: casa.id, receita: ferro, quando: '2026-09-10T20:05:00.000Z', por: tomas.id });
  igual(r.por, tomas.id);
  igual((await admin.collection('tomas_saude').getFullList()).filter(t => t.receita === ferro).length, 2);
});

await prova('⚠ e não assina uma toma em nome da Rita', () =>
  recusado(() => doTomas.collection('tomas_saude').create({
    casa: casa.id, receita: ferro, quando: '2026-09-11T08:00:00.000Z', por: rita.id })));

await prova('⚠ nem apaga a que a Rita marcou — só quem marcou desmarca', () =>
  recusado(() => doTomas.collection('tomas_saude').delete(toma)));

await prova('⚠ nem se edita uma toma: desmarca-se e marca-se outra', async () => {
  // Pelo telemóvel de um adulto, e não pelo superutilizador — esse passa por
  // cima de todas as regras, e a prova passava sem provar nada.
  const { pb: daRitaCru } = await import('../../src/pocketbase.js');
  await recusado(() => daRitaCru.collection('tomas_saude').update(toma, { quando: '2026-09-10T09:00:00.000Z' }));
  await recusado(() => doTomas.collection('tomas_saude').update(toma, { por: tomas.id }));
});

console.log('\n── quem vê ──');

await prova('⚠ o telemóvel do Léo não recebe toma nenhuma — nem as suas', async () => {
  igual((await doLeo.collection('tomas_saude').getFullList()).length, 0);
  await recusado(() => doLeo.collection('tomas_saude').getOne(toma));
  await recusado(() => doLeo.collection('tomas_saude').create({
    casa: casa.id, receita: ferro, quando: '2026-09-11T08:00:00.000Z', por: leo.id }));
});

await prova('o `puxarSaude` traz o plano na receita e as tomas com quem marcou pelo nome', async () => {
  const ficha = await sync.puxarSaude({ Leo: leo.id, Rita: rita.id, 'Tomás': tomas.id });
  const rec = ficha.receitas.find(r => r.idServidor === ferro);
  if (!rec) throw new Error('a receita não veio');
  igual(rec.frequency, 2);
  igual(rec.durationDays, 10);
  igual(rec.boxSize, 20);
  const tomas2 = ficha.tomas.filter(t => t.receitaNoServidor === ferro);
  igual(tomas2.length, 2);
  igual(tomas2.map(t => t.por).sort().join(','), 'Rita,Tomás');
});

await prova('a Rita desmarca a sua', async () => {
  await sync.apagarTomaDeSaude(toma);
  igual((await admin.collection('tomas_saude').getFullList()).filter(t => t.receita === ferro).length, 1);
});

console.log('\n── e nada disto atravessa casas, nem sai de casa ──');

await prova('⚠ uma adulta de outra casa não marca tomas numa receita desta, nem as lê', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  const nela = await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-med@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-med@x.pt', 'palavra-longa-9');
  igual((await cVizinha.collection('tomas_saude').getFullList()).length, 0);
  await recusado(() => cVizinha.collection('tomas_saude').create({
    casa: outra.id, receita: ferro, quando: '2026-09-12T08:00:00.000Z', por: nela.id }));
});

await prova('⚠ apagar a receita leva as tomas com ela', async () => {
  await admin.collection('receitas_saude').delete(ferro);
  igual((await admin.collection('tomas_saude').getFullList()).filter(t => t.receita === ferro).length, 0);
});

await prova('⚠ e para um servidor FORA de casa a toma SOBE na mesma', async () => {
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
  configurar({ url: foraDeCasa });
  let mensagem = null;
  try { await sync.tomaDeSaude({ casa: casa.id, receita: 'x', quando, por: rita.id }); }
  catch (e) { mensagem = e.message; }
  configurar({ url: URL });
  // ⚠ O travão não pode recusar. O servidor pode — a receita 'x' não existe —
  // e essa recusa é outra coisa: distinguem-se pela MENSAGEM.
  if (mensagem && /cinco pontos de conformidade/.test(mensagem)) {
    throw new Error('o travão recusou, e já não devia: ' + mensagem);
  }
});

resumo();
