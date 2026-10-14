// Aceitação: uma consulta marcada na app chega ao servidor — e não chega a
// quem não a pode ver.
//
//   node db/pocketbase/provar-saude-sobe.mjs
//
// ── O que isto prova, e as outras não ────────────────────────────────────────
//
// `provar-saude.mjs` prova as REGRAS contra o SDK cru. Os testes em `__tests__`
// provam a condição `eEnderecoDeCasa` e que o travão a chama. Nenhuma das duas
// prova o caminho todo: a app marca a consulta, o `sync` decide, a fila envia,
// o servidor aceita, e o telemóvel de cada pessoa recebe o que lhe compete.
//
// É esse caminho que isto percorre, pelo `src/sync.js` — o mesmo ficheiro que a
// app importa, sem interface pelo meio.
//
// ── E o que continua a não subir ─────────────────────────────────────────────
//
// Os documentos, as notas, as receitas e as decisões. Um documento leva
// ficheiro anexo, e é dessa peça que os cinco pontos do db/postgres/README.md
// mais falam. Sobe a consulta; o que está pendurado nela, não.
import PocketBase from 'pocketbase';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL, PREFIXO, comecar, prova, igual, recusado, resumo } from './provas.mjs';
// A decisão em vigor, lida do sítio onde ela vive.
import { A_SAUDE_SOBE } from '../../src/endereco.js';
const { configurar, auth } = await import('../../src/pocketbase.js');
const { episodioDeSaude, saudeSincroniza, recusaSaude, eEnderecoDeCasa,
        NUNCA_SINCRONIZA, pendentes, esvaziar } = await import('../../src/sync.js');

