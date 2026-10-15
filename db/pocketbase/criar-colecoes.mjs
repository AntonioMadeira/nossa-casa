// Cria as coleções da Nossa Casa no PocketBase, traduzindo db/postgres/01-esquema.sql.
import PocketBase from 'pocketbase';
import { SUPERUTILIZADOR, SUPER_PALAVRA, URL_DO_SERVIDOR } from './ambiente.mjs';

const pb = new PocketBase(URL_DO_SERVIDOR);
pb.autoCancellation(false);   // uma escrita não se perde por chegar outra atrás
// As credenciais do superutilizador vêm do ambiente OU do `.env.local`, que o
// `.gitignore` exclui — ver `ambiente.mjs`. O valor por omissão está escrito
// no código e este repositório é público: serve para uma base acabada de criar
// e mais nada.
//   PB_ADMIN=... PB_ADMIN_PASS=... node <este ficheiro>
//
// ⚠ `SUPER` e não `ADMIN`. Mais abaixo há um `const ADMIN` que é a REGRA do
// papel de administrador (`@request.auth.papel = "admin"`), usada em sete
// regras de coleção. Dois `const ADMIN` no mesmo módulo é um SyntaxError, e
// este ficheiro deixou de analisar — «Identifier 'ADMIN' has already been
// declared».
//
// Ou seja: desde o commit que tirou as credenciais do código (90e219d), o
// script que CRIA as coleções nunca mais correu. As 141 provas continuaram
// verdes porque corriam contra as coleções criadas ANTES disso — uma base de
// dados que já não se sabia recriar. Descoberto em 03/09/2026, ao tentar
// aplicar a correção da visibilidade da saúde.
const SUPER = SUPERUTILIZADOR;
const SUPER_PASS = SUPER_PALAVRA;
await pb.collection('_superusers').authWithPassword(SUPER, SUPER_PASS);

const txt = (name, o = {}) => ({ name, type: 'text', ...o });
const num = (name, o = {}) => ({ name, type: 'number', ...o });
const bool = (name, o = {}) => ({ name, type: 'bool', ...o });
const data = (name, o = {}) => ({ name, type: 'date', ...o });
const sel = (name, values, o = {}) => ({ name, type: 'select', values, maxSelect: 1, ...o });
const rel = (name, collectionId, o = {}) => ({ name, type: 'relation', collectionId, maxSelect: 1, cascadeDelete: false, ...o });
const fich = (name, o = {}) => ({ name, type: 'file', maxSelect: 1, maxSize: 8388608, ...o });
// Um valor estruturado pequeno — a lista de ingredientes de um prato. Não é
// para dados que se consultem ou anexem linha a linha: esses são coleções.
const json = (name, o = {}) => ({ name, type: 'json', maxSize: 20000, ...o });

const ids = {};

// Recriar do zero é o que torna isto repetível. Apagar pela ordem inversa,
// porque as relações impedem apagar uma coleção que outra ainda refere.
//
// ⚠ `credenciais_agenda` está na lista e é preciso: foi acrescentada depois,
// por outro script, e ninguém a pôs aqui. Sem ela a limpeza parava a meio —
// «Failed to delete collection probably due to existing reference in
// credenciais_agenda» — e deixava a base num estado que este ficheiro já não
// sabia reconstruir.
const NOSSAS = [
  // vistas primeiro: dependem das coleções de base
  'v_cofre_saldo', 'v_envelope_gasto', 'v_acerto_saldo', 'v_pontos_por_pagar',
  'credenciais_agenda',
  // ⚠ As três novas ANTES dos `episodios_saude`: apagam-se pela ordem inversa
  // das relações, e as três apontam para ele. Fora de ordem, a limpeza para com
  // «existing reference» e deixa a base a meio — foi o que a
  // `credenciais_agenda` ensinou.
  // ⚠ E as `tomas_saude` ANTES das `receitas_saude`: a toma aponta à receita.
  'tomas_saude',
  // As alergias apontam ao membro e a mais nada: antes dos `membros` chega.
  'alergias_saude',
  'notas_saude', 'receitas_saude', 'decisoes_saude',
  // ⚠ `eventos` subiu para AQUI, antes dos `episodios_saude`. Ganhou uma
  // relação para eles («a agenda aprende a saúde»), e uma coleção não se apaga
  // enquanto outra a referir: em baixo na lista, a limpeza parava com «existing
  // reference in eventos». É o mesmo erro que a `credenciais_agenda` ensinou.
  'eventos',
  'anexos', 'episodios_saude', 'especialidades', 'manutencoes', 'categorias_equip',
  // ⚠ A `seccoes` vem DEPOIS dos `artigos`, e é por causa da ordem de limpeza:
  // apaga-se pela ordem inversa das relações, e o artigo aponta para o corredor.
  // À frente dele, a limpeza parava com «existing reference in artigos» — a
  // mesma lição da `credenciais_agenda` e dos `eventos`.
  // ⚠ `meta_movimentos` ANTES de `metas`, pela mesma razão da `seccoes`: o
  // movimento aponta para a meta, e uma coleção não se apaga enquanto outra a
  // referir. Fora de ordem, a limpeza para com «existing reference in
  // meta_movimentos».
  'meta_movimentos', 'metas',
  // As partilhas apontam à lista de compras e a quem partilhou: antes das duas.
  'partilhas_lista',
  // ⚠ Três coleções criadas em 11/09/2026 e nunca postas AQUI: a `ementa`
  // (aponta ao prato), os `pratos` e os `objetivos_cofre` (aponta ao membro).
  // Sem estarem na lista não eram apagadas nem preservadas, e a segunda corrida
  // deste ficheiro parava em «Collection name must be unique» (13/09/2026, ao
  // recriar a base do servidor temporário). O guarda `a-casa-simulada-apanhou`
  // confere que toda a coleção criada está nesta lista.
  'ementa', 'pratos',
  'acertos', 'transferencias', 'artigos', 'listas_compras', 'lojas', 'seccoes',
  'registo', 'meses', 'preferencias', 'equipamentos', 'cofre_movimentos', 'despesas',
  // ⚠ `contas_fixas` DEPOIS das `despesas` e ANTES dos `envelopes`: a despesa
  // aponta para a conta (`conta_fixa`), e a conta aponta para o envelope.
  'contas_fixas',
  // Os contratos apontam a quem trata deles (`responsavel`): antes dos `membros`.
  'contratos',
  // As trocas apontam a DUAS tarefas e a duas pessoas: antes das `tarefas`.
  'trocas_tarefas',
  // O objetivo do cofre aponta à criança: antes dos `membros`.
  'objetivos_cofre',
  'envelopes', 'tarefas_feitas', 'tarefas', 'membros', 'casas'];

// ── Uma casa habitada não se apaga ───────────────────────────────────────────
//
// ⚠ Este script apagava e recriava TUDO, `membros` e `casas` incluídos. Numa
// base vazia é isso que o torna repetível; numa casa a sério apaga a conta de
// quem lá vive e, com ela, a autorização da agenda da Google — que só se
// recupera indo outra vez à Google.
//
// Aprendi-o da pior maneira, em 03/09/2026: corri-o para aplicar uma mudança
// de regra, com a casa «Madeira» lá dentro. As coleções foram-se. A casa, o
// membro e as credenciais sobreviveram por ACIDENTE — a limpeza parou no erro
// da `credenciais_agenda` antes de chegar a `membros`. Um acidente não é uma
// salvaguarda.
//
// Agora, se já existe uma casa com membros, reaproveitam-se as duas coleções e
// só se recria o resto. As REGRAS aplicam-se de qualquer modo, que é a razão
// pela qual alguém corre isto depois do primeiro dia.
//
// Para uma reconstrução total e deliberada, o `PB_RECRIAR` leva o NOME da casa
// a destruir — ver o travão aqui em baixo.
const casasVivas = await pb.collection('casas').getFullList().catch(() => []);
const membrosVivos = await pb.collection('membros').getFullList().catch(() => []);

// ── O travão: uma reconstrução total pede-se pelo NOME da casa ───────────────
//
// ⚠ Isto pedia-se com um «1», que é uma resposta de uma tecla a uma pergunta
// que apaga uma casa inteira. O «1» escreve-se igual para a casa de simulação
// e para a casa a sério — não prova que se sabe QUAL está do outro lado —, e a
// linha fica no histórico da consola à espera da seta para cima. É o mesmo
// risco do `PB_URL=` esquecido que o `db/README.md` descreve, com a diferença
// de que aqui o valor pode carregar a prova.
//
// Agora o valor É o nome da casa a destruir e tem de bater certo com uma das
// que estão neste servidor. Quem escreve `PB_RECRIAR="Madeira"` está a olhar
// para o nome da casa que vai perder. O `simular-casa.mjs` recusa pela porta;
// este recusa pelo nome, e sai com o mesmo código 2.
const pedido = (process.env.PB_RECRIAR || '').trim();
const nomesVivos = casasVivas.map(c => c.nome);
const nomeBateCerto = pedido !== '' && nomesVivos.some(n => String(n).trim() === pedido);
if (pedido !== '' && nomesVivos.length > 0 && !nomeBateCerto) {
  console.error(`RECUSADO: PB_RECRIAR=«${pedido}» não é o nome de nenhuma casa deste servidor.`);
  console.error(`Servidor: ${URL_DO_SERVIDOR}`);
  console.error(`Casa(s) lá dentro: ${nomesVivos.map(n => `«${n}»`).join(', ')}.`);
  console.error('Uma reconstrução total apaga a casa, os membros e a autorização da agenda');
  console.error('da Google — que não se recupera de cópia nenhuma. Para a pedir, escreva o');
  console.error('nome exacto da casa a destruir:');
  console.error(`  PB_RECRIAR="${nomesVivos[0]}" npm run db:colecoes`);
  console.error('Nada foi apagado.');
  // ⚠ E a saída NÃO é um `process.exit(2)`, por mais natural que pareça.
  //
  // O `simular-casa.mjs` recusa ANTES de falar com o servidor e o `exit(2)`
  // dele sai limpo. Aqui a recusa só se sabe DEPOIS do `authWithPassword` e
  // dos dois `getFullList` — e um `process.exit()` com as ligações do `fetch`
  // ainda abertas rebenta no Windows, medido e repetível: «Assertion failed:
  // !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76», e o
  // código de saída que chega à consola é 127, não 2. Um guião que anuncia o
  // código 2 em três sítios e devolve 127 com um despejo do libuv parece ter
  // ido abaixo em vez de ter recusado.
  //
  // `exitCode` + uma promessa que nunca resolve: nada mais deste ficheiro
  // corre, o ciclo de eventos esvazia-se sozinho e o processo sai com 2.
  process.exitCode = 2;
  await new Promise(() => {});
}

