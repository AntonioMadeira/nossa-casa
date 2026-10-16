/**
 * O que nasceu DEPOIS da base — aplicado a um servidor a andar.
 *
 *   node db/pocketbase/acrescentar-campos.mjs
 *
 * ── Porque é que isto existe à parte ─────────────────────────────────────────
 *
 * O `criar-colecoes.mjs` é a verdade de como a base se constrói do zero, e para
 * o ser APAGA tudo e recria. Numa casa que já tem dados, correr esse ficheiro é
 * perder a casa. Portanto um campo novo precisa de dois sítios: a declaração
 * lá, para quem criar a base amanhã, e uma adição aqui, para o servidor que já
 * está a correr hoje.
 *
 * ── Terceira vez, e por isso uma tabela e não um script ──────────────────────
 *
 * Já foram três: o `membros.avatar` e o `membros.figura` (03/09/2026), o
 * `artigos.corredor` (08/09/2026) e agora o `artigos.posto`. Os dois primeiros
 * têm cada um o seu ficheiro — `criar-campo-avatar.mjs` —, e escrever um
 * ficheiro por campo é o padrão que garante que o quarto vai ser esquecido.
 *
 * Aqui ENUMERA-SE: a tabela `CAMPOS` diz o que cada coleção tem de ter, e o
 * script acrescenta o que faltar. Um campo novo é uma linha nesta tabela.
 *
 * ⚠ NÃO muda tipos e não renomeia. Mudar o tipo de um campo com linhas gravadas
 * é pedir ao PocketBase que converta dados a sério, e foi por isso que o
 * `corredor` nasceu ao lado do `seccao` em vez de o substituir.
 *
 * ── E três tabelas, não uma ──────────────────────────────────────────────────
 *
 *   CAMPOS        o que cada coleção tem de TER
 *   COLECOES      as coleções que nasceram depois, com regras e índices
 *   CAMPOS_A_TIRAR  o que uma coleção não pode ter
 *
 * A terceira existe por um caso concreto: o `metas.atual` era um saldo ESCRITO,
 * o INVARIANTE #2 ao contrário. Um campo desses não se deixa lá «por não
 * incomodar» — fica à espera de que alguém lhe escreva. Tirar é destrutivo, e
 * por isso o script **recusa** tirar um campo de uma coleção que tenha linhas:
 * aí a decisão é de quem tem os dados à frente, não de um script.
 *
 * Correr isto duas vezes não faz nada na segunda.
 */
import PocketBase from 'pocketbase';
import { SUPERUTILIZADOR, SUPER_PALAVRA, URL_DO_SERVIDOR } from './ambiente.mjs';
import { sair } from './sair.mjs';

const pb = new PocketBase(URL_DO_SERVIDOR);
pb.autoCancellation(false);
await pb.collection('_superusers').authWithPassword(SUPERUTILIZADOR, SUPER_PALAVRA);

