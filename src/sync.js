// Ligação entre a loja local e o servidor.
//
// A loja continua a ser a fonte de verdade do que o ecrã mostra: a app tem de
// funcionar sem rede, e funcionava assim antes de existir servidor. O que isto
// acrescenta é o que faltava para dois telemóveis servirem a mesma casa.
//
// ── Porque é que só o dinheiro vai por aqui, para já ─────────────────────────
//
// O INVARIANTE #2 diz que saldos são somas de movimentos, nunca campos
// escritos. Localmente isso já é verdade. Entre dois telemóveis passa a ser o
// que separa uma app que funciona a dois de uma que perde dinheiro: se a Rita
// e o Tomás creditarem 5 € cada um e cada telemóvel gravar «saldo = 5», o
// resultado é 5. Se cada um gravar «+5», é 10.
//
// Por isso as operações de dinheiro vão para o servidor como INSERÇÕES com
// chave de idempotência — nunca como substituições — e o saldo lê-se das
// vistas, que não têm caminho de escrita. As tarefas, as compras e a agenda
// continuam locais por enquanto: são remendos sobre sementes (`taskEdits`,
// `taskGone`) e não linhas, e traduzi-los é outro trabalho. Dizer que estão
// ligados quando não estão seria pior do que a lacuna.
//
// ── A saúde vai, e só para casa ──────────────────────────────────────────────
//
// `episodios_saude` e `anexos` existem no servidor e têm 16 provas. O travão
// era um «não» inteiro, atrás de cinco pontos de conformidade — são dados
// clínicos de menores, categoria especial no RGPD.
//
// Passou a ser uma CONDIÇÃO, em 03/09/2026: sobe se o servidor viver na casa, e
// não sobe se ele estiver na internet. A regra é o `eEnderecoDeCasa`, em
// `src/endereco.js`, e o travão é o `recusaSaude` no fim deste ficheiro.
//
// «Sobe tudo», por decisão do dono da casa no mesmo dia: as consultas E os
// anexos, com a fotografia. O que fica de fora são as notas, as receitas e as
// decisões, e não por escolha — não têm coleção no servidor.
//
// ⚠ Os dois sobem por caminhos DIFERENTES, e é uma restrição técnica: a
// consulta vai pela fila e o anexo não pode, porque a fila serializa em JSON e
// um ficheiro não é JSON. Ver `anexoDeSaude` e `criarComFicheiro`.

// Sem extensão, que é como o Metro resolve.
//
// ⚠ Cheguei a pôr `.js` aqui para o Node ESM conseguir importar este ficheiro
// numa prova de aceitação. Está escrito em `provar-gerir-casa-pela-app.mjs`
// porque é que não se faz: «mudar a app para agradar à prova é ao contrário. A
// prova é que se adapta.» As provas resolvem-no com um `registerHooks`.
import * as servidor from './pocketbase';
import { A_SAUDE_SOBE, eEnderecoDeCasa, PORQUE_NAO_SOBE } from './endereco';
// A regra do titulo neutro de um evento de saude, partilhada com a agenda da
// Google. Puro, sem `react-native` nem SDK: as provas carregam-no em Node.
import { tituloLaFora } from './evento-de-saude';
// A lista das coleccoes de saude, partilhada com o `pocketbase.js` — o cabecalho
// dela explica porque e que teve de sair deste ficheiro.
import { eColecaoDeSaude } from './colecoes-de-saude';
// ⚠ O `format` é seguro de importar aqui: não importa `react-native`, e por
// isso as provas em Node conseguem carregar este ficheiro. Uma importação que
// arraste o RN parte todas elas — já aconteceu com o `Platform`.
import { chaveDeDMY, dmyDeChave } from './format';
import { extractosDe } from './extracto-do-mes';
import { normalizarOrcamento } from './orcamento';
import { paraOServidor, paraALoja } from './compras-estado';

export { eEnderecoDeCasa, PORQUE_NAO_SOBE };

// O que NUNCA sobe, aconteça o que acontecer.
//
// ⚠ Duas saíram desta lista em 03/09/2026, e por razões diferentes:
//
//   `health`      os episódios sobem quando o servidor vive na casa. A
//                 condição é o `eEnderecoDeCasa`, e o travão o `recusaSaude`.
//   `healthDocs`  os anexos passaram a subir com a FOTOGRAFIA, por decisão do
//                 dono da casa — «sobe tudo». Vão para `anexos`, com o
//                 ficheiro, pelo mesmo travão.
//
// E mais três saíram em 04/09/2026, pela razão que aqui estava escrita: não
// tinham coleção no servidor. «Não é que não subam — é que não há para onde.»
// Agora há: `notas_saude`, `receitas_saude` e `decisoes_saude`, com 24 provas
// em `provar-notas-saude.mjs` e a MESMA condição de visibilidade dos anexos.
//
// O que fica é o `healthGone` — uma lista de ids apagados localmente, que é
// estado de dispositivo e não dado da casa.
export const NUNCA_SINCRONIZA = ['healthGone'];

export const ligado = () => servidor.estaLigado();

// Quem está ligado, do lado do servidor. Devolve null quando a app corre
// local — e é isso que faz cada função abaixo não fazer nada em vez de
// rebentar.
export const sessao = () => {
  if (!ligado() || !servidor.auth.valida()) return null;
  const m = servidor.auth.membro();
  return m ? { membro: m.id, casa: m.casa, nome: m.nome } : null;
};

// ─── Ler ─────────────────────────────────────────────────────────────────────
//
// Traz a casa e devolve-a já na forma que a loja usa. Não filtra nada por
// visibilidade: quem decide o que existe para quem pergunta são as regras das
// coleções. Se este código filtrasse, o dado já teria chegado ao dispositivo.
// Os membros do servidor, na forma que a app usa. O servidor guarda `papel` e
// `fem`; a app pensa em `kid` e usa a inicial para o avatar.
//
// A inicial deriva do nome em vez de ser um campo: um campo separado é uma
// segunda verdade sobre a mesma coisa, e mais cedo ou mais tarde discordam.
export const membrosDoServidor = (linhas) => Object.fromEntries(
  (linhas || []).map(m => [m.nome, {
    id: m.id,
    initial: String(m.nome || '?').trim().charAt(0).toUpperCase(),
    email: m.email || null,
    kid: m.papel === 'crianca',
    papel: m.papel,
    fem: !!m.fem,
    cor: m.cor || null,
    // O identificador com que a criança ENTRA (`casa_nome`) e se ela já tem
    // PIN. Os dois vêm do servidor: a entrada da criança passou a ser lá
    // (09/09/2026), e o «ainda sem PIN» do escolhedor deixou de ser um resumo
    // local que só existia no telemóvel onde o PIN fora posto.
    login: m.login || null,
    pinDefinido: !!m.pin_definido,
    // A fotografia da conta Google, se houver. É uma URL, não um ficheiro: a
    // imagem vive na Google, e copiá-la para o servidor da casa seria guardar
    // um dado pessoal que não é preciso guardar.
    avatar: m.avatar || null,
    figura: m.figura || null,
  }]));

