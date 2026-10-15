import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useStore } from '../store';
import { S, R, FONT, onChrome } from '../theme';
import { EUR, warrantyDaysLeft, plural, mesSeguinte, TODAY_KEY } from '../format';
import { Card, SectionTitle, Linha, Label, Pill, Row, Bar, Primary, AddButton, Toggle, Empty, usePaged, Pager, Opcao, NumField, BotaoCompacto, Avatar, avatarDe } from '../ui';
import { EscolherPessoa } from '../FiltroDeMembros';
import CampoDeEscolha from '../CampoDeEscolha';
import Icon from '../Icon';
import Sheet from '../Sheet';
import Confirm from '../Confirm';
import NovaMeta from '../sheets/NovaMeta';
import GerirMeta from '../sheets/GerirMeta';
import Cofre from '../sheets/Cofre';
import NovaContaFixa from '../sheets/NovaContaFixa';
import GerirContaFixa from '../sheets/GerirContaFixa';
import ExtractoDoMes from '../sheets/ExtractoDoMes';
import { estadoDaConta, totalDasContas } from '../contas-fixas';

// ⚠ O `NumField` mudou-se para o `ui.jsx`, e continua a ser importado daqui
// para quem o leia por este nome. Vivia neste ecrã e era o controlo partilhado
// de todos os valores — o que fez com que a Gestão, que não pode importar um
// ecrã, escrevesse a sua própria versão sem campo de texto.
export { NumField } from '../ui';

// (A `GrelhaEnvelopes` viveu aqui até 26/09/2026 — grelha de dois a 47 %, com o
// «livre X €» por baixo do nome. Nasceu porque «eram oito linhas de largura
// total, 48 px cada: a folha não cabia e o campo do valor ficava cortado a meio
// pelo botão» — e essa razão é exactamente o que o `CampoDeEscolha` resolve.
// Saiu com as outras duas formas de escolher um envelope.)


