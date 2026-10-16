import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S, R, FONT, elev, corDoMembro, chromeDaCrianca, LARGURA_APP, buildTheme } from '../theme';

// O cinzento do texto pequeno sobre os cartões brancos da entrada. Era
// #6A7282: 4,17 sobre o cartão a 95 % de branco — abaixo dos 4,5 que 12 px
// pedem. É o `text3` do aspeto claro, medido a 4,54 (09/09/2026). Literal
// porque a entrada é sempre a mesma nos dois aspetos: o `t` que aqui chega
// pode ser o escuro, e o `text3` escuro é claro demais para um cartão branco.
// As cores do ecrã de entrada vêm do TEMA (revisão de 14/09/2026): o cartão é
// claro sobre a fotografia, e os avisos são os do aspeto escuro — eram cinco
// cores escritas à mão, uma delas um pêssego que a app não tem.
const CLARO = buildTheme(0, false);
const ESCURO = buildTheme(0, true);
const CINZA_DO_CARTAO = CLARO.text3;
import Icon, { Marca, GoogleG as G } from '../Icon';
import { plural } from '../format';
import { FEM } from '../data';
import { useStore } from '../store';
import * as sync from '../sync';
import * as servidor from '../pocketbase';
import { Pill } from '../ui';
import CriarCasa from '../CriarCasa';

