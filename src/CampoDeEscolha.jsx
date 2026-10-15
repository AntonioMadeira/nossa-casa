import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { S, R, FONT } from './theme';
import Icon from './Icon';
import Sheet from './Sheet';
import { Label, Linha, Empty, MarcaDeEstado, MARCA, MARCA_DA_CRIANCA } from './ui';
import { normalizar } from './pesquisa';

// ── UM CAMPO QUE ABRE A LISTA ────────────────────────────────────────────────
//
// 25/09/2026. Ele viu a folha do artigo e disse: «arranja uma solução melhor
// para os filtros dos corredores, quando forem muitos vão ocupar muito espaço».
// Tinha razão, e o simulador de `design/escolher-corredor.dc.html` mediu-o:
//
//   corredores        4      8     15     27
//   pastilhas       149    197    293    485 px
//   este campo       83     83     83     83 px
//
// Escolheu a opção B. A altura do campo não depende de quantas opções há — é
// essa a propriedade toda.
//
// ── Porque é que não é mais uma fila de pastilhas ────────────────────────────
//
// A fila de pastilhas é ótima até caber numa linha e passa a ser o maior campo
// da folha logo a seguir. Numa folha com seis campos, o que decide o desenho
// não é como o campo fica com QUATRO opções — é como fica com as que a casa
// vier a ter. E os corredores são inventados pela família: não há número máximo.
//
// ── O que este campo NÃO é ───────────────────────────────────────────────────
//
// ⚠ Não é para escolhas fixas e curtas. «A casa toda / Só os adultos», os dias
// da semana, «Uma vez / Todas as semanas» — essas ficam em `Choice` e em
// `Segmented`, onde estão bem: são duas ou três, nunca crescem, e esconder duas
// opções atrás de um toque é pior do que mostrá-las. Este campo é para o que
// CRESCE COM A CASA.
//
// ⚠ E não é um filtro de navegação. O Modo Compras percorre os corredores com
// abas que mostram, na cor de cada uma, o que já está despachado — isso é um
// mapa do percurso, não um campo de formulário, e trocá-lo por isto perdia a
// informação que ele dá de relance.

// Acima disto, a folha ganha um campo que filtra. Doze é onde uma lista deixa
// de se varrer com os olhos e passa a precisar de ser procurada — e é o mesmo
// número a que a grelha de ícones dos corredores já se agrupa por famílias.
export const PESQUISA_ACIMA_DE = 12;

// ── A linha de uma opção, dentro da folha ────────────────────────────────────
//
// ⚠ A marca da escolha é a `MarcaDeEstado`, e não uma linha pintada de acento:
// é o mesmo visto que marca uma tarefa feita ou um artigo apanhado, e quer
// dizer sempre a mesma coisa — «isto foi o que esta pessoa escolheu ao tocar».
// Uma quarta forma de marcar uma escolha era o defeito que o `EscolherPessoa`
// já veio resolver uma vez.
function OpcaoDaFolha({ t, opcao, escolhida, grande, aoTocar, ultima }) {
  return (
    <Linha t={t} last={ultima}>
      <Pressable onPress={aoTocar}
        accessibilityRole="button"
        accessibilityState={{ selected: escolhida }}
        aria-pressed={escolhida}
        accessibilityLabel={opcao.rotulo || opcao.titulo}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12,
          minHeight: grande ? 52 : 44, opacity: pressed ? 0.6 : 1,
        })}>
        {opcao.leading || null}
        {/* ⚠ Só se houver ícone. Um `<Icon name={null}>` desenha um SVG VAZIO do
            tamanho pedido, sem erro nenhum — e a coluna dos nomes ficava com um
            degrau. Com os ícones dos corredores desligados, `icone` vem nulo. */}
        {opcao.icone ? (
          <Icon name={opcao.icone} size={grande ? 21 : 19} color={t.titulo} />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontFamily: FONT.body,
            fontSize: grande ? 16 : 15,
            fontWeight: escolhida ? '600' : '400',
            color: escolhida ? t.actFg : t.text2 }}>
            {opcao.titulo}
          </Text>
          {opcao.sub ? (
            <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
              {opcao.sub}
            </Text>
          ) : null}
        </View>
        {escolhida ? (
          <MarcaDeEstado t={t} estado="marcado" size={grande ? MARCA_DA_CRIANCA : MARCA} />
        ) : null}
      </Pressable>
    </Linha>
  );
}

