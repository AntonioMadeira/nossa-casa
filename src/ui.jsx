import React from 'react';
import { View, Text, TextInput, Pressable, Image, Platform } from 'react-native';
import { S, R, elev, FONT, corDoMembro, comAlfa, corSobre } from './theme';
import { EUR } from './format';
import Icon, { Marca } from './Icon';
import Figura from './Avatares';

// ── A marca de água ──────────────────────────────────────────────────────────
//
// 13/09/2026, o dono da casa: «põe o logo da app como marca de água em todos
// os ecrãs». A mesma marca dos documentos em papel (`documento.js`, 7 %),
// centrada na ÁREA DE CONTEÚDO — entre o cabeçalho e o rodapé —, A CORES
// (14/09/2026, «a marca de água no background deve ser a cores»): as quatro
// bolas com as cores da marca, e só o telhado na tinta do texto (`t.text1`),
// porque o branco dele não se via sobre a página. A opacidade é 0,05 — a 0,12 e
// a 0,08 «tem de ser mais suave» (ele, ao ver, duas vezes em 14/09/2026).
// É fundo: `pointerEvents="none"`
// para não apanhar toque nenhum, e posição absoluta para não mexer na coluna
// flex do INVARIANTE #1 — vive como PRIMEIRO filho da área de conteúdo, atrás
// do scroll, e o rodapé continua o último filho da raiz. Os cartões (superfície
// opaca) tapam-na; a página não.
export const OPACIDADE_DA_MARCA = 0.05;
export function MarcaDeAgua({ t, tamanho = 260 }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center' }}>
      <Marca size={tamanho} telhado={t.text1} opacity={OPACIDADE_DA_MARCA} />
    </View>
  );
}
import { visibilidadeDe } from './store';

// ── Campo de valor: escreve-se, e os −/+ ajustam ─────────────────────────────
//
// Toque no meio para escrever; os botões dos lados servem para acertar sem
// teclado. Serve rendimento, limites, valor do ponto e despesas.
//
// ⚠ Vivia dentro do `Dinheiro.jsx`, e o próprio comentário dele dizia que
// servia «rendimento, limites, valor do ponto e despesas» — mas o valor do
// ponto, na Gestão, era um `<Text>` entre dois botões. Não se podia escrever
// lá: para pôr o ponto a 0,35 € eram sete toques, e para o pôr a 1,00 €, vinte.
// Um controlo partilhado que vive dentro de um ecrã acaba por ser copiado à
// mão no ecrã do lado, e a cópia fica pior. Passa a viver aqui.
//
// ⚠ E os passos ARREDONDAM aos cêntimos. Com passo de 0,05, três toques no
// menos davam `0.09999999999999999` — o binário a fazer o que o binário faz.
// A Gestão tinha um `+(x).toFixed(2)` à mão à volta de cada botão; agora é do
// campo, e quem o usar não tem de se lembrar.
const aosCentimos = (n) => Math.round(n * 100) / 100;

// ⚠ E é O campo de número da app (revisão de coerência de 14/09/2026): os
// pontos de bónus da tarefa, a garantia em dias, o plano de tomas, o limite de
// um envelope e o preço estimado de um artigo eram caixas de texto simples ao
// lado deste. `vazio` deixa o campo ficar SEM valor (`null`) — um preço que
// ainda não se sabe não é 0,00 €; `rotulo` é o que o leitor de ecrã diz;
// `placeholder` é o que se lê no campo vazio.
// `compacto` (15/09/2026): sem «−» e «+», para três números lado a lado numa
// linha (o plano de tomas: por dia · dias · caixa). Continua a ser O campo de
// número da app — mesma caixa, mesmo teclado, mesmo vazio.
// `aoTerminar` é o valor ASSENTE — só o blur, o «guardar» do teclado e os
// botões «−»/«+», nunca a tecla a meio. Quem escreve fora deste ecrã (na loja
// ou no servidor) usa este, e não o `onChange`: ver o «quanto vale um ponto»
// da Gestão.
// `estreito` (15/09/2026): a caixa deixa de esticar e fica com a largura do que
// lá cabe — 104 px chegam para «999 999,00 €». É o que permite pôr o valor e o
// botão que o gasta na MESMA linha, em vez de um por baixo do outro («mostra
// alternativas para que o campo de valor livre não seja tão grande», opção A de
// `design/campo-de-valor.dc.html`). Os «−» e «+» ficam: são eles que afinam.
export function NumField({ t, value, onChange, aoTerminar, step = 5, min = 0, max = 99999, suffix = true,
  vazio = false, rotulo = 'Valor', placeholder = null, compacto = false, estreito = false, focar = false }) {
  const [txt, setTxt] = React.useState(null);
  const semValor = vazio && (value === null || value === undefined || value === '');
  const atual = semValor ? 0 : Number(value) || 0;
  const assente = (v) => { onChange(v); if (aoTerminar) aoTerminar(v); };
  const commit = () => {
    if (txt === null) return;
    const bruto = String(txt).trim();
    setTxt(null);
    if (bruto === '' && vazio) { assente(null); return; }
    const v = Number(bruto.replace(',', '.'));
    if (!isFinite(v)) return;
    assente(aosCentimos(Math.min(max, Math.max(min, v))));
  };
  // ⚠ O valor sobe a CADA tecla, e não só ao perder o foco (15/09/2026: «definir
  // plano não está a fazer nada»). Só no `onBlur`, o primeiro toque no botão do
  // rodapé servia para tirar o foco ao campo — o botão ainda estava desligado
  // nesse desenho, e o `onPress` era `undefined`. O texto que se está a
  // escrever fica em `txt` para o «1,» a meio não saltar; o blur só formata.
  const escrever = (v) => {
    setTxt(v);
    const bruto = String(v).trim();
    if (bruto === '') { if (vazio) onChange(null); return; }
    const n = Number(bruto.replace(',', '.'));
    if (isFinite(n)) onChange(aosCentimos(Math.min(max, Math.max(min, n))));
  };
  // Um toque no «−» ou no «+» é um valor assente: não há nada a meio.
  const Botao = ({ rotuloDoBotao, sinal, para }) => (
    <Pressable onPress={() => assente(para)} accessibilityRole="button"
      accessibilityLabel={rotuloDoBotao}
      style={{ width: 44, height: 44, borderRadius: R.row, borderWidth: 1, borderColor: t.border,
        alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: FONT.display, fontSize: 20, color: t.actFg }}>{sinal}</Text>
    </Pressable>
  );
  const mostrado = txt !== null ? String(txt)
    : semValor ? ''
      : (suffix ? EUR(atual) : String(atual));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, ...(estreito ? { flexGrow: 0, flexShrink: 0 } : {}) }}>
      {compacto ? null : <Botao rotuloDoBotao={`Menos ${step}`} sinal="−" para={aosCentimos(Math.max(min, atual - step))} />}
      <TextInput
        value={mostrado}
        autoFocus={focar}
        onFocus={() => setTxt(semValor ? '' : String(atual).replace('.', ','))}
        onChangeText={escrever}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        accessibilityLabel={rotulo}
        placeholder={placeholder || undefined} placeholderTextColor={t.text3}
        // ⚠ `flexBasis: 0, minWidth: 0`: na web um campo de texto tem largura
        // própria (~150 px), e três lado a lado saíam da folha pela direita.
        style={{ ...(estreito ? { width: 104, flexGrow: 0, flexShrink: 0 } : { flex: 1, flexBasis: 0, minWidth: 0 }),
          minHeight: 44, textAlign: 'center', fontFamily: FONT.display,
          fontSize: compacto || estreito ? 15 : 18, color: t.text2, borderRadius: R.row, borderWidth: 1, borderColor: t.border,
          ...(compacto ? { backgroundColor: t.card } : {}) }} />
      {compacto ? null : <Botao rotuloDoBotao={`Mais ${step}`} sinal="+" para={aosCentimos(Math.min(max, atual + step))} />}
    </View>
  );
}

