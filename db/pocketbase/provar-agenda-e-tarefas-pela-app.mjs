// Dois telemóveis vêem as mesmas tarefas e a mesma agenda — pelo CLIENTE a
// sério, não por chamadas escritas à mão.
//
//   node db/pocketbase/provar-agenda-e-tarefas-pela-app.mjs
//
// ── O que só isto prova ──────────────────────────────────────────────────────
//
// O `provar-agenda-e-tarefas.mjs` prova as REGRAS: quem vê, quem escreve, o
// índice único. Fá-lo com chamadas escritas à mão, e portanto não passa pelo
// `src/sync.js` — que é onde vive a tradução entre a loja e as coleções.
//
// É aí que este género de defeito mora: um campo com o nome errado. O
// PocketBase ignora campos que não conhece EM SILÊNCIO — `title` em vez de
// `titulo`, `who` em vez de `atribuido_a`, `tag` em vez de `etiqueta`. A
// escrita passa, o servidor responde 200, e o dado cai. Já aconteceu duas
// vezes neste projeto: com o `medico` e as `notas` de uma consulta, e com as
// despesas.
//
// Por isso isto escreve pelo `sync.js`, lê pelo `sync.js`, e confere o que
// chegou ao outro lado campo a campo.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, igual, comId, resumo, memoriaDeTelemovel } from './provas.mjs';

const { configurar, auth } = await import('../../src/pocketbase.js');
const sync = await import('../../src/sync.js');

configurar({ url: URL, storage: memoriaDeTelemovel() });

// ── A casa ───────────────────────────────────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Bengui', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const s = (p) => ({ password: p, passwordConfirm: p });

const rita  = await mk('Rita',  'admin',   { email: 'rita@x.pt',  ...s('palavra-longa-1') });
const tomas = await mk('Tomas', 'adulto',  { email: 'tomas@x.pt', ...s('palavra-longa-2') });
const leo   = await mk('Leo',   'crianca', { ...s('135790') });

// ⚠ O `sync.sessao()` devolve o membro autenticado; para saber o `casa` e o
// `membro` é preciso entrar de verdade.
await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
const daRita = sync.sessao();
if (!daRita) throw new Error('a sessão da Rita não abriu');

// Um segundo telemóvel: o do Tomás, com o seu próprio cliente.
const outroTelemovel = async (email, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(email, senha);
  return c;
};
const doTomas = await outroTelemovel('tomas@x.pt', 'palavra-longa-2');

// ═════════════════════════════════════════════════════════════════════════════
// 1. UMA TAREFA CRIADA NUM TELEMÓVEL APARECE NO OUTRO
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── uma tarefa criada num telemóvel aparece no outro ──');

let idDaTarefa = null;
await prova('a Rita cria uma tarefa, e o servidor devolve o id', async () => {
  const r = await comId(sync.tarefaDaCasa({
    casa: daRita.casa, titulo: 'Pôr a mesa', atribuidoA: leo.id,
    recorrencia: 'Todos os dias', pontos: 3, urgencia: 0, prazo: 'd2026-09-25',
  }), 'tarefaDaCasa');
  idDaTarefa = r.id;
});

await prova('⚠ e TODOS os campos chegaram — é aqui que um nome errado se vê', async () => {
  // `titulo` e não `title`; `atribuido_a` e não `who`; `recorrencia` traduzida.
  const t = await admin.collection('tarefas').getOne(idDaTarefa);
  igual(t.titulo, 'Pôr a mesa');
  igual(t.atribuido_a, leo.id);
  igual(t.recorrencia, 'diaria', 'a recorrência não foi traduzida');
  igual(t.pontos, 3);
  igual(t.urgencia, 0);
  igual(String(t.prazo).slice(0, 10), '2026-09-25');
  igual(t.casa, daRita.casa);
});

await prova('o telemóvel do Tomás vê-a', async () => {
  const v = await doTomas.collection('tarefas').getFullList();
  if (!v.some(x => x.id === idDaTarefa)) throw new Error('não a vê');
});

