// Ligação ao servidor — contra as coleções em db/pocketbase/.
//
// Três coisas que este ficheiro NÃO faz, de propósito:
//
//   1. Não filtra visibilidade. As regras de API das coleções é que decidem o
//      que a consulta devolve (INVARIANTE #3). Se um evento privado de outro
//      membro chegar aqui, o defeito está no servidor, não no filtro.
//   2. Não escreve saldos. O cofre é uma coleção de inserções — não existe
//      regra de update nem de delete, portanto o servidor recusa-os
//      (INVARIANTE #2). Aqui só se acrescentam movimentos.
//   3. Não traz a saúde na leitura em massa. As fichas pedem-se uma a uma,
//      quando se abre a de um membro — ler a saúde de toda a casa a cada
//      arranque seria movê-la sem razão. Ver `ler.saude()`.
//
// Tudo isto está provado a correr, não afirmado:
//   db/pocketbase/provar-regras.mjs   24 provas das regras e das vistas
//   db/pocketbase/provar-hooks.mjs    12 provas dos hooks
//   db/pocketbase/provar-saude.mjs    15 provas da visibilidade das fichas
//   db/pocketbase/provar-cliente.mjs  12 provas deste ficheiro
//
// ⚠ As fichas de saúde funcionam, mas isso não dispensa a conformidade: são
// dados clínicos de menores e há cinco pontos por resolver antes de os pôr num
// servidor a sério. Ver db/README.md.

import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase, { AsyncAuthStore } from 'pocketbase';
// A decisão de quando uma sessão acaba vive à parte, para poder ser posta à
// prova: este ficheiro importa o SDK do PocketBase, que é ESM, e uma prova em
// Jest que o carregue rebenta. Ver `src/sessao.js`.
// ⚠ Com extensão. Este ficheiro é carregado tal e qual pelo Node nas provas do
// servidor, e o Node não adivinha o `.js` — as outras provas têm um resolvedor
// que o acrescenta, a do cliente não. Escrevê-la aqui serve os três: Metro,
// Jest e Node.
import { terminaSessao } from './sessao.js';
// ⚠ Com extensão, pela mesma razão de cima. Os dois são PUROS — não importam o
// `react-native` nem o SDK —, e é isso que permite ao travão da saúde viver dos
// dois lados da fila: aqui, no envio, e no `sync.js`, na entrada.
import { A_SAUDE_SOBE, PORQUE_NAO_SOBE } from './endereco.js';
import { eColecaoDeSaude } from './colecoes-de-saude.js';

// O armazenamento é injetável para este módulo poder ser exercitado fora do
// React Native — é assim que db/pocketbase/provar-cliente.mjs o testa a sério,
// contra um servidor, em vez de eu afirmar que funciona.
let guarda = AsyncStorage;
let URL = process.env.EXPO_PUBLIC_PB_URL;

// O fornecedor da entrada. É a Google. Só se muda (EXPO_PUBLIC_OAUTH_PROVIDER)
// para desenvolver e mostrar a entrada SEM credenciais da Google, contra o
// fornecedor falso de `scripts/oidc-falso.mjs` ligado ao PocketBase como `oidc`.
const PROVEDOR = process.env.EXPO_PUBLIC_OAUTH_PROVIDER || 'google';

// O que a pessoa preencheu em «Criar a minha casa» e ainda falta aplicar: as
// crianças e os outros adultos só se podem acrescentar DEPOIS de a casa existir
// e de ela ser administradora, ou seja, depois do login. Vive em memória, uma
// só vez (`tomarRascunho`), e não leva segredo nenhum — os PIN geram-se depois.
let rascunhoDaCasa = null;
// O pedido de «criar casa» em curso: posto por `prepararNovaCasa` antes de ir à
// Google, lido pelo caminho que conclui a entrada. `null` é a entrada normal.
let novaCasaPedida = null;

export const configurar = (opts = {}) => {
  if (opts.storage) guarda = opts.storage;
  if (opts.url !== undefined) URL = opts.url;
  cliente = null;                       // força reconstruir com a configuração nova
};

// Sem configuração, a app corre local como sempre correu. Não rebenta.
export const estaLigado = () => Boolean(URL);

// O endereço configurado, para quem precise de decidir algo COM base nele — e
// há um caso: a saúde só sobe para um servidor que viva na casa. Ver
// `eEnderecoDeCasa` em `src/sync.js`. Devolve o valor, não o cliente: quem
// pergunta isto quer o endereço, não uma ligação.
export const enderecoDoServidor = () => URL || null;

let cliente = null;
// A promessa da sessão gravada. Guarda-se para se poder ESPERAR por ela.
let sessaoACarregar = null;

const obter = () => {
  if (!URL) return null;
  if (!cliente) {
    sessaoACarregar = Promise.resolve(guarda.getItem('nossa-casa/auth')).catch(() => null);
    cliente = new PocketBase(URL, new AsyncAuthStore({
      save: (s) => guarda.setItem('nossa-casa/auth', s),
      initial: sessaoACarregar,
      clear: () => guarda.removeItem('nossa-casa/auth'),
    }));
    // ── ⚠ Duas escritas à mesma linha no mesmo instante ─────────────────────
    //
    // O SDK do PocketBase cancela sozinho um pedido pendente quando lhe chega
    // outro com a MESMA chave — coleção, acção e identificador. É útil para
    // leituras (um ecrã que relê ao rolar) e é uma armadilha para escritas: a
    // primeira é abortada em silêncio, sem erro, sem nada nas consolas.
    //
    // Medido em 08/09/2026 com a casa a sério: passar as bananas dos «Frescos»
    // para a «Mercearia» escrevia o corredor e, no mesmo tique, escrevia os
    // postos do corredor de destino. O ecrã mostrava as bananas na Mercearia;
    // o servidor continuava a ter «Frescos». O outro telemóvel nunca soube.
    //
    // Os SCRIPTS que mexem na casa a sério — semear, migrar, acrescentar
    // campos — têm todos `pb.autoCancellation(false)` na terceira linha:
    // fazem escritas seguidas e sem ele perdiam-nas. A app faz as mesmas
    // escritas e nunca o teve.
    //
    // Uma escrita perdida é pior do que uma leitura repetida.
    cliente.autoCancellation(false);
  }
  return cliente;
};

// ⚠ Esperar que a sessão gravada esteja aplicada, antes de a dar por ausente.
//
// O `AsyncAuthStore` recebe o `initial` como PROMESSA — o AsyncStorage é
// assíncrono — e aplica-o quando ela resolve. Quem perguntasse
// `authStore.isValid` no instante em que a app monta recebia FALSO, com uma
// sessão válida gravada em disco a dois milissegundos de distância.
//
// O efeito que retoma a sessão fazia exactamente isso, e com dependências
// vazias: perguntava uma vez, no pior momento possível, e nunca voltava a
// tentar. O resultado é uma corrida — às vezes retoma, às vezes manda para o
// ecrã de entrada uma pessoa que já estava dentro. Ganhar ou perder a corrida
// dependia da velocidade do disco naquele arranque.
//
// Esperar pela promessa não basta: o `AsyncAuthStore` aplica-a numa fila
// interna, e não há como saber que ela já drenou. Daí a espera limitada — que
// devolve assim que a sessão aparece, e desiste depois de um segundo e meio
// para nunca prender o arranque.
export const sessaoPronta = async (msMax = 1500) => {
  if (!estaLigado()) return false;
  obter();
  try { await sessaoACarregar; } catch (e) { /* sem sessão gravada */ }
  const fim = Date.now() + msMax;
  while (Date.now() < fim) {
    if (pb.authStore && pb.authStore.isValid) return true;
    await new Promise(r => setTimeout(r, 25));
  }
  return Boolean(pb.authStore && pb.authStore.isValid);
};

// ── Renovar a sessão, e só a terminar quando o servidor o disser ─────────────
//
// ⚠ O token dos `membros` tem prazo, e NADA o renovava. Ao fim dele a pessoa
// era atirada para o ecrã de entrada e tinha de repetir a janela de
// consentimento da Google — usasse a app todos os dias ou não. Para uma app de
// casa, entrar é a parte que mais custa e a que menos se devia repetir.
//
// Isto pede um token novo a cada arranque: quem usa a app nunca chega ao prazo.
//
// ⚠ E a parte que interessa é o `catch`. Um erro AQUI tem duas naturezas
// completamente diferentes, e tratá-las como iguais é o defeito:
//
//   • 4xx  → o servidor VIU o token e recusou-o. Está morto. Terminar a sessão
//            é o correto: a pessoa tem mesmo de entrar outra vez.
//   • 0/5xx → não houve resposta. O servidor de casa está desligado, o telemóvel
//            está sem rede, ou o portátil ainda está a arrancar. O token
//            gravado continua bom, e apagá-lo obriga a uma volta à Google por
//            causa de uma coisa que passa sozinha.
//
// É a mesma distinção da fila de escritas (`esvaziar`), no sítio onde custa
// mais: ali perde-se uma escrita, aqui perde-se a sessão.
export const renovarSessao = async () => {
  if (!estaLigado()) return false;
  await sessaoPronta();
  if (!pb.authStore || !pb.authStore.isValid) return false;
  try {
    await pb.collection('membros').authRefresh();
    return true;
  } catch (e) {
    if (terminaSessao(e)) { auth.sair(); return false; }
    // Sem resposta: fica-se com o que está gravado, que ainda é válido.
    return true;
  }
};

// Mantido para quem já lia `ligado`; `estaLigado()` é que reflete uma
// reconfiguração em tempo de execução.
export const ligado = Boolean(URL);
export const pb = new Proxy({}, { get: (_, p) => { const c = obter(); return c ? c[p] : undefined; } });

const semLigacao = () => Promise.reject(new Error('Servidor não configurado.'));

