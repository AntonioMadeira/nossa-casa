// ⚠ TODA a relação que aponta para dentro da casa tem de estar ancorada à casa.
//
//   node db/pocketbase/provar-relacoes-ancoradas.mjs
//
// ── Porque é que esta prova existe ───────────────────────────────────────────
//
// Entre 04 e 05/09/2026 corrigi o MESMO defeito cinco vezes, uma de cada vez,
// sempre depois de uma prova o apanhar por acaso:
//
//     anexos.episodio                  um exame pendurado na consulta de outra
//                                      família
//     eventos.responsavel              o nome de uma criança de outra casa num
//                                      evento
//     eventos.episodio                 um evento ligado a uma consulta de fora
//     tarefas.atribuido_a              uma tarefa atribuída a uma criança de
//                                      outra casa
//     tarefas_feitas.tarefa            marcar a tarefa de outra família
//     transferencias.de/para_envelope  mover dinheiro entre os envelopes de
//                                      outra casa
//     despesas.envelope                lançar uma despesa contra eles
//
// O dono da casa perguntou o óbvio: «quando verificas isto várias vezes, não
// achas que vale a pena olhar com muito mais atenção e resolver de vez?»
//
// Tinha razão. Corrigir à mão, um de cada vez, é apagar fogos — e o sexto
// aparecia no dia em que alguém acrescentasse uma coleção.
//
// ── A forma do defeito, dita uma vez ─────────────────────────────────────────
//
// O campo `casa` de uma linha é ESCOLHIDO POR QUEM ESCREVE. Uma regra que diga
// apenas `casa = @request.auth.casa` verifica a ETIQUETA que o autor pôs, não o
// dado a que a linha se liga. Quem escreve põe a casa dele na linha e aponta a
// relação para dentro da nossa.
//
// A regra é: **toda a relação que aponta para uma coleção da casa tem de ser
// verificada** — ou pela casa dela (`x.casa = @request.auth.casa`), ou por ser
// o próprio (`x = @request.auth.id`), ou por herdar de outra relação que já o
// esteja (`x.episodio.casa = ...`).
//
// ── O que isto faz, e porque são DUAS provas ─────────────────────────────────
//
// 1. ESTÁTICA — percorre todas as coleções, todos os campos de relação, e exige
//    a âncora nas regras de escrita. É completa: não depende de eu me lembrar
//    de tentar o ataque certo, e apanha a coleção que ainda não existe.
//
// 2. DINÂMICA — monta duas casas e tenta mesmo, coleção a coleção, escrever de
//    fora com a relação apontada para dentro. É a que prova que a regra
//    escrita faz o que diz.
//
// A estática sozinha aceitaria uma regra que menciona a âncora sem a impor. A
// dinâmica sozinha só cobre o que eu me lembrei de tentar. Juntas, fecham.
import PocketBase from 'pocketbase';
import { URL, PREFIXO, comecar, prova, resumo } from './provas.mjs';

const { pb: admin } = await comecar();

// ═════════════════════════════════════════════════════════════════════════════
// 1. A PROVA ESTÁTICA
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── toda a relação para dentro da casa está ancorada ──');

const todas = (await admin.collections.getFullList()).filter(c => !c.name.startsWith('_'));
const colecoes = todas.filter(c => c.type === 'base');
// ⚠ O mapa de nomes é de TODAS as coleções, e não só das de base. Os `membros`
// são uma coleção de AUTENTICAÇÃO: com o mapa feito só das de base, toda a
// relação para `membros` ficava sem nome de alvo e era saltada — nem a
// estática a via, nem a dinâmica a exigia. Foi assim que a `episodios_saude.membro`
// viveu oito dias sem âncora nem ataque, com a `daCasa.add('membros')` duas
// linhas abaixo a prometer o contrário (12/09/2026, apanhado pela primeira
// coleção nova com a mesma forma).
const porId = Object.fromEntries(todas.map(c => [c.id, c.name]));

// Uma coleção é «da casa» se tiver um campo `casa` — ou for a `casas` ou a
// `membros`, que são a casa e quem lá vive.
const daCasa = new Set(colecoes.filter(c => c.fields.some(f => f.name === 'casa')).map(c => c.name));
daCasa.add('casas');
daCasa.add('membros');