// Cartão: um enchimento só, 14/16, herdado do protótipo
export const Card = ({ t, children, style, pad = true }) => (
  <View style={[{
    backgroundColor: t.card, borderRadius: R.card,
    paddingVertical: pad ? 14 : 0, paddingHorizontal: pad ? 16 : 0,
    ...elev(1),
  }, style]}>{children}</View>
);

// Título de secção — desenho C de `design/titulos-e-cartoes.dc.html`
// (escolhido pelo dono da casa em 09/09/2026, entre cinco): uma linha de
// 13 px na cor de ação, com o que vier à direita (contagem, ligação) e uma
// régua por baixo. Era 20 px a negro na cor do esquema, e pesava mais do que
// o conteúdo que rotulava.
//
// ⚠ `actFg`, e não `titulo`: a 13 px isto é texto PEQUENO, e precisa de 4,5.
// O `titulo` (o acento no claro) falha isso em cinco dos seis esquemas no
// escuro; o `actFg` é o acento levado aos 4,5 nos doze temas — a regra do
// CLAUDE.md para texto em cor de ação.
// ⚠ `icone` é OPCIONAL, e por omissão não há nenhum (25/09/2026). Só os
// corredores da lista de compras o levam — pô-lo em todos os títulos da app
// obrigava a inventar um pictograma para «Envelopes», «Administração» e
// «Contas entre Nós», e um ícone inventado por obrigação diz menos do que
// título nenhum.
//
// ⚠ O alinhamento passa a `center` quando há ícone, e continua `baseline` sem
// ele. Um ícone alinhado pela linha de base do texto fica a flutuar meio
// píxel acima, e nota-se numa lista com cinco corredores seguidos.
export const SectionTitle = ({ t, children, right, icone }) => (
  <View style={{ flexDirection: 'row', alignItems: icone ? 'center' : 'baseline', gap: S.md,
    paddingBottom: S.md, paddingHorizontal: S.xs,
    borderBottomWidth: 1, borderBottomColor: t.border }}>
    {/* ⚠ `t.titulo` e não `t.actFg`: um ícone é um objeto gráfico e pede 3:1,
        e é o `titulo` que os doze temas garantem nessa medida (CLAUDE.md). O
        texto ao lado fica no `actFg`, que é o que 13 px pedem. */}
    {icone ? <Icon name={icone} size={17} color={t.titulo} /> : null}
    <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 13, fontWeight: '600',
      color: t.actFg, letterSpacing: 0.2 }}>{children}</Text>
    {right}
  </View>
);

// Uma linha de lista PLANA — o resto do desenho C. Assenta na página, sem
// cartão: divisória por baixo, 52 de altura mínima, e a faixa de cor (quando
// há) por dentro da linha, à esquerda. `tinta` pinta a linha inteira — o
// verde de uma tarefa feita, por exemplo. Substitui o «um cartão por item»,
// que pagava a moldura de um cartão inteiro por cada linha.
// ⚠ `faixaCurta` é a faixa que NÃO cresce com o conteúdo: mede os 52 px da
// primeira linha e para aí. Nasceu para a consulta aberta da Saúde (12/09/2026):
// com o acordeão aberto, a `faixa` acompanhava receitas, notas, ação e anexos
// — cerca de 700 px de linha azul contínua, que se lia como uma régua da página
// e não como a marca de uma consulta. O dono da casa escolheu a opção A de
// `design/faixa-da-consulta.dc.html`. Fechada, as duas são iguais.
// ⚠ A FAIXA JÁ NÃO EMPURRA A LINHA (15/09/2026: «os círculos devem ter o
// alinhamento do 1.º ecrã»).
//
// Era `borderLeftWidth: 3` mais `paddingLeft: 10`, e só quando havia faixa: uma
// linha com faixa tinha o conteúdo 11 px à direita do conteúdo de uma linha sem
// ela. Numa lista de compras onde a faixa marca o que já se apanhou, isso dá uma
// coluna de círculos aos bicos — o apanhado um degrau à direita do por apanhar,
// linha sim linha não. Ele viu-o na lista das compras e tinha razão em todas as
// listas: Tarefas, Modo Compras, Início, Saúde, todas alternam faixa com nada.
//
// Agora a faixa desenha-se ABSOLUTA, como a `faixaCurta` sempre se desenhou, e
// o corredor dos 10 px existe em TODAS as linhas, com faixa ou sem ela. O
// conteúdo fica no mesmo sítio, e a faixa aparece e desaparece ao lado dele.
export const Linha = ({ t, children, faixa, faixaCurta, tinta, last, style }) => (
  <View style={[{
    minHeight: 52, justifyContent: 'center',
    paddingVertical: S.sm, paddingLeft: S.md + S.xs, paddingRight: S.xs,
    borderBottomWidth: last ? 0 : 1, borderBottomColor: t.divider,
    ...(tinta ? { backgroundColor: tinta } : {}),
  }, style]}>
    {faixa ? (
      <View pointerEvents="none" testID="faixa"
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: faixa }} />
    ) : null}
    {faixaCurta ? (
      <View pointerEvents="none" testID="faixa-curta"
        style={{ position: 'absolute', left: 0, top: 0, width: 3, height: 52, backgroundColor: faixaCurta }} />
    ) : null}
    {children}
  </View>
);