await prova('⚠ e o `puxarCasa` traduz de volta para a forma da loja', async () => {
  // A viagem de ida e volta: o que sai da loja tem de voltar igual, senão o
  // ecrã mostra outra coisa do que se escreveu.
  const casaLida = await sync.puxarCasa();
  const t = (casaLida.newTasks || []).find(x => x.id === idDaTarefa);
  if (!t) throw new Error('a tarefa não veio no puxarCasa');
  igual(t.title, 'Pôr a mesa');
  igual(t.who, 'Leo');                      // o NOME, não o id
  igual(t.recur, 'Todos os dias');          // traduzida de volta
  igual(t.pts, 3);
  igual(t.idServidor, idDaTarefa);
  // A urgência e o prazo vão para os MAPAS que os ecrãs leem.
  igual(casaLida.urg[idDaTarefa], 0);
  igual(casaLida.due[idDaTarefa].key, 'd2026-09-25');
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. MARCAR É ADITIVO, E OS DOIS TELEMÓVEIS CONCORDAM
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── marcar é uma LINHA, e os dois concordam (INVARIANTE #2) ──');

const hoje = new Date().toISOString().slice(0, 10);
let idDaLinha = null;

await prova('marcar a tarefa cria uma linha em `tarefas_feitas`', async () => {
  const r = await comId(sync.marcarTarefaFeita({
    casa: daRita.casa, tarefa: idDaTarefa, dia: `d${hoje}`, marcadaPor: daRita.membro }),
    'marcarTarefaFeita');
  idDaLinha = r.id;
  const linha = await admin.collection('tarefas_feitas').getOne(idDaLinha);
  igual(linha.tarefa, idDaTarefa);
  igual(String(linha.data).slice(0, 10), hoje);
});

await prova('⚠ e o SEGUNDO telemóvel a marcar não duplica — devolve a que existe', async () => {
  // Sem o índice único ficavam duas linhas e os pontos contavam a dobrar. Com
  // ele, a segunda marcação encontra a primeira e devolve-a: o estado que se
  // pediu já lá está, e isso não é erro.
  const r = await comId(sync.marcarTarefaFeita({
    casa: daRita.casa, tarefa: idDaTarefa, dia: `d${hoje}`, marcadaPor: daRita.membro }),
    'marcarTarefaFeita, segunda vez');
  igual(r.id, idDaLinha);
  igual(r.jaEstava, true);
  const todas = (await admin.collection('tarefas_feitas').getFullList())
    .filter(x => x.tarefa === idDaTarefa);
  igual(todas.length, 1, 'ficaram ' + todas.length + ' linhas');
});

await prova('⚠ SEM confirmação, o `puxarCasa` dá a tarefa como «a confirmar» — não como feita', async () => {
  // Uma linha sem `confirmada_em` é a marcação de uma criança à espera de um
  // adulto (10/09/2026). Entrava em `done`: a criança marcava no telemóvel
  // dela e no da mãe a tarefa aparecia FEITA, sem ninguém a confirmar.
  const casaLida = await sync.puxarCasa();
  igual(!!casaLida.pending[idDaTarefa], true);
  igual(!!casaLida.done[idDaTarefa], false);
  // E guarda o id da linha, que é o que permite desmarcar.
  const guardada = casaLida.feitas[`${idDaTarefa}|${hoje}`];
  if (!guardada) throw new Error('não guardou a linha por «tarefa|dia»');
  igual(guardada.id, idDaLinha);
  igual(guardada.confirmada, false);
});

await prova('⚠ e CONFIRMADA por um adulto, o `puxarCasa` dá-a como feita HOJE', async () => {
  // É o que a app faz quando é um adulto a marcar: cria a linha e confirma-a
  // a seguir. Só então os pontos contam.
  await sync.confirmarTarefaFeita(idDaLinha, daRita.membro);
  const casaLida = await sync.puxarCasa();
  igual(!!casaLida.done[idDaTarefa], true);
  igual(!!casaLida.pending[idDaTarefa], false);
  igual(casaLida.feitas[`${idDaTarefa}|${hoje}`].confirmada, true);
});

await prova('desmarcar APAGA a linha — não escreve um booleano', async () => {
  await sync.desmarcarTarefaFeita(idDaLinha);
  const todas = (await admin.collection('tarefas_feitas').getFullList())
    .filter(x => x.tarefa === idDaTarefa);
  igual(todas.length, 0);
  const casaLida = await sync.puxarCasa();
  igual(!!casaLida.done[idDaTarefa], false);
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. A AGENDA, COM OS TRÊS NÍVEIS
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── a agenda: o que cada telemóvel recebe ──');

await prova('a Rita cria um evento da família', async () => {
  const r = await comId(sync.eventoDaCasa({
    casa: daRita.casa, dia: 'd2026-09-26', hora: '19:30',
    titulo: 'Jantar de aniversário', autor: daRita.membro, visibilidade: 'familia' }),
    'eventoDaCasa');
  const e = await admin.collection('eventos').getOne(r.id);
  igual(e.titulo, 'Jantar de aniversário');
  igual(String(e.dia).slice(0, 10), '2026-09-26');
  igual(e.hora, '19:30');
  igual(e.visibilidade, 'familia');
});

let idPrivado = null;
await prova('e um só dela', async () => {
  const r = await comId(sync.eventoDaCasa({
    casa: daRita.casa, dia: 'd2026-09-27', titulo: 'Médico',
    autor: daRita.membro, visibilidade: 'so-eu' }), 'eventoDaCasa, só dela');
  idPrivado = r.id;
});

await prova('⚠ o telemóvel do Tomás NÃO recebe o «só eu» da Rita', async () => {
  // Não é escondido no ecrã: é ausente da resposta. INVARIANTE #3.
  const v = await doTomas.collection('eventos').getFullList();
  igual(v.some(x => x.id === idPrivado), false, v.map(x => x.titulo).join('/'));
  if (!v.some(x => x.titulo === 'Jantar de aniversário')) throw new Error('e não vê o da família');
});

await prova('⚠ e o `puxarCasa` da Rita traduz a visibilidade de volta', async () => {
  const casaLida = await sync.puxarCasa();
  const e = (casaLida.added || []).find(x => x.id === idPrivado);
  if (!e) throw new Error('o evento não veio');
  igual(e.visibilidade, 'so-eu');
  igual(e.owner, 'Rita');                   // o NOME, não o id
  igual(e.day, 'd2026-09-27');
});

await prova('⚠ e o `puxarCasa` NÃO filtra nada — é o servidor que decide', async () => {
  // Se o cliente filtrasse, o dado privado já teria chegado ao dispositivo. A
  // prova é do lado do Tomás: o «só eu» da Rita não está na lista dele antes de
  // qualquer filtro do cliente.
  const codigo = (await import('node:fs')).readFileSync('src/sync.js', 'utf8');
  const i = codigo.indexOf('const added = (casa.eventos');
  const bloco = codigo.slice(i, i + 700);
  if (/visibilidade\s*===?\s*['"]/.test(bloco) || /podeVerEvento/.test(bloco)) {
    throw new Error('o puxarCasa está a filtrar eventos por visibilidade');
  }
});

resumo();
