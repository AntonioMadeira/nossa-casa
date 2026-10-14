// Os contratos e as renovações — e o documento que atravessa a rede.
//
//   node db/pocketbase/provar-contratos.mjs
//
// A definição vai pela fila; o documento vai à parte, num `update` só com o
// ficheiro. A criança não lê (é da casa, como os equipamentos); outra casa não
// lê; e o ficheiro sobe e volta igual, byte a byte. 12/09/2026 — a quinta das
// dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

// Um PNG de 1×1: o menor ficheiro válido que serve para provar um caminho de
// carregamento. O que importa é que atravessa e volta com o mesmo tamanho.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64');

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Contratos', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

await mk('Rita', 'admin', { email: 'rita-ct@x.pt', ...s('palavra-longa-1') });
const tomas = await mk('Tomás', 'adulto', { email: 'tomas-ct@x.pt', ...s('palavra-longa-2') });
await mk('Leo', 'crianca', { ...s('135790') });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');

await auth.entrarAdulto('rita-ct@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

console.log('\n── a definição ──');

let seguro = null;

await prova('a Rita acrescenta um contrato com datas e quem trata', async () => {
  const r = await comId(sync.contratoDaCasa({ casa: daRita.casa, nome: 'Seguro do carro', fornecedor: 'Fidelidade',
    renovaEm: '05/10/2026', fidelizacaoAte: '31/03/2027', responsavel: tomas.id }), 'contratoDaCasa');
  seguro = r.id;
  const c = await admin.collection('contratos').getOne(seguro);
  igual(c.nome, 'Seguro do carro');
  igual(c.fornecedor, 'Fidelidade');
  igual(String(c.renova_em).slice(0, 10), '2026-10-05');
  igual(String(c.fidelizacao_ate).slice(0, 10), '2027-03-31');
  igual(c.responsavel, tomas.id);
});

await prova('um contrato sem datas nem responsável também entra — a inspeção que ainda não tem dia', async () => {
  const r = await comId(sync.contratoDaCasa({ casa: daRita.casa, nome: 'Inspeção do carro' }), 'contratoDaCasa(sem datas)');
  const c = await admin.collection('contratos').getOne(r.id);
  igual(c.renova_em, '');
  igual(c.responsavel, '');
});

await prova('⚠ o Léo não lê os contratos nem os cria — são da casa, como os equipamentos', async () => {
  igual((await doLeo.collection('contratos').getFullList()).length, 0);
  await recusado(() => doLeo.collection('contratos').create({ casa: casa.id, nome: 'Netflix' }));
});

console.log('\n── o documento atravessa a rede e volta ──');

await prova('⚠ o documento sobe para a linha do contrato, num update só com o ficheiro', async () => {
  const r = await sync.documentoDoContrato(seguro, {
    blob: new Blob([PNG_1x1], { type: 'image/png' }), nome: 'apolice.png', mime: 'image/png' });
  if (!r.ficheiro) throw new Error('a linha ficou sem ficheiro — o FormData não levou nada');
  // E os outros campos ficaram como estavam: um update só com o ficheiro não
  // apaga a linha.
  igual(r.nome, 'Seguro do carro');
  igual(r.responsavel, tomas.id);
});

await prova('⚠ e volta a poder ser pedido, com o tamanho certo', async () => {
  const c = await admin.collection('contratos').getOne(seguro);
  const url = admin.files.getURL(c, c.ficheiro);
  const resposta = await fetch(url);
  igual(resposta.status, 200, url);
  const bytes = Buffer.from(await resposta.arrayBuffer());
  igual(bytes.length, PNG_1x1.length, `${bytes.length} bytes`);
});

await prova('⚠ um documento sem contrato não se grava', () =>
  recusado(() => sync.documentoDoContrato(null, { blob: new Blob([PNG_1x1]), nome: 'x.png', mime: 'image/png' })));

await prova('o `puxarCasa` traz o contrato na forma da loja, com o documento como URL e quem trata pelo nome', async () => {
  const lida = await sync.puxarCasa();
  const c = lida.contratos.find(x => x.id === seguro);
  if (!c) throw new Error('o contrato não veio');
  igual(c.renovaEm, '05/10/2026');
  igual(c.fidelizacaoAte, '31/03/2027');
  igual(c.responsavel, 'Tomás');
  igual(/^https?:\/\//.test(c.ficheiro || ''), true, 'o documento devia vir como URL: ' + c.ficheiro);
  const semDatas = lida.contratos.find(x => x.nome === 'Inspeção do carro');
  igual(semDatas.renovaEm, '');
  igual(semDatas.ficheiro, null);
});

console.log('\n── alterar e apagar ──');

await prova('alterar a data de renovação e tirar quem trata', async () => {
  await sync.alterarContrato(seguro, { renovaEm: '05/10/2027', responsavel: null });
  const c = await admin.collection('contratos').getOne(seguro);
  igual(String(c.renova_em).slice(0, 10), '2027-10-05');
  igual(c.responsavel, '');
  // O documento fica: alterar os campos não toca no ficheiro.
  igual(!!c.ficheiro, true, 'o documento desapareceu ao alterar os campos');
});

await prova('apagar leva o contrato — e o documento com ele', async () => {
  await sync.apagarContrato(seguro);
  await recusado(() => admin.collection('contratos').getOne(seguro));
});

console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ uma adulta de outra casa não lê os contratos desta, nem põe um adulto desta a tratar dos dela', async () => {
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-ct@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-ct@x.pt', 'palavra-longa-9');
  igual((await cVizinha.collection('contratos').getFullList()).length, 0);
  await recusado(() => cVizinha.collection('contratos').create({ casa: outra.id, nome: 'Seguro deles', responsavel: tomas.id }));
});

resumo();