// A tabela. Cada entrada é `[coleção, campo, definição]`, com a definição
// escrita como o `criar-colecoes.mjs` a escreve — para os dois lados dizerem a
// mesma coisa quando se comparam à mão.
//
// A relação precisa do ID da coleção alvo, e esse resolve-se pelo nome, senão
// era um identificador opaco escrito à mão que muda em cada base nova.
const CAMPOS = [
  // A data de um pedido por voz, para a retenção ser exprimível — sem ela não
  // se consegue escrever «apagar o que tem mais de trinta dias» e a tabela
  // cresce para sempre.
  //
  // ⚠ E é uma FORMA NOVA da lição dos dois sítios, apanhada em 27/09/2026: um
  // campo pode estar na entrada da coleção em `COLECOES`, mas essa tabela só
  // CRIA a coleção quando ela falta. Numa coleção que já existe, um campo novo
  // precisa de uma linha AQUI — e foi o próprio script a dizê-lo, na
  // conferência final, com um «✕ … não ficou lá».
  ['membros', 'avatar', { type: 'text', max: 500 }],
  ['membros', 'figura', { type: 'text', max: 24 }],
  ['artigos', 'corredor', { type: 'relation', alvo: 'seccoes', maxSelect: 1, cascadeDelete: false }],
  ['artigos', 'posto', { type: 'number', min: 0, onlyInt: true }],
  // O ícone que a família escolheu para o corredor. A oitava vez que um
  // campo precisou destes dois sítios, e a primeira em que nasceu nos dois
  // ao mesmo tempo sem ninguém ter de o descobrir a correr. (25/09/2026)
  ['seccoes', 'icone', { type: 'text', max: 24 }],
  // Se a criança já tem PIN — posto pelo hook e pela rota, lido pela entrada
  // e pela Gestão. A quarta vez que um campo precisou destes dois sítios.
  ['membros', 'pin_definido', { type: 'bool' }],
  // Quem vê o artigo: `familia` (todos) ou `adultos` (a prenda que a criança
  // não pode ver). A quinta vez. (11/09/2026)
  ['artigos', 'visibilidade', { type: 'select', values: ['familia', 'adultos'], maxSelect: 1 }],
  // A conta fixa que uma despesa paga. A sexta vez. (12/09/2026) ⚠ O alvo é
  // uma coleção que nasce na tabela `COLECOES` abaixo — e o guião cria as
  // coleções ANTES de acrescentar os campos, senão isto não resolvia o id.
  ['despesas', 'conta_fixa', { type: 'relation', alvo: 'contas_fixas', maxSelect: 1, cascadeDelete: false }],
  // A medicação a partir da receita (12/09/2026): tomas por dia, dias, e
  // unidades na caixa. Zero é «não definido».
  ['receitas_saude', 'frequencia', { type: 'number', min: 0, onlyInt: true }],
  ['receitas_saude', 'duracao_dias', { type: 'number', min: 0, onlyInt: true }],
  ['receitas_saude', 'caixa', { type: 'number', min: 0, onlyInt: true }],
  // As notas da receita (15/09/2026): texto livre, opcional.
  ['receitas_saude', 'notas', { type: 'text', max: 500 }],
  // O interruptor da ementa da semana (12/09/2026): regra da casa. ⚠ Pela
  // NEGATIVA: um `bool` novo nasce a `false` em todas as linhas que já existem,
  // e `false` tem de ser «ligada». Ver o comentário no `criar-colecoes.mjs`.
  ['casas', 'ementa_desligada', { type: 'bool' }],
  // O interruptor dos ícones dos corredores (25/09/2026): regra da casa, e
  // também pela NEGATIVA — uma casa que já escolheu ícones não os pode perder
  // por o campo ter chegado. Ver o comentário no `criar-colecoes.mjs`.
  ['casas', 'icones_desligados', { type: 'bool' }],
  // O orçamento por mês ou para o ano (15/10/2026): `{ modo, ano, total, meses }`.
  // Ausente lê-se como mensal. Ver o comentário no `criar-colecoes.mjs`.
  ['casas', 'orcamento', { type: 'json', maxSize: 20000 }],
  // O carimbo do último «Começar de Zero»: apaga a cópia local dos outros aparelhos.
  ['casas', 'zerado_em', { type: 'text', max: 40 }],
  ['casas', 'responsabilidade_versao', { type: 'text', max: 20 }],
  ['casas', 'responsabilidade_aceite_em', { type: 'text', max: 40 }],
  ['casas', 'responsabilidade_por', { type: 'text', max: 120 }],
];

