import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, useColorScheme, StatusBar, Modal, Image } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { Roboto_500Medium, Roboto_400Regular } from '@expo-google-fonts/roboto';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { StoreProvider, useStore } from './src/store';
import { buildTheme, onChrome, chromeLine, S, R, FONT, elev, LARGURA_APP } from './src/theme';
import Icon, { Marca } from './src/Icon';
import { AvatarDeCabecalho, Tap, MarcaDeAgua, Primary } from './src/ui';
import { AcaoDoEcra } from './src/AcaoDoEcra';
import { FEM, DE } from './src/data';
import { EUR, dayLabel, TODAY, TODAY_KEY, atualizarHoje, semanaDeHoje, plural,
         chaveRelativa } from './src/format';
import Login from './src/screens/Login';
import Inicio from './src/screens/Inicio';
import Dinheiro from './src/screens/Dinheiro';
import Tarefas from './src/screens/Tarefas';
import Compras from './src/screens/Compras';
import ModoCompras from './src/screens/ModoCompras';
import ComoFazemosCompras from './src/screens/ComoFazemosCompras';
import Agenda from './src/screens/Agenda';
import Equipamentos from './src/screens/Equipamentos';
import Saude from './src/screens/Saude';
import Gestao from './src/screens/Gestao';
import Documentacao from './src/screens/Documentacao';
import FichaSaude from './src/screens/FichaSaude';
import Perfil from './src/screens/Perfil';
import KidApp from './src/KidApp';
import GoogleCalendarImportModal from './src/modals/GoogleCalendarImportModal';
import Confirm from './src/Confirm';
import Sheet from './src/Sheet';
import { membrosDoRascunho } from './src/criar-casa';
import { APP_VERSION, AREAS, REGISTO_APP } from './src/registo-app';
import * as servidor from './src/pocketbase';
import Resultados from './src/screens/Resultados';
import { indexar } from './src/pesquisa';
import { podeVerEvento } from './src/store';

// A imagem do ecrã de entrada, reaproveitada como fundo à volta da coluna no
// monitor. É a mesma que o `Login.jsx` usa — uma só imagem, um só sítio de onde
// vem, e a app fica assente no mesmo sítio onde se entra nela.
const FUNDO_DA_ENTRADA = require('./assets/login-bg.jpg');

// A lista que o ecrã mostra quando não há agenda da Google ligada. Está aqui,
// e não dentro do JSX, para ser óbvio que é demonstração e não dados.
// Um evento da Google, na forma que o resto da app fala.
//
// A camada da Google devolve `titulo/dia/hora/recorrente/local` — nomes em
// português, como tudo em `src/pocketbase.js`. O aviso de importação e o
// `importGoogleEvents` falam `title/date/time/isRecurring/location`, que é a
// forma dos eventos de demonstração abaixo.
//
// Enquanto o aviso só via a demonstração, ninguém notou. Com a agenda ligada,
// o modal lia `e.title` num objecto que tinha `titulo` e mostrava uma LINHA EM
// BRANCO: uma caixa com uma marca de seleção, sem nome, sem data, a perguntar
// se a pessoa a quer na casa. Traduz-se aqui, na fronteira, para haver uma
// forma só a partir deste ponto.
const daGoogle = (e) => ({
  id: e.id,
  title: e.titulo,
  // `dia` vem sem prefixo e a app lê chaves com `d`. O `importGoogleEvents`
  // aceita as duas, mas o modal formata a data e precisa da chave.
  date: /^d/.test(String(e.dia)) ? e.dia : `d${e.dia}`,
  time: e.hora || '',
  isRecurring: !!e.recorrente,
  // `description` e não `location`: é o nome que o aviso lê para a terceira
  // parte da linha «data · hora · local». Um nome quase certo não mostra nada.
  description: e.local || '',
});

// Os eventos que o aviso de importação mostra numa casa de demonstração.
//
// Tinham as datas escritas — `d2026-08-28`, `29`, `30`. A 1 de setembro o
// aviso oferecia três eventos «novos» que já tinham passado: uma reunião na
// semana anterior, um almoço no sábado que já foi. São deslocamentos, como o
// resto das sementes.
const EVENTOS_DE_DEMONSTRACAO = [
  { id: 'gcal-1', title: 'Reunião de equipa', date: chaveRelativa(2), time: '14:00', isRecurring: false, description: '' },
  { id: 'gcal-2', title: 'Almoço com a mãe', date: chaveRelativa(3), time: '12:30', isRecurring: false, description: 'Restaurante Taberna' },
  { id: 'gcal-3', title: 'Chamada com o cliente', date: chaveRelativa(4), time: '10:00', isRecurring: true, description: 'Reunião semanal' },
];

// Os subtítulos vêm da semana e do mês da app, não escritos à mão. O da
// Agenda dizia «20 – 26 de agosto» — a semana a começar em hoje — onde a
// referência 08 diz «17 – 23»; o do Dinheiro não existia; os das Tarefas e
// das Compras não começavam por «Semana de 17/08» como nas referências 06 e 07.
const TABS = [
  { key: 'inicio',   label: 'Início',   icon: 'home',        title: 'Nossa Casa',
    sub: (ctx) => `Família ${ctx.casa} · ${plural(ctx.nMembros, 'membro', 'membros')}` },
  { key: 'dinheiro', label: 'Dinheiro', icon: 'wallet',      title: 'Dinheiro',
    // `TODAY.y` lido AQUI, e não numa constante do módulo: o ano muda sem
    // recarregar, como o resto do «hoje» (ver `atualizarHoje`).
    sub: (ctx) => `Conta conjunta · ${ctx.mes} de ${TODAY.y}` },
  { key: 'tarefas',  label: 'Tarefas',  icon: 'checkSquare', title: 'Tarefas',
    sub: (ctx) => `${ctx.semana.curta} · rotinas e tarefas` },
  { key: 'compras',  label: 'Compras',  icon: 'fileDone',    title: 'Lista de Compras',
    // ⚠ Dizia «partilhada com 2 adultos» escrito à mão — numa casa com uma
    // adulta, ou com três, mentia (casa vazia, 13/09/2026).
    sub: (ctx) => `${ctx.semana.curta} · ${ctx.nAdultos === 1 ? 'só um adulto na casa' : `partilhada com ${plural(ctx.nAdultos, 'adulto', 'adultos')}`}` },
  { key: 'agenda',   label: 'Agenda',   icon: 'calendar',    title: 'Agenda',
    sub: (ctx) => ctx.semana.intervalo },
];