const casaHabitada = !nomeBateCerto && casasVivas.length > 0 && membrosVivos.length > 0;
if (nomeBateCerto) {
  console.log(`RECONSTRUÇÃO TOTAL pedida pelo nome: «${pedido}».`);
  console.log('Apago as coleções todas, `casas`, `membros` e `credenciais_agenda` incluídas.\n');
}
if (casaHabitada) {
  console.log(`Casa habitada: «${casasVivas[0].nome}», ${membrosVivos.length} membro(s).`);
  console.log('Reaproveito `casas` e `membros`; recrio o resto e aplico as regras.');
  console.log(`Para apagar tudo mesmo, pelo nome: PB_RECRIAR="${casasVivas[0].nome}" npm run db:colecoes\n`);
}
// ⚠ `credenciais_agenda` também se preserva, e custou aprendê-lo. Pu-la na
// lista de limpeza para a ordem de apagamento funcionar, e na primeira
// execução apagou-a — levando o `refresh_token` da agenda da Google. Esse não
// se recupera de uma cópia: recupera-se voltando à Google a autorizar.
//
// Preservar `membros` e `casas` e não isto era guardar a conta e perder o que
// a conta tinha autorizado.
// ── ⚠ E uma coleção COM DADOS também não se apaga ────────────────────────────
//
// A lista acima era de três nomes escolhidos à mão, e chegava enquanto as
// outras coleções estavam vazias: até esta semana o cliente escrevia em 10 de
// 31, e recriar as outras não custava nada a ninguém.
//
// Deixou de ser verdade. As tarefas, a agenda, as despesas, o cofre, as compras
// e as fichas de saúde da família vivem agora nestas coleções — e este script
// apagava-as e recriava-as a cada execução, o que quer dizer que aplicar uma
// mudança de regra levava atrás o que a casa tinha escrito.
//
// Hoje a casa «Madeira» tinha zero linhas em todas elas e não se perdeu nada.
// Amanhã não é o caso, e uma salvaguarda que depende de a casa estar vazia não
// é uma salvaguarda — é o mesmo «sobreviveu por ACIDENTE» de 03/09/2026, que
// está escrito aqui em cima como lição aprendida.
//
// Agora preserva-se o que TEM LINHAS. O esquema e as regras aplicam-se por
// `update`, como já acontecia com o `casas` e o `membros` — que é a razão pela
// qual alguém corre isto depois do primeiro dia.
//
// Para uma reconstrução total e deliberada: `PB_RECRIAR` com o NOME da casa.
const existentes = await pb.collections.getFullList();

const temLinhas = async (nome) => {
  try {
    const r = await pb.collection(nome).getList(1, 1);
    return r.totalItems > 0;
  } catch { return false; }
};

const comDados = [];
if (casaHabitada) {
  for (const nome of NOSSAS) {
    const c = existentes.find(x => x.name === nome);
    if (!c) continue;
    // ⚠ Uma VISTA nunca se preserva, por muitas linhas que responda.
    //
    // Ela não tem dados nenhuns: é uma consulta sobre as coleções de base, e as
    // «linhas» que devolve são as delas. Preservá-la fazia duas coisas erradas
    // ao mesmo tempo — deixava a consulta ANTIGA no sítio quando o SQL mudava,
    // e, porque uma coleção não se apaga enquanto outra a referir, impedia
    // apagar as coleções que ela lê. Foi assim: o `v_acerto_saldo` apareceu na
    // lista de preservadas e a limpeza parou com «Failed to delete collection».
    if (c.type === 'view') continue;
    if (await temLinhas(nome)) comDados.push(nome);
  }
}

const PRESERVAR = casaHabitada
  ? [...new Set(['membros', 'casas', 'credenciais_agenda', ...comDados])]
  : [];

if (comDados.length) {
  console.log(`Com dados, preservadas: ${comDados.join(', ')}`);
}

for (const nome of NOSSAS) {
  if (PRESERVAR.includes(nome)) continue;
  const c = existentes.find(x => x.name === nome);
  if (c) await pb.collections.delete(c.id);
}
if (casaHabitada) {
  ids.casas = existentes.find(x => x.name === 'casas').id;
  ids.membros = existentes.find(x => x.name === 'membros').id;
}

// Cria a coleção — ou ATUALIZA-A, quando ela sobreviveu à limpeza por ter
// linhas dentro. As regras e os campos aplicam-se nos dois caminhos, que é o
// que faz correr isto depois do primeiro dia ter algum efeito.
//
// ⚠ Os campos fundem-se pelo nome, como no `aplicarCampos`: o que já lá está
// mantém-se — senão um `update` com a lista nova apagava as colunas antigas e,
// com elas, os dados —, o que é novo entra, e o que mudou de limites é
// substituído.
const criar = async (def) => {
  const vivo = PRESERVAR.includes(def.name)
    ? (await pb.collections.getFullList()).find(x => x.name === def.name)
    : null;

  if (vivo) {
    const porNome = new Map((vivo.fields || []).map(f => [f.name, f]));
    for (const novo of def.fields || []) {
      porNome.set(novo.name, { ...porNome.get(novo.name), ...novo });
    }
    const { name, type, fields, ...resto } = def;
    try {
      await pb.collections.update(vivo.id, { ...resto, fields: [...porNome.values()] });
    } catch (e) {
      console.error(`FALHOU ao atualizar ${def.name}:`, JSON.stringify(e.response?.data || e.message));
      throw e;
    }
    ids[def.name] = vivo.id;
    return vivo;
  }

  let c;
  try { c = await pb.collections.create(def); }
  catch (e) {
    console.error(`FALHOU ${def.name}:`, JSON.stringify(e.response?.data || e.message));
    throw e;
  }
  ids[def.name] = c.id;
  return c;
};

// ── Uma coleção preservada continua a receber o esquema ──────────────────────
//
// ⚠ Isto faltava, e é um defeito com forma de silêncio. Numa casa habitada, o
// `casas` e o `membros` são PRESERVADOS — não se apagam, para não levar a conta
// de quem lá vive e a autorização da agenda. Mas «preservado» estava a
// significar «intocado»: os campos novos que este ficheiro define nunca lhes
// chegavam.
//
// Encontrei-o em 04/09/2026 ao acrescentar `pontos_ligados` ao `casas` e ao
// baixar o mínimo do `valor_ponto`. Corri o script, ele disse «criadas», e as
// duas alterações não estavam lá. Numa base vazia funcionava; na casa a sério —
// a única que interessa — não fazia nada.
//
// Agora os campos aplicam-se por `update` quando a coleção é preservada, tal
// como as regras do `membros` já se aplicavam. Fundem-se pelo nome: o que já lá
// está mantém-se, o que é novo entra, e o que mudou de limites é substituído.
const aplicarCampos = async (nome, campos) => {
  const c = (await pb.collections.getFullList()).find(x => x.name === nome);
  if (!c) return;
  const porNome = new Map(c.fields.map(f => [f.name, f]));
  for (const novo of campos) porNome.set(novo.name, { ...porNome.get(novo.name), ...novo });
  await pb.collections.update(c.id, { fields: [...porNome.values()] });
  ids[nome] = c.id;
};

// ── A casa ───────────────────────────────────────────────────────────────────
// Sem regras ainda: membros ainda não existe para as poder referir.
const CAMPOS_DA_CASA = [
    txt('nome', { required: true }),
    num('rendimento_mensal', { min: 0 }),
    // O orçamento por mês ou para o ano: `{ modo, ano, total, meses }`. Ausente
    // lê-se como mensal — é o que a casa sempre fez. Nasce também na tabela
    // `CAMPOS` do `acrescentar-campos.mjs`.
    json('orcamento'),
    // O carimbo do último «Começar de Zero» (escrito pelo hook `limpar-casa`).
    // Cada aparelho compara-o com o que viu e apaga a cópia local se é novo.
    // Nasce também na tabela `CAMPOS` do `acrescentar-campos.mjs`.
    txt('zerado_em', { max: 40 }),
    // §4: o valor do ponto é validado no SERVIDOR, não só no campo.
    //
    // ⚠ Mínimo 0, e não 0,01. Os pontos passaram a ser opcionais em
    // 04/09/2026, e com eles o valor pode ser zero: uma casa pode querer os
    // pontos como CONTAGEM e não como dinheiro. Eu baixei o mínimo no ecrã e
    // deixei o servidor em 0,01 — a escolha de 0 € era aceite no telefone e
    // recusada ao subir, que é a mesma forma de falha silenciosa do
    // `tarefas_feitas`. Os dois lados dizem agora a mesma coisa.
    num('valor_ponto', { min: 0, max: 5 }),
    num('dia_pagamento', { min: 0, max: 6, onlyInt: true }),
    bool('divide_meias'),
    // O interruptor dos pontos. Ausente lê-se como LIGADO, do lado do cliente,
    // porque é o que a app fazia antes de ele existir.
    bool('pontos_ligados'),
    // O interruptor da ementa da semana (12/09/2026, a pedido do dono da casa:
    // «esta função deverá ser opcional»). ⚠ Pela NEGATIVA, e não por acaso: um
    // `bool` acrescentado a uma coleção COM LINHAS nasce a `false` em todas —
    // um `ementa_ligada` desligava a ementa à casa a sério no instante em que
    // o campo lá chegou (aconteceu, e a prova apanhou-o). O `pontos_ligados`
    // escapou por ter sido semeado a `true`. Com `ementa_desligada`, o `false`
    // de nascença É o estado que se quer, no servidor e na loja, sem ninguém
    // ter de «ler ausente como ligado». Desligar não apaga pratos nem jantares.
    // Nasce também na tabela `CAMPOS` do `acrescentar-campos.mjs`.
    bool('ementa_desligada'),
    // O interruptor dos ícones dos corredores (25/09/2026, a pedido do dono da
    // casa: «deve haver uma opção slider a dizer sem ícones»). ⚠ Pela NEGATIVA,
    // pela MESMA razão do `ementa_desligada` logo acima — e aqui custava ainda
    // mais caro: `icones_ligados` nasceria a `false` e todas as casas que já
    // tinham escolhido ícones perdiam-nos do ecrã no instante em que o campo
    // chegasse ao servidor, sem ninguém ter mexido em nada. Desligar não apaga
    // escolha nenhuma: o `seccoes.icone` fica, e voltar a ligar traz tudo.
    // Nasce também na tabela `CAMPOS` do `acrescentar-campos.mjs`.
    bool('icones_desligados'),
];

if (casaHabitada) await aplicarCampos('casas', CAMPOS_DA_CASA);
else await criar({ name: 'casas', type: 'base', fields: CAMPOS_DA_CASA });

// ── Membros ──────────────────────────────────────────────────────────────────
// Coleção de AUTENTICAÇÃO. É a peça central da tradução: o PocketBase já faz
// hash das palavras-passe com bcrypt e verifica-as no servidor, portanto o PIN
// de uma criança é a palavra-passe dela — e §3.2 fica satisfeita sem escrever
// criptografia nenhuma. O valor correto nunca chega ao dispositivo.
// ⚠ O prazo do token, escrito e não deixado ao acaso.
//
// Estava nos cinco dias por omissão do PocketBase, e nada o renovava: ao fim
// deles a app atirava a pessoa para o ecrã de entrada e obrigava-a a repetir a
// janela de consentimento da Google. Numa app de casa, entrar é a parte que
// mais custa e a que menos se devia repetir.
//
// Trinta dias, e o cliente pede um token novo a cada arranque (`renovarSessao`
// em `src/pocketbase.js`) — quem usa a app nunca chega ao prazo, e quem a
// deixar um mês fechada entra outra vez, que é razoável.
//
// ⚠ E fica AQUI, no `REGRAS_MEMBROS`, para se aplicar também numa casa
// habitada: é o único caminho que a coleção `membros` percorre quando este
// script corre pela segunda vez.
const DURACAO_TOKEN = 30 * 24 * 60 * 60;