// ── Duas traduções de data, e são as duas o mesmo defeito à espera ──────────
//
// O servidor devolve datas ISO («2026-09-20 10:00:00.000Z»); a loja usa chaves
// («d2026-09-20»). Uma tradução em cada sentido, num sítio só, para não haver
// dois `slice(0, 10)` a divergir.
const chaveDeISO = (iso) => {
  const d = String(iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `d${d}` : null;
};
const isoDeChave = (chave) => String(chave || '').replace(/^d/, '') || null;

// A data de uma ida às compras, com a hora quando ela existe.
//
// ⚠ A HORA cabe aqui e sempre coube: o `planeada_para` é um campo `date` do
// PocketBase, e um `date` guarda o instante. O que não existia era ninguém a
// escrevê-la — o `time` do `shopPlan` era um campo só da demonstração, e foi
// tirado em 07/09/2026 por isso mesmo. Volta agora com sítio dos dois lados.
const isoComHora = (chave, hora) => {
  const dia = isoDeChave(chave);
  if (!dia) return null;
  return /^\d{2}:\d{2}$/.test(String(hora || '')) ? `${dia} ${hora}:00` : dia;
};

// E de volta: «10:30», ou nada quando a linha só tem o dia.
export const horaDeISO = (iso) => {
  const m = String(iso || '').match(/\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return m[1] === '00' && m[2] === '00' ? null : `${m[1]}:${m[2]}`;
};

// A recorrência: a loja fala português corrido, o servidor tem um `select`.
//
// ⚠ Se esta tabela ficar incompleta, o PocketBase recusa o valor — ao contrário
// dos campos desconhecidos, que ele ignora em silêncio. Uma recusa é melhor
// notícia, mas continua a ser uma tarefa que não sobe.
const RECORRENCIA_NO_SERVIDOR = {
  'Uma vez': 'uma_vez', 'Todos os dias': 'diaria', 'Dias de semana': 'dias_semana',
};
const RECORRENCIA_NA_LOJA = Object.fromEntries(
  Object.entries(RECORRENCIA_NO_SERVIDOR).map(([a, b]) => [b, a]));

// As três listas da casa, e a coleção de cada uma. A chave é a da LOJA.
export const LISTA_NO_SERVIDOR = {
  specialities: 'especialidades',
  equipCats: 'categorias_equip',
  stores: 'lojas',
};

export async function puxarCasa() {
  if (!ligado()) return null;
  const casa = await servidor.ler.casa();

  // Movimentos de cofre: a coleção é aditiva, e a loja também. Um para um.
  const nomeDoMembro = Object.fromEntries((casa.membros || []).map(m => [m.id, m.nome]));
  const vaultMoves = (casa.cofre_movimentos || []).map(m => ({
    id: m.id,
    kid: nomeDoMembro[m.membro] || m.membro,
    delta: Number(m.valor) || 0,
    kind: m.tipo,
    label: m.motivo || m.tipo,
    sub: nomeDoMembro[m.autorizado_por] ? `autorizado por ${nomeDoMembro[m.autorizado_por]}` : '',
    // O servidor devolve ISO; a loja usa a chave `d2026-08-20`.
    day: (m.data || '').slice(0, 10)
      .replace(/^(\d{4})-(\d{2})-(\d{2})$/, 'd$1-$2-$3'),
  }));

  // ── Os pontos já pagos, que são uma SOMA e não um campo ───────────────────
  //
  // ⚠ Isto existia como `paidPts` na loja e subia à mão em `Cofre.jsx`:
  // `paidPts[kid] = paidPts[kid] + pts`. Um saldo escrito, o INVARIANTE #2 ao
  // contrário, e desta vez com consequência em euros.
  //
  // A Rita pagava a semanada ao Léo. A linha do cofre subia para o servidor e
  // chegava aos dois telefones — o SALDO do cofre ficava certo nos dois. Mas o
  // `paidPts` era dela: no telemóvel do Tomás continuava a zero, o ecrã dele
  // dizia «catorze pontos por pagar», e ele pagava outra vez.
  //
  // O `kidPts - paidPts` é o que a app mostra por pagar, e agora as duas metades
  // são somas sobre as mesmas linhas. Dois telefones não se podem contradizer
  // sobre uma soma que ambos fazem.
  const paidPts = {};
  for (const m of casa.cofre_movimentos || []) {
    const nome = nomeDoMembro[m.membro];
    if (!nome) continue;
    paidPts[nome] = (paidPts[nome] || 0) + (Number(m.pontos) || 0);
  }
  // Toda a criança tem entrada, mesmo sem movimento nenhum: sem ela o
  // `kidPts - paidPts` era `n - undefined` = NaN em qualquer sítio que não se
  // defendesse, e defender em cada leitura é o remédio, não a cura.
  for (const m of casa.membros || []) {
    if (m.papel === 'crianca' && paidPts[m.nome] === undefined) paidPts[m.nome] = 0;
  }

  // ── As metas da família ───────────────────────────────────────────────────
  //
  // ⚠ O que está juntado é a SOMA dos movimentos, e não um campo lido. Havia um
  // `metas.atual` no servidor com essa forma exacta — um saldo escrito — e saiu
  // antes de alguém lhe escrever. É a mesma decisão do `paidPts` e do saldo do
  // cofre, e pela mesma razão: dois telemóveis a reforçar a meta das férias no
  // mesmo dia não se podem anular.
  //
  // A forma é a da LOJA — `{ name, at, of, when }` —, que é a que o `data.js`
  // semeia e a que o ecrã do Dinheiro já lê. O servidor traduz para ela, nunca
  // o contrário.
  // ⚠ E a meta desce SEM o juntado. Quem soma é a loja, sobre os movimentos —
  // um só dono do número. Devolver aqui um `at` já somado dava duas contas do
  // mesmo valor a viver ao lado uma da outra, e é assim que elas divergem: é a
  // classe de defeito que pôs o «Gasto» do orçamento a zero com dez despesas na
  // base de dados.
  const metas = (casa.metas || []).map(m => ({
    id: m.id,
    idServidor: m.id,
    name: m.nome,
    of: Number(m.alvo) || 0,
    when: m.quando || '',
  }));

  // Os movimentos, na forma aditiva da loja — para o ecrã poder dizer de onde
  // vieram os 50 €, e para a soma local e a do servidor serem a mesma conta.
  const metaMovs = (casa.meta_movimentos || []).map(mv => ({
    id: mv.id,
    meta: mv.meta,
    delta: Number(mv.valor) || 0,
    label: mv.motivo || '',
    por: nomeDoMembro[mv.por] || '',
    day: (mv.data || '').slice(0, 10)
      .replace(/^(\d{4})-(\d{2})-(\d{2})$/, 'd$1-$2-$3'),
  }));

  // ── O objetivo do cofre de cada criança ───────────────────────────────────
  //
  // Por NOME da criança, que é como os ecrãs a tratam. O servidor só devolve o
  // que quem pergunta pode ver: a criança o seu, os adultos os de todas. O
  // juntado não vem daqui — é o saldo do cofre, a soma dos `cofre_movimentos`.
  const objetivosCofre = {};
  for (const o of casa.objetivos_cofre || []) {
    const nome = nomeDoMembro[o.membro];
    if (!nome) continue;
    objetivosCofre[nome] = { id: o.id, nome: o.nome, alvo: Number(o.alvo) || 0 };
  }

  // ── A ementa da semana ────────────────────────────────────────────────────
  //
  // Os pratos na forma da loja, com os ingredientes `{ rotulo, s }` (o
  // corredor pelo nome), e a ementa por CHAVE de dia (`dAAAA-MM-DD`), que é
  // como os ecrãs tratam os dias.
  const pratos = (casa.pratos || []).map(p => ({
    id: p.id,
    idServidor: p.id,
    nome: p.nome,
    ingredientes: (Array.isArray(p.ingredientes) ? p.ingredientes : [])
      .map(i => ({ rotulo: String((i && i.rotulo) || '').trim(), s: (i && i.s) || null }))
      .filter(i => i.rotulo),
  }));
  const ementa = {};
  for (const e of casa.ementa || []) {
    const dia = String(e.dia || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dia) && e.prato) ementa[`d${dia}`] = e.prato;
  }

  // ── O mês aberto ──────────────────────────────────────────────────────────
  //
  // ⚠ É ele que define o INTERVALO por onde tudo o resto se filtra. Sem isto os
  // totais eram somas de SEMPRE, e fechar o mês escrevia zero por cima delas —
  // o que funcionava enquanto eram campos locais e deixou de funcionar quando
  // passaram a ser linhas no servidor: as linhas ficavam, e a leitura seguinte
  // trazia o total todo de volta. O mês fechado reabria sozinho.
  //
  // Sem nenhum mês aberto, o intervalo é «tudo» — é o que uma casa acabada de
  // ligar tem, e é melhor mostrar o que há do que esconder tudo.
  const mesAberto = (casa.meses || []).find(m => !m.fechado_em) || null;
  const inicioDoMes = mesAberto ? String(mesAberto.mes).slice(0, 10) : null;
  // ⚠ Uma data que não é uma data NÃO está no mês.
  //
  // Isto era `String(data || '').slice(0, 10) >= inicioDoMes`, e cada sítio que
  // o chamava passava `d.data || d.created`. O `created` **não existe**: as
  // coleções deste projeto não o declaram, e o PocketBase v0.23+ só o cria
  // quando o esquema o pede. A reserva era `undefined`, e
  // `String(undefined).slice(0,10)` é `"undefine"` — que é MAIOR do que
  // `"2026-09-01"` em ordem alfabética.
  //
  // Ou seja: uma linha sem data contava em TODOS os meses, para sempre, e a
  // reserva escrita para a proteger era exactamente o que a partia. Nunca se
  // viu porque o `sync` sempre escreveu a data — mas uma linha posta à mão no
  // painel de administração bastava.
  //
  // As reservas `|| created` saíram todas: eram código morto a fingir cuidado.
  const noMes = (data) => {
    if (!inicioDoMes) return true;
    const d = String(data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    return d >= inicioDoMes;
  };

  // O que foi gasto NESTE mês: a soma das despesas não anuladas cuja data cai
  // depois de o mês ter aberto. A vista do servidor também soma; isto é para o
  // ecrã ter o número sem uma segunda ida.
  const registered = (casa.despesas || [])
    .filter(d => !d.anula_id && noMes(d.data))
    .reduce((n, d) => n + (Number(d.valor) || 0), 0);

  // ── O gasto POR ENVELOPE ───────────────────────────────────────────────────
  //
  // ⚠ Sem isto, a loja fazia `used: e.name === 'Mercearia' ? s.registered : 0`
  // — o gasto INTEIRO do mês atirado para a Mercearia, e todos os outros
  // envelopes a zero. Era um resto da demonstração, onde as únicas despesas
  // eram compras; com despesas a sério, o ecrã dizia «Mercearia 1 248,64 € /
  // 590,00 €» e «Casa & contas 0,00 €» com o condomínio e a luz lá dentro.
  //
  // Sai por NOME do envelope, que é como a loja e os ecrãs falam deles.
  const gastoPorEnvelope = {};
  // ⚠ `envelopePorId`, e não `nomeDoEnvelope`: esse nome já existe mais abaixo,
  // e dois `const` iguais no mesmo módulo são um SyntaxError — o ficheiro
  // inteiro deixa de analisar. É o mesmo erro que calou o `criar-colecoes.mjs`
  // durante dias, e desta vez a prova de fumo apanhou-o à primeira.
  const envelopePorId = Object.fromEntries((casa.envelopes || []).map(e => [e.id, e.nome]));
  for (const d of casa.despesas || []) {
    if (d.anula_id || !noMes(d.data)) continue;
    const nome = envelopePorId[d.envelope];
    if (!nome) continue;
    gastoPorEnvelope[nome] = (gastoPorEnvelope[nome] || 0) + (Number(d.valor) || 0);
  }

  // ── As contas fixas, e quais estão pagas ──────────────────────────────────
  //
  // A definição vem da coleção, na forma da loja: o envelope e quem paga pelo
  // NOME, que é como os ecrãs falam deles. O servidor só devolve a lista a um
  // adulto — a criança recebe vazio, e é assim que tem de ser (§5).
  //
  // ⚠ «Paga» NÃO é um campo da conta: é a despesa do mês que aponta para ela
  // (INVARIANTE #2). Sai daqui como lista de pagamentos `{ conta, mes, dia,
  // valor, por }`, uma por despesa com `conta_fixa`, e a loja pergunta «há
  // pagamento desta conta neste mês?». Duas contas iguais em dois telemóveis
  // colidem na chave `conta-fixa:<id>:<mês>` em vez de pagarem a renda duas
  // vezes.
  const contasFixas = (casa.contas_fixas || []).map(c => ({
    id: c.id,
    idServidor: c.id,
    nome: c.nome,
    valor: Number(c.valor) || 0,
    dia: Number(c.dia) || 1,
    envelope: envelopePorId[c.envelope] || null,
    quemPaga: nomeDoMembro[c.quem_paga] || null,
  }));
  // ⚠ Sem um `return {` aqui dentro: o guarda `o-que-desce-e-usado` procura o
  // objeto que o `puxarCasa` DEVOLVE pela primeira ocorrência dessas palavras,
  // e um `return {` no meio da função fazia-o ler a linha errada.
  const diaDaDespesa = (d) => String(d.data || '').slice(0, 10);
  const contasPagas = (casa.despesas || [])
    .filter(d => d.conta_fixa && !d.anula_id)
    .map(d => ({
      conta: d.conta_fixa,
      mes: diaDaDespesa(d).slice(0, 7),
      dia: /^\d{4}-\d{2}-\d{2}$/.test(diaDaDespesa(d)) ? `d${diaDaDespesa(d)}` : null,
      valor: Number(d.valor) || 0,
      por: nomeDoMembro[d.pagador] || null,
    }));

  // ── Quanto cada um pagou das despesas PARTILHADAS deste mês ───────────────
  //
  // ⚠ É a base do acerto de contas, e não existia.
  //
  // O `acerto.base` da loja era o `ACERTO_INICIAL` — 86,50 €, uma constante da
  // demonstração — e só contava com `clearedSeeds` falso. Numa casa a sério
  // valia ZERO: o «Contas entre Nós» dizia «Está tudo acertado» com o Tomás a
  // ter pago três vezes mais compras do que a Rita.
  //
  // A fórmula não estava por decidir: está escrita na vista `v_acerto_saldo`
  // desde o primeiro dia — metade das despesas partilhadas de cada um, menos os
  // acertos já pagos. O que faltava era o cliente usá-la.
  //
  // Sai por NOME porque é assim que a loja conhece os membros.
  const partilhasPagas = {};
  let despesasMeias = 0;                 // quantas são, para o ecrã o poder dizer
  for (const d of casa.despesas || []) {
    if (d.anula_id || !d.divide_meias) continue;
    if (!noMes(d.data)) continue;
    despesasMeias += 1;
    const nome = nomeDoMembro[d.pagador];
    if (!nome) continue;
    partilhasPagas[nome] = (partilhasPagas[nome] || 0) + (Number(d.valor) || 0);
  }

  // ── O acerto de contas entre os adultos ───────────────────────────────────
  //
  // ⚠ A mesma história do `paidPts`, no outro livro de dinheiro. O `sync.acerto`
  // ESCREVIA na coleção `acertos` e ninguém a lia de volta — a coleção nem
  // sequer estava na lista que o `ler.casa()` puxa. Uma escrita de sentido
  // único, que é pior do que não sincronizar: os dois telefones julgam-se de
  // acordo. O Tomás pagava à Rita, o telemóvel dela continuava a dizer que a
  // dívida estava por acertar, e pagava-se outra vez.
  //
  // ⚠ E filtra-se pelo MÊS, como as despesas e as transferências. O `fecharMes`
  // fazia `acertoMovs: []` — zero por cima de uma soma, o mesmo defeito do mês
  // que reabria sozinho, e pela mesma razão: as linhas ficam no servidor. O mês
  // novo começa sem acertos por ser OUTRA soma, não por alguém a ter apagado.
  const acertoMovs = (casa.acertos || [])
    .filter(a => noMes(a.data))
    .map(a => ({
      id: a.id,
      de: nomeDoMembro[a.de_membro] || a.de_membro,
      para: nomeDoMembro[a.para_membro] || a.para_membro,
      valor: Number(a.valor) || 0,
      day: (a.data || '').slice(0, 10)
        .replace(/^(\d{4})-(\d{2})-(\d{2})$/, 'd$1-$2-$3'),
    }));

  // ── O registo de alterações da casa ───────────────────────────────────────
  //
  // As mais recentes primeiro, que é a ordem em que se lê um histórico. E
  // limitado: a lista local crescia sem fim nenhum — catorze sítios a
  // acrescentar e nada a cortar —, e uma casa com dois anos de uso levava
  // milhares de linhas para dentro do telefone a cada leitura.
  const registo = (casa.registo || [])
    .map(r => ({
      id: r.id,
      t: r.texto,
      quem: nomeDoMembro[r.quem] || null,
      a: r.area || null,
      at: Date.parse(r.quando) || 0,
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);

  const aCasa = (casa.casas || [])[0] || null;

  // ── A agenda ──────────────────────────────────────────────────────────────
  //
  // ⚠ NÃO se filtra nada aqui por visibilidade. Quem decide que eventos
  // existem para quem pergunta são as regras da coleção — três níveis, com 11
  // provas em provar-agenda-e-tarefas.mjs. Se este código filtrasse, o dado
  // privado já teria chegado ao dispositivo, que é o INVARIANTE #3 ao
  // contrário.
  const added = (casa.eventos || []).map(e => ({
    // O id É o do servidor. As sobreposições da loja (`eventEdits`,
    // `eventGone`) são mapas indexados por id, e usar o mesmo id nos dois
    // lados é o que as faz continuar a funcionar sem mudar um ecrã.
    id: e.id,
    idServidor: e.id,
    day: chaveDeISO(e.dia),
    time: e.hora || '',
    title: e.titulo,
    who: nomeDoMembro[e.responsavel] || '',
    owner: nomeDoMembro[e.autor] || '',
    visibilidade: e.visibilidade || 'so-eu',
    tag: e.etiqueta || '',
    // A consulta a que pertence, quando é de saúde.
    ...(e.episodio ? { healthId: e.episodio } : {}),
  })).filter(e => e.day);

  // ── As tarefas ────────────────────────────────────────────────────────────
  //
  // A tarefa vem numa linha, mas a app lê a urgência e o prazo de MAPAS
  // (`s.urg[id]`, `s.due[id]`). Enche-se os dois, com o id do servidor por
  // chave: os ecrãs não mudam nada e a ordenação continua a funcionar.
  // ⚠ O `today` é o que põe uma tarefa no «Tarefas de Hoje» do Início e no
  // «por fazer hoje» do «Precisa de Si». Era um campo escrito à mão nas
  // sementes do `data.js` e as tarefas do SERVIDOR não o traziam: numa casa a
  // sério — que é toda a casa ligada — aquelas duas secções ficavam vazias para
  // sempre, com oito tarefas na base de dados.
  //
  // Apanhado a semear a casa para experimentar a app. Não dá erro nenhum: dá um
  // ecrã que diz «Nada para hoje» e parece que a app não tem tarefas.
  //
  // A regra é a que a pessoa espera:
  //   • todos os dias        → é de hoje, sempre
  //   • dias de semana       → é de hoje de segunda a sexta
  //   • uma vez              → é de hoje se o prazo for hoje
  const hojeISO = new Date().toISOString().slice(0, 10);
  const diaDaSemana = new Date().getDay();          // 0 domingo … 6 sábado
  const eDiaUtil = diaDaSemana >= 1 && diaDaSemana <= 5;
  const eDeHoje = (t) => {
    if (t.recorrencia === 'diaria') return true;
    if (t.recorrencia === 'dias_semana') return eDiaUtil;
    return String(t.prazo || '').slice(0, 10) === hojeISO;
  };

  const newTasks = (casa.tarefas || []).map(t => ({
    id: t.id,
    idServidor: t.id,
    title: t.titulo,
    who: nomeDoMembro[t.atribuido_a] || '',
    recur: RECORRENCIA_NA_LOJA[t.recorrencia] || 'Uma vez',
    pts: Number(t.pontos) || 0,
    today: eDeHoje(t),
  }));

  const urg = {};
  const due = {};
  // ⚠ A ordem à mão é da CASA, e é a mesma para toda a gente — ver o campo
  // `posto` em `criar-colecoes.mjs`. Só entram as tarefas que foram MESMO
  // arrastadas: sem posto, a tarefa não tem entrada aqui e ordena-se pelo
  // prazo, que é o que o `sortedTasks` espera.
  const taskOrder = {};
  for (const t of casa.tarefas || []) {
    // 1 é «normal», que é o que a loja usa por omissão.
    urg[t.id] = Number.isFinite(Number(t.urgencia)) ? Number(t.urgencia) : 1;
    const chave = chaveDeISO(t.prazo);
    if (chave) due[t.id] = { key: chave, time: String(t.prazo).slice(11, 16) || '18:00' };
    // ⚠ Zero é «sem posto», e não o primeiro lugar — os postos contam de um.
    // Um `number` do PocketBase não é anulável: uma tarefa que nunca foi
    // arrastada lê-se 0, e tratar isso como primeiro lugar punha o grupo
    // inteiro empatado à cabeça.
    const posto = Number(t.posto);
    if (Number.isFinite(posto) && posto > 0) taskOrder[t.id] = posto;
  }

  // ── E o que está feito HOJE ───────────────────────────────────────────────
  //
  // ⚠ `tarefas_feitas` é ADITIVA — uma linha por (tarefa, dia), com índice
  // único no servidor. É o INVARIANTE #2 em estrutura: dois telefones que
  // marquem a mesma tarefa no mesmo dia colidem no índice em vez de se
  // anularem.
  //
  // A loja tem `done[id]`, que é «feita hoje» — o `recurringReset` limpa-o à
  // meia-noite. Portanto só as linhas de hoje entram.
  const hoje = new Date().toISOString().slice(0, 10);
  const done = {};
  const pending = {};
  const feitas = {};
  for (const f of casa.tarefas_feitas || []) {
    const dia = String(f.data || '').slice(0, 10);
    // Guarda-se o id da LINHA para se poder desmarcar: sem ele, desmarcar no
    // servidor não tinha o que apagar.
    // ⚠ E QUEM a marcou (15/09/2026). Sem isto, os pontos de sempre eram
    // atribuídos a quem tem a tarefa AGORA: reatribuir uma rotina diária ao fim
    // de um mês movia trinta marcações confirmadas de uma criança para a outra,
    // e deixava o «por pagar» da primeira negativo. Um ponto ganho é de quem o
    // ganhou — o `marcada_por` da linha sabia-o desde sempre e não subia.
    feitas[`${f.tarefa}|${dia}`] = {
      id: f.id, confirmada: !!f.confirmada_em,
      por: nomeDoMembro[f.marcada_por] || '',
    };
    // ⚠ Uma linha SEM `confirmada_em` é uma marcação de criança à espera de um
    // adulto: é `pending`, não `done`. Entrava em `done` — a criança marcava
    // no telemóvel dela e no da mãe a tarefa aparecia FEITA, sem ninguém a
    // confirmar. Apanhado em 10/09/2026, ao ligar a marcação da criança.
    if (dia === hoje) { if (f.confirmada_em) done[f.tarefa] = true; else pending[f.tarefa] = true; }
  }

  // ── As trocas de tarefas entre irmãos ─────────────────────────────────────
  //
  // Uma linha por troca, do dia: as duas tarefas (pelo id do servidor, que é
  // o id da tarefa na loja), quem propôs e quem aceitou — pelo NOME, como
  // tudo o que a loja lê. A atribuição do dia deriva-se na loja, e é ela que
  // fica só com as de hoje (12/09/2026).
  const trocas = (casa.trocas_tarefas || []).map(tr => ({
    id: tr.id,
    idServidor: tr.id,
    dia: chaveDeISO(tr.dia),
    de: tr.tarefa_de,
    para: tr.tarefa_para,
    propostaPor: nomeDoMembro[tr.proposta_por] || '',
    aceiteEm: tr.aceite_em || null,
    aceitePor: nomeDoMembro[tr.aceite_por] || null,
  })).filter(tr => tr.dia && tr.de && tr.para);

  // ── O extracto de cada mês ────────────────────────────────────────────────
  //
  // Cada movimento de dinheiro da casa, por ordem do tempo, com quem o fez e o
  // saldo a seguir a ele — despesas, cofres, metas, acertos e transferências
  // juntos numa lista só, feita aqui sobre as linhas cruas por `extractosDe`.
  //
  // ⚠ Nenhum campo novo, e NADA se grava ao fechar o mês: um extracto gravado
  // seria um saldo escrito, que é o INVARIANTE #2 ao contrário. O extracto de
  // um mês fechado é estável porque as LINHAS dele não se mexem — a coleção
  // `despesas` não tem `updateRule` nem `deleteRule`. Todos os meses ficam em
  // arquivo porque todos os movimentos ficam na base de dados.
  //
  // A criança não recebe `meses` nem `despesas`, e por isso recebe isto vazio.
  const extractos = extractosDe(casa, nomeDoMembro);

  // ── As regras da casa ─────────────────────────────────────────────────────
  //
  // Viviam só no telefone de quem as mudou: a Rita desligava os pontos e o
  // Tomás continuava a vê-los; ela mudava o valor do ponto e os dois telefones
  // pagavam semanadas diferentes.
  //
  // ⚠ `?? ` e não `||`. O `divide_meias` a false e o `valor_ponto` a 0 são
  // valores VÁLIDOS — com `||` os dois viravam o valor por omissão, e desligar
  // a divisão a meias no servidor não pegava no cliente. É o mesmo cuidado que
  // o `pontos_ligados` precisa, e por isso ele também está aqui.
  const regras = aCasa ? {
    rendimento: Number(aCasa.rendimento_mensal) || 0,
    // Ausente (casa que nunca escolheu) lê-se como mensal, que é o que sempre foi.
    orcamento: normalizarOrcamento(aCasa.orcamento),
    pointValue: Number(aCasa.valor_ponto ?? 0.1),
    payDay: Number(aCasa.dia_pagamento ?? 0),
    splitHalf: aCasa.divide_meias !== false,
    // Ausente lê-se como ligado: é o que a app fazia antes de o campo existir,
    // e um `!!` desligava os pontos a quem já os usava, em silêncio.
    pontosLigados: aCasa.pontos_ligados !== false,
    // E a ementa da semana — pela NEGATIVA: um `bool` novo nasce a `false` em
    // todas as linhas, e `false` tem de ser «ligada». `=== true`, sem margem.
    ementaDesligada: aCasa.ementa_desligada === true,
    // E os ícones dos corredores, pela mesma negativa e pela mesma razão: uma
    // casa que já escolheu ícones não os pode perder por o campo ter chegado.
    iconesDesligados: aCasa.icones_desligados === true,
  } : null;

  // ── As três listas da casa ────────────────────────────────────────────────
  //
  // Especialidades médicas, categorias de equipamento e lojas. Têm todas a
  // mesma forma no servidor — `casa` e `nome` — e por isso uma tradução só.
  //
  // ⚠ A loja guarda-as como listas de TEXTO, e é isso que todos os ecrãs leem.
  // Mudar isso para objetos com id obrigava a mexer em oito ecrãs por uma razão
  // que não é deles. Em vez disso guarda-se um mapa `nome → id` à parte, que é
  // o que permite renomear e apagar do lado do servidor.
  const listas = {};
  const listasIds = {};
  for (const [naLoja, colecao] of Object.entries(LISTA_NO_SERVIDOR)) {
    const linhas = casa[colecao] || [];
    if (!linhas.length) continue;
    listas[naLoja] = linhas.map(l => l.nome);
    listasIds[naLoja] = Object.fromEntries(linhas.map(l => [l.nome, l.id]));
  }

  // ── Os corredores ─────────────────────────────────────────────────────────
  //
  // ⚠ NÃO entram na tabela acima, e a razão é a única coisa que os distingue
  // das outras três listas: têm ORDEM. Uma secção não é só um nome — é o lugar
  // onde ela fica no percurso da loja, e uma lista de nomes sem ordem não diz
  // por onde se anda.
  //
  // Vêm ordenadas pelo `posto`, que conta de UM. Ordenar aqui e não no ecrã é
  // o que faz os dois telemóveis mostrarem o mesmo percurso.
  const linhasDeSeccao = [...(casa.seccoes || [])]
    .sort((a, b) => (Number(a.posto) || 0) - (Number(b.posto) || 0));
  const seccoesDaCasa = linhasDeSeccao.map(l => l.nome);
  // O ícone que a família escolheu para cada corredor (25/09/2026).
  //
  // ⚠ SÓ os escolhidos entram no mapa. Um corredor sem escolha não fica com
  // uma entrada vazia: fica FORA, e o cliente adivinha pelo nome
  // (`src/icone-do-corredor.js`). Guardar `''` aqui era uma escolha escrita a
  // dizer «nenhuma», e a partir daí a adivinha deixava de correr para corredores
  // que nunca foram tocados.
  const iconesDeSeccao = Object.fromEntries(linhasDeSeccao
    .filter(l => l.icone)
    .map(l => [l.nome, l.icone]));
  if (linhasDeSeccao.length) {
    listasIds.seccoes = Object.fromEntries(linhasDeSeccao.map(l => [l.nome, l.id]));
  }
  // `id → nome`, para o artigo saber em que corredor está.
  const nomeDoCorredor = Object.fromEntries(linhasDeSeccao.map(l => [l.id, l.nome]));

  // ── O orçamento ───────────────────────────────────────────────────────────
  //
  // Os envelopes eram SEMENTES NO CÓDIGO (`ENV_BASE`): a lista nunca veio do
  // servidor, e criar um envelope acrescentava uma chave a um mapa de limites.
  const envelopesDaCasa = (casa.envelopes || []).map(e => ({
    id: e.id,
    name: e.nome,
    limit: Number(e.limite_base) || 0,
    color: e.cor || null,
  }));

  // ⚠ E o `envMove` — o ajuste de cada envelope dentro do mês — era um SALDO
  // ESCRITO: um mapa `nome → número` que cada telefone reescrevia por inteiro.
  // É o INVARIANTE #2 ao contrário, e a consequência é a do CLAUDE.md: se a
  // Rita mover 50 € da Mercearia para o Lazer e o Tomás mover 30 € do Lazer
  // para a Casa, o último a gravar apaga o outro.
  //
  // Passa a ser a SOMA das `transferencias`, que são aditivas e têm chave de
  // idempotência. Uma soma não se anula.
  const nomeDoEnvelope = Object.fromEntries(envelopesDaCasa.map(e => [e.id, e.name]));
  const envMove = {};
  // ⚠ Só as DESTE mês, pela mesma razão do `registered`: o ajuste de um
  // envelope é uma redistribuição dentro de um mês, e arrastá-la para o
  // seguinte era começar o mês com o orçamento já mexido.
  for (const t of (casa.transferencias || []).filter(x => noMes(x.mes))) {
    const de = nomeDoEnvelope[t.de_envelope];
    const para = nomeDoEnvelope[t.para_envelope];
    const valor = Number(t.valor) || 0;
    if (de) envMove[de] = (envMove[de] || 0) - valor;
    if (para) envMove[para] = (envMove[para] || 0) + valor;
  }

  // ── As compras ────────────────────────────────────────────────────────────
  //
  // A lista ABERTA é a que não tem `fechada_em`. Pode não haver nenhuma — a
  // casa entre duas idas às compras não tem lista, e isso é um estado válido.
  const aberta = (casa.listas_compras || []).find(l => !l.fechada_em) || null;
  const nomeDaLoja = Object.fromEntries((casa.lojas || []).map(l => [l.id, l.nome]));

  const artigosDaLista = (casa.artigos || []).filter(a => aberta && a.lista === aberta.id);

  // ⚠ A forma é a da LOJA, campo a campo. Era esta:
  //
  //     { id, idServidor, label, section, habitual, est }
  //
  // e os ecrãs leem `i.s` e `i.staple` — a forma das sementes do `data.js`, que
  // é a que o `criarArtigo` também escreve. O `section` e o `habitual` não eram
  // lidos por ninguém.
  //
  // Consequência: o Modo Compras existe para andar corredor a corredor, e numa
  // casa ligada ao servidor as QUATRO secções apareciam vazias. Medido:
  // «Frutas & Legumes · 0 artigos», «Frescos · 0», «Mercearia · 0», «Casa · 0»
  // — e «Toda a lista · 8 artigos». Os artigos existiam todos; nenhum tinha o
  // campo pelo qual são agrupados.
  //
  // É a terceira vez que um nome divergente entre o servidor e os ecrãs custa
  // uma funcionalidade inteira, depois do `sem-stock` e do `plano.time`. Guarda:
  // `__tests__/o-artigo-tem-a-forma-da-loja.test.js`.
  const newItems = artigosDaLista.map(a => ({
    id: a.id,
    idServidor: a.id,
    label: a.rotulo,
    // ⚠ O corredor pelo NOME, e não pelo índice.
    //
    // Era `Number(a.seccao) || 0` — um índice numa lista de quatro nomes que a
    // casa não podia mudar. Agora que os pode reordenar e apagar, um índice
    // aponta para outra coisa a cada mudança. A reserva para o índice antigo
    // fica enquanto houver linhas por migrar: `migrar-seccoes.mjs` enche o
    // `corredor`, e até lá o número ainda diz onde o artigo estava.
    s: nomeDoCorredor[a.corredor]
      || seccoesDaCasa[Number(a.seccao) || 0]
      || seccoesDaCasa[0] || null,
    staple: !!a.habitual,
    est: Number(a.estimativa) || 0,
    // A linha pequena debaixo do rótulo. As sementes trazem-na escrita; aqui
    // constrói-se de quem pediu o artigo, que é a informação que o servidor
    // tem. Sem `pedido_por`, fica vazia em vez de dizer «undefined».
    by: a.habitual ? 'Artigo habitual'
      : nomeDoMembro[a.pedido_por] ? `Adicionado por ${nomeDoMembro[a.pedido_por]}` : '',
    // Quem vê: `adultos` é a prenda que a criança não pode ver. O servidor já
    // não a devolve a uma criança; aqui é só a pastilha «só adultos» na linha.
    vis: a.visibilidade === 'adultos' ? 'adultos' : 'familia',
  }));

  // A ordem que a mão deu aos artigos dentro do corredor. ⚠ Só entra quem tem
  // posto: um `number` do PocketBase nasce a zero em todas as linhas que já
  // existiam, e zero quer dizer «nunca foi arrastado». Sem este filtro a lista
  // inteira ficava empatada em primeiro e saía por ordem qualquer — foi o que
  // aconteceu às tarefas, e está escrito no campo delas.
  const itemOrder = {};
  for (const a of artigosDaLista) {
    const posto = Number(a.posto);
    if (Number.isFinite(posto) && posto > 0) itemOrder[a.id] = posto;
  }

  // ⚠ O `estado` vem DA LINHA de cada artigo, e não de uma lista à parte. É
  // isso que faz dois telefones na mesma loja fundirem-se em vez de se
  // anularem — o comentário da coleção `artigos` já o dizia antes de eu o
  // fazer errado.
  const status = {};
  for (const a of artigosDaLista) {
    const naLoja = paraALoja(a.estado);
    if (naLoja && naLoja !== 'open') status[a.id] = naLoja;
  }

  // ── As últimas idas às compras ────────────────────────────────────────────
  //
  // ⚠ O `shopHistory` era uma lista escrita no telefone de quem foi ao
  // supermercado, e mais nada. Quem não tinha ido via o histórico vazio — e a
  // comparação com a ida anterior, que é para o que ele serve, não funcionava
  // para metade da casa.
  //
  // Agora deriva-se das listas FECHADAS, que são as mesmas para os dois. Dez, a
  // contar da mais recente, como o ecrã sempre mostrou.
  // ⚠ E os RÓTULOS, não só a contagem (16/09/2026).
  //
  // O histórico contava «4 artigos» e mais nada, e a linha era só de leitura —
  // o botão «Repetir compra» que ela teve foi tirado em 13/09 porque não havia
  // o que repetir. Os artigos das listas fechadas continuam no servidor, presos
  // à sua lista: o que faltava era trazê-los. Com eles, repetir uma ida é
  // acrescentar à lista de agora o que se comprou da outra vez.
  //
  // O corredor vem junto porque um artigo sem corredor cai no primeiro, e quem
  // repete uma compra quer o percurso que já tinha.
  const artigosPorLista = {};
  for (const a of casa.artigos || []) {
    if (a.estado === 'confirmado') {
      (artigosPorLista[a.lista] = artigosPorLista[a.lista] || []).push({
        rotulo: a.rotulo || '',
        corredor: nomeDoCorredor[a.corredor] || null,
      });
    }
  }
  const shopHistory = (casa.listas_compras || [])
    .filter(l => l.fechada_em)
    .sort((a, b) => String(b.fechada_em).localeCompare(String(a.fechada_em)))
    .slice(0, 10)
    .map(l => ({
      // O ecrã ordena e data por `at`. É a data do fecho, não a hora a que este
      // telemóvel leu — duas leituras não podem dar histórias diferentes.
      at: Date.parse(l.fechada_em) || 0,
      store: nomeDaLoja[l.loja] || null,
      who: nomeDoMembro[l.comprador] || null,
      total: Number(l.total) || 0,
      // A contagem continua a ser um número — é o que a linha mostra.
      items: (artigosPorLista[l.id] || []).length,
      // E os artigos, para se poder repetir a ida. Só os que têm rótulo: um
      // artigo sem nome não se acrescenta a lista nenhuma.
      artigos: (artigosPorLista[l.id] || []).filter(a => a.rotulo),
    }));

  const shopPlan = aberta ? {
    idServidor: aberta.id,
    // O ecrã guarda o ÍNDICE da loja na lista `stores`, não o nome. Traduz-se
    // aqui; se a loja tiver saído da lista, fica -1 e o ecrã diz «por escolher».
    store: (listas.stores || []).indexOf(nomeDaLoja[aberta.loja]),
    who: nomeDoMembro[aberta.comprador] || null,
    day: chaveDeISO(aberta.planeada_para),
    // A hora, quando a linha a tem. `null` quando só há dia — e é o `null` que
    // faz a linha do ecrã não deixar um separador pendurado.
    time: horaDeISO(aberta.planeada_para),
  } : null;

  // ── Os equipamentos ───────────────────────────────────────────────────────
  //
  // A forma da loja: `name`, `cat`, `bought`, `shop`, `price`, `warrantyEnd`,
  // `maint`, `maintDate`. O `daysLeft` NÃO vem — é derivado da garantia e do
  // dia de hoje, e um número gravado fica errado amanhã.
  //
  // ⚠ A categoria é um NOME — `equipamentos.categoria` é texto, e é o nome que
  // a folha «Registar equipamento» escreve. A semente da simulação escreveu lá
  // o ID da linha de `categorias_equip`, e a ficha do Frigorífico dizia
  // «klb00gtqqxcckvf» por baixo do nome. Apanhado pela sonda em 08/09/2026.
  // Se o texto for o id de uma categoria da casa, traduz-se para o nome; é a
  // mesma defesa das duas pontas da data da receita (classe 21).
  const nomeDaCategoria = Object.fromEntries((casa.categorias_equip || []).map(c => [c.id, c.nome]));
  const newEquip = (casa.equipamentos || []).map(e => ({
    id: e.id,
    idServidor: e.id,
    name: e.nome,
    cat: nomeDaCategoria[e.categoria] || e.categoria || '',
    bought: dmyDeISO(e.comprado_em),
    shop: e.loja || '',
    price: Number(e.preco) || 0,
    warrantyEnd: dmyDeISO(e.garantia_ate),
    maint: e.manutencao || '',
    maintDate: dmyDeISO(e.manutencao_ate),
    // As fotografias, como o documento do contrato: o URL assinado pelo
    // servidor, não construído aqui. Não vinham (13/09/2026): a fatura
    // fotografada num telemóvel ficava só nele — e na web morria ao recarregar,
    // porque um `blob:` não sobrevive à página.
    fatura: servidor.ler.ficheiro(e, 'fatura'),
    foto: servidor.ler.ficheiro(e, 'foto'),
  }));

  // ── Os contratos e as renovações ──────────────────────────────────────────
  //
  // Na forma da loja: as datas em `dd/mm/aaaa`, quem trata pelo NOME, e o
  // documento como o URL assinado pelo servidor — não se constrói aqui. O
  // servidor só devolve a lista a um adulto.
  const contratos = (casa.contratos || []).map(c => ({
    id: c.id,
    idServidor: c.id,
    nome: c.nome,
    fornecedor: c.fornecedor || '',
    renovaEm: dmyDeISO(c.renova_em),
    fidelizacaoAte: dmyDeISO(c.fidelizacao_ate),
    responsavel: nomeDoMembro[c.responsavel] || null,
    ficheiro: servidor.ler.ficheiro(c, 'ficheiro'),
  }));

  // ── As preferências de quem está ligado ───────────────────────────────────
  //
  // ⚠ Vem UMA linha, ou nenhuma: a regra devolve só a de quem pergunta. Por
  // isso os mapas `schemeByUser` e `themeByUser` enchem-se numa chave só — a
  // desta pessoa — e não se toca nas dos outros, que este dispositivo possa ter
  // guardado localmente.
  const minhaPref = (casa.preferencias || [])[0] || null;
  const euSou = minhaPref ? nomeDoMembro[minhaPref.membro] : null;
  const preferencias = (minhaPref && euSou) ? {
    nome: euSou,
    esquema: Number(minhaPref.esquema_cor) || 0,
    aspeto: minhaPref.aspeto || 'sistema',
    notif: {
      digest: minhaPref.resumo_ativo !== false,
      hour: minhaPref.resumo_hora || '20:00',
      lead: Number(minhaPref.aviso_prazo_dias ?? 1),
    },
  } : null;

  // O mês, na forma da loja. O `monthLimits` é o `limites` da linha — um objeto
  // `nome do envelope → limite`, guardado como JSON.
  const mes = mesAberto ? {
    idServidor: mesAberto.id,
    inicio: chaveDeISO(mesAberto.mes),
    monthLimits: mesAberto.limites || null,
    rendimento: Number(mesAberto.rendimento) || 0,
  } : null;

  return {
    vaultMoves,
    paidPts,
    acertoMovs,
    partilhasPagas,
    despesasMeias,
    gastoPorEnvelope,
    seccoesDaCasa,
    iconesDeSeccao,
    registered,
    newEquip,
    preferencias,
    mes,
    regras,
    listas,
    listasIds,
    envelopesDaCasa,
    envMove,
    metas,
    metaMovs,
    objetivosCofre,
    pratos,
    ementa,
    contasFixas,
    contasPagas,
    contratos,
    newItems,
    itemOrder,
    status,
    shopPlan,
    shopHistory,
    registo,
    added,
    newTasks,
    urg,
    due,
    taskOrder,
    done,
    pending,
    feitas,
    trocas,
    extractos,
    // O servidor manda: se responder, é esta a casa e são estes os membros.
    // Sem servidor, a app fica com a família de demonstração — e diz-o.
    membros: membrosDoServidor(casa.membros),
    nomeDaCasa: aCasa ? aCasa.nome : null,
    casaId: aCasa ? aCasa.id : null,
    // O carimbo do último «Começar de Zero»; vazio em casas que nunca o usaram.
    zeradoEm: (aCasa && aCasa.zerado_em) || null,
    _servidor: casa,
  };
}

// ─── Escrever ────────────────────────────────────────────────────────────────
//
// Cada uma destas é uma inserção. Nenhuma substitui um total.
// A chave de idempotência é posta pela camada de cliente quando falta, e é o
// que impede uma semanada de ser paga duas vezes quando a fila reenvia depois
// de uma reconexão.

// ⚠ Os nomes são os das coleções, não os da loja local. Escrevi-os de
// cabeça à primeira — `descricao` em vez de `motivo`, `dia` em vez de
// `data`, `envelope_de` em vez de `de_envelope` — e o PocketBase ignora
// campos que não conhece **em silêncio**: a escrita passava e os dados
// caíam. Só a prova de dois telemóveis apanhou. Antes de mexer aqui,
// confirme os campos contra db/pocketbase/criar-colecoes.mjs.

export async function movimentoDeCofre({ casa, membro, tipo, valor, motivo, data, autorizadoPor, pontos }) {
  if (!ligado()) return { enviadas: 0, pendentes: 0 };
  return servidor.escrever.criar('cofre_movimentos', {
    // Aos cêntimos: 19 pontos × 0,10 dava 1.9000000000000001 na fila.
    casa, membro, tipo, valor: Math.round(Number(valor) * 100) / 100, motivo, data, autorizado_por: autorizadoPor,
    // Quantos pontos esta semanada pagou. Zero num bónus ou numa retirada,
    // que não pagam pontos nenhuns.
    pontos: Number(pontos) || 0,
  });
}

// `contaFixa` é a conta que esta despesa paga, quando é o caso; `idemKey` é a
// chave que faz a SEGUNDA do mês colidir — `conta-fixa:<id>:<AAAA-MM>`. Sem
// chave dada, a fila põe uma ao acaso, como sempre pôs.
export async function despesa({ casa, envelope, valor, pagador, descricao, data, divideMeias, contaFixa, idemKey }) {
  if (!ligado()) return { enviadas: 0, pendentes: 0 };
  return servidor.escrever.criar('despesas', {
    casa, envelope, valor, pagador, descricao, data, divide_meias: divideMeias,
    conta_fixa: contaFixa || null,
    ...(idemKey ? { idem_key: idemKey } : {}),
  });
}

export async function transferenciaEntreEnvelopes({ casa, de, para, valor, mes, por }) {
  if (!ligado()) return { enviadas: 0, pendentes: 0 };
  return servidor.escrever.criar('transferencias', {
    casa, de_envelope: de, para_envelope: para, valor, mes, por,
  });
}

// Uma linha do registo da casa. Apende-se, e é tudo: não há alterar nem apagar
// deste lado porque não há regra nenhuma no servidor que os deixe.
export async function registoDaCasa({ casa, texto, quem, quando, area }) {
  if (!ligado()) return { enviadas: 0, pendentes: 0 };
  return servidor.escrever.criar('registo', {
    casa,
    // O servidor limita a 300 e ignora em silêncio o que não conhece; cortar
    // aqui é a diferença entre uma linha truncada e uma escrita recusada.
    texto: String(textoDoRegisto(texto, area)).slice(0, 300),
    quem: quem || null,
    quando: quando ? new Date(quando).toISOString() : new Date().toISOString(),
    area: String(area || '').slice(0, 40),
  });
}

// ── ⚠ O diário da casa não conta a saúde de ninguém ──────────────────────────
//
// As linhas de saúde do registo já eram cuidadosas, e está escrito no
// `store.jsx`: não dizem o alergénio, nem o medicamento, nem a especialidade.
// Mas dizem **de quem é a ficha**:
//
//     «Alergia acrescentada à ficha da Mia»
//     «Tomas de uma receita da Mia na agenda: 14 dias»
//
// Enquanto a saúde subia, isso era menos do que o servidor já tinha. Com o
// travão fechado inverte-se: a `alergias_saude` não sobe, e a linha do diário
// passa a ser o ÚNICO rasto — a anunciar que a Mia tem uma alergia e andou
// catorze dias medicada, num servidor onde nada disso devia estar.
//
// A saída é a mesma que ele escolheu para a agenda (28/09/2026): o texto vai
// neutro para fora, e o verdadeiro fica no dispositivo, onde a app o mostra a
// quem pode. O diário continua a dizer que houve movimento na saúde e quando —
// que é para o que serve — sem dizer em quem nem de quê.
//
// ⚠ E só quando o travão está FECHADO. Num servidor de casa não há nada a
// esconder de quem já lá tem a ficha inteira, e um diário mais pobre do que
// precisa de ser também é um defeito.
export const TEXTO_NEUTRO_DE_SAUDE = 'Uma ficha de saúde foi actualizada';

export const textoDoRegisto = (texto, area) => (
  String(area || '') === 'Saúde' && !saudeSincroniza()
    ? TEXTO_NEUTRO_DE_SAUDE
    : String(texto || '')
);

export async function acerto({ casa, de, para, valor, data }) {
  if (!ligado()) return { enviadas: 0, pendentes: 0 };
  return servidor.escrever.criar('acertos', {
    casa, de_membro: de, para_membro: para, valor, data,
  });
}

// ─── As metas da família ─────────────────────────────────────────────────────
//
// A DEFINIÇÃO altera-se; o que está JUNTADO não. São duas coleções e duas
// naturezas, e é o INVARIANTE #2: o alvo é um campo, o juntado é uma soma.
//
// ⚠ A definição vai pelo `criarOuEnfileirarCasa` porque quem chama precisa do
// `id` que o servidor deu — sem ele não há como alterar nem apagar a meta
// depois. O reforço vai pela FILA, como todo o dinheiro desta casa: é aditivo,
// leva chave de idempotência, e não perde nada se a rede falhar.
export async function criarMeta({ casa, nome, alvo, quando }) {
  return criarOuEnfileirarCasa('metas', {
    casa,
    nome: String(nome || '').slice(0, 80),
    alvo: Number(alvo) || 0,
    quando: String(quando || '').slice(0, 40),
  });
}

export async function alterarMeta(idNoServidor, campos = {}) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {
    ...(campos.nome !== undefined ? { nome: String(campos.nome).slice(0, 80) } : {}),
    ...(campos.alvo !== undefined ? { alvo: Number(campos.alvo) || 0 } : {}),
    ...(campos.quando !== undefined ? { quando: String(campos.quando || '').slice(0, 40) } : {}),
  };
  if (!Object.keys(linha).length) return { pendente: true };
  return servidor.pb.collection('metas').update(idNoServidor, linha);
}

// ⚠ Apagar a meta leva os movimentos dela — `cascadeDelete` na relação. Sem
// isso ficavam linhas a apontar para uma meta que já não existe: invisíveis, a
// acumular, e a somar para uma meta que ninguém vê.
export async function apagarMeta(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('metas').delete(idNoServidor);
}

// ── O objetivo do cofre ──────────────────────────────────────────────────────
//
// Uma linha por criança (índice único em `membro`): definir é criar a linha
// ou alterar a que existe. ⚠ Só o nome e o alvo — o juntado é o saldo do
// cofre, e nunca se escreve (INVARIANTE #2).
export async function definirObjetivoDoCofre({ casa, membro, nome, alvo }) {
  if (!ligado()) return { pendente: true };
  const linha = { nome: String(nome || '').trim().slice(0, 60), alvo: Math.round(Number(alvo) * 100) / 100 };
  const ja = await servidor.pb.collection('objetivos_cofre')
    .getFirstListItem(`membro="${membro}"`).catch(() => null);
  if (ja) return servidor.pb.collection('objetivos_cofre').update(ja.id, linha);
  return servidor.pb.collection('objetivos_cofre').create({ casa, membro, ...linha });
}

export async function apagarObjetivoDoCofre(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('objetivos_cofre').delete(idNoServidor);
}

// ── A ementa da semana ───────────────────────────────────────────────────────
//
// Um prato é um molde: o nome e os ingredientes `{ rotulo, s }`. Os artigos só
// nascem quando se põe o prato na lista, pelo `artigoDeCompras`.
const ingredientesLimpos = (lista) => (Array.isArray(lista) ? lista : [])
  .map(i => ({ rotulo: String((i && i.rotulo) || '').trim().slice(0, 60), s: (i && i.s) || null }))
  .filter(i => i.rotulo)
  .slice(0, 40);

export async function pratoDaCasa({ casa, nome, ingredientes }) {
  return criarOuEnfileirarCasa('pratos', {
    casa, nome: String(nome || '').trim().slice(0, 60), ingredientes: ingredientesLimpos(ingredientes),
  });
}

export async function alterarPrato(idNoServidor, campos = {}) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {
    ...(campos.nome !== undefined ? { nome: String(campos.nome || '').trim().slice(0, 60) } : {}),
    ...(campos.ingredientes !== undefined ? { ingredientes: ingredientesLimpos(campos.ingredientes) } : {}),
  };
  if (!Object.keys(linha).length) return { pendente: true };
  return servidor.pb.collection('pratos').update(idNoServidor, linha);
}

export async function apagarPrato(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('pratos').delete(idNoServidor);
}

// O jantar de um dia. Um por dia (índice único): marcar outra vez ALTERA a
// linha; `prato` nulo APAGA-A — «sem jantar marcado» é a ausência da linha.
export async function jantarDoDia({ casa, dia, prato }) {
  if (!ligado()) return { pendente: true };
  const data = isoDeChave(dia);
  const ja = await servidor.pb.collection('ementa')
    .getFirstListItem(`casa="${casa}" && dia>="${data} 00:00:00" && dia<="${data} 23:59:59"`)
    .catch(() => null);
  if (!prato) {
    if (ja) await servidor.pb.collection('ementa').delete(ja.id);
    return { id: ja ? ja.id : null, apagada: !!ja };
  }
  if (ja) return servidor.pb.collection('ementa').update(ja.id, { prato });
  return servidor.pb.collection('ementa').create({ casa, dia: data, prato });
}

// ── As contas fixas ──────────────────────────────────────────────────────────
//
// Só a DEFINIÇÃO passa por aqui. Pagar uma conta é uma `despesa` normal com o
// `contaFixa` a apontar — vai pela fila, com a chave do mês, como todo o
// dinheiro desta casa. ⚠ Não há «marcar como paga» no servidor: «paga» é a
// despesa existir (INVARIANTE #2).
//
// ⚠ Os nomes são os da COLEÇÃO: `quem_paga`, e não `quemPaga`.
export async function contaFixaDaCasa({ casa, nome, valor, dia, envelope, quemPaga }) {
  return criarOuEnfileirarCasa('contas_fixas', {
    casa,
    nome: String(nome || '').trim().slice(0, 60),
    valor: Math.round((Number(valor) || 0) * 100) / 100,
    dia: Math.max(1, Math.min(31, Math.round(Number(dia) || 1))),
    envelope,
    quem_paga: quemPaga || null,
  });
}

export async function alterarContaFixa(idNoServidor, campos = {}) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {
    ...(campos.nome !== undefined ? { nome: String(campos.nome || '').trim().slice(0, 60) } : {}),
    ...(campos.valor !== undefined ? { valor: Math.round((Number(campos.valor) || 0) * 100) / 100 } : {}),
    ...(campos.dia !== undefined ? { dia: Math.max(1, Math.min(31, Math.round(Number(campos.dia) || 1))) } : {}),
    ...(campos.envelope !== undefined ? { envelope: campos.envelope } : {}),
    ...(campos.quemPaga !== undefined ? { quem_paga: campos.quemPaga || null } : {}),
  };
  if (!Object.keys(linha).length) return { pendente: true };
  return servidor.pb.collection('contas_fixas').update(idNoServidor, linha);
}

// Apagar a conta NÃO apaga as despesas que a pagaram: o dinheiro saiu, e fica
// no envelope. O servidor limpa-lhes a relação e mais nada.
export async function apagarContaFixa(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('contas_fixas').delete(idNoServidor);
}

// Reforçar uma meta. ⚠ Um MOVIMENTO, nunca um total: é o que faz dois telemóveis
// somarem-se em vez de se anularem. O valor pode ser negativo — é assim que se
// tira dinheiro de uma meta, porque a linha não se edita nem se apaga.
export async function reforcarMeta({ casa, meta, valor, motivo, por, data }) {
  if (!ligado()) return { enviadas: 0, pendentes: 0 };
  return servidor.escrever.criar('meta_movimentos', {
    casa, meta, valor: Number(valor) || 0,
    motivo: String(motivo || '').slice(0, 80),
    por: por || null,
    data: data || new Date().toISOString(),
  });
}

// ─── A agenda e as tarefas ───────────────────────────────────────────────────
//
// ⚠ Estas tentam DIRETO e só caem na fila se falhar, como o episódio de saúde
// e ao contrário do dinheiro. A razão é a mesma: quem chama precisa do `id` que
// o servidor deu, para depois poder alterar e apagar. A fila devolve quantas
// subiram, não o registo — uma tarefa que fosse só pela fila nunca aprendia o
// seu id, e ficava a ser um objeto local disfarçado de partilhado.
//
// Sem rede continuam a não se perder: a fila fica como rede de segurança.
const criarOuEnfileirarCasa = async (colecao, linha) => {
  if (!ligado()) return { pendente: true };
  try {
    const r = await servidor.pb.collection(colecao).create(linha);
    return { id: r.id };
  } catch (e) {
    await servidor.escrever.criar(colecao, linha);
    return { pendente: true };
  }
};

// ⚠ Os nomes são os das COLEÇÕES. `titulo` e não `title`, `atribuido_a` e não
// `who`, `etiqueta` e não `tag`. O PocketBase ignora em silêncio o que não
// conhece — foi assim que o `medico` e as `notas` de uma consulta caíram.
export async function eventoDaCasa({ casa, dia, hora, titulo, responsavel, autor, visibilidade, etiqueta, episodio }) {
  return criarOuEnfileirarCasa('eventos', {
    casa,
    dia: isoDeChave(dia),
    hora: hora || '',
    // ⚠ O título de um evento de SAÚDE vai neutro — «Consulta» — e a razão está
    // em `src/evento-de-saude.js`.
    //
    // Esta linha era `titulo` a seco, e foi a terceira porta: uma consulta
    // marcada na Saúde subia para `eventos` como «Consulta Pediatria», com a
    // criança no `responsavel`. A coleção `eventos` não é de saúde, portanto o
    // `recusaSaude` nunca a viu — e desde 27/09/2026 o servidor atende na
    // internet. As tomas eram piores: um evento por dia do plano, catorze ou
    // vinte e um, cada um com o NOME DO MEDICAMENTO no título.
    //
    // A regra já existia e já estava decidida — só estava aplicada a um dos
    // destinos. O `agenda-google.js` até escrevia, desde 06/09, que mandar
    // «Consulta Dentista · Mia» para fora «é exactamente o que esse travão
    // existe para impedir, por outra porta». Havia três portas.
    titulo: tituloLaFora({ titulo, etiqueta, episodio }),
    responsavel: responsavel || null,
    autor,
    // O servidor tem um `select` com os três; sem valor, o mais restritivo.
    visibilidade: visibilidade || 'so-eu',
    etiqueta: etiqueta || '',
    episodio: episodio || null,
  });
}

export async function alterarEvento(idNoServidor, campos) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {};
  if ('dia' in campos) linha.dia = isoDeChave(campos.dia);
  if ('hora' in campos) linha.hora = campos.hora || '';
  // ⚠ O mesmo neutro da criação. Corrigir a hora de uma consulta reescrevia o
  // título inteiro para o servidor — e isso desfazia, numa alteração, o que a
  // criação tinha acabado de calar.
  //
  // A etiqueta e o episódio entram na decisão mesmo quando não vêm nos campos:
  // quem altera só a hora manda `{ hora }`, e sem eles o `tituloLaFora` não
  // saberia que aquele evento é de saúde.
  if ('titulo' in campos) {
    linha.titulo = tituloLaFora({
      titulo: campos.titulo,
      etiqueta: 'etiqueta' in campos ? campos.etiqueta : campos.etiquetaAtual,
      episodio: campos.episodio !== undefined ? campos.episodio : campos.episodioAtual,
    });
  }
  if ('visibilidade' in campos) linha.visibilidade = campos.visibilidade;
  if ('responsavel' in campos) linha.responsavel = campos.responsavel || null;
  // ⚠ A etiqueta faltava, e o `eventoDaCasa` manda-a na criação. Mudar a
  // etiqueta de «Escola» para «Saúde» ficava neste telefone para sempre.
  if ('etiqueta' in campos) linha.etiqueta = campos.etiqueta || '';
  return servidor.pb.collection('eventos').update(idNoServidor, linha);
}