/**
 * `opcoes`: `[{ valor, titulo, sub?, icone?, leading?, rotulo? }]`
 *   `valor` é o que se guarda, `titulo` o que se lê, `rotulo` o que se diz em
 *   voz alta se for diferente do título.
 * `valor`: o `valor` escolhido, ou nulo.
 * `aoEscolher(valor)`: chamado ao tocar. A folha fecha-se sozinha — uma escolha
 *   única não precisa de um «Guardar» a seguir, e o `EscolherPessoa` faz o mesmo.
 * `grande`: a app da criança, que tem a letra e as linhas maiores por decisão.
 */
export default function CampoDeEscolha({
  t, rotulo, valor, opcoes = [], aoEscolher,
  titulo, sub, porEscolher = 'Por escolher', vazio, dicaVazia, iconeDoCampo, acaoVazia,
  grande = false, pesquisaAcimaDe = PESQUISA_ACIMA_DE,
}) {
  const [aberto, setAberto] = useState(false);
  const escolhida = opcoes.find(o => o.valor === valor) || null;
  const fechar = () => setAberto(false);

  // ⚠ Sem opções NENHUMAS não há campo: há um vazio que diz porquê. Um campo
  // que se abre para uma lista em branco é uma promessa que não se cumpre — e
  // a folha de marcar consulta da Saúde já fazia assim antes deste componente
  // existir, com a dica a mudar conforme quem olha pode ou não criar a primeira.
  if (!opcoes.length) {
    return (
      <View style={{ gap: S.sm }}>
        {rotulo ? <Label t={t}>{rotulo}</Label> : null}
        <Empty t={t} icon={iconeDoCampo || 'closeCircle'}
          title={vazio || 'Nada para escolher.'} hint={dicaVazia} />
        {/* A saída, quando quem olha a pode dar: criar a primeira opção. */}
        {acaoVazia || null}
      </View>
    );
  }

  return (
    <View style={{ gap: S.sm }}>
      {rotulo ? <Label t={t}>{rotulo}</Label> : null}

      {/* ── O campo ────────────────────────────────────────────────────────────
          Tem a forma dos outros campos da folha — 44 de mínimo, a borda e o
          fundo do `TextInput` ao lado —, porque é um campo e não uma linha de
          lista. Uma `Row` aqui trazia a divisória por baixo e alinhava com nada.

          ⚠ `caretDown` e não `caretRight`: o `caretRight` da `Row` quer dizer
          «leva a outro sítio», e isto não leva a lado nenhum — abre uma lista e
          volta ao mesmo sítio. Um ícone com dois sentidos é pior do que um ícone
          menos evocativo (CLAUDE.md).

          ⚠ 44 de altura, e não os 52 do protótipo. É a medida que a folha de
          marcar consulta já tinha escolhido, e a razão dela vale para todas as
          folhas: os campos vizinhos — o nome, a nota, o médico — são caixas de
          44, e um campo de 52 no meio deles destoa. Copiar o protótipo só neste
          era divergir dos vizinhos, que é pior do que divergir por inteiro. */}
      <Pressable onPress={() => setAberto(true)}
        accessibilityRole="button"
        // ⚠ O nome do campo E o valor dele, que é o que um leitor de ecrã tem
        // de dizer: «Corredor: Frescos». Sem o valor lá dentro, quem não vê o
        // ecrã toca no campo para descobrir o que já lá está — e abrir uma
        // folha para ler um valor é a definição de um campo que não se anuncia.
        accessibilityLabel={escolhida
          ? `${rotulo || titulo || 'Escolher'}: ${escolhida.titulo}`
          : `${rotulo || titulo || 'Escolher'} — por escolher`}
        accessibilityHint="Abre a lista para escolher"
        style={({ pressed }) => ({
          minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 14, borderRadius: R.row, borderWidth: 1,
          borderColor: t.border, backgroundColor: t.card,
          opacity: pressed ? 0.7 : 1,
        })}>
        {escolhida && escolhida.leading ? escolhida.leading : null}
        {/* ⚠ Duas cores, porque são duas coisas. O ícone de uma OPÇÃO é parte do
            valor — o corredor É o seu ícone, e leva o `titulo`, que é o acento
            já clareado até aos 3:1 que um objeto gráfico pede. O `iconeDoCampo`
            é mobília: diz de que campo se trata quando a opção não tem desenho
            próprio (o `heartPulse` da especialidade), e fica em `text3` como os
            ícones dos campos vizinhos. */}
        {escolhida && escolhida.icone ? (
          <Icon name={escolhida.icone} size={grande ? 21 : 19} color={t.titulo} />
        ) : iconeDoCampo ? (
          <Icon name={iconeDoCampo} size={grande ? 21 : 19} color={t.text3} />
        ) : null}
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.body,
          fontSize: grande ? 16 : 15,
          color: escolhida ? t.text2 : t.text3 }}>
          {escolhida ? escolhida.titulo : porEscolher}
        </Text>
        <Icon name="caretDown" size={18} color={t.text3} />
      </Pressable>

      {/* ── A folha ────────────────────────────────────────────────────────────
          ⚠ Desenha-se AQUI, dentro da folha que a abriu, e não fora dela. É o
          mesmo arranjo do avatar sobre o Perfil, e a razão está escrita lá: o
          INVARIANTE #1 quer o rodapé como último filho da raiz da app, e uma
          folha aberta fora desta árvore levava-o com ela. Na web a animação das
          folhas está desligada de propósito — o `slide` do react-native-web
          deixava a segunda folha PRESA fora do ecrã (ver `Sheet.jsx`). */}
      {aberto ? (
        <Sheet t={t} title={titulo || rotulo} sub={sub} onClose={fechar}>
          <ListaDeEscolha t={t} valor={valor} opcoes={opcoes} grande={grande}
            nomeDaLista={titulo || rotulo} vazio={vazio} pesquisaAcimaDe={pesquisaAcimaDe}
            aoEscolher={(v) => { if (aoEscolher) aoEscolher(v); fechar(); }} />
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * A LISTA sozinha — a mesma que o campo abre, para quem JÁ está dentro de uma
 * folha e não precisa de abrir outra.
 *
 * ⚠ Existe por causa da folha «Onde» do «Como fazemos compras»: lá a linha que
 * abre já existe (é a «onde» do plano da ida), e pôr um campo lá dentro era
 * abrir uma folha a partir de uma folha para escolher o mesmo. A forma da lista
 * é que tem de ser a mesma — o que se unifica é o DESENHO da escolha, não o
 * número de camadas.
 */
export function ListaDeEscolha({
  t, valor, opcoes = [], aoEscolher, grande = false,
  nomeDaLista, vazio, pesquisaAcimaDe = PESQUISA_ACIMA_DE,
}) {
  const [termo, setTermo] = useState('');
  const comPesquisa = opcoes.length > pesquisaAcimaDe;

  // ⚠ A pesquisa é a mesma da app (`src/pesquisa.js`): sem acentos e sem
  // maiúsculas. Escrever «laticinios» tem de encontrar «Laticínios» — quem
  // procura à pressa não vai buscar o acento.
  const visiveis = useMemo(() => {
    const q = normalizar(termo).trim();
    if (!q) return opcoes;
    return opcoes.filter(o => normalizar(`${o.titulo} ${o.sub || ''}`).includes(q));
  }, [opcoes, termo]);

  return (
    <View style={{ gap: S.md }}>
      {comPesquisa ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
          minHeight: 44, paddingHorizontal: 13, borderRadius: R.row,
          borderWidth: 1, borderColor: t.border, backgroundColor: t.card }}>
          <Icon name="search" size={17} color={t.text3} />
          <TextInput value={termo} onChangeText={setTermo}
            placeholder="Procurar" placeholderTextColor={t.text3}
            accessibilityLabel={`Procurar ${String(nomeDaLista || '').toLowerCase()}`.trim()}
            autoCorrect={false}
            style={{ flex: 1, minHeight: 44, fontFamily: FONT.body,
              fontSize: grande ? 16 : 15, color: t.text2, outlineStyle: 'none' }} />
          {termo ? (
            <Pressable onPress={() => setTermo('')} accessibilityRole="button"
              accessibilityLabel="Limpar a pesquisa" hitSlop={8}
              style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={17} color={t.text3} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ⚠ A lista rola DENTRO da folha e não com ela. A folha já tem um
          `ScrollView`, e sem esta altura travada a lista empurrava o campo de
          pesquisa para fora do ecrã assim que passasse de umas dezenas — que é
          o problema que este campo veio resolver, um andar acima. */}
      {visiveis.length ? (
        <ScrollView style={{ maxHeight: grande ? 400 : 360 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: S.xs }}>
          {visiveis.map((o, i) => (
            <OpcaoDaFolha key={String(o.valor)} t={t} opcao={o} grande={grande}
              escolhida={o.valor === valor}
              ultima={i === visiveis.length - 1}
              aoTocar={() => { if (aoEscolher) aoEscolher(o.valor); }} />
          ))}
        </ScrollView>
      ) : (
        <Empty t={t} icon={termo ? 'search' : 'closeCircle'}
          title={termo ? 'Nada com esse nome.' : (vazio || 'Nada para escolher.')}
          hint={termo ? 'Experimente escrever menos letras.' : undefined} />
      )}
    </View>
  );
}