export const Label = ({ t, children }) => (
  <Text style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: '600', color: t.slate }}>{children}</Text>
);

// Pastilha de estado: não se toca. Para escolher, use Choice.
export const Pill = ({ label, fg, bg, border }) => (
  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: R.pill,
    borderWidth: 1, borderColor: border, backgroundColor: bg }}>
    <Text style={{ fontFamily: FONT.ui, fontSize: 11, fontWeight: '600', color: fg }}>{label}</Text>
  </View>
);

// Escolha vertical exclusiva: pastilha de rádio, título, e uma linha de
// detalhe por baixo. É o idioma que o Dinheiro já usava nas «Opções de
// Pagamento» — estava escrito à mão, três vezes seguidas, no meio do ecrã.
//
// Não confundir com `Choice`, que é a pastilha pequena para escolhas curtas em
// linha. Uma escolha com frases dentro não cabe numa pastilha, e empilhar
// pastilhas de largura inteira faz três botões primários a competirem entre si
// — foi o que fiz na folha de exportação à primeira.
// É a bola que marca a escolha, não a linha. A linha inteira pintada de
// `chrome` fazia a opção escolhida gritar mais alto do que a pergunta, e três
// delas empilhadas — uma cheia, duas vazias — liam-se como um bloco a competir
// com o resto da folha. O contorno muda de cor, o fundo fica quieto, e o texto
// não tem de trocar de cor com ele.
export const Opcao = ({ t, titulo, detalhe, selected, onPress, disabled }) => (
  <Pressable onPress={disabled ? undefined : onPress} disabled={!!disabled}
    accessibilityRole="button" accessibilityLabel={titulo}
    accessibilityState={{ selected: !!selected, disabled: !!disabled }} aria-pressed={!!selected}
    style={({ pressed }) => ({
      minHeight: 48, borderRadius: R.row, paddingHorizontal: 14, paddingVertical: S.md,
      borderWidth: 1, borderColor: selected ? t.accent : t.border,
      backgroundColor: pressed ? t.subtle : t.card,
      flexDirection: 'row', alignItems: 'center', gap: S.md,
      opacity: disabled ? 0.4 : 1,
    })}>
    {/* Anel por fora, disco por dentro — a bola de rádio de sempre. */}
    <View style={{ width: 20, height: 20, borderRadius: R.pill, borderWidth: 2,
      borderColor: selected ? t.accent : t.border,
      alignItems: 'center', justifyContent: 'center' }}>
      {selected ? (
        <View style={{ width: 10, height: 10, borderRadius: R.pill, backgroundColor: t.accent }} />
      ) : null}
    </View>
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: FONT.ui, fontSize: 13,
        fontWeight: selected ? '600' : '400', color: t.text2 }}>{titulo}</Text>
      {detalhe ? (
        <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>{detalhe}</Text>
      ) : null}
    </View>
  </Pressable>
);

// Chip de escolha: tocável, 44 de alvo, cor de ação lida do tema.
// Só fora de linhas tocáveis — uma linha, um destino.
export const Choice = ({ t, label, selected, onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="button"
    accessibilityLabel={label} accessibilityState={{ selected: !!selected }} aria-pressed={!!selected}
    style={({ pressed }) => ({
      minHeight: 44, paddingHorizontal: S.lg, borderRadius: R.row, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: selected ? t.accent : t.card,
      borderColor: selected ? t.accent : t.border,
      opacity: pressed ? 0.85 : 1,
    })}>
    <Text style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: '600',
      color: selected ? '#FFFFFF' : t.text2 }}>{label}</Text>
  </Pressable>
);

// ⚠ Escolher uma PESSOA saiu deste ficheiro (15/09/2026). A `PastilhaMembro`
// daqui — ponto de cor, nome, marca redonda ou quadrada — era a quarta forma de
// escolher alguém nesta app, a par das pastilhas de texto da Saúde, do
// `Segmented` das Tarefas e do `Choice` das contas fixas. O dono da casa:
// «deve ser coerente com o design da app e ter os avatares como os outros
// filtros». Agora é uma só: `EscolherPessoa`, em `src/FiltroDeMembros.jsx`,
// que é a mesma bola do filtro. Guarda: `visibilidade-eventos`
// («a marca diz quantos se podem escolher»).

// ── A marca de estado de uma linha que se marca ─────────────────────────────
//
// Quatro estados, um desenho, e o MESMO DIÂMETRO nos quatro — é isso que os
// alinha na coluna (15/09/2026: «tudo o que não está selecionado deve ter um
// círculo em branco antes e estar alinhado com o visto existente»).
//
// ⚠ «Por marcar» era o `infoCircle` — um «i» dentro de um círculo — em SEIS
// sítios: Tarefas, Compras, Modo Compras, Início, a lista da criança e o
// carrinho. Um «i» quer dizer INFORMAÇÃO; o que aquelas linhas queriam dizer
// era «isto ainda não foi marcado». Um ícone com dois sentidos é pior do que um
// ícone menos evocativo (CLAUDE.md), e este andava com seis. Agora «por marcar»
// é um círculo vazio, que é o que o mundo inteiro lê como «por marcar».
//
// ⚠ O VISTO leva o ACENTO DO PERFIL e não o verde de «ok» («a cor do visto deve
// ser igual à do perfil escolhido»). É a regra que o resto da app já segue: o
// que se pinta com o acento é o que ESTA pessoa escolheu ao tocar. O verde fica
// na faixa e na tinta da linha — essas são o estado dela, não a marca do dedo.
// `t.titulo` e não `t.accent`: é o acento já clareado até aos 3:1 contra o
// cartão escuro, que é o que um ícone precisa (ver `buildTheme`).
//
// ⚠ E as medidas saem do PRÓPRIO GLIFO, para os quatro se alinharem a qualquer
// tamanho: o `checkCircle` desenha uma circunferência de raio 9 numa grelha de
// 24 com traço de 1,75 — logo 19,75 de caixa e 1,75 de borda, à escala pedida.
// Escrever «20» à mão alinhava neste tamanho e desalinhava no seguinte.
// ⚠ A MARCA TEM DOIS TAMANHOS, E SÓ DOIS (17/09/2026: «os vistos das compras
// devem ficar do mesmo tamanho dos vistos das tarefas»).
//
// Tinha quatro em oito sítios — 20 nas tarefas, no início e no carrinho, 24 nas
// compras, 24 e 28 na app da criança. Ninguém os escolheu: cada ecrã escreveu o
// seu à medida que a marca partilhada foi chegando lá, e a mesma peça ficou com
// quatro pesos. O da criança é maior DE PROPÓSITO — a app dela tem letra maior
// e linhas maiores —, e é a única diferença que se defende.
//
// Quem usa a marca passa uma destas duas e mais nada. O guarda que o confere é
// `a-marca-de-estado-tem-dois-tamanhos`.
export const MARCA = 20;          // a app dos adultos
export const MARCA_DA_CRIANCA = 24;   // a app da criança, que é maior por decisão

