// Prova que as regras do servidor fazem o que docs/seguranca.html exige.
// Cada teste tenta o que NÃO deve ser possível e espera uma recusa.
//   node db/pocketbase/provar-regras.mjs
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, resumo } from './provas.mjs';

// Casa de provas, limpa. Só o que é das provas é apagado — o que estiver
// noutra casa fica onde está.
const { pb: admin } = await comecar();

// ── Dados de prova ───────────────────────────────────────────────────────────

const casa = await admin.collection('casas').create({
  nome: PREFIXO + 'Bengui', rendimento_mensal: 3200, valor_ponto: 0.10, dia_pagamento: 0, divide_meias: true,
});
const outraCasa = await admin.collection('casas').create({ nome: PREFIXO + 'Vizinhos', valor_ponto: 0.10 });

const membro = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome.toLowerCase()}`, casa: casa.id, papel, ...extra,
});
const rita  = await membro('Rita',  'admin',   { email: 'rita@exemplo.pt',  password: 'palavra-longa-1', passwordConfirm: 'palavra-longa-1', verified: true });
const tomas = await membro('Tomas', 'adulto',  { email: 'tomas@exemplo.pt', password: 'palavra-longa-2', passwordConfirm: 'palavra-longa-2', verified: true });
const leo   = await membro('Leo',   'crianca', { password: '135790', passwordConfirm: '135790', verified: true });

const envelope = await admin.collection('envelopes').create({ casa: casa.id, nome: 'Mercearia', limite_base: 550 });
await admin.collection('despesas').create({ casa: casa.id, envelope: envelope.id, valor: 12.5, pagador: tomas.id, descricao: 'Pão', idem_key: 'd1' });
await admin.collection('cofre_movimentos').create({ casa: casa.id, membro: leo.id, tipo: 'semanada', valor: 1.6, idem_key: 'c1' });
// ⚠ `visibilidade` e não `partilhado`. O booleano SAIU em 04/09/2026 — a app
// tem três níveis e ele só sabia dizer dois — e estas duas linhas ficaram a
// escrever um campo que já não existe. O PocketBase ignora campos que não
// conhece EM SILÊNCIO: as duas provas abaixo continuaram verdes a testar
// eventos sem visibilidade nenhuma. É a armadilha que o db/README.md nomeia.
await admin.collection('eventos').create({ casa: casa.id, dia: '2026-08-20', titulo: 'Consulta do Tomás', autor: tomas.id, visibilidade: 'so-eu' });
await admin.collection('eventos').create({ casa: casa.id, dia: '2026-08-20', titulo: 'Ballet da Mia', autor: rita.id, visibilidade: 'familia' });
// Casa vizinha, para provar o isolamento
const vizinho = await admin.collection('membros').create({
  nome: 'Estranho', login: `${outraCasa.id}_estranho`, casa: outraCasa.id, papel: 'admin',
  email: 'estranho@exemplo.pt', password: 'palavra-longa-3', passwordConfirm: 'palavra-longa-3', verified: true,
});
await admin.collection('envelopes').create({ casa: outraCasa.id, nome: 'Mercearia dos vizinhos', limite_base: 100 });

// ── Provas ───────────────────────────────────────────────────────────────────
const como = async (identidade, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(identidade, senha);
  return c;
};

console.log('\n── §3: o PIN é verificado no servidor ──');
await prova('a criança entra com o PIN certo', async () => {
  const c = await como(leo.login, '135790');
  igual(c.authStore.record.nome, 'Leo');
});
await prova('o PIN errado é recusado pelo servidor', () =>
  recusado(() => como(leo.login, '999999')));
await prova('o hash do PIN nunca chega ao cliente', async () => {
  const c = await como(leo.login, '135790');
  const r = JSON.stringify(c.authStore.record);
  if (/password|tokenKey|1357/.test(r)) throw new Error('o registo devolvido expõe segredo');
});

console.log('\n── §5: visibilidade por registo ──');
const cLeo = await como(leo.login, '135790');
const cRita = await como('rita@exemplo.pt', 'palavra-longa-1');
const cTomas = await como('tomas@exemplo.pt', 'palavra-longa-2');
const cVizinho = await como('estranho@exemplo.pt', 'palavra-longa-3');

await prova('orçamento AUSENTE da resposta a uma criança', async () =>
  igual((await cLeo.collection('envelopes').getFullList()).length, 0));
await prova('despesas AUSENTES da resposta a uma criança', async () =>
  igual((await cLeo.collection('despesas').getFullList()).length, 0));
await prova('o adulto vê o orçamento', async () =>
  igual((await cRita.collection('envelopes').getFullList()).length, 1));

await prova('evento privado do Tomás não chega à Rita', async () => {
  const evs = await cRita.collection('eventos').getFullList();
  igual(evs.length, 1, evs.map(e => e.titulo).join('/'));
  igual(evs[0].titulo, 'Ballet da Mia');
});
await prova('o próprio autor vê o seu evento privado', async () => {
  const evs = await cTomas.collection('eventos').getFullList();
  // O dele («so-eu», de que é autor) e o da família. Dois.
  igual(evs.length, 2, evs.map(e => e.titulo).join('/'));
  if (!evs.some(e => e.titulo === 'Consulta do Tomás')) throw new Error('não vê o seu');
});

await prova('a criança vê o SEU cofre', async () =>
  igual((await cLeo.collection('cofre_movimentos').getFullList()).length, 1));

console.log('\n── isolamento entre casas ──');
await prova('a casa vizinha não vê nada desta', async () => {
  igual((await cVizinho.collection('envelopes').getFullList()).length, 1, 'só o dela');
  igual((await cVizinho.collection('membros').getFullList()).length, 1);
});

console.log('\n── INVARIANTE #2: o cofre é de inserções ──');
const mov = (await cRita.collection('cofre_movimentos').getFullList())[0];
await prova('nem um adulto edita um movimento', () =>
  recusado(() => cRita.collection('cofre_movimentos').update(mov.id, { valor: 999 })));
await prova('nem um adulto apaga um movimento', () =>
  recusado(() => cRita.collection('cofre_movimentos').delete(mov.id)));
await prova('a criança não credita o próprio cofre', () =>
  recusado(() => cLeo.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 100, idem_key: 'batota' })));
await prova('o adulto credita o cofre da criança', async () => {
  const m = await cRita.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 1, idem_key: 'b' + Date.now() });
  if (!m.id) throw new Error('não criou');
});

console.log('\n── §6: idempotência ──');
await prova('a mesma chave duas vezes não duplica', async () => {
  const k = 'repetida-' + Date.now();
  await cRita.collection('cofre_movimentos').create({ casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 5, idem_key: k });
  await recusado(() => cRita.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 5, idem_key: k }));
});

console.log('\n── quem acrescenta e tira membros da casa ──');
// A regra de criação era `null` — só superutilizador. Isso impedia a app de
// ter um ecrã de membros: quem administra a casa não conseguia acrescentar
// nem a própria filha. Passou a admin-da-mesma-casa, e estas provas são o que
// impede que «admin da mesma casa» se transforme em «qualquer um» sem se dar
// por isso.
await prova('a administração acrescenta um membro à sua casa', async () => {
  const m = await cRita.collection('membros').create({
    nome: 'Mia', login: `${casa.id}_mia`, casa: casa.id, papel: 'crianca',
    password: '247015', passwordConfirm: '247015', fem: true,
  });
  igual(m.nome, 'Mia');
  await admin.collection('membros').delete(m.id);
});
await prova('um adulto que não administra NÃO acrescenta', () =>
  recusado(() => cTomas.collection('membros').create({
    nome: 'Intruso', login: `${casa.id}_intruso`, casa: casa.id, papel: 'adulto',
    email: 'intruso@exemplo.pt', password: 'palavra-longa-9', passwordConfirm: 'palavra-longa-9' })));
await prova('uma criança NÃO acrescenta', () =>
  recusado(() => cLeo.collection('membros').create({
    nome: 'Amigo', login: `${casa.id}_amigo`, casa: casa.id, papel: 'crianca',
    password: '975318', passwordConfirm: '975318' })));
await prova('a administração de outra casa NÃO acrescenta a esta', () =>
  recusado(() => cVizinho.collection('membros').create({
    nome: 'Cavalo', login: `${casa.id}_cavalo`, casa: casa.id, papel: 'adulto',
    email: 'cavalo@exemplo.pt', password: 'palavra-longa-8', passwordConfirm: 'palavra-longa-8' })));
await prova('o género gramatical é do membro, e vem do servidor', async () => {
  const m = await cRita.collection('membros').create({
    nome: 'Ana', login: `${casa.id}_ana`, casa: casa.id, papel: 'crianca',
    password: '864213', passwordConfirm: '864213', fem: true,
  });
  const lido = await cRita.collection('membros').getOne(m.id);
  igual(lido.fem, true, 'o campo não voltou como foi gravado');
  await admin.collection('membros').delete(m.id);
});

console.log('\n── §4: autorização por operação ──');
await prova('só a administração mexe nos envelopes', () =>
  recusado(() => cTomas.collection('envelopes').update(envelope.id, { limite_base: 9999 })));
await prova('a administração mexe nos envelopes', async () => {
  await cRita.collection('envelopes').update(envelope.id, { limite_base: 600 });
});
await prova('uma despesa não pode ter uma criança como pagador', () =>
  recusado(() => cRita.collection('despesas').create({
    casa: casa.id, envelope: envelope.id, valor: 5, pagador: leo.id, idem_key: 'x' + Date.now() })));
await prova('uma despesa não se edita — anula-se', () =>
  recusado(async () => {
    const d = (await cRita.collection('despesas').getFullList())[0];
    await cRita.collection('despesas').update(d.id, { valor: 1 });
  }));

console.log('\n── nenhuma coleção fica sem vínculo à sessão ──');
// O db/postgres/README.md dizia «toda a tabela tem casa_id, sem exceção». Não
// era verdade — `casas` é a própria casa, e `preferencias` prende-se ao membro,
// que é mais apertado. O que se verifica sem exceção é isto: nenhuma regra está
// aberta, e cada uma prende-se a alguma coisa que vem da sessão.
await prova('nenhuma regra aberta a quem não tem sessão', async () => {
  const cs = (await admin.collections.getFullList())
    .filter(c => !c.name.startsWith('_') && c.name !== 'users');
  const abertas = [];
  for (const c of cs) {
    for (const [k, v] of Object.entries({
      list: c.listRule, view: c.viewRule, create: c.createRule,
      update: c.updateRule, delete: c.deleteRule,
    })) {
      // '' = qualquer um, mesmo sem autenticação. null = só superutilizador.
      if (v === '') abertas.push(`${c.name}.${k}`);
    }
  }
  igual(abertas.length, 0, abertas.join(', '));
});
await prova('toda a coleção legível se prende a @request.auth', async () => {
  const cs = (await admin.collections.getFullList())
    .filter(c => !c.name.startsWith('_') && c.name !== 'users');
  const soltas = cs.filter(c => c.listRule !== null && !c.listRule.includes('@request.auth'));
  igual(soltas.length, 0, soltas.map(c => c.name).join(', '));
});

console.log('\n── as vistas: o saldo é uma soma do servidor ──');
await prova('o cofre soma os movimentos, e não há campo que o escreva', async () => {
  const antes = (await cRita.collection('v_cofre_saldo').getFullList()).find(v => v.membro === leo.id);
  await cRita.collection('cofre_movimentos').create({
    casa: casa.id, membro: leo.id, tipo: 'bonus', valor: 2.5, idem_key: 'v' + Date.now() });
  const depois = (await cRita.collection('v_cofre_saldo').getFullList()).find(v => v.membro === leo.id);
  igual(Math.round((depois.saldo - antes.saldo) * 100) / 100, 2.5, 'a soma não acompanhou o movimento');
});
await prova('uma vista não tem escrita — nem para a administração', () =>
  recusado(() => cRita.collection('v_cofre_saldo').create({ membro: leo.id, saldo: 9999 })));
await prova('a criança vê o SEU saldo e mais nenhum', async () => {
  const v = await cLeo.collection('v_cofre_saldo').getFullList();
  igual(v.length, 1);
  igual(v[0].membro, leo.id);
});
await prova('o gasto por envelope vem calculado', async () => {
  const g = (await cRita.collection('v_envelope_gasto').getFullList())[0];
  if (typeof g.gasto !== 'number') throw new Error('a vista não devolveu um número');
});
await prova('as contas entre adultos são invisíveis à criança', async () =>
  igual((await cLeo.collection('v_acerto_saldo').getFullList()).length, 0));

resumo();