export async function apagarEvento(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('eventos').delete(idNoServidor);
}

export async function tarefaDaCasa({ casa, titulo, atribuidoA, recorrencia, pontos, urgencia, prazo, prazoHora }) {
  return criarOuEnfileirarCasa('tarefas', {
    casa,
    titulo,
    atribuido_a: atribuidoA || null,
    recorrencia: RECORRENCIA_NO_SERVIDOR[recorrencia] || 'uma_vez',
    // ⚠ Os pontos podem ser 0 — são opcionais desde 04/09/2026 — e o servidor
    // aceita 0 a 20. Um `|| 0` aqui é correto; um `|| 1` seria pôr pontos onde
    // ninguém os pediu.
    pontos: Number(pontos) || 0,
    urgencia: Number.isFinite(Number(urgencia)) ? Number(urgencia) : 1,
    prazo: prazo ? isoComHora(prazo, prazoHora) : null,
  });
}

export async function alterarTarefa(idNoServidor, campos) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {};
  if ('titulo' in campos) linha.titulo = campos.titulo;
  if ('atribuidoA' in campos) linha.atribuido_a = campos.atribuidoA || null;
  if ('pontos' in campos) linha.pontos = Number(campos.pontos) || 0;
  if ('urgencia' in campos) linha.urgencia = Number(campos.urgencia) || 0;
  if ('recorrencia' in campos) linha.recorrencia = RECORRENCIA_NO_SERVIDOR[campos.recorrencia] || 'uma_vez';
  // ⚠ COM a hora (15/09/2026). O ecrã tem um campo «Hora do prazo» e só a data
  // subia: a leitura seguinte trazia «00:00» e punha TODAS as tarefas com prazo
  // a dizer «atrasada» desde a meia-noite. O  já existia e era usado
  // pelas compras; as tarefas não o chamavam.
  if ('prazo' in campos) linha.prazo = campos.prazo ? isoComHora(campos.prazo, campos.prazoHora) : null;
  // ⚠ Zero é «sem posto», e os postos contam de UM. Um campo `number` do
  // PocketBase não é anulável — escrever `null` guarda 0 —, por isso é o zero
  // que faz de ausência. Ver o campo em `criar-colecoes.mjs`.
  if ('posto' in campos) {
    const n = Number(campos.posto);
    linha.posto = Number.isFinite(n) && n > 0 ? n : 0;
  }
  return servidor.pb.collection('tarefas').update(idNoServidor, linha);
}