// ── As excepções, cada uma com a razão escrita ──────────────────────────────
//
// ⚠ Uma excepção sem razão é uma porta aberta com autorização. A prova exige
// que cada uma traga a sua, e que a coleção e o campo existam mesmo — uma
// excepção para um campo que já não existe é lixo que esconde o próximo.
const COM_RAZAO = {
  'preferencias.membro':
    'A regra inteira é `membro = @request.auth.id`: as preferências são de '
    + 'cada um e de mais ninguém, e isso é mais apertado do que a casa.',
};

// A âncora pode ter três formas, e todas valem:
//
//   x.casa = @request.auth.casa    a casa da coisa apontada
//   x = @request.auth.id           é o próprio (só faz sentido para `membros`)
//   x.<algo>.casa = @request...    herda de uma relação intermédia
const ancorado = (campo, regras) => (
  new RegExp(`\\b${campo}\\.casa\\s*=\\s*@request\\.auth\\.casa\\b`).test(regras)
  || new RegExp(`\\b${campo}\\s*=\\s*@request\\.auth\\.id\\b`).test(regras)
  || new RegExp(`\\b${campo}\\.\\w+\\.casa\\s*=\\s*@request\\.auth\\.casa\\b`).test(regras)
);

// ⚠ Cada regra é conferida SOZINHA, não as duas juntas.
//
// A primeira versão desta prova juntava a `createRule` e a `updateRule` num
// texto só. Injetei um defeito para a ver morder — tirei a âncora da
// `createRule` do `artigos` — e ela passou: a âncora que ficava na `updateRule`
// salvava a outra. A metade dinâmica apanhou-o; a estática não.
//
// Uma coleção pode ter a âncora ao criar e não ao alterar, e nesse caso escreve
// -se uma linha inócua e altera-se depois para apontar para dentro da casa.
const relacoes = [];
for (const c of colecoes) {
  for (const f of c.fields) {
    if (f.type !== 'relation' || f.name === 'casa') continue;
    const alvo = porId[f.collectionId];
    if (!alvo || !daCasa.has(alvo)) continue;   // aponta para fora da casa
    // Uma regra `null` é «ninguém pode» — mais apertado do que qualquer âncora.
    for (const [qual, regra] of [['criar', c.createRule], ['alterar', c.updateRule]]) {
      if (regra === null || regra === undefined) continue;
      relacoes.push({ colecao: c.name, campo: f.name, alvo, regras: regra, qual });
    }
  }
}

await prova('há relações para conferir — senão isto não prova nada', () => {
  if (relacoes.length < 10) throw new Error(`só ${relacoes.length} relações`);
  const distintas = new Set(relacoes.map(r => `${r.colecao}.${r.campo}`)).size;
  console.log(`      (${distintas} relações, ${relacoes.length} regras de escrita, `
    + `em ${colecoes.length} coleções)`);
});

await prova('⚠ nenhuma relação para dentro da casa fica por ancorar', () => {
  const soltas = relacoes
    .filter(r => !COM_RAZAO[`${r.colecao}.${r.campo}`])
    .filter(r => !ancorado(r.campo, r.regras))
    .map(r => `${r.colecao}.${r.campo} → ${r.alvo}  (ao ${r.qual})`);
  if (soltas.length) {
    throw new Error(`${soltas.length} soltas:\n        ` + soltas.join('\n        '));
  }
});

await prova('⚠ e cada excepção tem razão escrita, e o campo existe mesmo', () => {
  for (const [chave, razao] of Object.entries(COM_RAZAO)) {
    const [colecao, campo] = chave.split('.');
    const c = colecoes.find(x => x.name === colecao);
    if (!c) throw new Error(`a excepção ${chave} é de uma coleção que não existe`);
    if (!c.fields.some(f => f.name === campo)) {
      throw new Error(`a excepção ${chave} é de um campo que não existe`);
    }
    if (!razao || razao.length < 40) throw new Error(`a excepção ${chave} não traz razão`);
  }
});