export const MarcaDeEstado = ({ t, estado = 'por-marcar', size = MARCA }) => {
  const d = (19.75 * size) / 24;
  const b = (1.75 * size) / 24;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {estado === 'marcado' ? (
        <Icon name="checkCircle" size={size} color={t.titulo} />
      ) : estado === 'aguarda' ? (
        // «Feito — à espera que um adulto confirme»: o relógio num disco âmbar.
        // ⚠ `warnBg` é tijolo — opaco e claro nos DOIS aspetos —, e um tijolo
        // `xBg` só aceita o `xDeep` por cima (CLAUDE.md). Daí o `warnDeep`, e
        // não o `warnTexto`, que no escuro clareia e aqui ficaria a 1,4.
        <View style={{ width: d, height: d, borderRadius: R.pill, alignItems: 'center',
          justifyContent: 'center', backgroundColor: t.state.warnBg }}>
          <Icon name="clock" size={d * 0.74} color={t.state.warnDeep} />
        </View>
      ) : estado === 'sem' ? (
        // ⚠ `warnTexto` e não `warn`: o `#FAAD14` sobre a página clara dá 1,9,
        // e um ícone precisa de 3. Aqui o fundo é a página, não o tijolo.
        <Icon name="closeCircle" size={size} color={t.state.warnTexto} />
      ) : (
        // ⚠ `t.text3` e NÃO `t.border`: a borda mede 1,38:1 contra o cartão no
        // pior dos doze temas, e este círculo é a única coisa que diz «por
        // marcar» — um objeto gráfico pede 3. O `t.text3` dá 5,13, e é o mesmo
        // cinzento que o «i» que aqui estava levava. Medido em 16/09/2026:
        // troquei um ícone com o sentido errado por uma marca que não se via.
        <View style={{ width: d, height: d, borderRadius: R.pill, borderWidth: b,
          borderColor: t.text3, backgroundColor: t.surface }} />
      )}
    </View>
  );
};

// A visibilidade de um evento, em pastilha. Estava escrita à mão em dois
// ecrãs — com dois estados, e a cor a repetir-se em quatro props de cada vez.
// Três estados agora, e a cor diz o alcance: família em info, adultos em
// aviso, só eu em cinzento.
export const PastilhaVisibilidade = ({ t, evento }) => {
  const v = visibilidadeDe(evento);
  // ⚠ `infoDeep` no texto, e não `info`: azul claro sobre tijolo azul-claro
  // dava 2,91. A borda fica `info`, que é objeto gráfico (3:1).
  const cfg = v === 'familia' ? { rotulo: 'Família', fg: t.state.infoDeep, bg: t.state.infoBg, bd: t.state.info }
    : v === 'adultos' ? { rotulo: 'Adultos', fg: t.state.warnDeep, bg: t.state.warnBg, bd: t.state.warn }
    : { rotulo: 'Só eu', fg: t.text3, bg: t.subtle, bd: t.border };
  return <Pill label={cfg.rotulo} fg={cfg.fg} bg={cfg.bg} border={cfg.bd} />;
};

// Alvo de toque nunca abaixo de 44
export const Tap = ({ onPress, label, children, style, size = 44 }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    hitSlop={6}
    style={({ pressed }) => [{
      minWidth: size, minHeight: size, alignItems: 'center', justifyContent: 'center',
      opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
    }, style]}>{children}</Pressable>
);

// Linha de definição: o padrão da app — valor à direita, chevron
// `iconColor` é opcional e cai em t.slate — o «Precisa de Si» colore o ícone
// pela urgência da linha, o resto da app quer sempre a mesma cor.
// `leading` é para quando o que vem à esquerda não é um ícone — um avatar, na
// lista de membros da referência 14. Sem isto a linha aceitava a prop e
// ignorava-a em silêncio, que é como um avatar desaparece sem erro nenhum.
export const Row = ({ t, icon, iconColor, leading, title, sub, value, onPress, last, right }) => (
  <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={onPress ? title : undefined}
    style={({ pressed }) => ({
      minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: t.divider,
      opacity: pressed ? 0.7 : 1,
    })}>
    {leading || null}
    {icon ? <Icon name={icon} size={20} color={iconColor || t.slate} /> : null}
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>{title}</Text>
      {sub ? <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>{sub}</Text> : null}
    </View>
    {value ? <Text style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: '600', color: t.text2 }}>{value}</Text> : null}
    {right !== undefined ? right : (onPress ? <Icon name="caretRight" size={18} color={t.text3} /> : null)}
  </Pressable>
);