export async function apagarTarefa(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('tarefas').delete(idNoServidor);
}

// ── Marcar e desmarcar uma tarefa ────────────────────────────────────────────
//
// ⚠ Marcar CRIA UMA LINHA; desmarcar APAGA-A. Nunca se escreve um booleano
// «feita» na tarefa, e é o INVARIANTE #2: dois telefones que marquem a mesma
// tarefa no mesmo dia colidem no índice único em vez de se anularem, e o
// histórico de quem fez o quê e quando fica.
//
// Uma colisão no índice NÃO é erro para quem chama: quer dizer que já estava
// marcada, que é o estado que se pediu. Devolve-se o que lá está.
export async function marcarTarefaFeita({ casa, tarefa, dia, marcadaPor }) {
  if (!ligado()) return { pendente: true };
  const data = isoDeChave(dia);
  try {
    const r = await servidor.pb.collection('tarefas_feitas').create({
      casa, tarefa, data, marcada_por: marcadaPor });
    return { id: r.id };
  } catch (e) {
    // Já marcada por outro telefone? Procura-se a linha e devolve-se.
    const ja = await servidor.pb.collection('tarefas_feitas')
      .getFirstListItem(`tarefa="${tarefa}" && data>="${data} 00:00:00" && data<="${data} 23:59:59"`)
      .catch(() => null);
    if (ja) return { id: ja.id, jaEstava: true };
    await servidor.escrever.criar('tarefas_feitas', {
      casa, tarefa, data, marcada_por: marcadaPor });
    return { pendente: true };
  }
}

