// As contas fixas — a renda, a luz, a internet — e o que as paga.
//
//   node db/pocketbase/provar-contas-fixas.mjs
//
// A conta é a DEFINIÇÃO (nome, valor, dia, envelope, quem paga). «Paga este
// mês» é uma `despesas` do mês com `conta_fixa` a apontar — nunca um campo — e
// a segunda do mês colide na chave `conta-fixa:<id>:<mês>`. A criança não lê:
// é orçamento. 12/09/2026 — a quarta das dez funcionalidades.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, comId, semRecusa, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');
configurar({ url: URL, storage: memoriaDeTelemovel() });

const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Contas', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

await mk('Rita', 'admin', { email: 'rita-cf@x.pt', ...s('palavra-longa-1') });
const tomas = await mk('Tomás', 'adulto', { email: 'tomas-cf@x.pt', ...s('palavra-longa-2') });
await mk('Leo', 'crianca', { ...s('135790') });
const envelope = await admin.collection('envelopes').create({ casa: casa.id, nome: 'Casa & contas', limite_base: 900 });

const telemovel = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};
const doLeo = await telemovel(`${casa.id}_Leo`, '135790');

await auth.entrarAdulto('rita-cf@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();

const despesasDaConta = async (id) => (await admin.collection('despesas').getFullList()).filter(d => d.conta_fixa === id);

console.log('\n── a definição ──');

let renda = null;

await prova('a Rita cria uma conta fixa com envelope e quem paga', async () => {
  const r = await comId(sync.contaFixaDaCasa({ casa: daRita.casa, nome: 'Renda', valor: 850, dia: 1,
    envelope: envelope.id, quemPaga: tomas.id }), 'contaFixaDaCasa');
  renda = r.id;
  const c = await admin.collection('contas_fixas').getOne(renda);
  igual(c.nome, 'Renda');
  igual(c.valor, 850);
  igual(c.dia, 1);
  igual(c.envelope, envelope.id);
  igual(c.quem_paga, tomas.id);
});

await prova('⚠ duas contas com o mesmo nome não entram', () =>
  recusado(() => admin.collection('contas_fixas').create({ casa: casa.id, nome: 'Renda', valor: 1, dia: 2, envelope: envelope.id })));

await prova('⚠ o dia vai de 1 a 31, e o valor é positivo — no servidor, não só no campo', async () => {
  await recusado(() => admin.collection('contas_fixas').create({ casa: casa.id, nome: 'Dia zero', valor: 1, dia: 0, envelope: envelope.id }));
  await recusado(() => admin.collection('contas_fixas').create({ casa: casa.id, nome: 'Dia 32', valor: 1, dia: 32, envelope: envelope.id }));
  await recusado(() => admin.collection('contas_fixas').create({ casa: casa.id, nome: 'De borla', valor: 0, dia: 1, envelope: envelope.id }));
});

await prova('⚠ o Léo não lê as contas — é orçamento, ausente da resposta — nem as cria', async () => {
  igual((await doLeo.collection('contas_fixas').getFullList()).length, 0);
  await recusado(() => doLeo.collection('contas_fixas').create({ casa: casa.id, nome: 'Gomas', valor: 2, dia: 5, envelope: envelope.id }));
});

console.log('\n── pagar: uma despesa com a conta a apontar ──');

const chave = (mes) => `conta-fixa:${renda}:${mes}`;

await prova('a Rita paga a renda de setembro: uma despesa normal, com a conta e a chave do mês', async () => {
  await semRecusa(sync.despesa({ casa: daRita.casa, envelope: envelope.id, valor: 850, pagador: daRita.membro,
    descricao: 'Renda', data: '2026-09-01', divideMeias: true, contaFixa: renda, idemKey: chave('2026-09') }), 'despesa(renda, setembro)');
  const ds = await despesasDaConta(renda);
  igual(ds.length, 1);
  igual(ds[0].idem_key, chave('2026-09'));
  igual(ds[0].valor, 850);
});

await prova('⚠ pagar a MESMA conta no MESMO mês colide — em vez de pagar a renda duas vezes', async () => {
  // A fila trata um 400 numa escrita COM chave como «já lá está»: é sucesso,
  // não recusa — a linha que se queria escrever já existe. O que se prova é a
  // propriedade: depois da segunda tentativa continua a haver UMA despesa.
  const r = await semRecusa(sync.despesa({ casa: daRita.casa, envelope: envelope.id, valor: 850, pagador: daRita.membro,
    descricao: 'Renda outra vez', data: '2026-09-02', divideMeias: true, contaFixa: renda, idemKey: chave('2026-09') }), 'despesa(renda, segunda vez)');
  igual(r.pendentes, 0, 'a colisão não pode ficar na fila a bloquear o resto');
  const ds = await despesasDaConta(renda);
  igual(ds.length, 1, 'a renda foi paga ' + ds.length + ' vezes');
  igual(ds[0].descricao, 'Renda', 'a segunda escrita não pode ter substituído a primeira');
});

await prova('no mês seguinte volta a poder pagar-se', async () => {
  await semRecusa(sync.despesa({ casa: daRita.casa, envelope: envelope.id, valor: 850, pagador: daRita.membro,
    descricao: 'Renda', data: '2026-10-01', divideMeias: true, contaFixa: renda, idemKey: chave('2026-10') }), 'despesa(renda, outubro)');
  igual((await despesasDaConta(renda)).length, 2);
});

await prova('o `puxarCasa` traz a conta na forma da loja e os pagamentos por mês', async () => {
  const lida = await sync.puxarCasa();
  const c = lida.contasFixas.find(x => x.id === renda);
  if (!c) throw new Error('a conta não veio');
  igual(c.envelope, 'Casa & contas');
  igual(c.quemPaga, 'Tomás');
  igual(c.dia, 1);
  const pagas = lida.contasPagas.filter(p => p.conta === renda).map(p => p.mes).sort();
  igual(pagas.join(','), '2026-09,2026-10');
  igual(lida.contasPagas.find(p => p.conta === renda).por, 'Rita');
});

console.log('\n── alterar e apagar não reescrevem o histórico ──');

await prova('alterar o valor da conta não muda o que já foi pago', async () => {
  await sync.alterarContaFixa(renda, { valor: 900 });
  igual((await admin.collection('contas_fixas').getOne(renda)).valor, 900);
  const ds = await despesasDaConta(renda);
  igual(ds.every(d => d.valor === 850), true, 'as despesas antigas mudaram de valor');
});

await prova('⚠ apagar a conta NÃO apaga as despesas que a pagaram — o dinheiro saiu, e fica no envelope', async () => {
  await sync.apagarContaFixa(renda);
  await recusado(() => admin.collection('contas_fixas').getOne(renda));
  const ds = (await admin.collection('despesas').getFullList()).filter(d => d.descricao === 'Renda');
  igual(ds.length, 2);
  igual(ds.every(d => !d.conta_fixa), true, 'a relação devia ter ficado limpa');
});

console.log('\n── e nada disto atravessa casas ──');

await prova('⚠ uma adulta de outra casa não cria uma conta contra um envelope desta, nem paga uma conta desta', async () => {
  const luz = await admin.collection('contas_fixas').create({ casa: casa.id, nome: 'Luz', valor: 60, dia: 15, envelope: envelope.id });
  const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Outra', valor_ponto: 0.1 });
  await admin.collection('membros').create({
    nome: 'Vizinha', login: `${outra.id}_Vizinha`, casa: outra.id, papel: 'admin',
    email: 'viz-cf@x.pt', ...s('palavra-longa-9'), verified: true });
  const cVizinha = await telemovel('viz-cf@x.pt', 'palavra-longa-9');
  const dela = await cVizinha.collection('envelopes').create({ casa: outra.id, nome: 'Casa deles', limite_base: 100 });
  const eu = (await cVizinha.collection('membros').getFullList())[0];
  await recusado(() => cVizinha.collection('contas_fixas').create({ casa: outra.id, nome: 'Renda deles', valor: 1, dia: 1, envelope: envelope.id }));
  await recusado(() => cVizinha.collection('despesas').create({ casa: outra.id, envelope: dela.id, valor: 60, pagador: eu.id,
    conta_fixa: luz.id, idem_key: 'viz-luz' }));
  igual((await cVizinha.collection('contas_fixas').getFullList()).length, 0);
});

resumo();