const REGRAS_MEMBROS = {
  listRule: 'casa = @request.auth.casa',
  viewRule: 'casa = @request.auth.casa',
  createRule: '@request.auth.papel = "admin" && casa = @request.auth.casa',
  updateRule: '@request.auth.papel = "admin" && casa = @request.auth.casa',
  deleteRule: '@request.auth.papel = "admin" && casa = @request.auth.casa',
  authToken: { duration: DURACAO_TOKEN },
};
if (casaHabitada) {
  // A coleção fica; as regras aplicam-se, que é para isso que se corre isto.
  await pb.collections.update(ids.membros, REGRAS_MEMBROS);
} else await criar({
  name: 'membros', type: 'auth',
  authToken: { duration: DURACAO_TOKEN },
  // Os adultos entram por e-mail. As crianças não têm e-mail nem conta própria
  // — §8 pede que assim continue — por isso entram por `login`, um
  // identificador interno «casa_nome». O campo de identidade tem de ser único
  // em toda a coleção, e `nome` não pode ser: duas casas podem ter um Léo.
  passwordAuth: { enabled: true, identityFields: ['email', 'login'] },
  fields: [
    txt('nome', { required: true }),
    txt('login', { required: true }),
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    sel('papel', ['admin', 'adulto', 'crianca'], { required: true }),
    txt('cor'),
    // ⚠ O avatar (a fotografia da Google, em texto) e a figura escolhida
    // («cachos», «gato»…) só existiam na tabela do `acrescentar-campos.mjs`:
    // uma base criada DO ZERO nascia sem eles, a app escrevia-os e o PocketBase
    // ignorava-os em silêncio. Apanhado em 13/09/2026 ao levantar um servidor
    // temporário para a casa simulada — a regra dos DOIS sítios, outra vez.
    txt('avatar', { max: 500 }),
    txt('figura', { max: 24 }),
    // O género gramatical é uma propriedade da pessoa, não coisa que se
    // adivinhe do nome — a app tinha três sítios a fazer `nome === 'Rita'` e
    // um deles escrevia «Saúde do Mia». Fica ao lado do nome, no servidor,
    // porque é a casa que sabe como cada membro quer ser tratado.
    bool('fem'),
    // Se a criança já tem PIN. O PocketBase não diz se uma palavra-passe está
    // definida, e a app precisava de o saber para o escolhedor da entrada
    // («Ainda sem PIN — pedir a um adulto») e para a Gestão — lia-o de um
    // resumo LOCAL, que só existia no telemóvel onde o PIN fora posto. É o
    // hook `membros.pb.js` e a rota `pin.pb.js` que o põem a verdadeiro;
    // ninguém o escreve pela coleção. (09/09/2026 — o dono da casa: «tudo
    // deve ser guardado no servidor».)
    bool('pin_definido'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_membro_login ON membros (login)'],
  listRule: 'casa = @request.auth.casa',
  viewRule: 'casa = @request.auth.casa',
  // Um administrador acrescenta membros à SUA casa, e mais ninguém. Estava
  // `null` — só superutilizador —, o que impedia a app de ter um ecrã de
  // membros: quem administra a casa não conseguia acrescentar nem a própria
  // filha. As guardas do que se pode criar continuam nos hooks (qualidade do
  // PIN, palavra-passe de adulto, e-mail só para adultos).
  createRule: '@request.auth.papel = "admin" && casa = @request.auth.casa',
  updateRule: '@request.auth.papel = "admin" && casa = @request.auth.casa',
  deleteRule: '@request.auth.papel = "admin" && casa = @request.auth.casa',
});

// Os campos de sistema da autenticação vêm com `password` a exigir 8 caracteres
// e `email` obrigatório. Um PIN tem quatro dígitos, e uma criança não tem
// e-mail — §8 pede que assim continue. Ajustam-se depois de criar.
if (!casaHabitada) {
  const c = (await pb.collections.getFullList()).find(x => x.name === 'membros');
  await pb.collections.update(c.id, {
    fields: c.fields.map(f => {
      if (f.name === 'password') return { ...f, min: 4 };
      if (f.name === 'email') return { ...f, required: false };
      return f;
    }),
  });
}

// ── Entrar com Google ────────────────────────────────────────────────────────
// O PocketBase trata do OAuth2; nós só lhe damos as credenciais. Elas vêm do
// ambiente e nunca do código — ver .env.example e docs/GOOGLE_CALENDAR_SETUP.md.
//
// Repare no que NÃO se ativa: `createRule` de `membros` continua nulo, portanto
// entrar com Google não cria conta. Num app familiar não há inscrição livre —
// um administrador acrescenta o membro com o e-mail, e o Google só confirma que
// é mesmo essa pessoa. Quem chegar sem convite é recusado, e é o que se quer.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const c = (await pb.collections.getFullList()).find(x => x.name === 'membros');
  await pb.collections.update(c.id, {
    oauth2: {
      enabled: true,
      providers: [{
        name: 'google',
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }],
      // O nome vem do perfil Google; o resto é da casa e não se deixa mapear.
      mappedFields: { name: 'nome' },
    },
  });
  console.log('OAuth do Google: ativado');
} else {
  // ⚠ Isto dizia «fica desativado», e é falso: este ramo não faz NADA. O que
  // já estivesse configurado na coleção `membros` fica como estava — e numa
  // casa habitada a coleção é preservada, portanto a entrada pela Google
  // continua a funcionar. A frase antiga fez-me acreditar que eu tinha
  // desligado a entrada do dono da casa, em 04/09/2026, e ir confirmar custou
  // uma volta. Uma mensagem que descreve o que o código não fez é um defeito.
  console.log('OAuth do Google: sem credenciais no ambiente — deixo como está');
}

await pb.collections.update(ids.casas, {
  listRule: 'id = @request.auth.casa',
  viewRule: 'id = @request.auth.casa',
  updateRule: 'id = @request.auth.casa && @request.auth.papel = "admin"',
});

// Atalhos usados em quase todas as regras.
const DA_CASA = 'casa = @request.auth.casa';

// ⚠ O `DA_CASA` sozinho NÃO CHEGA quando a linha tem relações.
//
// O campo `casa` é escolhido por quem escreve: uma regra que verifique só a
// etiqueta que o autor pôs deixa apontar as relações para dentro de outra casa.
// Este defeito apareceu CINCO vezes entre 04 e 05/09/2026, sempre com a mesma
// forma, e sempre encontrado por acaso — até o dono da casa perguntar porque é
// que eu não olhava com atenção e resolvia de vez.
//
// A resposta é esta função, e a prova genérica em
// `provar-relacoes-ancoradas.mjs`, que ENUMERA as coleções em vez de as listar.
//
// Uma relação vazia passa: `= ""` é como o PocketBase diz «não preenchida».
const daCasaTambem = (...campos) =>
  campos.map(c => `(${c} = "" || ${c}.casa = @request.auth.casa)`).join(' && ');
const ADULTO = '@request.auth.papel != "crianca"';
const ADMIN = '@request.auth.papel = "admin"';

// ── Agenda ───────────────────────────────────────────────────────────────────
//
// ⚠ Isto tinha `partilhado`, um BOOLEANO, e a app tem TRÊS níveis desde que os
// eventos ganharam o `visibilidade`: `so-eu`, `adultos`, `familia`. O booleano
// não sabe dizer o do meio, e o do meio é o que mais importa:
//
//   a consulta de uma criança entra na agenda como «adultos» — os dois adultos
//   vêem-na, a criança não, e é isso que o ecrã da Saúde promete em letras.
//
// Com um booleano, essa consulta ou passava a `partilhado: true` e a criança
// via a própria consulta, ou ficava em `false` e o outro adulto deixava de a
// ver. As duas hipóteses são erradas, e a primeira é uma fuga.
//
// Por isso o campo é um `select` com os três valores, e a regra abaixo é a
// TRADUÇÃO LITERAL do `podeVerEvento` do cliente:
//
//   o dono vê sempre o seu           autor = @request.auth.id
//   `familia`  qualquer membro       visibilidade = "familia"
//   `adultos`  só quem não é criança visibilidade = "adultos" && papel != crianca
//   `so-eu`    mais ninguém          (nenhum dos ramos acima)
//
// Não havia dados a migrar: nada escrevia nesta coleção. O `partilhado` sai em
// vez de ficar a acumular um segundo sítio onde a visibilidade vive.
const EVENTO_VISIVEL = `${DA_CASA} && (autor = @request.auth.id`
  + ` || visibilidade = "familia"`
  + ` || (visibilidade = "adultos" && ${ADULTO}))`;

// ⚠ E as RELAÇÕES têm de ser da mesma casa, não só a linha.
//
// O `casa` da linha é escolhido por quem escreve, e sozinho não prova nada — é
// o buraco que os anexos tinham desde o primeiro dia. Aqui há duas relações que
// apontam para dentro da casa, e as provas mostraram que as duas passavam:
//
//   `responsavel`  uma adulta de outra casa punha o nome do Léo num evento dela
//   `episodio`     e ligava um evento dela a uma consulta desta casa
//
// Nenhuma das duas devolvia dados nossos — mas as duas escrevem no nosso lado
// da relação a partir de fora, e é a mesma forma de defeito. Uma relação vazia
// passa: `= ""` é como o PocketBase diz «não preenchida».
//
// ⚠ Em DUAS partes, e é obrigatório: a regra não pode nomear um campo que a
// coleção ainda não tem. O `episodio` só se acrescenta mais abaixo, e pôr o
// `episodio = ""` aqui rebentava com «invalid left operand "episodio" —
// unknown field». A segunda metade entra com o campo.
const RESPONSAVEL_DA_CASA = `(responsavel = "" || responsavel.casa = @request.auth.casa)`;
const EPISODIO_DA_CASA = `(episodio = "" || episodio.casa = @request.auth.casa)`;

await criar({
  name: 'eventos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    data('dia', { required: true }),
    txt('hora'),
    txt('titulo', { required: true }),
    // Quem o evento diz respeito — o «quem» da linha da agenda.
    rel('responsavel', ids.membros),
    // O DONO. O `podeVerEvento` do cliente chama-lhe `owner`, e é ele que a
    // regra usa: numa consulta de criança o dono é o adulto que marcou, de
    // propósito, senão a criança veria a própria consulta por ser dona dela.
    rel('autor', ids.membros, { required: true }),
    sel('visibilidade', ['so-eu', 'adultos', 'familia']),
    txt('etiqueta'),
    // ⚠ O `episodio` NÃO está aqui, e não é esquecimento: os
    // `episodios_saude` só se criam mais abaixo neste ficheiro, portanto o
    // `ids.episodios_saude` ainda é `undefined` nesta linha — e o PocketBase
    // aceitaria uma relação para o vazio sem se queixar. O campo acrescenta-se
    // depois de eles existirem; procure «a agenda aprende a saúde».
  ],
  // §5: um evento privado de outro membro NÃO é devolvido. Filtrar no cliente
  // era vazar com atraso.
  listRule: EVENTO_VISIVEL,
  viewRule: EVENTO_VISIVEL,
  // ⚠ Criar exige ADULTO e ser o próprio autor. Uma criança não põe eventos na
  // agenda da casa, e ninguém cria um evento em nome de outra pessoa.
  createRule: `${DA_CASA} && ${ADULTO} && autor = @request.auth.id && ${RESPONSAVEL_DA_CASA}`,
  // Alterar e apagar: só o dono. É mais apertado do que o cliente, que deixa
  // qualquer adulto corrigir a hora de uma reunião de pais — e essa folga fica
  // por decidir, não se abre aqui por omissão.
  updateRule: `${DA_CASA} && autor = @request.auth.id && ${RESPONSAVEL_DA_CASA}`,
  deleteRule: `${DA_CASA} && autor = @request.auth.id`,
});