// ── Abrir uma janela DURANTE o gesto que a pediu ─────────────────────────────
//
// 18/09/2026, ele: «não abre quando clico na Google». Não era o servidor nem a
// Google: o Chrome recusava a janela, e em silêncio.
//
// Um navegador só deixa `window.open` passar enquanto durar o gesto que o
// pediu. Basta um `await` pelo caminho — uma ida à rede, uma leitura do disco —
// para o gesto expirar, e a partir daí a janela é bloqueada. Não há erro: o
// `window.open` devolve `null` e quem não o lê fica à espera de uma janela que
// nunca abre.
//
// Aconteceu em DOIS sítios, com a mesma forma:
//
//   · a entrada pela Google — o `authWithOAuth2` do SDK vai buscar os métodos
//     de entrada ao servidor antes de abrir a janela;
//   · ligar a agenda — pede o endereço do consentimento numa chamada
//     autenticada e só depois abre.
//
// A cura é uma só: abrir a janela EM BRANCO no gesto, e apontá-la ao endereço
// quando ele chegar. Uma janela que já existe navega-se sem pedir licença.
//
// Devolve `null` fora do navegador (no telemóvel o fluxo é outro), e ATIRA se
// o navegador recusar — porque aí há mesmo uma coisa a dizer a quem carregou.
// O guarda que enumera é `__tests__/a-janela-abre-se-no-gesto.test.js`.
export const JANELA_BLOQUEADA = 'O navegador bloqueou a janela. Permita janelas para este endereço e tente outra vez.';

const abrirNoGesto = (nome) => {
  if (typeof window === 'undefined' || !window.open) return null;
  const janela = window.open('', nome, 'width=520,height=680');
  if (!janela) throw new Error(JANELA_BLOQUEADA);
  return janela;
};

// ── A entrada pela Google SEM JANELA NENHUMA ────────────────────────────────
//
// 18/09/2026, decisão dele depois de a janela ter sido bloqueada mesmo com o
// `abrirNoGesto`: o Chrome tinha guardado o bloqueio para o endereço, das
// dezenas de vezes em que o defeito antigo a pediu fora do gesto.
//
// «Permitir janelas» resolve numa máquina e volta a faltar na seguinte. A
// entrada na casa é a porta de tudo e não pode depender de uma definição do
// navegador — por isso deixa de haver janela: a PÁGINA INTEIRA vai à Google e
// volta. Nenhum bloqueador tem o que travar, e é também o que funciona no
// telemóvel, onde uma janela por cima da app nunca foi bom desenho.
//
// ── Como funciona, em quatro passos ─────────────────────────────────────────
//
//   1. pede-se ao servidor os métodos de entrada; a Google vem com um
//      `authURL`, um `state` e um `codeVerifier` (o PKCE);
//   2. guarda-se o verificador e o estado no `sessionStorage` — vivem o tempo
//      do separador e mais nada, que é exactamente a vida desta ida e volta;
//   3. navega-se a página para a Google;
//   4. a Google devolve `?code=…&state=…` a este mesmo endereço, e o arranque
//      da app troca o código pela sessão.
//
// ⚠ O `state` COMPARA-SE à volta. É o que impede que alguém nos mande um
// endereço com um `code` dele lá dentro e nos ponha na conta dele — a única
// coisa que este fluxo tem a mais para defender do que o da janela.
//
// ⚠ E o endereço de retorno tem de estar registado na consola da Google, nos
// «URIs de redireccionamento autorizados». Se não estiver, a Google responde
// `redirect_uri_mismatch` — e a app diz QUAL é o endereço a registar, em vez
// de mostrar o erro cru da Google.
const CHAVE_DO_RETORNO = 'nossa-casa/entrada-google';

// Trocar (ou acrescentar) um parâmetro de um endereço, à mão.
//
// ⚠ À mão porque o `new URL` NÃO EXISTE aqui. O React Native substitui o `URL`
// global por um esboço que atira «URL is not a constructor», e o
// `src/endereco.js` já o tinha escrito — «o React Native não tem um `URL`
// completo; no ambiente das provas desta app não tem nenhum». Usei-o na mesma,
// e o botão da Google passou a não fazer nada: a excepção saía antes de a
// página navegar, e um `catch` mais acima engolia-a numa frase amigável.
//
// É a segunda vez que este `URL` engana esta casa. O guarda é
// `__tests__/o-react-native-nao-tem-url.test.js`.
const comParametro = (endereco, nome, valor) => {
  const escapado = encodeURIComponent(valor);
  const re = new RegExp(`([?&])${nome}=[^&]*`);
  if (re.test(endereco)) return endereco.replace(re, (todo, antes) => `${antes}${nome}=${escapado}`);
  return `${endereco}${endereco.indexOf('?') >= 0 ? '&' : '?'}${nome}=${escapado}`;
};

// O endereço a que a Google devolve a pessoa: esta página, sem interrogação
// nem âncora. É este que se regista na consola, e por isso a app mostra-o
// quando a Google o recusa.
export const enderecoDeRetorno = () => {
  if (typeof window === 'undefined' || !window.location) return null;
  return `${window.location.origin}${window.location.pathname}`;
};

// O token de acesso da Google — em memória, e mais nada.
//
// ── Onde a autorização vive ─────────────────────────────────────────────────
//
// No SERVIDOR. Esta camada nunca vê o refresh token: pede um token de acesso
// de uma hora ao `/api/agenda/token`, guarda-o numa variável, e volta a pedir
// quando caducar. Se a app fechar, perde-se um token que já ia caducar de
// qualquer maneira — e a autorização continua lá, sem pedir nada a ninguém.
//
// Houve duas tentativas antes desta:
//
//   memória só         morria ao recarregar a página, e o interruptor «marcar
//                      também na agenda» DESAPARECIA do ecrã de agendar sem
//                      uma palavra. O evento ficava só na Nossa Casa.
//   sessionStorage     aguentava recarregar, morria com o separador. Numa app
//                      instalada, que abre e fecha o dia todo, pedia a entrada
//                      com o Google a cada sessão.
//
// A terceira não guarda nada porque não precisa: o que tem de durar está no
// servidor, atrás de uma coleção cujas cinco regras são nulas.
//
// Ver `db/pocketbase/pb_hooks/agenda-google.pb.js`.

// O que correu mal ao guardar a fotografia na última entrada, se correu.
// Lê-se com `auth.erroDaFotografia()`.
let erroDaFotografia = null;

let tokenGoogle = null;
let tokenExpiraEm = 0;

// Se a agenda está ligada nesta conta. `null` = ainda não se perguntou.
// A interface lê isto sem esperar, e o `verificarAgenda()` é que o preenche.
let agendaLigada = null;

const esquecerToken = () => { tokenGoogle = null; tokenExpiraEm = 0; };

// Um token válido, pedido ao servidor se for preciso.
//
// A margem de sessenta segundos evita o caso em que o token é válido no
// momento de o ler e já não é quando a Google o vê.
const tokenDaAgenda = async () => {
  if (tokenGoogle && Date.now() < tokenExpiraEm - 60000) return tokenGoogle;
  if (!estaLigado()) throw new Error('Servidor não configurado.');

  const r = await fetch(`${URL.replace(/\/+$/, '')}/api/agenda/token`, {
    method: 'POST',
    headers: { Authorization: pb.authStore.token },
  });
  if (!r.ok) {
    esquecerToken();
    agendaLigada = false;
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || 'A agenda não está ligada nesta conta.');
  }
  const d = await r.json();
  tokenGoogle = d.access_token;
  tokenExpiraEm = Date.now() + (d.expires_in || 3600) * 1000;
  agendaLigada = true;
  return tokenGoogle;
};

// ─── Sessão ──────────────────────────────────────────────────────────────────

// O que o servidor precisa para criar a casa: que se pediu, o nome dela, e o
// nome de quem a cria. A casa e o papel de administrador NÃO vão daqui — quem
// os decide é o gancho do servidor.
const dadosDaNovaCasa = (n) => ({ nova_casa: true, nome_casa: n.nomeCasa, nome: n.nome });