export async function desmarcarTarefaFeita(idDaLinha) {
  if (!ligado() || !idDaLinha) return { pendente: true };
  return servidor.pb.collection('tarefas_feitas').delete(idDaLinha);
}

// A confirmação de um adulto é o que faz os pontos contarem — está no esquema
// desde o início (`confirmada_em`) e a app ainda não a usa. Fica a porta
// aberta, e uma criança não a pode empurrar: a regra exige adulto.
export async function confirmarTarefaFeita(idDaLinha, porQuem) {
  if (!ligado() || !idDaLinha) return { pendente: true };
  return servidor.pb.collection('tarefas_feitas').update(idDaLinha, {
    confirmada_por: porQuem, confirmada_em: new Date().toISOString(),
  });
}

// ── A lista partilhada com quem não tem a app ────────────────────────────────
//
// Um adulto pede um endereço só de leitura da lista ABERTA, válido uma hora.
// É uma escrita DIRETA, sem fila: a resposta traz o sinal que o servidor
// escreveu, e sem ele não há endereço para mostrar — enfileirar não faria
// sentido. Desfazer é apagar a linha; o endereço morre na hora.
// (12/09/2026 — a nona das dez funcionalidades.)
export async function partilharLista({ casa, lista, criadaPor }) {
  if (!ligado()) throw new Error('Só com o servidor ligado se partilha a lista.');
  if (!lista) throw new Error('Não há uma ida às compras aberta para partilhar.');
  const r = await servidor.pb.collection('partilhas_lista').create({ casa, lista, criada_por: criadaPor });
  return {
    id: r.id,
    sinal: r.sinal,
    expiraEm: r.expira_em || null,
    url: `${String(servidor.enderecoDoServidor() || '').replace(/\/$/, '')}/lista/${r.sinal}`,
  };
}

export async function apagarPartilhaDaLista(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('partilhas_lista').delete(idNoServidor);
}

// ── A troca de tarefas entre irmãos ──────────────────────────────────────────
//
// Uma linha por troca, do DIA: as duas tarefas, quem propôs, quem aceitou. A
// atribuição do dia deriva dela na loja — nada se escreve na tarefa, e à
// meia-noite acabou. Propor cria pela fila, como o resto da casa; aceitar e
// apagar são diretos, porque a fila só sabe criar. O servidor é que decide
// quem pode o quê: só quem tem a `tarefa_de` propõe, só quem tem a
// `tarefa_para` aceita (e assina), e só um adulto desfaz uma troca aceite.
// (12/09/2026 — a oitava das dez funcionalidades.)
export async function trocaDeTarefas({ casa, dia, tarefaDe, tarefaPara, propostaPor }) {
  if (!tarefaDe || !tarefaPara || !propostaPor) {
    throw new Error('Uma troca precisa das duas tarefas e de quem a propõe.');
  }
  return criarOuEnfileirarCasa('trocas_tarefas', {
    casa, dia: isoDeChave(dia), tarefa_de: tarefaDe, tarefa_para: tarefaPara, proposta_por: propostaPor,
  });
}

export async function aceitarTrocaDeTarefas(idNoServidor, porQuem) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('trocas_tarefas').update(idNoServidor, {
    aceite_em: new Date().toISOString(), aceite_por: porQuem,
  });
}

export async function apagarTrocaDeTarefas(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('trocas_tarefas').delete(idNoServidor);
}

// ─── A casa e quem lá vive ───────────────────────────────────────────────────
//
// Ao contrário do dinheiro, isto NÃO passa pela fila: são operações que a
// pessoa está a fazer e cujo resultado tem de ver já — se falharem, deve
// saber porquê em vez de ficarem pendentes em silêncio. Por isso escrevem
// direto e deixam o erro subir.
//
// Quem pode o quê é decidido pelo servidor, não aqui: `casas.updateRule` e
// `membros.createRule` exigem administração da mesma casa, e há cinco provas
// em provar-regras.mjs. Repetir a verificação neste ficheiro daria a impressão
// errada de que é o cliente que protege.

// ── As três listas da casa, para o servidor ──────────────────────────────────
//
// Uma função por operação e não uma por lista: as três coleções têm a mesma
// forma, e três cópias de cada função eram três sítios onde a quarta lista que
// alguém acrescentasse se ia esquecer.
//
// ⚠ Todas exigem ADMINISTRAÇÃO no servidor (`createRule: casa && admin`), e é
// mais apertado do que a app — que deixa qualquer adulto criar uma
// especialidade. É divergência conhecida e fica dita: se um adulto que não
// administra criar uma, ela fica no telefone dele. Corrigir isto é escolher um
// dos dois lados, e é decisão do dono da casa.
const colecaoDaLista = (chave) => {
  const c = LISTA_NO_SERVIDOR[chave];
  if (!c) throw new Error(`Lista desconhecida: ${chave}`);
  return c;
};

export async function acrescentarNaLista(chave, { casa, nome }) {
  if (!ligado()) return { pendente: true };
  return criarOuEnfileirarCasa(colecaoDaLista(chave), { casa, nome });
}

export async function renomearNaLista(chave, id, nome) {
  if (!ligado() || !id) return { pendente: true };
  return servidor.pb.collection(colecaoDaLista(chave)).update(id, { nome });
}

export async function apagarDaLista(chave, id) {
  if (!ligado() || !id) return { pendente: true };
  return servidor.pb.collection(colecaoDaLista(chave)).delete(id);
}

// ── Os corredores da loja ────────────────────────────────────────────────────
//
// ⚠ Fora do `acrescentarNaLista` de propósito: uma secção tem `posto`, e as
// outras três listas não têm. Enfiá-la lá dentro obrigava a tabela a ter uma
// excepção — e uma tabela com excepções deixa de ser uma tabela.
export async function criarSeccao({ casa, nome, posto }) {
  if (!ligado()) return { pendente: true };
  return criarOuEnfileirarCasa('seccoes', { casa, nome, posto });
}

export async function renomearSeccao(id, nome) {
  if (!ligado() || !id) return { pendente: true };
  return servidor.pb.collection('seccoes').update(id, { nome });
}

// O ícone escolhido para um corredor. Vazio quer dizer «volta a adivinhar».
export async function iconeDaSeccao(id, icone) {
  if (!ligado() || !id) return { pendente: true };
  return servidor.pb.collection('seccoes').update(id, { icone: icone || '' });
}

export async function apagarSeccao(id) {
  if (!ligado() || !id) return { pendente: true };
  return servidor.pb.collection('seccoes').delete(id);
}

// A ordem nova, de uma vez. ⚠ Os postos contam de UM: um `number` do PocketBase
// não é anulável, e o zero é que faz de «sem posto».
export async function reordenarSeccoes(ids) {
  if (!ligado()) return { pendente: true };
  return Promise.all((ids || []).map((id, i) =>
    servidor.pb.collection('seccoes').update(id, { posto: i + 1 }).catch(() => null)));
}

// E o corredor de um artigo, quando ele muda de sítio. ⚠ Pelo `alterarArtigo`,
// e não com uma escrita própria: o corredor é um dos campos que ele já traduz,
// e dois sítios a escrever o mesmo campo é a classe de defeito que pôs o
// «sem stock» com duas grafias.
export async function mudarCorredor(idNoServidor, idDoCorredor) {
  return alterarArtigo(idNoServidor, { corredor: idDoCorredor || null });
}

// A ordem dos artigos DENTRO do corredor, de uma vez.
//
// ⚠ Os postos contam de UM, como nas tarefas e nas secções: um `number` do
// PocketBase não é anulável, o zero é que faz de «sem posto», e um campo novo
// nasce a zero em todas as linhas que já existem.
export async function reordenarArtigos(ids) {
  if (!ligado()) return { pendente: true };
  return Promise.all((ids || []).map((id, i) =>
    servidor.pb.collection('artigos').update(id, { posto: i + 1 }).catch(() => null)));
}