// Controlo segmentado: um contorno para o grupo, divisórias por dentro
// Aceita ['Uma vez', ...] ou [{value, label}, ...]. Passar strings cruas dava
// três segmentos em branco, todos «selecionados» por undefined === undefined.
export const Segmented = ({ t, options, value, onChange, small }) => (
  <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: t.border,
    borderRadius: R.row, overflow: 'hidden' }}>
    {options.map((raw, i) => {
      const o = typeof raw === 'string' ? { value: raw, label: raw } : raw;
      const on = value === o.value;
      return (
        <Pressable key={o.value} onPress={() => onChange(o.value)}
          accessibilityRole="button" accessibilityLabel={o.label}
          accessibilityState={{ selected: on }} aria-pressed={on}
          // ⚠ O `small` valia 38 de altura, e era o ÚNICO efeito que tinha.
          //
          // Media 38 na Gestão, nas Tarefas e no Dinheiro — abaixo dos 44 do
          // INVARIANTE #5, nos três. Medido no navegador, não deduzido.
          //
          // Agora o `small` mexe no TIPO e não no alvo: o controlo continua a
          // ler-se como mais leve, e a mão continua a ter 44 onde tocar. É a
          // mesma decisão do interruptor — o alvo cresce, o desenho não.
          style={{
            flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
            // ⚠ O escolhido leva o ACENTO, como a `Choice`. Levava o `chrome` —
            // a cor do cabeçalho, quase preta no Violeta — e o dono da casa viu
            // «Urgente» e «Léo» a preto ao lado de pastilhas em violeta e
            // perguntou porquê. Eram dois idiomas de escolha para a mesma coisa;
            // fica um. Branco sobre o acento dá 4,62 no pior dos seis.
            backgroundColor: on ? t.accent : 'transparent',
            borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: t.border,
          }}>
          <Text style={{ fontFamily: FONT.ui, fontSize: small ? 12 : 13,
            fontWeight: on ? '600' : '400', color: on ? '#FFFFFF' : t.text2 }}>{o.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

// ⚠ O alvo tem 44 de altura; o desenho continua a ter 27.
//
// Media 46×27 e contava com o `hitSlop={10}` para chegar aos 44. O `hitSlop`
// funciona no telemóvel e o react-native-web IGNORA-O — no navegador o alvo
// era mesmo 27, e o INVARIANTE #5 não abre excepção para um interruptor.
//
// Medido no Perfil, com todos os alvos do ecrã: era o único abaixo de 44.
export const Toggle = ({ t, on, onPress, label }) => (
  <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} aria-checked={on}
    accessibilityLabel={label} hitSlop={10}
    style={{ minWidth: 46, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
    <View style={{ width: 46, height: 27, borderRadius: R.pill, padding: 3,
      // Ligado é o ACENTO, como qualquer escolha — era o `chrome`, quase preto
      // no Violeta. Ver `a-escolha-e-o-acento`.
      backgroundColor: on ? t.accent : t.border,
      alignItems: on ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>
      <View style={{ width: 21, height: 21, borderRadius: R.pill, backgroundColor: '#FFFFFF', ...elev(1) }} />
    </View>
  </Pressable>
);

// Botão principal: pílula, cor de ação
// A ação principal, em dois pesos.
//
// ⚠ `comum` é o peso do que se desfaz; sem ele, o botão leva a COR DE AÇÃO, e
// essa passa a querer dizer uma coisa: **isto não se desfaz**.
//
// A regra, escrita para não derivar: leva o acento o que mexe em dinheiro
// ENTRE PESSOAS, o que APAGA, e o que FECHA um período. Tudo o resto —
// criar, guardar, anexar, agendar — é comum.
//
// O que isto resolve: o acento estava em todos os botões, e por isso não
// distinguia nenhum. Contado no ecrã, eram um a três fundos de acento por
// separador, todos com o mesmo peso — a ação que acerta contas entre dois
// adultos ao lado da que anexa um ficheiro.
//
// ⚠ E o `sub` diz a CONSEQUÊNCIA dentro do próprio botão — «83,67 € para a
// Rita». Numa app de dinheiro isso vale mais do que qualquer cor: quem carrega
// não tem de se lembrar do que leu duas linhas acima.
// ⚠ E o rótulo DESACTIVADO não é o mesmo rótulo com menos brilho.
//
// Era branco sobre o `border`: 1,41:1 no claro. Ilegível — a palavra estava lá
// e não se lia. Com o `comum` a pintar o rótulo de `page` ficou 1,26:1, ainda
// pior, e foi assim que se viu: um botão cinzento com um fantasma escrito.
//
// E são exactamente estes os rótulos que mais precisam de ser lidos, porque um
// botão desactivado é o que diz o que FALTA — «Escreva um valor», «Valor
// Indisponível». O `text3` dá 3,43 no claro e 3,89–4,61 no escuro: apagado
// como convém a um botão que não responde, e legível como convém a uma frase
// que explica porquê.
//
// ⚠ E o COMUM segue o esquema, em tinta — não é preto.
//
// Era `page` sobre `text1`: um botão preto no claro, branco no escuro, igual em
// todos os seis esquemas. O dono da casa perguntou três vezes «porque é que está
// a preto e não à cor do perfil?», e a resposta estava no protótipo desde o
// início: os botões principais dele são `--c-act-bg` / `--c-act-fg`, o acento a
// 10 % com o acento escurecido por cima. Os três tokens nunca tinham chegado à
// app. Agora vivem no `buildTheme` (`actBg`, `actBrd`, `actFg`), medidos: o texto
// escurece ou clareia até 4,5:1 sobre o fundo real do botão, e a borda sobe até
// separar o botão da superfície a 3:1.
//
// O acento CHEIO fica para o que não se desfaz — a lista fechada do guarda
// `o-acento-e-reservado`. A hierarquia mantém-se: cheio é consequência, tinta é
// tudo o resto. Só deixou de haver preto.
//
// ⚠ E o DESACTIVADO também segue o esquema (08/09/2026). Era cinzento — fundo
// `border`, rótulo `text3` — e o dono da casa abriu a folha do artigo e não viu
// uma cor do perfil em lado nenhum: «o guardar artigo não mudou?». No protótipo
// o botão está sempre em tinta de acção. Aqui fica em tinta, com a borda
// TRACEJADA — o «ainda não» desta app, o mesmo do `AddButton` — e sem relevo. O
// rótulo é o `actFg` da tinta, que já mede 4,5 sobre o `actBg` nos doze temas;
// o `text3` sobre o cinzento dava 3,43.
const rotuloDo = (t, { disabled, comum }) =>
  (disabled || comum ? t.actFg : '#FFFFFF');

export const Primary = ({ t, label, sub, icon, onPress, disabled, comum }) => (
  // ⚠ A prop `disabled` do `Pressable`, e não um `aria-disabled` à mão: na web
  // é o próprio `Pressable` que escreve o `aria-disabled` a partir dela (e
  // sobrepõe-se a qualquer um que lhe passem), e é ela que tira o botão da
  // ordem do TAB. O `onPress` já vinha desligado; faltava dizê-lo.
  <Pressable onPress={disabled ? undefined : onPress} disabled={!!disabled} accessibilityRole="button"
    accessibilityLabel={sub ? `${label} — ${sub}` : label}
    accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => ({
      minHeight: sub ? 56 : 48, borderRadius: R.row, flexDirection: 'row',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: disabled || comum ? t.actBg : t.accent,
      // A borda é o que separa o botão em tinta da folha onde está: a tinta a
      // 10 % sozinha dava 1,1:1 contra o cartão. O cheio não a precisa —
      // separa-se pela cor. No desactivado é tracejada: o estado diz-se pela
      // forma, não pelo apagamento.
      borderWidth: disabled || comum ? 1 : 0,
      borderColor: disabled || comum ? t.actBrd : 'transparent',
      borderStyle: disabled ? 'dashed' : 'solid',
      opacity: pressed ? 0.9 : 1, ...(disabled ? {} : elev(3)),
    })}>
    {icon ? <Icon name={icon} size={20} color={rotuloDo(t, { disabled, comum })} /> : null}
    <View style={{ alignItems: 'center', gap: 1 }}>
      <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '700',
        color: rotuloDo(t, { disabled, comum }), letterSpacing: 0.4 }}>{label}</Text>
      {sub ? (
        // O alfa afasta a consequência do rótulo sem lhe mudar a cor. ⚠ Mas
        // não se aplica ao desactivado: ali o `text3` já está no limite, e
        // 82 % dele sobre o cinzento deixava de se ler outra vez.
        <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: '500',
          color: rotuloDo(t, { disabled, comum }), opacity: disabled ? 1 : 0.82 }}>{sub}</Text>
      ) : null}
    </View>
  </Pressable>
);

// ── Botão compacto: 44 de alvo, três pesos ──────────────────────────────────
//
// Chamava-se `BotaoDoMes`, e era o nome do primeiro sítio onde apareceu — o par
// «Abrir Outubro / Fechar Setembro». Quando um componente serve um terceiro
// caso, o nome tem de deixar de ser o do primeiro: agora também é o «Guardar
// receita» e o «Guardar nota» da ficha de saúde, que não têm nada que ver com
// meses.
//
// ⚠ Vive AQUI, e não dentro de um ecrã, porque o par do mês existe em DOIS: o
// cartão do mês na Gestão e a secção «Administração» do Dinheiro. Estavam
// desenhados à mão nos dois, com cores diferentes — e o do Dinheiro tinha o
// rótulo de 13 px na cor do acento e em âmbar, o que dá 2,12:1 no Cinza escuro
// e 3,17 no âmbar claro. Catorze de vinte e quatro pares abaixo dos 4,5 que
// 13 px pedem.
//
// Os três pesos, com o pior caso medido nos doze temas:
//
//   'acento'     branco sobre o acento     4,62 (Cião claro)   — não se desfaz
//   'comum'      `page` sobre `text1`     13,49                — tudo o resto
//   'contorno'   `text2` sobre o cartão    9,65                — a alternativa
//
// Ver `design/abrir-fechar-mes.dc.html` e `design/botoes-da-saude.dc.html`.
// ⚠ A `etiqueta` existe porque o rótulo VISÍVEL e o que se OUVE nem sempre
// podem ser o mesmo. Numa lista de notas há um «Guardar» por nota, e o que a
// pessoa ouve tem de dizer qual: «Guardar a alteração». Escrever «Guardar» nos
// dois sítios quebrou uma prova que existia justamente para isso — e a prova
// tinha razão.
export function BotaoCompacto({ t, label, etiqueta, tom = 'contorno', disabled, onPress, largura }) {
  // O comum em TINTA do esquema, como o `Primary` — os mesmos três tokens do
  // protótipo, senão um botão compacto preto ao lado de um principal em tinta
  // parecia de outra app.
  const fundo = disabled ? t.border
    : tom === 'acento' ? t.accent
      : tom === 'comum' ? t.actBg : 'transparent';
  const cor = disabled ? t.text3
    : tom === 'acento' ? '#FFFFFF'
      : tom === 'comum' ? t.actFg : t.text2;
  return (
    <Pressable onPress={disabled ? undefined : onPress} disabled={!!disabled}
      accessibilityRole="button" accessibilityLabel={etiqueta || label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        // ⚠ O `flex: 1` é o comportamento por omissão porque o primeiro uso era
        // um par de metades. Quem o quiser ajustado ao rótulo — um «Guardar» ao
        // lado de um campo — passa `largura="conteudo"`.
        ...(largura === 'conteudo' ? { paddingHorizontal: 14 } : { flex: 1 }),
        minHeight: 44,                       // INVARIANTE #5
        borderRadius: R.row,                 // o canto de tudo o que se toca
        borderWidth: tom === 'contorno' ? 1 : 0,
        borderColor: t.border,
        backgroundColor: fundo,
        alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.85 : 1,
      })}>
      {/* ⚠ Uma linha só. «Fechar Setembro» a 13,5 px cabe nos 155 px que sobram
          de metade da largura útil; «Fechar Fevereiro» é o pior caso e cabe
          também. Sem isto, um mês longo partia o botão em dois e a coluna dos
          dois deixava de ter a mesma altura. */}
      <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: 13,
        fontWeight: '700', color: cor, paddingHorizontal: 8 }}>{label}</Text>
    </Pressable>
  );
}

