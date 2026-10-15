// Apagar os dados de uma casa — o que NÃO pode acontecer.
//
// É a operação mais destrutiva desta app. A app exige por cima dela a
// confirmação de todos os administradores, mas isso é a regra da INTERFACE, e
// uma regra de interface não é uma regra: basta uma consola aberta. O que estas
// provas verificam é o que não se contorna.
//
//   node db/pocketbase/provar-limpar-casa.mjs
import PocketBase from 'pocketbase';
import { URL, comecar, criarCasa, criarMembro, prova, resumo } from './provas.mjs';

const chamar = async (token) => {
  const r = await fetch(`${URL}/api/casa/limpar`, {
    method: 'POST',
    headers: token ? { Authorization: token } : {},
  });
  return { estado: r.status, corpo: await r.text() };
};

const { pb: admin } = await comecar();

// ── Duas casas, para provar que uma não alcança a outra ─────────────────────
const casaA = await criarCasa(admin, 'limpar-A');
const casaB = await criarCasa(admin, 'limpar-B');

const senha = (n) => ({ password: `palavra-de-provas-${n}`, passwordConfirm: `palavra-de-provas-${n}` });

const adminA = await criarMembro(admin, casaA, 'Rita', 'admin',
  { email: 'rita.limpar@exemplo.pt', ...senha(1), verified: true });
const adultoA = await criarMembro(admin, casaA, 'Tomás', 'adulto',
  { email: 'tomas.limpar@exemplo.pt', ...senha(2), verified: true });
// O PIN de uma criança tem de ter 4 dígitos — um hook do servidor exige-o, e a
// primeira versão desta prova ignorava-o. A regra é boa; a prova é que estava
// a inventar um membro que a casa não aceitaria.
const PIN_DO_LEO = '473190';
const criancaA = await criarMembro(admin, casaA, 'Léo', 'crianca',
  { password: PIN_DO_LEO, passwordConfirm: PIN_DO_LEO, verified: true });
const adminB = await criarMembro(admin, casaB, 'Sofia', 'admin',
  { email: 'sofia.limpar@exemplo.pt', ...senha(4), verified: true });

// ── Dados nas duas casas ────────────────────────────────────────────────────
const semear = async (casa, dono) => {
  const feitos = {};
  const tenta = async (colecao, dados) => {
    try { feitos[colecao] = (await admin.collection(colecao).create({ casa: casa.id, ...dados })).id; }
    catch (e) { /* coleção com outra forma neste servidor */ }
  };
  await tenta('eventos', { titulo: 'Almoço', dia: '2026-09-06', criado_por: dono.id, visibilidade: 'familia' });
  await tenta('tarefas', { titulo: 'Lixo', pontos: 3, urgencia: 1 });
  await tenta('envelopes', { nome: 'Mercearia', limite: 550 });
  await tenta('lojas', { nome: 'Continente' });
  await tenta('especialidades', { nome: 'Dentista' });
  // As que ficavam para trás: não cascateiam da casa nem dos membros.
  await tenta('contas_fixas', { nome: 'Renda', valor: 850, dia: 1 });
  await tenta('seccoes', { nome: 'Frescos', posto: 1 });
  await tenta('pratos', { nome: 'Sopa', ingredientes: [] });
  await tenta('metas', { nome: 'Férias', alvo: 1000 });
  await tenta('registo', { texto: 'uma linha do registo' });

  // ⚠ E SAÚDE, que faltava. Esta prova semeava cinco coleções e nenhuma delas
  // era de saúde — portanto media «a casa esvazia-se» olhando só para onde já
  // sabia que ia olhar. Foi assim que as ALERGIAS ficaram para trás no
  // «Começar de Zero» até 29/09/2026, sem ninguém dar por isso: as notas, as
  // receitas, as decisões e os anexos cascateiam do episódio, e as tomas da
  // receita, mas as alergias apontam para a `casa` e para o `membro` — e o
  // «Começar de Zero» não apaga nenhum dos dois.
  await tenta('episodios_saude', {
    membro: dono.id, especialidade: 'Pediatria', medico: 'Dra. Prova',
    dia: '2026-09-20 10:00:00', notas: 'NOTAS CLINICAS',
  });
  if (feitos.episodios_saude) {
    await tenta('notas_saude', { episodio: feitos.episodios_saude, autor: dono.id, texto: 'uma nota' });
    await tenta('receitas_saude', { episodio: feitos.episodios_saude, nome: 'Ferro' });
  }
  await tenta('alergias_saude', { membro: dono.id, nome: 'amendoim', gravidade: 'grave' });

  return feitos;
};
const dadosA = await semear(casaA, adminA);
const dadosB = await semear(casaB, adminB);

const quantos = async (casa) => {
  let n = 0;
  // ⚠ As de saúde contam-se TODAS, e pelo nome. Uma que não esteja aqui é uma
  // que pode sobreviver ao «Começar de Zero» sem esta prova reparar.
  for (const c of ['eventos', 'tarefas', 'envelopes', 'lojas', 'especialidades',
    'episodios_saude', 'notas_saude', 'receitas_saude', 'decisoes_saude',
    'tomas_saude', 'alergias_saude', 'anexos',
    'contas_fixas', 'seccoes', 'pratos', 'metas', 'registo', 'contratos', 'ementa',
    'meta_movimentos', 'objetivos_cofre', 'trocas_tarefas', 'partilhas_lista']) {
    try {
      n += (await admin.collection(c).getFullList({ filter: `casa = "${casa.id}"` })).length;
    } catch (e) { /* segue */ }
  }
  return n;
};