// ── Tarefas ──────────────────────────────────────────────────────────────────
await criar({
  name: 'tarefas', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('titulo', { required: true }),
    rel('atribuido_a', ids.membros),
    sel('recorrencia', ['uma_vez', 'diaria', 'dias_semana']),
    num('pontos', { min: 0, max: 20, onlyInt: true }),
    num('urgencia', { min: 0, max: 2, onlyInt: true }),
    data('prazo'),
    // ⚠ O posto que a MÃO deu à tarefa ao arrastá-la, dentro do grupo de
    // urgência — e é da CASA, não de quem está a olhar.
    //
    // Ficou por decidir durante dois dias, e a decisão é esta: a lista é a
    // mesma lista para toda a gente. Se a ordem fosse de cada um, a Rita
    // arrastava «Levar o lixo» para cima e o Tomás continuava a vê-la em
    // terceiro — os dois a falar da «primeira tarefa» a pensar em tarefas
    // diferentes. A urgência e o prazo já são da casa (INVARIANTE #6); a ordem
    // dentro do grupo é a mesma espécie de coisa.
    //
    // Não é um saldo, é um atributo: dois telefones a arrastar ao mesmo tempo
    // ficam com a ordem de quem escreveu por último, como já acontece com a
    // urgência. O INVARIANTE #2 é sobre SOMAS, e uma ordem não se soma.
    //
    // ⚠ Os postos contam de UM, e zero quer dizer «sem posto».
    //
    // Não é uma preferência: um campo `number` do PocketBase não é anulável.
    // Escrevi `posto: null` a desarrumar uma tarefa e ele guardou 0 — e uma
    // tarefa nova, que nunca foi arrastada, também nasce a 0. Com postos a
    // contar de zero, TODAS as tarefas do grupo liam-se como estando em
    // primeiro lugar, empatadas, e a lista saía por ordem qualquer.
    //
    // É o mesmo tipo de armadilha dos campos que o PocketBase ignora em
    // silêncio: não dá erro, dá um valor que parece bom.
    //
    // Sem posto, a tarefa não entra no mapa da loja e ordena-se pelo prazo.
    num('posto', { min: 0, onlyInt: true }),
  ],
  listRule: DA_CASA, viewRule: DA_CASA,
  // ⚠ `atribuido_a` tem de ser da casa, não só a linha. Sem isto, uma adulta de
  // outra casa atribuía uma tarefa a uma criança desta — a mesma forma de
  // defeito dos anexos e dos eventos, na terceira coleção. Provado em
  // provar-agenda-e-tarefas.mjs.
  createRule: `${DA_CASA} && ${ADULTO} && (atribuido_a = "" || atribuido_a.casa = @request.auth.casa)`,
  updateRule: `${DA_CASA} && ${ADULTO} && (atribuido_a = "" || atribuido_a.casa = @request.auth.casa)`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

// ADITIVA: uma linha por (tarefa, dia). Os pontos só contam com confirmada_em.
await criar({
  name: 'tarefas_feitas', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('tarefa', ids.tarefas, { required: true, cascadeDelete: true }),
    data('data', { required: true }),
    rel('marcada_por', ids.membros, { required: true }),
    rel('confirmada_por', ids.membros),
    data('confirmada_em'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_tarefa_dia ON tarefas_feitas (tarefa, data)'],
  listRule: DA_CASA, viewRule: DA_CASA,
  // §4: qualquer membro conclui, mas só a si atribuída — E um adulto conclui
  // qualquer uma.
  //
  // ⚠ A segunda metade faltava, e a app fazia-a: o `tapTask` deixa um adulto
  // dar uma tarefa por feita, seja de quem for, e é assim que uma mãe marca a
  // tarefa que viu o filho fazer. Sem ela, a marcação de um adulto sobre a
  // tarefa de uma criança era recusada pelo servidor e caía na fila — ficava
  // marcada no telefone dela e por fazer no dele, em silêncio. Apanhado pela
  // prova de ponta a ponta em 04/09/2026.
  //
  // O `marcada_por = @request.auth.id` fica em qualquer caso: ninguém marca em
  // nome de outra pessoa, e é isso que impede uma criança de marcar a tarefa da
  // irmã assinando com o nome dela.
  // ⚠ `tarefa.casa` e não só `casa`. Pela TERCEIRA vez o mesmo defeito de
  // forma: o `casa` da linha é escolhido por quem escreve e não prova nada.
  // Aconteceu nos anexos, nos eventos, e aqui — e aqui só apareceu depois de
  // eu alargar a regra a «ou é adulto», porque a vizinha de outra casa TAMBÉM
  // é adulta. A regra apertada escondia-o.
  //
  // A lição, escrita onde se lê: quando uma regra fala de uma RELAÇÃO, tem de
  // perguntar de que casa é a relação, não de que casa se diz a linha.
  // ⚠ E o `confirmada_por` ancorado (12/09/2026): o guarda das relações
  // passou a ver as relações para `membros` e apanhou-o solto, ao criar e ao
  // alterar — e o `marcada_por` solto ao alterar. Nos dois sítios.
  createRule: `${DA_CASA} && tarefa.casa = @request.auth.casa`
    + ` && marcada_por = @request.auth.id`
    + ` && (confirmada_por = "" || confirmada_por.casa = @request.auth.casa)`
    + ` && (tarefa.atribuido_a = @request.auth.id || ${ADULTO})`,
  // a confirmação que valida os pontos exige adulto
  updateRule: `${DA_CASA} && tarefa.casa = @request.auth.casa && ${ADULTO}`
    + ` && marcada_por.casa = @request.auth.casa`
    + ` && (confirmada_por = "" || confirmada_por.casa = @request.auth.casa)`,
  // Desmarcar APAGA a linha (INVARIANTE #2). Um adulto apaga qualquer uma; a
  // criança apaga só a que ELA marcou e ninguém confirmou ainda — foi ela que
  // a pôs, e enquanto está «a confirmar» é dela. Uma linha confirmada é
  // pontos contados: desfazê-la é de adulto. (10/09/2026, ao ligar a marcação
  // da criança ao servidor.)
  deleteRule: `${DA_CASA} && tarefa.casa = @request.auth.casa`
    + ` && (${ADULTO} || (marcada_por = @request.auth.id && confirmada_em = ""))`,
});

// ── Dinheiro ─────────────────────────────────────────────────────────────────
await criar({
  name: 'envelopes', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true }),
    num('limite_base', { min: 0 }),
    txt('cor'),
  ],
  // §5: «invisíveis a perfis de criança — AUSENTES DA RESPOSTA».
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADMIN}`,
  updateRule: `${DA_CASA} && ${ADMIN}`,
  deleteRule: `${DA_CASA} && ${ADMIN}`,
});

// ── As contas fixas ──────────────────────────────────────────────────────────
//
// A renda, a luz, a internet: o que se paga todos os meses no mesmo dia. A
// linha é a DEFINIÇÃO — nome, valor, dia do mês, envelope, quem paga. «Paga
// este mês» NÃO é um campo: é a existência de uma `despesas` deste mês com o
// `conta_fixa` a apontar para cá (INVARIANTE #2 — um estado que se soma, não
// que se escreve). Pagar duas vezes no mesmo mês colide na chave de
// idempotência da despesa, `conta-fixa:<id>:<AAAA-MM>`, que é o índice único
// `(casa, idem_key)` que as despesas já tinham. (12/09/2026 — a quarta das dez
// funcionalidades.)
//
// É orçamento: a criança não lê (§5, «ausentes da resposta»). Os adultos
// escrevem. ⚠ `envelope.casa` e `quem_paga.casa`, e não só o `casa` da linha —
// a forma de defeito que já apareceu doze vezes nesta base.
await criar({
  name: 'contas_fixas', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true, max: 60 }),
    num('valor', { required: true, min: 0.01 }),
    num('dia', { required: true, min: 1, max: 31, onlyInt: true }),
    rel('envelope', ids.envelopes, { required: true }),
    rel('quem_paga', ids.membros),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_conta_fixa_por_casa ON contas_fixas (casa, nome)'],
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADULTO} && envelope.casa = @request.auth.casa`
    + ` && (quem_paga = "" || quem_paga.casa = @request.auth.casa)`,
  updateRule: `${DA_CASA} && ${ADULTO} && envelope.casa = @request.auth.casa`
    + ` && (quem_paga = "" || quem_paga.casa = @request.auth.casa)`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

await criar({
  name: 'despesas', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('envelope', ids.envelopes, { required: true }),
    num('valor', { required: true }),
    txt('descricao'),
    data('data'),
    rel('pagador', ids.membros, { required: true }),
    bool('divide_meias'),
    // Corrigir é ANULAR e recriar, nunca editar o valor.
    txt('anula_id'),
    // §6: chave de idempotência. Um reenvio colide em vez de duplicar.
    txt('idem_key'),
    // A conta fixa que esta despesa paga, quando é o caso (12/09/2026). Apagar
    // a conta NÃO leva a despesa: o dinheiro saiu, e fica no envelope — a
    // relação é opcional e sem cascata, e o PocketBase limpa-a ao apagar.
    // ⚠ O sexto campo que nasceu nos DOIS sítios — a tabela `CAMPOS` do
    // `acrescentar-campos.mjs` tem a mesma linha.
    rel('conta_fixa', ids.contas_fixas),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_despesa_idem ON despesas (casa, idem_key)'],
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  // ⚠ `envelope.casa` e `pagador.casa`, e não só o `casa` da linha. Pela QUINTA
  // vez o mesmo defeito de forma: o `casa` da linha é escolhido por quem
  // escreve e não prova nada. Uma adulta de outra casa lançava uma despesa
  // contra um envelope DESTA — e o orçamento desta casa mostrava-a gasta.
  // E o `conta_fixa.casa` pela mesma razão — é uma regra que mudou depois da
  // base, e por isso está também na tabela `REGRAS` do `acrescentar-campos`.
  createRule: `${DA_CASA} && ${ADULTO} && pagador.papel != "crianca"`
    + ` && envelope.casa = @request.auth.casa && pagador.casa = @request.auth.casa`
    + ` && (conta_fixa = "" || conta_fixa.casa = @request.auth.casa)`,
  updateRule: null,     // não se edita uma despesa; anula-se
  deleteRule: null,
});