export default function Login({ t, onEnter, erroInicial = null }) {
  const { s, entrarCrianca, temPin, membros: MEMBERS, nomeDaCasa, criancas, adultos } = useStore();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(erroInicial ? 'contas' : 'login');   // login | criar | contas | criancas | pin
  const [kid, setKid] = useState(null);
  const [pin, setPin] = useState('');
  const [tries, setTries] = useState(0);
  const [blocked, setBlocked] = useState(0);
  // ⚠ Começa com o `erroInicial`: quando a volta da Google falha, a app
  // aterra aqui e a razão vem de lá — a troca do código acontece no arranque,
  // não neste ecrã. E começa-se no passo das CONTAS, porque quem acabou de
  // falhar a entrada pela Google precisa do caminho local à vista.
  const [erroGoogle, setErroGoogle] = useState(erroInicial);
  // A razão crua, por baixo da frase. É o que uma captura tem de trazer
  // para se saber o que correu mal sem adivinhar.
  const [detalheDoErro, setDetalheDoErro] = useState(null);
  // ⚠ `aAbrirGoogle` e não `aEntrar`: esse já existe neste ecrã e quer dizer
  // «a criança está a submeter o PIN». Dois estados com o mesmo nome punham o
  // botão da Google desactivado enquanto uma criança escreve o PIN, e ao
  // contrário — duas coisas diferentes com um nome só é como começam os
  // defeitos que ninguém consegue ler.
  const [aAbrirGoogle, setAAbrirGoogle] = useState(false);
  const relogioDoSilencio = useRef(null);
  const pararOSilencio = () => {
    if (relogioDoSilencio.current) clearTimeout(relogioDoSilencio.current);
    relogioDoSilencio.current = null;
    setAAbrirGoogle(false);
  };
  // ⚠ E pára-se ao sair do ecrã: um relógio que dispara depois de a app
  // entrar punha uma mensagem de erro por cima de uma casa aberta.
  useEffect(() => () => {
    if (relogioDoSilencio.current) clearTimeout(relogioDoSilencio.current);
  }, []);
  const [aEntrar, setAEntrar] = useState(false);
  const [erroPin, setErroPin] = useState(null);

  const glass = {
    backgroundColor: 'rgba(0,21,41,0.55)', borderRadius: R.card,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 30, gap: S.lg,
  };

  // ⚠ A criança entra no SERVIDOR (09/09/2026). Era `verificarPin` — um
  // resumo comparado no dispositivo, que é «um PIN que está no dispositivo»
  // (docs/seguranca.html §3). Sem servidor continua a ser o resumo, e é a
  // loja que decide qual dos dois; este ecrã só pergunta.
  const submitPin = async (p) => {
    if (blocked > Date.now() || aEntrar) return;
    setAEntrar(true);
    const r = await entrarCrianca(kid, p);
    setAEntrar(false);
    if (r.ok) { setTries(0); setErroPin(null); onEnter(kid); return; }
    setPin('');
    // O servidor em baixo não é um PIN errado: diz-se, e não gasta tentativa.
    if (r.erro) { setErroPin(r.erro); return; }
    setErroPin(null);
    const n = tries + 1;
    setTries(n);
    if (n >= 5) { setBlocked(Date.now() + 60000); setTries(0); }
  };

  // Com a tecla OK, o PIN só é submetido quando a criança o diz. Submetia-se
  // sozinho ao quarto dígito: um engano no último algarismo gastava uma
  // tentativa das cinco sem hipótese de o corrigir.
  // Entrar com a Google a sério quando há servidor; a lista de contas fixa é
  // o caminho local, para a app continuar a correr sem rede nem credenciais.
  //
  // Os scopes da agenda pedem-se AQUI: o token traz as permissões dadas no
  // consentimento, não as que se queiram mais tarde.
  // O argumento é o rascunho de «Criar a minha casa»; o `onPress` do botão da
  // Google passa-lhe o evento, que não é um rascunho, e então é a entrada normal.
  const entrarComGoogle = async (arg) => {
    const novaCasa = arg && arg.nomeCasa ? arg : null;
    if (!sync.ligado()) {
      if (novaCasa) return setErroGoogle('Criar uma casa precisa de um servidor, e esta app está a correr sem ele.');
      return setStep('contas');
    }
    setErroGoogle(null);
    setDetalheDoErro(null);
    // ── UM CLIQUE TEM SEMPRE UMA CONSEQUÊNCIA ──────────────────────────
    //
    // ⚠ «Não acontece nada quando clico» foi dito TRÊS vezes, com três causas
    // diferentes: a janela que o navegador recusava em silêncio, a excepção do
    // `new URL` engolida por uma frase amigável, e o separador a correr código
    // antigo depois de eu mexer nos ficheiros. Para quem carrega, as três são
    // indistinguíveis — e essa é a doença, não os sintomas.
    //
    // A partir daqui o botão muda de estado à PRIMEIRA, e um relógio garante
    // que o silêncio se transforma em palavras. Uma causa que eu ainda não
    // conheça passa a dar uma frase em vez de nada.
    setAAbrirGoogle(true);
    if (relogioDoSilencio.current) clearTimeout(relogioDoSilencio.current);
    relogioDoSilencio.current = setTimeout(() => {
      setAAbrirGoogle(false);
      setErroGoogle('Nada aconteceu ao entrar pela Google. Não é a sua conta.');
      setDetalheDoErro('Tente: recarregar a página (Ctrl+Shift+R), e ver se o '
        + 'navegador bloqueou a janela — o ícone na barra de endereço. '
        + 'A lista de contas desta casa fica aqui em baixo.');
      setStep('contas');
    }, 6000);
    try {
      // ── SEM JANELA ─────────────────────────────────────────
      //
      // A página inteira vai à Google e volta. Nenhum bloqueador tem o que
      // travar, e não é preciso permitir janelas em cada máquina nova.
      //
      // ⚠ Isto só é o caminho principal desde 18/09/2026, às 20h27, porque o
      // `http://localhost:8082/` passou a estar nos «URIs de redireccionamento
      // autorizados» da consola da Google — a par do
      // `127.0.0.1:8095/api/oauth2-redirect` e do `.../api/agenda/retorno`, que
      // já lá estavam. Sem esse registo, a Google recusa a volta com
      // `redirect_uri_mismatch` e a pessoa fica numa página de erro dela, sem
      // caminho: foi o que aconteceu quando pôs isto à frente antes do registo.
      //
      // Um endereço novo (a casa exposta noutro domínio, outra porta de
      // desenvolvimento) precisa do mesmo registo. É o único passo fora do
      // código, e está dito no `enderecoDeRetorno`.
      //
      // O `comecarEntradaGoogle` navega e não volta; o que se segue acontece no
      // arranque da app, no `concluirEntradaGoogle`. Devolve `false` fora do
      // navegador — e aí segue-se pela JANELA, que é o caminho do telemóvel e
      // continua a ser a reserva de quem não puder navegar.
      //
      // A agenda NÃO se pede aqui: o consentimento que aparecia não produzia
      // autorização de longa duração, porque o PocketBase não pede
      // `access_type=offline` à Google. Liga-se no ecrã de agendar, uma vez só.
      // ⚠ O relógio NÃO se pára aqui quando isto devolve `true`: a página
      // está a navegar para a Google e vai desaparecer com ele. Se a
      // navegação falhar por alguma razão, o relógio dispara e diz.
      servidor.auth.prepararNovaCasa(novaCasa);
      if (await servidor.auth.comecarEntradaGoogle()) return;
      const r = await servidor.auth.entrarComGoogle();
      pararOSilencio();
      onEnter(r.record.nome);
    } catch (e) {
      // Falhar a entrada pela Google não pode fechar a porta: sem provedor
      // configurado no servidor, isto deixava a app inacessível assim que
      // houvesse um URL de servidor definido. Diz-se a razão E abre-se a
      // lista local, que é a que funciona sem credenciais nenhumas.
      //
      // A mensagem é nossa, não a do SDK: o PocketBase responde «Something
      // went wrong», em inglês, e isso não entra num ecrã desta app.
      //
      // E a razão PERGUNTA-SE ao servidor, não se adivinha pela frase do erro.
      // O teste era `/oauth|provider|missing/`, e «Failed to fetch OAuth2
      // user» tem lá «OAuth»: com tudo configurado, o ecrã afirmava que a
      // Google não estava configurada. Mandou-nos à consola da Google duas
      // vezes à procura de um problema que estava aqui.
      pararOSilencio();
      const p = await servidor.auth.provedores();
      const cancelado = /cancel|closed|aborted/i.test(e.message || '');
      // ⚠ A RAZÃO CRUA NÃO SE DEITA FORA (18/09/2026).
      //
      // Estas cinco frases são boas para quem quer entrar e más para quem tem
      // de descobrir porquê: a mensagem do SDK — a única que diz o que a Google
      // ou o servidor responderam mesmo — era trocada por uma delas e perdia-se.
      // Passei uma tarde a adivinhar entre «o servidor não responde» e «a janela
      // foi bloqueada», com o servidor bom e a janela permitida.
      //
      // Vai para a consola inteira, e para o ecrã em letra pequena por baixo da
      // frase. Uma captura passa a bastar.
      const cru = (e && (e.message || String(e))) || 'sem mensagem';
      if (typeof console !== 'undefined') {
        console.error('[entrada] falhou:', e);
        console.error('[entrada] estado do servidor:', p);
      }
      // ⚠ A janela recusada pelo navegador é uma causa à PARTE, e a primeira
      // a testar: não houve pedido nenhum ao servidor, e dizer «o servidor não
      // responde» sobre um bloqueador de janelas manda a pessoa reiniciar um
      // servidor que está bom. Foi o que aconteceu em 18/09/2026.
      const bloqueada = /bloqueou a janela/i.test(e.message || '');
      setErroGoogle(
        // Cinco causas, e nenhuma se deduz da frase do erro. O «não responde»
        // era dito como «não está configurada», e mandou-nos à consola da
        // Google procurar um problema que era o servidor estar desligado.
        bloqueada
          ? 'O navegador bloqueou a janela da Google. Permita janelas para este '
            + 'endereço e tente outra vez. Não é o servidor nem a conta.'
        : p.semServidor
          ? 'Esta app está a correr sem servidor. A abrir as contas desta casa.'
        : !p.alcancavel
          ? 'O servidor da casa não está a responder. Não é a Google: quando ele '
            + 'voltar, a entrada volta com ele. A abrir as contas desta casa.'
        : !p.lista.includes('google')
          ? 'A entrada pela Google ainda não está configurada neste servidor. A abrir as contas desta casa.'
        : cancelado
          ? 'Entrada cancelada. A abrir as contas desta casa.'
          : 'A Google autorizou, mas o servidor não conseguiu concluir a entrada. '
            + 'A abrir as contas desta casa.');
      setDetalheDoErro(cru);
      // Quem estava a criar uma casa fica no formulário, com a razão: mandá-la
      // para a lista de contas era mandá-la para uma casa que não é a dela.
      if (novaCasa) {
        setErroGoogle((m) => String(m).replace(' A abrir as contas desta casa.', ''));
        setStep('criar');
      } else {
        setStep('contas');
      }
    }
  };
  const criarCasa = (rascunho) => entrarComGoogle(rascunho);

  const press = (k) => {
    if (k === '←') return setPin(p => p.slice(0, -1));
    // 6 dígitos nos PIN novos; 4 continua a entrar para quem já tinha um antigo.
    if (k === 'OK') return pin.length >= 4 && submitPin(pin);
    if (pin.length >= 6) return;
    setPin(pin + k);
  };

  // ── A janela, e a coluna dentro dela ───────────────────────────────────────
  //
  // ⚠ Isto era um `ImageBackground` com `flex: 1` e mais nada, e tinha DOIS
  // defeitos que são o mesmo:
  //
  // 1. A fotografia mandava na disposição com o TAMANHO NATURAL dela. Medido
  //    no navegador: a camada da imagem a 1920×1280 dentro de uma janela de
  //    1400×800, e por isso a sobrar para fora dela por todos os lados menos
  //    um — «o fundo não cobre o fundo todo».
  //    Agora a fotografia é uma camada ABSOLUTA que preenche a raiz, e o
  //    `cover` tem uma caixa definida onde caber.
  //
  // 2. O conteúdo não tinha COLUNA. Medido: o painel do «Bem-vindo» ia de 16 a
  //    1384 numa janela de 1400. O resto da app vive numa coluna de
  //    `LARGURA_APP` centrada — o `App.jsx` fá-lo na própria raiz — e o Login
  //    é devolvido ANTES dela, portanto nunca a teve.
  //
  // A fotografia e a marca ficam de fora da coluna, a cobrir a janela: é o que
  // as referências mostram. O título entra NA coluna, com o painel — encostado
  // à borda da janela ficava a olhar para o vazio num monitor.
  return (
    <View style={{ flex: 1, width: '100%', backgroundColor: t.chrome }}>
      {/* ⚠ `width` e `height` a 100%, e não só o `inset: 0`. A
          react-native-web acrescenta ao estilo as dimensões INTRÍNSECAS do
          ficheiro que o `require` resolveu, e elas GANHAM ao preenchimento
          absoluto: com o `inset` sozinho saía `position: absolute; inset: 0px;
          height: 1280px; width: 1920px`. Os 100% substituem-nas, e o `inset`
          fica porque é ele que ancora. Depois: 412×915 e 1400×800, os dois
          exactos, `background-size: cover`, sem scroll horizontal.

          E ao medir isto no navegador, não meça o `<img>`: na
          react-native-web o `<img>` é a camada de acessibilidade e tem
          `opacity: 0`. O que se vê é um `div` irmão com `background-image` e
          `background-size`. O `object-fit` do `<img>` não quer dizer nada —
          diz `fill` mesmo quando está tudo bem, e enganou-me. */}
      <Image source={require('../../assets/login-bg.jpg')} resizeMode="cover"
        accessibilityIgnoresInvertColors
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          width: '100%', height: '100%' }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
      <Marca size={320} opacity={0.14} style={{ position: 'absolute', top: 100, alignSelf: 'center' }} />

      <View style={{ flex: 1, width: '100%', maxWidth: LARGURA_APP, marginHorizontal: 'auto' }}>
      <View style={{ position: 'absolute', top: insets.top + 30, left: 16, gap: 4 }}>
        <Text style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: '500', color: '#FFFFFF', letterSpacing: 0.25 }}>Nossa Casa</Text>
        <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>Família {nomeDaCasa} · agenda, tarefas e dinheiro</Text>
      </View>

      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 14) }}>
        {step === 'login' ? (
          <>
          <View style={glass}>
            <Text style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: '500', color: '#FFFFFF' }}>Bem-vindo</Text>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.8)' }}>
              {/* «acessar» é do Brasil — em Portugal é «aceder». O protótipo
                  tem o mesmo erro (docs/referencia/01-entrar.png), mas o
                  registo da língua é invariante do CLAUDE.md, não uma medida
                  de desenho onde o protótipo ganha. */}
              Entre com a sua Conta Google para aceder à casa partilhada.
            </Text>
            {/* ⚠ O botão MUDA À PRIMEIRA. «Não acontece nada quando clico» foi
                dito três vezes, com três causas diferentes, e em todas o botão
                ficou igual a si próprio enquanto nada acontecia. Um botão que
                não reage não deixa distinguir «está a trabalhar» de «partiu», e
                a pessoa carrega outra vez — o que, numa entrada por
                redireccionamento, começa tudo de novo e perde o primeiro pedido. */}
            <Pressable onPress={entrarComGoogle} disabled={aAbrirGoogle}
              accessibilityRole="button" accessibilityState={{ disabled: aAbrirGoogle, busy: aAbrirGoogle }}
              aria-disabled={aAbrirGoogle} aria-busy={aAbrirGoogle}
              accessibilityLabel={aAbrirGoogle ? 'A abrir a Google' : 'Continuar com Google'}
              style={({ pressed }) => ({ minHeight: 56, borderRadius: R.row,
                backgroundColor: pressed ? CLARO.subtle : '#FFFFFF',
                opacity: aAbrirGoogle ? 0.72 : 1,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, ...elev(3) })}>
              <G />
              <Text style={{ fontFamily: FONT.display, fontSize: 16, fontWeight: '700', color: CLARO.text1, letterSpacing: 0.4 }}>
                {aAbrirGoogle ? 'A abrir a Google…' : 'Continuar com Google'}
              </Text>
            </Pressable>
            {erroGoogle ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 19, color: ESCURO.state.errTexto }}>
                  {erroGoogle}
                </Text>
                {/* A razão crua, em letra pequena. Não é para se ler todos os
                    dias — é para uma captura bastar quando a entrada falha. */}
                {detalheDoErro ? (
                  <Text selectable style={{ fontFamily: FONT.ui, fontSize: 11, lineHeight: 16,
                    color: 'rgba(255,255,255,0.55)' }}>
                    {detalheDoErro}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 19, color: 'rgba(255,255,255,0.62)' }}>
              Ao continuar, a Nossa Casa recebe o seu nome e endereço de e-mail. Nenhum dado bancário é partilhado com a Google.
            </Text>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <Pressable onPress={() => { setErroGoogle(null); setDetalheDoErro(null); setStep('criar'); }}
              accessibilityRole="button" accessibilityLabel="Criar a minha casa"
              style={{ minHeight: 48, borderRadius: R.row, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Icon name="home" size={20} color="#FFFFFF" />
              <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '500', color: '#FFFFFF', letterSpacing: 0.4 }}>Criar a minha casa</Text>
            </Pressable>
            <Pressable onPress={() => setStep('criancas')} accessibilityRole="button" accessibilityLabel="Entrar como criança"
              style={{ minHeight: 48, borderRadius: R.row, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Icon name="smile" size={20} color="#FFFFFF" />
              <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '500', color: '#FFFFFF', letterSpacing: 0.4 }}>Entrar como criança</Text>
            </Pressable>
          </View>

          {/* A referência 01 tem esta linha por baixo do cartão, e faltava.
              É o que diz a alguém que abriu a app sem convite o que fazer a
              seguir — sem ela o ecrã é uma porta fechada sem indicação. */}
          <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 19,
            color: 'rgba(255,255,255,0.62)', paddingHorizontal: 4 }}>
            Ainda não faz parte de uma casa? Peça o convite ao administrador da família, ou crie a sua.
          </Text>
          </>
        ) : step === 'criar' ? (
          <CriarCasa glass={glass} onVoltar={() => { setErroGoogle(null); setDetalheDoErro(null); setStep('login'); }}
            onCriar={criarCasa} ocupado={aAbrirGoogle} erro={erroGoogle} />
        ) : step === 'contas' ? (
          <View style={glass}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <G size={20} />
              <Text style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: '500', color: '#FFFFFF' }}>Escolher uma conta</Text>
            </View>
            {/* O aviso aparece AQUI, que é onde se aterra quando a entrada
                pela Google falha. Estava só no ecrã anterior: era escrito e
                nunca visto. */}
            {erroGoogle ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 19, color: ESCURO.state.errTexto }}>
                  {erroGoogle}
                </Text>
                {/* A razão crua, em letra pequena. Não é para se ler todos os
                    dias — é para uma captura bastar quando a entrada falha. */}
                {detalheDoErro ? (
                  <Text selectable style={{ fontFamily: FONT.ui, fontSize: 11, lineHeight: 16,
                    color: 'rgba(255,255,255,0.55)' }}>
                    {detalheDoErro}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {adultos.map(n => (
              <Pressable key={n} onPress={() => onEnter(n)} accessibilityRole="button" accessibilityLabel={n}
                style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: R.row, padding: 14,
                  minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: R.pill, backgroundColor: t.chrome, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: '500', color: '#FFFFFF' }}>{MEMBERS[n].initial}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: FONT.body, fontSize: 16, color: CLARO.text1 }}>{n} {nomeDaCasa}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 12, color: CINZA_DO_CARTAO }}>{MEMBERS[n].email}</Text>
                </View>
                {/* Pastilha contornada, como na referência 02 — e com a
                    concordância certa: dizia «Administração» para a Rita. */}
                <Pill label={s.roles[n] === 'admin' ? (FEM(n) ? 'Administradora' : 'Administrador') : 'Adulto'}
                  fg={CINZA_DO_CARTAO} bg="transparent" border="#D6DBE4" />
              </Pressable>
            ))}
            {/* A referência 02 tem esta entrada: quem chega com outra conta
                não fica sem saída no ecrã das duas que já existem. */}
            <Pressable onPress={() => setStep('login')} accessibilityRole="button"
              accessibilityLabel="Usar outra conta Google"
              style={{ minHeight: 56, borderRadius: R.row, borderWidth: 1, borderStyle: 'dashed',
                borderColor: 'rgba(255,255,255,0.4)', flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 14, gap: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: R.pill, borderWidth: 1,
                borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.5)',
                alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={18} color="#FFFFFF" />
              </View>
              <Text style={{ fontFamily: FONT.body, fontSize: 15, color: '#FFFFFF' }}>
                Usar outra conta Google
              </Text>
            </Pressable>
            <Pressable onPress={() => setStep('login')} accessibilityRole="button" accessibilityLabel="Voltar"
              style={{ minHeight: 44, borderRadius: R.row, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>Voltar</Text>
            </Pressable>
          </View>
        ) : step === 'criancas' ? (
          <View style={glass}>
            <Text style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: '500', color: '#FFFFFF' }}>
              {criancas.length ? 'Quem está a entrar?' : 'Ainda não há crianças nesta casa'}
            </Text>
            {/* ⚠ A instrução seguia a lista, e a lista podia estar VAZIA.
                Numa casa sem crianças, este ecrã dizia «Escolha o seu nome e
                introduza o PIN» por cima de coisa nenhuma — mandava fazer o
                que não oferecia, e a única saída era o «Voltar».

                Não é um erro que rebente, e por isso nenhuma prova o via: é o
                ecrã a mentir com toda a calma. Apanhado a percorrer os ecrãs
                com a casa vazia, que é como ela está no primeiro dia de uma
                família — e é precisamente aí que este ecrã é mais visitado.

                O resto da app já faz isto: «Ainda não há nada nas fichas desta
                casa. Use Marcar Consulta para a primeira.» Diz o que falta, e
                quem o pode resolver. */}
            <Text style={{ fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.8)' }}>
              {criancas.length
                ? 'Escolha o seu nome e introduza o PIN de 6 dígitos.'
                : 'Um adulto acrescenta-as em Gestão da Casa, e dá a cada uma o seu PIN de 6 dígitos.'}
            </Text>
            {criancas.map(n => {
              const hasPin = temPin(n);
              return (
                <Pressable key={n} onPress={() => { if (hasPin) { setKid(n); setPin(''); setStep('pin'); } }}
                  disabled={!hasPin}
                  accessibilityRole="button" accessibilityLabel={n} accessibilityState={{ disabled: !hasPin }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: R.row, padding: 14,
                    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: hasPin ? 1 : 0.55 }}>
                  <View style={{ width: 40, height: 40, borderRadius: R.pill,
                    backgroundColor: chromeDaCrianca(corDoMembro(n, MEMBERS[n]?.cor)), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: '500', color: '#FFFFFF' }}>{MEMBERS[n].initial}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: FONT.body, fontSize: 16, color: CLARO.text1 }}>{n}</Text>
                    <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: CINZA_DO_CARTAO }}>
                      {hasPin ? 'Perfil de criança' : 'Ainda sem PIN — pedir a um adulto'}
                    </Text>
                  </View>
                  {hasPin ? <Icon name="caretRight" size={22} color={CINZA_DO_CARTAO} /> : null}
                </Pressable>
              );
            })}
            <Pressable onPress={() => setStep('login')} accessibilityRole="button" accessibilityLabel="Voltar"
              style={{ minHeight: 44, borderRadius: R.row, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>Voltar</Text>
            </Pressable>
          </View>
        ) : (
          <View style={glass}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: R.pill,
                backgroundColor: chromeDaCrianca(corDoMembro(kid, MEMBERS[kid]?.cor) || t.chrome),
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: '500', color: '#FFFFFF' }}>
                  {(MEMBERS[kid] || { initial: '?' }).initial}
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: '500', color: '#FFFFFF' }}>Olá, {kid}</Text>
                <Text style={{ fontFamily: FONT.ui, fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>PIN de 6 dígitos</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center' }}>
              {[0, 1, 2, 3, 4, 5].map(i => (
                <View key={i} style={{ width: 16, height: 16, borderRadius: R.pill, borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.6)', backgroundColor: pin.length > i ? '#FFFFFF' : 'transparent' }} />
              ))}
            </View>
            {blocked > Date.now() ? (
              <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: ESCURO.state.errTexto, textAlign: 'center' }}>
                Demasiadas tentativas. Tente dentro de um minuto.
              </Text>
            ) : tries > 0 ? (
              <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: ESCURO.state.errTexto, textAlign: 'center' }}>
                {/* ⚠ Pelo `plural`, não pelo «s» escrito à mão: à quarta
                    tentativa lia-se «Faltam 1 tentativas». */}
                PIN incorreto. {5 - tries === 1 ? 'Falta' : 'Faltam'} {plural(5 - tries, 'tentativa', 'tentativas')}.
              </Text>
            ) : erroPin ? (
              <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: ESCURO.state.errTexto, textAlign: 'center' }}>
                {erroPin}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {/* A tecla OK existe na referência 27. Sem ela o PIN submete-se
                  sozinho ao quarto dígito, e um engano no último algarismo
                  gasta uma tentativa das cinco sem hipótese de o corrigir. */}
              {['1','2','3','4','5','6','7','8','9','←','0','OK'].map((k, i) => (
                <Pressable key={i} onPress={() => press(k)} accessibilityRole="button" accessibilityLabel={k === '←' ? 'Apagar' : k}
                  style={{ width: '30%', minHeight: 52, borderRadius: R.row, borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(12,22,38,0.75)',
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: FONT.display, fontSize: k === 'OK' ? 16 : 20,
                    fontWeight: '500', color: '#FFFFFF' }}>{k}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setStep('criancas')} accessibilityRole="button" accessibilityLabel="Trocar de perfil"
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.7)' }}>Trocar de perfil</Text>
            </Pressable>
          </View>
        )}
      </View>
      </View>
    </View>
  );
}