// ── O mês ────────────────────────────────────────────────────────────────────
//
// ⚠ Fechar o mês fazia `registered: 0` e `envMove: {}` — escrever zero por cima
// de duas somas. Enquanto tudo era local isso funcionava por acidente: o total
// era um campo, e zerá-lo zerava-o.
//
// A partir do momento em que as despesas e as transferências são LINHAS no
// servidor, deixa de funcionar: as linhas continuam lá, e a leitura seguinte
// traz o total todo de volta. O mês fechado reabria sozinho.
//
// O modelo certo é o que a coleção `meses` já previa: uma linha por mês, e o
// mês ABERTO é o que não tem `fechado_em`. Os totais passam a ser as somas
// FILTRADAS por esse mês — nunca zeradas, porque não há nada a zerar.
//
// O `mes` é o primeiro dia do mês, para as comparações serem de datas e não de
// texto.
export async function abrirMes({ casa, mes, rendimento, limites }) {
  return criarOuEnfileirarCasa('meses', {
    casa, mes: isoDeChave(mes),
    rendimento: Number(rendimento) || 0,
    limites: limites || {},
  });
}

export async function alterarMes(idNoServidor, campos) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {};
  if ('rendimento' in campos) linha.rendimento = Number(campos.rendimento) || 0;
  if ('limites' in campos) linha.limites = campos.limites || {};
  // Fechar é pôr a data: o mês deixa de ser o aberto, e os totais do seguinte
  // começam do zero por serem OUTRA soma — não por alguém os ter apagado.
  if ('fechadoEm' in campos) linha.fechado_em = campos.fechadoEm ? isoDeChave(campos.fechadoEm) : null;
  return servidor.pb.collection('meses').update(idNoServidor, linha);
}

// ── As preferências de cada um ───────────────────────────────────────────────
//
// ⚠ Esta é a única coleção que NÃO é da casa: a regra é `membro =
// @request.auth.id` nas cinco operações, e é mais apertada do que a casa. Cada
// um vê e escreve as suas, e mais ninguém — nem quem administra.
//
// Há um índice único no `membro`: uma linha por pessoa. Portanto isto é um
// UPSERT — procura-se a que existe e altera-se, e só se cria quando não há.
// Criar às cegas colidia no índice, e a segunda escrita de cada sessão falhava.
//
// Os valores do `aspeto` são os MESMOS dos dois lados — `claro`, `escuro`,
// `sistema` — e por isso não há tabela de tradução. Se um dia divergirem, é
// aqui que a tradução entra, e não em dois sítios.
export async function preferenciasDoMembro({ membro, esquemaCor, aspeto, resumoAtivo, resumoHora, avisoPrazoDias }) {
  if (!ligado() || !membro) return { pendente: true };
  const linha = { membro };
  if (esquemaCor !== undefined) linha.esquema_cor = Number(esquemaCor) || 0;
  if (aspeto !== undefined) linha.aspeto = aspeto;
  if (resumoAtivo !== undefined) linha.resumo_ativo = !!resumoAtivo;
  if (resumoHora !== undefined) linha.resumo_hora = resumoHora || '';
  if (avisoPrazoDias !== undefined) linha.aviso_prazo_dias = Number(avisoPrazoDias) || 0;

  // ⚠ Direto, sem fila. Uma preferência é um ESTADO, não um movimento: duas
  // escritas fora de ordem deixavam a antiga a ganhar, e a fila só sabe criar.
  const ja = await servidor.pb.collection('preferencias')
    .getFirstListItem(`membro="${membro}"`).catch(() => null);
  if (ja) return servidor.pb.collection('preferencias').update(ja.id, linha);
  return servidor.pb.collection('preferencias').create(linha);
}

// ── Os equipamentos ──────────────────────────────────────────────────────────
//
// ⚠ As datas fazem DUAS traduções, e é onde este género de coisa se parte: a
// loja guarda-as como texto «dd/mm/aaaa», a chave interna é `d2026-09-20`, e o
// servidor quer ISO. Num sítio só, e nos dois sentidos.
//
// O `daysLeft` das sementes NÃO sobe: é derivado da garantia e da data de hoje,
// e guardá-lo era gravar um número que fica errado ao dia seguinte.
//
// ⚠ Os campos `fatura` e `foto` da coleção vão À PARTE, pelo
// `fotografiaDoEquipamento` (um `update` com ficheiro, como o documento do
// contrato): a fila serializa em JSON, e um ficheiro não é JSON. Esta nota
// dizia que «a app ainda não tem onde escolher a fotografia» — e tinha, desde
// a ficha do equipamento; as fotografias escolhiam-se e nunca subiam
// (13/09/2026, os testes de importação e exportação).
const isoDeDMY = (dmy) => {
  const k = chaveDeDMY(dmy);
  return k ? isoDeChave(k) : null;
};
const dmyDeISO = (iso) => {
  const k = chaveDeISO(iso);
  return k ? dmyDeChave(k) : '';
};

export async function equipamentoDaCasa({ casa, nome, categoria, compradoEm, loja, preco, garantiaAte, manutencao, manutencaoAte }) {
  return criarOuEnfileirarCasa('equipamentos', {
    casa, nome,
    categoria: categoria || '',
    comprado_em: isoDeDMY(compradoEm),
    loja: loja || '',
    preco: Number(preco) || 0,
    garantia_ate: isoDeDMY(garantiaAte),
    manutencao: manutencao || '',
    manutencao_ate: isoDeDMY(manutencaoAte),
  });
}

export async function alterarEquipamento(idNoServidor, campos) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {};
  if ('nome' in campos) linha.nome = campos.nome;
  if ('categoria' in campos) linha.categoria = campos.categoria || '';
  if ('compradoEm' in campos) linha.comprado_em = isoDeDMY(campos.compradoEm);
  if ('loja' in campos) linha.loja = campos.loja || '';
  if ('preco' in campos) linha.preco = Number(campos.preco) || 0;
  if ('garantiaAte' in campos) linha.garantia_ate = isoDeDMY(campos.garantiaAte);
  if ('manutencao' in campos) linha.manutencao = campos.manutencao || '';
  if ('manutencaoAte' in campos) linha.manutencao_ate = isoDeDMY(campos.manutencaoAte);
  return servidor.pb.collection('equipamentos').update(idNoServidor, linha);
}

export async function apagarEquipamento(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('equipamentos').delete(idNoServidor);
}

// O URL assinado de um ficheiro que o servidor acabou de guardar — para a loja
// pôr no lugar do `blob:`/`file://` local depois de uma escrita com ficheiro.
export const urlDoFicheiro = (registo, campo) => servidor.ler.ficheiro(registo, campo);

// A fotografia de um equipamento — a fatura ou a chapa com o n.º de série. Ou
// sobe ou rebenta; quem chama guarda a imagem no aparelho primeiro e marca-a
// «por subir». Devolve o URL assinado do ficheiro no servidor, para a loja o
// pôr no lugar do `blob:`/`file://` local, que não serve a mais ninguém.
export async function fotografiaDoEquipamento(idNoServidor, campo, { uri, blob, nome, mime }) {
  if (!idNoServidor) throw new Error('Uma fotografia sem equipamento não se grava.');
  if (campo !== 'fatura' && campo !== 'foto') throw new Error(`O equipamento não tem a fotografia «${campo}».`);
  const r = await servidor.escrever.atualizarComFicheiro('equipamentos', idNoServidor,
    { campo, uri, blob, nome, tipo: mime });
  return { id: r.id, url: servidor.ler.ficheiro(r, campo) };
}

// ── Os contratos e as renovações ─────────────────────────────────────────────
//
// A definição vai pela fila, como o equipamento. O DOCUMENTO não pode: a fila
// serializa em JSON e um ficheiro não é JSON — por isso vai à parte, num
// `update` só com o ficheiro, quando o contrato já tem id no servidor. Quem
// chama guarda a imagem no dispositivo primeiro e marca-a «por subir» se isto
// falhar, como o anexo de saúde.
//
// ⚠ Os nomes são os da COLEÇÃO: `renova_em`, `fidelizacao_ate`, `responsavel`.
export async function contratoDaCasa({ casa, nome, fornecedor, renovaEm, fidelizacaoAte, responsavel }) {
  return criarOuEnfileirarCasa('contratos', {
    casa,
    nome: String(nome || '').trim().slice(0, 60),
    fornecedor: String(fornecedor || '').trim().slice(0, 60),
    renova_em: isoDeDMY(renovaEm),
    fidelizacao_ate: isoDeDMY(fidelizacaoAte),
    responsavel: responsavel || null,
  });
}

export async function alterarContrato(idNoServidor, campos = {}) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {
    ...(campos.nome !== undefined ? { nome: String(campos.nome || '').trim().slice(0, 60) } : {}),
    ...(campos.fornecedor !== undefined ? { fornecedor: String(campos.fornecedor || '').trim().slice(0, 60) } : {}),
    ...(campos.renovaEm !== undefined ? { renova_em: isoDeDMY(campos.renovaEm) } : {}),
    ...(campos.fidelizacaoAte !== undefined ? { fidelizacao_ate: isoDeDMY(campos.fidelizacaoAte) } : {}),
    ...(campos.responsavel !== undefined ? { responsavel: campos.responsavel || null } : {}),
  };
  if (!Object.keys(linha).length) return { pendente: true };
  return servidor.pb.collection('contratos').update(idNoServidor, linha);
}

export async function apagarContrato(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('contratos').delete(idNoServidor);
}

// O documento do contrato — a apólice, o contrato assinado. Ou sobe ou rebenta;
// quem chama decide o que fazer com a falha.
export async function documentoDoContrato(idNoServidor, { uri, blob, nome, mime }) {
  if (!idNoServidor) throw new Error('Um documento sem contrato não se grava.');
  return servidor.escrever.atualizarComFicheiro('contratos', idNoServidor,
    { campo: 'ficheiro', uri, blob, nome, tipo: mime });
}

// ── As compras ───────────────────────────────────────────────────────────────
//
// ⚠ O `estado` de um artigo vai NA LINHA dele, e o esquema já avisava porquê,
// no comentário da coleção `artigos`:
//
//   «O estado vive na linha do artigo. Se fosse uma lista de identificadores
//    confirmados, dois telefones na mesma loja anulavam-se; assim, fundem-se.»
//
// O cliente tinha exactamente a lista que o comentário proíbe — um mapa
// `status` que cada telefone reescrevia por inteiro. Dois adultos a dividir os
// corredores anulavam o trabalho um do outro. É a mesma forma do `envMove`.
//
// ⚠ A tabela vivia AQUI, e o comentário dizia «a loja fala open | done | sem
// stock». Não fala: fala «sem-stock», com hífen, e por isso marcar um artigo
// como esgotado não funcionava em direcção nenhuma. Saiu para o
// `compras-estado.js`, que é o dono do vocabulário e que as provas conseguem
// ler — ver lá o relato inteiro.

export async function listaDeCompras({ casa, loja, comprador, planeadaPara, hora }) {
  return criarOuEnfileirarCasa('listas_compras', {
    casa, loja: loja || null, comprador: comprador || null,
    planeada_para: planeadaPara ? isoComHora(planeadaPara, hora) : null,
  });
}

export async function alterarListaDeCompras(idNoServidor, campos) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {};
  if ('loja' in campos) linha.loja = campos.loja || null;
  if ('comprador' in campos) linha.comprador = campos.comprador || null;
  // ⚠ O dia e a hora vão JUNTOS. Mandar a hora sozinha não faz sentido — uma
  // hora sem dia não é um instante —, e por isso quem chama manda os dois.
  if ('planeadaPara' in campos) {
    linha.planeada_para = campos.planeadaPara ? isoComHora(campos.planeadaPara, campos.hora) : null;
  }
  // Fechar a conta é pôr a data: a lista deixa de ser a aberta.
  if ('fechadaEm' in campos) linha.fechada_em = campos.fechadaEm ? isoDeChave(campos.fechadaEm) : null;
  // E quanto custou, que é o que faz o histórico chegar ao outro telemóvel.
  if ('total' in campos) linha.total = Number(campos.total) || 0;
  return servidor.pb.collection('listas_compras').update(idNoServidor, linha);
}

// ⚠ O `corredor` é uma RELAÇÃO e vem de quem chama. O `seccao` numérico deixou
// de ser escrito: era um índice, e a casa passou a poder reordenar as secções.
export async function artigoDeCompras({ casa, lista, rotulo, corredor, pedidoPor, habitual, estimativa, visibilidade }) {
  if (!lista) throw new Error('Um artigo sem lista não se grava — não teria onde aparecer.');
  return criarOuEnfileirarCasa('artigos', {
    casa, lista, rotulo,
    corredor: corredor || null,
    pedido_por: pedidoPor || null,
    estado: 'por_comprar',
    habitual: !!habitual,
    estimativa: Number(estimativa) || 0,
    visibilidade: visibilidade === 'adultos' ? 'adultos' : 'familia',
  });
}

// ⚠ Marcar um artigo ALTERA A LINHA dele — não escreve numa lista à parte. É
// isso que faz dois telefones na mesma loja fundirem-se: cada um altera os
// artigos que apanhou, e nenhum reescreve os do outro.
export async function marcarArtigo(idNoServidor, estado, precoReal) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('artigos').update(idNoServidor, {
    // ⚠ Sem `|| 'por_comprar'`. Esse `||` transformava um estado que a
    // tabela não conhecia num estado VÁLIDO, e escrevia «por comprar» por cima
    // do que a pessoa acabara de marcar. Um estado desconhecido é um defeito,
    // não um valor por omissão: não se escreve o campo, e o servidor fica como
    // estava. O guarda que impede que volte a acontecer enumera as grafias dos
    // ecrãs — `__tests__/o-estado-do-artigo-tem-uma-grafia.test.js`.
    ...(paraOServidor(estado) ? { estado: paraOServidor(estado) } : {}),
    ...(precoReal !== undefined ? { preco_real: Number(precoReal) || 0 } : {}),
  });
}

// Alterar um artigo: o rótulo, o corredor, quem pediu, o habitual, a
// estimativa, o posto.
//
// ⚠ Um sítio só a traduzir os campos do artigo para os nomes do servidor. O
// `marcarArtigo` fica à parte de propósito — o estado tem uma tabela de
// grafias própria (`compras-estado.js`) e um preço real que só a loja escreve.
//
// ⚠ E cada campo entra só se quem chama o mandou: um `campos.rotulo` ausente
// não pode virar `rotulo: ''` e apagar o nome do artigo. É a mesma forma do
// `alterarEquipamento` e do `alterarEvento`.
export async function alterarArtigo(idNoServidor, campos = {}) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {
    ...(campos.rotulo !== undefined ? { rotulo: campos.rotulo } : {}),
    ...(campos.corredor !== undefined ? { corredor: campos.corredor || null } : {}),
    ...(campos.pedidoPor !== undefined ? { pedido_por: campos.pedidoPor || null } : {}),
    ...(campos.habitual !== undefined ? { habitual: !!campos.habitual } : {}),
    ...(campos.estimativa !== undefined ? { estimativa: Number(campos.estimativa) || 0 } : {}),
    ...(campos.posto !== undefined ? { posto: Number(campos.posto) || 0 } : {}),
    ...(campos.visibilidade !== undefined ? { visibilidade: campos.visibilidade === 'adultos' ? 'adultos' : 'familia' } : {}),
  };
  if (!Object.keys(linha).length) return { pendente: true };
  return servidor.pb.collection('artigos').update(idNoServidor, linha);
}

export async function apagarArtigo(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('artigos').delete(idNoServidor);
}

// ── Os envelopes, para o servidor ────────────────────────────────────────────
//
// ⚠ O envelope é a DEFINIÇÃO — nome, limite, cor. O que se move entre eles não
// se escreve aqui: vai por `transferenciaEntreEnvelopes`, que é aditiva. Pôr um
// «saldo» no envelope era o INVARIANTE #2 ao contrário.
export async function criarEnvelope({ casa, nome, limite, cor }) {
  return criarOuEnfileirarCasa('envelopes', {
    casa, nome, limite_base: Number(limite) || 0, cor: cor || '',
  });
}