// INVARIANTE #2: tabela de inserções. Sem updateRule nem deleteRule — não há
// regra que os permita, portanto o servidor recusa-os.
await criar({
  name: 'cofre_movimentos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('membro', ids.membros, { required: true }),
    sel('tipo', ['semanada', 'bonus', 'retirada'], { required: true }),
    num('valor', { required: true }),
    // ⚠ Os PONTOS que este movimento pagou — e é por isto que o `paidPts`
    // deixa de ser um campo escrito.
    //
    // «Quantos pontos de cada criança já foram pagos» era uma soma guardada no
    // telefone de quem pagou, e mais nada. A Rita pagava a semanada ao Léo: a
    // linha do cofre subia, o `paidPts` dela subia, e o telemóvel do Tomás
    // continuava a dizer que o Léo tinha catorze pontos por pagar. Ele pagava
    // outra vez. Dinheiro a sério, duas vezes, sem erro nenhum no ecrã.
    //
    // Agora os pontos pagos são a SOMA deste campo sobre os movimentos da
    // criança — aditiva, como o INVARIANTE #2 manda, e igual nos dois
    // telefones porque é a mesma soma sobre as mesmas linhas.
    //
    // E guarda-se o número, não se divide o valor pelo `valor_ponto`: o valor
    // do ponto muda, e catorze pontos pagos a 0,10 € continuam a ser catorze
    // pontos depois de a casa o mudar para 0,15 €.
    num('pontos'),
    txt('motivo'),
    rel('autorizado_por', ids.membros),
    data('data'),
    txt('idem_key'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_cofre_idem ON cofre_movimentos (casa, idem_key)'],
  // Adultos inserem; a criança lê o SEU cofre e mais nada.
  listRule: `${DA_CASA} && (${ADULTO} || membro = @request.auth.id)`,
  viewRule: `${DA_CASA} && (${ADULTO} || membro = @request.auth.id)`,
  // ⚠ `membro.casa` e `autorizado_por.casa` (12/09/2026): sem eles, uma adulta
  // de outra casa escrevia um movimento no cofre de uma criança desta — a
  // etiqueta `casa` era a dela e o `membro.papel = "crianca"` era verdade. O
  // guarda das relações ancoradas não o via porque saltava as relações para
  // `membros`. Nos dois sítios.
  createRule: `${DA_CASA} && ${ADULTO} && membro.casa = @request.auth.casa && membro.papel = "crianca"`
    + ` && (autorizado_por = "" || autorizado_por.casa = @request.auth.casa)`,
  updateRule: null,
  deleteRule: null,
});

// ── Equipamentos ─────────────────────────────────────────────────────────────
await criar({
  name: 'equipamentos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true }),
    txt('categoria'),
    data('comprado_em'),
    txt('loja'),
    num('preco', { min: 0 }),
    data('garantia_ate'),
    txt('manutencao'),
    data('manutencao_ate'),
    fich('fatura'),
    fich('foto'),
  ],
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADULTO}`,
  updateRule: `${DA_CASA} && ${ADULTO}`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

// ── Os contratos e as renovações ─────────────────────────────────────────────
//
// O seguro do carro, a internet, a inspeção: o que tem um dia em que renova
// ou acaba, e um período de fidelização. Vivem ao lado dos equipamentos, com
// as mesmas regras (adultos; a criança não os recebe) e o documento pelo mesmo
// caminho da fatura — um ficheiro na própria linha, carregado à parte porque a
// fila serializa em JSON. (12/09/2026 — a quinta das dez funcionalidades.)
//
// ⚠ `responsavel.casa`: quem trata do contrato é um adulto DESTA casa. É a
// mesma forma de defeito de sempre — o `casa` da linha é escolhido por quem
// escreve.
await criar({
  name: 'contratos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true, max: 60 }),
    txt('fornecedor', { max: 60 }),
    data('renova_em'),
    data('fidelizacao_ate'),
    rel('responsavel', ids.membros),
    fich('ficheiro'),
  ],
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADULTO} && (responsavel = "" || responsavel.casa = @request.auth.casa)`,
  updateRule: `${DA_CASA} && ${ADULTO} && (responsavel = "" || responsavel.casa = @request.auth.casa)`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

console.log('criadas:', Object.keys(ids).join(', '));

// ── Preferências ─────────────────────────────────────────────────────────────
// Por membro: a Rita pode ter violeta e o Tomás cião ao mesmo tempo.
await criar({
  name: 'preferencias', type: 'base',
  fields: [
    rel('membro', ids.membros, { required: true, cascadeDelete: true }),
    num('esquema_cor', { min: 0, max: 5, onlyInt: true }),
    sel('aspeto', ['claro', 'escuro', 'sistema']),
    bool('resumo_ativo'),
    txt('resumo_hora'),
    num('aviso_prazo_dias', { min: 0, max: 7, onlyInt: true }),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_pref_membro ON preferencias (membro)'],
  // As preferências são de cada um e de mais ninguém.
  listRule: 'membro = @request.auth.id',
  viewRule: 'membro = @request.auth.id',
  createRule: 'membro = @request.auth.id',
  updateRule: 'membro = @request.auth.id',
  deleteRule: 'membro = @request.auth.id',
});

// ── Compras ──────────────────────────────────────────────────────────────────
//
// Os corredores da loja, por que ordem se anda neles.
//
// ⚠ Eram quatro nomes fixos no `data.js` — «Frutas & Legumes», «Frescos»,
// «Mercearia», «Casa» — e a casa não lhes podia tocar. Passam a ser uma lista
// da casa, como as lojas e os envelopes.
//
// O `posto` é a ordem, e conta de UM: um `number` do PocketBase não é anulável,
// e um campo novo nasce a zero em todas as linhas que já existem. Com o posto a
// contar de zero, a lista inteira lia-se empatada em primeiro e saía por ordem
// qualquer — foi o que aconteceu às tarefas.
await criar({
  name: 'seccoes', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true }),
    num('posto', { min: 0, onlyInt: true }),
    // O ícone do corredor, ESCOLHIDO pela família (25/09/2026). Vazio quer
    // dizer «nenhum escolhido», e aí o cliente adivinha pelo nome — ver
    // `src/icone-do-corredor.js`. Guarda-se o NOME do ícone e não um número:
    // um número obrigava as duas pontas a concordar numa ordem, e a lista dos
    // seis há-de mudar.
    txt('icone', { max: 24 }),
  ],
  listRule: DA_CASA, viewRule: DA_CASA,
  createRule: `${DA_CASA} && ${ADULTO}`, updateRule: `${DA_CASA} && ${ADULTO}`, deleteRule: `${DA_CASA} && ${ADULTO}`,
});

await criar({
  name: 'lojas', type: 'base',
  fields: [rel('casa', ids.casas, { required: true, cascadeDelete: true }), txt('nome', { required: true })],
  listRule: DA_CASA, viewRule: DA_CASA,
  createRule: `${DA_CASA} && ${ADULTO}`, updateRule: `${DA_CASA} && ${ADULTO}`, deleteRule: `${DA_CASA} && ${ADULTO}`,
});

await criar({
  name: 'listas_compras', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('loja', ids.lojas), rel('comprador', ids.membros),
    data('planeada_para'), data('fechada_em'),
    // ⚠ O que a ida custou, escrito ao fechar a conta — e é o que faz o
    // histórico das compras existir fora do telefone de quem foi.
    //
    // As últimas dez idas eram o `shopHistory`, uma lista guardada só aqui.
    // Quem não tinha ido às compras via o histórico vazio, e a comparação com a
    // ida anterior — que é para o que ele serve — não funcionava para metade da
    // casa.
    //
    // A despesa também sobe, e é ela que conta para o orçamento. Isto é outra
    // coisa: quanto custou ESTA ida. Derivá-lo da despesa obrigava a caçá-la
    // pelo texto da descrição, que é uma ligação por acaso e não por desenho.
    num('total', { min: 0 }),
  ],
  // A lista é de todos: as crianças também pedem artigos.
  listRule: DA_CASA, viewRule: DA_CASA,
  createRule: `${DA_CASA} && ${ADULTO} && ${daCasaTambem('loja', 'comprador')}`,
  updateRule: `${DA_CASA} && ${ADULTO} && ${daCasaTambem('loja', 'comprador')}`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

await criar({
  name: 'artigos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('lista', ids.listas_compras, { required: true, cascadeDelete: true }),
    txt('rotulo', { required: true }),
    // ⚠ O corredor é uma RELAÇÃO, e o `seccao` numérico fica só para a
    // migração o ler.
    //
    // Era `num('seccao', { min: 0, max: 3 })` — um ÍNDICE, com o máximo preso
    // aos quatro nomes que o `data.js` tinha. Enquanto os nomes fossem fixos
    // isso era inofensivo; a partir do momento em que a casa os pode reordenar
    // ou apagar, um índice passa a apontar para outra coisa e a mercearia toda
    // muda de corredor em silêncio. É o mesmo defeito da grelha de envelopes
    // que mostrava uma lista e aplicava outra.
    //
    // Campo NOVO em vez de mudar o tipo deste: mudar um `number` para relação
    // numa coleção que já tem linhas é pedir ao PocketBase que converta dados a
    // sério, e não há aqui nada que justifique esse risco. O `seccao` fica,
    // por ler, até a migração ter corrido em todo o lado.
    num('seccao', { min: 0, max: 3, onlyInt: true }),
    rel('corredor', ids.seccoes),
    rel('pedido_por', ids.membros),
    sel('estado', ['por_comprar', 'confirmado', 'sem_stock']),
    num('estimativa', { min: 0 }), num('preco_real', { min: 0 }),
    bool('habitual'),
    // ⚠ A ordem em que o artigo aparece DENTRO do corredor, dada pela mão que
    // o arrastou — o mesmo campo, com o mesmo nome e a mesma contagem, que as
    // `tarefas` e as `seccoes` têm.
    //
    // Conta de UM: um `number` do PocketBase não é anulável, e um campo novo
    // nasce a zero em todas as linhas que já existem. Zero é «sem posto», e
    // ordena-se pelo que vier depois. Com a contagem a começar em zero, a
    // lista inteira lia-se empatada em primeiro e saía por ordem qualquer —
    // já aconteceu às tarefas, e está escrito no campo delas.
    num('posto', { min: 0, onlyInt: true }),
    // Quem vê o artigo. `familia` (ou vazio) é a lista de todos; `adultos` é a
    // prenda de anos do Léo, que o Léo não pode ver — e, pelo INVARIANTE #3,
    // não pode sequer CHEGAR ao telemóvel dele. É a regra de leitura que a
    // impõe, não o ecrã. (11/09/2026, a pedido do dono da casa: «prendas com
    // visibilidade».) O quinto campo a nascer nos dois sítios.
    sel('visibilidade', ['familia', 'adultos']),
  ],
  // O estado vive na linha do artigo. Se fosse uma lista de identificadores
  // confirmados, dois telefones na mesma loja anulavam-se; assim, fundem-se.
  //
  // ⚠ A leitura filtra a visibilidade no SERVIDOR: uma criança que peça a
  // lista não recebe as linhas «adultos». Vazio lê-se como «familia», que é o
  // que todas as linhas anteriores a este campo são.
  listRule: `${DA_CASA} && (visibilidade != "adultos" || ${ADULTO})`,
  viewRule: `${DA_CASA} && (visibilidade != "adultos" || ${ADULTO})`,
  createRule: `${DA_CASA} && ${daCasaTambem('lista', 'pedido_por', 'corredor')}`,
  updateRule: `${DA_CASA} && ${daCasaTambem('lista', 'pedido_por', 'corredor')}`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

// ── O registo de alterações da casa ──────────────────────────────────────────
//
// «Quem mudou isto?» é uma pergunta que a OUTRA pessoa faz, e por isso um
// registo só local nunca lhe pode responder. Era o que havia: catorze sítios do
// `store.jsx` a escrever no `s.registo`, cada telefone com o seu, e nenhum a
// saber o que o outro fez.
//
// ── APENDE-SE, não se corrige ────────────────────────────────────────────────
//
// Sem `updateRule` nem `deleteRule`. Um registo que se possa alterar não é um
// registo: quem administra a casa apagaria a linha que diz que se deu
// administração a si próprio. É a mesma decisão dos `cofre_movimentos` e dos
// `acertos`, e pela mesma razão.
//
// ── E não há linhas repetidas para juntar ────────────────────────────────────
//
// A dúvida que ficou escrita era «o que fazer com as repetidas» — e não há
// nenhuma, porque a linha nasce no momento da ACÇÃO, escrita pelo telefone que
// a fez. Não se juntam dois registos; escreve-se um, no sítio onde a coisa
// aconteceu. Juntar históricos é que faria repetidos.
await criar({
  name: 'registo', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('texto', { required: true, max: 300 }),
    rel('quem', ids.membros),
    data('quando'),
    // A ÁREA da casa a que a linha pertence — «Dinheiro», «Tarefas», «Saúde».
    //
    // É ela que faz o registo ser mais do que uma parede de texto: dá o filtro
    // do ecrã e dá o destino ao toque. Sem ela, quarenta linhas leem-se e
    // quatrocentas não.
    //
    // ⚠ Texto e não `select`: os nomes das áreas vivem no `src/registo-app.js`,
    // que é onde a Documentação os escreve, e uma lista de valores fixa aqui
    // era a mesma lista escrita duas vezes — para divergir da primeira vez que
    // alguém acrescentasse uma área. Quem as mantém alinhadas é a prova
    // `__tests__/registo-tem-area-conhecida.test.js`.
    txt('area', { max: 40 }),
  ],
  // ⚠ Adultos. O registo diz quem passou a administrar a casa, quem entrou e
  // quem saiu — é administração da casa, como o orçamento, e uma criança não
  // tem nada que ler a lista de mudanças de papel dos pais.
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  // ⚠ `quem` tem de ser desta casa: sem isso, uma adulta da casa ao lado
  // assinava uma linha do registo desta com o nome de um membro daqui.
  createRule: `${DA_CASA} && ${ADULTO} && (quem = "" || quem.casa = @request.auth.casa)`,
  updateRule: null,
  deleteRule: null,
});

// ── Dinheiro, o resto ────────────────────────────────────────────────────────
await criar({
  name: 'meses', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    data('mes', { required: true }), num('rendimento', { min: 0 }),
    { name: 'limites', type: 'json', maxSize: 20000 },
    data('fechado_em'),
  ],
  listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADMIN}`, updateRule: `${DA_CASA} && ${ADMIN}`, deleteRule: null,
});

// ADITIVA: valor sempre positivo, o sinal vem da direção.
await criar({
  name: 'transferencias', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('de_envelope', ids.envelopes, { required: true }),
    rel('para_envelope', ids.envelopes, { required: true }),
    num('valor', { min: 0.01, required: true }), data('mes'),
    rel('por', ids.membros, { required: true }), txt('idem_key'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_transf_idem ON transferencias (casa, idem_key)'],
  listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
  // ⚠ Os DOIS envelopes têm de ser da casa. Sem isto, uma administradora de
  // outra casa movia dinheiro entre os envelopes desta — apanhado pela prova do
  // orçamento em 05/09/2026, e é a quinta vez que este defeito aparece.
  createRule: `${DA_CASA} && ${ADMIN} && por = @request.auth.id`
    + ` && de_envelope.casa = @request.auth.casa`
    + ` && para_envelope.casa = @request.auth.casa`,
  updateRule: null, deleteRule: null,
});

// ADITIVA: pagamento parcial é permitido, o resto continua em dívida.
await criar({
  name: 'acertos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('de_membro', ids.membros, { required: true }),
    rel('para_membro', ids.membros, { required: true }),
    num('valor', { min: 0.01, required: true }), data('data'), txt('idem_key'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_acerto_idem ON acertos (casa, idem_key)'],
  listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
  // ⚠ As duas pontas ancoradas à casa (12/09/2026): uma adulta de outra casa
  // lançava um acerto entre os adultos DESTA. Nos dois sítios.
  createRule: `${DA_CASA} && ${ADULTO} && de_membro.papel != "crianca" && para_membro.papel != "crianca"`
    + ` && de_membro.casa = @request.auth.casa && para_membro.casa = @request.auth.casa`,
  updateRule: null, deleteRule: null,
});

// ── As metas da família ──────────────────────────────────────────────────────
//
// A DEFINIÇÃO de uma meta: o nome, quanto se quer juntar, e para quando. O que
// já está juntado NÃO vive aqui — ver `meta_movimentos` em baixo.
//
// ⚠ Havia um `num('atual')` nesta linha, e era o INVARIANTE #2 ao contrário: um
// saldo ESCRITO. Dois telefones a reforçar a meta das férias no mesmo dia
// escreviam cada um o seu total, e o último a gravar ganhava — os 50 € do outro
// desapareciam sem erro nenhum. É a mesma forma do `paidPts` que fez pagar a
// semanada duas vezes, e do `status` das compras que anulava o trabalho de quem
// estava no outro corredor.
//
// O campo nunca foi escrito por ninguém: o cliente não tocava nas `metas`, e a
// lista da app era uma constante do `data.js`. Saiu antes de chegar a mentir.
await criar({
  name: 'metas', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true }), num('alvo', { min: 0 }), txt('quando'),
  ],
  // Uma meta é dinheiro da casa: vê-se entre adultos, e quem administra decide.
  listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADMIN}`, updateRule: `${DA_CASA} && ${ADMIN}`, deleteRule: `${DA_CASA} && ${ADMIN}`,
});