// ── A pastilha que se toca ──────────────────────────────────────────────────
//
// Um botão que VIRA ESTADO: toca-se em «Guardada» na linha de uma receita, e a
// linha passa a mostrar a pastilha «guardada» no mesmo sítio.
//
// ⚠ Desenha-se já com a cara do estado em que vai ficar — verde, com a marca —
// e é isso que a distingue de um botão qualquer: a pessoa vê o resultado antes
// de tocar. É o desenho E de `design/botoes-da-saude.dc.html`.
//
// Não confundir com a `Pill`, que é a mesma cara e NÃO se toca: esta é o antes,
// aquela é o depois.
//
// ⚠ E o canto é `R.row`, não `R.pill` — tudo o que se toca leva o mesmo canto,
// e essa regra ganha à semelhança com a pastilha que vem a seguir. A cor e a
// marca chegam para a fazer.
export const PastilhaTocavel = ({ t, label, fg, bg, border, icon = 'check', onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => ({
      minHeight: 44, borderRadius: R.row, paddingHorizontal: 12,
      borderWidth: 1, borderColor: border, backgroundColor: bg,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      opacity: pressed ? 0.7 : 1,
    })}>
    <Icon name={icon} size={14} color={fg} />
    <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11.5, fontWeight: '600', color: fg }}>
      {label}
    </Text>
  </Pressable>
);