export async function alterarEnvelope(idNoServidor, campos) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  const linha = {};
  if ('nome' in campos) linha.nome = campos.nome;
  if ('limite' in campos) linha.limite_base = Number(campos.limite) || 0;
  if ('cor' in campos) linha.cor = campos.cor || '';
  return servidor.pb.collection('envelopes').update(idNoServidor, linha);
}

export async function apagarEnvelope(idNoServidor) {
  if (!ligado() || !idNoServidor) return { pendente: true };
  return servidor.pb.collection('envelopes').delete(idNoServidor);
}

// ── As regras da casa, para o servidor ───────────────────────────────────────
//
// ⚠ Os nomes são os da COLEÇÃO: `valor_ponto`, `dia_pagamento`,
// `divide_meias`, `pontos_ligados`, `rendimento_mensal`. A loja fala
// `pointValue`, `payDay`, `splitHalf`, `pontosLigados`, `rendimento`. A
// tradução é aqui, num sítio só — e o PocketBase ignora em silêncio o que não
// conhece, portanto um nome errado aqui é uma regra que a casa julga ter
// mudado e não mudou.
const REGRA_NO_SERVIDOR = {
  rendimento: 'rendimento_mensal',
  // Por mês ou para o ano todo: `{ modo, ano, total, meses }` num campo JSON só.
  orcamento: 'orcamento',
  pointValue: 'valor_ponto',
  payDay: 'dia_pagamento',
  splitHalf: 'divide_meias',
  pontosLigados: 'pontos_ligados',
  ementaDesligada: 'ementa_desligada',
  iconesDesligados: 'icones_desligados',
};

export async function regrasDaCasa(casaId, campos) {
  if (!ligado() || !casaId) return { pendente: true };
  const linha = {};
  for (const [naLoja, noServidor] of Object.entries(REGRA_NO_SERVIDOR)) {
    if (naLoja in campos) linha[noServidor] = campos[naLoja];
  }
  if (!Object.keys(linha).length) return { pendente: true };
  // ⚠ Direto, sem fila. Uma regra da casa é um ESTADO, não um movimento: duas
  // alterações fora de ordem deixavam a antiga a ganhar, e a fila só sabe
  // criar. Sem rede fica no telefone e sobe na próxima — que é honesto.
  return servidor.pb.collection('casas').update(casaId, linha);
}

export async function renomearCasa(casaId, nome) {
  if (!ligado()) throw new Error('Sem ligação ao servidor.');
  return servidor.pb.collection('casas').update(casaId, { nome });
}

export async function acrescentarMembro({ casa, nome, papel, email, pin, palavraPasse, fem, cor }) {
  if (!ligado()) throw new Error('Sem ligação ao servidor.');
  // O `login` leva o id da casa: `nome` não serve de identificador porque duas
  // casas podem ter um Léo, e o campo é único em toda a coleção.
  const segredo = papel === 'crianca' ? pin : palavraPasse;
  // `verified` NÃO vai aqui. Só um superutilizador o pode escrever, e mandá-lo
  // fazia a criação inteira falhar com «Values don't match» — um erro que não
  // diz uma palavra sobre o campo que o causou. A prova contra o servidor
  // apanhou-o; nenhuma leitura de código o veria.
  //
  // Não faz falta: a `authRule` da coleção é vazia, portanto entrar não exige
  // verificação. Se um dia exigir, o que resolve é um convite por e-mail — e
  // isso é outro trabalho, não um campo a mais nesta chamada.
  return servidor.pb.collection('membros').create({
    casa, nome, papel, fem: !!fem, cor: cor || null,
    login: `${casa}_${String(nome).toLowerCase().replace(/\s+/g, '-')}`,
    ...(papel === 'crianca' ? {} : { email }),
    password: segredo, passwordConfirm: segredo,
  });
}

export async function editarMembro(id, campos) {
  if (!ligado()) throw new Error('Sem ligação ao servidor.');
  return servidor.pb.collection('membros').update(id, campos);
}

// Remover é o que mais pode correr mal, e o servidor é que sabe: recusa se a
// casa ficar sem administração (hook), e recusa se houver linhas obrigatórias
// a apontar para o membro — tarefas feitas, movimentos, despesas. Essa segunda
// recusa é uma feature: o histórico da casa não se apaga por alguém sair.
export async function removerMembro(id) {
  if (!ligado()) throw new Error('Sem ligação ao servidor.');
  return servidor.pb.collection('membros').delete(id);
}

// O que está à espera de rede. O ecrã pode mostrá-lo; o importante é que
// nada se perde por estar offline.
export const pendentes = () => servidor.escrever.pendentes();
export const esvaziar = () => servidor.escrever.esvaziar();

// ─── Onde é que a saúde pode ir ──────────────────────────────────────────────
//
// A REGRA vive em `src/endereco.js`, pura e sem importar nada — é a única
// forma de a provar sem arrastar o SDK do PocketBase, que é ESM e que o jest
// desta app não transforma. Aqui fica só a ligação dela ao servidor real.
// ⚠ Lê a DECISÃO, não o endereço. Era
// `ligado() && eEnderecoDeCasa(servidor.enderecoDoServidor())` até 30/09/2026,
// e o cabeçalho do `src/endereco.js` conta porquê: a pergunta deixou de ser
// «este servidor está em casa?» — uma medição — e passou a ser «esta casa
// guarda saúde no servidor?», que é uma escolha, e uma escolha escreve-se.
export const saudeSincroniza = () => ligado() && A_SAUDE_SOBE;


// ─── Guarda ──────────────────────────────────────────────────────────────────
//
// Uma rede de segurança, não uma decisão de desenho: qualquer escrita de saúde
// passa por aqui, e se o servidor não for de casa isto rebenta — em testes
// antes de rebentar na vida de alguém.
// ⚠ A lista saiu daqui para `src/colecoes-de-saude.js`, em 29/09/2026, e o
// cabeçalho de lá explica porquê: o travão era perguntado só AQUI, à entrada da
// fila, e o `despachar()` do `pocketbase.js` enviava o que lá estava sem
// consultar ninguém. O `pocketbase.js` não pode importar este ficheiro — é este
// que o importa a ele —, portanto a lista tem de viver num terceiro sítio, puro,
// que os dois leiam.
export function recusaSaude(colecao) {
  if (eColecaoDeSaude(colecao)) {
    if (!saudeSincroniza()) throw new Error(PORQUE_NAO_SOBE);
  }
  return colecao;
}

// ── ⚠ APAGAR não é travado, e é uma correcção, não um esquecimento ───────────
//
// O `recusaSaude` estava em TODAS as funções de saúde, incluindo as que apagam.
// Com o travão fechado, o `apagarEpisodioDeSaude` rebentava ANTES de falar com o
// servidor: a app dava a consulta por apagada, tirava-a do ecrã, e a linha ficava
// no servidor para sempre. O travão fechado tornava o servidor MAIS sujo, não
// menos.
//
// A pergunta que o travão faz é «esta informação pode ir para este servidor?».
// Apagar não leva informação nenhuma para lado nenhum — tira-a. É sempre seguro,
// e com o travão fechado é precisamente o que se quer poder fazer.
//
// Quem valida continua a ser o servidor: um adulto apaga a sua ficha ou a de uma
// criança da casa, e mais ninguém.
export function apagarPodeSempre(colecao) {
  return colecao;
}

// ─── A saúde, quando pode ────────────────────────────────────────────────────
//
// Passa pela FILA, como o dinheiro e ao contrário da gestão da casa: uma
// consulta marcada no corredor do hospital, sem rede, não se perde por isso.
//
// A visibilidade não se decide aqui. As regras de `episodios_saude` são as do
// servidor, com 16 provas em provar-saude.mjs — incluindo a que garante que uma
// criança não recebe a sua própria ficha.
// ⚠ Tenta DIRETO e só cai na fila se falhar, ao contrário do dinheiro. A razão
// é o anexo: um anexo é uma relação para o episódio, e sem o `id` que o
// servidor lhe deu não há relação nenhuma — o anexo ficaria órfão do outro
// lado, que é o que o TAREFAS.md proíbe pelo nome.
//
// A fila não devolve o registo criado (devolve quantas subiram), portanto uma
// consulta que vá só pela fila nunca aprende o seu `id`. Direto, aprende — e
// sem rede continua a não se perder, porque a fila fica como rede de segurança.
//
// Devolve `{ id }` quando o servidor respondeu, ou `{ pendente: true }` quando
// ficou na fila. Quem chama guarda o `id` se o houver.
export async function episodioDeSaude({ casa, membro, especialidade, medico, dia, hora, notas }) {
  recusaSaude('episodios_saude');
  const linha = {
    casa, membro, especialidade, medico: medico || '', dia, hora: hora || '', notas: notas || '',
  };
  try {
    const r = await servidor.pb.collection('episodios_saude').create(linha);
    return { id: r.id };
  } catch (e) {
    await servidor.escrever.criar('episodios_saude', linha);
    return { pendente: true };
  }
}

// ─── Um anexo, com o ficheiro ────────────────────────────────────────────────
//
// ⚠ NÃO passa pela fila, ao contrário do episódio, e a razão é técnica e não de
// desenho: a fila serializa em JSON e um ficheiro não é JSON. Ver
// `criarComFicheiro` em `src/pocketbase.js`.
//
// Portanto isto ou sobe ou rebenta. Quem chama — o `addHealthDoc` da loja —
// guarda a fotografia no dispositivo ANTES de tentar, e marca o documento como
// «por subir» se falhar. A fotografia nunca se perde por não haver rede, e a
// app não finge que já está no servidor.
//
// O `tipo` do servidor é minúsculo e sem acento (`exame`, `receita`,
// `relatorio`) — é um `select` com esses três valores. A loja fala «Exame»,
// «Receita», «Relatório». A tradução é aqui, e não nos dois sítios.
const TIPO_NO_SERVIDOR = { Exame: 'exame', Receita: 'receita', 'Relatório': 'relatorio' };
// O mesmo mapa, ao contrário, derivado dele — para não haver duas listas a
// divergir quando alguém acrescentar um tipo.
const TIPO_NA_LOJA = Object.fromEntries(
  Object.entries(TIPO_NO_SERVIDOR).map(([loja, servidor_]) => [servidor_, loja]));

export async function anexoDeSaude({ casa, episodio, tipo, titulo, uri, blob, nome, mime }) {
  recusaSaude('anexos');
  if (!episodio) throw new Error('Um anexo sem episódio não se grava — seria um exame órfão.');
  return servidor.escrever.criarComFicheiro('anexos', {
    casa, episodio, titulo,
    tipo: TIPO_NO_SERVIDOR[tipo] || 'exame',
  }, (uri || blob) ? { campo: 'ficheiro', uri, blob, nome, tipo: mime } : null);
}

// ─── O que pende de uma consulta: notas, receitas e decisões ─────────────────
//
// ⚠ Estas TRÊS passam pela fila, ao contrário do anexo, e podem: não levam
// ficheiro nenhum, e portanto serializam em JSON sem problema. Uma nota escrita
// no corredor do hospital, sem rede, não se perde por isso.
//
// Mas tentam DIRETO primeiro, como o episódio, e pela mesma razão: a nota
// precisa de aprender o seu `id` no servidor para depois se poder alterar. Uma
// nota que fosse só pela fila ficava lá, correta, e inalterável do outro lado.
//
// Devolvem `{ id }` quando o servidor respondeu, `{ pendente: true }` quando
// ficaram na fila. Quem chama guarda o `id` se o houver.
const criarOuEnfileirar = async (colecao, linha) => {
  recusaSaude(colecao);
  try {
    const r = await servidor.pb.collection(colecao).create(linha);
    return { id: r.id };
  } catch (e) {
    await servidor.escrever.criar(colecao, linha);
    return { pendente: true };
  }
};

export async function notaDeSaude({ casa, episodio, autor, texto }) {
  if (!episodio) throw new Error('Uma nota sem consulta não se grava — não seria de nada.');
  // ⚠ O `autor` vai e é obrigatório: o servidor exige `autor = @request.auth.id`
  // na criação, e sem ele a escrita é recusada. É de propósito — sem essa
  // condição bastava criar a nota já assinada por outra pessoa, e a regra que
  // diz «só o autor altera» não valia nada.
  if (!autor) throw new Error('Uma nota tem de ter autor — é ele quem a pode alterar.');
  return criarOuEnfileirar('notas_saude', { casa, episodio, autor, texto: texto || '' });
}

// Alterar e apagar são DIRETOS, sem fila.
//
// ⚠ E é uma decisão, não um esquecimento: a fila só sabe criar. Enfileirar uma
// alteração exigia guardar a ordem entre criar e alterar, e duas alterações da
// mesma nota fora de ordem deixavam o texto antigo a ganhar. Sem rede, a
// alteração fica só no dispositivo e sobe na próxima — que é o mesmo que
// acontece hoje, e é honesto.
export async function alterarNotaDeSaude(idNoServidor, texto) {
  recusaSaude('notas_saude');
  if (!idNoServidor) return { pendente: true };
  return servidor.pb.collection('notas_saude').update(idNoServidor, {
    texto, editada_em: new Date().toISOString(),
  });
}

export async function apagarNotaDeSaude(idNoServidor) {
  apagarPodeSempre('notas_saude');
  if (!idNoServidor) return { pendente: true };
  return servidor.pb.collection('notas_saude').delete(idNoServidor);
}

// ⚠ Apagar a consulta INTEIRA — e é a única coisa da saúde que a app não sabia
// fazer.
//
// O `healthGone` da loja era lido a cada leitura de fichas e nunca escrito por
// ninguém: a maquinaria de apagar estava montada e sem porta. Uma consulta
// marcada por engano — no membro errado, no dia errado, a dobrar — ficava para
// sempre. Arquivar esconde-a da lista; não a tira da casa nem do servidor.
//
// Quem valida é o servidor, e a regra já lá estava desde 03/09: um adulto
// apaga a SUA ou a de uma criança da casa, e mais ninguém. Nem o outro adulto,
// nem a própria criança. Isto não repete a regra — chama-a, e deixa o 404 ou o
// 403 chegar a quem pediu, em vez de o engolir.
//
// As notas, as receitas, as decisões e os anexos caem com ela: a relação tem
// `cascadeDelete` no servidor, e há uma prova em `provar-notas-saude.mjs` que
// mede exatamente isso — «restantes 0» nas três coleções filhas.
export async function apagarEpisodioDeSaude(idNoServidor) {
  apagarPodeSempre('episodios_saude');
  if (!idNoServidor) return { pendente: true };
  return servidor.pb.collection('episodios_saude').delete(idNoServidor);
}

