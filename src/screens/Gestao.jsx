import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useStore } from '../store';
import { S, R, FONT } from '../theme';
import { EUR, mesComAno, mesSeguinte, dmyDeChave } from '../format';
import { Card, SectionTitle, Linha, Label, Primary, AddButton, Row, Tap, Avatar, Tile, Segmented, Toggle, Pill, Choice, Empty, avatarDe, NumField, BotaoCompacto } from '../ui';
import Icon from '../Icon';
import Sheet from '../Sheet';
import Confirm from '../Confirm';

// Com que limite nasce um envelope novo. Estava escrito no meio da chamada, sem
// nome e sem aparecer em sítio nenhum da folha; agora tem nome e o botão diz-lhe
// o valor antes de o somar ao orçamento da casa.
const LIMITE_NOVO_ENVELOPE = 500;

// O estilo dos campos de texto estava copiado onze vezes neste ficheiro, cada
// uma com onze linhas iguais. Um sítio só: se o desenho do campo mudar, muda
// em todos — que era o que já devia acontecer.
const campo = (t) => ({
  marginTop: S.sm,
  paddingHorizontal: S.md,
  paddingVertical: S.md,
  minHeight: 44,                 // INVARIANTE #5
  borderRadius: R.row,
  borderWidth: 1,
  borderColor: t.border,
  fontFamily: FONT.body,
  fontSize: 16,
  color: t.text1,
});

function CartaoDoMes({ t, nome, aberto, desde, gasto, orcamento, onAbrir, onFechar }) {
  const seguinte = mesSeguinte(nome);
  return (
    <View style={{ gap: S.md }}>
      <SectionTitle t={t}>Mês</SectionTitle>
      <Card t={t} style={{ gap: 2 }}>
        <Label t={t}>{aberto ? 'Mês aberto' : 'Sem mês aberto'}</Label>
        <Text style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: '600', color: t.text1 }}>
          {mesComAno(nome)}
        </Text>
        {/* O «desde» só aparece quando existe: sem servidor não há data de
            abertura gravada, e escrever «aberto desde undefined» seria pior do
            que não dizer nada. */}
        <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
          {aberto
            ? `${desde ? `aberto desde ${dmyDeChave(desde)} · ` : ''}${EUR(gasto)} gastos de ${EUR(orcamento)}`
            : `Orçamento de ${EUR(orcamento)} por distribuir`}
        </Text>
        <View style={{ flexDirection: 'row', gap: S.md, marginTop: 14 }}>
          <BotaoCompacto t={t} tom="acento" label={`Abrir ${seguinte}`} onPress={onAbrir} />
          {/* ⚠ Fechar um mês que nunca foi aberto não é uma acção — é um
              engano à espera. Mostra-se desactivado, e não escondido: assim
              diz-se que existe e o que falta para lá chegar. */}
          <BotaoCompacto t={t} label={`Fechar ${nome}`} disabled={!aberto} onPress={onFechar} />
        </View>
      </Card>
    </View>
  );
}