export const auth = {
  // Os adultos entram por e-mail.
  entrarAdulto: (email, password) => (estaLigado()
    ? pb.collection('membros').authWithPassword(email, password)
    : semLigacao()),

  // As crianças não têm conta nem e-mail (§8). Entram pelo `login`, um
  // identificador interno, com o PIN como palavra-passe — que o PocketBase
  // guarda em bcrypt e verifica no SERVIDOR. O valor correto nunca chega ao
  // dispositivo, que é o que §3.3 exige e nada no cliente substitui.
  entrarCrianca: (login, pin) => (estaLigado()
    ? pb.collection('membros').authWithPassword(login, pin)
    : semLigacao()),

  // Só um adulto autenticado altera o PIN — a regra de update da coleção exige
  // papel admin, e o hook valida a qualidade do PIN.
  definirPin: (membroId, pin) => (estaLigado()
    ? pb.collection('membros').update(membroId, { password: pin, passwordConfirm: pin })
    : semLigacao()),

  // Entrar com Google. O PocketBase abre a janela, troca o código e devolve a
  // sessão — nada disto passa por aqui, e a chave secreta nunca sai do servidor.
  //
  // Não cria conta: `membros` não tem regra de criação, portanto quem não
  // tiver sido acrescentado à casa por um administrador é recusado. Numa app
  // familiar é essa a porta certa.
  //
  // Os scopes do Calendar pedem-se AQUI e não depois: o token que a Google
  // devolve traz as permissões que foram pedidas no momento do consentimento.
  //
  // ⚠ `scopes` SUBSTITUI os que o PocketBase pede por omissão — não acrescenta.
  // Isto passava só `calendar.readonly`, e a entrada partia-se inteira: a troca
  // do token corria bem, e o passo seguinte — ir buscar o nome e o e-mail a
  // `oauth2/v3/userinfo` — respondia 401 «Invalid Credentials», porque o token
  // dava acesso à agenda e a identidade nenhuma.
  //
  // O erro que chega ao ecrã é «Failed to fetch OAuth2 user», que soa a
  // credencial errada e manda quem o vê para a consola da Google à procura de
  // um problema que não existe. Custou duas voltas: o segredo estava certo e o
  // redirecionamento também.
  //
  // ── O caminho SEM JANELA: começar ─────────────────────────────────────────
  //
  // Navega a página para a Google e não volta — quem chama não tem o que
  // esperar. Ver o bloco do `CHAVE_DO_RETORNO` para o porquê.
  //
  // Devolve `false` fora do navegador, para o telemóvel continuar no fluxo do
  // SDK, que lá não tem bloqueador nenhum a atrapalhar.
  async comecarEntradaGoogle() {
    if (!estaLigado()) return semLigacao();
    const retorno = enderecoDeRetorno();
    if (!retorno) return false;

    const m = await pb.collection('membros').listAuthMethods();
    const g = (m.oauth2?.providers || []).find(p => p.name === PROVEDOR);
    if (!g) throw new Error('A entrada pela Google não está configurada neste servidor.');

    // ⚠ O `redirect_uri` é O DESTA APP, e tem de estar registado na consola da
    // Google, em «URIs de redireccionamento autorizados».
    //
    // Tentei evitar esse passo: usar o endereço do PocketBase (que já lá está
    // registado) e pôr um gancho do servidor a reencaminhar a volta para a app.
    // Funcionava — e PARTIA AS REGRAS DE SEGURANÇA. Medido em 18/09/2026: com o
    // gancho, 46 das 51 provas do `provar-relacoes-ancoradas` passaram a falhar,
    // e a falha era «PASSOU — a linha foi criada»: uma casa a escrever dentro de
    // outra. Um `routerUse` a mais desarranja a cadeia do PocketBase e as regras
    // de escrita deixam de ser aplicadas. Nenhuma conveniência de entrada paga
    // isso.
    //
    // Fica o passo na consola. É uma vez por endereço, e é honesto.

    // ⚠ SEM `new URL`. O React Native substitui o `URL` global por um esboço
    // que rebenta — «TypeError: URL is not a constructor» —, e o
    // `src/endereco.js` já o dizia por escrito antes de eu aqui tropeçar. O
    // clique não fazia nada: a excepção saía antes de a página navegar.
    //
    // Os scopes SUBSTITUEM os do PocketBase, como no outro caminho: a
    // identidade tem de ir toda, senão o `oauth2/v3/userinfo` responde 401 e o
    // erro que chega ao ecrã manda-nos à consola da Google sem razão.
    let url = g.authURL + encodeURIComponent(retorno);
    url = comParametro(url, 'scope', [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '));

    // ⚠ `sessionStorage` e não `localStorage`: isto vive o tempo de uma ida e
    // volta, e um verificador PKCE esquecido num disco é uma credencial a
    // apanhar pó. O separador fecha, isto desaparece — como deve ser.
    try {
      // ⚠ Guarda-se o `state` VERDADEIRO (o gancho tira-lhe a marca antes de
      // no-lo devolver) e o `redirect_uri` que foi mesmo mandado à Google — a
      // troca do código tem de repetir o mesmo, senão a Google recusa-a.
      window.sessionStorage.setItem(CHAVE_DO_RETORNO, JSON.stringify({
        codeVerifier: g.codeVerifier, state: g.state, retorno,
        // «Criar a minha casa»: o que a pessoa escreveu antes de ir à Google.
        // Só nomes — nenhum segredo atravessa a ida e volta.
        novaCasa: novaCasaPedida,
      }));
    } catch (e) {
      throw new Error('O navegador não deixa guardar a entrada. Saia do modo privado e tente outra vez.');
    }

    window.location.assign(url.toString());
    return true;
  },

  // A Google devolveu-nos alguma coisa? Lê-se o endereço, e mais nada.
  // O rascunho de «Criar a minha casa», uma só vez: quem o pede leva-o e ele
  // deixa de existir. Existe depois de uma entrada que criou a casa.
  // «Criar a minha casa» põe aqui o que a pessoa preencheu ANTES de ir à Google
  // (ou `null`, para uma entrada normal). É lido pelos dois caminhos de entrada.
  prepararNovaCasa(rascunho) {
    novaCasaPedida = rascunho && rascunho.nomeCasa ? rascunho : null;
  },

  tomarRascunho() {
    const r = rascunhoDaCasa;
    rascunhoDaCasa = null;
    return r;
  },

  haRetornoDaGoogle() {
    if (typeof window === 'undefined' || !window.location) return false;
    const q = new URLSearchParams(window.location.search);
    return q.has('code') || q.has('error');
  },

  // ── O caminho SEM JANELA: concluir ────────────────────────────────────────
  //
  // Corre no arranque da app, antes de tudo o resto. Devolve
  // `{ ok, record }` ou `{ ok: false, erro }` — nunca atira, porque quem o
  // chama é o arranque e um arranque que rebenta é um ecrã branco.
  //
  // ⚠ E LIMPA O ENDEREÇO em qualquer dos casos. Um `?code=` que fica na barra
  // é trocado outra vez a cada recarregamento, e a segunda troca falha sempre
  // — um código de autorização gasta-se à primeira. A pessoa via «a entrada
  // falhou» ao recarregar uma app onde já tinha entrado.
  async concluirEntradaGoogle() {
    if (typeof window === 'undefined' || !window.location) return { ok: false };
    const q = new URLSearchParams(window.location.search);
    const limpar = () => {
      try {
        window.sessionStorage.removeItem(CHAVE_DO_RETORNO);
        window.history.replaceState({}, '', enderecoDeRetorno());
      } catch (e) { /* sem história nem armazenamento: o endereço fica feio e mais nada */ }
    };

    const erroDaGoogle = q.get('error');
    if (erroDaGoogle) {
      limpar();
      return { ok: false, erro: erroDaGoogle === 'access_denied'
        ? 'Entrada cancelada na Google.'
        : `A Google recusou a entrada (${erroDaGoogle}).` };
    }

    const code = q.get('code');
    if (!code) return { ok: false };

    let guardado = null;
    try { guardado = JSON.parse(window.sessionStorage.getItem(CHAVE_DO_RETORNO) || 'null'); } catch (e) { guardado = null; }
    if (!guardado || !guardado.codeVerifier) {
      limpar();
      return { ok: false, erro: 'A entrada começou noutro separador. Tente outra vez neste.' };
    }
    // ⚠ O `state` COMPARA-SE. Sem isto, um endereço com o código de outra
    // pessoa punha esta casa na conta dela.
    if (q.get('state') !== guardado.state) {
      limpar();
      return { ok: false, erro: 'A resposta da Google não corresponde ao pedido. Tente outra vez.' };
    }

    try {
      const novaCasa = guardado.novaCasa || null;
      const r = await pb.collection('membros').authWithOAuth2Code(
        PROVEDOR, code, guardado.codeVerifier, guardado.retorno,
        // O servidor é que cria a casa e o administrador (`casa-criar.pb.js`);
        // aqui só se diz que foi isso que a pessoa pediu, e como se chama.
        novaCasa ? dadosDaNovaCasa(novaCasa) : undefined,
      );
      limpar();
      if (novaCasa) rascunhoDaCasa = novaCasa;
      agendaLigada = null;
      erroDaFotografia = null;
      // A fotografia da conta, como no outro caminho: falhar aqui não estraga
      // a entrada, mas o erro também não se perde.
      const foto = r.meta && (r.meta.avatarURL || r.meta.avatarUrl);
      if (foto) {
        try { await auth.guardarAspeto({ avatar: foto }); }
        catch (e) {
          erroDaFotografia = e && e.message ? e.message : 'A fotografia não foi guardada.';
          if (typeof console !== 'undefined') console.warn('[avatar]', erroDaFotografia);
        }
      }
      return { ok: true, record: r.record };
    } catch (e) {
      limpar();
      return { ok: false, erro: (e && e.message) || 'Não foi possível concluir a entrada.' };
    }
  },

  // A identidade vai SEMPRE. A agenda é que é opcional.
  //
  // ⚠ Este é o caminho da JANELA, e no navegador deixou de ser o principal
  // (18/09/2026) — ficou para o telemóvel, onde não há bloqueador. Ver o
  // `comecarEntradaGoogle`.
  //
  // ⚠ Ver o `abrirNoGesto` — a janela do consentimento abre-se antes de
  // qualquer `await`, e é a diferença entre ela abrir e não abrir.
  async entrarComGoogle({ calendario = false } = {}) {
    if (!estaLigado()) return semLigacao();
    const IDENTIDADE = [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];
    // ⚠ A JANELA ABRE-SE AQUI, ANTES DE QUALQUER `await`.
    //
    // 18/09/2026, ele: «não abre quando clico na Google». Não era o servidor
    // nem a Google — era o bloqueador de janelas do Chrome, e em silêncio.
    //
    // Um navegador só deixa abrir uma janela DURANTE o gesto que a pediu. O
    // `authWithOAuth2` do SDK do PocketBase vai buscar os métodos de entrada ao
    // servidor primeiro — vê-se no registo de rede, um
    // `GET /api/collections/membros/auth-methods` a responder 200 — e só depois
    // chama o `window.open`. Nessa altura o gesto já expirou e o Chrome recusa,
    // sem erro nenhum: a promessa fica pendurada e o ecrã não diz nada.
    //
    // O SDK tem o `urlCallback` exactamente para isto: abre-se a janela no
    // gesto, em branco, e aponta-se-lhe o endereço quando ele estiver pronto.
    const janela = abrirNoGesto('nossa-casa-google');
    try {
      const r = await pb.collection('membros').authWithOAuth2({
      provider: PROVEDOR,
      ...(novaCasaPedida ? { createData: dadosDaNovaCasa(novaCasaPedida) } : {}),
      ...(janela ? { urlCallback: (url) => { janela.location.href = url; } } : {}),
      scopes: calendario
        // `calendar.events` e não `calendar.readonly`: a app passou a criar
        // eventos, não só a lê-los. É um scope MAIS LARGO, e quem já tinha
        // autorizado tem de voltar a autorizar — a Google não alarga uma
        // autorização em silêncio, e ainda bem.
        //
        // `calendar.events` dá acesso aos eventos e não ao resto da conta:
        // não vê contactos, não vê correio, não vê outros calendários.
        ? [...IDENTIDADE, 'https://www.googleapis.com/auth/calendar.events']
        : IDENTIDADE,
    });
    // O token da Google só vem nesta resposta. Guarda-se em memória, não em
    // disco: é credencial de terceiro e não tem de sobreviver ao fecho da app.
    // ⚠ O token que vem aqui NÃO se guarda.
    //
    // Dura uma hora e não é renovável: o PocketBase não pede
    // `access_type=offline` à Google (verificado no binário do 0.40.1), e
    // portanto não há refresh token nenhum atrás dele. Guardá-lo dava uma
    // agenda que funciona durante uma hora e depois falha sem explicação.
    //
    // A autorização da agenda vem do fluxo próprio — `google.ligar()`.
    agendaLigada = null;
    erroDaFotografia = null;

    // A fotografia da conta, guardada no membro.
    //
    // A Google devolve-a em `meta.avatarURL`, e ela muda quando a pessoa a
    // muda na conta — por isso escreve-se a cada entrada, e não só na primeira.
    // Falhar aqui não pode estragar a entrada: quem entra quer entrar, e um
    // avatar é um pormenor. Daí o `catch` vazio, que neste caso é a decisão
    // certa e não um descuido.
    const foto = r.meta && (r.meta.avatarURL || r.meta.avatarUrl);
    if (foto) {
      try { await auth.guardarAspeto({ avatar: foto }); }
      catch (e) {
        // A entrada não se perde por causa de uma fotografia — mas o erro
        // TAMBÉM não se perde.
        //
        // ⚠ Este catch era vazio, e escondeu um defeito a sério: durante duas
        // entradas seguidas o servidor respondeu 404 a esta escrita (a rota
        // ainda não estava carregada) e a app não disse nada. A folha do
        // avatar mostrava «ainda não há fotografia», que é verdade e não é a
        // verdade útil: a fotografia veio e não se conseguiu guardar.
        erroDaFotografia = e && e.message ? e.message : 'A fotografia não foi guardada.';
        if (typeof console !== 'undefined') console.warn('[avatar]', erroDaFotografia);
      }
    }
      if (novaCasaPedida) rascunhoDaCasa = novaCasaPedida;
      return r;
    } catch (e) {
      // A janela em branco não pode ficar pendurada por cima da app quando a
      // entrada falha ou é cancelada.
      if (janela) { try { janela.close(); } catch (x) { /* já fechada */ } }
      throw e;
    }
  },

  // Que provedores é que o servidor tem mesmo configurados. Serve para o ecrã
  // de entrada poder DIZER se a Google está configurada em vez de o deduzir da
  // frase do erro — que foi o que o pôs a afirmar «ainda não está configurada»
  // com tudo configurado, porque «Failed to fetch OAuth2 user» também tem a
  // palavra «OAuth» lá dentro.
  // ⚠ Devolve TRÊS estados, e não uma lista.
  //
  // A versão anterior devolvia `[]` tanto quando o servidor respondia «não
  // tenho a Google» como quando não respondia nada. O ecrã de entrada leu
  // aquele `[]` e afirmou «a entrada pela Google ainda não está configurada
  // neste servidor» — com a Google configurada e o servidor simplesmente
  // desligado.
  //
  // É exactamente o defeito que este método existia para corrigir, uma camada
  // mais abaixo: afirmar uma causa que não se apurou. «Não sei» tem de ser
  // uma resposta possível, senão alguém vai à consola da Google procurar um
  // problema que está no processo do servidor.
  provedores: async () => {
    if (!estaLigado()) return { alcancavel: false, semServidor: true, lista: [] };
    try {
      const m = await pb.collection('membros').listAuthMethods();
      return {
        alcancavel: true,
        semServidor: false,
        // O fornecedor de desenvolvimento (`oidc`) faz de Google para o ecrã de
        // entrada, que só conhece «google».
        lista: (m.oauth2?.providers || []).map(p => (p.name === PROVEDOR ? 'google' : p.name)),
      };
    } catch {
      return { alcancavel: false, semServidor: false, lista: [] };
    }
  },

  // Confirmar a credencial de OUTRA pessoa, sem lhe entrar na sessão.
  //
  // É a peça de que uma acção «precisa de todos os administradores» depende: um
  // adulto passa o telemóvel ao outro, o outro escreve a sua palavra-passe, e a
  // app tem de saber se está certa SEM ficar com a sessão dele.
  //
  // ⚠ Não se pode usar o cliente da app: `authWithPassword` grava a sessão no
  // `authStore`, e quem confirmasse ficava a usar a app em nome do outro. Aqui
  // constrói-se um cliente DESCARTÁVEL, sem armazenamento nenhum — ele nasce,
  // pergunta ao servidor, e desaparece com a resposta.
  //
  // A verificação é do SERVIDOR: as palavras-passe estão em bcrypt e o valor
  // correto nunca chega ao dispositivo. Comparar no cliente seria pedir a quem
  // quisesse passar por cima que abrisse a consola.
  //
  // Devolve o membro quando a credencial está certa, e `null` quando não está.
  // Não distingue «não existe» de «palavra-passe errada»: isso diria a quem
  // tentasse quais os endereços que existem nesta casa.
  async confirmarCredencial(identidade, palavraPasse) {
    if (!estaLigado()) return null;
    try {
      const descartavel = new PocketBase(URL);   // sem AsyncAuthStore, de propósito
      const r = await descartavel.collection('membros').authWithPassword(identidade, palavraPasse);
      const membro = r && r.record ? { id: r.record.id, nome: r.record.nome, papel: r.record.papel } : null;
      descartavel.authStore.clear();
      return membro;
    } catch (e) {
      return null;
    }
  },

  // Apagar os dados da casa no SERVIDOR.
  //
  // O «Começar de Zero» só limpava o `AsyncStorage`: a casa no servidor ficava
  // intacta e voltava na entrada seguinte. O botão prometia mais do que fazia.
  //
  // Ficam a casa, os membros e os papéis — recomeçar a vida da família não é
  // dissolver a família. Quem verifica isso é o servidor, e há nove provas em
  // `db/pocketbase/provar-limpar-casa.mjs`: um adulto não pode, uma criança não
  // pode, e o administrador de outra casa não toca nesta.
  //
  // Devolve o que apagou, coleção a coleção. Uma operação destas não responde
  // «pronto»: quem a pediu tem de poder ver que o que saiu foi o que esperava.
  async limparCasaNoServidor() {
    if (!estaLigado()) throw new Error('Servidor não configurado.');
    const r = await fetch(`${URL.replace(/\/+$/, '')}/api/casa/limpar`, {
      method: 'POST',
      headers: { Authorization: pb.authStore.token },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'O servidor recusou a limpeza.');
    return d;
  },

  // Ir buscar a fotografia da conta Google, SEM terminar a sessão.
  //
  // ── Porque é preciso um pedido só para isto ─────────────────────────────────
  //
  // A fotografia chega no `meta.avatarURL` que a Google devolve NO INSTANTE da
  // entrada, e mais em momento nenhum. Quem já estava dentro quando este campo
  // passou a existir nunca a escreveu — e não há como a ir buscar depois: o
  // token que a app guarda é o da AGENDA, pede `calendar.events` e mais nada.
  // Alargar o âmbito de uma autorização de agenda para apanhar uma fotografia
  // seria pedir mais acesso do que o preciso, e ficaria pedido para sempre.
  //
  // A alternativa era o que a folha dizia: «termine a sessão e volte a entrar».
  // Funciona e é má — obriga a sair de casa para ir buscar uma coisa que está
  // à porta.
  //
  // ⚠ Corre num cliente DESCARTÁVEL, como o `confirmarCredencial`. Sem isso, a
  // entrada substituía a sessão em curso: quem escolhesse outra conta na janela
  // da Google — a do trabalho, a de outra pessoa do mesmo telemóvel — ficava com
  // a app aberta em nome dela sem ter pedido nada disso.
  //
  // E por isso mesmo confirma-se que o membro devolvido é ESTE. Se for outro,
  // não se escreve nada e diz-se porquê: a sessão a sério nunca chegou a ser
  // tocada.
  async trazerFotografiaDaGoogle() {
    if (!estaLigado()) throw new Error('Servidor não configurado.');
    const eu = pb.authStore.record;
    if (!eu) throw new Error('Entre primeiro.');

    const descartavel = new PocketBase(URL);   // sem AsyncAuthStore, de propósito
    let r;
    try {
      r = await descartavel.collection('membros').authWithOAuth2({
        provider: 'google',
        // Só a identidade. Nada de agenda: isto é uma fotografia.
        scopes: ['openid',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'],
      });
    } catch (e) {
      descartavel.authStore.clear();
      throw new Error('A Google não devolveu a fotografia.');
    }

    const outro = !r || !r.record || r.record.id !== eu.id;
    const foto = r && r.meta && (r.meta.avatarURL || r.meta.avatarUrl);
    descartavel.authStore.clear();

    if (outro) throw new Error('Essa é outra conta Google. A sessão não mudou.');
    if (!foto) throw new Error('Esta conta Google não tem fotografia.');

    await auth.guardarAspeto({ avatar: foto });
    return foto;
  },

  // O aspeto do próprio membro — a fotografia e a cor do avatar.
  //
  // Vai por uma rota e não por um `update` da coleção: a regra de update de
  // `membros` exige papel admin, porque quem escreve um membro escreve o PAPEL
  // dele. A rota escreve dois campos, no membro autenticado, e mais nada. Ver
  // `db/pocketbase/pb_hooks/avatar.pb.js`.
  //
  // Os campos são opcionais e independentes: quem manda só a cor não perde a
  // fotografia. Uma cadeia vazia LIMPA — é diferente de não mandar.
  //
  // ⚠ A `figura` faltava aqui. O `definirAvatar` do store mandava-a, a rota
  // aceitava-a e escrevia-a, e esta função deitava-a fora antes de a enviar: a
  // figura escolhida ficava só neste aparelho e o outro telemóvel via a
  // inicial. Uma escrita que não se lê de volta — a classe do `db:campos`,
  // do lado do cliente. Apanhada em 10/09/2026 ao dar o avatar à criança.
  async guardarAspeto({ avatar, cor, figura } = {}) {
    if (!estaLigado()) throw new Error('Servidor não configurado.');
    const corpo = {};
    if (avatar !== undefined) corpo.avatar = String(avatar || '');
    if (cor !== undefined) corpo.cor = String(cor || '');
    if (figura !== undefined) corpo.figura = String(figura || '');
    if (!Object.keys(corpo).length) return null;

    const r = await fetch(`${URL.replace(/\/+$/, '')}/api/membro/aspeto`, {
      method: 'POST',
      headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Não foi possível guardar o avatar.');
    return d;
  },

  // O PIN de uma criança, definido por quem administra a casa.
  //
  // Também por uma rota, e pela mesma família de razões do aspeto — mas a razão
  // exacta é outra: o PocketBase exige `oldPassword` para mudar uma
  // palavra-passe pela coleção, mesmo a quem administra. Quem põe o PIN de uma
  // criança de sete anos é o pai, e ele não sabe o PIN antigo — o objetivo é
  // muitas vezes não saber.
  //
  // A rota verifica a qualidade do PIN OUTRA VEZ, do lado do servidor, e recusa
  // um membro de outra casa ou que não seja criança. Ver
  // `db/pocketbase/pb_hooks/pin.pb.js`.
  async definirPin(membroId, pin) {
    if (!estaLigado()) throw new Error('Servidor não configurado.');
    const r = await fetch(`${URL.replace(/\/+$/, '')}/api/casa/pin`, {
      method: 'POST',
      headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ membro: membroId, pin: String(pin || '') }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Não foi possível definir o PIN.');
    return d;
  },

  // A criança muda o PRÓPRIO PIN, sabendo o atual. Rota, pela mesma razão da
  // de cima ao contrário: a `updateRule` de `membros` é só de quem administra,
  // e abri-la ao próprio para a palavra-passe abria-lhe também o papel. Ver
  // `db/pocketbase/pb_hooks/pin.pb.js`. A resposta traz o `login`, porque a
  // palavra-passe nova invalida o token e é preciso voltar a entrar.
  async mudarMeuPin(atual, novo) {
    if (!estaLigado()) throw new Error('Servidor não configurado.');
    const r = await fetch(`${URL.replace(/\/+$/, '')}/api/casa/pin/proprio`, {
      method: 'POST',
      headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ atual: String(atual || ''), novo: String(novo || '') }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Não foi possível mudar o PIN.');
    return d;
  },

  erroDaFotografia: () => erroDaFotografia,

  sair: () => { if (estaLigado()) { pb.authStore.clear(); esquecerToken(); agendaLigada = null; } },
  membro: () => (estaLigado() ? pb.authStore.record : null),
  valida: () => Boolean(estaLigado() && pb.authStore.isValid),
};

// ─── Leitura ─────────────────────────────────────────────────────────────────

// Nenhuma leitura leva filtro por casa: as regras já o impõem, e repeti-lo aqui
// daria a impressão errada de que é o cliente que protege.
const COLECOES = ['casas', 'membros', 'eventos', 'tarefas', 'tarefas_feitas',
  'envelopes', 'despesas', 'cofre_movimentos', 'equipamentos',
  // ⚠ As transferências são ADITIVAS, e é delas que o ajuste de cada envelope
  // se calcula. Sem as ler, o `envMove` da loja ficava a ser um saldo escrito —
  // que é o INVARIANTE #2 ao contrário.
  'transferencias',
  // ⚠ Os ACERTOS, pela mesma razão — e faltavam aqui, o que fazia deles uma
  // escrita de sentido único. O `sync.acerto` mandava a linha, ninguém a lia de
  // volta, e o telemóvel do outro adulto continuava a dizer que os 86,50 €
  // estavam por acertar. Pagava-se duas vezes, como a semanada.
  'acertos',
  // As três listas da casa. Têm a mesma forma — casa e nome — e por isso levam
  // uma tradução só, no `sync`.
  'especialidades', 'categorias_equip', 'lojas',
  // As compras: a lista aberta e os artigos dela. O `estado` vive na LINHA do
  // artigo — é isso que faz dois telefones na mesma loja fundirem-se.
  //
  // ⚠ E os corredores. Eram quatro nomes fixos no `data.js`, e a casa não lhes
  // podia tocar; passaram a ser uma lista com ORDEM, que é o que uma secção é —
  // a ordem por que se anda na loja. Sem estarem aqui, quem reordenasse num
  // telemóvel ficava a ser o único a ver a ordem nova: a classe «sobe e nunca
  // desce», que o registo desta casa diz ser pior do que não sincronizar.
  'seccoes',
  'listas_compras', 'artigos',
  // ⚠ As preferências são de CADA UM: a regra é `membro = @request.auth.id`, e
  // esta leitura devolve UMA linha — a de quem pergunta — ou nenhuma. É a única
  // coleção da lista que não é da casa inteira.
  'preferencias',
  // O mês aberto e os fechados. O mês ABERTO é o que não tem `fechado_em`, e é
  // ele que define o intervalo por onde as despesas e as transferências se
  // filtram — os totais são SOMAS de um mês, nunca campos que alguém zera.
  'meses',
  // O registo de alterações da casa. «Quem mudou isto?» é uma pergunta que a
  // OUTRA pessoa faz, e um registo só local nunca lhe podia responder.
  'registo',
  // ── As metas da família ────────────────────────────────────────────────────
  //
  // A DEFINIÇÃO e os MOVIMENTOS, e é preciso ler as duas: o que está juntado
  // numa meta é a soma dos movimentos, nunca um campo (INVARIANTE #2). Havia um
  // `metas.atual` no servidor exactamente com essa forma errada; saiu.
  //
  // ⚠ A coleção `metas` existia desde o primeiro dia e o cliente NUNCA lhe
  // escreveu nem leu: a lista da app era a constante `GOALS` do `data.js`, igual
  // nos dois telemóveis por ser a mesma constante, e a meta que a Rita criasse
  // não existia em sítio nenhum. Era a lacuna maior que restava.
  'metas', 'meta_movimentos',
  // O objetivo do cofre de cada criança: uma linha por criança, com o nome e o
  // alvo. O juntado é o saldo do cofre, e vem dos `cofre_movimentos`.
  'objetivos_cofre',
  // As contas fixas: a definição de cada uma. «Paga este mês» lê-se das
  // `despesas`, que já vêm acima — não há segunda leitura.
  'contas_fixas',
  // Os contratos e as renovações, ao lado dos equipamentos: nome, fornecedor,
  // quando renova, fidelização, quem trata, e o documento na própria linha.
  'contratos',
  // As trocas de tarefas entre irmãos: valem só para o dia, e só as de hoje se
  // pedem (ver `OPCOES_POR_COLECAO`).
  'trocas_tarefas',
  // A ementa da semana: os pratos da casa (com os ingredientes dentro) e o
  // jantar de cada dia.
  'pratos', 'ementa'];

// ── As coleções que CRESCEM sem fim, e o que delas se lê ─────────────────────
//
// ⚠ O `ler.casa()` puxava TODAS as linhas de TODAS as coleções, a cada abertura
// da app, e o `puxarCasa` deitava fora quase tudo a seguir. Numa casa acabada de
// semear são 104 linhas e ninguém nota. As que crescem todos os dias não ficam
// nessa escala:
//
//   registo           ~10 por dia    →  3 650 ao fim de um ano
//   tarefas_feitas    ~4 por dia     →  1 460 ao fim de um ano
//   despesas          ~22 por mês    →    264 ao fim de um ano
//
// Ao fim de dois anos são mais de dez mil linhas descarregadas de cada vez que
// alguém abre a app — pela Wi-Fi de casa, num telemóvel, para mostrar as cinco
// mais recentes.
//
// ⚠ O `registo` é o caso mais claro, e é o que se corrige aqui: o `puxarCasa`
// já fazia `.slice(0, 100)` DEPOIS de descarregar tudo. Pedir as 100 mais
// recentes ao servidor dá exactamente o mesmo resultado, e é a única coleção
// onde isso é exactamente equivalente.
//
// As outras não se filtram aqui de propósito, e vale a pena dizer porquê:
//
//   • `cofre_movimentos` — o saldo do cofre é a soma de SEMPRE, não a do mês.
//     Cortar por data dava um saldo errado, em silêncio.
//   • `despesas`, `transferencias`, `acertos` — filtram-se pelo mês ABERTO, e
//     esse só se sabe depois de ler os `meses`. Fazê-lo obrigaria a duas idas
//     ao servidor em vez de uma; é a otimização seguinte, e tem de ser medida
//     antes de ser feita.
//   • `tarefas_feitas` — o `done` é de hoje, mas o `feitas` é o índice que
//     permite DESMARCAR, e desmarcar o que já lá está é o que impede uma linha
//     órfã. Cortá-lo sem perceber até onde se desmarca partia isso.
//
// ⚠ E a ordenação é por `-quando` e mais nada. Escrevi `-quando,-created` à
// primeira, e o servidor devolveu 400: **as coleções deste projeto não têm
// campo `created`**. O PocketBase v0.23+ só o cria quando o esquema o declara
// como `autodate`, e o `criar-colecoes.mjs` nunca o declarou.
//
// O erro ia calado — o `.catch(() => [])` desta função devolvia lista vazia — e
// o registo aparecia sempre em branco. Foram as provas do servidor a apanhá-lo.
const OPCOES_POR_COLECAO = {
  registo: { sort: '-quando', perPage: 100 },
  // ⚠ Uma troca de tarefas vale SÓ para o dia (12/09/2026): à meia-noite
  // acabou, e a de ontem não serve para nada a ninguém. Pede-se de ontem em
  // diante — um dia a mais, e não «só hoje», porque o dia do servidor é UTC e
  // o da app é o de Lisboa; entre a meia-noite e a uma hora não coincidem. A
  // loja fica com as de HOJE e mais nenhuma; isto só evita descarregar um ano.
  trocas_tarefas: { filtro: () => {
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return `dia >= "${ontem} 00:00:00"`;
  } },
};

export const ler = {
  async casa() {
    if (!estaLigado()) return semLigacao();
    const res = await Promise.all(COLECOES.map((c) => {
      const opts = OPCOES_POR_COLECAO[c];
      // Um filtro por data: a lista inteira, mas só do que ainda interessa.
      if (opts && opts.filtro) {
        return pb.collection(c).getFullList({ batch: 500, filter: opts.filtro() }).catch(() => []);
      }
      // Com `perPage` é uma página só — é isso que evita descarregar tudo.
      if (opts) {
        return pb.collection(c).getList(1, opts.perPage, { sort: opts.sort })
          .then(r => r.items).catch(() => []);
      }
      return pb.collection(c).getFullList({ batch: 500 }).catch(() => []);
    }));
    return Object.fromEntries(COLECOES.map((c, i) => [c, res[i]]));
  },

  colecao: (nome, opts) => (estaLigado() ? pb.collection(nome).getFullList(opts) : semLigacao()),

  // A ficha de um membro, com os anexos de cada episódio.
  //
  // Não leva filtro de visibilidade. Quem decide se estas linhas existem para
  // quem pergunta são as regras das coleções — a §5 chama-lhes «a regra mais
  // restritiva do sistema». Pedir a ficha de outro adulto devolve vazio, e é
  // assim que tem de ser: não escondido, ausente.
  async saude(membroId) {
    if (!estaLigado()) return semLigacao();

    // ── ⚠ E o travão também DESCE ────────────────────────────────────────────
    //
    // A condição vivia só em quem chama — o `puxarSaude` do `sync.js`. Quem
    // chamasse esta função directamente trazia a ficha inteira de um servidor
    // que não é de casa: episódios, anexos com as fotografias dos exames,
    // notas, receitas, decisões, tomas e alergias.
    //
    // Uma regra que vive em quem chama não é uma regra — é um hábito. Fica aqui
    // também, e é barato: são dados clínicos de menores, e a dúvida resolve-se
    // sempre para o lado de NÃO trazer.
    //
    // ⚠ O mesmo vazio do resto da função, e não uma excepção: «não escondido,
    // ausente» é o que a §5 pede, e uma excepção aqui mudaria a forma da
    // resposta só neste caso.
    if (!A_SAUDE_SOBE) {
      return { episodios: [], anexos: [], notas: [], receitas: [], decisoes: [], tomas: [], alergias: [] };
    }

    const filtro = pb.filter('membro = {:m}', { m: membroId });
    // As alergias são do MEMBRO, não de uma consulta: leem-se ao lado dos
    // episódios, e uma ficha sem consultas pode ter alergias (12/09/2026).
    const [episodios, alergias] = await Promise.all([
      pb.collection('episodios_saude').getFullList({ filter: filtro, sort: '-dia' }),
      pb.collection('alergias_saude').getFullList({ filter: filtro }).catch(() => []),
    ]);
    const vazio = { episodios: [], anexos: [], notas: [], receitas: [], decisoes: [], tomas: [], alergias };
    if (!episodios.length) return vazio;
    const ids = episodios.map(e => `episodio = "${e.id}"`).join(' || ');
    // As tomas apontam à RECEITA, e a receita ao episódio: o filtro atravessa
    // a relação. É a mesma condição da regra `PELA_RECEITA`, do lado do pedido.
    const pelaReceita = episodios.map(e => `receita.episodio = "${e.id}"`).join(' || ');
    // ⚠ E o que PENDE de cada consulta, que é metade do que uma ficha é.
    //
    // Isto trazia os episódios e os anexos e mais nada. As notas, as receitas
    // e as decisões subiam desde 04/09 e nunca desciam: quem marcasse uma
    // consulta via-a no outro telemóvel sem uma única nota, e a conversa
    // clínica que a ficha existe para guardar ficava num aparelho só.
    //
    // Descoberto com a casa cheia: 8 notas e 4 receitas no servidor, zero na
    // app. As quatro coleções herdam a regra do episódio (`PELO_EPISODIO`),
    // portanto quem não pode ver a ficha não vê nada disto — e o `catch`
    // devolve vazio em vez de deixar a ficha inteira cair.
    const [anexos, notas, receitas, decisoes, tomas] = await Promise.all([
      pb.collection('anexos').getFullList({ filter: ids }).catch(() => []),
      pb.collection('notas_saude').getFullList({ filter: ids }).catch(() => []),
      pb.collection('receitas_saude').getFullList({ filter: ids }).catch(() => []),
      pb.collection('decisoes_saude').getFullList({ filter: ids }).catch(() => []),
      // E as tomas de cada receita (12/09/2026) — pela mesma porta.
      pb.collection('tomas_saude').getFullList({ filter: pelaReceita }).catch(() => []),
    ]);
    return { episodios, anexos, notas, receitas, decisoes, tomas, alergias };
  },

  // Ficheiros: o URL é assinado pelo servidor, não construído aqui.
  ficheiro: (registo, campo) => (estaLigado() && registo && registo[campo]
    ? pb.files.getURL(registo, registo[campo]) : null),
};

// ─── Google Calendar ─────────────────────────────────────────────────────────
//
// Lê os eventos reais da agenda de quem entrou. Fala diretamente com a API da
// Google usando o token que veio no login — o PocketBase não serve de
// intermediário aqui, e portanto os eventos nunca passam pelo nosso servidor
// enquanto não forem importados de propósito.
//
// ⚠ Só funciona depois de `google.ligar()`. A entrada com o Google dá
// identidade e mais nada: o token que ela devolve dura uma hora e não é
// renovável, porque o PocketBase não pede `access_type=offline` à Google.
// A autorização da agenda é um consentimento à parte, e a chave de longa
// duração fica no servidor.

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export const google = {
  // A interface lê isto sem esperar, e por isso não pode ser uma promessa.
  // `verificar()` é que vai ao servidor; até ele responder, `null` quer dizer
  // «ainda não se sabe» — e um ecrã que não sabe não deve afirmar nada.
  disponivel: () => agendaLigada === true,

  // Há sessão, mas a agenda não está ligada — é uma situação a EXPLICAR, e não
  // a esconder. Numa app sem servidor devolve falso: aí não há nada a ligar.
  porLigar: () => Boolean(estaLigado() && pb.authStore && pb.authStore.isValid
    && agendaLigada === false),

  // Perguntar ao servidor, sem incomodar a Google.
  async verificar() {
    if (!estaLigado() || !pb.authStore || !pb.authStore.isValid) {
      agendaLigada = false;
      return false;
    }
    try {
      const r = await fetch(`${URL.replace(/\/+$/, '')}/api/agenda/estado`, {
        headers: { Authorization: pb.authStore.token },
      });
      agendaLigada = r.ok ? Boolean((await r.json()).ligada) : false;
    } catch {
      agendaLigada = false;
    }
    return agendaLigada;
  },

  // Ligar a agenda: abrir a janela, pedir o endereço, e apontá-la a ele.
  //
  // O endereço vem numa chamada AUTENTICADA. Uma janela do navegador não manda
  // cabeçalhos, e a alternativa — pôr a sessão no endereço — deixava-a no
  // histórico do navegador e nos registos de tudo o que estivesse pelo caminho.
  //
  // ⚠ Mas a janela abre-se ANTES dessa chamada, e não depois (18/09/2026).
  // Abria depois, e por isso o gesto já tinha expirado: o Chrome recusava-a
  // pelo mesmo motivo que recusava a da entrada. Aqui havia ao menos a
  // mensagem do «bloqueou a janela» — mas a mensagem estava a acusar o
  // bloqueador de uma coisa que era nossa. Ver o `abrirNoGesto`.
  async ligar() {
    if (!estaLigado()) throw new Error('Servidor não configurado.');
    const janela = abrirNoGesto('nossa-casa-agenda');
    if (!janela) throw new Error('Abra a app num navegador para autorizar a agenda.');
    const r = await fetch(`${URL.replace(/\/+$/, '')}/api/agenda/ligar`, {
      method: 'POST',
      headers: { Authorization: pb.authStore.token },
    }).catch((e) => { try { janela.close(); } catch (x) { /* já fechada */ } throw e; });
    if (!r.ok) {
      try { janela.close(); } catch (x) { /* já fechada */ }
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || 'Não foi possível começar a ligação à agenda.');
    }
    const { url } = await r.json();
    // A janela já existe desde o gesto; agora é só apontá-la.
    janela.location.href = url;

    // A janela fecha-se sozinha no fim. Enquanto ela viver, pergunta-se ao
    // servidor de dois em dois segundos — o servidor é a única fonte fiável:
    // a janela é de outro domínio e não se pode ler de fora.
    return new Promise((resolve) => {
      const fim = Date.now() + 5 * 60 * 1000;
      const relogio = setInterval(async () => {
        const acabou = janela.closed || Date.now() > fim;
        if (await this.verificar()) { clearInterval(relogio); resolve(true); return; }
        if (acabou) { clearInterval(relogio); resolve(false); }
      }, 2000);
    });
  },

  // Os eventos dos próximos `dias`, já na forma que a app usa.
  async eventos({ dias = 30, max = 50 } = {}) {
    const bearer = await tokenDaAgenda();

    // ⚠ A janela começa no INÍCIO DE HOJE, e não no instante em que se pede.
    //
    // Era `timeMin: new Date().toISOString()`, e com isso a app nunca via os
    // eventos de hoje que já tinham começado. Verificado contra a agenda a
    // sério: com `timeMin` no instante, quatro eventos de hoje devolviam ZERO;
    // com `timeMin` de ontem, devolviam os quatro. Um evento de dia inteiro
    // conta como tendo começado à meia-noite, portanto às nove da manhã já
    // estava fora da janela.
    //
    // Para uma casa isso é o contrário do que se quer: a consulta das nove é
    // precisamente a que interessa ter na agenda da família, e o ecrã da
    // Agenda mostra o dia todo. A app e a Google tinham noções diferentes de
    // «hoje», e a importação não oferecia nada sem dizer porquê.
    const agora = new Date();
    const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const ate = new Date(inicioDeHoje.getTime() + dias * 86400000);
    const q = new URLSearchParams({
      timeMin: inicioDeHoje.toISOString(), timeMax: ate.toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: String(max),
    });
    const r = await fetch(`${CAL}?${q}`, { headers: { Authorization: `Bearer ${bearer}` } });
    if (!r.ok) {
      // 401 é o token expirado ou sem o scope da agenda — dizer isso, e não
      // «algo correu mal», é a diferença entre o utilizador saber o que fazer.
      if (r.status === 401 || r.status === 403) {
        // O token era válido quando saiu daqui e a Google recusou-o. Esquece-se
        // para o próximo pedido ir buscar outro; não se tenta de novo aqui,
        // porque um 403 pode ser falta de âmbito e aí insistir não resolve.
        esquecerToken();
        throw new Error('A autorização da agenda foi recusada. Ligue a agenda outra vez ao agendar.');
      }
      throw new Error(`A Google respondeu ${r.status}.`);
    }
    const { items = [] } = await r.json();
    return items.filter(e => e.status !== 'cancelled').map(traduzirEvento);
  },

  // ── Escrever na agenda ────────────────────────────────────────────────────
  //
  // ⚠ NÃO SE ESCREVE NA AGENDA DE OUTRA PESSOA. Não é uma limitação desta app:
  // a agenda de cada um é dela, e o único token que existe aqui é o de quem
  // entrou. Escrever na agenda do outro adulto exigiria que ELE autorizasse
  // esta aplicação na conta dele, e que essa autorização vivesse num servidor.
  //
  // O que se faz — e é como um calendário funciona — é CONVIDAR: o evento
  // nasce na agenda de quem o cria, com os outros como participantes. A Google
  // põe-no na agenda de cada um deles e manda-lhes um convite por e-mail.
  //
  // Isso quer dizer que criar um evento partilhado MANDA E-MAIL a quem for
  // convidado. Não é um pormenor técnico — é correio que sai em nome de quem
  // carrega no botão, e o ecrã tem de o dizer antes de acontecer.
  async criarEvento({ titulo, dia, hora, duracaoMin = 60, convidados = [], descricao }) {
    const bearer = await tokenDaAgenda();
    const corpo = {
      summary: titulo,
      description: descricao || undefined,
      ...intervalo(dia, hora, duracaoMin),
      ...(convidados.length ? { attendees: convidados.map(email => ({ email })) } : {}),
    };
    // `sendUpdates=all` é o que faz os convites chegarem. Sem isto o evento
    // aparece na agenda dos convidados sem eles saberem porquê.
    const r = await fetch(`${CAL}?sendUpdates=${convidados.length ? 'all' : 'none'}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) throw new Error(await erroDaGoogle(r));
    const { id } = await r.json();
    return id;
  },

  async atualizarEvento(idGoogle, { titulo, dia, hora, duracaoMin = 60, convidados = [] }) {
    const bearer = await tokenDaAgenda();
    const r = await fetch(`${CAL}/${encodeURIComponent(idGoogle)}?sendUpdates=${convidados.length ? 'all' : 'none'}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: titulo,
        ...intervalo(dia, hora, duracaoMin),
        ...(convidados.length ? { attendees: convidados.map(email => ({ email })) } : {}),
      }),
    });
    if (!r.ok) throw new Error(await erroDaGoogle(r));
  },

  async apagarEvento(idGoogle) {
    const bearer = await tokenDaAgenda();
    const r = await fetch(`${CAL}/${encodeURIComponent(idGoogle)}?sendUpdates=all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` },
    });
    // 410 é «já lá não está», e isso é o resultado que se queria.
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(await erroDaGoogle(r));
  },
};

// A chave da app é `d2026-08-21`; a Google quer ISO com fuso. Sem hora, é um
// evento de dia inteiro — que é o que faz sentido para uma garantia ou um
// aniversário, e não um evento à meia-noite.
const intervalo = (dia, hora, duracaoMin) => {
  const d = String(dia || '').replace(/^d/, '');
  if (!hora) {
    const seguinte = new Date(`${d}T00:00:00Z`);
    seguinte.setUTCDate(seguinte.getUTCDate() + 1);
    return { start: { date: d }, end: { date: seguinte.toISOString().slice(0, 10) } };
  }
  const inicio = new Date(`${d}T${hora}:00`);
  const fim = new Date(inicio.getTime() + duracaoMin * 60000);
  const local = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}:00`;
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    start: { dateTime: local(inicio), timeZone: fuso },
    end: { dateTime: local(fim), timeZone: fuso },
  };
};

// A Google devolve o motivo dentro de `error.message`. Dizê-lo é a diferença
// entre a pessoa saber o que fazer e ver «algo correu mal».
const erroDaGoogle = async (r) => {
  if (r.status === 401 || r.status === 403) {
    return 'A autorização da agenda expirou ou não chega para escrever. '
      + 'Entre com o Google outra vez.';
  }
  try {
    const j = await r.json();
    return `A Google recusou: ${j.error?.message || r.status}.`;
  } catch (e) { return `A Google respondeu ${r.status}.`; }
};

// Um evento da Google na forma que os ecrãs esperam. `recorrente` importa: o
// desenho mostra-os na lista mas desmarcados por omissão.
const traduzirEvento = (e) => {
  const inicio = e.start || {};
  const dia = inicio.dateTime ? inicio.dateTime.slice(0, 10) : inicio.date;
  const hora = inicio.dateTime ? inicio.dateTime.slice(11, 16) : null;
  return {
    id: e.id,
    origem: 'google_calendar',
    titulo: e.summary || '(sem título)',
    dia, hora,
    local: e.location || '',
    // recurringEventId aparece nas ocorrências de uma série
    recorrente: Boolean(e.recurringEventId),
  };
};

// ─── Fila de escritas ────────────────────────────────────────────────────────
//
// Offline, as escritas ficam em fila e vão ao reconectar. Por isso as operações
// de dinheiro levam chave de idempotência: um reenvio colide no índice único em
// vez de pagar a semanada duas vezes (§6, e §9 lista aceitar uma sem chave
// entre as coisas que nunca devem acontecer).

const FILA = 'nossa-casa/fila';
// ⚠ TODAS as coleções com índice único em `(casa, idem_key)`, e a lista tem de
// ficar completa: quem tem o índice e não está aqui escreve `idem_key` vazio, e
// a SEGUNDA escrita dessa coleção na casa colide com a primeira e é recusada.
//
// Estavam aqui duas das quatro. As transferências entre envelopes e os acertos
// de contas ficaram de fora, e a segunda de cada era recusada com um 400 que a
// fila engolia — a casa deixava de sincronizar e o único sintoma era o número
// de pendentes a subir.
//
// A lista não se mantém de cabeça: `__tests__/idem-key-em-todas.test.js` lê os
// índices do `criar-colecoes.mjs` e exige que cada um apareça aqui.
const COM_IDEM = new Set(['despesas', 'cofre_movimentos', 'transferencias', 'acertos',
  // Os reforços de uma meta. A quinta coleção aditiva desta casa, e a razão é a
  // mesma das quatro: sem chave, um reenvio da fila punha 50 € na meta das
  // férias duas vezes.
  'meta_movimentos']);

const lerFila = async () => {
  try { return JSON.parse(await guarda.getItem(FILA)) || []; } catch { return []; }
};
const gravarFila = (f) => guarda.setItem(FILA, JSON.stringify(f)).catch(() => {});
const novaChave = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// ── ⚠ UMA fila, UM de cada vez ───────────────────────────────────────────────
//
// A fila vive no disco e cada operação a lê, mexe e regrava — com `await` pelo
// meio. Duas escritas ao mesmo tempo liam a MESMA fila antiga e a segunda
// gravava por cima da primeira: o movimento do cofre entrava, a linha do
// registo («Semanada de Léo: 1,90 €») era pedida um instante depois pelo
// efeito da loja, lia a fila sem o movimento, gravava só a sua — e o movimento
// morria sem nunca ser enviado. A linha do registo, essa, ia duas vezes,
// porque dois `esvaziar` a apanhavam em simultâneo.
//
// E era SEMPRE assim: toda a escrita de dinheiro da loja escreve uma linha de
// registo logo a seguir. Semanadas, bónus e despesas registadas pela app ficavam
// no ecrã e perdiam-se na leitura seguinte; o acerto sobrevivia só por sorte
// de tempos. Apanhado em 13/09/2026 na casa simulada, a comparar o que a app
// mostrava com o que o servidor tinha depois de recarregar.
//
// A cura é uma cadeia: cada operação sobre a fila espera pela anterior. É o
// que um `Mutex` faria, escrito com uma promessa.
let vez = Promise.resolve();
const umDeCadaVez = (fn) => {
  const minha = vez.then(fn, fn);
  // A cadeia nunca fica rejeitada: a falha volta a quem chamou, e a seguinte
  // corre na mesma.
  vez = minha.catch(() => {});
  return minha;
};

export const escrever = {
  criar(colecao, dados) {
    const linha = COM_IDEM.has(colecao) && !dados.idem_key
      ? { ...dados, idem_key: novaChave() } : dados;
    return umDeCadaVez(async () => {
      const fila = await lerFila();
      fila.push({ op: 'criar', colecao, dados: linha });
      await gravarFila(fila);
      return escrever.despachar();
    });
  },

  atualizar(colecao, id, campos) {
    return umDeCadaVez(async () => {
      const fila = await lerFila();
      fila.push({ op: 'atualizar', colecao, id, dados: campos });
      await gravarFila(fila);
      return escrever.despachar();
    });
  },

  // O público: entra na cadeia. O `despachar` de baixo é o de quem JÁ está
  // dentro dela — chamar este ali esperava por si próprio para sempre.
  esvaziar() { return umDeCadaVez(() => escrever.despachar()); },

  // Por ordem, parando na primeira falha para não trocar a sequência. O que
  // falhou fica na fila para a próxima tentativa.
  //
  // ── ⚠ Uma recusa não é uma falha de rede, e tratá-las como iguais custou-me
  // uma tarde ────────────────────────────────────────────────────────────────
  //
  // Esta função parava em QUALQUER erro e não dizia qual. Uma escrita que o
  // servidor RECUSA — campo em falta, regra que não deixa — nunca vai passar,
  // por muitas vezes que se tente: fica à cabeça da fila e bloqueia tudo o que
  // vem atrás, para sempre, em silêncio. A casa deixa de sincronizar e ninguém
  // sabe porquê, porque a única pista era um número de pendentes a subir.
  //
  // Distinguem-se pelo estado:
  //   • 4xx  → o servidor entendeu e recusou. Não melhora com o tempo. Sai da
  //            fila para as `recusadas`, e a fila continua.
  //   • 0/5xx → não houve resposta, ou o servidor caiu. Melhora. Fica na fila.
  //
  // E a que sai leva o motivo com ela: `presa` e `recusadas` existem para que
  // quem chamar possa dizer o que aconteceu em vez de contar pendentes.
  async despachar() {
    if (!estaLigado()) return { enviadas: 0, pendentes: (await lerFila()).length, recusadas: [] };
    let fila = await lerFila();
    let enviadas = 0;
    const recusadas = [];
    let presa = null;
    while (fila.length) {
      const w = fila[0];

      // ── ⚠ O travão da saúde, perguntado À SAÍDA ──────────────────────────
      //
      // Era perguntado só à ENTRADA, no `recusaSaude` do `sync.js`, e isto
      // enviava o que estivesse na fila sem consultar ninguém. A fila vive no
      // `AsyncStorage`, sobrevive ao reinício da app e à MUDANÇA DE ENDEREÇO do
      // servidor — e qualquer escrita seguinte, uma despesa que seja, drena-a
      // inteira para o endereço que estiver configurado nesse momento.
      //
      // Uma consulta enfileirada enquanto o servidor era de casa subia assim
      // para o servidor da internet. Medido em 28/09/2026.
      //
      // Sai da fila para as `recusadas`, e não fica: com o travão fechado esta
      // escrita não vai passar por muitas vezes que se tente, que é exactamente
      // o critério das `recusadas` escrito em cima. A consulta continua no
      // dispositivo — o que se abandona é a subida, e quem chamou fica a saber
      // porquê em vez de ver um número de pendentes a subir.
      if (eColecaoDeSaude(w.colecao) && !A_SAUDE_SOBE) {
        recusadas.push({
          op: w.op, colecao: w.colecao, estado: 0, mensagem: PORQUE_NAO_SOBE, campos: null,
        });
        fila.shift();
        await gravarFila(fila);
        continue;
      }

      try {
        if (w.op === 'criar') await pb.collection(w.colecao).create(w.dados);
        else await pb.collection(w.colecao).update(w.id, w.dados);
      } catch (e) {
        // 400 numa escrita com chave de idempotência é o índice único a dizer
        // «já lá está» — o que é sucesso, não erro.
        const jaLa = e.status === 400 && w.dados && w.dados.idem_key;
        if (!jaLa) {
          const porque = {
            op: w.op, colecao: w.colecao, estado: e.status || 0,
            mensagem: e.message,
            campos: (e.response && e.response.data) || (e.data && e.data.data) || null,
          };
          // Sem resposta, ou o servidor a arder: pára e guarda para a próxima.
          if (!e.status || e.status >= 500) { presa = porque; break; }
          // Recusada. Tirá-la é o que desbloqueia as que vêm atrás — mas não é
          // uma escrita enviada, e contá-la como tal era voltar ao silêncio.
          recusadas.push(porque);
          fila.shift();
          await gravarFila(fila);
          continue;
        }
      }
      fila.shift();
      enviadas++;
      await gravarFila(fila);
    }
    return { enviadas, pendentes: fila.length, recusadas, presa };
  },

  pendentes: async () => (await lerFila()).length,

  // ── Uma escrita COM ficheiro ─────────────────────────────────────────────
  //
  // ⚠ Não passa pela fila, e não é uma opção: a fila serializa em JSON dentro
  // do armazenamento local, e um ficheiro não é JSON. Enfiá-lo lá gravava
  // `{}` e a escrita subia sem o anexo — em silêncio, que é o pior modo.
  //
  // Portanto isto é direto: ou há rede e sobe, ou rebenta e quem chama decide.
  // No caso dos anexos de saúde, quem chama guarda a fotografia no dispositivo
  // primeiro e marca-a como «por subir» — a fotografia nunca se perde por não
  // haver rede, mas também não finge que já está no servidor.
  //
  // A URI vem do `expo-image-picker`. Na web é `blob:` ou `data:`; em nativo é
  // `file://`, e o `FormData` do React Native sabe recebê-la como
  // `{ uri, name, type }`.
  //
  // ⚠ A escolha é pelo ESQUEMA da URI, não pela plataforma — e não é
  // preferência. Cheguei a escrever `Platform.OS === 'web'`, o que obriga a
  // `import { Platform } from 'react-native'`, e isso REBENTOU todas as provas
  // que correm em Node: o `index.js` do React Native usa sintaxe Flow que o
  // Node não analisa, e o erro aponta para o RN, não para aqui. Este ficheiro
  // importa de propósito só o armazenamento e o SDK — é o que o mantém
  // provável contra um servidor.
  //
  // E o esquema é a pergunta certa de qualquer modo: `blob:`, `data:` e
  // `http:` trazem-se com um `fetch`; `file://` não, em nenhum dos dois
  // ambientes.
  //
  // `ficheiro.blob` é a terceira porta, para quem já tem os bytes — é por ela
  // que a prova de aceitação em Node manda um ficheiro a sério.
  async criarComFicheiro(colecao, dados, ficheiro) {
    if (!estaLigado()) throw new Error('Sem ligação ao servidor.');
    return pb.collection(colecao).create(await formDataDe(dados, ficheiro));
  },

  // ── Pôr um ficheiro numa linha que JÁ existe ─────────────────────────────
  //
  // O documento de um contrato vive na própria linha do contrato, e o contrato
  // nasce pela fila (JSON) — o ficheiro só pode ir depois, quando a linha tem
  // id. É o mesmo `FormData` da criação, sem os outros campos: um `update` com
  // só o ficheiro deixa o resto da linha como está.
  async atualizarComFicheiro(colecao, id, ficheiro) {
    if (!estaLigado()) throw new Error('Sem ligação ao servidor.');
    if (!id || !ficheiro) throw new Error('Sem linha ou sem ficheiro para pôr nela.');
    return pb.collection(colecao).update(id, await formDataDe({}, ficheiro));
  },
};

// O `FormData` de uma escrita com ficheiro, partilhado pelo criar e pelo
// atualizar. As três portas do ficheiro — `blob`, URI que se traz com `fetch`,
// URI de ficheiro nativo — estão explicadas acima do `criarComFicheiro`.
async function formDataDe(dados, ficheiro) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(dados || {})) {
    if (v !== undefined && v !== null) fd.append(k, String(v));
  }
  if (ficheiro) {
    const campo = ficheiro.campo || 'ficheiro';
    const nome = ficheiro.nome || 'anexo.jpg';
    const tipo = ficheiro.tipo || 'image/jpeg';
    if (ficheiro.blob) {
      fd.append(campo, ficheiro.blob, nome);
    } else if (ficheiro.uri && /^(blob:|data:|https?:)/i.test(ficheiro.uri)) {
      fd.append(campo, await (await fetch(ficheiro.uri)).blob(), nome);
    } else if (ficheiro.uri) {
      fd.append(campo, { uri: ficheiro.uri, name: nome, type: tipo });
    }
  }
  return fd;
}

