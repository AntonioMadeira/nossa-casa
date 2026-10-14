// A §5 chama à visibilidade das fichas de saúde «a regra mais restritiva do
// sistema, e a que mais tem de ser testada». É o que este ficheiro faz.
//
//   ficha de ADULTO   → só o próprio. Nem o companheiro, nem a administração.
//   ficha de CRIANÇA  → os adultos da casa; a criança lê a sua, não a escreve.
//
//   node db/pocketbase/provar-saude.mjs
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, recusado, resumo } from './provas.mjs';

// Casa de provas, limpa. Só o que é das provas é apagado — o que estiver
// noutra casa fica onde está.
const { pb: admin } = await comecar();

const como = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};

const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Bengui', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, ...extra,
});
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('rita',  'admin',   { email: 'rita@x.pt',  ...s('palavra-longa-1'), verified: true });
const tomas = await mk('tomas', 'adulto',  { email: 'tomas@x.pt', ...s('palavra-longa-2'), verified: true });
const leo   = await mk('leo',   'crianca', { ...s('135790'), verified: true });

const ep = (membro, especialidade) => admin.collection('episodios_saude').create({
  casa: casa.id, membro, especialidade, dia: '2026-08-28', medico: 'Dr. Cardoso',
});
const epRita  = await ep(rita.id,  'Medicina geral');
const epTomas = await ep(tomas.id, 'Dermatologia');
const epLeo   = await ep(leo.id,   'Pediatria');
await admin.collection('anexos').create({ casa: casa.id, episodio: epTomas.id, titulo: 'Análises do Tomás', tipo: 'exame' });
await admin.collection('anexos').create({ casa: casa.id, episodio: epLeo.id, titulo: 'Análises do Léo', tipo: 'exame' });

const cRita  = await como('rita@x.pt',  'palavra-longa-1');
const cTomas = await como('tomas@x.pt', 'palavra-longa-2');
const cLeo   = await como(leo.login, '135790');

console.log('\n── a ficha de um adulto é só dele ──');
await prova('a Rita (administradora) NÃO vê a ficha do Tomás', async () => {
  const v = await cRita.collection('episodios_saude').getFullList();
  const dele = v.filter(x => x.membro === tomas.id);
  igual(dele.length, 0, v.map(x => x.especialidade).join('/'));
});
await prova('nem por acesso direto ao registo', () =>
  recusado(() => cRita.collection('episodios_saude').getOne(epTomas.id)));
await prova('o Tomás vê a sua', async () => {
  const v = await cTomas.collection('episodios_saude').getFullList();
  if (!v.some(x => x.membro === tomas.id)) throw new Error('não vê a própria ficha');
});
await prova('o Tomás NÃO vê a da Rita', async () => {
  const v = await cTomas.collection('episodios_saude').getFullList();
  igual(v.filter(x => x.membro === rita.id).length, 0);
});

console.log('\n── a ficha de uma criança é dos adultos ──');
await prova('a Rita vê a ficha do Léo', async () => {
  const v = await cRita.collection('episodios_saude').getFullList();
  if (!v.some(x => x.membro === leo.id)) throw new Error('não vê a ficha da criança');
});
await prova('o Tomás também', async () => {
  const v = await cTomas.collection('episodios_saude').getFullList();
  if (!v.some(x => x.membro === leo.id)) throw new Error('não vê a ficha da criança');
});
// ⚠ Esta prova exigia o CONTRÁRIO — «o Léo lê a sua», com `igual(v.length, 1)`.
// E era uma divergência de três pontas: o `podeVerSaude` do cliente diz que uma
// criança não lê a sua ficha, o ecrã da Saúde promete «invisíveis às próprias»
// em letras, e esta regra devolvia-a.
//
// O que decide não é a contagem de dois contra um: o INVARIANTE #3 diz que o
// dado não pode CHEGAR ao dispositivo. O telemóvel do Léo recebia a ficha dele
// e era só a interface a esconder-lha — a forma de falha que aquele invariante
// existe para impedir. Corrigido no servidor em 03/09/2026, por decisão do dono
// da casa.
//
// Note a prova de baixo, «e ele continua a ver a sua»: no dia em que o Léo
// passa a adulto, passa a ver. Não é o mesmo dado a mudar de regra — é a regra
// a ler o papel a cada consulta.
await prova('o Léo NÃO lê a sua própria ficha', async () => {
  const v = await cLeo.collection('episodios_saude').getFullList();
  igual(v.length, 0, v.map(x => x.especialidade).join('/'));
});
await prova('nem por acesso direto ao registo dele', async () => {
  // A lista pode filtrar e o `view` não: são duas regras, e ambas têm de
  // recusar. É o mesmo par que apanhou o caso da Rita e do Tomás mais acima.
  await recusado(() => cLeo.collection('episodios_saude').getOne(epLeo.id));
});
await prova('o Léo NÃO vê a de nenhum adulto', async () => {
  const v = await cLeo.collection('episodios_saude').getFullList();
  igual(v.filter(x => x.membro !== leo.id).length, 0);
});
await prova('o Léo não escreve na sua própria ficha', () =>
  recusado(() => cLeo.collection('episodios_saude').create({
    casa: casa.id, membro: leo.id, especialidade: 'Inventada', dia: '2026-09-01' })));