// Ação secundária: contorno tracejado, minúsculas — o padrão «acrescentar».
//
// ⚠ Leva a cor do PERFIL, e leva-a nos sítios certos.
//
// Era tudo neutro: contorno `border`, «+» e rótulo em `text3`. Num ecrã onde o
// título da secção e os botões seguem o esquema escolhido, o «+ agendar
// evento» era a única coisa cinzenta — e é uma ação, não uma nota de pé de
// página.
//
// ── Onde a cor entra, e onde NÃO ────────────────────────────────────────────
//
// O contorno e o «+» são OBJETOS GRÁFICOS: precisam de 3:1. O rótulo tem
// 13,5 px, que é texto pequeno, e precisa de 4,5. Medido nos doze temas:
//
//   accent   como contorno   falha 3:1 em CINCO esquemas escuros (2,12 a 2,90)
//   titulo   como contorno   3,01 no pior caso (Cinza escuro, sobre cartão) ✓
//   titulo   como rótulo     3,01 — muito abaixo dos 4,5 que 13,5 px pedem ✗
//
// Por isso o contorno e o ícone levam `titulo` — que é o token que o tema já
// tem para isto: o acento no claro, o `hover` no escuro, clareado quando não
// chega — e o rótulo fica neutro. Pôr o acento no rótulo é o defeito que os
// dois botões de mês do Dinheiro tiveram durante meses.
//
// ⚠ E o rótulo sobe de `text3` para `text2`, o que é uma correção e não um
// gosto: `text3` sobre a página dá 4,31 no Violeta claro, abaixo dos 4,5.
// O `text2` dá 8,82.
export const AddButton = ({ t, label, onPress }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => ({
      minHeight: 44, borderRadius: R.row, borderWidth: 1, borderStyle: 'dashed',
      borderColor: t.titulo, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 8, opacity: pressed ? 0.7 : 1,
    })}>
    <Icon name="plus" size={18} color={t.titulo} />
    <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: t.text2 }}>{label}</Text>
  </Pressable>
);

// Avatar com a inicial — a informação não depende só da cor
// O avatar de um membro: a fotografia da conta Google, ou a inicial.
//
// A cor de fundo fica por baixo da imagem de propósito — é o que se vê
// enquanto ela carrega, e o que fica se ela não carregar. Sem isso, o avatar
// pisca a branco a cada ecrã, e uma casa sem rede ficava com buracos redondos
// onde deviam estar as pessoas.
// As propriedades do avatar de um membro, a partir do registo dele.
//
// Existe porque eram TRÊS propriedades em ONZE sítios, e porque dez deles
// chamavam `corDoMembro(nome)` sem o segundo argumento — sem a cor ESCOLHIDA.
// Quem escolhesse uma cor via-a no Perfil e em mais lado nenhum: na agenda, nas
// tarefas e nas compras continuava a aparecer a cor calculada do nome. Um sítio
// só para decidir isto é a diferença entre acrescentar uma escolha e acrescentar
// uma escolha que só funciona em metade da app.
// Se a fotografia da conta é para mostrar.
//
// ⚠ Três estados, e não dois. `usarFoto` por decidir (`undefined`) não é o
// mesmo que decidido que NÃO: quem entra com a Google e vê a sua fotografia
// aparecer teve o que pediu, e quem prefere outra coisa escolhe-a — a escolha
// explícita ganha sempre, nos dois sentidos.
//
// Estava a começar em `false`, por uma razão de privacidade que era minha e não
// de quem usa a app: a fotografia era importada, ficava guardada, e o avatar
// continuava a mostrar a inicial. Parecia avariado, e era.
export const mostraFotografia = (m) => {
  const r = m || {};
  if (!r.avatar) return false;
  if (r.usarFoto === undefined || r.usarFoto === null) return !r.figura;
  return !!r.usarFoto;
};

export const avatarDe = (nome, m, fallback) => {
  const r = m || {};
  return {
    initial: r.initial || String(nome || '?').trim().charAt(0).toUpperCase(),
    color: corDoMembro(nome, r.cor) || fallback,
    figura: r.figura || null,
    foto: mostraFotografia(r) ? r.avatar : null,
  };
};