// ─── Tempo real ──────────────────────────────────────────────────────────────
// Só a lista de compras. É a única área onde dois telefones estão na mesma
// coisa ao mesmo tempo — dois adultos na loja. Subscrever tudo gasta bateria e
// não resolve problema nenhum.

// ⚠ As DUAS coleções, e não só os `artigos`.
//
// A lista fechar é o momento em que o outro telemóvel mais precisa de saber:
// quem está na caixa fecha a conta, e quem ainda anda nos corredores continua a
// marcar artigos de uma ida que já acabou. Subscrever só os artigos deixava
// esse caso de fora, que é o pior dos dois.
const DE_COMPRAS = ['artigos', 'listas_compras'];

export const tempoReal = {
  async compras(aoMudar) {
    if (!estaLigado()) return () => {};
    // ⚠ Uma subscrição que falha não rebenta a app — mas também não pode
    // fingir que ficou feita. As que passarem são as que se cancelam depois;
    // cancelar uma que nunca existiu dava um erro sem nada por trás.
    const vivas = [];
    for (const colecao of DE_COMPRAS) {
      try {
        await pb.collection(colecao).subscribe('*', (ev) => aoMudar(colecao, ev));
        vivas.push(colecao);
      } catch { /* sem tempo real nesta coleção; a app continua a funcionar */ }
    }
    return () => {
      for (const colecao of vivas) pb.collection(colecao).unsubscribe('*').catch(() => {});
    };
  },
};