export default function Dinheiro({ t, user, onEquip }) {
  const st = useStore();
  const { s, set, envelopes, budget, spent, remaining, mesAberto, allEquip, isAdmin, membros: MEMBERS, adultos, criancas, acerto, acertado, pagarAcerto, oNome, aoNome, moverEntreEnvelopes, registarDespesa,
          abrirMes, fecharMes, rendimentoDoMes, metas, reforcarMeta, apagarMeta, kidPts, pontosNasTarefas,
          contasDoMes, pagarContaFixa, apagarContaFixa, extractoDoMesAberto, extractosDaCasa } = st;
  const [sheet, setSheet] = useState(null);
  // O extracto com a folha aberta — o do mês em curso, ou o do que acabou de
  // fechar. A folha traz o arquivo todo lá dentro e abre neste.
  const [extracto, setExtracto] = useState(null);
  const [cofre, setCofre] = useState(null);      // criança cujo cofre está aberto
  const [meta, setMeta] = useState(null);        // id da meta com a folha aberta
  const [metaAApagar, setMetaAApagar] = useState(null);
  const [conta, setConta] = useState(null);      // id da conta fixa com a folha aberta
  const [contaAApagar, setContaAApagar] = useState(null);
  const [erroConta, setErroConta] = useState(null);
  // O que vai para uma meta ao fechar o mês. Em EUROS, e nunca uma fracção.
  const [fecho, setFecho] = useState({ meta: null, valor: null });
  // ⚠ NOMES, e não índices (26/09/2026). Isto era `{ from: 0, to: 3 }` — os
  // quatro envelopes da demonstração — e uma casa com dois não tem
  // `envelopes[3]`: a frase de baixo lia `.name` de `undefined`. Corrigiu-se
  // em 13/09 a PRENDER os índices à lista da casa, que é um remendo sobre a
  // causa: um índice guardado numa lista que a casa reordena aponta para
  // outra coisa a cada mudança (a classe 41 desta casa). Um nome ou existe
  // ou não existe, e a verificação é uma linha.
  const [mv, setMv] = useState({ de: null, para: null, amount: 0 });
  // ⚠ O envelope da despesa guarda-se pelo NOME, como o do «Mover»
  // (26/09/2026). Era um índice, e um índice numa lista que a casa reordena
  // aponta para outra coisa a cada mudança — a classe 41 desta casa. Nulo
  // quer dizer «o primeiro da casa», que é o que o índice 0 queria dizer.
  const [exp, setExp] = useState({ amount: 0, env: null, payer: user, split: true });
  const [settle, setSettle] = useState({ mode: 'all', customAmount: 0 });
  const [openMonth, setOpenMonth] = useState({ envelopes: {} });

  const admin = isAdmin(user);
  // O que já se gastou do orçamento. É isto que a barra mede.
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  // Quanto falta acertar, e entre quem. Vem da loja: era 86,5 escrito aqui e
  // outra vez no Início, com os nomes «Tomás» e «Rita» no meio do texto.
  const settleBase = acerto ? acerto.valor : 0;
  // Quantas despesas deste mês entram no acerto. Era «14», escrito à mão.
  const despesasPartilhadas = s.despesasMeias || 0;

  // ⚠ A frase debaixo da barra dizia «{pct} % dos {budget} atribuídos aos
  // envelopes. Sobram {rendimento − budget} sem envelope.» — e as duas metades
  // não eram sobre o mesmo bolo:
  //
  //   · a primeira dividia o GASTO pelo ORÇAMENTO  (1 248,64 / 2 020 = 62 %)
  //   · a segunda subtraía o orçamento ao RENDIMENTO (3 200 − 2 020 = 1 180 €)
  //
  // Lidas juntas, mentiam: «62 % dos 2 020 € atribuídos aos envelopes» quando
  // 100 % dos 2 020 € estão atribuídos por definição — o orçamento É a soma dos
  // envelopes (INVARIANTE #2). E ninguém reparou porque 2 020/3 200 dá 63 %,
  // um ponto ao lado dos 62 % que apareciam por acidente.
  //
  // A frase é sobre o rendimento: quanto dele foi para envelopes, e quanto
  // ficou de fora. E é toda em euros — a percentagem obrigava a família a fazer
  // a conta de cabeça para saber de quanto dinheiro se estava a falar, num ecrã
  // onde todos os outros números já são euros. As três parcelas somam.
  const rendimento = rendimentoDoMes || 0;
  const semEnvelope = Math.max(0, rendimento - budget);
  // Os meses vêm do `format.js`, onde já viviam. Uma segunda lista escrita à
  // mão aqui era um sítio a mais para divergir — e divergiu: esta tinha os
  // acentos certos e ninguém garantia que continuasse.
  const proximoMes = mesSeguinte(s.monthName);

  const eq = allEquip();
  const eqWarn = eq.filter(x => { const d = warrantyDaysLeft(x); return d >= 0 && d <= 90; }).length;
  const eqOut = eq.filter(x => warrantyDaysLeft(x) < 0).length;

  const freeOf = (i) => Math.max(0, envelopes[i].limit - envelopes[i].used);
  const envPg = usePaged(envelopes);

  // ── As contas fixas deste mês ─────────────────────────────────────────────
  //
  // Por pagar primeiro, pelo dia; as pagas no fim. A «próxima» é a primeira
  // por pagar — é a que o botão de baixo oferece marcar, como no desenho
  // («Marcar a EDP como paga»). A folha de cada conta também o faz.
  const contas = contasDoMes();
  const proximaConta = contas.find(c => !c.paga) || null;
  const contaAberta = contas.find(c => c.id === conta) || null;
  const contaAApagarObj = contas.find(c => c.id === contaAApagar) || null;
  // A pastilha do estado, por tom. `ok` sobre a tinta com alfa leva o
  // `okTexto`; `warn` é o tijolo OPACO e só aceita o `warnDeep`; `err` é alfa e
  // leva o `errTexto` — os três papéis de cada estado (CLAUDE.md).
  const pastilhaDe = (c) => {
    const e = estadoDaConta(c);
    if (!e) return null;
    const cores = {
      ok:   { fg: t.state.okTexto,  bg: t.state.okBg,   border: t.state.okBorder },
      warn: { fg: t.state.warnDeep, bg: t.state.warnBg, border: t.state.warn },
      err:  { fg: t.state.errTexto, bg: t.state.errBg,  border: t.state.err },
    }[e.tom];
    return <Pill label={e.texto} {...cores} />;
  };
  const marcarPaga = (id) => {
    const msg = pagarContaFixa(id, user);
    setErroConta(msg || null);
  };

  const handleSettle = () => {
    let amount = settleBase;
    if (settle.mode === 'half') {
      amount = settleBase / 2;
    } else if (settle.mode === 'custom') {
      amount = settle.customAmount;
    }

    // ⚠ Quem paga a quem vai junto: sem isso o acerto não podia subir, e
    // ficava no telefone de quem carregou no botão enquanto o outro continuava
    // a ver a dívida por pagar. É dinheiro entre duas pessoas.
    pagarAcerto(amount, settle.mode === 'all' ? 'Acerto total'
      : settle.mode === 'half' ? 'Metade' : 'Valor à escolha',
      acerto && acerto.devedor, acerto && acerto.credor);
    setSheet(null);
    setSettle({ mode: 'all', customAmount: 0 });
  };

  const handleOpenMonth = () => {
    // ⚠ Os envelopes DESTA casa, e não o `ENV_BASE` do `data.js`.
    //
    // Cinco sítios deste ecrã liam as sementes da demonstração — quatro
    // envelopes com nomes que esta casa não tem. Abrir o mês distribuía o
    // rendimento por «Crianças & escola» e «Sair & lazer», que aqui não
    // existem, e os seis a sério ficavam sem limite nenhum.
    const envLimits = {};
    envelopes.forEach(e => {
      envLimits[e.name] = e.limit + (openMonth.envelopes[e.name] || 0);
    });

    // ⚠ Pelo `abrirMes` da loja, que também cria a linha no servidor — e fecha
    // a anterior antes de abrir a nova, para não haver dois meses abertos ao
    // mesmo tempo.
    //
    // O `monthName` era `'Setembro'` escrito à mão, com um TODO em inglês ao
    // lado. Abrir o mês em março punha a app a dizer «Orçamento de Setembro»
    // em quatro ecrãs. É o mês SEGUINTE ao aberto, que é o que o botão diz.
    abrirMes({ nome: proximoMes, limites: envLimits });
    setSheet(null);
  };

  // ── Quanto do saldo vai para uma meta ao fechar o mês ────────────────────
  //
  // ⚠ O protótipo dizia «30 % do que sobrou reforça as metas», e ficou por
  // aplicar meses porque uma percentagem escrita no código não é uma decisão da
  // família: 30 % de 771,36 € são 231,41 €, e ninguém escolheu esse número.
  //
  // Agora é um VALOR EM EUROS que quem administra escreve, com o saldo do mês
  // como sugestão. É a mesma razão pela qual a frase do orçamento deixou de
  // falar em percentagens: nesta app um número de dinheiro diz-se em euros, e
  // uma percentagem obriga a fazer a conta de cabeça para saber de quanto se
  // está a falar.
  //
  // Sugere-se o saldo inteiro e não uma fatia dele: quem quiser guardar menos
  // baixa o número, e assim a app não escolhe por ninguém.
  const paraMeta = fecho.valor === null ? Math.max(0, remaining) : fecho.valor;
  const metaDoFecho = metas.find(m => m.id === fecho.meta) || null;
  const vaiParaMeta = !!metaDoFecho && paraMeta > 0;

  // A meta com a folha aberta, e a que está a ser apagada. Lidas da lista para
  // continuarem a saber de qual falam depois de a lista já a não ter.
  const metaAberta = metas.find(m => m.id === meta) || null;
  const metaAApagarObj = metas.find(m => m.id === metaAApagar) || null;

  // Fecha o mês: zera o registo e os pontos pagos, e leva para uma meta o que
  // quem administra decidir — em euros.
  const handleCloseMonth = () => {
    // ⚠ O reforço ANTES do fecho, e é de propósito: o `fecharMes` limpa os
    // totais do mês, e a frase do registo tem de sair com o mês ainda aberto
    // para dizer de que mês veio o dinheiro.
    if (vaiParaMeta) {
      reforcarMeta(metaDoFecho.id, paraMeta, `Saldo de ${s.monthName}`, user);
    }
    fecharMesLimpando();
  };

  const fecharMesLimpando = () => {
    // O extracto do mês que se está a fechar, tirado ANTES do fecho: sem
    // servidor o `fecharMes` zera as somas de que ele é feito. Abre-se a
    // seguir, já como «mês fechado a hoje» (12/09/2026).
    const doMesQueFecha = extractoDoMesAberto();
    // ⚠ Pelo `fecharMes` da loja. Isto escrevia `registered: 0` e `envMove: {}`
    // — zero por cima de duas SOMAS. Com as despesas e as transferências no
    // servidor, as linhas ficavam e a leitura seguinte trazia o total de
    // volta: o mês fechado reabria sozinho.
    fecharMes();
    if (doMesQueFecha) setExtracto({ ...doMesQueFecha, aberto: false, fechadoEm: TODAY_KEY });
    // ⚠ E a escolha volta ao início. Sem isto, o valor escrito para o mês
    // passado ficava sugerido no fecho seguinte — um número de outro mês com
    // ar de sugestão desta.
    setFecho({ meta: null, valor: null });
    setSheet(null);
  };

  return (
    <>
      {/* Sem título de secção — na referência 05 este cartão abre o ecrã. A
          linha da direita dizia só «de 1770,00 €»; falta-lhe o gasto, que é o
          número que explica o disponível. */}
      <Card t={t} style={{ gap: S.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label t={t}>Disponível</Label>
            <Text style={{ fontFamily: FONT.display, fontSize: 28,
              color: remaining >= 0 ? t.state.okTexto : t.state.errTexto }}>{EUR(remaining)}</Text>
          </View>
          <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3, textAlign: 'right' }}>
            {EUR(spent)} gastos{'\n'}de {EUR(budget)}
          </Text>
        </View>
        <Bar t={t} pct={pct} color={t.titulo} />
        {/* Sem rendimento declarado não há nada de que atribuir: a frase
            calava-se a meio («0 % dos 0,00 €») em vez de se calar toda. */}
        {rendimento > 0 ? (
          <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 18, color: t.text3 }}>
            {EUR(budget)} dos {EUR(rendimento)} atribuídos aos envelopes.
            {semEnvelope > 0 ? ` Sobram ${EUR(semEnvelope)} sem envelope.` : ''}
          </Text>
        ) : null}

        {/* ── O extracto, dentro deste cartão ───────────────────────────────
            17/09/2026, onde ele o quis: «logo abaixo dos valores atribuídos e
            dentro do cabeçalho». Cada movimento de dinheiro da casa, por ordem
            do tempo, com quem o fez e o saldo a seguir a ele — e todos os meses
            em arquivo dentro da própria folha. Exporta em PDF.

            ⚠ Substituiu o «Retrato do Mês», que era a SOMA das mesmas linhas e
            vivia numa secção sua a responder à mesma pergunta com menos
            detalhe.

            Para qualquer adulto, não só quem administra: é ler, não decidir.

            ⚠ Uma régua por cima, e não um cartão dentro do cartão: o número
            grande e a barra são o estado de hoje, e isto é a porta para o
            passado. A divisória diz que muda de assunto sem abrir uma caixa.

            ⚠ E a LINHA APARECE SEMPRE, mesmo sem movimentos — sem servidor não
            há linhas de despesa e o extracto vem vazio. Estava escrito
            `{e ? … : null}`, e o resultado foi ele a perguntar «onde está o
            extracto?» com a app à frente: uma funcionalidade que desaparece
            sem dizer porquê é pior do que uma que diz que está vazia.
            É a mesma lição do rodapé e dos botões mortos — o ecrã tem de
            contar o que se passa, não calar-se. */}
        {(() => {
          const e = extractoDoMesAberto();
          const nome = e ? e.nome : `${s.monthName} de ${TODAY_KEY.slice(1, 5)}`;
          const quantos = e ? e.movimentos.length : 0;
          return (
            <Pressable onPress={() => setExtracto(e)} accessibilityRole="button"
              accessibilityLabel={`Extracto de ${nome} · ${plural(quantos, 'movimento', 'movimentos')}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md,
                minHeight: 44, marginTop: S.xs, paddingTop: S.md,
                borderTopWidth: 1, borderTopColor: t.divider, opacity: pressed ? 0.6 : 1 })}>
              <Icon name="fileText" size={20} color={t.titulo} />
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 14.5, color: t.text2 }}>
                  {`Extracto de ${nome}`}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
                  {quantos > 0
                    ? `${plural(quantos, 'movimento', 'movimentos')} · exporta em PDF`
                    : 'sem movimentos registados neste mês'}
                </Text>
              </View>
              <Icon name="caretRight" size={18} color={t.text3} />
            </Pressable>
          );
        })()}
      </Card>

      {/* Registar despesa é a acção mais frequente deste ecrã e estava no fim
          do cartão dos envelopes, como um «+ registar despesa» pequeno. Na
          referência é a primeira linha depois do saldo. */}
      {/* O botão de acrescentar da app — o tracejado em minúsculas das
          Tarefas, da Agenda e dos Equipamentos (revisão de 14/09/2026). Era
          uma linha com «+» dentro de um cartão: a terceira forma de
          «acrescentar» na mesma app. */}
      <AddButton t={t} label="registar despesa" onPress={() => setSheet('despesa')} />

      {/* ⚠ Aqui estava uma TERCEIRA porta para «Abrir o mês»: uma `Row` com
          ícone e seta, debaixo do título «Envelopes», a abrir a mesma folha que
          o botão da Administração deste ecrã — que por sua vez já é o par do
          cartão da Gestão. Duas formas da mesma decisão no MESMO ecrã, uma
          delas arrumada numa secção a que não pertence (abrir o mês não é um
          envelope).

          E não eram iguais por dentro: esta chamava `setSheet('openMonth')` e
          mais nada, deixando lá a distribuição de uma tentativa anterior; o
          botão limpa-a com `setOpenMonth({ envelopes: {} })` antes de abrir.
          Duas portas para a mesma folha, com dois comportamentos.

          Fica a da Administração, que anda em par com «Fechar Setembro»: abrir
          e fechar o mês são a mesma espécie de decisão e leem-se juntas. */}
      <View>
        <SectionTitle t={t}>Envelopes</SectionTitle>
        {envelopes.length === 0 ? (
          <Empty t={t} icon="wallet" title="Sem envelopes."
            hint="Crie-os na Gestão da Casa e abra o mês para os alimentar." />
        ) : (
        <View>
          {/* Um envelope por linha plana, sem cartão — desenho C (09/09/2026). */}
          {envPg.slice.map((e, i) => {
            const tight = e.limit > 0 && e.used / e.limit >= 0.94;
            return (
              <Linha key={e.name} t={t} style={{ gap: S.md, paddingVertical: S.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: S.md }}>
                  <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>{e.name}</Text>
                  <Text style={{ fontFamily: FONT.ui, fontSize: 13,
                    color: tight ? t.state.errTexto : t.text3 }}>{EUR(e.used)} / {EUR(e.limit)}</Text>
                </View>
                {/* ⚠ `|| t.accent`: os envelopes da casa vêm do servidor com
                    `cor` vazia — só as sementes tinham cor —, e uma barra
                    pintada com `null` é transparente: cinco barras que
                    pareciam a zero com 546,60 € de 590,00 € escrito ao lado.
                    O dono da casa perguntou porque não enchiam. A cor do
                    esquema é a mesma da barra do orçamento e das metas. */}
                <Bar t={t} pct={e.limit > 0 ? (e.used / e.limit) * 100 : 0} color={e.color || t.titulo} height={6} />
                {tight ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                    {/* ⚠  e não : o `#FAAD14` sobre o cartão mede 1,85:1, e
                        um ícone pede 3. O texto ao lado dele já usava o token certo. */}
                    <Icon name="warning" size={16} color={t.state.warnTexto} />
                    <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 11.5, color: t.state.warnTexto }}>
                      Restam {EUR(e.limit - e.used)} neste envelope.
                    </Text>
                    {/* «Reforçar» leva à folha de mover dinheiro — o passo
                        seguinte óbvio quando um envelope está no limite. */}
                    {/* ⚠ Abria a folha sem escolher nada: «Reforçar o
                        Transportes» aparecia com Imprevistos → Saúde. Agora o
                        envelope apertado é o destino e a origem é o que tem
                        mais livre (13/09/2026). `i` é o índice NA PÁGINA — o
                        índice da lista inteira procura-se pelo nome. */}
                    <Pressable onPress={() => {
                        let de = null;
                        envelopes.forEach((x, j) => {
                          if (x.name !== e.name && (de === null || freeOf(j) > freeOf(envelopes.findIndex(y => y.name === de)))) de = x.name;
                        });
                        setMv(m => ({ ...m, para: e.name, de: de || e.name }));
                        setSheet('mover');
                      }} accessibilityRole="button"
                      accessibilityLabel={`Reforçar o envelope ${e.name}`}
                      style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: '700', color: t.actFg }}>
                        Reforçar
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Linha>
            );
          })}
          <Pager t={t} pg={envPg} />
          <AddButton t={t} label="mover dinheiro entre envelopes" onPress={() => setSheet('mover')} />
        </View>
        )}
      </View>

      {/* ── As contas fixas ─────────────────────────────────────────────────
          A renda, a luz, a internet (12/09/2026, a quarta das dez
          funcionalidades). Uma linha por conta, plana — desenho C —, com o
          dia, o envelope e quem paga por baixo do nome, a pastilha do estado
          e o valor à direita. A linha toda abre a folha da conta; o botão de
          baixo marca a PRÓXIMA por pagar, como no desenho. Um alvo por linha.

          ⚠ «Paga» não é um campo: é a despesa deste mês a apontar para a
          conta (INVARIANTE #2). Marcar regista uma despesa normal no envelope
          — o gasto, a barra e a conta entre os dois mexem como com qualquer
          outra. O total à direita do título é a SOMA das linhas mostradas. */}
      <View>
        <SectionTitle t={t} right={contas.length ? (
          <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
            {`${EUR(totalDasContas(contas))} por mês`}
          </Text>
        ) : null}>Contas Fixas</SectionTitle>
        {contas.length === 0 ? (
          <Empty t={t} icon="wallet" title="Sem contas fixas."
            hint="A renda, a luz, a internet: o que se paga todos os meses no mesmo dia, e entra no envelope com um toque." />
        ) : (
          <View>
            {contas.map((c, i) => (
              <Linha key={c.id} t={t} last={i === contas.length - 1}
                tinta={c.paga ? t.state.okBg : undefined}>
                <Pressable onPress={() => setConta(c.id)} accessibilityRole="button"
                  // ⚠ O rótulo diz TUDO o que a linha mostra (26/09/2026).
                  // Dizia «nome · dia · valor» e mais nada: nem o envelope, nem
                  // o estado, nem quem paga. Para quem ouve o ecrã, o pagador
                  // nunca existiu — com corte ou sem ele, e é pior do que o
                  // corte. Quebrar o subtítulo resolve o que se vê; isto é o
                  // que se ouve, e custa uma cadeia de texto.
                  accessibilityLabel={[c.nome, `dia ${c.dia}`, c.envelope,
                    c.quemPaga ? `${c.quemPaga} paga` : null,
                    EUR(c.valor), c.paga ? 'paga' : null].filter(Boolean).join(' · ')}
                  accessibilityHint="Marcar como paga, alterar ou apagar a conta"
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md,
                    minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ flex: 1, gap: 2 }}>
                    {/* ⚠ O NOME INTEIRO, sem `numberOfLines` (25/09/2026). Tinha
                        uma linha só num espaço de ~180 px — ~24 caracteres a
                        15 px, contra os 60 que o campo aceita —, e «Mensalidade
                        da natação do Léo» e «Mensalidade da natação da Mia»
                        ficavam ambas «Mensalidade da natação d…», com valores e
                        dias diferentes ao lado. É dinheiro a ser marcado como
                        pago na conta errada. */}
                    <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>
                      {c.nome}
                    </Text>
                    {/* ⚠ E O SUBTÍTULO TAMBÉM (26/09/2026). Ontem escrevi aqui
                        que ele «fica numa linha: é composto pela app a partir de
                        pedaços curtos, e cortá-lo não confunde duas contas». A
                        segunda metade é verdade — o nome, que é o que distingue
                        duas contas, vai inteiro por cima. A primeira não era:
                        fui medir.

                        O que sobra para o texto depende do ESTADO da conta, e é
                        isso que torna o defeito traiçoeiro: a pastilha «atrasada
                        12 dias» mede 107 px e a «paga» mede 48. Num telefone de
                        402, o bloco tem 271 px sem pastilha, 215 com «paga» e
                        155 com «atrasada 12 dias». E o subtítulo mede:

                          «dia 15 · Mercearia · Rita paga»             158 px
                          «dia 15 · Casa & contas · Tomás paga»        198 px
                          «dia 15 · Crianças & escola · Tomás paga»    218 px

                        ⚠ Corrijo-me: escrevi primeiro que «corta sempre», e era
                        exagero. Corta onde DÓI — nas atrasadas e nas que vencem,
                        porque são essas que têm a pastilha larga. Na casa cheia
                        do `npm run simular:casa`, com cinco contas todas com
                        pagador, cortam TRÊS das cinco a 402 px e QUATRO a 375;
                        já pagas, não corta nenhuma. Ou seja: a app cala de quem
                        é a conta exactamente na lista que se lê para decidir o
                        que pagar.

                        E o que se perde é a cauda — o «Tomás paga», que é a
                        única coisa desta linha que diz de quem é a conta.

                        Quebra, como o nome por cima. Uma conta fixa é uma linha
                        de lista, e nesta app uma linha de lista não aperta o que
                        tem para dizer. */}
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
                      {[`dia ${c.dia}`, c.envelope, c.quemPaga ? `${c.quemPaga} paga` : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {pastilhaDe(c)}
                  <Text style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: '600', color: t.text2 }}>
                    {EUR(c.valor)}
                  </Text>
                  <Icon name="caretRight" size={16} color={t.text3} />
                </Pressable>
              </Linha>
            ))}
            {proximaConta ? (
              <View style={{ marginTop: S.md, gap: S.sm }}>
                {/* Botão comum: acrescenta uma despesa, não fecha nem apaga. */}
                <Primary t={t} comum label={`Marcar «${proximaConta.nome}» como paga`}
                  sub={`${EUR(proximaConta.valor)} em ${proximaConta.envelope} · ${proximaConta.quemPaga || user} paga`}
                  onPress={() => marcarPaga(proximaConta.id)} />
                {erroConta ? (
                  <Text style={{ fontFamily: FONT.ui, fontSize: 12.5, lineHeight: 19, color: t.state.errTexto }}>
                    {erroConta}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        <View style={{ marginTop: S.md }}>
          <AddButton t={t} label="acrescentar conta fixa" onPress={() => setSheet('novaConta')} />
        </View>
      </View>

      <View>
        <SectionTitle t={t}>Contas entre Nós</SectionTitle>
        <Card t={t} style={{ gap: S.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.body, fontSize: 16, color: t.text1 }}>
                {acertado ? 'Está tudo acertado'
                  : `${oNome(acerto.devedor)} deve ${aoNome(acerto.credor)} ${EUR(settleBase)}`}
              </Text>
              {/* ⚠ A linha de baixo contradizia a de cima.
                  Dizia «Sem valores pendentes entre os dois» sempre que
                  `clearedSeeds` fosse verdadeiro — ou seja, em toda a casa a
                  sério — mesmo com o título a dizer «A Rita deve ao António
                  83,67 €». Duas frases, uma por cima da outra, a dizer o
                  contrário uma da outra.

                  E o «14 despesas partilhadas este mês» era o número da
                  demonstração, escrito à mão. Agora conta as que há. */}
              <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
                {acertado
                  ? 'Sem valores pendentes entre os dois.'
                  : acerto && acerto.pago > 0
                    ? `Já foram acertados ${EUR(acerto.pago)} de ${EUR(acerto.base)}.`
                    : plural(despesasPartilhadas, 'despesa partilhada este mês',
                             'despesas partilhadas este mês')}
              </Text>
            </View>
            <Pill label={acertado ? 'Concluído' : 'A Decorrer'}
              // `infoDeep` sobre o tijolo azul-claro: o `info` dava 2,91.
              fg={acertado ? t.state.okTexto : t.state.infoDeep}
              bg={acertado ? t.state.okBg : t.state.infoBg}
              border={acertado ? t.state.okBorder : t.state.info} />
          </View>
          {/* Dinheiro entre pessoas — leva o acento, e diz para onde vai. */}
          <Primary t={t} disabled={acertado}
            label={acertado ? 'Contas Acertadas' : 'Acertar Contas'}
            sub={!acertado && acerto ? `${EUR(settleBase)} ${aoNome(acerto.credor)}` : null}
            onPress={() => { setSettle({ mode: 'all', customAmount: 0 }); setSheet('settle'); }} />
        </Card>
      </View>

      {/* ── Os cofres das crianças ─────────────────────────────────────────
          Veio das Tarefas (10/09/2026): o dono da casa achou que a semanada
          não fazia sentido junto das tarefas. O que as liga é só a origem dos
          pontos; o valor do ponto, o que está por pagar, o saldo e a folha do
          cofre são dinheiro da casa — e a Documentação já os descrevia aqui.
          Desenho B de `design/cofres-no-dinheiro.dc.html`: uma linha por
          criança, como os envelopes e as metas. A linha toda abre o cofre.

          ⚠ `?? 0` nas duas somas: uma criança acrescentada à casa não tem
          entrada em `paidPts`, e `numero - undefined` é NaN. */}
      {criancas.length ? (
        <View>
          <SectionTitle t={t} right={pontosNasTarefas && s.pointValue > 0 ? (
            <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>1 pt = {EUR(s.pointValue)}</Text>
          ) : null}>Cofres das Crianças</SectionTitle>
          {criancas.map((k, i) => {
            const pend = pontosNasTarefas ? (kidPts[k] ?? 0) - (s.paidPts[k] ?? 0) : 0;
            const saldo = st.vaultOf(k);
            return (
              <Linha key={k} t={t} last={i === criancas.length - 1}>
                <Pressable onPress={() => setCofre(k)} accessibilityRole="button"
                  accessibilityLabel={`Cofre ${st.deNome(k)} ${k}`}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12,
                    minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
                  <Avatar {...avatarDe(k, MEMBERS[k], t.text3)} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>{k}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
                      {pontosNasTarefas
                        ? `${plural(pend, 'ponto', 'pontos')}${s.pointValue > 0 ? ` · ${EUR(pend * s.pointValue)} por pagar` : ''}`
                        : 'Pontos desligados'}
                    </Text>
                    {/* O objetivo que a criança escolheu no cofre dela — o
                        adulto vê para que ela junta, e quanto falta. */}
                    {(s.objetivosCofre || {})[k] ? (
                      <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.actFg }}>
                        {`A juntar para «${s.objetivosCofre[k].nome}» · ${EUR(s.objetivosCofre[k].alvo)}`}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    {/* Negativo a vermelho: o cofre pode ficar a dever por uma retirada. */}
                    <Text style={{ fontFamily: FONT.ui, fontSize: 13, fontWeight: '600',
                      color: saldo < 0 ? t.state.errTexto : t.state.okTexto }}>{EUR(saldo)}</Text>
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: t.text3 }}>no cofre</Text>
                  </View>
                  <Icon name="caretRight" size={18} color={t.text3} />
                </Pressable>
              </Linha>
            );
          })}
        </View>
      ) : null}

      <View>
        <SectionTitle t={t}>Equipamentos da Casa</SectionTitle>
        <Linha t={t} last>
          <Row t={t} icon="camera" title="Equipamentos registados"
            // ⚠ Três contagens, três plurais escritos à mão. Com duas garantias a
            // expirar dizia «2 garantia a expirar»; com um equipamento,
            // «1 equipamentos». O `plural` do `format.js` faz as três.
            sub={`${plural(eq.length, 'equipamento', 'equipamentos')} · ${plural(eqWarn, 'garantia a expirar', 'garantias a expirar')} · ${eqOut} fora de garantia`}
            onPress={onEquip} last />
        </Linha>
      </View>

      {/* ── As metas da família ─────────────────────────────────────────────
          ⚠ Eram a constante `GOALS` do `data.js` desenhada e mais nada: não
          havia como criar, alterar, apagar nem reforçar, e a coleção `metas`
          existia no servidor desde o primeiro dia sem que o cliente lhe
          tocasse. Uma meta criada pela Rita não existia em sítio nenhum.

          ⚠ E tudo em EUROS. O protótipo punha uma percentagem ao lado do nome;
          a barra basta para o progresso, e um número de dinheiro nesta app
          diz-se em euros — senão a família faz a conta de cabeça para saber de
          quanto dinheiro se fala. */}
      <View>
        <SectionTitle t={t} right={
          <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
            {EUR(metas.reduce((n, g) => n + g.at, 0))}
          </Text>
        }>Metas da Família</SectionTitle>
        {!metas.length ? (
          <Empty t={t} icon="bank" title="Sem metas definidas."
            hint="Uma meta é um objetivo com valor e prazo, alimentado pelo que sobra dos envelopes." />
        ) : (
        <View>
          {/* Uma meta por linha plana, sem cartão — desenho C (09/09/2026). */}
          {metas.map((g, k) => {
            const falta = Math.max(0, g.of - g.at);
            return (
              <Linha key={g.id} t={t} last={k === metas.length - 1} style={{ gap: S.sm, paddingVertical: S.md }}>
                {/* A primeira linha é o destino: abre a gestão da meta. O
                    reforço é um alvo à parte, na linha de baixo — e não uma
                    pastilha dentro desta, que é o erro #6. */}
                <Pressable onPress={() => setMeta(g.id)} accessibilityRole="button"
                  accessibilityLabel={`${g.name} · ${EUR(g.at)} de ${EUR(g.of)}`}
                  accessibilityHint="Alterar a meta, reforçar, ou ver de onde veio o dinheiro"
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>
                    {g.name}
                  </Text>
                  <Text style={{ fontFamily: FONT.ui, fontSize: 12.5, color: t.text3 }}>
                    {EUR(g.at)} de {EUR(g.of)}
                  </Text>
                  <Icon name="caretRight" size={16} color={t.text3} />
                </Pressable>
                {/* O progresso de uma meta não é um estado — é do esquema. E a
                    barra é um objeto de interface: 3:1 basta-lhe, ao contrário
                    de um rótulo de 12 px. */}
                <Bar t={t} pct={g.of > 0 ? (g.at / g.of) * 100 : 0} color={t.titulo} height={6} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
                    {[falta > 0 ? `faltam ${EUR(falta)}` : 'meta alcançada', g.when]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  {/* ⚠ Só quem administra reforça uma meta — é a regra da
                      coleção, e não uma escolha da interface. Mostrar o botão a
                      quem o servidor recusa era a divergência de sempre. */}
                  {admin ? (
                    <Pressable onPress={() => reforcarMeta(g.id, 50, 'Reforço rápido', user)}
                      accessibilityRole="button"
                      accessibilityLabel={`Reforçar ${g.name} em 50 euros`}
                      style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 10,
                        borderRadius: R.row, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: pressed ? t.subtle : 'transparent' })}>
                      <Text style={{ fontFamily: FONT.ui, fontSize: 12.5, fontWeight: '600', color: t.actFg }}>
                        + 50 €
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Linha>
            );
          })}
        </View>
        )}
        {admin ? (
          <View style={{ marginTop: S.md }}>
            <AddButton t={t} label="acrescentar meta" onPress={() => setSheet('novaMeta')} />
          </View>
        ) : null}
      </View>

      {admin ? (
        <View>
          <SectionTitle t={t}>Administração</SectionTitle>
          <Card t={t} style={{ gap: S.md }}>
            {/* ⚠ Eram dois `Pressable` escritos à mão aqui, com o rótulo de
                13 px na cor do acento e em âmbar. Medido nos doze temas contra
                o cartão: o acento dá 2,12 a 3,07 nos seis esquemas ESCUROS e o
                âmbar dá 3,17 nos seis CLAROS — catorze de vinte e quatro pares
                abaixo dos 4,5 que 13 px pedem. Vivia na app assim, e o
                `CLAUDE.md` dizia «o acento no escuro NÃO se mede contra o
                cartão: aí ele nunca é texto». Era falso: era texto, aqui.

                E era a segunda porta para a mesma decisão, com outro desenho —
                a Gestão tem o mesmo par no cartão do mês. Agora é o mesmo
                componente, com as cores medidas, nos dois sítios.

                Os rótulos dizem QUAL mês, como no cartão da Gestão: «Abrir
                Outubro» e «Fechar Setembro», e não «Abrir Mês». */}
            <View style={{ flexDirection: 'row', gap: S.md }}>
              <BotaoCompacto t={t} tom="acento" label={`Abrir ${proximoMes}`}
                onPress={() => { setOpenMonth({ envelopes: {} }); setSheet('openMonth'); }} />
              <BotaoCompacto t={t} label={`Fechar ${s.monthName}`} disabled={!mesAberto}
                onPress={() => setSheet('closeMonth')} />
            </View>
          </Card>
        </View>
      ) : null}

      {extracto ? <ExtractoDoMes t={t} extractos={extractosDaCasa()} inicial={extracto} user={user}
        onClose={() => setExtracto(null)} /> : null}

      {/* Settle Accounts Sheet */}
      {cofre ? <Cofre t={t} kid={cofre} onClose={() => setCofre(null)} /> : null}

      {sheet === 'settle' ? (() => {
        const settleAmount = settle.mode === 'half' ? settleBase / 2 : settle.mode === 'custom' ? settle.customAmount : settleBase;
        return (
          <Sheet t={t} title="Acertar Contas"
            sub="Registar o pagamento das despesas partilhadas"
            onClose={() => setSheet(null)}
            action={<Primary t={t} disabled={settleAmount <= 0}
              label="Confirmar pagamento"
              sub={acerto ? `${EUR(settleAmount)} ${aoNome(acerto.credor)}` : null}
              onPress={handleSettle} />}>
            <View style={{ gap: S.lg }}>
              <View style={{ gap: S.md }}>
                <Label t={t}>Montante devido</Label>
                <Text style={{ fontFamily: FONT.display, fontSize: 28, color: t.text2 }}>
                  {EUR(settleBase)}
                </Text>
                <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
                  {acerto ? `${oNome(acerto.devedor)} deve ${aoNome(acerto.credor)} este valor.` : ''}
                </Text>
              </View>

              <View style={{ gap: S.md }}>
                <Label t={t}>Opções de Pagamento</Label>
                {/* Era este bloco escrito à mão, três vezes seguidas, 60 linhas.
                    O padrão é agora `Opcao` no ui.jsx — e é o mesmo que a folha
                    de exportar a saúde usa, em vez de inventar outro. */}
                <View style={{ flexDirection: 'column', gap: S.md }}>
                  {[
                    ['all', 'Tudo', EUR(settleBase)],
                    ['half', 'Metade', EUR(settleBase / 2)],
                    ['custom', 'Valor Personalizado', null],
                  ].map(([modo, titulo, detalhe]) => (
                    <Opcao key={modo} t={t} titulo={titulo} detalhe={detalhe}
                      selected={settle.mode === modo}
                      onPress={() => setSettle({ ...settle, mode: modo })} />
                  ))}
                </View>
              </View>

              {settle.mode === 'custom' ? (
                <View style={{ gap: S.md }}>
                  <Label t={t}>Valor a pagar</Label>
                  <NumField t={t} value={settle.customAmount} step={5} min={0} max={settleBase * 2}
                    onChange={(v) => setSettle({ ...settle, customAmount: v })} />
                </View>
              ) : null}
            </View>
          </Sheet>
        );
      })() : null}

      {/* Move Money Sheet */}
      {sheet === 'mover' ? (() => {
        // ⚠ Os dois nomes prendem-se à lista da CASA antes de se usarem — um
        // envelope pode ter sido apagado ou renomeado desde que a folha fechou.
        // Com nomes, prender é um `includes`; com índices eram três linhas de
        // aritmética sobre o comprimento da lista.
        const nomes = envelopes.map(e => e.name);
        const de = nomes.includes(mv.de) ? mv.de : (nomes[0] || null);
        const para = (nomes.includes(mv.para) && mv.para !== de)
          ? mv.para : (nomes.find(n => n !== de) || null);
        const free = freeOf(Math.max(0, nomes.indexOf(de)));
        const over = mv.amount > free;
        const origem = envelopes.find(e => e.name === de) || { name: '', limit: 0 };
        const destino = envelopes.find(e => e.name === para) || { name: '', limit: 0 };
        const livreDe = (nome) => freeOf(Math.max(0, nomes.indexOf(nome)));
        // ⚠ O botão é COMUM, e é a decisão que mais custa a tomar aqui: isto
        // mexe em dinheiro, mas não entre PESSOAS — muda o limite de dois
        // envelopes da mesma casa, e desfaz-se movendo ao contrário. A própria
        // folha já o diz: «Não sai dinheiro da conta.»
        return (
          <Sheet t={t} title="Mover Dinheiro" sub="Redistribuir o orçamento, sem sair dinheiro da conta"
            onClose={() => setSheet(null)}
            action={<Primary t={t} comum disabled={over || mv.amount <= 0}
              label={over ? 'Valor Indisponível' : mv.amount <= 0 ? 'Escreva um valor' : 'Confirmar Movimento'}
              onPress={() => {
                // ⚠ Uma TRANSFERÊNCIA, não um saldo escrito. Isto era um
                // `set` que reescrevia o mapa `envMove` por inteiro — e dois
                // telemóveis a mover dinheiro no mesmo mês anulavam-se, que é
                // o INVARIANTE #2 ao contrário e o que ele existe para
                // impedir.
                moverEntreEnvelopes(origem.name, destino.name, mv.amount);
                setSheet(null); setMv(m => ({ ...m, amount: 0 }));
              }} />}>
            <View style={{ gap: S.md }}>
              {/* ⚠ A grelha mostrava o `ENV_BASE` e a confirmação aplicava
                  `envelopes[índice]` — a lista da CASA. Duas listas com ordens
                  e tamanhos diferentes indexadas pelo mesmo número: escolhia-se
                  um envelope e o dinheiro saía de outro, sem erro nenhum.

                  Aqui, com seis envelopes na casa e quatro na demonstração,
                  tocar no primeiro da grelha («Mercearia») movia dinheiro de
                  «Transportes». */}
              {/* ⚠ DOIS CAMPOS, e não duas grelhas (26/09/2026). A grelha tinha
                  razão escrita — «eram oito linhas de largura total, 48 px cada: a
                  folha não cabia e o campo do valor ficava cortado a meio pelo
                  botão» — e essa razão é EXACTAMENTE o problema que o campo
                  resolve: 44 px com quatro envelopes e 44 com vinte. Duas
                  grelhas de oito ocupavam 448 px desta folha; dois campos
                  ocupam 88.

                  O «livre X €» não se perde — vai no `sub` de cada linha da lista,
                  que é onde se escolhe. Adia-se até abrir; não desaparece.

                  ⚠ E escolher o mesmo envelope dos dois lados TROCA-OS, como
                  antes: era o que a grelha fazia, e a folha nunca pode ficar com
                  a mesma origem e destino — o `moverEntreEnvelopes` recusa. */}
              <CampoDeEscolha t={t} rotulo="Retirar de" titulo="Retirar de"
                sub="De onde sai o limite"
                valor={de}
                opcoes={envelopes.map(e => ({ valor: e.name, titulo: e.name,
                  sub: `livre ${EUR(livreDe(e.name))}` }))}
                aoEscolher={(n) => setMv(m => ({ ...m, de: n, para: para === n ? de : para }))} />
              <CampoDeEscolha t={t} rotulo="Reforçar" titulo="Reforçar"
                sub="Para onde vai o limite"
                valor={para}
                opcoes={envelopes.map(e => ({ valor: e.name, titulo: e.name,
                  sub: `livre ${EUR(livreDe(e.name))}` }))}
                aoEscolher={(n) => setMv(m => ({ ...m, para: n, de: de === n ? para : de }))} />
            </View>
            <View style={{ gap: S.md }}>
              <Label t={t}>Valor a mover</Label>
              <NumField t={t} value={mv.amount} step={5} min={0} max={free}
                onChange={(v) => setMv(m => ({ ...m, amount: v }))} />
              <Pressable onPress={() => setMv(m => ({ ...m, amount: free }))} accessibilityRole="button"
                accessibilityLabel="Usar o máximo disponível" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.ui, fontSize: 12.5, color: t.actFg, fontWeight: '600' }}>
                  Usar o máximo · {EUR(free)}
                </Text>
              </Pressable>
              <Text style={{ fontFamily: FONT.body, fontSize: 14.5, lineHeight: 21, color: over ? t.state.errTexto : t.text2 }}>
                {over ? `Só há ${EUR(free)} livres em ${origem.name}.`
                  : `O limite de ${origem.name} passa a ${EUR(origem.limit - mv.amount)} e o de ${destino.name} a ${EUR(destino.limit + mv.amount)}. Não sai dinheiro da conta.`}
              </Text>
            </View>
          </Sheet>
        );
      })() : null}

      {/* Register Expense Sheet */}
      {/* O botão é comum: acrescenta uma linha, não fecha nem apaga nada. */}
      {sheet === 'despesa' ? (() => {
        // ⚠ O nome prende-se à lista da CASA antes de se usar: um envelope
        // pode ter sido apagado ou renomeado desde que a folha fechou, e nulo
        // quer dizer «ainda não escolheu». Sem isto, escolher e aplicar podiam
        // discordar — foi assim que a grelha mostrava uma lista e a
        // confirmação aplicava outra.
        const nomesDosEnvelopes = envelopes.map(e => e.name);
        const envelopeDaDespesa = nomesDosEnvelopes.includes(exp.env)
          ? exp.env : (nomesDosEnvelopes[0] || null);
        return (
        <Sheet t={t} title="Registar Despesa" sub="Entra no envelope e na conta entre os dois"
          onClose={() => setSheet(null)}
          action={<Primary t={t} comum disabled={exp.amount <= 0} label="Registar despesa"
            onPress={() => {
              // ⚠ Pela loja, que também a manda para o servidor. Isto somava
              // ao `registered` local e mais nada — as despesas nunca
              // chegavam ao servidor, e cada telefone contava só o que ele
              // próprio tinha gasto.
              registarDespesa({
                envelope: envelopeDaDespesa,
                valor: exp.amount,
                pagador: exp.payer,
                divideMeias: exp.split,
              });
              setSheet(null); setExp(e => ({ ...e, amount: 0 }));
            }} />}>
          <View style={{ gap: S.md }}>
            <Label t={t}>Valor</Label>
            <NumField t={t} value={exp.amount} step={5} min={0} max={9999}
              onChange={(v) => setExp(e => ({ ...e, amount: v }))} />
          </View>
          <View style={{ gap: S.md }}>
            {/* ⚠ A lista da CASA. Era o `ENV_BASE`, e o `registarDespesa`
                logo acima aplicava a lista da casa pelo mesmo índice.
                Escolhia-se «Casa & contas» na lista da demonstração e a despesa
                era lançada no que estivesse nesse lugar na casa. Dinheiro a
                sério no envelope errado, sem erro. Hoje a escolha e a aplicação
                são o mesmo NOME, e não há índice nenhum pelo meio. */}
            {/* ⚠ UM CAMPO, e não uma pilha de linhas (26/09/2026). Eram
                `envelopes.length` linhas de 48 px, de largura inteira: com os
                seis envelopes de uma casa a sério são 288 px — a folha inteira,
                por um campo. Ao contrário da grelha do «Mover», esta forma não
                tinha uma única linha de justificação escrita: nasceu assim e
                ficou.

                O «livre X €» mantém-se, no `sub` de cada linha da lista. */}
            <CampoDeEscolha t={t} rotulo="Envelope" titulo="Envelope"
              sub="Onde esta despesa entra"
              valor={envelopeDaDespesa}
              opcoes={envelopes.map((e, i) => ({ valor: e.name, titulo: e.name,
                sub: `livre ${EUR(freeOf(i))}` }))}
              aoEscolher={(n) => setExp(x => ({ ...x, env: n }))} />
          </View>
          <View style={{ gap: S.md }}>
            <Label t={t}>Quem pagou</Label>
            {/* A bola de cada pessoa, como nos filtros (15/09/2026): era um
                `Segmented` com os nomes. */}
            <EscolherPessoa t={t} membros={adultos} valor={exp.payer} MEMBERS={MEMBERS}
              onEscolher={(v) => setExp(x => ({ ...x, payer: v }))} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.subtle,
            borderWidth: 1, borderColor: t.border, borderRadius: R.card, padding: 14 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text1 }}>Dividir a meias</Text>
              <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
                {exp.split ? `Metade (${EUR(exp.amount / 2)}) entra na conta entre os dois.` : 'A despesa fica a cargo de quem pagou.'}
              </Text>
            </View>
            <Toggle t={t} on={exp.split} label="Dividir a meias"
              onPress={() => setExp(x => ({ ...x, split: !x.split }))} />
          </View>
        </Sheet>
        );
      })() : null}

      {/* Open Month Sheet — o botão fecha um período: o mês anterior deixa de
          ser o aberto, e os totais passam a contar noutra soma. Leva o acento. */}
      {sheet === 'openMonth' && admin ? (
        <Sheet t={t} title="Abrir Mês"
          sub="Distribuir o rendimento aos envelopes"
          onClose={() => setSheet(null)}
          action={<Primary t={t} label="Confirmar abertura"
            sub={`${EUR(Object.values(openMonth.envelopes || {}).reduce((a, b) => a + b, budget))} distribuídos`}
            onPress={handleOpenMonth} />}>
          <View style={{ gap: S.lg }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: t.text2 }}>
              Distribua o rendimento mensal aos envelopes. Os limites serão atualizados no início do mês.
            </Text>
            <View style={{ gap: S.md }}>
              <Label t={t}>Limites dos Envelopes</Label>
              {envelopes.map((e) => (
                <View key={e.name} style={{ gap: S.md }}>
                  <Label t={t}>{e.name}</Label>
                  {/* ⚠ O campo mostrava o AJUSTE (0,00 € em todos) com o rótulo
                      «Limites dos Envelopes», e o botão dizia «2 420,00 €
                      distribuídos»: dois números que não batiam. O que se
                      guarda continua a ser o ajuste ao limite; o que se VÊ é o
                      limite que vai ficar (13/09/2026). E o máximo deixa de ser
                      2 000 fixos — uma renda de 2 400 € não cabia. */}
                  <NumField t={t}
                    value={e.limit + (openMonth.envelopes[e.name] || 0)}
                    step={10}
                    min={0}
                    max={Math.max(2000, Math.ceil(budget / 10) * 10 * 2)}
                    onChange={(v) => setOpenMonth(x => ({
                      envelopes: { ...x.envelopes, [e.name]: v - e.limit }
                    }))} />
                </View>
              ))}
            </View>
          </View>
        </Sheet>
      ) : null}

      {/* Close Month Sheet */}
      {sheet === 'closeMonth' && admin ? (
        <Sheet t={t} title="Fechar Mês"
          sub="Arquivar as despesas e recomeçar a contagem"
          onClose={() => setSheet(null)}
          action={<Primary t={t} label="Confirmar encerramento"
            sub={vaiParaMeta
              ? `${EUR(spent)} gastos · ${EUR(paraMeta)} para «${metaDoFecho.name}»`
              : `${EUR(spent)} gastos em ${s.monthName} · o saldo fica`}
            onPress={handleCloseMonth} />}>
          <View style={{ gap: S.lg }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: t.text2 }}>
              Ao fechar o mês, o registo de despesas e os pontos pagos voltam a zero.
              {vaiParaMeta ? ' O que escolher abaixo passa para a meta.' : ' O saldo restante não é movido.'}
            </Text>
            <View style={{ gap: S.md }}>
              <Label t={t}>Resumo do Mês</Label>
              <View style={{ gap: S.md }}>
                <Row t={t} title="Orçamento" value={EUR(budget)} right={<View />} last={false} />
                <Row t={t} title="Gasto" value={EUR(spent)} right={<View />} last={false} />
                <Row t={t} title="Disponível" value={EUR(remaining)} right={<View />} last={true} />
              </View>
            </View>

            {/* ── O saldo para uma meta ───────────────────────────────────────
                ⚠ Em EUROS, e escolhido. O protótipo dizia «30 % do que sobrou
                reforça as metas» e ficou por aplicar meses: uma percentagem
                escrita no código não é uma decisão da família — 30 % de
                771,36 € são 231,41 €, e ninguém escolheu esse número.

                Sugere-se o saldo INTEIRO, não uma fatia: quem quiser guardar
                menos baixa o número, e assim a app não escolhe por ninguém. */}
            {metas.length && remaining > 0 ? (
              <View style={{ gap: S.md }}>
                {/* ⚠ UMA OPÇÃO «NENHUMA», e não um gesto escondido (26/09/2026).
                    Isto era uma fila de pastilhas em que tocar na escolhida
                    DESLIGAVA o reforço — «a saída para quem se enganou, sem um
                    botão nada», dizia o comentário. O código fazia-o; ninguém o
                    dizia a ninguém. Não havia frase no ecrã, não havia rótulo em
                    voz alta, e o `Choice` nem sequer aceita um
                    `accessibilityHint`. Pela regra escrita desta casa — «um
                    gesto que não se anuncia não existe» —, era um defeito, e não
                    uma decisão por tomar.

                    Agora a saída é uma LINHA da lista, que se lê e se toca como
                    as outras. E de caminho a escolha deixa de crescer numa fila
                    que quebra: as metas são da família e não têm número máximo. */}
                <CampoDeEscolha t={t} rotulo="Levar para uma meta (opcional)"
                  titulo="Levar para uma meta"
                  sub="O que sobrar do mês passa para ela"
                  valor={fecho.meta}
                  opcoes={[
                    { valor: null, titulo: 'Nenhuma',
                      sub: `O saldo de ${EUR(remaining)} fica na conta` },
                    ...metas.map(g => ({ valor: g.id, titulo: g.name,
                      sub: `${EUR(g.at)} de ${EUR(g.of)}` })),
                  ]}
                  aoEscolher={(id) => setFecho(f => ({ ...f, meta: id }))} />
                {/* ⚠ `metaDoFecho`, e NÃO `fecho.meta` (26/09/2026). A condição
                    era o id guardado, e a linha de baixo lê `metaDoFecho.name`:
                    se a meta escolhida sair da lista com a folha aberta — o
                    outro telemóvel a apagá-la —, o id continua lá, o
                    `metas.find` devolve nulo, e o ecrã rebenta a ler `.name` de
                    um nulo. Estava latente antes de eu mexer aqui; custa um
                    símbolo a fechar.

                    ⚠ E o ramo do «senão» SAIU. Dizia «Sem meta escolhida, o
                    saldo de X fica na conta» — e com a linha «Nenhuma» dentro do
                    campo passou a ser a TERCEIRA cópia do mesmo facto no mesmo
                    ecrã: o campo di-lo, o botão diz «o saldo fica», e o
                    parágrafo do topo diz «o saldo restante não é movido». */}
                {metaDoFecho ? (
                  <>
                    <NumField t={t} value={paraMeta} step={50} min={0} max={Math.max(0, remaining)}
                      onChange={(v) => setFecho(f => ({ ...f, valor: v }))} />
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
                      {`«${metaDoFecho.name}» passa de ${EUR(metaDoFecho.at)} para `
                        + `${EUR(metaDoFecho.at + paraMeta)}, de ${EUR(metaDoFecho.of)}.`}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </Sheet>
      ) : null}

      {/* ── As metas: criar e gerir ─────────────────────────────────────────── */}
      {sheet === 'novaMeta' && admin ? (
        <Sheet t={t} title="Nova Meta" sub="Um objetivo com valor e prazo"
          onClose={() => setSheet(null)}>
          <NovaMeta t={t} user={user} onClose={() => setSheet(null)} />
        </Sheet>
      ) : null}

      {metaAberta ? (
        <Sheet t={t} title={metaAberta.name}
          sub={`${EUR(metaAberta.at)} de ${EUR(metaAberta.of)}`}
          onClose={() => setMeta(null)}>
          <GerirMeta t={t} meta={metaAberta} user={user}
            onApagar={() => setMetaAApagar(metaAberta.id)}
            onClose={() => setMeta(null)} />
        </Sheet>
      ) : null}

      {/* ── As contas fixas: criar e gerir ─────────────────────────────────── */}
      {sheet === 'novaConta' ? (
        <Sheet t={t} title="Nova Conta Fixa" sub="O que se paga todos os meses no mesmo dia"
          onClose={() => setSheet(null)}>
          <NovaContaFixa t={t} onClose={() => setSheet(null)} />
        </Sheet>
      ) : null}

      {contaAberta ? (
        <Sheet t={t} title={contaAberta.nome}
          sub={`${EUR(contaAberta.valor)} · dia ${contaAberta.dia} · ${contaAberta.envelope}`}
          onClose={() => setConta(null)}>
          <GerirContaFixa t={t} conta={contaAberta} user={user}
            onApagar={() => setContaAApagar(contaAberta.id)}
            onClose={() => setConta(null)} />
        </Sheet>
      ) : null}

      {/* Apagar a conta não apaga o que já se pagou — e a pergunta di-lo, para
          ninguém apagar a renda a pensar que corrige uma despesa. */}
      {contaAApagarObj ? (
        <Confirm t={t} destructive icon="trash"
          title={`Apagar «${contaAApagarObj.nome}»?`}
          message={`A conta sai da lista e deixa de aparecer na Agenda e no «Precisa de Si». `
            + 'As despesas dos meses já pagos ficam no envelope — apagar a conta não as apaga. Não se desfaz.'}
          confirmLabel="Apagar"
          onConfirm={() => { apagarContaFixa(contaAApagar); setContaAApagar(null); setConta(null); }}
          onCancel={() => setContaAApagar(null)} />
      ) : null}

      {/* ⚠ A pergunta diz quanto se está a deixar de contar. Apagar uma meta
          leva os movimentos dela — é dinheiro que a casa juntou, e quem apaga
          tem de o ver escrito ANTES de decidir. */}
      {metaAApagarObj ? (
        <Confirm t={t} destructive icon="trash"
          title={`Apagar «${metaAApagarObj.name}»?`}
          message={metaAApagarObj.at > 0
            ? `A meta sai da lista com os ${EUR(metaAApagarObj.at)} que já lhe foram `
              + 'juntados, e o histórico de onde vieram. O dinheiro não sai da conta da casa — '
              + 'deixa apenas de estar prometido a esta meta. Não se desfaz.'
            : 'A meta sai da lista e não volta. Não se desfaz.'}
          confirmLabel="Apagar"
          onConfirm={() => { apagarMeta(metaAApagar); setMetaAApagar(null); setMeta(null); }}
          onCancel={() => setMetaAApagar(null)} />
      ) : null}
    </>
  );
}