// INVARIANTE #2: o que está juntado numa meta é a SOMA destas linhas.
//
// Tabela de inserções, como os `cofre_movimentos` e os `acertos`: sem
// `updateRule` nem `deleteRule`, porque não há regra que os permita e por isso
// o servidor recusa-os. Corrigir é lançar o movimento contrário.
//
// ⚠ E leva `idem_key`, como as outras três: um reenvio da fila colide com o
// índice único em vez de reforçar a meta duas vezes. É a diferença entre uma
// rede que falha e 50 € que aparecem do nada.
await criar({
  name: 'meta_movimentos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('meta', ids.metas, { required: true, cascadeDelete: true }),
    // Sem `min`: um movimento NEGATIVO é como se tira dinheiro de uma meta, e é
    // a única forma de corrigir uma linha que não se pode editar nem apagar.
    num('valor', { required: true }),
    txt('motivo'),
    rel('por', ids.membros),
    data('data'),
    txt('idem_key'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_meta_mov_idem ON meta_movimentos (casa, idem_key)'],
  listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
  // ⚠ `meta.casa` e `por.casa`, e não só o `casa` da linha: o `casa` é escolhido
  // por quem escreve e não prova nada. É a sexta vez que esta forma aparece —
  // ver `provar-relacoes-ancoradas.mjs`.
  // Letra a letra como na tabela `COLECOES` do `acrescentar-campos.mjs`: a
  // `meta` é obrigatória, por isso não leva o «ou vazia» (13/09/2026 — uma
  // base criada do zero recebia a regra «diferente» na primeira passagem).
  createRule: `${DA_CASA} && ${ADMIN} && meta.casa = @request.auth.casa && ${daCasaTambem('por')}`,
  updateRule: null, deleteRule: null,
});

// ── Listas da casa ───────────────────────────────────────────────────────────
for (const nome of ['categorias_equip', 'especialidades']) {
  await criar({
    name: nome, type: 'base',
    fields: [rel('casa', ids.casas, { required: true, cascadeDelete: true }), txt('nome', { required: true })],
    listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
    createRule: `${DA_CASA} && ${ADMIN}`, updateRule: `${DA_CASA} && ${ADMIN}`, deleteRule: `${DA_CASA} && ${ADMIN}`,
  });
}

// ── O objetivo do cofre de cada criança ──────────────────────────────────────
//
// «Bicicleta, 120 €». A criança define e muda o seu; os adultos leem-no. O que
// está JUNTADO é o saldo do cofre — a soma dos `cofre_movimentos` — e nunca um
// campo daqui (INVARIANTE #2): esta linha só tem o nome e o alvo. Uma por
// criança, pelo índice único. (11/09/2026 — a segunda das dez funcionalidades.)
await criar({
  name: 'objetivos_cofre', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('membro', ids.membros, { required: true, cascadeDelete: true }),
    txt('nome', { required: true, max: 60 }),
    num('alvo', { required: true, min: 0.01, max: 1000 }),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_objetivo_por_membro ON objetivos_cofre (membro)'],
  // Lê quem é da casa: a criança o seu, os adultos os de todas. Escreve a
  // própria criança — ou um adulto, para a ajudar a começar. ⚠ `membro.casa`,
  // e não só `casa`: o `casa` da linha é escolhido por quem escreve.
  listRule: `${DA_CASA} && (membro = @request.auth.id || ${ADULTO})`,
  viewRule: `${DA_CASA} && (membro = @request.auth.id || ${ADULTO})`,
  createRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id || ${ADULTO})`,
  updateRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id || ${ADULTO})`,
  deleteRule: `${DA_CASA} && (membro = @request.auth.id || ${ADULTO})`,
});