// As coleções que nasceram depois da base. A definição é a MESMA do
// `criar-colecoes.mjs`, campo a campo e regra a regra — os dois ficheiros têm
// de dizer o mesmo, e há um guarda do Jest a conferi-lo.
const COLECOES = [
  {
    nome: 'meta_movimentos',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'meta', type: 'relation', alvo: 'metas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'valor', type: 'number', required: true },
      { name: 'motivo', type: 'text' },
      { name: 'por', type: 'relation', alvo: 'membros', maxSelect: 1, cascadeDelete: false },
      { name: 'data', type: 'date' },
      { name: 'idem_key', type: 'text' },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_meta_mov_idem ON meta_movimentos (casa, idem_key)'],
    regras: {
      listRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      viewRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      createRule: 'casa = @request.auth.casa && @request.auth.papel = "admin"'
        + ' && meta.casa = @request.auth.casa && (por = "" || por.casa = @request.auth.casa)',
      updateRule: null,
      deleteRule: null,
    },
  },
  // O objetivo do cofre de cada criança (11/09/2026). A mesma definição do
  // `criar-colecoes.mjs`, letra a letra.
  {
    nome: 'objetivos_cofre',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'membro', type: 'relation', alvo: 'membros', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'nome', type: 'text', required: true, max: 60 },
      { name: 'alvo', type: 'number', required: true, min: 0.01, max: 1000 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_objetivo_por_membro ON objetivos_cofre (membro)'],
    regras: {
      listRule: 'casa = @request.auth.casa && (membro = @request.auth.id || @request.auth.papel != "crianca")',
      viewRule: 'casa = @request.auth.casa && (membro = @request.auth.id || @request.auth.papel != "crianca")',
      createRule: 'casa = @request.auth.casa && membro.casa = @request.auth.casa && (membro = @request.auth.id || @request.auth.papel != "crianca")',
      updateRule: 'casa = @request.auth.casa && membro.casa = @request.auth.casa && (membro = @request.auth.id || @request.auth.papel != "crianca")',
      deleteRule: 'casa = @request.auth.casa && (membro = @request.auth.id || @request.auth.papel != "crianca")',
    },
  },
  // A ementa da semana (11/09/2026): os pratos, com os ingredientes em JSON,
  // e um jantar por dia. A mesma definição do `criar-colecoes.mjs`.
  {
    nome: 'pratos',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'nome', type: 'text', required: true, max: 60 },
      { name: 'ingredientes', type: 'json', maxSize: 20000 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_prato_por_casa ON pratos (casa, nome)'],
    regras: {
      listRule: 'casa = @request.auth.casa',
      viewRule: 'casa = @request.auth.casa',
      createRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      updateRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      deleteRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
    },
  },
  {
    nome: 'ementa',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'dia', type: 'date', required: true },
      { name: 'prato', type: 'relation', alvo: 'pratos', maxSelect: 1, required: true, cascadeDelete: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_ementa_por_dia ON ementa (casa, dia)'],
    regras: {
      listRule: 'casa = @request.auth.casa',
      viewRule: 'casa = @request.auth.casa',
      createRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && prato.casa = @request.auth.casa',
      updateRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && prato.casa = @request.auth.casa',
      deleteRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
    },
  },
  // As contas fixas (12/09/2026): a definição — nome, valor, dia do mês,
  // envelope, quem paga. «Paga» é a despesa do mês que aponta para cá, nunca um
  // campo. A mesma definição do `criar-colecoes.mjs`, letra a letra.
  {
    nome: 'contas_fixas',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'nome', type: 'text', required: true, max: 60 },
      { name: 'valor', type: 'number', required: true, min: 0.01 },
      { name: 'dia', type: 'number', required: true, min: 1, max: 31, onlyInt: true },
      { name: 'envelope', type: 'relation', alvo: 'envelopes', maxSelect: 1, required: true, cascadeDelete: false },
      { name: 'quem_paga', type: 'relation', alvo: 'membros', maxSelect: 1, cascadeDelete: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_conta_fixa_por_casa ON contas_fixas (casa, nome)'],
    regras: {
      listRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      viewRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      createRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && envelope.casa = @request.auth.casa && (quem_paga = "" || quem_paga.casa = @request.auth.casa)',
      updateRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && envelope.casa = @request.auth.casa && (quem_paga = "" || quem_paga.casa = @request.auth.casa)',
      deleteRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
    },
  },
  // Os contratos e as renovações (12/09/2026): nome, fornecedor, quando renova,
  // fidelização, quem trata, e o documento na própria linha. A mesma definição
  // do `criar-colecoes.mjs`, letra a letra.
  {
    nome: 'contratos',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'nome', type: 'text', required: true, max: 60 },
      { name: 'fornecedor', type: 'text', max: 60 },
      { name: 'renova_em', type: 'date' },
      { name: 'fidelizacao_ate', type: 'date' },
      { name: 'responsavel', type: 'relation', alvo: 'membros', maxSelect: 1, cascadeDelete: false },
      { name: 'ficheiro', type: 'file', maxSelect: 1, maxSize: 8388608 },
    ],
    indexes: [],
    regras: {
      listRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      viewRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      createRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && (responsavel = "" || responsavel.casa = @request.auth.casa)',
      updateRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && (responsavel = "" || responsavel.casa = @request.auth.casa)',
      deleteRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
    },
  },
  // As alergias, para a ficha de emergência (12/09/2026): do membro, com as
  // regras da ficha de saúde. A mesma definição do `criar-colecoes.mjs`.
  {
    nome: 'alergias_saude',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'membro', type: 'relation', alvo: 'membros', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'nome', type: 'text', required: true, max: 60 },
      { name: 'gravidade', type: 'select', values: ['leve', 'moderada', 'grave'], maxSelect: 1 },
      { name: 'nota', type: 'text', max: 300 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_alergia_por_membro ON alergias_saude (membro, nome)'],
    regras: {
      listRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && (membro = @request.auth.id || membro.papel = "crianca")',
      viewRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && (membro = @request.auth.id || membro.papel = "crianca")',
      createRule: 'casa = @request.auth.casa && membro.casa = @request.auth.casa && (membro = @request.auth.id && @request.auth.papel != "crianca" || @request.auth.papel != "crianca" && membro.papel = "crianca")',
      updateRule: 'casa = @request.auth.casa && membro.casa = @request.auth.casa && (membro = @request.auth.id && @request.auth.papel != "crianca" || @request.auth.papel != "crianca" && membro.papel = "crianca")',
      deleteRule: 'casa = @request.auth.casa && membro.casa = @request.auth.casa && (membro = @request.auth.id && @request.auth.papel != "crianca" || @request.auth.papel != "crianca" && membro.papel = "crianca")',
    },
  },
  // As tomas de uma receita (12/09/2026): uma linha por toma, aditiva, com quem
  // marcou. A visibilidade herda-se da receita → episódio. A mesma definição
  // do `criar-colecoes.mjs`, letra a letra.
  {
    nome: 'tomas_saude',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'receita', type: 'relation', alvo: 'receitas_saude', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'quando', type: 'date', required: true },
      { name: 'por', type: 'relation', alvo: 'membros', maxSelect: 1, required: true, cascadeDelete: false },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_toma_por_instante ON tomas_saude (receita, quando)'],
    regras: {
      listRule: 'receita.episodio.casa = @request.auth.casa && @request.auth.papel != "crianca" && (receita.episodio.membro = @request.auth.id || receita.episodio.membro.papel = "crianca")',
      viewRule: 'receita.episodio.casa = @request.auth.casa && @request.auth.papel != "crianca" && (receita.episodio.membro = @request.auth.id || receita.episodio.membro.papel = "crianca")',
      createRule: 'receita.episodio.casa = @request.auth.casa && @request.auth.papel != "crianca" && (receita.episodio.membro = @request.auth.id || receita.episodio.membro.papel = "crianca") && por = @request.auth.id',
      updateRule: null,
      deleteRule: 'receita.episodio.casa = @request.auth.casa && @request.auth.papel != "crianca" && (receita.episodio.membro = @request.auth.id || receita.episodio.membro.papel = "crianca") && por = @request.auth.id',
    },
  },
  // A lista partilhada com quem não tem a app (12/09/2026): o sinal e o prazo
  // de um endereço só de leitura. A mesma definição do `criar-colecoes.mjs`.
  {
    nome: 'partilhas_lista',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'lista', type: 'relation', alvo: 'listas_compras', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'criada_por', type: 'relation', alvo: 'membros', maxSelect: 1, required: true, cascadeDelete: false },
      { name: 'sinal', type: 'text', max: 64 },
      { name: 'expira_em', type: 'date' },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_partilha_sinal ON partilhas_lista (sinal)'],
    regras: {
      listRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      viewRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
      createRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca" && lista.casa = @request.auth.casa && criada_por = @request.auth.id',
      updateRule: null,
      deleteRule: 'casa = @request.auth.casa && @request.auth.papel != "crianca"',
    },
  },
  // A troca de tarefas entre irmãos (12/09/2026): uma linha por troca, do dia,
  // com as duas tarefas, quem propôs e quem aceitou. A mesma definição do
  // `criar-colecoes.mjs`, letra a letra.
  {
    nome: 'trocas_tarefas',
    campos: [
      { name: 'casa', type: 'relation', alvo: 'casas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'dia', type: 'date', required: true },
      { name: 'tarefa_de', type: 'relation', alvo: 'tarefas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'tarefa_para', type: 'relation', alvo: 'tarefas', maxSelect: 1, required: true, cascadeDelete: true },
      { name: 'proposta_por', type: 'relation', alvo: 'membros', maxSelect: 1, required: true, cascadeDelete: false },
      { name: 'aceite_em', type: 'date' },
      { name: 'aceite_por', type: 'relation', alvo: 'membros', maxSelect: 1, cascadeDelete: false },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_troca_de_por_dia ON trocas_tarefas (tarefa_de, dia)',
      'CREATE UNIQUE INDEX idx_troca_para_por_dia ON trocas_tarefas (tarefa_para, dia)',
    ],
    regras: {
      listRule: 'casa = @request.auth.casa',
      viewRule: 'casa = @request.auth.casa',
      createRule: 'casa = @request.auth.casa && tarefa_de.casa = @request.auth.casa && tarefa_para.casa = @request.auth.casa'
        + ' && proposta_por = @request.auth.id && tarefa_de.atribuido_a = @request.auth.id'
        + ' && @request.auth.papel = "crianca" && tarefa_para.atribuido_a.papel = "crianca"'
        + ' && tarefa_para.atribuido_a != @request.auth.id'
        + ' && aceite_em = "" && (aceite_por = "" || aceite_por.casa = @request.auth.casa)',
      updateRule: 'casa = @request.auth.casa && tarefa_de.casa = @request.auth.casa && tarefa_para.casa = @request.auth.casa && proposta_por.casa = @request.auth.casa'
        + ' && tarefa_para.atribuido_a = @request.auth.id && aceite_em = ""'
        + ' && @request.body.aceite_por = @request.auth.id && @request.body.aceite_em != ""'
        + ' && @request.body.tarefa_de:isset = false && @request.body.tarefa_para:isset = false'
        + ' && @request.body.dia:isset = false && @request.body.proposta_por:isset = false'
        + ' && @request.body.casa:isset = false',
      deleteRule: 'casa = @request.auth.casa && tarefa_de.casa = @request.auth.casa && tarefa_para.casa = @request.auth.casa'
        + ' && (@request.auth.papel != "crianca" || aceite_em = "" && (proposta_por = @request.auth.id || tarefa_para.atribuido_a = @request.auth.id))',
    },
  },
];

// ⚠ O que uma coleção NÃO pode ter. `[coleção, campo, porquê]`.
const CAMPOS_A_TIRAR = [
  ['metas', 'atual',
    'era um saldo ESCRITO (INVARIANTE #2). O que está juntado numa meta é a '
    + 'SOMA dos `meta_movimentos` — dois telefones a reforçar a mesma meta '
    + 'escreviam cada um o seu total e o último ganhava.'],
];

// ── E as REGRAS que mudaram depois da base ───────────────────────────────────
//
// ⚠ Segunda vez, e por isso uma tabela. Uma regra de coleção é, como um campo,
// coisa que nasce em dois sítios: no `criar-colecoes.mjs`, para quem criar a
// base amanhã, e aqui, para o servidor que já está a andar. A primeira mudança
// (o `deleteRule` das `tarefas_feitas`, 10/09/2026) foi aplicada com um guião
// descartável; a segunda (a leitura dos `artigos` com visibilidade, 11/09/2026)
// ganhou esta tabela. O texto é o MESMO do `criar-colecoes.mjs`, letra a letra
// — os dois ficheiros têm de dizer o mesmo, e o guarda do Jest confere-o.
//
// `[coleção, { regra: texto }]`. Só as regras listadas mudam; as outras ficam.
const DA_CASA = 'casa = @request.auth.casa';
const ADULTO = '@request.auth.papel != "crianca"';
const REGRAS = [
  // ⚠ A `users` fecha-se. É a coleção de autenticação que o PocketBase traz de
  // origem e que esta casa NUNCA usa — quem entra na app entra pelos `membros`.
  //
  // Vinha com `createRule: ''`, que no PocketBase quer dizer «toda a gente, sem
  // sessão nenhuma»: inscrição pública. E até 27/09/2026 as rotas dos hooks
  // diziam `$apis.requireAuth()` sem nome de coleção, portanto aceitavam o
  // token de quem se inscrevesse ali. Passava também o travão da criança, que
  // pergunta `papel !== 'crianca'` — e um registo de `users` não tem `papel`
  // nenhum. O que travava um estranho era o `if (!casa)`: um acaso do esquema.
  //
  // As rotas já dizem `requireAuth('membros')`, mas deixar um ponto de registo
  // aberto numa casa que o não usa é dívida à espera do dia em que o servidor
  // for exposto.
  //
  // Fecha-se, não se apaga: zero linhas, `system: false`, e um `null` desfaz-se
  // numa linha se algum dia fizer falta. `null` é «só superutilizadores».
  ['users', {
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  }],
  ['tarefas_feitas', {
    deleteRule: `${DA_CASA} && tarefa.casa = @request.auth.casa`
      + ` && (${ADULTO} || (marcada_por = @request.auth.id && confirmada_em = ""))`,
    // E o `confirmada_por` e o `marcada_por` ancorados (12/09/2026) — o guarda
    // das relações passou a ver as relações para `membros`.
    createRule: `${DA_CASA} && tarefa.casa = @request.auth.casa`
      + ' && marcada_por = @request.auth.id'
      + ' && (confirmada_por = "" || confirmada_por.casa = @request.auth.casa)'
      + ` && (tarefa.atribuido_a = @request.auth.id || ${ADULTO})`,
    updateRule: `${DA_CASA} && tarefa.casa = @request.auth.casa && ${ADULTO}`
      + ' && marcada_por.casa = @request.auth.casa'
      + ' && (confirmada_por = "" || confirmada_por.casa = @request.auth.casa)',
  }],
  // Os dois buracos a sério que o guarda alargado apanhou (12/09/2026): uma
  // adulta de outra casa escrevia no cofre de uma criança desta, e lançava um
  // acerto entre os adultos desta. Ver o `criar-colecoes.mjs`.
  ['cofre_movimentos', {
    createRule: `${DA_CASA} && ${ADULTO} && membro.casa = @request.auth.casa && membro.papel = "crianca"`
      + ' && (autorizado_por = "" || autorizado_por.casa = @request.auth.casa)',
  }],
  ['acertos', {
    createRule: `${DA_CASA} && ${ADULTO} && de_membro.papel != "crianca" && para_membro.papel != "crianca"`
      + ' && de_membro.casa = @request.auth.casa && para_membro.casa = @request.auth.casa',
  }],
  ['artigos', {
    listRule: `${DA_CASA} && (visibilidade != "adultos" || ${ADULTO})`,
    viewRule: `${DA_CASA} && (visibilidade != "adultos" || ${ADULTO})`,
  }],
  // A terceira (12/09/2026): a despesa ganhou o `conta_fixa`, e uma relação
  // para dentro da casa leva a âncora — senão uma adulta de outra casa pagava
  // a renda DESTA com uma despesa da casa dela.
  ['despesas', {
    createRule: `${DA_CASA} && ${ADULTO} && pagador.papel != "crianca"`
      + ' && envelope.casa = @request.auth.casa && pagador.casa = @request.auth.casa'
      + ' && (conta_fixa = "" || conta_fixa.casa = @request.auth.casa)',
  }],
  // A quarta (12/09/2026): a consulta prende ao `membro.casa`. Uma adulta de
  // outra casa criava uma consulta a uma criança desta — a etiqueta `casa` era
  // a dela e o `membro.papel = "crianca"` era verdade. Ver o `criar-colecoes.mjs`.
  ['episodios_saude', {
    createRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
    updateRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
    deleteRule: `${DA_CASA} && membro.casa = @request.auth.casa && (membro = @request.auth.id && ${ADULTO} || ${ADULTO} && membro.papel = "crianca")`,
  }],
];

const idDaColecao = async (nome) => (await pb.collections.getOne(nome)).id;

// ⚠ «as 1 coleção(ões)» foi o que este script imprimiu na primeira corrida.
// Plural escrito à mão é a classe de defeito que já apareceu em seis sítios
// desta casa, e o `(s)` é a mesma coisa com uma desculpa.
const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

// ── As coleções novas ────────────────────────────────────────────────────────
let colecoesCriadas = 0;
let regrasDasColecoes = 0;
for (const c of COLECOES) {
  const existe = await pb.collections.getOne(c.nome).catch(() => null);
  if (existe) {
    // ⚠ Existir não quer dizer estar IGUAL. A `alergias_saude` nasceu com uma
    // regra sem âncora e foi corrigida no mesmo dia (12/09/2026); um «já
    // existe» a secas deixava a regra velha viva no servidor, com a tabela a
    // dizer outra coisa. As regras aplicam-se por diferença, como na `REGRAS`.
    const diferentes = Object.entries(c.regras).filter(([r, texto]) => existe[r] !== texto);
    if (diferentes.length) {
      await pb.collections.update(existe.id, Object.fromEntries(diferentes));
      regrasDasColecoes += diferentes.length;
      console.log(`${c.nome}: a coleção já existe; ${diferentes.map(([r]) => r).join(', ')} — regra aplicada.`);
    } else {
      console.log(`${c.nome}: a coleção já existe.`);
    }
    continue;
  }
  const campos = [];
  for (const { alvo, ...f } of c.campos) {
    campos.push({ ...f, ...(alvo ? { collectionId: await idDaColecao(alvo) } : {}) });
  }
  // ⚠ O `type` era `'base'` escrito à mão, e uma coleção de AUTENTICAÇÃO criada
  // assim nasce sem `tokenKey` e sem `password` (27/09/2026): o `newAuthToken()`
  // de quem a usasse rebentava — numa casa habitada, que é a única onde este
  // ficheiro corre.
  await pb.collections.create({
    name: c.nome, type: c.tipo || 'base', fields: campos, indexes: c.indexes || [],
    ...(c.passwordAuth ? { passwordAuth: c.passwordAuth } : {}),
    ...(c.authToken ? { authToken: c.authToken } : {}),
    ...c.regras,
  });
  colecoesCriadas++;
  console.log(`${c.nome}: coleção ${c.tipo === 'auth' ? 'de autenticação ' : ''}criada, com ${campos.length} campos.`);
}

let criados = 0;
let jaLa = 0;

// Agrupa por coleção: uma só escrita por coleção, e não uma por campo — cada
// `collections.update` reescreve a lista de campos inteira, e duas escritas
// seguidas com listas lidas antes da primeira perdem o campo da primeira.
const porColecao = new Map();
for (const [colecao, campo, def] of CAMPOS) {
  if (!porColecao.has(colecao)) porColecao.set(colecao, []);
  porColecao.get(colecao).push([campo, def]);
}

for (const [nome, lista] of porColecao) {
  const c = await pb.collections.getOne(nome);
  const novos = [];
  for (const [campo, def] of lista) {
    if (c.fields.some(f => f.name === campo)) { jaLa++; continue; }
    const { alvo, ...resto } = def;
    novos.push({
      name: campo, ...resto,
      ...(alvo ? { collectionId: await idDaColecao(alvo) } : {}),
    });
  }
  if (!novos.length) { console.log(`${nome}: nada a acrescentar.`); continue; }
  await pb.collections.update(c.id, { fields: [...c.fields, ...novos] });
  criados += novos.length;
  console.log(`${nome}: acrescentado ${novos.map(f => f.name).join(', ')}.`);
}

// ── E o que não pode lá estar ────────────────────────────────────────────────
//
// ⚠ Recusa-se a tirar um campo de uma coleção que tenha LINHAS. Um campo pode
// estar errado e ter dados que alguém quer ver antes de os perder; essa decisão
// é de quem os tem à frente.
let tirados = 0;
for (const [nome, campo, porque] of CAMPOS_A_TIRAR) {
  const c = await pb.collections.getOne(nome).catch(() => null);
  if (!c) { console.log(`${nome}: a coleção não existe.`); continue; }
  if (!c.fields.some(f => f.name === campo)) { console.log(`${nome}.${campo}: já não existe.`); continue; }

  const linhas = await pb.collection(nome).getList(1, 1).then(r => r.totalItems).catch(() => -1);
  if (linhas !== 0) {
    console.error(`\n✕ ${nome}.${campo} devia sair (${porque})`);
    console.error(`  mas a coleção tem ${plural(linhas, 'linha', 'linhas')}.`
      + ' Trate delas primeiro — este script não apaga dados.');
    await sair(1);
  }
  await pb.collections.update(c.id, { fields: c.fields.filter(f => f.name !== campo) });
  tirados++;
  console.log(`${nome}: tirado ${campo} — ${porque}`);
}

// ── As regras ────────────────────────────────────────────────────────────────
//
// ⚠ Só DEPOIS dos campos: uma regra que fale de um campo que ainda não existe é
// recusada pelo PocketBase.
let regrasMudadas = 0;
for (const [nome, regras] of REGRAS) {
  const c = await pb.collections.getOne(nome);
  const diferentes = Object.entries(regras).filter(([r, texto]) => c[r] !== texto);
  if (!diferentes.length) { console.log(`${nome}: as regras já são estas.`); continue; }
  await pb.collections.update(c.id, Object.fromEntries(diferentes));
  regrasMudadas += diferentes.length;
  console.log(`${nome}: ${diferentes.map(([r]) => r).join(', ')} — regra aplicada.`);
}

console.log(`\n${plural(colecoesCriadas, 'coleção criada', 'coleções criadas')}`
  + ` · ${plural(criados, 'campo acrescentado', 'campos acrescentados')}`
  + ` · ${jaLa} já existiam · ${plural(tirados, 'tirado', 'tirados')}`
  + ` · ${plural(regrasMudadas + regrasDasColecoes, 'regra aplicada', 'regras aplicadas')}.`);

// ── E a prova de que ficaram lá ──────────────────────────────────────────────
//
// Uma adição que não se verifica é uma esperança. O PocketBase aceita um
// `update` e ignora em silêncio o que não entende — foi assim que uma escrita
// de campo desconhecido passou por boa nesta casa uma vez.
const faltam = [];
for (const [nome, lista] of porColecao) {
  const c = await pb.collections.getOne(nome);
  for (const [campo, def] of lista) {
    const f = c.fields.find(x => x.name === campo);
    if (!f) { faltam.push(`${nome}.${campo} não ficou lá`); continue; }
    if (f.type !== def.type) faltam.push(`${nome}.${campo} é ${f.type} e devia ser ${def.type}`);
  }
}
for (const c of COLECOES) {
  const viva = await pb.collections.getOne(c.nome).catch(() => null);
  if (!viva) { faltam.push(`a coleção ${c.nome} não ficou lá`); continue; }
  for (const campo of c.campos) {
    const f = viva.fields.find(x => x.name === campo.name);
    if (!f) faltam.push(`${c.nome}.${campo.name} não ficou lá`);
    else if (f.type !== campo.type) faltam.push(`${c.nome}.${campo.name} é ${f.type} e devia ser ${campo.type}`);
  }
  // E as regras da coleção leem-se de volta, letra a letra.
  for (const [r, texto] of Object.entries(c.regras)) {
    if (viva[r] !== texto) faltam.push(`${c.nome}.${r} não ficou como a tabela diz`);
  }
}
for (const [nome, campo] of CAMPOS_A_TIRAR) {
  const viva = await pb.collections.getOne(nome).catch(() => null);
  if (viva && viva.fields.some(f => f.name === campo)) faltam.push(`${nome}.${campo} continua lá`);
}
// E as regras leem-se de volta, pela mesma razão que os campos.
for (const [nome, regras] of REGRAS) {
  const viva = await pb.collections.getOne(nome).catch(() => null);
  if (!viva) { faltam.push(`a coleção ${nome} não existe`); continue; }
  for (const [r, texto] of Object.entries(regras)) {
    if (viva[r] !== texto) faltam.push(`${nome}.${r} não ficou como a tabela diz`);
  }
}
if (faltam.length) {
  console.error('\n✕ ' + faltam.join('\n✕ '));
  await sair(1);
}
console.log(`✓ ${plural(CAMPOS.length, 'campo existe', 'campos existem')} com o tipo que a tabela diz,`
  + ` ${plural(COLECOES.length, 'coleção existe', 'coleções existem')},`
  + ` e ${plural(CAMPOS_A_TIRAR.length, 'campo proibido', 'campos proibidos')} já não.`);