// O avatar do CABEÇALHO — disco branco com anel, não bola da cor do membro.
//
// É outro desenho de propósito: assenta no cabeçalho colorido, e uma bola da
// cor do membro sobre o cabeçalho do esquema seriam duas cores a discutir no
// canto do ecrã. O branco é o que o separa do fundo (referência 04).
//
// ⚠ Mas é o avatar MAIS VISTO da app, e não sabia da escolha nenhuma: mostrava
// sempre a inicial, mesmo com fotografia guardada e figura escolhida. Era este
// o que aparecia nas capturas de quem perguntava porque é que o avatar não
// mudava.
//
// A fotografia enche o disco; a figura desenha-se na cor do cabeçalho, como a
// inicial que ela substitui.
export const AvatarDeCabecalho = ({ t, nome, membro, size = 36 }) => {
  const [falhou, setFalhou] = React.useState(false);
  const r = membro || {};
  const foto = mostraFotografia(r) ? r.avatar : null;
  React.useEffect(() => { setFalhou(false); }, [foto]);
  return (
    <View style={{ width: size, height: size, borderRadius: R.pill, backgroundColor: '#FFFFFF',
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center' }}>
      {foto && !falhou ? (
        <FotoDoAvatar uri={foto} size={size} onFalhar={() => setFalhou(true)} />
      ) : r.figura ? (
        <Figura nome={r.figura} size={size * 0.62} color={t.chrome} />
      ) : (
        <Text style={{ fontFamily: FONT.display, fontSize: size * 0.42, fontWeight: '500',
          color: t.chrome }}>
          {r.initial || String(nome || '?').trim().charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
};

// A fotografia da conta, desenhada.
//
// ── Porque não é só um `<Image>` ────────────────────────────────────────────
//
// A Google RECUSA a fotografia quando o pedido leva referenciador. Medido no
// navegador, contra o endereço real de uma conta:
//
//     política por omissão   erro
//     no-referrer            OK 96×96
//
// O `Image` do react-native-web (0.21.2) não expõe `referrerPolicy` — procurei
// no módulo, não existe. Na web desenha-se um `<img>` verdadeiro, que a
// aceita; no telemóvel não há referenciador nenhum e o `Image` serve.
//
// ⚠ E se a imagem falhar, NÃO fica um buraco. Foi o que aconteceu: a bola
// aparecia da cor do membro e vazia por dentro, sem inicial e sem figura —
// pior do que não ter fotografia nenhuma. Um endereço destes caduca quando a
// pessoa muda a fotografia na conta, portanto isto não é um caso de esquina.
const FotoDoAvatar = ({ uri, size, onFalhar }) => {
  if (Platform.OS === 'web') {
    return React.createElement('img', {
      src: uri,
      // A razão de tudo isto.
      referrerPolicy: 'no-referrer',
      alt: '',
      width: size, height: size,
      onError: onFalhar,
      style: { width: size, height: size, objectFit: 'cover', display: 'block' },
    });
  }
  return <Image source={{ uri }} accessibilityIgnoresInvertColors
    onError={onFalhar} style={{ width: size, height: size }} />;
};

export const Avatar = ({ initial, color, size = 24, foto, figura }) => {
  const [falhou, setFalhou] = React.useState(false);
  // Um endereço novo merece uma tentativa nova.
  React.useEffect(() => { setFalhou(false); }, [foto]);
  return (
  <View style={{ width: size, height: size, borderRadius: R.pill, backgroundColor: color,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {foto && !falhou ? (
      <FotoDoAvatar uri={foto} size={size} onFalhar={() => setFalhou(true)} />
    ) : figura ? (
      // A figura ocupa dois terços da bola. Cheia, encostava ao rebordo e
      // perdia a forma nos 24 px a que ela aparece numa linha de tarefa.
      <Figura nome={figura} size={size * 0.66} color="#FFFFFF" />
    ) : (
      <Text style={{ fontFamily: FONT.ui, fontSize: size * 0.46, fontWeight: '700', color: corSobre(color) }}>{initial}</Text>
    )}
  </View>
  );
};

export const Bar = ({ t, pct, color, height = 8 }) => (
  <View style={{ height, borderRadius: R.pill, backgroundColor: t.page, overflow: 'hidden' }}>
    <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%',
      borderRadius: R.pill, backgroundColor: color }} />
  </View>
);

// ⚠ O «info» segue o ESQUEMA; o «warn» e o «err» NÃO.
//
// Um aviso informativo — «não há nada aqui», «está tudo em dia» — não é um
// estado, é a app a falar. Ficava azul-do-sistema em cima de um cabeçalho
// violeta ou cião, e lia-se como uma peça de outra app.
//
// O aviso e o erro ficam onde estão, e é uma decisão e não um esquecimento: um
// aviso que toma a cor do esquema deixa de se distinguir do resto, e um erro em
// cião não é um erro. A cor deles é o que eles significam — a semântica não é
// decoração, e num ecrã de dinheiro isso importa.
const TILE = {
  info: { border: (t) => t.accent, bg: (t) => comAlfa(t.accent, t.dark ? 0.18 : 0.09), icon: 'infoCircle' },
  warn: { border: (t) => t.state.warn, bg: (t) => t.tileWarn, icon: 'exclamation' },
  err:  { border: (t) => t.state.err,  bg: (t) => t.tileErr,  icon: 'lock' },
};

export const Tile = ({ t, kind = 'info', icon, children }) => {
  const k = TILE[kind] || TILE.info;
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: R.card, borderWidth: 1,
      borderColor: k.border(t), backgroundColor: k.bg(t) }}>
      <Icon name={icon || k.icon} size={20} color={k.border(t)} />
      <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 14.5, lineHeight: 21, color: t.text2 }}>{children}</Text>
    </View>
  );
};

// O aviso de «não há nada aqui».
//
// ── Era uma caixa tracejada, alta e centrada ────────────────────────────────
//
// Ícone grande por cima, título ao centro, dica por baixo, contorno a
// tracejado. Ocupava cerca de 120 px para dizer uma frase, e uma app com três
// secções vazias — o que é uma casa nova — ficava com três placas a dizer que
// não havia nada, cada uma maior do que o conteúdo que substituía.
//
// Passa a ser a mesma caixa do `Tile` de informação: uma linha, ícone à
// esquerda, contorno azul. É o aviso que a app já usava para «Não há contas a
// acertar nesta casa», e é o que faz um ecrã vazio parecer arrumado em vez de
// abandonado.
//
// A API não muda — `icon`, `title`, `hint` — para os quinze sítios que o
// chamam não precisarem de saber disto.
export const Empty = ({ t, icon, title, hint }) => (
  <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: R.card,
    borderWidth: 1, borderColor: t.accent, backgroundColor: comAlfa(t.accent, t.dark ? 0.18 : 0.09) }}>
    <Icon name={icon || 'infoCircle'} size={20} color={t.titulo} />
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: FONT.body, fontSize: 14.5, lineHeight: 21, color: t.text2 }}>{title}</Text>
      {/* A dica fica: é ela que diz o que fazer a seguir, e um aviso que só
          constata é meio aviso. Vai por baixo, mais pequena, e não numa
          segunda caixa. */}
      {hint ? (
        /* `text2`, não `text3`: o tijolo do vazio é tingido com o acento, e
           sobre ele o `text3` dava 3,75 a 11,5 px. (Comentário JS e não JSX:
           está dentro do ternário, ao lado de um só elemento.) */
        <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text2 }}>{hint}</Text>
      ) : null}
    </View>
  </View>
);

// Paginação: acima de cinco itens
// Quantos itens antes de a lista se partir em páginas.
//
// ⚠ Eram CINCO, e cinco é pouco (15/09/2026: «a lista não precisa de ter
// paginação a não ser que não caiba no ecrã»). Com oito tarefas, a lista partia
// ao meio e a oitava só existia depois de tocar numa seta — quando a área de
// conteúdo rola, e rolar é o gesto que toda a gente já faz. Doze linhas de 52
// px são 624 px: mais do que um ecrã, e a rolagem resolve-o sem um controlo
// novo. Acima disso a página serve para alguma coisa.
export const PAGINA = 12;

export const usePaged = (list, size = PAGINA) => {
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(page, pages - 1);
  return {
    slice: list.slice(p * size, p * size + size),
    paged: list.length > size,
    label: `${list.length} no total · ${p + 1} de ${pages}`,
    prev: p > 0 ? () => setPage(p - 1) : null,
    next: p < pages - 1 ? () => setPage(p + 1) : null,
  };
};

export const Pager = ({ t, pg }) => !pg.paged ? null : (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, paddingTop: S.md }}>
    <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>{pg.label}</Text>
    <Tap onPress={pg.prev} label="Página anterior"
      style={{ borderWidth: 1, borderColor: t.border, borderRadius: R.row, opacity: pg.prev ? 1 : 0.35 }}>
      <Icon name="caretLeft" size={16} color={t.text3} />
    </Tap>
    <Tap onPress={pg.next} label="Página seguinte"
      style={{ borderWidth: 1, borderColor: t.border, borderRadius: R.row, opacity: pg.next ? 1 : 0.35 }}>
      <Icon name="caretRight" size={16} color={t.text3} />
    </Tap>
  </View>
);