const entrar = async (email, n) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(email, `palavra-de-provas-${n}`);
  return c;
};
const comoAdminA = await entrar('rita.limpar@exemplo.pt', 1);
const comoAdultoA = await entrar('tomas.limpar@exemplo.pt', 2);
const comoAdminB = await entrar('sofia.limpar@exemplo.pt', 4);

console.log('\n── quem NÃO pode apagar a casa ──');

await prova('sem sessão, recusa', async () => {
  const r = await chamar();
  if (r.estado !== 401) throw new Error(`devolveu ${r.estado}, esperava 401`);
});

await prova('um ADULTO da casa não é administrador, e recusa', async () => {
  const r = await chamar(comoAdultoA.authStore.token);
  if (r.estado !== 403) throw new Error(`devolveu ${r.estado}, esperava 403`);
  if (await quantos(casaA) === 0) throw new Error('apagou mesmo assim');
});

await prova('uma CRIANÇA não apaga a casa', async () => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  // As crianças entram pelo `login`, não por e-mail: não têm conta própria (§8).
  await c.collection('membros').authWithPassword(criancaA.login, PIN_DO_LEO);
  const r = await chamar(c.authStore.token);
  if (r.estado === 200) throw new Error('a criança apagou a casa');
  if (await quantos(casaA) === 0) throw new Error('apagou mesmo assim');
});

await prova('⚠ o administrador da casa B não toca na casa A', async () => {
  // O caso que mais importa: o `casa` vem do MEMBRO autenticado, não do
  // pedido. Se viesse do pedido, bastava mudar um campo no corpo.
  const antesA = await quantos(casaA);
  if (!antesA) throw new Error('a casa A já estava vazia — a prova não prova nada');
  const r = await chamar(comoAdminB.authStore.token);
  if (r.estado !== 200) throw new Error(`o admin da B devia poder limpar a SUA casa: ${r.estado}`);
  const depoisA = await quantos(casaA);
  if (depoisA !== antesA) throw new Error(`a casa A perdeu ${antesA - depoisA} linhas`);
  if (await quantos(casaB) !== 0) throw new Error('a casa B não foi limpa');
});

console.log('\n── o que o administrador da própria casa faz ──');

await prova('apaga os dados da sua casa', async () => {
  const antes = await quantos(casaA);
  if (!antes) throw new Error('sem dados para apagar — a prova não prova nada');
  const r = await chamar(comoAdminA.authStore.token);
  if (r.estado !== 200) throw new Error(`devolveu ${r.estado}: ${r.corpo.slice(0, 120)}`);
  if (await quantos(casaA) !== 0) throw new Error('ficaram linhas por apagar');
});

await prova('e diz o que apagou, coleção a coleção', async () => {
  // Uma operação destas não responde «pronto»: quem a pediu tem de poder ver
  // que o que saiu foi o que esperava.
  await semear(casaA, adminA);
  const r = await chamar(comoAdminA.authStore.token);
  const d = JSON.parse(r.corpo);
  if (typeof d.total !== 'number' || d.total < 1) throw new Error(`total: ${d.total}`);
  if (!d.apagadas || !Object.keys(d.apagadas).length) throw new Error('não disse quais');
});

console.log('\n── o que TEM de sobreviver ──');

await prova('a casa continua a existir', async () => {
  const c = await admin.collection('casas').getOne(casaA.id);
  if (!c || !c.id) throw new Error('a casa desapareceu');
});

await prova('os membros continuam lá, com os seus papéis', async () => {
  // «Começar de zero» é recomeçar a vida da família, não dissolver a família.
  const ms = await admin.collection('membros').getFullList({ filter: `casa = "${casaA.id}"` });
  const porNome = Object.fromEntries(ms.map(m => [m.nome, m.papel]));
  for (const [nome, papel] of [['Rita', 'admin'], ['Tomás', 'adulto'], ['Léo', 'crianca']]) {
    if (porNome[nome] !== papel) throw new Error(`${nome} devia ser ${papel} e é ${porNome[nome]}`);
  }
});

await prova('a autorização da agenda não é tocada', async () => {
  // É a autorização da agenda de uma PESSOA, não um dado desta casa. Apagá-la
  // obrigaria a religar a Google por causa de uma limpeza de dados.
  await admin.collection('credenciais_agenda').create({ membro: adminA.id, refresh_token: 'fica' })
    .catch(() => {});
  await chamar(comoAdminA.authStore.token);
  const linhas = await admin.collection('credenciais_agenda')
    .getFullList({ filter: `membro = "${adminA.id}"` });
  if (!linhas.length || !linhas[0].refresh_token) throw new Error('a autorização foi apagada');
});

// Limpeza do que estas provas criaram fora das casas.
for (const m of [adminA.id, adultoA.id, criancaA.id, adminB.id]) {
  const linhas = await admin.collection('credenciais_agenda')
    .getFullList({ filter: `membro = "${m}"` }).catch(() => []);
  for (const l of linhas) await admin.collection('credenciais_agenda').delete(l.id).catch(() => {});
}

resumo();