export default function Gestao({ t, user, onClose }) {
  const { s, set, isAdmin, budget, spent, mesAberto, mesAbertoDesde, envelopes, pinError, setPin, temPin, canChangeRole, setRole,
          kidPts, pontosNasTarefas, mudarRegraDaCasa, mudarListaDaCasa,
          criarEnvelope, alterarEnvelope, apagarEnvelope, membros: MEMBERS, nomeDaCasa, podeGerirCasa,
          renomearCasa, acrescentarMembro, editarMembro, renomearMembro, removerMembro,
          abrirMes, fecharMes } = useStore();
  const [tab, setTab] = useState('orcamento');
  const [sheetOpen, setSheetOpen] = useState(null);
  const [modal, setModal] = useState(null);
  const [input, setInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  // ⚠ O valor do ponto ENQUANTO se escreve. `null` quer dizer «não se está a
  // escrever» — e aí mostra-se o da casa. Sem isto, desde que o `NumField`
  // passou a dar o valor a cada tecla (15/09/2026), escrever «0,35» eram
  // quatro escritas na casa e quatro PATCH ao servidor, diretos e sem fila
  // (`regrasDaCasa`, com o `autoCancellation(false)` do PocketBase): ganhava o
  // último a CHEGAR, que podia ser o «0». A casa só se escreve no valor
  // assente — o `aoTerminar`.
  const [pontoAEscrever, setPontoAEscrever] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState(null);
  // O formulário do membro, e a recusa que vier do servidor. O erro é estado
  // do ecrã, não um alerta: quem tenta tirar alguém da casa e não pode tem de
  // ler porquê no sítio onde tentou.
  const [form, setForm] = useState({ nome: '', papel: 'crianca', email: '', fem: false, segredo: '' });
  const [erro, setErro] = useState(null);
  const [aGuardar, setAGuardar] = useState(false);

  // Validar com pinError, que só lê. setPin grava — chamá-lo aqui comprometia
  // o PIN a meio da escrita, antes de se tocar em Guardar.
  const pinMsg = input ? pinError(selectedMember, input) : null;

  // Estas quatro vão ao servidor e devolvem uma frase de recusa ou null. O
  // ecrã só fecha quando passou — fechar antes de saber mostrava a alteração
  // feita e deixava a casa como estava.
  const executar = async (accao, aoPassar) => {
    setAGuardar(true);
    setErro(null);
    const msg = await accao();
    setAGuardar(false);
    if (msg) { setErro(msg); return; }
    aoPassar();
  };

  const fecharMembro = () => {
    setSheetOpen(null); setModal(null); setSelectedMember(null);
    setInput(''); setErro(null);
  };

  const abrirMembro = (nome) => {
    const papel = s.roles[nome] || 'crianca';
    setSelectedMember(nome);
    setForm({ nome, papel, email: MEMBERS[nome]?.email || '', fem: !!MEMBERS[nome]?.fem, segredo: '' });
    setInput('');
    setErro(null);
    setSheetOpen('membro');
  };

  if (!isAdmin(user)) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="lock" size={48} color={t.text3} style={{ marginBottom: S.xl }} />
        <Text style={{ fontFamily: FONT.display, fontSize: 18, color: t.text2, textAlign: 'center', marginBottom: S.md }}>
          Acesso restrito
        </Text>
        <Text style={{ fontFamily: FONT.ui, fontSize: 14, color: t.text3, textAlign: 'center' }}>
          Apenas administradores podem aceder à gestão da casa.
        </Text>
        {/* ⚠ Levava o ACENTO cheio, e é uma saída: fecha um ecrã que diz
            «acesso restrito» e não decide nada. O acento quer dizer «isto não
            se desfaz», e num ecrã onde não há nada para fazer era a única cor
            forte — a coisa mais chamativa da página era o botão de desistir.

            É o mesmo defeito dos três «Fechar» com acento que o ImportarGoogle
            tinha. Passa a `comum`, o peso que os outros trinta botões da app
            têm, e ganha o alvo de 44 que também lhe faltava. */}
        {/* O `Primary` não tem largura própria; num contentor centrado
            ajusta-se ao rótulo, e é o que se quer aqui. A margem era do
            `Pressable` que ele substitui. */}
        <View style={{ marginTop: S.xl, paddingHorizontal: S.xl }}>
          <Primary t={t} comum label="Fechar" onPress={onClose} />
        </View>
      </ScrollView>
    );
  }

  const renderBudgetTab = () => (
    <View style={{ gap: S.lg }}>
      <Card t={t}>
        <View style={{ gap: S.md }}>
          <View>
            <Label t={t}>Orçamento total mensal</Label>
            <Text style={{ fontFamily: FONT.display, fontSize: 24, color: t.text2, marginTop: S.sm }}>
              {EUR(budget)}
            </Text>
          </View>
          <View>
            <Label t={t}>Gasto até agora</Label>
            <Text style={{ fontFamily: FONT.display, fontSize: 20, color: t.text2, marginTop: S.sm }}>
              {EUR(spent)}
            </Text>
          </View>
          <View>
            <Label t={t}>Disponível</Label>
            <Text style={{ fontFamily: FONT.display, fontSize: 20, color: budget - spent >= 0 ? t.state.okTexto : t.state.errTexto, marginTop: S.sm }}>
              {EUR(budget - spent)}
            </Text>
          </View>
        </View>
      </Card>

      {/* Semanada e divisão das despesas — em docs/referencia/13-gestao-casa.png
          vivem aqui, não no Perfil. Estavam numa folha separada dentro do Perfil,
          e a linha «Rendimento, envelopes, semanada, membros» abria só metade
          disso. Uma casa, um sítio onde se muda as suas regras. */}
      {/* ── Semanada: e os pontos são opcionais ──────────────────────────────
          ⚠ Desligar NÃO apaga nada. Os pontos são somas de movimentos
          (INVARIANTE #2) e ficam onde estão; o que desaparece é o que se
          mostra e o que se pede ao criar uma tarefa. Voltar a ligar traz tudo
          de volta, e é isso que a frase por baixo do interruptor promete. */}
      <View style={{ gap: S.md }}>
        <SectionTitle t={t}>Semanada</SectionTitle>

        {/* ⚠ O `Toggle` desenha SÓ o interruptor — o `label` dele é o rótulo
            de acessibilidade, não texto no ecrã. Sem esta linha ao lado ficava
            um interruptor sem nome, e foi uma prova que o apanhou. É o mesmo
            arranjo do «Dividir a meias», mais abaixo neste ficheiro. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.subtle,
          borderWidth: 1, borderColor: t.border, borderRadius: R.card, padding: 14 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text1 }}>Atribuir pontos às tarefas</Text>
            <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
              {pontosNasTarefas
                ? 'As tarefas valem pontos, e os pontos viram semanada. Desligar esconde-os — não apaga nada, e voltar a ligar traz tudo de volta.'
                : 'As tarefas não têm pontos. O que já estava contado fica guardado e volta se ligar outra vez.'}
            </Text>
          </View>
          <Toggle t={t} on={pontosNasTarefas} label="Atribuir pontos às tarefas"
            onPress={() => mudarRegraDaCasa({ pontosLigados: !pontosNasTarefas })} />
        </View>

        {pontosNasTarefas ? (
        <>
        <Label t={t}>Quanto vale um ponto</Label>
        {/* ⚠ Mínimo 0, e não 0,01. Uma casa pode querer os pontos como
            contagem e não como dinheiro: «cinco pontos» sem euros atrás. O
            0,01 obrigava a que valessem sempre algo. O máximo é 5, como no
            servidor (`num('valor_ponto', { min: 0, max: 5 })`).

            ⚠ E é o `NumField`, não dois botões à volta de um `<Text>`. Escrito
            à mão, este controlo não deixava ESCREVER o valor: pôr o ponto a
            0,35 € eram sete toques, e a 1,00 € eram vinte. O campo partilhado
            já tinha o campo de texto lá dentro — só não estava a ser usado
            aqui, porque vivia dentro do ecrã do Dinheiro e a Gestão não pode
            importar um ecrã. */}
        <NumField t={t} value={pontoAEscrever ?? s.pointValue} step={0.05} min={0} max={5}
          onChange={setPontoAEscrever}
          aoTerminar={(v) => { setPontoAEscrever(null); mudarRegraDaCasa({ pointValue: v }); }} />
        <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
          {(() => {
            const porPagar = Object.keys(MEMBERS)
              .filter(n => MEMBERS[n].kid)
              .reduce((a, n) => a + ((kidPts?.[n] || 0) - (s.paidPts?.[n] || 0)), 0);
            // A 0 € a frase do dinheiro não diz nada — diz-se só a contagem.
            return s.pointValue > 0
              ? `Os ${porPagar} pontos por pagar valem ${EUR(porPagar * s.pointValue)}.`
              : `Há ${porPagar} pontos por pagar. A zero, os pontos contam e não valem dinheiro.`;
          })()}
        </Text>

        <Label t={t}>Pagar às</Label>
        <Segmented t={t} small value={s.payDay}
          options={['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => ({ value: i, label: d }))}
          onChange={(v) => mudarRegraDaCasa({ payDay: v })} />
        </>
        ) : null}
      </View>

      <View style={{ gap: S.md }}>
        <SectionTitle t={t}>Divisão das Despesas</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.subtle,
          borderWidth: 1, borderColor: t.border, borderRadius: R.card, padding: 14 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text1 }}>Dividir a meias</Text>
            <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
              {s.splitHalf ? 'Cada despesa partilhada divide-se a meias entre os dois adultos.'
                : 'Cada despesa fica a cargo de quem paga.'}
            </Text>
          </View>
          <Toggle t={t} on={s.splitHalf} label="Dividir a meias"
            onPress={() => mudarRegraDaCasa({ splitHalf: !s.splitHalf })} />
        </View>
      </View>

      {/* (O interruptor «Ementa da semana» viveu aqui de 12 a 13/09/2026. A
          ementa saiu da interface por decisão do dono da casa — ver Compras.jsx.
          A regra `ementaDesligada` fica na loja e no servidor, dormente.) */}

      {/* ── O mês do orçamento ────────────────────────────────────────────
          ⚠ Eram dois cilindros a `text1` — preto no claro — empilhados aqui, e
          era muita mobília para o que fazem: abrir um diálogo de confirmação.

          Agora o par tem um SÍTIO. O cartão diz de que mês se está a falar e em
          que ponto vai, e os botões ficam pequenos no fundo, porque a
          informação é que é o assunto. O peso desaparece sem que o acento tenha
          de tomar o lugar dele — o acento continua a querer dizer «isto não se
          desfaz», e é o que a confirmação lá dentro leva.

          Desenho E de `design/abrir-fechar-mes.dc.html`, escolhido depois de
          medir os cinco nos doze temas. */}
      <CartaoDoMes t={t} nome={s.monthName} aberto={mesAberto} desde={mesAbertoDesde}
        gasto={spent} orcamento={budget}
        onAbrir={() => setModal('openMonth')} onFechar={() => setModal('closeMonth')} />

      {envelopes && envelopes.length > 0 && (
        <View style={{ gap: S.md }}>
          <SectionTitle t={t}>Envelopes</SectionTitle>
          {envelopes.map((env, i) => {
            // A barra é uma proporção DESENHADA, e essa fica: uma barra lê-se
            // de relance sem se fazer conta nenhuma. O que sai é o número.
            const pct = env.limit > 0 ? Math.round((env.used / env.limit) * 100) : 0;
            const over = env.used > env.limit;
            // ⚠ Era `{pct}%` neste canto — o único número desta app que falava
            // de dinheiro em percentagem, depois de a frase do Dinheiro e a do
            // Início terem passado a euros. E era o número menos útil dos três
            // que se podem pôr aqui: quem olha para um envelope quer saber
            // quanto ainda pode gastar, não que fração já gastou.
            //
            // «livre» é a palavra que a grelha do Dinheiro já usa para isto —
            // uma casa, uma palavra. E quando passa do limite não se escreve
            // «livre −43,40 €»: diz-se que excedeu, que é o que aconteceu.
            const sobra = env.limit - env.used;
            return (
              <Linha key={env.name} t={t} last={i === envelopes.length - 1}>
                <View style={{ gap: S.md, paddingVertical: S.sm }}>
                  {/* A MESMA gramática do Dinheiro (revisão de 14/09/2026):
                      «gasto / limite» à direita, como na lista dos envelopes
                      do separador; o «livre» fica por baixo do nome, pequeno.
                      Eram dois formatos para o mesmo envelope. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>{env.name}</Text>
                      <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: over ? t.state.errTexto : t.text3 }}>
                        {over ? `excedido em ${EUR(-sobra)}` : `livre ${EUR(sobra)}`}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: '600', color: over ? t.state.errTexto : t.text3 }}>
                      {EUR(env.used)} / {EUR(env.limit)}
                    </Text>
                  </View>
                  <View style={{ height: 6, borderRadius: R.pill, backgroundColor: t.page, overflow: 'hidden' }}>
                    <View style={{
                      width: `${Math.min(100, pct)}%`,
                      height: '100%',
                      borderRadius: R.pill,
                      backgroundColor: over ? t.state.err : t.accent,
                    }} />
                  </View>
                </View>
              </Linha>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderShopsTab = () => (
    <View style={{ gap: S.md }}>
      <SectionTitle t={t}>Lojas</SectionTitle>
      {!(s.stores || []).length ? (
        <Empty t={t} icon="storefront" title="Sem lojas."
          hint="Acrescente as lojas onde a casa costuma comprar." />
      ) : null}
      {s.stores && s.stores.map((shop, i) => (
        <Linha key={i} t={t} last={i === s.stores.length - 1}>
          <Row t={t} icon="storefront" title={shop} last
            onPress={() => {
              setSelectedEnvelope(i);
              setInput(shop);
              setSheetOpen('editShop');
            }}
            right={<Icon name="caretRight" size={18} color={t.text3} />}
          />
        </Linha>
      ))}
      <AddButton t={t} label="adicionar loja" onPress={() => {
        setInput('');
        setSheetOpen('newShop');
      }} />
    </View>
  );

  // Uma linha por membro, como na referência 14: avatar, nome, o que se muda
  // por baixo, e a pastilha do papel à direita. Eram cartões de três linhas
  // com PIN e Papel empilhados — quatro membros enchiam o ecrã, e a linha de
  // cima tinha `onPress={() => {}}`, mais um controlo morto.
  //
  // A referência diz «toque no papel para o mudar», com a pastilha como alvo.
  // Não segui essa parte: o erro nº 6 do CLAUDE.md é exatamente uma pílula
  // tocável dentro de uma linha tocável, e obriga a adivinhar onde se tocou.
  // Uma linha, um destino — e o destino tem lá dentro tudo o que se muda
  // naquele membro, incluindo o papel.
  const renderMembersTab = () => (
    <View style={{ gap: S.md }}>
      <SectionTitle t={t}>A Casa</SectionTitle>
      <Linha t={t} last>
        <Row t={t} last icon="houseGear"
          title="Nome da família"
          sub={nomeDaCasa}
          onPress={() => { setInput(nomeDaCasa); setErro(null); setSheetOpen('nomeDaCasa'); }}
          right={<Icon name="caretRight" size={18} color={t.text3} />} />
      </Linha>

      {/* Sem servidor a casa que se vê é a de demonstração, e configurar uma
          amostra não configura nada. Dizê-lo aqui, uma vez, é melhor do que
          quatro botões que não fazem nada e não explicam porquê. */}
      {!podeGerirCasa() ? (
        <Tile t={t} kind="info">
          Esta é a casa de demonstração. Ligue-se ao servidor da família para
          mudar o nome da casa ou acrescentar e remover membros.
        </Tile>
      ) : null}

      <SectionTitle t={t}>Membros e PIN</SectionTitle>
      {/* Linhas planas, sem cartão — desenho C (09/09/2026). */}
      <View style={{ paddingHorizontal: S.xs }}>
        {Object.entries(MEMBERS).map(([name, info], i, arr) => {
          const role = s.roles[name] || 'crianca';
          const hasPin = temPin(name);
          const crianca = role === 'crianca';
          const papel = crianca ? 'Criança'
            : role === 'admin' ? (info.fem ? 'Administradora' : 'Administrador') : 'Adulto';
          return (
            <Row key={name} t={t} last={i === arr.length - 1}
              leading={<Avatar {...avatarDe(name, info, t.text3)} size={40} />}
              title={name}
              sub={crianca ? (hasPin ? 'Perfil de criança · PIN definido'
                                    : 'Perfil de criança · ainda sem PIN')
                           : info.email}
              onPress={() => { abrirMembro(name); }}
              right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                {/* Contornada e na cor do papel, como na referência: um adulto
                    lê-se de relance sem se ler a palavra. */}
                <Pill label={papel} bg="transparent"
                  // ⚠ `infoTexto` no rótulo, e não `info`: azul-base a 11 px
                  // sobre o cartão dá 3,16. A borda fica `info` — é objeto
                  // gráfico, 3:1 — e é a mesma separação do «Precisa de Si».
                  fg={crianca ? t.text3 : t.state.infoTexto}
                  border={crianca ? t.border : t.state.info} />
                <Icon name="caretRight" size={18} color={t.text3} />
              </View>}
              icon={undefined} />
          );
        })}
      </View>

      <AddButton t={t} label="acrescentar membro" onPress={() => {
        setForm({ nome: '', papel: 'crianca', email: '', fem: false, segredo: '' });
        setErro(null);
        setSheetOpen('novoMembro');
      }} />

      {/* O que cada toque faz, e o que cada mudança de papel implica — a
          referência 14 explica-o aqui, e sem isso «Criança» parece um rótulo
          e não um botão. */}
      <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
        Toque num membro para lhe mudar o papel, o PIN, ou para o tirar da casa.
        Uma criança que passe a adulto precisa de conta Google própria. A casa
        nunca pode ficar sem administração, e o histórico de quem sai fica.
      </Text>
    </View>
  );

  const renderEnvelopesTab = () => (
    <View style={{ gap: S.md }}>
      <SectionTitle t={t}>Envelopes Orçamentais</SectionTitle>
      {!(envelopes || []).length ? (
        <Empty t={t} icon="wallet" title="Sem envelopes."
          hint="Um envelope é uma categoria com um limite mensal." />
      ) : null}
      {envelopes && envelopes.map((env, i) => (
        <Linha key={env.name} t={t} last={i === envelopes.length - 1}>
          <Tap label={`Editar ${env.name}`} onPress={() => {
            setSelectedEnvelope(env.name);
            setInput(env.name);
            setLimitInput(String(env.limit));
            setSheetOpen('editEnvelope');
          }} style={{ paddingVertical: S.sm, alignItems: 'stretch' }}>
            {/* ⚠ O `Tap` centra os filhos — é um alvo de ícone, não uma linha.
                Sem o `stretch`, a linha lá dentro ficava com a largura do
                texto e o «Limite: 590,00 €» colava-se ao «43,40 € livre»:
                lia-se «590,00 €43,40 €» (09/09/2026). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
              {/* «gasto / limite» à direita e «livre» por baixo do nome — a
                  gramática do Dinheiro, uma casa, uma forma (14/09/2026). */}
              <View style={{ gap: 2 }}>
                <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>{env.name}</Text>
                <Text style={{ fontFamily: FONT.ui, fontSize: 11, color: t.text3 }}>
                  livre {EUR(env.limit - env.used)}
                </Text>
              </View>
              <Text style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: '600', color: t.text2 }}>
                {EUR(env.used)} / {EUR(env.limit)}
              </Text>
              <Icon name="caretRight" size={18} color={t.text3} style={{ marginLeft: S.md }} />
            </View>
          </Tap>
        </Linha>
      ))}

      <AddButton t={t} label="criar envelope" onPress={() => {
        setInput('');
        setSheetOpen('newEnvelope');
      }} />

      {/* ⚠ O botão «Transferir entre envelopes» SAIU daqui (16/09/2026).
          Punha `setSheetOpen('transferEnvelopes')` e nenhuma folha lia esse
          valor — não há `sheetOpen === 'transferEnvelopes'` em lado nenhum
          deste ficheiro. Era um controlo morto: tocava-se e o ecrã ficava na
          mesma, sem erro e sem resposta.
          Mover dinheiro entre envelopes existe, e funciona, no Dinheiro
          («mover dinheiro entre envelopes», que abre a folha `mover`). Um
          segundo caminho para a mesma coisa, num ecrã que não a sabe fazer,
          não é uma falta — é uma promessa por cumprir. */}
    </View>
  );

  // As especialidades médicas viviam aqui, numa quinta aba, E na Saúde — duas
  // interfaces sobre a mesma lista `s.specialities`. Saíram para a Saúde, que
  // é onde se usam: aparecem ao marcar uma consulta.
  //
  // ⚠ Com elas foi-se o RENOMEAR, e é bom que se tenha ido. O
  // `renameSpecialty` da loja troca o nome na lista e mais nada — os episódios
  // de `health` guardam a especialidade como texto e ficavam a apontar para um
  // nome que já não existe. Um renomear correto tem de os migrar; até o haver,
  // não há renomear nenhum, o que é melhor do que ter um que parte fichas
  // clínicas em silêncio.

  return (
    <View style={{ flex: 1, backgroundColor: t.page }}>
      <View style={{ gap: S.xl }}>
        {/* A faixa é UMA linha, contígua, e agora CABE.

            ⚠ Duas coisas que ela já não faz, e que custaram medição:

              intervalos entre abas   havia S.md, e dava OITO pixels mortos
                                      entre cada par — um toque ali não
                                      acertava em nada e a pessoa tocava outra
                                      vez sem perceber porquê
              abas estreitas          a «Lojas» tinha 31 px de largura; o
                                      INVARIANTE #5 não fala só de altura

            ── E o corte, que era real ─────────────────────────────────────

            Cortava num telemóvel a sério, não só na teoria. Medido a 402 px,
            aba a aba: Orçamento 84, Membros 75, Envelopes 80, Lojas 51,
            Especialidades 107 — a última acabava em 413 e a coluna acaba em
            386. Vinte e sete pixels por fora, comidos pelo `overflow: hidden`
            sem deixar rasto, que é o que faz isto parecer erro de desenho em
            vez de falta de espaço.

            O deslize horizontal e a quebra em duas linhas foram vistos e
            recusados. A saída foi tirar a QUINTA ABA: as especialidades
            médicas eram geridas em DOIS sítios sobre a mesma lista
            `s.specialities` — aqui e na Saúde. A faixa só tinha cinco abas por
            haver uma secção a mais, e é aí que estava a causa.

            ⚠ O enchimento é 10, e voltou a 10 depois de ter estado em 4.
            Apertá-lo foi medido e funcionava — com 4 a faixa acabava em 263
            dos 396 úteis — mas com quatro abas era apertar sem precisar: os
            133 px que sobravam iam todos para um vazio à direita, e as
            etiquetas ficavam a 8 px uma da outra, mais parecidas com uma linha
            corrida do que com quatro abas.

            Com quatro abas e 10 de enchimento: acaba em 306 dos 396 de um
            telefone de 412, 90 px de folga, e aguenta até aos 322 px. Se
            alguma vez voltar uma quinta aba, isto corta outra vez — e é a aba
            que tem de sair, não o enchimento. */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1,
          borderBottomColor: t.border, paddingBottom: S.md }}>
          {[
            { key: 'orcamento', label: 'Orçamento' },
            { key: 'membros', label: 'Membros' },
            { key: 'envelopes', label: 'Envelopes' },
            { key: 'lojas', label: 'Lojas' },
          ].map(({ key, label }) => (
            <Pressable key={key} onPress={() => setTab(key)}
              accessibilityRole="tab" accessibilityLabel={label}
              accessibilityState={{ selected: tab === key }} aria-selected={tab === key}
              style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10,
                alignItems: 'center', justifyContent: 'flex-end', paddingBottom: S.sm,
                borderBottomWidth: tab === key ? 2 : 0,
                borderBottomColor: tab === key ? t.titulo : 'transparent' }}>
              <Text style={{ fontFamily: FONT.ui, fontSize: 12, fontWeight: '600',
                color: tab === key ? t.actFg : t.text3 }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'orcamento' && renderBudgetTab()}
        {tab === 'membros' && renderMembersTab()}
        {tab === 'envelopes' && renderEnvelopesTab()}
        {tab === 'lojas' && renderShopsTab()}

        {/* ⚠ Era um `Pressable` com o rótulo em `t.accent` a 14 px — a cor do
            esquema num rótulo pequeno, que falha 4,5:1 em seis dos doze temas
            (classe 24), e o acento numa acção de DESISTIR, que é o mesmo defeito
            do «Fechar» do acesso restrito. Passa ao `Primary comum`, o desenho
            que o «Fechar» de cima já tem. */}
        <View style={{ paddingVertical: S.lg }}>
          <Primary t={t} comum label="Fechar" onPress={onClose} />
        </View>
      </View>

      {/* ── O nome da família ────────────────────────────────────────────── */}
      {sheetOpen === 'nomeDaCasa' && (
        <Sheet t={t} title="Nome da Família" sub={`Agora: ${nomeDaCasa}`}
          onClose={() => { setSheetOpen(null); setInput(''); setErro(null); }}
          action={
            <Primary t={t} comum label={aGuardar ? 'A guardar…' : 'Guardar'}
              disabled={aGuardar || !input.trim() || input.trim() === nomeDaCasa}
              onPress={() => executar(
                () => renomearCasa(input),
                () => { setSheetOpen(null); setInput(''); })} />
          }>
          <View style={{ gap: S.md }}>
            <View>
              <Label t={t}>Como se chama esta casa</Label>
              <TextInput accessibilityLabel="Nome da casa"
                placeholder="Ex: Bengui"
                value={input}
                onChangeText={setInput}
                maxLength={40}
                style={campo(t)}
              />
            </View>
            <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
              É o nome que aparece na entrada e ao lado de cada membro.
            </Text>
            {erro ? <Tile t={t} kind="warn">{erro}</Tile> : null}
          </View>
        </Sheet>
      )}

      {/* ── Acrescentar um membro ────────────────────────────────────────── */}
      {sheetOpen === 'novoMembro' && (
        <Sheet t={t} title="Acrescentar Membro" sub={`À casa ${nomeDaCasa}`}
          onClose={() => { setSheetOpen(null); setErro(null); }}
          action={
            <Primary t={t} comum label={aGuardar ? 'A acrescentar…' : 'Acrescentar'}
              disabled={aGuardar || !form.nome.trim()}
              onPress={() => executar(
                () => acrescentarMembro(form),
                () => setSheetOpen(null))} />
          }>
          <View style={{ gap: S.lg }}>
            <View style={{ gap: S.md }}>
              <Label t={t}>Papel</Label>
              <View style={{ flexDirection: 'row', gap: S.md }}>
                {[['crianca', 'Criança'], ['adulto', 'Adulto'], ['admin', 'Administração']].map(([v, r]) => (
                  <View key={v} style={{ flex: 1 }}>
                    <Choice t={t} label={r} selected={form.papel === v}
                      onPress={() => setForm(f => ({ ...f, papel: v, segredo: '' }))} />
                  </View>
                ))}
              </View>
              <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
                {form.papel === 'crianca'
                  ? 'Uma criança entra com um PIN de 6 dígitos e não vê o orçamento da casa.'
                  : 'Um adulto entra com a conta Google e vê o dinheiro da casa.'}
              </Text>
            </View>

            <View>
              <Label t={t}>Nome</Label>
              <TextInput accessibilityLabel="Nome do membro" placeholder="Ex: Ana" value={form.nome} maxLength={30}
                onChangeText={(v) => setForm(f => ({ ...f, nome: v }))} style={campo(t)} />
            </View>

            {/* A concordância não é um pormenor: é o que faz a app dizer «a
                Ana deve» e não «o Ana deve» em cada frase que a nomeia. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.subtle,
              borderWidth: 1, borderColor: t.border, borderRadius: R.card, padding: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text1 }}>Tratar no feminino</Text>
                <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
                  {form.fem ? `«a ${form.nome.trim() || 'Ana'}», «à ${form.nome.trim() || 'Ana'}»`
                            : `«o ${form.nome.trim() || 'Bruno'}», «ao ${form.nome.trim() || 'Bruno'}»`}
                </Text>
              </View>
              <Toggle t={t} on={form.fem} label="Tratar no feminino"
                onPress={() => setForm(f => ({ ...f, fem: !f.fem }))} />
            </View>

            {form.papel === 'crianca' ? (
              <View>
                <Label t={t}>PIN de 6 dígitos</Label>
                <TextInput accessibilityLabel="PIN de 6 dígitos" placeholder="000000" keyboardType="numeric" maxLength={6} secureTextEntry
                  value={form.segredo} onChangeText={(v) => setForm(f => ({ ...f, segredo: v }))}
                  style={campo(t)} />
              </View>
            ) : (
              <>
                <View>
                  <Label t={t}>Endereço de e-mail</Label>
                  <TextInput accessibilityLabel="Endereço de e-mail" placeholder="nome@gmail.com" keyboardType="email-address"
                    autoCapitalize="none" value={form.email}
                    onChangeText={(v) => setForm(f => ({ ...f, email: v }))} style={campo(t)} />
                </View>
                <View>
                  <Label t={t}>Palavra-passe do servidor</Label>
                  <TextInput accessibilityLabel="Palavra-passe do servidor" placeholder="Pelo menos 8 caracteres" secureTextEntry
                    value={form.segredo} onChangeText={(v) => setForm(f => ({ ...f, segredo: v }))}
                    style={campo(t)} />
                  <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3, marginTop: S.sm }}>
                    É a palavra-passe da conta na casa, não a da Google. Seguirá
                    por e-mail para a pessoa, em seu nome, com o endereço da app;
                    ela pode mudá-la depois no Perfil.
                  </Text>
                </View>
              </>
            )}

            {erro ? <Tile t={t} kind="warn">{erro}</Tile> : null}
          </View>
        </Sheet>
      )}

      {/* ── Um membro: papel, PIN, e a saída ─────────────────────────────── */}
      {/* Era uma folha só para o PIN mais um diálogo só para o papel, e a
          linha do membro tinha de escolher qual abrir. Uma linha, um destino:
          o que se muda num membro está tudo aqui. */}
      {sheetOpen === 'membro' && selectedMember && (
        <Sheet t={t} title={selectedMember}
          sub={MEMBERS[selectedMember]?.email || 'Perfil de criança'}
          leading={<Avatar {...avatarDe(selectedMember, MEMBERS[selectedMember], t.text3)} size={40} />}
          onClose={fecharMembro}
          action={
            <View style={{ gap: S.md }}>
              {(s.roles[selectedMember] || 'crianca') === 'crianca' ? (
                <Primary t={t} comum label="Guardar PIN" disabled={!input || !!pinMsg}
                  onPress={() => { if (setPin(selectedMember, input)) return; fecharMembro(); }} />
              ) : null}
              <Pressable onPress={() => { setErro(null); setModal('confirmarRemocao'); }}
                accessibilityRole="button" accessibilityLabel={`Tirar ${selectedMember} da casa`}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.body, fontSize: 14, color: t.state.errTexto }}>
                  Tirar da casa
                </Text>
              </Pressable>
            </View>
          }>
          <View style={{ gap: S.lg }}>
            {/* O nome é a primeira coisa da folha porque é a que se vem cá
                mudar mais vezes — um engano de escrita, ou um nome próprio
                que a família não usa. */}
            <View>
              <Label t={t}>Nome</Label>
              <TextInput accessibilityLabel="Nome do membro" value={form.nome} maxLength={30}
                onChangeText={(v) => setForm(f => ({ ...f, nome: v }))} style={campo(t)} />
              {form.nome.trim() !== selectedMember ? (
                <View style={{ gap: S.md, marginTop: S.md }}>
                  {/* O aviso aparece ANTES de se guardar, não depois. Um PIN
                      apagado sem avisar é uma criança que não entra e não
                      percebe porquê. */}
                  {temPin(selectedMember) ? (
                    <Tile t={t} kind="warn">
                      O PIN é apagado quando o nome muda, e terá de ser definido
                      outra vez aqui. O que está feito — tarefas, cofre, ficha de
                      saúde — acompanha o nome novo.
                    </Tile>
                  ) : null}
                  <Primary t={t} comum label={aGuardar ? 'A guardar…' : 'Guardar nome'}
                    disabled={aGuardar || !form.nome.trim()}
                    onPress={() => executar(
                      () => renomearMembro(selectedMember, form.nome),
                      () => setSelectedMember(form.nome.trim()))} />
                </View>
              ) : null}
            </View>

            <View style={{ gap: S.md }}>
              <Label t={t}>Papel</Label>
              <View style={{ flexDirection: 'row', gap: S.md }}>
                {[['crianca', 'Criança'], ['adulto', 'Adulto'], ['admin', 'Administração']].map(([v, r]) => {
                  const actual = (s.roles[selectedMember] || 'crianca');
                  const pode = v === actual || canChangeRole(actual, v);
                  return (
                    <View key={v} style={{ flex: 1, opacity: pode ? 1 : 0.4 }}>
                      <Choice t={t} label={r} selected={actual === v}
                        onPress={() => { if (pode && v !== actual) executar(
                          () => editarMembro(selectedMember, { papel: v }), () => {}); }} />
                    </View>
                  );
                })}
              </View>
              <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
                Uma criança pode passar a adulto — e passa a precisar de conta
                Google própria. Um adulto não volta a criança, e a casa nunca
                pode ficar sem administração.
              </Text>
            </View>

            {(s.roles[selectedMember] || 'crianca') === 'crianca' ? (
              <View>
                <Label t={t}>{temPin(selectedMember) ? 'Alterar o PIN' : 'Definir o PIN'}</Label>
                <TextInput accessibilityLabel="PIN de 6 dígitos" placeholder="000000" keyboardType="numeric" maxLength={6} secureTextEntry
                  value={input} onChangeText={setInput} style={campo(t)} />
                {pinMsg ? <View style={{ marginTop: S.md }}><Tile t={t} kind="warn">{pinMsg}</Tile></View> : null}
              </View>
            ) : null}

            {erro ? <Tile t={t} kind="warn">{erro}</Tile> : null}
          </View>
        </Sheet>
      )}

      {/* ── Tirar da casa ────────────────────────────────────────────────── */}
      {modal === 'confirmarRemocao' && selectedMember && (
          /* ⚠ Pelo `Confirm`, como os dois diálogos do mês. Era um diálogo
              feito à mão — a segunda porta da classe 12 —, com um `Pressable`
              a fazer de cartão para engolir o toque. Ao tirar-lhe o papel de
              botão, troquei-o por um `View` com `onStartShouldSetResponder` e
              na web isso NÃO engole nada: tocar no título fechava o diálogo.
              Medido. O `Confirm` já resolve isto, e é um desenho só: o botão
              destrutivo cheio a `errDeep` com branco por cima, 5,79 no pior
              dos doze temas. O erro do servidor entra na mensagem, e o botão
              diz «A tirar…» enquanto espera.

              ⚠ E é um comentário JS, não JSX: dentro do `( )` de um `&&`, um
              comentário JSX (chaveta, barra, asterisco) ao lado do `<Confirm>`
              são DUAS expressões — e o ficheiro deixou de compilar. E a primeira
              versão DESTA frase escrevia essa sequência por extenso, com o
              asterisco-barra a fechar o comentário a meio. Terceira vez neste
              ficheiro num dia. */
          <Confirm t={t} destructive icon="trash"
            title={`Tirar ${selectedMember} da casa?`}
            message={'Deixa de entrar nesta casa e de aparecer nas tarefas, na agenda e '
              + 'no dinheiro. O que já lá está — tarefas feitas, movimentos, despesas — '
              + 'fica no histórico da casa.' + (erro ? `\n\n${erro}` : '')}
            confirmLabel={aGuardar ? 'A tirar…' : 'Tirar'}
            onConfirm={() => { if (!aGuardar) executar(() => removerMembro(selectedMember), fecharMembro); }}
            onCancel={() => setModal(null)} />
      )}

      {sheetOpen === 'editEnvelope' && (
        <Sheet t={t} title="Editar Envelope" sub={selectedEnvelope}
          onClose={() => {
            setSheetOpen(null);
            setSelectedEnvelope(null);
            setInput('');
            setLimitInput('');
          }}
          action={
            <Primary t={t} comum label="Guardar" onPress={() => {
              if (input.trim() && limitInput.trim()) {
                const newLimit = parseFloat(limitInput.replace(',', '.'));
                if (isNaN(newLimit) || newLimit <= 0) return;

                const oldName = selectedEnvelope;
                const newName = input.trim();
                set(s => {
                  const newLimits = { ...s.monthLimits };
                  newLimits[newName] = newLimit;
                  if (oldName !== newName) delete newLimits[oldName];
                  // ⚠ O ajuste do mês acompanha o nome. Se ficasse na chave
                  // antiga, o dinheiro movido para este envelope desaparecia
                  // do ecrã ao renomeá-lo.
                  const newMoves = { ...s.envMove };
                  if (newMoves[oldName] !== undefined && oldName !== newName) {
                    newMoves[newName] = newMoves[oldName];
                    delete newMoves[oldName];
                  }
                  return { monthLimits: newLimits, envMove: newMoves };
                });
                // E sobe: o envelope é da casa, não deste telemóvel.
                alterarEnvelope(oldName, { nome: newName, limite: newLimit });
                setSheetOpen(null);
                setSelectedEnvelope(null);
                setInput('');
                setLimitInput('');
              }
            }} />
          }>
          <View style={{ gap: S.md }}>
            <View>
              <Label t={t}>Nome do envelope</Label>
              {/* ⚠ `campo(t)`: os dois campos desta folha tinham 36 px de
                  altura — abaixo dos 44 do INVARIANTE #5 — e nenhum rótulo em
                  voz (09/09/2026). O estilo escrito à mão não trazia o
                  `minHeight` que o `campo` tem. */}
              <TextInput
                placeholder="Nome" accessibilityLabel="Nome do envelope"
                value={input}
                onChangeText={setInput}
                style={campo(t)}
              />
            </View>
            <View>
              <Label t={t}>Limite mensal (€)</Label>
              {/* O campo de número da app (14/09/2026). O estado continua a ser
                  texto — é o que o «Guardar» já lia —; o campo traduz. */}
              <View style={{ marginTop: S.sm }}>
                <NumField t={t} vazio step={10} min={0} max={99999} rotulo="Limite mensal em euros" placeholder="0,00 €"
                  value={String(limitInput).trim() === '' ? null : Number(String(limitInput).replace(',', '.'))}
                  onChange={(v) => setLimitInput(v == null ? '' : String(v))} />
              </View>
            </View>
          </View>
        </Sheet>
      )}

      {sheetOpen === 'newEnvelope' && (
        <Sheet t={t} title="Criar Envelope" sub="Um envelope novo para esta casa, com o seu limite"
          onClose={() => {
            setSheetOpen(null);
            setInput('');
          }}
          action={
            // ⚠ A folha só pede o nome, e criar um envelope acrescenta
            // LIMITE_NOVO_ENVELOPE ao orçamento da casa — 500,00 € que ninguém
            // escreveu nem viu. A linha por baixo diz o número antes de ele
            // entrar na conta; corrige-se a seguir na folha de editar.
            <Primary t={t} comum label="Criar"
              sub={input.trim() ? `Limite inicial de ${EUR(LIMITE_NOVO_ENVELOPE)}` : null}
              onPress={() => {
                if (input.trim()) {
                  criarEnvelope(input.trim(), LIMITE_NOVO_ENVELOPE);
                  setSheetOpen(null);
                  setInput('');
                }
              }} />
          }>
          <View style={{ gap: S.md }}>
            <View>
              <Label t={t}>Nome do envelope</Label>
              <TextInput
                placeholder="Ex: Entretenimento" accessibilityLabel="Nome do envelope"
                value={input}
                onChangeText={setInput}
                style={campo(t)}
              />
            </View>
          </View>
        </Sheet>
      )}

      {/* O diálogo «Alterar papel» vivia aqui, e escolher o rótulo fazia
          `FEM(name)` — `name` não existe neste âmbito. No navegador resolvia
          para o `window.name`, string vazia, e dizia sempre «Administrador»;
          em React Native seria um ReferenceError. O papel mudou-se para
          dentro da folha do membro, onde o nome está em mão. */}

      {/* ── Os dois diálogos do mês ───────────────────────────────────────
          ⚠ Eram escritos à mão, os dois, com os botões a 34 px de altura.
          Medido no navegador: «Cancelar» e «Abrir», 34×140, num diálogo que
          abre ou fecha o mês do orçamento da casa. O INVARIANTE #5 são 44, e
          nenhuma das 1700 provas os media — porque nenhuma abria estes dois
          diálogos.

          A causa era não terem `minHeight` nenhum: contavam com `padding: 8`
          mais a altura da letra, e 8+8+18 dá 34. Um alvo que resulta de uma
          soma em vez de um mínimo declarado é um alvo por acidente.

          Passam a usar o `Confirm`, que é o diálogo de confirmação da app e já
          declara os 44 — e assim deixam de ser um terceiro desenho para o
          padrão «Cancelar / Confirmar» que a app já tinha em dois sítios. */}
      {modal === 'openMonth' && (
        <Confirm t={t} icon="calendar"
          title={`Abrir ${mesSeguinte(s.monthName)}?`}
          message={`Distribui o rendimento pelos envelopes e recomeça a contagem dos gastos. ${mesComAno(s.monthName)} passa a fechado.`}
          confirmLabel={`Abrir ${mesSeguinte(s.monthName)}`}
          onConfirm={() => {
            // ⚠ Pelo `abrirMes` da loja, como o Dinheiro. Isto escrevia
            // `monthZero: false, registered: 0` e mais nada: a Gestão era uma
            // SEGUNDA porta para a mesma acção, e só uma delas dava para o
            // servidor. Abrir o mês por aqui não criava linha nenhuma em
            // `meses`, e o zero durava até à leitura seguinte — o mês reabria
            // com o gasto do anterior.
            abrirMes({ nome: mesSeguinte(s.monthName), limites: s.monthLimits || {} });
            setModal(null);
          }}
          onCancel={() => setModal(null)} />
      )}

      {modal === 'closeMonth' && (
        <Confirm t={t} icon="checkSquare"
          title={`Fechar ${s.monthName}?`}
          message={`Arquiva as despesas de ${mesComAno(s.monthName)} e recomeça a contagem. O saldo que restar não se move.`}
          confirmLabel={`Fechar ${s.monthName}`}
          onConfirm={() => { fecharMes(); setModal(null); }}
          onCancel={() => setModal(null)} />
      )}

      {sheetOpen === 'newShop' && (
        <Sheet t={t} title="Adicionar Loja" sub="Nova loja"
          onClose={() => {
            setSheetOpen(null);
            setInput('');
          }}
          action={
            <Primary t={t} comum label="Adicionar" onPress={() => {
              if (input.trim()) {
                mudarListaDaCasa('stores', [...s.stores, input.trim()]);
                setSheetOpen(null);
                setInput('');
              }
            }} disabled={!input.trim()} />
          }>
          <View style={{ gap: S.md }}>
            <View>
              <Label t={t}>Nome da loja</Label>
              <TextInput
                placeholder="Ex: Continente" accessibilityLabel="Nome da loja"
                value={input}
                onChangeText={setInput}
                style={campo(t)}
              />
            </View>
          </View>
        </Sheet>
      )}

      {sheetOpen === 'editShop' && (
        <Sheet t={t} title="Editar Loja" sub={s.stores[selectedEnvelope]}
          onClose={() => {
            setSheetOpen(null);
            setSelectedEnvelope(null);
            setInput('');
          }}
          action={
            <View style={{ gap: S.md }}>
              <Primary t={t} comum label="Renomear" onPress={() => {
                if (input.trim()) {
                  // O renomear mantém a POSIÇÃO, e é isso que o distingue de
                  // apagar-e-criar quando a loja compara as duas listas — uma
                  // loja apagada leva atrás as listas de compras que a referem.
                  mudarListaDaCasa('stores',
                    s.stores.map((shop, i) => (i === selectedEnvelope ? input.trim() : shop)));
                  setSheetOpen(null);
                  setSelectedEnvelope(null);
                  setInput('');
                }
              }} disabled={!input.trim() || input === s.stores[selectedEnvelope]} />
              {/* ⚠ Media 33 px: `paddingVertical: 8` mais a letra — um alvo que
                  resulta de uma soma (classe 25). O par dele, «Tirar da casa»,
                  já declarava os 44. E sem nome de loja no rótulo, um leitor de
                  ecrã dizia «Apagar loja» sem dizer qual. */}
              <Pressable accessibilityRole="button" onPress={() => setModal('confirmDeleteShop')}
                accessibilityLabel={`Apagar a loja ${s.stores[selectedEnvelope]}`}
                style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: FONT.body, fontSize: 14, color: t.state.errTexto }}>Apagar loja</Text>
              </Pressable>
            </View>
          }>
          <View style={{ gap: S.md }}>
            <View>
              <Label t={t}>Nome da loja</Label>
              <TextInput
                placeholder="Nome da loja" accessibilityLabel="Nome da loja"
                value={input}
                onChangeText={setInput}
                style={campo(t)}
              />
            </View>
          </View>
        </Sheet>
      )}

      {modal === 'confirmDeleteShop' && (
          /* Pelo `Confirm` — ver o «Tirar da casa» em cima. Os dois botões
              deste mediam 33 px: `paddingVertical: 8` mais a letra, um alvo
              que resulta de uma soma. E a pergunta diz o que se perde: uma
              loja com ida marcada deixa a ida sem loja. */
          <Confirm t={t} destructive icon="trash"
            title={`Apagar «${s.stores[selectedEnvelope]}»?`}
            message={'A loja sai da lista da casa. Os preços que já se registaram nela ficam, '
              + 'para a comparação entre lojas — e uma ida marcada para esta loja fica sem loja.'}
            confirmLabel="Apagar"
            onConfirm={() => {
              mudarListaDaCasa('stores', s.stores.filter((_, i) => i !== selectedEnvelope));
              setModal(null);
              setSheetOpen(null);
              setSelectedEnvelope(null);
            }}
            onCancel={() => setModal(null)} />
      )}
    </View>
  );
}