await prova('o Léo não apaga a sua própria ficha', () =>
  recusado(() => cLeo.collection('episodios_saude').delete(epLeo.id)));

// ── ⚠ Apagar uma consulta ────────────────────────────────────────────────────
//
// A app ganhou o botão em 06/09/2026 — antes disso o `healthGone` era lido a
// cada leitura de fichas e ninguém lhe escrevia: a maquinaria estava montada e
// sem porta. A porta abre-se aqui, e a regra que a tranca é esta.
//
// A `deleteRule` já existia desde 03/09; o que não existia era medi-la para os
// ADULTOS. A do Léo estava provada, e é a mais fácil das três.
await prova('⚠ um adulto NÃO apaga a consulta do outro adulto', async () => {
  await recusado(() => cRita.collection('episodios_saude').delete(epTomas.id));
  // E continua lá — medido pelo dono, que é quem a pode ver.
  await cTomas.collection('episodios_saude').getOne(epTomas.id);
});

await prova('um adulto apaga a SUA', async () => {
  const meu = await admin.collection('episodios_saude').create({
    casa: casa.id, membro: rita.id, especialidade: 'A apagar', dia: '2026-09-20' });
  await cRita.collection('episodios_saude').delete(meu.id);
  await recusado(() => admin.collection('episodios_saude').getOne(meu.id));
});

await prova('e a de uma criança da casa', async () => {
  const doLeo = await admin.collection('episodios_saude').create({
    casa: casa.id, membro: leo.id, especialidade: 'A apagar', dia: '2026-09-21' });
  await cRita.collection('episodios_saude').delete(doLeo.id);
  await recusado(() => admin.collection('episodios_saude').getOne(doLeo.id));
});

console.log('\n── os anexos herdam a regra do episódio ──');
await prova('a Rita não vê o anexo do Tomás', async () => {
  const a = await cRita.collection('anexos').getFullList();
  igual(a.filter(x => x.episodio === epTomas.id).length, 0, a.map(x => x.titulo).join('/'));
});
await prova('a Rita vê o anexo do Léo', async () => {
  const a = await cRita.collection('anexos').getFullList();
  if (!a.some(x => x.episodio === epLeo.id)) throw new Error('não vê o anexo da criança');
});
// Os anexos herdam pelo episódio, portanto herdam também a correção: se o Léo
// não lê a ficha, não lê o que está pendurado nela. Esta prova exigia
// `igual(a.length, 1)` — «vê o seu anexo e mais nenhum».
await prova('o Léo não vê anexo nenhum, nem o seu', async () => {
  const a = await cLeo.collection('anexos').getFullList();
  igual(a.length, 0, a.map(x => x.titulo).join('/'));
});

console.log('\n── §5: a transição de papel reavalia RETROATIVAMENTE ──');
await prova('o Léo a passar a adulto tira a ficha da vista dos pais', async () => {
  // A ficha continua a mesma; muda só o papel do dono.
  await admin.collection('membros').update(leo.id, { papel: 'adulto', email: 'leo@x.pt' });
  const v = await cRita.collection('episodios_saude').getFullList();
  igual(v.filter(x => x.membro === leo.id).length, 0, 'a ficha ainda é visível aos pais');
  const a = await cRita.collection('anexos').getFullList();
  igual(a.filter(x => x.episodio === epLeo.id).length, 0, 'o anexo ainda é visível');
});
await prova('e ele continua a ver a sua', async () => {
  const c = await como('leo@x.pt', '135790');
  igual((await c.collection('episodios_saude').getFullList()).length, 1);
});

resumo();