// ── A ementa da semana ───────────────────────────────────────────────────────
//
// Sete jantares, um prato por dia; cada prato é uma lista de ingredientes com
// corredor, e «pôr o que falta na lista» acrescenta os que a lista aberta não
// tem. (11/09/2026 — a terceira das dez funcionalidades.)
//
// Os ingredientes vão em JSON dentro do prato, e não numa coleção à parte: são
// o MOLDE do prato, não artigos — um artigo só nasce quando se põe na lista, e
// aí é um `artigos` normal, com `pedido_por` quem o pôs. O corredor guarda-se
// pelo NOME, como a loja faz, e resolve-se ao entrar na lista.
await criar({
  name: 'pratos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    txt('nome', { required: true, max: 60 }),
    json('ingredientes'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_prato_por_casa ON pratos (casa, nome)'],
  // A criança lê (é o jantar dela); os adultos escrevem.
  listRule: DA_CASA, viewRule: DA_CASA,
  createRule: `${DA_CASA} && ${ADULTO}`, updateRule: `${DA_CASA} && ${ADULTO}`, deleteRule: `${DA_CASA} && ${ADULTO}`,
});

await criar({
  name: 'ementa', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    data('dia', { required: true }),
    rel('prato', ids.pratos, { required: true, cascadeDelete: true }),
  ],
  // Um jantar por dia: marcar outra vez ALTERA a linha do dia.
  indexes: ['CREATE UNIQUE INDEX idx_ementa_por_dia ON ementa (casa, dia)'],
  listRule: DA_CASA, viewRule: DA_CASA,
  // ⚠ `prato.casa`: o prato de outra casa não entra na ementa desta.
  createRule: `${DA_CASA} && ${ADULTO} && prato.casa = @request.auth.casa`,
  updateRule: `${DA_CASA} && ${ADULTO} && prato.casa = @request.auth.casa`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

await criar({
  name: 'manutencoes', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('equipamento', ids.equipamentos, { required: true, cascadeDelete: true }),
    txt('descricao', { required: true }), data('a_fazer_ate'), data('feita_em'),
  ],
  listRule: `${DA_CASA} && ${ADULTO}`, viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADULTO} && ${daCasaTambem('equipamento')}`,
  updateRule: `${DA_CASA} && ${ADULTO} && ${daCasaTambem('equipamento')}`,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

// ── Saúde ────────────────────────────────────────────────────────────────────
//
// §5 chama a esta «a regra mais restritiva do sistema, e a que mais tem de ser
// testada». São duas regras, não uma:
//
//   ficha de ADULTO   → só o próprio. Nem o companheiro, nem a administração.
//   ficha de CRIANÇA  → os adultos da casa. A criança NÃO lê a sua.
//
// ⚠ A criança lia a sua, e era uma DIVERGÊNCIA de três pontas. O `podeVerSaude`
// do cliente diz que não lê, o ecrã da Saúde promete «invisíveis às próprias»
// em letras — e esta regra devolvia-a. Duas contra uma, mas o que decide não é
// a contagem: o INVARIANTE #3 diz que o dado não pode CHEGAR ao dispositivo, e
// aqui chegava. O telemóvel do Léo recebia a ficha dele e era só a interface a
// esconder--lha, que é exatamente a forma de falha que o invariante existe para
// impedir. Resolvido em 03/09/2026, por decisão do dono da casa: o servidor
// deixa de a devolver.
//
// A condição diz agora: tenho de ser adulto, E o registo é meu ou de uma
// criança. Um adulto nunca cai no segundo ramo por outro adulto.
//
// Repare que ficou IGUAL à condição de escrita, logo abaixo. Era a leitura da
// criança que fazia as duas diferirem; sem ela, quem pode ver é exatamente quem
// pode escrever, e há uma regra a menos para manter em dois sítios.
//
// §5 acrescenta que «a transição de papel tem de reavaliar a visibilidade
// retroativamente». Isto fá-lo sem migrar nada: a regra lê `membro.papel` a
// cada consulta, portanto uma criança que passe a adulta deixa de ter a ficha
// visível aos pais no instante seguinte.
//
// ⚠ Isto NÃO dispensa a conformidade. Ver db/README.md: são dados clínicos de
// menores, e há cinco pontos por resolver antes da primeira linha real.
const SAUDE_VISIVEL =
  `${DA_CASA} && ${ADULTO} && (membro = @request.auth.id || membro.papel = "crianca")`;

await criar({
  name: 'episodios_saude', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('membro', ids.membros, { required: true, cascadeDelete: true }),
    txt('especialidade', { required: true }),
    txt('medico'),
    data('dia', { required: true }),
    txt('hora'),
    txt('notas'),
  ],
  listRule: SAUDE_VISIVEL,
  viewRule: SAUDE_VISIVEL,
  // Escrever é a MESMA condição de ler, desde que a criança deixou de ler a
  // sua. Quem registra e quem vê são os adultos da casa.
  //
  // ⚠ `membro.casa = @request.auth.casa` (12/09/2026): sem isto, uma adulta de
  // OUTRA casa criava uma consulta a uma criança desta — a etiqueta `casa` era
  // a dela, o `membro.papel = "crianca"` era verdade, e a regra passava. A
  // consulta ficava na casa dela, a apontar para o nosso Léo. O guarda das
  // relações ancoradas não a via porque ignorava as relações para `membros`
  // (coleção de autenticação, fora do mapa de nomes). Corrigido nos dois, e a
  // regra viva pela tabela `REGRAS` do `acrescentar-campos.mjs`.
  createRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
  updateRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
  deleteRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
});

// ── As alergias, para a ficha de emergência ──────────────────────────────────
//
// «Amendoim · grave». Uma linha por alergia, do membro — não de uma consulta:
// uma alergia não nasce numa consulta, acompanha a pessoa. A ficha de
// emergência (alergias, medicação em curso, médico, contactos) é o que um
// adulto exporta em PDF para a escola; o resto deriva do que já existe.
// Mesmas regras da ficha (`SAUDE_VISIVEL`): a criança não lê a sua, e o PDF
// sai do telemóvel de um adulto. Travão de casa, como tudo na saúde.
// (12/09/2026 — a sétima das dez funcionalidades.)
await criar({
  name: 'alergias_saude', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('membro', ids.membros, { required: true, cascadeDelete: true }),
    txt('nome', { required: true, max: 60 }),
    sel('gravidade', ['leve', 'moderada', 'grave']),
    txt('nota', { max: 300 }),
  ],
  // A mesma alergia não se escreve duas vezes na mesma pessoa.
  indexes: ['CREATE UNIQUE INDEX idx_alergia_por_membro ON alergias_saude (membro, nome)'],
  listRule: SAUDE_VISIVEL,
  viewRule: SAUDE_VISIVEL,
  // ⚠ Com o `membro.casa`, como os episódios — foi esta coleção, atacada pela
  // prova no dia em que nasceu, que mostrou o buraco nos episódios.
  createRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
  updateRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
  deleteRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
});

// ── A troca de tarefas entre irmãos ──────────────────────────────────────────
//
// «O lixo pelas plantas, só hoje.» O Léo propõe uma tarefa sua por uma da
// Mia; ela aceita ou recusa; um adulto anula. A atribuição do dia é DERIVADA
// da troca aceite — nada se escreve na tarefa, e à meia-noite acabou: amanhã
// não há nada para desfazer. É uma linha à parte, como a rotação.
// (12/09/2026 — a oitava das dez funcionalidades.)
//
// Quem cria é quem tem a `tarefa_de`, e é criança para criança: uma criança
// não troca com um adulto, e um adulto não propõe por ela. A linha nasce POR
// ACEITAR — `aceite_em` vazio à nascença — e só quem tem a `tarefa_para` a
// aceita, assinando (`@request.body.aceite_por = @request.auth.id`); a
// alteração não pode tocar em mais nada (`:isset = false`). Recusar é apagar
// por aceitar; um adulto apaga sempre. As duas tarefas e as duas pessoas
// ancoradas à casa — quatro relações, quatro ataques no guarda.
const TROCA_DA_CASA = 'tarefa_de.casa = @request.auth.casa && tarefa_para.casa = @request.auth.casa';
await criar({
  name: 'trocas_tarefas', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    data('dia', { required: true }),
    rel('tarefa_de', ids.tarefas, { required: true, cascadeDelete: true }),
    rel('tarefa_para', ids.tarefas, { required: true, cascadeDelete: true }),
    rel('proposta_por', ids.membros, { required: true }),
    data('aceite_em'),
    rel('aceite_por', ids.membros),
  ],
  // Uma tarefa entra numa troca por dia — de um lado ou do outro.
  indexes: [
    'CREATE UNIQUE INDEX idx_troca_de_por_dia ON trocas_tarefas (tarefa_de, dia)',
    'CREATE UNIQUE INDEX idx_troca_para_por_dia ON trocas_tarefas (tarefa_para, dia)',
  ],
  // Toda a casa lê: a irmã tem de ver a proposta, e os adultos a troca.
  listRule: DA_CASA, viewRule: DA_CASA,
  createRule: `${DA_CASA} && ${TROCA_DA_CASA}`
    + ' && proposta_por = @request.auth.id && tarefa_de.atribuido_a = @request.auth.id'
    + ' && @request.auth.papel = "crianca" && tarefa_para.atribuido_a.papel = "crianca"'
    + ' && tarefa_para.atribuido_a != @request.auth.id'
    + ' && aceite_em = "" && (aceite_por = "" || aceite_por.casa = @request.auth.casa)',
  // A aceitação é a ÚNICA alteração: assina-se (`aceite_por`) e data-se
  // (`aceite_em`) ao mesmo tempo — sem a data o cliente lia «por aceitar» e a
  // Mia podia assinar as vezes que quisesse. E a `casa` fica trancada como o
  // resto: a regra `casa = @request.auth.casa` avalia a linha EXISTENTE, e sem
  // o `:isset` a Mia mudava a troca de casa ao aceitá-la (revisão de 13/09/2026).
  updateRule: `${DA_CASA} && ${TROCA_DA_CASA} && proposta_por.casa = @request.auth.casa`
    + ' && tarefa_para.atribuido_a = @request.auth.id && aceite_em = ""'
    + ' && @request.body.aceite_por = @request.auth.id && @request.body.aceite_em != ""'
    + ' && @request.body.tarefa_de:isset = false && @request.body.tarefa_para:isset = false'
    + ' && @request.body.dia:isset = false && @request.body.proposta_por:isset = false'
    + ' && @request.body.casa:isset = false',
  deleteRule: `${DA_CASA} && ${TROCA_DA_CASA}`
    + ` && (${ADULTO} || aceite_em = "" && (proposta_por = @request.auth.id || tarefa_para.atribuido_a = @request.auth.id))`,
});

// ── A lista partilhada com quem não tem a app ────────────────────────────────
//
// «Manda-me a lista» — a avó que vai ao supermercado e não tem a app. Um
// adulto pede um endereço só de leitura, com prazo de uma hora, e quem o abre
// vê os rótulos e os corredores da lista ABERTA, sem entrar: sem prendas «só
// adultos», sem preços, sem o nome de quem pediu cada artigo. Nada se escreve
// por lá. (12/09/2026 — a nona das dez funcionalidades.)
//
// A linha guarda o SINAL (24 letras ao acaso, escritas pelo hook
// `partilha-lista.pb.js`, nunca pelo cliente) e quando expira. A rota pública
// `GET /lista/{sinal}` vive no mesmo hook, e é a única porta sem sessão da
// casa além do retorno da Google. Apagar a linha mata o endereço na hora.
//
// ⚠ O endereço só serve onde o servidor for alcançável: hoje em `127.0.0.1`,
// só neste computador; na rede de casa, se o `EXPO_PUBLIC_PB_URL` for o
// endereço da rede. Expor o servidor à internet é decisão do dono da casa, e
// é a Saúde que decide esse calendário (db/postgres/README.md).
await criar({
  name: 'partilhas_lista', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('lista', ids.listas_compras, { required: true, cascadeDelete: true }),
    rel('criada_por', ids.membros, { required: true }),
    txt('sinal', { max: 64 }),
    data('expira_em'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_partilha_sinal ON partilhas_lista (sinal)'],
  // Só os adultos veem que partilhas há; a criança não partilha a lista da casa.
  listRule: `${DA_CASA} && ${ADULTO}`,
  viewRule: `${DA_CASA} && ${ADULTO}`,
  createRule: `${DA_CASA} && ${ADULTO} && lista.casa = @request.auth.casa && criada_por = @request.auth.id`,
  // Não se altera: uma partilha desfaz-se apagando-a, e o hook é que escreve o sinal.
  updateRule: null,
  deleteRule: `${DA_CASA} && ${ADULTO}`,
});

// ── A agenda aprende a saúde ─────────────────────────────────────────────────
//
// O campo que faltava aos `eventos`, acrescentado agora que os
// `episodios_saude` existem. É o «nenhum exame órfão» dito ao contrário: a
// consulta É o evento, e o cliente já os liga pelo `healthId` — sem este campo
// a ligação perdia-se ao subir, e do outro lado ficava um evento «Consulta
// Dentista» que não correspondia a episódio nenhum.
//
// ⚠ Acrescenta-se por `update` e não na criação porque a ordem deste ficheiro
// põe os eventos primeiro. E o `eventos` teve de subir na lista de limpeza
// (`NOSSAS`), para ser apagado ANTES do `episodios_saude` que agora refere —
// senão a limpeza para com «existing reference in eventos», que é o mesmo erro
// que a `credenciais_agenda` ensinou.
{
  const ev = (await pb.collections.getFullList()).find(x => x.name === 'eventos');
  await pb.collections.update(ev.id, {
    fields: [...ev.fields,
      rel('episodio', ids.episodios_saude, { cascadeDelete: true })],
    // ⚠ E as regras de escrita ganham AGORA a segunda metade do guarda das
    // relações. Sem esta linha, o campo existia e ninguém verificava de que
    // casa era o episódio — que é precisamente o buraco que se está a fechar.
    createRule: `${DA_CASA} && ${ADULTO} && autor = @request.auth.id`
      + ` && ${RESPONSAVEL_DA_CASA} && ${EPISODIO_DA_CASA}`,
    updateRule: `${DA_CASA} && autor = @request.auth.id`
      + ` && ${RESPONSAVEL_DA_CASA} && ${EPISODIO_DA_CASA}`,
  });
}

// ── O que pende de um episódio ───────────────────────────────────────────────
//
// Anexos, notas, receitas e decisões. Todos herdam a visibilidade do episódio a
// que pertencem — nunca soltos, para não haver um caminho por onde escapem — e
// todos usam ESTA condição, uma só, e não uma cópia por coleção.
//
// ⚠ `episodio.casa` e não `casa`. Custou um buraco a sério, encontrado pela
// prova nova em 04/09/2026 e presente nos `anexos` desde o primeiro dia:
//
//   a regra era `casa = @request.auth.casa && adulto && (episodio.membro = eu
//   || episodio.membro.papel = "crianca")`
//
// O `casa` é o da PRÓPRIA LINHA, e quem escreve escolhe-o. Uma adulta de outra
// casa punha a casa dela na linha, apontava o `episodio` para a consulta de uma
// criança desta, e passava: é adulta, e a criança é criança. A regra nunca
// perguntava de que casa era o EPISÓDIO.
//
// Ler a consulta ela não conseguia. Pendurar-lhe um exame conseguia — e depois
// lê-lo, porque o anexo era dela. Onze provas dos anexos nunca tentaram isto.
//
// Prendendo ao `episodio.casa`, o vínculo é ao dado e não à etiqueta que quem
// escreve põe na linha. O `casa` da linha fica, por ser útil a consultas e por
// ser o que o `cascadeDelete` da casa usa — mas já não é ele que autoriza.
const PELO_EPISODIO =
  `episodio.casa = @request.auth.casa && ${ADULTO}`
  + ` && (episodio.membro = @request.auth.id || episodio.membro.papel = "crianca")`;

await criar({
  name: 'anexos', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('episodio', ids.episodios_saude, { required: true, cascadeDelete: true }),
    sel('tipo', ['exame', 'receita', 'relatorio']),
    txt('titulo', { required: true }),
    fich('ficheiro'),
  ],
  listRule: PELO_EPISODIO,
  viewRule: PELO_EPISODIO,
  createRule: PELO_EPISODIO,
  updateRule: PELO_EPISODIO,
  deleteRule: PELO_EPISODIO,
});

// ── O que pende de uma consulta: notas, receitas e decisões ──────────────────
//
// Estas três viviam SÓ no dispositivo — `healthNotes`, `healthRecipes` e
// `healthDecisions` na loja — e não por escolha de privacidade: não tinham para
// onde ir. A consulta e os anexos sobem desde 03/09/2026; a nota que a Rita
// escreve no telefone dela não chegava ao Tomás, e não por ser privada, mas por
// não sair daquele telefone.
//
// ⚠ Usam o `PELO_EPISODIO` definido acima, o mesmo dos `anexos` — não uma cópia
// dele. Uma nota de uma consulta é o mesmo dado clínico que a consulta: se a
// ficha não é visível, a nota também não pode ser. Escrever a condição outra
// vez era criar um segundo sítio onde ela pode divergir, e foi assim que a
// criança chegou a ler a própria ficha.
//
// As notas de uma consulta.
//
// ⚠ Só o AUTOR altera ou apaga a sua nota, e a regra é do servidor — não é o
// cliente a esconder o lápis. Uma nota é o relato de uma pessoa sobre o que
// ouviu na consulta; o outro adulto reescrevê-la em silêncio é pior do que não
// a poder corrigir. E `autor = @request.auth.id` na criação impede escrever uma
// nota em nome de outra pessoa, que seria a mesma coisa pela porta do lado.
await criar({
  name: 'notas_saude', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('episodio', ids.episodios_saude, { required: true, cascadeDelete: true }),
    rel('autor', ids.membros, { required: true }),
    txt('texto', { required: true, max: 2000 }),
    data('editada_em'),
  ],
  listRule: PELO_EPISODIO,
  viewRule: PELO_EPISODIO,
  createRule: `${PELO_EPISODIO} && autor = @request.auth.id`,
  updateRule: `${PELO_EPISODIO} && autor = @request.auth.id`,
  deleteRule: `${PELO_EPISODIO} && autor = @request.auth.id`,
});

// As receitas de uma consulta, com a decisão de cada uma.
//
// A `decisao` é o que o adulto decidiu fazer com ela — comprar, já tem, não
// comprar — e é por receita, não por consulta.
await criar({
  name: 'receitas_saude', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('episodio', ids.episodios_saude, { required: true, cascadeDelete: true }),
    txt('nome', { required: true }),
    txt('dose'),
    txt('quantidade'),
    txt('unidade'),
    data('expira_em'),
    txt('decisao'),
    // As notas da receita (15/09/2026 — «adicionar notas», na folha das tomas):
    // «tomar depois do jantar», «não com leite». Texto livre, opcional; nasce
    // também na tabela `CAMPOS` do `acrescentar-campos.mjs`.
    txt('notas', { max: 500 }),
    // A medicação a partir da receita (12/09/2026, a sexta das dez
    // funcionalidades): quantas tomas por dia, durante quantos dias, e quantas
    // unidades traz a caixa — é o que permite dizer «a caixa acaba a 28/09,
    // antes da receita». ⚠ Zero é «não definido» (classe 13: um `number` não
    // é anulável); os três nascem também na tabela `CAMPOS` do
    // `acrescentar-campos.mjs`.
    num('frequencia', { min: 0, onlyInt: true }),
    num('duracao_dias', { min: 0, onlyInt: true }),
    num('caixa', { min: 0, onlyInt: true }),
  ],
  listRule: PELO_EPISODIO,
  viewRule: PELO_EPISODIO,
  createRule: PELO_EPISODIO,
  updateRule: PELO_EPISODIO,
  deleteRule: PELO_EPISODIO,
});