function Shell() {
  const { s, set, importGoogleEvents, idsGoogleDaCasa, remaining, allEvents, allTasks, allItems,
          canSeeHealth, healthOf, docsOf, allEquip, contratosDaCasa, contasDoMes, membros: MEMBERS, nomeDaCasa,
          lerDoServidor, removerEvento, eventosQueSairamDaGoogle, isAdmin, acrescentarMembro } = useStore();
  const sysDark = useColorScheme() === 'dark';
  const [user, setUser] = useState(null);      // nome do membro ligado
  const [tab, setTab] = useState('inicio');
  // Uma casa acabada de criar: o que se acrescentou, e os PIN que as crianças
  // receberam — mostram-se UMA vez, porque o servidor só guarda o resumo.
  const [boasVindas, setBoasVindas] = useState(null);
  // A pesquisa global (13/09/2026, opção A de design/pesquisa-global.dc.html):
  // `null` é «fechada»; uma string é o que está escrito no campo do cabeçalho
  // do Início, mesmo vazia. Enquanto estiver aberta, o conteúdo do Início são os
  // resultados; um separador do rodapé fecha-a.
  const [pesquisa, setPesquisa] = useState(null);
  // Se o campo da pesquisa tem o foco — a linha por baixo dele passa de 60 % a
  // 100 % (opção C de design/campo-de-pesquisa.dc.html). É a app que desenha o
  // foco: o anel do navegador saía laranja no Windows e não seguia o esquema.
  const [pesquisaFocada, setPesquisaFocada] = useState(false);
  // O que abrir ao chegar a um separador, vindo do Início. Limpa-se ao chegar,
  // senão voltar ao separador reabria a mesma folha para sempre.
  const [abrirNoTab, setAbrirNoTab] = useState(null);
  // A ação do ecrã que está à frente — o «acrescentar» de cada um, desenhado
  // numa barra fixa entre o que rola e o rodapé (`src/AcaoDoEcra.jsx`).
  const [acaoDoEcra, setAcaoDoEcra] = useState(null);
  const [kidTab, setKidTab] = useState('tarefas');  // aba na KidApp
  const [perfil, setPerfil] = useState(false);
  const [signOut, setSignOut] = useState(false);
  const [saude, setSaude] = useState(false);
  const [equip, setEquip] = useState(false);   // true, ou o id do equipamento a abrir
  const [gestao, setGestao] = useState(false);
  const [doc, setDoc] = useState(false);
  const [loja, setLoja] = useState(false);   // modo de compras na loja
  const [ida, setIda] = useState(false);     // como esta casa faz compras
  const [ficha, setFicha] = useState(null); // membro cuja ficha de saúde está aberta
  const [marcarPara, setMarcarPara] = useState(null); // membro a pré-seleccionar ao marcar
  const [googleImport, setGoogleImport] = useState(false);
  // Abrir a folha de importação ao chegar à Agenda, vindo do Início.
  const [importarNaAgenda, setImportarNaAgenda] = useState(false);
  // ⚠ O scroll volta ao TOPO quando o ecrã muda (revisão de coerência de
  // 14/09/2026). Os separadores e as vistas de ecrã inteiro partilham a mesma
  // área de scroll, e ela guardava a posição: abrir a Gestão, descer até ao
  // fim, voltar e abrir a Documentação abria-a a 933 px do topo, a meio do
  // registo. Hooks ANTES dos `return` antecipados do Shell (classe 48).
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current && scrollRef.current.scrollTo) scrollRef.current.scrollTo({ y: 0, animated: false });
  }, [tab, saude, equip, gestao, doc, ficha, loja, ida, pesquisa === null]);
  // Os eventos que saíram da agenda da Google e ainda estão nesta casa.
  // Guardam-se para PERGUNTAR — nunca se apagam sem resposta.
  const [saidosDaGoogle, setSaidosDaGoogle] = useState([]);
  // A razão por que o regresso da Google falhou, para o ecrã de entrada a
  // dizer. Sem isto a pessoa voltava da Google para o «Bem-vindo» sem uma
  // palavra sobre o que correu mal.
  const [erroDoRetorno, setErroDoRetorno] = useState(null);
  // Os eventos da agenda da Google. Vazio até haver token — e havendo, vêm da
  // API a sério, não de uma lista escrita no código.
  const [eventosGoogle, setEventosGoogle] = useState(EVENTOS_DE_DEMONSTRACAO);
  const [booting, setBooting] = useState(true);
  const [fontsReady, setFontsReady] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          Roboto: Roboto_400Regular,
          'Roboto-500': Roboto_500Medium,
          Inter: Inter_400Regular,
          'Inter-600': Inter_600SemiBold,
        });
      } catch (e) {
        console.warn('Font loading failed, using system fonts:', e.message);
      }
      setFontsReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!fontsReady) return;
    const id = setTimeout(() => setBooting(false), 600);
    return () => clearTimeout(id);
  }, [fontsReady]);

  // ── O relógio do «hoje» ───────────────────────────────────────────────────
  //
  // O «hoje» da app era lido uma vez ao carregar. Deixada aberta a passar a
  // meia-noite, dizia «Quarta, 09/09» na quinta (10/09/2026) até recarregar —
  // e recarregar custa a sessão a quem a tem. Isto pergunta a cada meio
  // minuto, e no instante em que a janela volta à frente, se o dia mudou;
  // quando muda, o `atualizarHoje` já mexeu no `TODAY` e no `TODAY_KEY`
  // (ligações vivas — ver `src/format.js`) e este estado só serve para voltar
  // a desenhar tudo. Sem recarregar, sem reiniciar a sessão.
  const [, setDiaDeHoje] = useState(TODAY_KEY);
  useEffect(() => {
    const conferir = () => { if (atualizarHoje()) setDiaDeHoje(TODAY_KEY); };
    const id = setInterval(conferir, 30 * 1000);
    const temDoc = typeof document !== 'undefined' && document.addEventListener;
    if (temDoc) document.addEventListener('visibilitychange', conferir);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('focus', conferir);
    return () => {
      clearInterval(id);
      if (temDoc) document.removeEventListener('visibilitychange', conferir);
      if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('focus', conferir);
    };
  }, []);

  // Retomar a sessão que já existe.
  //
  // O PocketBase guarda-a em disco e ela sobrevive a fechar a app — mas o
  // `user` é estado do React e arranca a null, portanto a app mandava toda a
  // gente para o ecrã de entrada a cada recarga. Com a Google isso é uma
  // janela de consentimento de cada vez que se abre a app, para uma sessão
  // que já estava válida ali ao lado.
  useEffect(() => {
    if (user) return;
    let vivo = true;
    (async () => {
      // ⚠ PRIMEIRO: a Google acabou de nos devolver a pessoa?
      //
      // 18/09/2026, a entrada passou a ser um REDIRECCIONAMENTO da página
      // inteira — sem janela, porque o bloqueador do Chrome a recusava. O
      // regresso chega como `?code=…&state=…` NESTE endereço, e é aqui que se
      // troca o código pela sessão.
      //
      // Vem antes do `sessaoPronta`: quem está a voltar da Google não tem
      // sessão gravada nenhuma para esperar, e o código gasta-se à primeira.
      if (servidor.auth.haRetornoDaGoogle()) {
        const r = await servidor.auth.concluirEntradaGoogle();
        if (!vivo) return;
        if (r.ok && r.record) {
          await lerDoServidor();
          if (vivo) setUser(r.record.nome);
          return;
        }
        // Falhou: o `Login` mostra a razão, e o endereço já vai limpo.
        if (r.erro) setErroDoRetorno(r.erro);
      }

      // ESPERAR pela sessão gravada antes de a dar por ausente. Sem isto era
      // uma corrida: o `AsyncAuthStore` carrega o disco de forma assíncrona, e
      // quem perguntasse no instante do arranque recebia «não há sessão» com
      // uma válida a dois milissegundos de distância. Este efeito tem
      // dependências vazias — pergunta uma vez e nunca volta a tentar.
      await servidor.sessaoPronta();
      if (!vivo) return;
      // ⚠ E RENOVAR o token, senão o prazo dele expulsa quem usa a app todos
      // os dias. Só uma recusa do servidor termina a sessão; sem resposta,
      // fica-se com a que está gravada — ver `renovarSessao`.
      await servidor.renovarSessao();
      if (!vivo) return;
      const m = servidor.auth.valida() ? servidor.auth.membro() : null;
      if (!m || !vivo) return;
      await lerDoServidor();          // a casa antes do nome, para o quadro já o ter
      if (vivo) setUser(m.nome);
    })();
    return () => { vivo = false; };
  }, []);

  // ── Uma casa acabada de criar ─────────────────────────────────────────────
  //
  // «Criar a minha casa» pergunta tudo ANTES da Google e não cria nada até à
  // volta: o servidor cria a casa e faz da pessoa administradora quando ela
  // entra. Só aí é que se podem acrescentar as crianças e os outros adultos que
  // ela escreveu — porque só uma administradora os acrescenta. Corre uma vez
  // (`tomarRascunho` esvazia-se) e depois de `user` estar posto, para a loja
  // já ter a casa e as funções de gerir verem o servidor.
  useEffect(() => {
    if (!user) return;
    const rascunho = servidor.auth.tomarRascunho();
    if (!rascunho) return;
    (async () => {
      const { membros, pins } = membrosDoRascunho(rascunho);
      const pinsDados = {};
      const erros = [];
      for (const m of membros) {
        const erro = await acrescentarMembro(m);
        if (erro) erros.push(`${m.nome}: ${erro}`);
        else if (m.papel === 'crianca') pinsDados[m.nome] = pins[m.nome];
      }
      setBoasVindas({ casa: rascunho.nomeCasa, pins: pinsDados, erros });
    })();
  }, [user]);

  // A importação da agenda, ao entrar.
  //
  // ── Corria UMA VEZ na vida da casa ────────────────────────────────────────
  //
  // A guarda era «já importou alguma coisa? então não voltes a olhar», e com
  // isso o sentido Google → Nossa Casa funcionava no primeiro dia e nunca
  // mais. Um evento marcado na agenda da Google na semana seguinte não
  // aparecia aqui, e nada no ecrã dizia porquê.
  //
  // Agora olha sempre que se entra, e o que decide se o aviso abre é haver
  // eventos AINDA NÃO VISTOS — não o histórico da casa. Os dispensados ficam
  // marcados em `googleCalendarImported`, por isso o «Agora não» continua a
  // valer para aqueles e não para os que vierem depois.
  // ⚠ `MEMBERS` TEM de estar nas dependências.
  //
  // `entrar()` faz `setUser(nome)` e só DEPOIS lê a casa do servidor. O efeito
  // disparava com o nome já posto e o quadro ainda vazio, caía na primeira
  // linha — `!MEMBERS[user]` — e não voltava a correr, porque `MEMBERS` não
  // estava na lista. Resultado: entrar pela Google nunca pesquisava a agenda.
  // Só uma recarga da página o fazia, e aí já havia membros à partida.
  //
  // ⚠ E OLHA OUTRA VEZ QUANDO A APP VOLTA A ESTAR À FRENTE (18/09/2026).
  //
  // Ele: «quando apago algo no calendário da app ele apaga no Google, o
  // contrário também devia acontecer». E acontecia — a detecção
  // (`eventosQueSairamDaGoogle`) e a pergunta existem desde que o apagar
  // ganhou os dois sentidos. O que faltava era o QUANDO: isto corria uma vez,
  // à entrada, e as dependências só mudam quando se importa alguma coisa.
  // Quem apagasse na Google com a app aberta não via nada até sair e voltar a
  // entrar — e como a app fica aberta, nunca via.
  //
  // Agora também se pergunta quando a janela volta a estar à frente, que é
  // exactamente o gesto de quem foi ao calendário apagar e voltou. Travado a um
  // minuto: a agenda da Google não muda vinte vezes por minuto, e cada olhada
  // é um pedido à conta de quem entrou.
  const verAgendaRef = useRef(null);
  useEffect(() => {
    if (!user || !MEMBERS[user] || MEMBERS[user].kid) return;

    let vivo = true;
    const corpo = async () => {
      // Saber se a agenda está ligada NESTA conta, sempre que alguém entra.
      //
      // Antes só se perguntava quando a resposta era desconhecida. Se um
      // adulto saísse e o outro entrasse, ficava a resposta do primeiro — a
      // app dizia «ligada» a quem nunca a ligou, e depois falhava a cada
      // pedido sem explicar porquê.
      await servidor.google.verificar();
      if (!vivo) return;

      const jaVistos = s.googleCalendarImported || {};

      if (servidor.google.disponivel()) {
        try {
          const reais = await servidor.google.eventos({ dias: 30, max: 50 });
          if (!vivo) return;
          const nossos = idsGoogleDaCasa();
          // O que a app pôs na agenda da Google não volta como novidade.
          const novos = reais.filter(e => !jaVistos[e.id] && !nossos.has(e.id));
          if (novos.length) { setEventosGoogle(novos.map(daGoogle)); setGoogleImport(true); }

          // E o sentido inverso do apagar: o que SAIU da agenda da Google.
          // Pergunta-se — nunca se apaga sem resposta, porque quem apagou lá
          // pode querer o evento na casa mesmo assim.
          const saidos = eventosQueSairamDaGoogle(reais.map(x => x.id), 30);
          if (saidos.length) setSaidosDaGoogle(saidos);
        } catch (e) { /* autorização caducada — o botão da Agenda explica */ }
        return;
      }

      // Sem agenda ligada. Numa casa a sério não há nada para oferecer e o
      // aviso não abre: abrir uma lista de eventos inventados numa casa de
      // verdade seria pior do que não abrir nada.
      if (s.clearedSeeds) return;
      const novos = EVENTOS_DE_DEMONSTRACAO.filter(e => !jaVistos[e.id]);
      if (vivo && novos.length) { setEventosGoogle(novos); setGoogleImport(true); }
    };
    // O ref leva sempre a versão mais recente — a que vê o
    // `googleCalendarImported` de agora, e não o do render em que foi criada.
    verAgendaRef.current = corpo;
    corpo();
    return () => { vivo = false; };
  }, [user, MEMBERS, s.googleCalendarImported, s.clearedSeeds]);

  // A segunda porta: a janela voltou a estar à frente, e de cinco em cinco
  // minutos enquanto lá estiver.
  //
  // ⚠ NÃO É A GOOGLE QUE AVISA, E NÃO PODE SER. A Google sabe empurrar — o
  // `watch` da Calendar API manda um pedido quando o calendário muda —, mas
  // esse pedido vai para um endereço HTTPS público, e o servidor desta casa
  // corre em `127.0.0.1`. Enquanto ele não estiver exposto à internet, a Google
  // não tem para onde mandar nada, e quem pergunta tem de ser a app.
  //
  // Por isso são duas ocasiões, e nenhuma delas custa mais do que um pedido:
  //
  //   · a janela volta à frente — é o gesto de quem foi ao calendário apagar
  //     e voltou, e é o caso que ele descreveu;
  //   · de cinco em cinco minutos com a app à vista — para o outro adulto,
  //     que apaga no telemóvel dele enquanto este está aberto na cozinha.
  //
  // Escondida, a app não pergunta nada: gastar quota e bateria a olhar para
  // uma agenda que ninguém está a ver não serve a casa.
  const ultimaOlhadela = useRef(0);
  useEffect(() => {
    if (typeof document === 'undefined' || !document.addEventListener) return undefined;
    const olhar = () => {
      if (document.visibilityState === 'hidden') return;
      const agora = Date.now();
      if (agora - ultimaOlhadela.current < 60000) return;
      ultimaOlhadela.current = agora;
      if (verAgendaRef.current) verAgendaRef.current();
    };
    const relogio = setInterval(olhar, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', olhar);
    window.addEventListener('focus', olhar);
    return () => {
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', olhar);
      window.removeEventListener('focus', olhar);
    };
  }, []);

  // Quem entrou, tal como o quadro da casa o conhece. Pode ser `undefined`
  // durante um instante: quem entra pela Google chega com um nome que a loja
  // ainda não tem, porque no arranque não havia sessão e a leitura da casa
  // voltou vazia. Ler `MEMBERS[user].kid` sem guarda rebentava a app inteira
  // aí — ecrã branco, «Cannot read properties of undefined (reading 'kid')».
  const euNaCasa = user ? MEMBERS[user] : null;

  // Entrar relê a casa: é a seguir à sessão que o servidor responde com os
  // membros a sério. Sem isto, quem entrava ficava com o seu nome e a família
  // de demonstração ao lado.
  // A linha do Início LEVA à folha de importação; não liga por conta própria.
  //
  // A primeira versão ligava aqui mesmo, e apanhava os erros num `catch` vazio
  // com um comentário a dizer que não havia onde os mostrar. O resultado é o
  // pior de todos: carregar no botão e não acontecer nada — nem a janela, nem
  // um aviso. Uma janela bloqueada pelo navegador dava exactamente isso.
  //
  // A folha da Agenda já sabe ligar E explicar: tem o botão, tem o sítio para
  // o erro, e a seguir mostra logo os eventos. Duas cópias da mesma coisa, uma
  // delas muda, é como se perde uma tarde.
  const ligarAgenda = () => { setImportarNaAgenda(true); setTab('agenda'); };

  const entrar = async (nome) => {
    // ⚠ A CASA antes do NOME, como na retoma da sessão logo acima.
    //
    // Estava ao contrário, e a diferença não era cosmética: o efeito que
    // pesquisa a agenda da Google corre quando o `user` muda, e caía logo no
    // `!MEMBERS[user]` porque o quadro ainda estava vazio. Entrar pela Google
    // nunca pesquisava a agenda — só uma recarga da página o fazia, e aí os
    // membros já estavam lá à partida.
    //
    // Nesta ordem, quem entra já encontra a casa montada: o quadro, o tema do
    // perfil e a agenda apanham-no todos no mesmo passo.
    await lerDoServidor();
    setUser(nome);
  };

  const mode = (user && s.themeByUser[user]) || 'claro';
  const dark = mode === 'escuro' || (mode === 'sistema' && sysDark);
  const t = buildTheme(user ? (s.schemeByUser[user] ?? 0) : 0, dark);

  // O que fica ao lado da coluna, no monitor.
  //
  // O `public/index.html` pinta o body de #001529 fixo, porque nasceu antes de
  // haver coluna limitada: não se via. Passou a ver-se, e uma cor lisa ao lado
  // da coluna é uma moldura que ninguém escolheu.
  //
  // Fica a MESMA imagem do ecrã de entrada, com o mesmo véu — `login-bg.jpg`
  // sob `rgba(0,0,0,0.6)`, como em `src/screens/Login.jsx`. A app deixa de
  // parecer uma janela a flutuar num rectângulo escuro e passa a estar assente
  // no sítio onde se entrou nela.
  //
  // O `t.chrome` fica por baixo como base: é o que se vê no instante antes de
  // a imagem carregar, e é o que fica se ela não carregar de todo.
  //
  // Em nativo não há `document` — nem há «ao lado da coluna», porque a app
  // ocupa o ecrã. O efeito não faz nada e é isso que se quer.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.backgroundColor = t.chrome;
    // ⚠ O `require` de uma imagem não devolve a mesma coisa nas duas
    // plataformas: em nativo é um número que o `resolveAssetSource` traduz;
    // no react-native-web é a própria URL, ou um objecto com ela lá dentro,
    // conforme o empacotador. Pedir só `.uri` dava `undefined` e o fundo ficava
    // uma cor lisa, sem erro nenhum a dizer porquê.
    const fonte = FUNDO_DA_ENTRADA;
    const uri = typeof fonte === 'string' ? fonte
      : (fonte && fonte.uri) ? fonte.uri
      : (fonte && fonte.default) ? fonte.default
      : (Image.resolveAssetSource ? (Image.resolveAssetSource(fonte) || {}).uri : null);
    if (uri) {
      // O véu vai num gradiente de dois pontos iguais: é a forma de escurecer
      // uma imagem de fundo em CSS sem lhe pôr um elemento por cima — e um
      // elemento por cima teria de viver na árvore da app, onde não pertence.
      document.body.style.backgroundImage =
        `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("${uri}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      // Fixa: sem isto a imagem acompanha o scroll do corpo e a moldura
      // parece deslizar por trás da coluna.
      document.body.style.backgroundAttachment = 'fixed';
    }
  }, [t.chrome]);
  const onC = onChrome(t.chrome);

  if (booting || !fontsReady) {
    return (
      <View style={{ flex: 1, backgroundColor: t.chrome, alignItems: 'center', justifyContent: 'center', gap: S.xl }}>
        <StatusBar barStyle="light-content" />
        <Marca size={74} />
        <View style={{ width: 120, height: 3, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
          <View style={{ width: '60%', height: '100%', backgroundColor: 'rgba(255,255,255,0.6)' }} />
        </View>
      </View>
    );
  }

  // O `erroDoRetorno` é a razão por que a volta da Google falhou, e chega ao
  // ecrã de entrada para ele a dizer — em vez de a pessoa aterrar no
  // «Bem-vindo» sem uma palavra sobre o que correu mal.
  if (!user) return <Login t={t} onEnter={entrar} erroInicial={erroDoRetorno} />;

  // Entrou, mas não vive nesta casa.
  //
  // Acontece de verdade: alguém entra com uma conta Google cujo membro foi
  // tirado da casa entretanto, ou o servidor deixou de responder e a app ficou
  // com a família de demonstração ao lado de um nome que não é dela. Antes
  // disto a app rebentava aqui — ecrã branco, sem uma palavra sobre porquê.
  if (!euNaCasa) {
    return (
      <View style={{ flex: 1, backgroundColor: t.chrome, alignItems: 'center',
        justifyContent: 'center', paddingHorizontal: 32, gap: S.lg }}>
        <StatusBar barStyle="light-content" />
        <Icon name="lock" size={44} color="#FFFFFF" />
        <Text style={{ fontFamily: FONT.display, fontSize: 20, color: '#FFFFFF', textAlign: 'center' }}>
          {user} não faz parte desta casa
        </Text>
        <Text style={{ fontFamily: FONT.ui, fontSize: 13, lineHeight: 21,
          color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>
          A conta entrou, mas não está entre os membros de {nomeDaCasa}. Peça a
          quem administra a casa que a acrescente, e entre outra vez.
        </Text>
        <Pressable onPress={() => { servidor.auth.sair(); setUser(null); }}
          accessibilityRole="button" accessibilityLabel="Voltar à entrada"
          style={{ minHeight: 44, paddingHorizontal: S.xl, borderRadius: R.row, borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 14.5, color: '#FFFFFF' }}>
            Voltar à entrada
          </Text>
        </Pressable>
      </View>
    );
  }

  // Renderizar KidApp se o utilizador for uma criança
  if (euNaCasa?.kid) {
    // ⚠ `sair()` também: a criança entra no SERVIDOR desde 09/09/2026 e tem
    // um token dela. Sem isto o token ficava no dispositivo depois de ela
    // sair, e o adulto seguinte a abrir a app retomava a sessão DELA.
    return <KidApp kid={user} kidTab={kidTab} setKidTab={setKidTab}
      onLogout={() => { servidor.auth.sair(); setUser(null); }} />;
  }

  const meta = TABS.find(x => x.key === tab);
  const ctxSub = { semana: semanaDeHoje(), mes: s.monthName,
    casa: nomeDaCasa, nMembros: Object.keys(MEMBERS).length,
    nAdultos: Object.values(MEMBERS).filter(m => !m.kid).length };
  const Screen = { dinheiro: Dinheiro, tarefas: Tarefas, compras: Compras, agenda: Agenda }[tab];

  // Header dinâmico para Início; fixo para outros ecrãs.
  //
  // A data vem do TODAY da app, não do relógio. O cabeçalho lia `new Date()` e
  // o conteúdo lia TODAY, portanto a app dizia «Sábado, 29/08» em cima e
  // «Quinta, 20/08» duas linhas abaixo — contradizia-se sobre que dia era.
  const isHome = tab === 'inicio';
  const greet = 'Bom dia';
  const today = dayLabel(TODAY_KEY).replace('Hoje · ', '');
  const eventosHoje = allEvents()
    .filter(e => e.day === TODAY_KEY && (e.shared || e.owner === user)).length;
  const tarefasHoje = allTasks().filter(x => x.today).length;

  // ── Vistas de ecrã inteiro ───────────────────────────────────────────────
  // Saúde, Equipamentos, Gestão e Documentação abriam como cartões centrados
  // com véu, e o cabeçalho da app ficava cortado a meio por trás — via-se
  // «82,60 €» partido ao meio. Nas referências (11, 13, 15, 17) são vistas de
  // ecrã inteiro com cabeçalho PRÓPRIO — seta de voltar, ícone, título e
  // contagem — e o rodapé da app por baixo, intacto, com o separador aceso.
  //
  // Não é uma excepção ao INVARIANTE #1: continua a haver cabeçalho e rodapé
  // em todas as janelas. O que muda é o conteúdo do cabeçalho.
  const contas = (n, s1, s2) => `${n} ${n === 1 ? s1 : s2}`;
  const vistas = {
    saude: {
      icon: 'heartPulse', titulo: 'Saúde da Família', fechar: () => setSaude(false),
      sub: () => {
        const membros = Object.keys(MEMBERS).filter(m => canSeeHealth(m, user));
        const c = membros.reduce((a, m) => a + healthOf(m, user).length, 0);
        const d = membros.reduce((a, m) => a + docsOf(m, user).length, 0);
        return `${contas(c, 'consulta', 'consultas')} · ${contas(d, 'documento', 'documentos')}`;
      },
      render: () => <Saude t={t} user={user} onClose={() => setSaude(false)}
        onAbrirFicha={setFicha}
        marcarPara={marcarPara} onMarcado={() => setMarcarPara(null)} />,
    },
    // A ficha de um membro é uma vista como as outras. Desenhava um cabeçalho
    // próprio dentro do conteúdo e ficavam dois empilhados: o «Saúde da
    // Família» da vista e o «Saúde do Léo» dela. A referência 16 substitui.
    ficha: {
      icon: 'heartPulse', fechar: () => setFicha(null),
      titulo: ficha === user ? 'A minha ficha' : `Saúde ${ficha ? DE(ficha) : 'do'} ${ficha}`,
      sub: () => (ficha === user ? 'Privada — mais ninguém a vê' : 'Visível aos adultos da casa'),
      render: () => <FichaSaude t={t} member={ficha} user={user}
        onBack={() => setFicha(null)}
        onMarcar={() => { setMarcarPara(ficha); setFicha(null); setSaude(true); }} />,
    },
    equip: {
      icon: 'houseGear', titulo: 'Equipamentos da Casa', fechar: () => setEquip(false),
      sub: () => {
        const eq = allEquip();
        // E os contratos, que vivem no mesmo ecrã (12/09/2026) — como o desenho
        // diz: «3 equipamentos · 4 contratos». O «em garantia» saiu: com as três
        // contagens o subtítulo cortava em «3 em garanti…» ao lado do avatar,
        // medido no navegador como António, e as garantias estão no cartão do
        // resumo logo abaixo.
        return `${contas(eq.length, 'equipamento', 'equipamentos')}`
          + ` · ${contas(contratosDaCasa().length, 'contrato', 'contratos')}`;
      },
      // ⚠ Sem `onClose` (25/09/2026): o `Equipamentos` nunca o leu. Quem fecha
      // esta vista é o `fechar` aqui em cima, que é a porta do registo — a prop
      // prometia que o ecrã se podia fechar a si próprio, e não podia.
      render: () => <Equipamentos t={t} user={user}
        abrir={typeof equip === 'string' ? equip : null} />,
    },
    gestao: {
      icon: 'sliders', titulo: 'Gestão da Casa', fechar: () => setGestao(false),
      sub: () => `${user} · ${s.roles[user] === 'admin' ? (FEM(user) ? 'administradora' : 'administrador') : 'adulto'}`,
      render: () => <Gestao t={t} user={user} onClose={() => setGestao(false)} />,
    },
    doc: {
      icon: 'fileText', titulo: 'Documentação', fechar: () => setDoc(false),
      sub: () => `Versão ${APP_VERSION}`,
      // ⚠ Sem `onClose`, pela mesma razão do `Equipamentos` aqui em cima.
      render: () => <Documentacao t={t}
        onIr={irDoRegisto} podeGerir={isAdmin(user)} user={user} />,
    },
    ida: {
      icon: 'storefront', titulo: 'Como fazemos compras', fechar: () => setIda(false),
      sub: () => 'A ida marcada, as lojas e os corredores',
      render: () => <ComoFazemosCompras t={t} user={user} onClose={() => setIda(false)} />,
    },
    loja: {
      icon: 'fileDone', titulo: 'Modo Compras', fechar: () => setLoja(false),
      // ⚠ Dona da sua COLUNA: a linha da loja e os separadores por corredor
      // ficam parados por cima da lista, e a lista rola por baixo — como no
      // protótipo (bloco «isLoja», a barra é `flex:none` por cima de um
      // `overflow:auto`). Dentro do ScrollView único da app, a barra rolava com
      // a lista: a sonda do varrimento de 08/09/2026 encontrou-a 564 px acima
      // do ecrã, e para mudar de corredor era voltar ao topo. Com `coluna`, o
      // App.jsx desenha a vista EM VEZ do ScrollView; o cabeçalho e o rodapé
      // ficam exactamente onde estão (INVARIANTE #1).
      coluna: true,
      // ⚠ Sem ida marcada, `s.shopPlan` é NULO — entre duas idas e numa casa
      // acabada de abrir. Isto lia-o cru e rebentava no CABEÇALHO, que corre
      // antes do ecrã: tocar em «iniciar compras na loja» dava branco, e a
      // pilha apontava ao `Shell` e não ao `ModoCompras`, que era onde eu
      // estava a olhar.
      sub: () => { const p = s.shopPlan || {};
        return [p.who, (s.stores || [])[p.store], p.time].filter(Boolean).join(' · '); },
      render: () => <ModoCompras t={t} user={user} onClose={() => setLoja(false)} />,
    },
  };
  // A ficha vem primeiro: abre-se de dentro da Saúde e é ela que manda no
  // cabeçalho enquanto estiver aberta.
  // Fechar TUDO o que corre por cima dos separadores.
  //
  // ⚠ O toque num separador do rodapé fazia `setTab` e mais nada. Com a
  // Saúde, os Equipamentos, a Gestão ou a Documentação abertos por cima, o
  // separador acendia-se e o ecrã continuava a ser o outro: a app ficava
  // presa numa vista de onde só a seta do cabeçalho saía. Medido no
  // navegador — o rodapé dizia «Início» e o conteúdo dizia «Equipamentos da
  // Casa».
  //
  // O rodapé tem de levar sempre onde diz que leva.
  const fecharVistas = () => {
    setFicha(null); setSaude(false); setEquip(false);
    setGestao(false); setDoc(false); setLoja(false); setIda(false);
  };

  // ── A pesquisa global: o índice e para onde cada resultado leva ───────────
  //
  // O índice é o que a loja já tem neste telemóvel — nada é pedido ao servidor,
  // e nada aparece que o servidor não tenha deixado chegar a quem está a olhar
  // (INVARIANTE #3 continua onde estava). Refaz-se a cada desenho enquanto a
  // pesquisa está aberta: são centenas de linhas, não milhares.
  //
  // ⚠ Sem `useMemo`: isto vive DEPOIS dos `return` antecipados do Shell (a
  // entrada, a app da criança), e um hook aqui muda a ordem dos hooks entre
  // desenhos — «Rendered more hooks than during the previous render», a app
  // em branco. Apanhado no navegador em 13/09/2026, cinco minutos depois de
  // o escrever. Um cálculo é só um cálculo.
  const indice = (() => {
    if (pesquisa === null || !user) return [];
    const nomes = Object.keys(MEMBERS);
    const comSaude = nomes.filter(m => canSeeHealth(m, user));
    // Leitura da loja, e só leitura — o guarda «nenhum ecrã escreve contratos
    // por fora da loja» procura `contratos:`. (Os pratos da ementa não entram:
    // a ementa saiu da interface em 13/09/2026.)
    const contratos = contratosDaCasa();
    return indexar({
      tarefas: allTasks(),
      eventos: allEvents().filter(e => podeVerEvento(e, user, MEMBERS)),
      artigos: allItems(),
      contas: contasDoMes(),
      metas: s.metasDaCasa || [],
      equipamentos: allEquip(),
      contratos,
      consultas: comSaude.flatMap(m => healthOf(m, user)),
      documentos: comSaude.flatMap(m => docsOf(m, user)),
      membros: nomes.map(n => ({ nome: n, kid: !!MEMBERS[n].kid })),
      areas: AREAS,
      novidades: REGISTO_APP.slice(0, 40),
    });
  })();

  // Um resultado leva ao sítio dele — o separador com a coisa em mão
  // (`abrirNoTab`, como o Início já faz), ou uma vista de ecrã inteiro.
  const irParaResultado = (destino) => {
    setPesquisa(null);
    if (!destino) return;
    if (destino.vista === 'equip') { fecharVistas(); setEquip(destino.id || true); return; }
    if (destino.vista === 'ficha') { fecharVistas(); setFicha(destino.membro); return; }
    if (destino.vista === 'saude') { fecharVistas(); setSaude(true); return; }
    if (destino.vista === 'doc') { fecharVistas(); setDoc(true); return; }
    fecharVistas();
    setAbrirNoTab(destino.id ? { tab: destino.tab, id: destino.id } : null);
    setTab(destino.tab || 'inicio');
  };

  // Onde uma linha do registo da casa leva. O destino vem da ÁREA dela — ver o
  // `DESTINO` em `Documentacao.jsx` —, e é sempre um ECRÃ: metade das entradas
  // fala de coisas que já não existem, e nenhuma tem um registo para onde
  // apontar.
  //
  // ⚠ Fecha a Documentação primeiro, e é o mesmo `fecharVistas` que o rodapé
  // usa. Sem ele o separador acendia-se e o ecrã continuava a ser este — o
  // defeito que o rodapé já teve, e que está escrito aqui em cima.
  const irDoRegisto = (destino) => {
    fecharVistas();
    if (destino === 'saude') { setSaude(true); return; }
    if (destino === 'equip') { setEquip(true); return; }
    if (destino === 'gestao') { setGestao(true); return; }
    setTab(destino);
  };

  const vistaAberta = ficha ? 'ficha' : saude ? 'saude' : equip ? 'equip'
    : gestao ? 'gestao' : doc ? 'doc' : loja ? 'loja' : ida ? 'ida' : null;
  const V = vistaAberta ? vistas[vistaAberta] : null;

  // No monitor, a coluna da app não se estica.
  //
  // Medido a 1440 px: o cartão de um evento tinha 1393 px de largura, com a
  // hora encostada à esquerda e a pastilha de visibilidade a mais de um metro
  // dela, e o rodapé de cinco separadores atravessava a janela toda. Não é um
  // desenho web — é o desenho de telemóvel esticado.
  //
  // O limite é 460: um telemóvel do tamanho do alvo (402) não nota nada, e no
  // monitor a app fica com a forma para que foi desenhada e medida. Faz-se com
  // maxWidth e margens automáticas na PRÓPRIA raiz, sem envolver nada: a raiz
  // é a coluna flex do INVARIANTE #1 e um <View> a mais em volta dela é
  // exactamente o erro #1 da lista do CLAUDE.md.
  const LARGURA_MAX = LARGURA_APP;
  // ⚠ INVARIANTE — ver CLAUDE.md
  // Cabeçalho e rodapé aparecem em TODAS as janelas. A raiz é uma coluna flex
  // com três filhos e a condição do rodapé não leva nada além de "estar na app":
  //   header  flex: none
  //   scroll  flex: 1, minHeight: 0
  //   footer  flex: none   ← último filho da raiz, sempre
  // Se um ecrã precisar de mais espaço, encolhe o conteúdo, não o rodapé.
  return (
    <View style={{ flex: 1, backgroundColor: t.page,
      width: '100%', maxWidth: LARGURA_MAX, marginHorizontal: 'auto' }}>
      <StatusBar barStyle="light-content" />

      {/* cabeçalho — minHeight garante que nunca colapsa (INVARIANTE #1)
          `flex: 0` NÃO serve aqui: o react-native-web traduz isso para
          `0 1 0%`, ou seja base zero e encolhível, e a caixa fica com a altura
          do minHeight seja qual for o conteúdo. Com os três números do Início
          isso cortava 44 px em silêncio, porque há `overflow: hidden`.
          flexGrow 0 + flexShrink 0 + basis auto é o que se quer dizer. */}
      <View style={{
        flexGrow: 0, flexShrink: 0, flexBasis: 'auto',
        minHeight: 80, backgroundColor: t.chrome, overflow: 'hidden',
        paddingTop: insets.top + 10, paddingBottom: 24, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12, ...elev(3),
      }}>
        {/* A marca da casa, com as suas cores.

            ⚠ A borda direita fica em `right: 16` — a MESMA vertical onde acaba
            o botão «Tarefas» do Início, que é o enchimento do conteúdo. Estava
            em `right: -24`, ou seja 24 px por fora da coluna: o `overflow:
            hidden` do cabeçalho recortava-a e ninguém via que faltava um
            pedaço.

            Deixa de ser `mono`: os quatro pontos ganham as cores da marca. E a
            opacidade sobe de 0,10 para 0,22, senão as cores não se lêem sobre
            o cabeçalho e «a cores» não passa de uma intenção.

            ⚠ 72 e não 120, porque tem de CABER em todos os cabeçalhos.

            Medido, com a marca a 120 e o topo em insets.top + 4:

              Início     cabeçalho 140   cabia, com 16 de folga
              Compras    cabeçalho  90   transbordava 34
              Dinheiro   cabeçalho  80   transbordava 44
              Tarefas    cabeçalho  80   transbordava 44
              Agenda     cabeçalho  80   transbordava 44

            O recorte do cabeçalho escondia o transbordo, e por isso ninguém
            via que em quatro dos cinco ecrãs faltava um terço da marca.
            4 + 72 = 76, e o cabeçalho mais curto tem 80.

            Um tamanho SÓ para os cinco: o mesmo topo, a mesma borda direita e
            o mesmo tamanho. Uma marca que muda de medida ao mudar de
            separador é o mesmo defeito que o avatar tinha. */}
        <Marca size={72} opacity={0.22}
          // ⚠ `right: 68`, à ESQUERDA do avatar (40 de largura a `right: 16`,
          // mais 12 de intervalo), e não por trás dele. Estava a `right: 16`,
          // na mesma vertical do avatar, e os dois sobrepunham-se em todos os
          // ecrãs — a única sobreposição da interface (revisão de 14/09/2026).
          style={{ position: 'absolute', top: insets.top + 4, right: 68 }} />

        {V ? (
          // Vista de ecrã inteiro: o cabeçalho passa a ser o dela.
          <>
            {/* ⚠ Sem o `marginLeft: -10` que aqui estava.

                Ele puxava o alvo de 44 para FORA do enchimento do cabeçalho:
                medido, a seta ficava a 6 px da borda da app quando o conteúdo
                e o avatar do lado direito estão os dois a 16. Dez pixels de
                diferença num ícone encostado ao canto lêem-se como um ícone
                que saiu dos limites — e era o que se via.

                O avatar do outro lado nunca usou o truque. Agora os dois
                alinham pela CAIXA, e o cabeçalho fica simétrico. */}
            <Pressable onPress={V.fechar} accessibilityRole="button" accessibilityLabel="Voltar"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="arrowLeft" size={24} color="#FFFFFF" />
            </Pressable>
            <Icon name={V.icon} size={26} color="#FFFFFF" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: 20,
                fontWeight: '500', color: '#FFFFFF', letterSpacing: 0.25 }}>{V.titulo}</Text>
              <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 12, color: onC }}>
                {V.sub()}
              </Text>
            </View>
          </>
        ) : isHome ? (
          // Início: saudação, data, e os três números — dentro do cabeçalho,
          // como em docs/referencia/04-inicio.png. Estavam no conteúdo, numa
          // linha de texto, e a saudação aparecia duas vezes.
          <View style={{ flex: 1, gap: 14 }}>
            {pesquisa !== null ? (
              // A pesquisa aberta: o campo toma o lugar da saudação, no próprio
              // cabeçalho (opção A de design/pesquisa-global.dc.html), e os três
              // números saem enquanto se procura. «×» devolve o Início.
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                {/* Sem caixa (opção C, 13/09/2026): o texto escreve-se a branco
                    no próprio cabeçalho, com uma linha de 2 px por baixo que
                    acende com o foco. `outlineStyle: 'none'` tira o anel do
                    navegador — saía laranja no Chrome do Windows, a cor do
                    acento do sistema, e não do esquema da casa. */}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 44,
                  paddingHorizontal: 2, borderBottomWidth: 2,
                  borderBottomColor: pesquisaFocada ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }}>
                  <Icon name="search" size={18} color="#FFFFFF" />
                  <TextInput autoFocus value={pesquisa} onChangeText={setPesquisa}
                    onFocus={() => setPesquisaFocada(true)} onBlur={() => setPesquisaFocada(false)}
                    placeholder="Procurar na casa" placeholderTextColor={onC}
                    accessibilityLabel="Procurar na casa" returnKeyType="search"
                    autoCorrect={false}
                    style={{ flex: 1, minHeight: 44, fontFamily: FONT.body, fontSize: 16, color: '#FFFFFF', outlineStyle: 'none' }} />
                </View>
                <Tap onPress={() => setPesquisa(null)} label="Fechar a pesquisa">
                  <Icon name="close" size={24} color="#FFFFFF" />
                </Tap>
              </View>
            ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* O avatar junto ao nome, e é ELE que abre o Perfil.

                  ⚠ Só ele. O bloco do nome e da data não é tocável: uma linha,
                  um destino (erro #6 da lista do CLAUDE.md). Fazer o bloco
                  inteiro abrir o Perfil dava um alvo maior e tirava a
                  possibilidade de o nome ser algum dia outra coisa.

                  A bola passa de 36 para 44 e o alvo deixa de ser maior do que
                  ela: eram 44 de alvo à volta de 36 de desenho, e agora são os
                  mesmos 44 — o mínimo do INVARIANTE #5 é a própria bola. */}
              <Tap onPress={() => setPerfil(true)} label="Perfil e ajustes" size={44}>
                <AvatarDeCabecalho t={t} nome={user} membro={euNaCasa} size={44} />
              </Tap>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: '600',
                  color: '#FFFFFF', letterSpacing: 0.3 }}>{greet}, {user}</Text>
                <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: onC }}>{today}</Text>
              </View>
              {/* Terminar sessão passa a viver aqui, onde o avatar estava.
                  Existia só dentro da folha do Perfil — dois toques para sair
                  de uma app familiar partilhada, que é o gesto de quem passa o
                  telemóvel a outra pessoa. */}
              {/* ⚠ `alignItems: 'flex-end'` e não uma margem. O alvo do `Tap`
                  tem 44 e a borda direita dele já está nos mesmos 396 onde
                  acabam os cartões do conteúdo — o que estava desalinhado era
                  o ÍCONE, centrado dentro do alvo e portanto 9 px por dentro
                  (medido: cartões 396, ícone 387). Encostá-lo à direita alinha
                  o desenho sem mexer no alvo nem na margem de 16: os 44 do
                  INVARIANTE #5 ficam intactos. Empurrar o alvo para a direita
                  alinhava também, e comia a margem. */}
              <Tap onPress={() => setSignOut(true)} label="Terminar sessão"
                style={{ alignItems: 'flex-end' }}>
                {/* Branco, como os outros ícones deste cabeçalho.

                    Estava em `onC` (branco a 0,68) e ficava por cima do
                    telhado da marca: medido, 3,03 contra os 3 que um elemento
                    gráfico exige — passava com 0,03 de margem, que é o mesmo
                    que não passar no dia em que a opacidade da marca mude.
                    A branco dá 4,58. */}
                {/* 30. Estava a 22 e lia-se pequeno ao lado do avatar de 44;
                    passou por 26 — a medida do ícone do ecrã nos outros
                    cabeçalhos, linha 563 — e ficou nos 30 por decisão do dono
                    da casa. O alvo continua a ser os 44 do `Tap`, portanto
                    isto é desenho e não toque: o INVARIANTE #5 não se mexe. */}
                <Icon name="logout" size={30} color="#FFFFFF" />
              </Tap>
            </View>
            )}

            {/* Os três números abrem o ecrã de onde vêm. Estavam a ser texto:
                o número das tarefas de hoje é a resposta curta, e o sítio onde
                se faz alguma coisa com ela é o ecrã das Tarefas. Tocar num
                número e não acontecer nada é o mesmo defeito da lupa aqui ao
                lado — a diferença é que este tem destino óbvio. */}
            {pesquisa !== null ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
              {[['Disponível', EUR(remaining), 'dinheiro'],
                ['Tarefas hoje', String(tarefasHoje), 'tarefas'],
                ['Eventos', String(eventosHoje), 'agenda']].map(([rot, val, destino], i) => (
                <View key={rot} style={{ flex: 1, flexDirection: 'row' }}>
                  {/* O separador segue a luminância do cabeçalho, como o
                      subtítulo. Um alfa fixo desaparecia nos esquemas claros —
                      é o erro nº 4 da lista do CLAUDE.md. */}
                  {i > 0 ? <View style={{ width: 1, backgroundColor: chromeLine(t.chrome),
                    marginRight: 14 }} /> : null}
                  <Pressable onPress={() => setTab(destino)}
                    accessibilityRole="button" accessibilityLabel={`${rot}: ${val}`}
                    style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center',
                      gap: 3, opacity: pressed ? 0.6 : 1 })}>
                    {/* Voltou ao `onC`.

                        Cheguei a pô-lo em branco a 0,95 porque a marca a 120
                        passava por trás desta faixa e o contraste caía a
                        3,16 — abaixo dos 4,5 que 11 px exigem. Encolher a
                        marca para 72 tirou-lhe os pontos de cima daqui: eles
                        acabam em y 67 e este rótulo começa em 74.

                        Com o defeito resolvido na causa, o remédio sai. Ficar
                        com os dois achatava a hierarquia do cabeçalho à troca
                        de nada. */}
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: onC }}>{rot}</Text>
                    <Text style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: '500',
                      color: '#FFFFFF' }}>{val}</Text>
                  </Pressable>
                </View>
              ))}
              {/* A lupa da referência, finalmente com destino (13/09/2026): a
                  pesquisa global. Esteve por fazer enquanto não havia pesquisa —
                  um controlo que parece tocável e não faz nada era o defeito que
                  se tirou do Perfil e do Dinheiro. Vive no fim desta linha, por
                  baixo do «terminar sessão», por decisão do dono da casa: os
                  dois ícones do cabeçalho alinham à direita, um em cada linha. */}
              <Tap onPress={() => setPesquisa('')} label="Procurar na casa"
                style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                <Icon name="search" size={26} color="#FFFFFF" />
              </Tap>
            </View>
            )}
          </View>
        ) : (
          // Header fixo para outros ecrãs
          <>
            <Icon name={meta.icon} size={26} color="#FFFFFF" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: '500',
                color: '#FFFFFF', letterSpacing: 0.25 }}>{meta.title}</Text>
              <Text numberOfLines={2} style={{ fontFamily: FONT.ui, fontSize: 12, color: onC }}>{meta.sub(ctxSub)}</Text>
            </View>
          </>
        )}

        {/* Nos OUTROS cabeçalhos o avatar continua à direita.

            No Início ele foi para junto do nome; aqui a esquerda já é da seta
            de voltar e do ícone do ecrã, e enfiar o avatar entre eles daria
            três coisas antes do título. O alvo tem 44 e a bola 36, que é o
            desenho da referência 04. */}
        {/* ⚠ `isHome && !V`, e não `isHome`. Com uma vista de ecrã inteiro
            aberta por cima do Início — a Gestão, a Saúde, o Modo Compras — o
            cabeçalho é o da vista, e o avatar junto ao nome já não se desenha;
            escondê-lo também aqui deixava o mesmo ecrã com avatar quando se
            vinha das Tarefas e sem ele quando se vinha do Início, e sem
            nenhum caminho para o Perfil (medido em 09/09/2026). */}
        {isHome && !V ? null : (
          <Tap onPress={() => setPerfil(true)} label="Perfil e ajustes" size={44}>
            {/* 44, o MESMO do Início. Eram 36 aqui e 44 lá: o avatar mudava de
                tamanho ao mudar de ecrã, e a bola da mesma pessoa não tem duas
                medidas. */}
            <AvatarDeCabecalho t={t} nome={user} membro={euNaCasa} size={44} />
          </Tap>
        )}
      </View>

      {/* área de scroll — o mesmo sítio para os separadores e para as vistas
          de ecrã inteiro. Antes as vistas eram um cartão centrado com véu por
          cima disto, e o cabeçalho ficava cortado a meio por trás. */}
      <View style={{ flex: 1, minHeight: 0 }}>
        {/* A marca de água — PRIMEIRO filho, absoluta, atrás do scroll e das
            vistas de ecrã inteiro; não conta para a coluna flex. */}
        <MarcaDeAgua t={t} />
        {/* ⚠ Uma vista com `coluna` é dona do seu scroll: desenha-se AQUI, em
            vez do ScrollView, e é ela que decide o que fica fixo e o que rola.
            É o Modo Compras, com os corredores parados por cima da lista. As
            outras continuam a ser filhas do ScrollView único. */}
        {V && V.coluna ? V.render() : (
        <ScrollView ref={scrollRef} style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ padding: 16, gap: S.xl, paddingBottom: S.xl }}>
        <AcaoDoEcra.Provider value={setAcaoDoEcra}>
          {V ? V.render()
            : tab === 'inicio' && pesquisa !== null
              ? <Resultados t={t} termo={pesquisa} itens={indice}
                  onAbrir={irParaResultado} onSugerir={(p) => setPesquisa(p)} />
            : tab === 'inicio'
              ? <Inicio t={t} user={user} go={setTab}
                  onSaude={() => setSaude(true)}
                  onEquip={(id) => setEquip(id || true)}
                  onFicha={(membro) => setFicha(membro)}
                  // Ir a um separador COM uma coisa em mão. Sem isto, tocar num
                  // evento do Início levava à Agenda e obrigava a procurá-lo
                  // outra vez — a app já sabia qual era.
                  onAbrir={(tabAlvo, id) => { setAbrirNoTab({ tab: tabAlvo, id }); setTab(tabAlvo); }}
                  agendaPorLigar={servidor.google.porLigar()}
                  onLigarAgenda={ligarAgenda} />
              : <Screen t={t} user={user} go={setTab} onEquip={() => setEquip(true)}
                  onModoCompras={() => setLoja(true)}
                  onIda={() => setIda(true)}
                  abrir={abrirNoTab && abrirNoTab.tab === tab ? abrirNoTab.id : null}
                  abrirImportar={tab === 'agenda' && importarNaAgenda}
                  onImportarAberto={() => setImportarNaAgenda(false)} />}
        </AcaoDoEcra.Provider>
        </ScrollView>
        )}
      </View>

      {/* ── A ação do ecrã, fixa ────────────────────────────────────────────
          15/09/2026: «move o botão para o fundo e assim aproveita-se mais o
          ecrã». O «acrescentar» de cada ecrã vive aqui, entre o que rola e o
          rodapé — nunca por cima do rodapé, que continua a ser o último filho
          da raiz (INVARIANTE #1). Numa lista longa deixa de ser preciso rolar
          até ao fim para acrescentar; numa curta deixa de ficar a meio de um
          ecrã vazio. */}
      {acaoDoEcra ? (
        <View style={{
          flexGrow: 0, flexShrink: 0, flexBasis: 'auto',
          paddingHorizontal: 16, paddingTop: S.md, paddingBottom: S.md,
          backgroundColor: t.page, borderTopWidth: 1, borderTopColor: t.divider,
        }}>
          {acaoDoEcra}
        </View>
      ) : null}

      {/* rodapé — último filho da raiz, sempre (INVARIANTE #1) */}
      <View style={{
        flexGrow: 0, flexShrink: 0, flexBasis: 'auto',
        minHeight: 60, backgroundColor: t.chrome, flexDirection: 'row',
        paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 4,
        zIndex: 100,
      }}>
        {TABS.map(x => {
          // ⚠ Com uma VISTA DE ECRÃ INTEIRO aberta — a Saúde, os Equipamentos,
          // a Gestão, a Documentação, a ficha, a loja — nenhum separador está
          // aceso (16/09/2026). O `on` era só `tab === x.key`, e o `tab` não
          // muda quando uma dessas vistas abre por cima: o rodapé continuava a
          // acender o separador de onde se tinha vindo.
          //
          // Medido no navegador: com a Saúde aberta o rodapé dizia «Agenda»;
          // com a Gestão e com os Equipamentos dizia «Início». E não era só a
          // tinta — o `aria-selected` ia a `true`, portanto um leitor de ecrã
          // anunciava o sítio errado.
          //
          // O guarda `alvos-e-navegacao` já tratava da outra metade deste mesmo
          // defeito (tocar num separador fecha as vistas); faltava esta.
          const on = !vistaAberta && tab === x.key;
          return (
            <Pressable key={x.key} onPress={() => { setAbrirNoTab(null); setPesquisa(null); fecharVistas(); setTab(x.key); }}
              accessibilityRole="tab" accessibilityLabel={x.label}
              accessibilityState={{ selected: on }} aria-selected={on}
              style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Icon name={x.icon} size={22} color={on ? '#FFFFFF' : onC} />
              <Text style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: '600',
                color: on ? '#FFFFFF' : onC }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Perfil sheet */}
      {/* Terminar sessão pede confirmação — é uma ação que não se desfaz
          com um toque, e o perfil fica visível por trás para dar contexto. */}
      {/* ⚠ Cada entrada do Perfil FECHA as outras vistas antes de abrir a sua.

          É o mesmo defeito do rodapé, visto de outra porta: com a ficha de
          saúde aberta, tocar em «Gestão da Casa» punha o `gestao` a verdadeiro
          e ficava tudo na mesma — a `ficha` vem primeiro no `vistaAberta` e
          continuava a ganhar. Medido no navegador: o cabeçalho continuava a
          dizer «A minha ficha».

          Uma escolha do Perfil leva sempre ao que se escolheu. */}
      {perfil ? <Perfil t={t} user={user} onClose={() => setPerfil(false)}
        onSignOut={() => setSignOut(true)}
        onSaude={() => { fecharVistas(); setSaude(true); }}
        onDoc={() => { fecharVistas(); setDoc(true); }}
        onGestao={() => { fecharVistas(); setGestao(true); }} /> : null}

      {boasVindas ? (
        <Sheet t={t} title={`A casa ${boasVindas.casa} está pronta`}
          sub="Guarde os PIN das crianças: não voltam a aparecer"
          onClose={() => setBoasVindas(null)}
          action={<Primary t={t} comum label="Já anotei" onPress={() => setBoasVindas(null)} />}>
          <View style={{ gap: S.md, paddingBottom: S.lg }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 21, color: t.text2 }}>
              É administrador(a) desta casa. Pode acrescentar mais gente, e mudar o PIN de cada criança, em Gestão da Casa.
            </Text>
            {Object.keys(boasVindas.pins).map((n) => (
              <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                minHeight: 48, paddingHorizontal: 14, borderRadius: R.row, backgroundColor: t.subtle }}>
                <Text style={{ fontFamily: FONT.body, fontSize: 16, color: t.text1 }}>{n}</Text>
                <Text selectable accessibilityLabel={`PIN de ${n}`} style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: '700', letterSpacing: 3, color: t.text1 }}>
                  {boasVindas.pins[n]}
                </Text>
              </View>
            ))}
            {boasVindas.erros.length ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: t.state.errTexto }}>
                  Não foi possível acrescentar:
                </Text>
                {boasVindas.erros.map((e) => (
                  <Text key={e} style={{ fontFamily: FONT.ui, fontSize: 13, color: t.state.errTexto }}>{e}</Text>
                ))}
                <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: t.text3 }}>Tente outra vez em Gestão da Casa.</Text>
              </View>
            ) : null}
          </View>
        </Sheet>
      ) : null}

      {signOut ? (
        <Confirm t={t} destructive icon="warning"
          title="Terminar sessão?"
          message="Volta ao ecrã de entrada. Os dados da casa ficam guardados neste dispositivo."
          confirmLabel="Terminar sessão"
          onCancel={() => setSignOut(false)}
          onConfirm={() => { setSignOut(false); setPerfil(false); setUser(null); }} />
      ) : null}

      {/* Apagados na agenda da Google — pergunta antes, e diz quais.

          O apagar tinha um sentido só: apagado aqui, apagado lá. Ao
          contrário não acontecia nada, e um evento apagado na Google ficava
          nesta casa a apitar à hora de uma coisa que já não existe.

          Pergunta-se, e diz-se QUAIS: apagar sozinho o que outra pessoa
          apagou noutro sítio é decidir por ela. */}
      {saidosDaGoogle.length ? (
        <Confirm t={t}
          icon="calendar"
          title={saidosDaGoogle.length === 1
            ? 'Um evento saiu da agenda da Google'
            : `${saidosDaGoogle.length} eventos saíram da agenda da Google`}
          message={
            (saidosDaGoogle.length === 1
              ? 'Já não está na agenda da Google, e continua nesta casa:\n\n'
              : 'Já não estão na agenda da Google, e continuam nesta casa:\n\n')
            + saidosDaGoogle.slice(0, 6).map(e => `· ${e.title} — ${dayLabel(e.day)}`).join('\n')
            + (saidosDaGoogle.length > 6 ? `\n· e mais ${saidosDaGoogle.length - 6}` : '')
            + '\n\nApagar também aqui? Escolhendo Manter, ficam na Nossa Casa e '
            + 'não se volta a perguntar por eles.'}
          confirmLabel={saidosDaGoogle.length === 1 ? 'Apagar aqui também' : 'Apagar todos aqui'}
          cancelLabel="Manter"
          destructive
          onConfirm={() => {
            // Só na app: na Google já não existem. Pedir a apagar outra vez
            // devolveria 410 — que o `apagarEvento` trata como sucesso, mas
            // é uma viagem à rede para nada.
            saidosDaGoogle.forEach(e => removerEvento(e.id));
            setSaidosDaGoogle([]);
          }}
          onCancel={() => {
            // «Manter» tem de ficar REGISTADO, senão a pergunta volta à
            // entrada seguinte, e à seguinte — e uma pergunta que se repete
            // ensina a responder sem ler.
            //
            // Corta-se a ligação (`idGoogle: null`), que é o que ela passou
            // a ser: o evento do lado de lá não existe, e nada há para
            // editar ou apagar lá. O evento fica na casa, como se tivesse
            // sido criado aqui.
            set(x => ({
              eventEdits: {
                ...x.eventEdits,
                ...Object.fromEntries(saidosDaGoogle.map(e => [e.id,
                  { ...(x.eventEdits[e.id] || {}), idGoogle: null }])),
              },
            }));
            setSaidosDaGoogle([]);
          }} />
      ) : null}
      {/* Google Calendar Import Modal */}
      {googleImport && user && euNaCasa && !euNaCasa.kid && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 24, paddingTop: 24, paddingBottom: 90 }}>
          {/* ⚠ Sem `user` nem `onClose` (25/09/2026): o modal lê `t`, `events`,
              `onImportar` e `onIgnore`, e mais nada. Quem o dispensa é o «Agora
              não», que é o `onIgnore` — o `onClose` prometia um X que não
              existe, e o `user` já vai dentro do `onImportar`. */}
          <GoogleCalendarImportModal
            t={t}
            events={eventosGoogle}
            onImportar={(events, visibilidade) => {
              importGoogleEvents(events, user, visibilidade);
              setGoogleImport(false);
            }}
            onIgnore={() => {
              // Marca os que estão à frente, não três identificadores escritos
              // à mão: com eventos reais da agenda, `gcal-1..3` não existem e
              // o «Agora não» deixava de ter efeito — o ecrã voltaria a abrir.
              set(x => ({
                googleCalendarImported: {
                  ...x.googleCalendarImported,
                  ...Object.fromEntries(eventosGoogle.map(e => [e.id, true])),
                },
              }));
              setGoogleImport(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider><Shell /></StoreProvider>
    </SafeAreaProvider>
  );
}
