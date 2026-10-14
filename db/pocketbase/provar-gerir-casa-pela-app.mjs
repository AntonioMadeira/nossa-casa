// As quatro operações, pela camada que a app usa — não pelo SDK.
//
// `provar-gerir-casa.mjs` fala com o servidor diretamente e prova que ele
// decide bem quem pode o quê. Isto prova outra coisa, e é a que faltou
// descobrir-se sozinha: que `src/sync.js` manda os campos certos.
//
// É aqui que os defeitos se escondem, e já se esconderam duas vezes. O
// PocketBase ignora campos que não conhece EM SILÊNCIO — escrevi `descricao`
// por `motivo` e a escrita passou com os dados a cair — e recusa `verified`
// com «Values don't match», que não diz uma palavra sobre o campo que o
// causou. Nenhuma leitura de código apanha nem um nem outro.
//
//   node db/pocketbase/provar-gerir-casa-pela-app.mjs
import { URL, PREFIXO, comecar, criarCasa, criarMembro, prova, igual, resumo } from './provas.mjs';

// A camada da app lê o servidor do ambiente, tal como no telemóvel.
process.env.EXPO_PUBLIC_PB_URL = URL;
const servidor = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

// Fora do React Native não há AsyncStorage. O módulo prevê-o — é o mesmo
// gancho que provar-cliente.mjs usa — e um Map chega para uma sessão.
const memoria = new Map();
servidor.configurar({
  url: URL,
  // Assíncronas: o AsyncAuthStore encadeia o que `setItem` devolve, e com
  // uma versão síncrona rebenta a guardar a sessão. É a mesma forma que o
  // provar-cliente.mjs usa.
  storage: {
    getItem: async (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: async (k, v) => { memoria.set(k, v); },
    removeItem: async (k) => { memoria.delete(k); },
  },
});

const { pb: admin } = await comecar();
const casa = await criarCasa(admin, 'Sousa');
await criarMembro(admin, casa, 'Ana', 'admin', {
  email: 'ana@exemplo.pt', password: 'palavra-longa-1', passwordConfirm: 'palavra-longa-1',
  verified: true, fem: true });
await criarMembro(admin, casa, 'Bruno', 'adulto', {
  email: 'bruno@exemplo.pt', password: 'palavra-longa-2', passwordConfirm: 'palavra-longa-2',
  verified: true });

const recusa = async (o_que, fn) => {
  let passou = false;
  try { await fn(); passou = true; } catch { /* recusado, como devia */ }
  if (passou) throw new Error(`${o_que} PASSOU, e não devia`);
};

// Entrar como a Ana, pela mesma porta que o ecrã de entrada usa.
await servidor.auth.entrarAdulto('ana@exemplo.pt', 'palavra-longa-1');

console.log('\n── a camada da app fala com o servidor ──');

await prova('a sessão sabe quem entrou e em que casa', () => {
  const ses = sync.sessao();
  igual(ses.nome, 'Ana');
  igual(ses.casa, casa.id);
});

await prova('renomearCasa muda o nome, e o nome muda mesmo', async () => {
  await sync.renomearCasa(casa.id, PREFIXO + 'Sousa-Pinto');
  igual((await admin.collection('casas').getOne(casa.id)).nome, PREFIXO + 'Sousa-Pinto');
});

let dina = null;
await prova('acrescentarMembro cria uma criança, com todos os campos no sítio', async () => {
  dina = await sync.acrescentarMembro({
    casa: casa.id, nome: 'Dina', papel: 'crianca', pin: '369152', fem: true,
  });
  const lida = await admin.collection('membros').getOne(dina.id);
  // Um a um: é assim que se apanha um campo ignorado em silêncio.
  igual(lida.nome, 'Dina');
  igual(lida.papel, 'crianca');
  igual(lida.fem, true);
  igual(lida.casa, casa.id);
  igual(lida.email, '', 'uma criança não leva e-mail');
});

await prova('e a criança entra com o PIN que lhe foi dado', async () => {
  const c = await import('pocketbase');
  const cliente = new (c.default)(URL);
  await cliente.collection('membros').authWithPassword(`${casa.id}_dina`, '369152');
  igual(cliente.authStore.record.nome, 'Dina');
});

let eva = null;
await prova('acrescentarMembro cria um adulto, com e-mail e palavra-passe', async () => {
  eva = await sync.acrescentarMembro({
    casa: casa.id, nome: 'Eva', papel: 'adulto', email: 'eva@exemplo.pt',
    palavraPasse: 'palavra-longa-3', fem: true,
  });
  const lida = await admin.collection('membros').getOne(eva.id);
  igual(lida.papel, 'adulto');
  igual(lida.email, 'eva@exemplo.pt');
});

await prova('editarMembro grava o papel e a concordância', async () => {
  await sync.editarMembro(eva.id, { papel: 'admin', fem: true });
  const lida = await admin.collection('membros').getOne(eva.id);
  igual(lida.papel, 'admin');
  igual(lida.fem, true);
});

// O renomear é a operação mais invasiva: no servidor são dois campos, e na
// loja local é uma migração de todo o estado gravado. A parte local está
// provada em __tests__/renomear-membro.test.js, com uma sonda que anda pelo
// estado todo; aqui prova-se que os dois campos chegam ao servidor.
await prova('renomear muda o nome E o login, pela camada da app', async () => {
  await sync.editarMembro(dina.id, {
    nome: 'Diana', login: `${casa.id}_diana`,
  });
  const lida = await admin.collection('membros').getOne(dina.id);
  igual(lida.nome, 'Diana');
  igual(lida.login, `${casa.id}_diana`);
  igual(lida.id, dina.id, 'o identificador não muda com o nome');
});

await prova('e a criança renomeada entra com o login novo', async () => {
  const c = await import('pocketbase');
  const cliente = new (c.default)(URL);
  await cliente.collection('membros').authWithPassword(`${casa.id}_diana`, '369152');
  igual(cliente.authStore.record.nome, 'Diana');
});

await prova('removerMembro tira da casa quem não tem histórico', async () => {
  await sync.removerMembro(dina.id);
  await recusa('ler quem já saiu', () => admin.collection('membros').getOne(dina.id));
});

// As recusas do servidor têm de CHEGAR à app como erros, não como silêncio.
// Uma escrita que falha e não se queixa é pior do que uma que rebenta.
console.log('\n── e as recusas chegam cá acima ──');

await prova('acrescentar um nome que já existe rebenta, não passa em silêncio', () =>
  recusa('repetir o nome', () => sync.acrescentarMembro({
    casa: casa.id, nome: 'Ana', papel: 'crianca', pin: '582714' })));

await prova('um PIN óbvio é recusado pelo servidor, não só pelo ecrã', () =>
  recusa('PIN de quatro iguais', () => sync.acrescentarMembro({
    casa: casa.id, nome: 'Filipa', papel: 'crianca', pin: '111111' })));

await prova('tirar a última administração rebenta', async () => {
  // A Eva passou a admin acima; volta a adulto para a Ana ficar sozinha
  await sync.editarMembro(eva.id, { papel: 'adulto' });
  await recusa('remover a última administração', () =>
    sync.removerMembro(sync.sessao().membro));
});

// A guarda que decide pelo ENDEREÇO.
console.log('\n── a saúde só sai para um servidor de casa ──');

// ⚠ Esta prova exigia que o `recusaSaude` rebentasse SEMPRE. Deixou de o
// fazer em 03/09/2026: o travão passou a ser uma condição, porque a decisão do
// dono da casa foi condicional — «o servidor fica na minha máquina por agora».
// Ver `src/endereco.js` e `provar-saude-sobe.mjs`.
//
// Este script corre contra a casa de provas, em 127.0.0.1, portanto aqui o
// travão DEIXA passar — e é o que se prova. Que ele recusa quando o servidor
// está na internet prova-se no `provar-saude-sobe.mjs`, que é o sítio onde se
// pode trocar o endereço.
await prova('com o servidor em casa, a saúde passa a guarda', () => {
  igual(sync.saudeSincroniza(), true, 'a casa de provas corre em 127.0.0.1');
  for (const c of ['episodios_saude', 'anexos']) {
    igual(sync.recusaSaude(c), c, `${c} devia passar com o servidor em casa`);
  }
  igual(sync.recusaSaude('despesas'), 'despesas', 'o resto passa sempre');
});

await prova('⚠ e um endereço da internet NÃO a fecha — a decisão é que manda', () => {
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
  servidor.configurar({ url: foraDeCasa });
  igual(sync.saudeSincroniza(), true, 'a saúde fechou-se num endereço da internet');
  for (const c of ['episodios_saude', 'anexos']) {
    try { sync.recusaSaude(c); } catch (e) { throw new Error(`${c} foi recusada: ${e.message}`); }
  }
  servidor.configurar({ url: URL });        // devolver ao que estava
});

resumo();