// ── ⚠ E a saúde DESCE, que era a metade que faltava ──────────────────────────
//
// O `servidor.ler.saude()` estava escrito, comentado e documentado — e ninguém
// lhe chamava. Nem este ficheiro, nem a loja, nem um ecrã.
//
// Consequência: a saúde era a única área da app de sentido ÚNICO. A Rita
// marcava uma consulta à Mia, ela subia, e o telemóvel do Tomás nunca a via —
// não por uma regra, mas porque nunca perguntava. Todo o resto da casa desce.
//
// É a quarta vez que esta forma aparece neste projeto (o `tempoReal`, o
// `healthGone`, as oito escritas sem quem as chamasse), e a primeira em que o
// que faltava era uma LEITURA. Havia guardas para as outras duas formas e não
// para esta; passou a haver.
//
// ⚠ Pede-se ficha a ficha, e não em bloco, e é a decisão de sempre: o
// `ler.casa()` não toca na saúde para o dado não CHEGAR ao dispositivo de quem
// não lhe pode aceder (INVARIANTE #3). Quem decide o que existe é o servidor —
// pedir a ficha de outro adulto devolve vazio, não devolve escondido.
//
// E só a um servidor de CASA: se o `saudeSincroniza()` for falso, nunca lá
// escrevemos nada, e portanto não há nada para ler. É a mesma condição do
// `recusaSaude`, do lado da leitura.
export async function puxarSaude(idsDosMembros) {
  const vazio = { episodios: [], anexos: [], notas: [], receitas: [], decisoes: [], tomas: [], alergias: [] };
  if (!ligado() || !saudeSincroniza()) return vazio;

  const episodios = [];
  const anexos = [];
  const notas = [];
  const receitas = [];
  const decisoes = [];
  const tomas = [];
  const alergias = [];
  // Quem escreveu uma nota vem como id; a app mostra o NOME.
  const nomeDoMembro = Object.fromEntries(
    Object.entries(idsDosMembros || {}).map(([nome, id]) => [id, nome]));
  for (const [nome, id] of Object.entries(idsDosMembros || {})) {
    if (!id) continue;
    // Um `catch` por membro, e não um à volta de todos: uma ficha que o
    // servidor recuse não pode apagar as que ele deixou passar.
    const ficha = await servidor.ler.saude(id).catch(() => null);
    if (!ficha) continue;
    // As alergias são do membro, pelo NOME dele — é como a loja o trata.
    for (const a of ficha.alergias || []) {
      alergias.push({
        idServidor: a.id,
        member: nome,
        nome: a.nome || '',
        gravidade: a.gravidade || 'moderada',
        nota: a.nota || '',
      });
    }
    for (const e of ficha.episodios || []) {
      episodios.push({
        idServidor: e.id,
        member: nome,
        // A app lê chaves com `d`; a coleção guarda uma data.
        day: `d${String(e.dia || '').slice(0, 10)}`,
        specialty: e.especialidade || '',
        time: e.hora || '',
        // ⚠ `medico` e `notas` são os nomes da COLEÇÃO; `doctor` e `nota` os
        // da loja. Trocá-los aqui era o mesmo defeito da subida, ao contrário:
        // os dados chegavam e caíam sem erro nenhum.
        doctor: e.medico || '',
        nota: e.notas || '',
      });
    }
    for (const a of ficha.anexos || []) {
      anexos.push({
        idServidor: a.id,
        episodioNoServidor: a.episodio,
        member: nome,
        // ⚠ O ESPELHO exacto do `TIPO_NO_SERVIDOR`, e não uma tradução minha.
        //
        // A coleção guarda `exame|receita|relatorio` em minúsculas; a loja lê
        // `Exame|Receita|Relatório`. Escrevi primeiro `kind: a.tipo`, e todos
        // os anexos desciam como «exame» — sem erro nenhum, que é como estas
        // coisas passam.
        kind: TIPO_NA_LOJA[a.tipo] || 'Exame',
        title: a.titulo || '',
        // ⚠ E NÃO há `expires` a descer: a coleção `anexos` não tem campo de
        // prazo. Escrevi um `a.expira_em` de cabeça e fui confirmar contra o
        // `criar-colecoes.mjs` — é o mesmo defeito do `created`, que era um
        // campo que não existia e ninguém dava por isso. O prazo de uma
        // receita vive em `receitas_saude`, que é outra coleção.
        // O URL é assinado pelo servidor, e não construído aqui.
        foto: servidor.ler.ficheiro(a, 'ficheiro'),
      });
    }
    // ⚠ E o que pende de cada consulta. Subia desde 04/09 e nunca descia: a
    // conversa clínica que a ficha existe para guardar ficava num aparelho só.
    for (const n of ficha.notas || []) {
      notas.push({
        idServidor: n.id,
        episodioNoServidor: n.episodio,
        // O autor pode ser alguém que já saiu da casa: fica o id, que é melhor
        // do que uma nota sem assinatura.
        author: nomeDoMembro[n.autor] || n.autor || '',
        text: n.texto || '',
        // ⚠ Só o `editada_em`. Escrevi `n.editada_em || n.created` e o guarda
        // `sem-campos-que-nao-existem` apanhou-me na mesma linha em que eu
        // acabara de escrever um comentário sobre não inventar campos: o
        // `created` só existe se o esquema o declarar como `autodate`, e o
        // nosso não declara.
        //
        // A consequência fica dita: uma nota que desce do servidor sem nunca
        // ter sido editada NÃO TEM DATA. A coleção `notas_saude` não guarda
        // quando foi escrita — só quando foi mudada. É uma lacuna do esquema,
        // e resolvê-la é acrescentar-lhe um campo, não adivinhar aqui.
        date: n.editada_em || '',
      });
    }
    for (const r of ficha.receitas || []) {
      receitas.push({
        idServidor: r.id,
        episodioNoServidor: r.episodio,
        // ⚠ Os nomes da LOJA, que são outros: `nome`→`name`, `dose`→`dosage`,
        // `expira_em`→`expiresAt`. O ecrã lê os da loja e o servidor guarda os
        // dele; trocá-los aqui deixava a receita a descer vazia.
        name: r.nome || '',
        dosage: r.dose || '',
        quantity: r.quantidade || '',
        unit: r.unidade || '',
        // ⚠ E na forma da LOJA, que é «02/09/2026» e não a chave «d2026-09-02».
        //
        // Escrevia a CHAVE, e o ecrã imprime este campo cru: uma receita vinda
        // do servidor lia-se «Expirou em d2026-09-02». Visto no navegador, na
        // ficha da Mia. O formulário escreve `dmyDeChave(...)` — a forma humana
        // — e o servidor escrevia outra: duas formas para o mesmo campo, que é
        // a classe de defeito do `sem-stock`, do `plano.time` e do `section`.
        ...(r.expira_em ? { expiresAt: dmyDeChave(`d${String(r.expira_em).slice(0, 10)}`) } : {}),
        decision: r.decisao || '',
        // As notas da receita (15/09/2026): texto livre, vazio quando não há.
        notas: r.notas || '',
        // O plano de tomas (12/09/2026). Zero no servidor é «não definido», e
        // a loja lê-o como zero também — o `planoDaReceita` devolve nulo.
        frequency: Number(r.frequencia) || 0,
        durationDays: Number(r.duracao_dias) || 0,
        boxSize: Number(r.caixa) || 0,
      });
    }
    // E as tomas de cada receita: quando, e quem marcou — pelo NOME.
    for (const tm of ficha.tomas || []) {
      tomas.push({
        idServidor: tm.id,
        receitaNoServidor: tm.receita,
        quando: tm.quando || '',
        por: nomeDoMembro[tm.por] || tm.por || '',
      });
    }
    for (const dec of ficha.decisoes || []) {
      decisoes.push({
        idServidor: dec.id,
        episodioNoServidor: dec.episodio,
        type: dec.tipo || '',
        // O `select` do servidor é minúsculo; a loja mostra com maiúscula.
        status: dec.estado === 'resolvido' ? 'Resolvida' : 'Pendente',
        note: dec.nota || '',
      });
    }
  }
  return { episodios, anexos, notas, receitas, decisoes, tomas, alergias };
}

// ── As alergias da ficha de emergência ───────────────────────────────────────
//
// Do membro, e não de uma consulta. Pelo travão de casa, como tudo na saúde
// (o `criarOuEnfileirar` chama o `recusaSaude`). ⚠ Os nomes são os da
// COLEÇÃO: `gravidade`, `nota`.
export async function alergiaDeSaude({ casa, membro, nome, gravidade, nota }) {
  if (!membro) throw new Error('Uma alergia sem pessoa não se grava.');
  return criarOuEnfileirar('alergias_saude', {
    casa, membro,
    nome: String(nome || '').trim().slice(0, 60),
    gravidade: ['leve', 'moderada', 'grave'].includes(gravidade) ? gravidade : 'moderada',
    nota: String(nota || '').trim().slice(0, 300),
  });
}

export async function apagarAlergiaDeSaude(idNoServidor) {
  apagarPodeSempre('alergias_saude');
  if (!idNoServidor) return { pendente: true };
  return servidor.pb.collection('alergias_saude').delete(idNoServidor);
}

// ⚠ Os nomes são os da COLEÇÃO: `frequencia`, `duracao_dias`, `caixa`.
const planoNoServidor = ({ frequencia, duracaoDias, caixa } = {}) => ({
  frequencia: Math.max(0, Math.round(Number(frequencia) || 0)),
  duracao_dias: Math.max(0, Math.round(Number(duracaoDias) || 0)),
  caixa: Math.max(0, Math.round(Number(caixa) || 0)),
});

export async function receitaDeSaude({ casa, episodio, nome, dose, quantidade, unidade, expiraEm, decisao, notas, frequencia, duracaoDias, caixa }) {
  if (!episodio) throw new Error('Uma receita sem consulta não se grava.');
  return criarOuEnfileirar('receitas_saude', {
    casa, episodio, nome, dose: dose || '', quantidade: quantidade || '',
    unidade: unidade || '', expira_em: expiraEm || null, decisao: decisao || '',
    notas: String(notas || '').trim(),
    ...planoNoServidor({ frequencia, duracaoDias, caixa }),
  });
}

// Alterar uma receita que já existe: o plano de tomas (para as receitas
// escritas antes de 12/09/2026, que não o têm) e, desde 15/09/2026, o nome do
// medicamento.
//
// ⚠ O plano só vai quando VEM. Isto mandava sempre os três números do plano, e
// um pedido só com o nome punha-os a zero — a receita perdia o plano por se
// corrigir uma gralha no nome.
export async function alterarReceitaDeSaude(idNoServidor, campos = {}) {
  recusaSaude('receitas_saude');
  if (!idNoServidor) return { pendente: true };
  const linha = {};
  if ('nome' in campos) linha.nome = String(campos.nome || '').trim();
  if ('notas' in campos) linha.notas = String(campos.notas || '').trim();
  // A dose, a quantidade, a unidade e a validade (15/09/2026): o que a folha
  // de criar pede, a folha das tomas altera.
  if ('dose' in campos) linha.dose = String(campos.dose || '').trim();
  if ('quantidade' in campos) linha.quantidade = String(campos.quantidade || '').trim();
  if ('unidade' in campos) linha.unidade = String(campos.unidade || '').trim();
  if ('expiraEm' in campos) linha.expira_em = isoDeDMY(campos.expiraEm) || campos.expiraEm || null;
  if (['frequencia', 'duracaoDias', 'caixa'].some(k => k in campos)) Object.assign(linha, planoNoServidor(campos));
  return servidor.pb.collection('receitas_saude').update(idNoServidor, linha);
}

// ── As tomas ─────────────────────────────────────────────────────────────────
//
// Uma toma é uma LINHA: a receita, quando, quem marcou. Aditiva como o cofre;
// desmarcar apaga-a, e só quem a marcou o faz (regra do servidor). Duas no
// mesmo instante colidem no índice em vez de contarem duas vezes.
export async function tomaDeSaude({ casa, receita, quando, por }) {
  if (!receita) throw new Error('Uma toma sem receita não se grava.');
  if (!por) throw new Error('Uma toma sem quem a marcou não se grava.');
  return criarOuEnfileirar('tomas_saude', {
    casa, receita, quando: new Date(quando || Date.now()).toISOString(), por,
  });
}

export async function apagarTomaDeSaude(idNoServidor) {
  apagarPodeSempre('tomas_saude');
  if (!idNoServidor) return { pendente: true };
  return servidor.pb.collection('tomas_saude').delete(idNoServidor);
}

// A decisão de uma consulta é UMA. O servidor tem um índice único no
// `episodio`, portanto criar a segunda é recusado — e é isso que faz dois
// telefones concordarem em vez de criarem uma linha cada um.
//
// Daí o `atualizar` em vez de `criar`: procura-se a que existe e altera-se.
export async function decisaoDeSaude({ casa, episodio, tipo, estado, nota }) {
  recusaSaude('decisoes_saude');
  if (!episodio) throw new Error('Uma decisão sem consulta não se grava.');
  const linha = {
    casa, episodio, tipo: tipo || '', estado: estado || 'pendente',
    nota: nota || '', atualizada_em: new Date().toISOString(),
  };
  try {
    const ja = await servidor.pb.collection('decisoes_saude')
      .getFirstListItem(`episodio="${episodio}"`).catch(() => null);
    if (ja) return { id: (await servidor.pb.collection('decisoes_saude').update(ja.id, linha)).id };
    return { id: (await servidor.pb.collection('decisoes_saude').create(linha)).id };
  } catch (e) {
    await servidor.escrever.criar('decisoes_saude', linha);
    return { pendente: true };
  }
}

// O aspeto do próprio membro — a cor do avatar.
//
// Passa por aqui, e não pelo `pocketbase` directamente, porque a loja só
// conhece esta porta: importa o `./sync` em atraso e nunca o cliente. Manter a
// regra poupa à loja saber que servidor está do outro lado.
export const guardarAspeto = (campos) => servidor.auth.guardarAspeto(campos);
// O PIN de uma criança vai por uma ROTA, não por um update da coleção: o
// PocketBase exige `oldPassword` para mudar uma palavra-passe, e quem põe o PIN
// de uma criança não sabe o antigo. Ver `pb_hooks/pin.pb.js`.
export const definirPin = (membroId, pin) => servidor.auth.definirPin(membroId, pin);

// A criança entra no SERVIDOR, com o PIN como palavra-passe — e recebe a sessão
// dela, com o que as regras lhe devolvem (INVARIANTE #3). Era um resumo
// comparado no dispositivo, que é «um PIN que está no dispositivo»
// (docs/seguranca.html §3). Devolve o registo, ou rebenta com a recusa.
export const entrarCrianca = (login, pin) => servidor.auth.entrarCrianca(login, pin);

// A criança muda o seu PIN sabendo o atual — pela rota `/api/casa/pin/proprio`.
// Mudar a palavra-passe invalida o token, por isso volta-se a entrar a seguir
// com o PIN novo: quem chama fica com a sessão como estava, e o PIN trocado.
export async function mudarMeuPin(atual, novo) {
  const r = await servidor.auth.mudarMeuPin(atual, novo);
  await servidor.auth.entrarCrianca(r.login, novo);
  return r;
}
export const trazerFotografiaDaGoogle = () => servidor.auth.trazerFotografiaDaGoogle();

// ── A agenda da Google, pela mesma porta ─────────────────────────────────────
//
// A loja passou a empurrar TODOS os eventos para a Google — o interruptor
// «Marcar na agenda da Google» desapareceu porque passou a ser sempre. Para o
// fazer, a loja precisa do cliente da Google, e a regra acima diz que a loja só
// conhece esta porta.
//
// ⚠ E não é só criar. Um evento apagado na app que fica na Google é pior do que
// nunca lá ter ido: fica a apitar à hora de uma coisa que já não existe, e
// ninguém percebe de onde vem.
export const agendaGoogle = {
  disponivel: () => servidor.google.disponivel(),
  criar: (evento) => servidor.google.criarEvento(evento),
  alterar: (idGoogle, evento) => servidor.google.atualizarEvento(idGoogle, evento),
  apagar: (idGoogle) => servidor.google.apagarEvento(idGoogle),
};

// ── Tempo real, e só nas compras ─────────────────────────────────────────────
//
// É a única área onde dois telemóveis estão na mesma coisa ao mesmo tempo:
// dois adultos na loja, um nos frescos e o outro na mercearia. Em todo o resto,
// ler ao abrir chega — subscrever tudo gastava bateria para resolver um
// problema que não existe.
//
// ⚠ Esta subscrição existiu CONSTRUÍDA E POR LIGAR durante duas semanas: era a
// única exportação da app sem quem a importasse, e o varrimento de 06/09/2026
// apanhou-a. Estava escrita, comentada, e não fazia nada.
//
// Devolve a função que cancela. Sem servidor, devolve uma que não faz nada — e
// é por isso que quem chama não precisa de saber se há servidor.
export const seguirCompras = async (aoMudar) => {
  if (!ligado()) return () => {};
  try { return await servidor.tempoReal.compras(aoMudar); }
  catch { return () => {}; }
};