// ── As tomas de uma receita ──────────────────────────────────────────────────
//
// Cada toma marcada é UMA LINHA: a receita, quando, e quem marcou. É aditiva
// como o cofre — nunca um contador na receita (INVARIANTE #2) — e duas tomas
// da mesma receita no mesmo instante colidem no índice em vez de se contarem
// duas vezes. Desmarcar apaga a linha, e só quem a marcou o faz.
//
// A visibilidade herda-se da receita → episódio (`PELA_RECEITA`): a criança
// não vê as suas tomas, como não vê a sua ficha. E sobe pelo MESMO travão da
// saúde (`recusaSaude`): só para um servidor que viva na casa.
const PELA_RECEITA =
  `receita.episodio.casa = @request.auth.casa && ${ADULTO}`
  + ` && (receita.episodio.membro = @request.auth.id || receita.episodio.membro.papel = "crianca")`;

await criar({
  name: 'tomas_saude', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('receita', ids.receitas_saude, { required: true, cascadeDelete: true }),
    data('quando', { required: true }),
    rel('por', ids.membros, { required: true }),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_toma_por_instante ON tomas_saude (receita, quando)'],
  listRule: PELA_RECEITA,
  viewRule: PELA_RECEITA,
  // ⚠ `por = @request.auth.id`: uma toma fica assinada por quem a marcou, e a
  // assinatura não se escolhe — é a mesma regra do `autor` das notas.
  createRule: `${PELA_RECEITA} && por = @request.auth.id`,
  updateRule: null,     // não se edita uma toma; desmarca-se
  deleteRule: `${PELA_RECEITA} && por = @request.auth.id`,
});

// A decisão sobre a consulta: resolvida, ou por resolver.
//
// ⚠ Uma por episódio, e o `episodio` é ÚNICO por isso. Sem a unicidade, dois
// telefones que decidam ao mesmo tempo criavam duas linhas e o ecrã escolhia
// uma ao acaso — o mesmo problema que os saldos têm, e aqui a resposta não pode
// ser somar: uma decisão é um estado, não um movimento. Então prende-se no
// servidor, que é o único sítio onde os dois telefones se encontram.
await criar({
  name: 'decisoes_saude', type: 'base',
  fields: [
    rel('casa', ids.casas, { required: true, cascadeDelete: true }),
    rel('episodio', ids.episodios_saude, { required: true, cascadeDelete: true }),
    txt('tipo'),
    sel('estado', ['resolvido', 'pendente']),
    txt('nota'),
    data('atualizada_em'),
  ],
  indexes: ['CREATE UNIQUE INDEX idx_decisao_por_episodio ON decisoes_saude (episodio)'],
  listRule: PELO_EPISODIO,
  viewRule: PELO_EPISODIO,
  createRule: PELO_EPISODIO,
  updateRule: PELO_EPISODIO,
  deleteRule: PELO_EPISODIO,
});

// ── Vistas: os saldos ────────────────────────────────────────────────────────
// INVARIANTE #2 posto em estrutura. O saldo é uma SOMA calculada pelo servidor,
// não uma coluna que alguém escreve. Uma vista não tem escrita nenhuma, portanto
// não há sequer como a escrever por engano.
const vista = (name, viewQuery, regra) => criar({
  name, type: 'view', fields: [], viewQuery, listRule: regra, viewRule: regra,
});

// O analisador de vistas do PocketBase estropia quebras de linha dentro de
// subconsultas — descobri-o com um erro que substituía o WHERE por
// «__pb_discard__». Por isso cada consulta vai numa linha só, por feia que fique.

// O adulto vê os cofres das crianças; a criança vê o seu.
await vista('v_cofre_saldo',
  "SELECT m.id AS id, m.id AS membro, m.casa AS casa, COALESCE((SELECT SUM(cm.valor) FROM cofre_movimentos cm WHERE cm.membro = m.id), 0) AS saldo FROM membros m WHERE m.papel = 'crianca'",
  `${DA_CASA} && (${ADULTO} || membro = @request.auth.id)`);

// Gasto por envelope, excluindo as despesas anuladas.
await vista('v_envelope_gasto',
  "SELECT e.id AS id, e.id AS envelope, e.casa AS casa, e.nome AS nome, COALESCE((SELECT SUM(d.valor) FROM despesas d WHERE d.envelope = e.id AND (d.anula_id IS NULL OR d.anula_id = '')), 0) AS gasto FROM envelopes e",
  `${DA_CASA} && ${ADULTO}`);

// Positivo = tem a receber. Negativo = deve.
await vista('v_acerto_saldo',
  "SELECT m.id AS id, m.id AS membro, m.casa AS casa, (COALESCE((SELECT SUM(d.valor / 2) FROM despesas d WHERE d.pagador = m.id AND d.divide_meias = TRUE AND (d.anula_id IS NULL OR d.anula_id = '')), 0) + COALESCE((SELECT SUM(a.valor) FROM acertos a WHERE a.de_membro = m.id), 0) - COALESCE((SELECT SUM(a2.valor) FROM acertos a2 WHERE a2.para_membro = m.id), 0)) AS saldo FROM membros m WHERE m.papel != 'crianca'",
  `${DA_CASA} && ${ADULTO}`);

// Pontos ganhos menos pontos pagos. Duas somas, e é o que a app mostra.
//
// ⚠ Isto era uma HEURÍSTICA por datas: «pontos confirmados que ainda não
// entraram numa semanada POSTERIOR» — `cm.data > tf.confirmada_em`. Existia
// antes de os movimentos guardarem quantos pontos pagavam, e adivinhava.
//
// Adivinhava mal em três casos, todos normais numa casa: uma tarefa confirmada
// no MESMO dia da semanada não contava (a data não é maior), uma semanada
// lançada com data de ontem apagava pontos que ainda não tinha pago, e pagar
// só metade dos pontos zerava-os todos.
//
// E era a segunda definição do mesmo número: o cliente calcula
// `kidPts - paidPts`, e as duas podiam responder coisas diferentes sobre a
// mesma criança sem que nada avisasse. Passa a ser a mesma subtração de somas
// que a app faz, sobre as mesmas linhas.
await vista('v_pontos_por_pagar',
  "SELECT m.id AS id, m.id AS membro, m.casa AS casa, (COALESCE((SELECT SUM(t.pontos) FROM tarefas_feitas tf JOIN tarefas t ON t.id = tf.tarefa WHERE tf.marcada_por = m.id AND tf.confirmada_em IS NOT NULL), 0) - COALESCE((SELECT SUM(cm.pontos) FROM cofre_movimentos cm WHERE cm.membro = m.id), 0)) AS pontos FROM membros m WHERE m.papel = 'crianca'",
  `${DA_CASA} && (${ADULTO} || membro = @request.auth.id)`);
console.log('vistas:', ['v_cofre_saldo','v_envelope_gasto','v_acerto_saldo','v_pontos_por_pagar'].join(', '));

// ── E a `users` fecha-se ─────────────────────────────────────────────────────
//
// ⚠ Esta coleção não é deste ficheiro — o PocketBase cria-a sozinho em qualquer
// base nova. E cria-a com `createRule: ''`, que quer dizer «toda a gente, sem
// sessão nenhuma»: inscrição pública, numa coleção de autenticação que esta
// casa nunca usa. Quem entra na app entra pelos `membros`.
//
// Até 27/09/2026 as rotas dos hooks diziam `$apis.requireAuth()` sem nome de
// coleção, e o token de quem se inscrevesse ali passava — e passava também o
// travão da criança, porque um registo de `users` não tem campo `papel`. O que
// travava um estranho era o `if (!casa)` lá adiante: um acaso do esquema, não
// uma decisão de autorização.
//
// As rotas já dizem `requireAuth('membros')`. Isto é a outra ponta: uma base
// construída do zero não volta a nascer com um ponto de registo aberto.
//
// Fecha-se, não se apaga — `null` é «só superutilizadores», e desfaz-se numa
// linha se algum dia fizer falta. O par desta linha vive na tabela `REGRAS` do
// `acrescentar-campos.mjs`, para as bases que já existem.
try {
  const users = (await pb.collections.getFullList()).find(c => c.name === 'users');
  if (users) {
    await pb.collections.update(users.id, {
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });
    console.log('users: fechada (as cinco regras a null) — esta casa entra pelos `membros`');
  }
} catch (e) {
  console.error('⚠ não consegui fechar a `users`:', e.message);
}