// ⚠ E as coleções ADITIVAS não se alteram nem se apagam. Uma linha aditiva que
// se possa editar deixa de o ser — é o INVARIANTE #2 pela porta do lado.
await prova('⚠ as coleções aditivas não têm regra de alteração nem de apagamento', () => {
  const ADITIVAS = ['despesas', 'transferencias', 'cofre_movimentos', 'acertos'];
  const maus = [];
  for (const nome of ADITIVAS) {
    const c = colecoes.find(x => x.name === nome);
    if (!c) { maus.push(`${nome}: não existe`); continue; }
    if (c.updateRule !== null) maus.push(`${nome}: tem updateRule`);
    if (c.deleteRule !== null) maus.push(`${nome}: tem deleteRule`);
  }
  if (maus.length) throw new Error(maus.join(' · '));
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. A PROVA DINÂMICA — tentar mesmo, de fora
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── e de outra casa não se escreve para dentro desta ──');

const s = (p) => ({ password: p, passwordConfirm: p });
const casa = await admin.collection('casas').create({ nome: PREFIXO + 'Nossa', valor_ponto: 0.1 });
const outra = await admin.collection('casas').create({ nome: PREFIXO + 'Deles', valor_ponto: 0.1 });

const mk = (c, nome, papel, extra) => admin.collection('membros').create({
  nome, login: `${c.id}_${nome}`, casa: c.id, papel, verified: true, ...extra });

const rita = await mk(casa, 'Rita', 'admin', { email: 'rita-anc@x.pt', ...s('palavra-longa-1') });
const leo  = await mk(casa, 'Leo',  'crianca', { ...s('135790') });
const nela = await mk(outra, 'Vizinha', 'admin', { email: 'viz-anc@x.pt', ...s('palavra-longa-9') });

const cVizinha = new PocketBase(URL);
cVizinha.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
await cVizinha.collection('membros').authWithPassword('viz-anc@x.pt', 'palavra-longa-9');

// As nossas linhas, para ela tentar apontar-lhes.
const nosso = {};
nosso.envelope = await admin.collection('envelopes').create({ casa: casa.id, nome: 'Mercearia', limite_base: 500 });
nosso.episodio = await admin.collection('episodios_saude').create({
  casa: casa.id, membro: leo.id, especialidade: 'Pediatria', dia: '2026-09-20' });
nosso.tarefa = await admin.collection('tarefas').create({
  casa: casa.id, titulo: 'Pôr a mesa', atribuido_a: leo.id, pontos: 1 });
nosso.loja = await admin.collection('lojas').create({ casa: casa.id, nome: 'Continente' });
nosso.lista = await admin.collection('listas_compras').create({ casa: casa.id, loja: nosso.loja.id });
nosso.corredor = await admin.collection('seccoes').create({ casa: casa.id, nome: 'Mercearia', posto: 1 });
nosso.meta = await admin.collection('metas').create({ casa: casa.id, nome: 'Férias', alvo: 3000 });
nosso.equipamento = await admin.collection('equipamentos').create({
  casa: casa.id, nome: 'Máquina de lavar' });
// A ementa (11/09/2026): um prato desta casa, para a vizinha tentar pô-lo na
// ementa dela — e o Léo, para ela lhe tentar escrever um objetivo do cofre.
nosso.prato = await admin.collection('pratos').create({
  casa: casa.id, nome: 'Frango no forno', ingredientes: [{ rotulo: 'Frango', s: 'Frescos' }] });
// As contas fixas (12/09/2026): a renda desta casa, para a vizinha tentar
// pagá-la com uma despesa da casa dela.
nosso.contaFixa = await admin.collection('contas_fixas').create({
  casa: casa.id, nome: 'Renda', valor: 850, dia: 1, envelope: nosso.envelope.id });
// A medicação (12/09/2026): uma receita do Léo, para a vizinha lhe tentar marcar tomas.
nosso.receita = await admin.collection('receitas_saude').create({
  casa: casa.id, episodio: nosso.episodio.id, nome: 'Ferro' });

// E uma linha DELA, para os ataques que precisam de uma ponta legítima — sem
// isso, a transferência era recusada por ter as duas pontas de fora e a prova
// passava sem provar a ponta que interessa.
const deles = {};
deles.envelope = await admin.collection('envelopes').create({
  casa: outra.id, nome: 'Mercearia deles', limite_base: 100 });
deles.lista = await admin.collection('listas_compras').create({ casa: outra.id });
// E uma receita DELA, para o ataque ao `por` das tomas ter a receita legítima.
deles.episodio = await admin.collection('episodios_saude').create({
  casa: outra.id, membro: nela.id, especialidade: 'Medicina geral', dia: '2026-09-20' });
deles.receita = await admin.collection('receitas_saude').create({
  casa: outra.id, episodio: deles.episodio.id, nome: 'Vitaminas' });
// E o que os catorze ataques às relações para `membros` precisam DELA: uma
// criança, uma tarefa, um segundo envelope, uma meta (12/09/2026).
deles.crianca = await mk(outra, 'Filho', 'crianca', { ...s('246813') });
deles.tarefa = await admin.collection('tarefas').create({ casa: outra.id, titulo: 'Arrumar', atribuido_a: deles.crianca.id, pontos: 1 });
deles.envelope2 = await admin.collection('envelopes').create({ casa: outra.id, nome: 'Lazer deles', limite_base: 50 });
deles.meta = await admin.collection('metas').create({ casa: outra.id, nome: 'Bicicleta', alvo: 300 });

// Uma tentativa por relação: os campos mínimos, com a relação a apontar para
// DENTRO desta casa e o `casa` da linha na casa DELA.
const ATAQUES = [
  ['eventos', 'responsavel', { dia: '2026-09-20', titulo: 'X', autor: '@eu', visibilidade: 'familia', responsavel: () => leo.id }],
  ['eventos', 'episodio', { dia: '2026-09-20', titulo: 'X', autor: '@eu', visibilidade: 'familia', episodio: () => nosso.episodio.id }],
  ['tarefas', 'atribuido_a', { titulo: 'X', pontos: 1, atribuido_a: () => leo.id }],
  ['tarefas_feitas', 'tarefa', { data: '2026-09-20', marcada_por: '@eu', tarefa: () => nosso.tarefa.id }],
  // As duas relações que nasceram em 11/09/2026. O `objetivos_cofre.membro`
  // aponta a UMA PESSOA desta casa: a vizinha, adulta, tenta escrever o
  // objetivo do nosso Léo assinando a casa dela — e o `membro.casa` prende.
  ['ementa', 'prato', { dia: '2026-09-20', prato: () => nosso.prato.id }],
  ['objetivos_cofre', 'membro', { nome: 'X', alvo: 10, membro: () => leo.id }],
  ['despesas', 'envelope', { valor: 9, pagador: '@eu', idem_key: 'anc-1', envelope: () => nosso.envelope.id }],
  // As três relações das contas fixas (12/09/2026). A conta aponta ao
  // envelope e a quem paga; a despesa que a paga aponta à conta. Cada ataque
  // tem as OUTRAS pontas legítimas — o envelope dela —, senão a recusa vinha
  // por outra razão e a prova passava sem provar a ponta que interessa.
  ['contas_fixas', 'envelope', { nome: 'Renda deles', valor: 10, dia: 1, envelope: () => nosso.envelope.id }],
  ['contas_fixas', 'quem_paga', { nome: 'Luz deles', valor: 10, dia: 1, envelope: () => deles.envelope.id, quem_paga: () => rita.id }],
  ['despesas', 'conta_fixa', { valor: 9, pagador: '@eu', idem_key: 'anc-cf', envelope: () => deles.envelope.id, conta_fixa: () => nosso.contaFixa.id }],
  // Os contratos (12/09/2026): quem trata é um adulto DESTA casa.
  ['contratos', 'responsavel', { nome: 'Seguro deles', responsavel: () => rita.id }],
  // As tomas (12/09/2026): a receita desta casa, e a assinatura de um adulto desta.
  ['tomas_saude', 'receita', { quando: '2026-09-20 08:00:00.000Z', por: '@eu', receita: () => nosso.receita.id }],
  ['tomas_saude', 'por', { quando: '2026-09-20 08:00:00.000Z', receita: () => deles.receita.id, por: () => rita.id }],
  // As alergias (12/09/2026): a vizinha tenta escrever uma alergia ao nosso Léo.
  ['alergias_saude', 'membro', { nome: 'Amendoim', gravidade: 'grave', membro: () => leo.id }],
  // A lista partilhada (12/09/2026): a lista e quem partilha, as duas ancoradas.
  ['partilhas_lista', 'lista', { criada_por: '@eu', lista: () => nosso.lista.id }],
  ['partilhas_lista', 'criada_por', { lista: () => deles.lista.id, criada_por: () => rita.id }],
  // A troca de tarefas entre irmãos (12/09/2026): QUATRO relações para dentro
  // da casa — as duas tarefas e as duas pessoas —, um ataque por cada.
  ['trocas_tarefas', 'tarefa_de', { dia: '2026-09-20', proposta_por: '@eu', tarefa_de: () => nosso.tarefa.id, tarefa_para: () => deles.tarefa.id }],
  ['trocas_tarefas', 'tarefa_para', { dia: '2026-09-20', proposta_por: '@eu', tarefa_de: () => deles.tarefa.id, tarefa_para: () => nosso.tarefa.id }],
  ['trocas_tarefas', 'proposta_por', { dia: '2026-09-20', tarefa_de: () => deles.tarefa.id, tarefa_para: () => deles.tarefa.id, proposta_por: () => leo.id }],
  ['trocas_tarefas', 'aceite_por', { dia: '2026-09-20', proposta_por: '@eu', tarefa_de: () => deles.tarefa.id, tarefa_para: () => deles.tarefa.id, aceite_por: () => rita.id }],
  // ⚠ E a CONSULTA ao nosso Léo — o ataque que nunca tinha sido escrito, porque
  // o mapa de nomes saltava as relações para `membros`. Passava.
  ['episodios_saude', 'membro', { especialidade: 'Pediatria', dia: '2026-09-20', membro: () => leo.id }],
  // ⚠ As catorze relações para `membros` que o guarda nunca tinha exigido,
  // porque o mapa de nomes saltava a coleção de autenticação (12/09/2026).
  // Duas eram buracos a sério — o cofre e os acertos; as outras já prendiam
  // pelo `= @request.auth.id` ou pelo `.casa`, e agora está provado.
  ['registo', 'quem', { texto: 'X', quando: '2026-09-20 10:00:00.000Z', area: 'Casa', quem: () => rita.id }],
  ['eventos', 'autor', { dia: '2026-09-20', titulo: 'X', visibilidade: 'familia', autor: () => rita.id }],
  ['tarefas_feitas', 'marcada_por', { data: '2026-09-20', tarefa: () => deles.tarefa.id, marcada_por: () => rita.id }],
  ['tarefas_feitas', 'confirmada_por', { data: '2026-09-21', tarefa: () => deles.tarefa.id, marcada_por: '@eu', confirmada_por: () => rita.id }],
  ['despesas', 'pagador', { valor: 9, idem_key: 'anc-pg', envelope: () => deles.envelope.id, pagador: () => rita.id }],
  ['cofre_movimentos', 'membro', { tipo: 'bonus', valor: 1, idem_key: 'anc-cf1', membro: () => leo.id }],
  ['cofre_movimentos', 'autorizado_por', { tipo: 'bonus', valor: 1, idem_key: 'anc-cf2', membro: () => deles.crianca.id, autorizado_por: () => rita.id }],
  ['listas_compras', 'comprador', { comprador: () => rita.id }],
  ['artigos', 'pedido_por', { rotulo: 'X', lista: () => deles.lista.id, pedido_por: () => leo.id }],
  ['transferencias', 'por', { valor: 9, idem_key: 'anc-tr', de_envelope: () => deles.envelope.id, para_envelope: () => deles.envelope2.id, por: () => rita.id }],
  ['acertos', 'de_membro', { valor: 5, idem_key: 'anc-ac1', de_membro: () => rita.id, para_membro: '@eu' }],
  ['acertos', 'para_membro', { valor: 5, idem_key: 'anc-ac2', de_membro: '@eu', para_membro: () => rita.id }],
  ['notas_saude', 'autor', { texto: 'X', episodio: () => deles.episodio.id, autor: () => rita.id }],
  ['meta_movimentos', 'por', { valor: 50, idem_key: 'anc-mm', meta: () => deles.meta.id, por: () => rita.id }],
  // ⚠ As DUAS pontas da transferência, uma de cada vez. A prova «há um ataque
  // por relação» apanhou-me a esquecer o `para_envelope` — que é exactamente
  // o género de omissão que ela existe para apanhar, e que me escapou cinco
  // vezes antes de haver guarda nenhum.
  ['transferencias', 'de_envelope', { valor: 9, por: '@eu', idem_key: 'anc-2', de_envelope: () => nosso.envelope.id, para_envelope: () => deles.envelope.id }],
  ['transferencias', 'para_envelope', { valor: 9, por: '@eu', idem_key: 'anc-3', de_envelope: () => deles.envelope.id, para_envelope: () => nosso.envelope.id }],
  ['anexos', 'episodio', { titulo: 'X', tipo: 'exame', episodio: () => nosso.episodio.id }],
  ['notas_saude', 'episodio', { texto: 'X', autor: '@eu', episodio: () => nosso.episodio.id }],
  ['receitas_saude', 'episodio', { nome: 'X', episodio: () => nosso.episodio.id }],
  ['decisoes_saude', 'episodio', { estado: 'pendente', episodio: () => nosso.episodio.id }],
  ['listas_compras', 'loja', { loja: () => nosso.loja.id }],
  ['artigos', 'lista', { rotulo: 'X', lista: () => nosso.lista.id }],
  // ⚠ O `corredor` nasceu em 07/09/2026 — as secções deixaram de ser um índice
  // e passaram a ser linhas da casa. E esta prova apanhou-me OUTRA VEZ: a regra
  // já estava ancorada, o ataque é que não estava escrito. É a segunda vez que
  // ela me apanha a acrescentar uma relação sem o ataque dela, e a primeira foi
  // o `para_envelope` da transferência.
  //
  // A lista tem de ser DELA, senão a recusa vem por causa da lista e não do
  // corredor — e a prova passava sem provar a ponta que interessa.
  ['artigos', 'corredor', { rotulo: 'X', lista: () => deles.lista.id, corredor: () => nosso.corredor.id }],
  ['manutencoes', 'equipamento', { equipamento: () => nosso.equipamento.id }],
  // ⚠ Os reforços de uma meta, 08/09/2026. A sexta vez que uma relação nova para
  // dentro da casa chegou com a REGRA ancorada e sem o ATAQUE escrito — e a
  // prova de cima apanhou-a, como apanhou o `corredor`. É para isso que ela
  // enumera em vez de contar.
  ['meta_movimentos', 'meta', { valor: 50, idem_key: 'anc-4', meta: () => nosso.meta.id }],
];

await prova('⚠ há um ataque por relação — nenhuma fica sem ser tentada', () => {
  const tentadas = new Set(ATAQUES.map(([c, f]) => `${c}.${f}`));
  const porTentar = [...new Set(relacoes
    .filter(r => !COM_RAZAO[`${r.colecao}.${r.campo}`])
    .map(r => `${r.colecao}.${r.campo}`))]
    .filter(x => !tentadas.has(x));
  if (porTentar.length) {
    throw new Error('sem ataque: ' + porTentar.join(', '));
  }
});

for (const [colecao, campo, base] of ATAQUES) {
  await prova(`⚠ a vizinha não escreve em \`${colecao}\` apontando o \`${campo}\` para cá`, async () => {
    const linha = { casa: outra.id };
    for (const [k, v] of Object.entries(base)) {
      linha[k] = v === '@eu' ? nela.id : (typeof v === 'function' ? v() : v);
    }
    let criada = null;
    try { criada = await cVizinha.collection(colecao).create(linha); } catch (e) { /* recusado, que é o que se quer */ }
    if (criada) {
      // Limpa-se, para não deixar lixo numa casa que não é dela.
      await admin.collection(colecao).delete(criada.id).catch(() => {});
      throw new Error('PASSOU — a linha foi criada');
    }
  });
}

resumo();