const memoria = new Map();
const storage = {
  getItem: async (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: async (k, v) => { memoria.set(k, v); },
  removeItem: async (k) => { memoria.delete(k); },
};

const como = async (id, senha) => {
  const c = new PocketBase(URL);
  c.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
  await c.collection('membros').authWithPassword(id, senha);
  return c;
};

// ── A casa ───────────────────────────────────────────────────────────────────
const { pb: admin } = await comecar();
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Bengui', valor_ponto: 0.1 });
const mk = (nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${casa.id}_${nome}`, casa: casa.id, papel, verified: true, ...extra });
const rita = await mk('rita', 'admin', { email: 'rita@x.pt', password: 'palavra-longa-1', passwordConfirm: 'palavra-longa-1' });
const tomas = await mk('tomas', 'adulto', { email: 'tomas@x.pt', password: 'palavra-longa-2', passwordConfirm: 'palavra-longa-2' });
const leo = await mk('leo', 'crianca', { password: '135790', passwordConfirm: '135790' });

// ── 1. O travão, antes de qualquer coisa ─────────────────────────────────────
//
// ⚠ ESTA SECÇÃO MUDOU DE SENTIDO EM 30/09/2026, e o cabeçalho do
// `src/endereco.js` conta a história inteira. Em duas linhas: o travão decidia
// pelo ENDEREÇO — `127.0.0.1` era casa, um nome na internet não era — e a casa
// mudou-se para uma máquina alugada. O dono da casa decidiu que a saúde sobe na
// mesma, e que o RGPD é preocupação dele.
//
// A decisão passou a ser uma CONSTANTE declarada, `A_SAUDE_SOBE`, porque a
// pergunta deixou de ser técnica: «este servidor está em casa?» era uma
// medição; «esta casa guarda saúde no servidor?» é uma escolha.
//
// O que estas provas defendem é agora o CONTRÁRIO do que defendiam, e é de
// propósito: o defeito que interessa apanhar passou a ser a saúde DEIXAR de
// subir no dia da mudança, sem ninguém pedir isso.
console.log('\n── o travão lê a DECISÃO, não o endereço ──');

await prova('⚠ com o servidor fora de casa, a saúde SOBE na mesma', async () => {
  // Era o contrário até 29/09/2026. É isto que tem de continuar a acontecer
  // quando a casa viver na máquina alugada.
  configurar({ storage, url: URL.replace('127.0.0.1', 'localtest.me') });
  igual(eEnderecoDeCasa('http://localtest.me:8095'), false, 'o endereço devia contar como de fora');
  igual(saudeSincroniza(), true, 'a saúde deixou de subir fora de casa');
});

await prova('mas sem servidor nenhum não sobe — que é outra coisa', async () => {
  // Isto não é o travão: é não haver para onde. A app corre local como sempre
  // correu, e a distinção importa — uma confundia-se com a outra se o
  // `saudeSincroniza` só olhasse para a decisão.
  //
  // ⚠ `url: ''` e NÃO `url: undefined`. O `configurar` só troca o endereço
  // quando ele é diferente de `undefined` — passar `undefined` não limpa nada,
  // deixa o anterior. A versão antiga desta prova passava por esse acaso: o
  // teste antes dela punha um endereço da internet, e era ESSE que a fazia
  // dizer «não». Media o endereço de outro teste, não a ausência de servidor.
  configurar({ storage, url: '' });
  igual(saudeSincroniza(), false);
  await recusado(() => recusaSaude('episodios_saude'));
});

await prova('e a decisão vem do `A_SAUDE_SOBE`, não do endereço', () => {
  // ⚠ Um guarda que não lesse nada passava sempre. Este confirma que a
  // constante É lida: posta a `false`, o `saudeSincroniza` tem de dizer que
  // não, esteja o servidor onde estiver.
  //
  // ⚠ E NÃO se afirma nada sobre o endereço desta bateria. Ela corre contra
  // `127.0.0.1` de um lado e contra `localtest.me` do outro — é assim que se
  // mede o servidor alugado sem ter a máquina —, e uma prova que fixasse o
  // endereço só passaria numa das duas.
  configurar({ storage, url: URL });
  igual(saudeSincroniza(), A_SAUDE_SOBE, 'o travão não segue a decisão');
});

// ── 2. O caminho todo ────────────────────────────────────────────────────────
console.log('\n── a consulta marcada na app chega ao servidor ──');

await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');

await prova('a Rita marca uma consulta ao Léo e ela fica no servidor', async () => {
  const r = await episodioDeSaude({
    casa: casa.id, membro: leo.id, especialidade: 'Dentista', dia: '2026-09-20', hora: '10:00' });
  // ⚠ Devolve `{ id }`, e não `{ enviadas, pendentes }`. Mudou quando o
  // episódio passou a tentar DIRETO antes de cair na fila — sem o `id` que o
  // servidor lhe dá, um anexo não tem para onde apontar. Esta prova exigia o
  // `pendentes: 0` da fila e falhou por isso, não por a consulta não subir.
  if (!r || !r.id) throw new Error('não devolveu id: ' + JSON.stringify(r));
  const cRita = await como('rita@x.pt', 'palavra-longa-1');
  const v = await cRita.collection('episodios_saude').getFullList();
  igual(v.length, 1);
  igual(v[0].especialidade, 'Dentista');
  igual(v[0].membro, leo.id);
});

await prova('o outro adulto também a vê — é a ficha de uma criança', async () => {
  const cTomas = await como('tomas@x.pt', 'palavra-longa-2');
  const v = await cTomas.collection('episodios_saude').getFullList();
  igual(v.length, 1);
});

await prova('⚠ e o telemóvel do LÉO não a recebe', async () => {
  // O ponto todo do INVARIANTE #3: não é a interface a esconder — a consulta
  // não vem na resposta.
  const cLeo = await como(`${casa.id}_leo`, '135790');
  const v = await cLeo.collection('episodios_saude').getFullList();
  igual(v.length, 0, v.map(x => x.especialidade).join('/'));
});

await prova('a consulta de um ADULTO é só dele, nem o outro adulto a vê', async () => {
  await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
  await episodioDeSaude({
    casa: casa.id, membro: rita.id, especialidade: 'Medicina geral', dia: '2026-09-22' });
  const cTomas = await como('tomas@x.pt', 'palavra-longa-2');
  const v = await cTomas.collection('episodios_saude').getFullList();
  igual(v.filter(x => x.membro === rita.id).length, 0, 'o Tomás viu a ficha da Rita');
  const cRita = await como('rita@x.pt', 'palavra-longa-1');
  igual((await cRita.collection('episodios_saude').getFullList())
    .filter(x => x.membro === rita.id).length, 1);
});

// ── 3. Sem rede ──────────────────────────────────────────────────────────────
console.log('\n── uma consulta marcada sem rede não se perde ──');

await prova('fica na fila e sobe ao reconectar', async () => {
  // Marcar com o servidor inalcançável: o endereço continua a ser de casa,
  // portanto o travão deixa passar — o que falha é a rede, não a regra.
  configurar({ storage, url: 'http://127.0.0.1:1' });
  await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1').catch(() => {});
  await episodioDeSaude({
    casa: casa.id, membro: leo.id, especialidade: 'Oftalmologia', dia: '2026-09-25' }).catch(() => {});
  const naFila = await pendentes();
  if (naFila < 1) throw new Error('a consulta não ficou na fila');

  // De volta a casa: a fila esvazia.
  configurar({ storage, url: URL });
  await auth.entrarAdulto('rita@x.pt', 'palavra-longa-1');
  await esvaziar();
  igual(await pendentes(), 0, 'a fila não esvaziou');
  const cRita = await como('rita@x.pt', 'palavra-longa-1');
  const v = await cRita.collection('episodios_saude').getFullList();
  if (!v.some(x => x.especialidade === 'Oftalmologia')) throw new Error('a consulta não chegou');
});

// ── 4. O que continua a não subir ────────────────────────────────────────────
console.log('\n── e o que fica no dispositivo, mesmo com o servidor em casa ──');

// ⚠ O nome desta prova dizia «os anexos continuam travados» e o que ela
// afirmava era que PASSAM — um nome a dizer o contrário do que a prova mede é
// pior do que nenhuma prova. O que prende os anexos não é o travão de
// conformidade: com o endereço de casa, o `recusaSaude` deixa-os passar. O que
// os prende é não existir caminho de escrita nenhum no cliente.
await prova('os anexos não têm caminho de escrita no cliente — é isso que os prende', async () => {
  configurar({ storage, url: URL });
  igual(recusaSaude('anexos'), 'anexos', 'o travão de conformidade deixa-os passar, e é o esperado');

  // ⚠ Pelo caminho, e não por `new URL(...)`: o `URL` importado da casa de
  // provas é o endereço do servidor, uma string, e tapa o `URL` global —
  // «URL is not a constructor». Um nome importado que colide com um global é
  // um erro que só aparece quando alguém usa o global.
  const sync = await readFile(join(import.meta.dirname, '../../src/sync.js'), 'utf8');
  const semComentarios = sync
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  if (/escrever\.criar\(\s*['"]anexos['"]/.test(semComentarios)) {
    throw new Error('alguém escreveu um caminho de escrita para anexos');
  }
  // E quando esse caminho existir, tem de nascer a partir do travão — como o
  // `episodioDeSaude` nasce.
  if (!/recusaSaude\('episodios_saude'\)/.test(semComentarios)) {
    throw new Error('o episodioDeSaude deixou de passar pelo travão');
  }
});

await prova('⚠ só o `healthGone` fica na lista do que nunca sobe', () => {
  // Esta lista foi encurtando, e cada saída tem data e razão:
  //
  //   03/09/2026  `health` — os episódios sobem quando o servidor é de casa
  //   03/09/2026  `healthDocs` — «sobe tudo», e os anexos vão com a fotografia
  //   04/09/2026  `healthNotes`, `healthRecipes`, `healthDecisions` — passaram
  //               a ter coleção (`notas_saude`, `receitas_saude`,
  //               `decisoes_saude`), com 24 provas em provar-notas-saude.mjs
  //
  // ⚠ Esta prova exigia o contrário das três últimas, e a razão escrita era
  // «não têm coleção no servidor: não é que não subam, é que não há para
  // onde». Passou a haver. Uma prova que exige uma lacuna cumpre-se apagando-a
  // no dia em que a lacuna fecha, não mantendo-a.
  for (const k of ['health', 'healthDocs', 'healthNotes', 'healthRecipes', 'healthDecisions']) {
    if (NUNCA_SINCRONIZA.includes(k)) throw new Error(`${k} voltou à lista — mas sobe`);
  }
  // O que fica é estado de dispositivo, não dado da casa: uma lista de ids
  // apagados neste telefone.
  if (!NUNCA_SINCRONIZA.includes('healthGone')) {
    throw new Error('o healthGone saiu da lista, e é estado de dispositivo');
  }
});

await prova('e `health` já não está nela, porque sobe sob condição', () => {
  if (NUNCA_SINCRONIZA.includes('health')) throw new Error('health ainda está na lista');
});

resumo();
