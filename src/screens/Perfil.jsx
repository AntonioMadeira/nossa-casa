import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { useStore } from '../store';
import { SCHEMES, S, R, FONT, buildTheme } from '../theme';
import { plural } from '../format';
import { FEM } from '../data';
import { Card, SectionTitle, Label, Row, Pill, Toggle, Tap, Avatar, avatarDe, mostraFotografia } from '../ui';
import Icon from '../Icon';
import { nomeDaFigura } from '../Avatares';
import Sheet from '../Sheet';
import ConfirmarAdministradores from '../sheets/ConfirmarAdministradores';
import EscolherAvatar from '../sheets/EscolherAvatar';
import EscolhaDeEsquema, { BOLA as BOLA_DO_ESQUEMA } from '../EsquemaDeCor';
import * as servidor from '../pocketbase';

// O aspeto por extenso, para a frase que diz o que está escolhido.
// ⚠ UM nome por aspeto, e este mapa é a fonte dele (16/09/2026). O mesmo
// aspeto chamava-se «Sistema» na bola, «Segue o telemóvel» na frase de baixo
// e «Aspeto igual ao do telemóvel» no rótulo de voz — três nomes no mesmo
// cartão, para quem tivesse de os relacionar.
const MODO_LABEL = { claro: 'Claro', escuro: 'Escuro', sistema: 'Sistema' };
// O que o «Sistema» faz, por extenso: entra no rótulo de voz e na frase que
// diz o que está escolhido.
const MODO_EXPLICA = { claro: 'sempre claro', escuro: 'sempre escuro', sistema: 'segue o telemóvel' };

// As duas metades da amostra do aspeto. Não mudam com o tema em vigor — de
// propósito: a bola mostra como a app FICA em cada aspeto, e uma amostra que
// seguisse o tema mostrava o mesmo dos dois lados. Vêm do `buildTheme`, e não
// escritas à mão (o `Login` faz o mesmo, pela mesma regra do CLAUDE.md).
const CLARO_DA_AMOSTRA = buildTheme(0, false).page;
// ⚠ E a TINTA sai da mesma função, pela mesma razão.
//
// O sol estava pintado com o `t.text2` do tema EM VIGOR. No modo escuro esse
// token é quase branco (`#DCE3EA`) e o fundo da bola é quase branco
// (`#F6F7F9`): 1,15:1 — quem tinha a app escura não via sol nenhum. O fundo
// destas três bolas não pertence ao tema em vigor, e a tinta também não.
//
// O par `buildTheme(0, true).page` / `.text2` — o escuro — viveu aqui enquanto
// a bola do «Escuro» foi uma AMOSTRA da página escura. Deixou de o ser em
// 15/09/2026: as três são iguais e o que as distingue é o ícone.
const TINTA_NO_CLARO = buildTheme(0, false).text2;

const ROLE_LABEL = (r, name) => {
  const fem = FEM(name);
  return r === 'admin' ? (fem ? 'administradora' : 'administrador') : r === 'adulto' ? 'adulto' : 'criança';
};

// As bolas do esquema de cor vivem em `EsquemaDeCor.jsx` desde 10/09/2026 —
// são as mesmas na folha «O meu perfil» da criança.
export default function Perfil({ t, user, onClose, onSignOut, onSaude, onDoc, onGestao }) {
  const st = useStore();
  const { s, set, isAdmin, resetDemo, startBlank, canSeeHealth, healthOf, receitasAExpirar, membros: MEMBERS, deDemonstracao, nomeDaCasa, mudarPreferencia } = st;

  // A referência 09 mostra a contagem de consultas e um aviso das receitas na
  // própria linha da Saúde. Passa pelo canSeeHealth como tudo o resto.
  const consultas = Object.keys(MEMBERS)
    .filter(m => canSeeHealth(m, user))
    .reduce((a, m) => a + healthOf(m, user).length, 0);
  const receitas = receitasAExpirar(user).length;

  const admin = isAdmin(user);
  const mode = s.themeByUser[user] || 'claro';
  const scheme = s.schemeByUser[user] ?? 0;

  // Qual das duas acções destrutivas está à espera de confirmação.
  //
  // As duas apagavam a casa AO TOQUE — `onPress={resetDemo}`, sem uma pergunta,
  // e lado a lado. Duas acções irreversíveis à distância de um dedo enganado.
  //
  // Agora abrem uma folha que exige a confirmação de TODOS os administradores,
  // cada um com a sua palavra-passe, verificada pelo servidor. Ver
  // `sheets/ConfirmarAdministradores.jsx`.
  const [aApagar, setAApagar] = useState(null);   // 'repor' | 'zero' | null
  const [erroAoApagar, setErroAoApagar] = useState(null);
  const [aEscolherAvatar, setAEscolherAvatar] = useState(false);

  // O subtítulo da linha do Avatar: a escolha EM CURSO, por extenso. Um «ver»
  // ou um «alterar» não diz nada que a seta já não diga; o que a pessoa quer
  // saber ao passar os olhos é o que está lá agora.
  //
  // A ordem é a mesma do `mostraFotografia`, para a linha não poder mentir
  // sobre o que a bola ao lado dela mostra.
  const COMO_APARECE = mostraFotografia(MEMBERS[user])
    ? 'A fotografia da conta Google'
    : (MEMBERS[user]?.figura && nomeDaFigura(MEMBERS[user].figura))
      || 'A sua inicial';

  // Quantos administradores tem esta casa — a frase da secção de apagar conta-os
  // em vez de prometer «todos» sem dizer quantos são.
  const nAdmins = Object.values(s.roles || {}).filter(r => r === 'admin').length;

  const APAGAR = {
    repor: {
      titulo: 'Repor Dados de Demonstração',
      aviso: 'Esta acção substitui a casa pelos dados de demonstração. '
        + 'O que esta família escreveu — eventos, tarefas, despesas, cofres — sai. Não se desfaz.',
      rotulo: 'Repor a demonstração',
      fazer: async () => { resetDemo(); },
    },
    zero: {
      titulo: 'Começar de Zero',
      aviso: 'Esta acção apaga TUDO o que esta casa registou — eventos, tarefas, despesas, '
        + 'envelopes, metas, contas fixas, cofres, equipamentos, preços e saúde — '
        + 'NESTE APARELHO E NO SERVIDOR. '
        + 'Os membros e os papéis ficam. Não se desfaz.',
      rotulo: 'Apagar os dados da casa',
      // O servidor PRIMEIRO, e a loja local só depois.
      //
      // Ao contrário de tudo o resto nesta app, que é local-primeiro: se o
      // servidor recusar — sessão caducada, papel mudado entretanto — a casa
      // local fica intacta e a folha diz porquê. Limpar aqui e falhar lá
      // deixava as duas metades a discordar, e a seguinte leitura do servidor
      // trazia tudo de volta sem ninguém perceber.
      fazer: async () => {
        const apagada = servidor.estaLigado() ? await servidor.auth.limparCasaNoServidor() : null;
        startBlank((apagada && apagada.zerado_em) || null);
      },
    },
  };

  return (
    <Sheet t={t} title={`${user} ${nomeDaCasa}`} sub={MEMBERS[user]?.email || ROLE_LABEL(s.roles[user], user)}
      onClose={onClose}
      leading={
        // O avatar abre a escolha. Um alvo de 44 à volta de uma bola de 40 —
        // o INVARIANTE #5 não abre excepção para o cabeçalho de uma folha.
        <Tap onPress={() => setAEscolherAvatar(true)} label="Escolher avatar">
          <Avatar {...avatarDe(user, MEMBERS[user], t.text3)} size={40} />
        </Tap>
      }
      headerRight={
        <Tap onPress={onSignOut} label="Terminar sessão">
          <Icon name="logout" size={22} color={t.text3} />
        </Tap>
      }>
      {/* As duas secções das referências 09 e 24: o que é da casa primeiro,
          o que é só deste perfil depois. Não havia títulos nenhuns, e as
          entradas da casa estavam por baixo do Aspeto. */}
      <View>
        <SectionTitle t={t}>A Casa</SectionTitle>
        {/* Linhas planas, sem cartão — desenho C (09/09/2026). */}
        <View style={{ paddingHorizontal: S.xs }}>
          {admin ? (
            <Row t={t} icon="houseGear" title="Gestão da Casa"
              sub="Rendimento, envelopes, semanada, membros"
              onPress={() => { onClose(); onGestao?.(); }} />
          ) : null}
          <Row t={t} icon="heartPulse" title="Saúde da Família"
            sub={plural(consultas, 'consulta marcada', 'consultas marcadas')}
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              {receitas ? (
                <Pill label={plural(receitas, 'receita a expirar', 'receitas a expirar')}
                  fg={t.state.warnDeep} bg={t.state.warnBg} border={t.state.warn} />
              ) : null}
              <Icon name="caretRight" size={18} color={t.text3} />
            </View>}
            onPress={() => { onClose(); onSaude?.(); }} last />
        </View>
      </View>

      {/* ── Aparência ──────────────────────────────────────────────────────
          Três perguntas sobre a mesma coisa — como este perfil se vê e como
          esta pessoa aparece — debaixo de um cabeçalho só.

          O AVATAR entra aqui porque não estava em lado nenhum: a escolha
          abria-se tocando na bola do cabeçalho da folha, e nada no ecrã dizia
          que aquilo era tocável. Um gesto que não se anuncia não existe. */}
      <View>
        <SectionTitle t={t}>Aparência</SectionTitle>
        <View style={{ paddingHorizontal: S.xs }}>
          <Row t={t} icon="user" title="Avatar" sub={COMO_APARECE}
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
              <Avatar {...avatarDe(user, MEMBERS[user], t.text3)} size={28} />
              <Icon name="caretRight" size={18} color={t.text3} />
            </View>}
            onPress={() => setAEscolherAvatar(true)} last />
        </View>
      </View>

      <Card t={t} style={{ gap: S.lg }}>
      <View style={{ gap: S.md }}>
        <Label t={t}>Claro ou escuro</Label>
        {/* ⚠ Bolas com o NOME por baixo, como o escolhedor de pessoa
            (15/09/2026: «põe em círculo como o avatar e cor do perfil»). Eram
            três quadrados de 44 com um ícone dentro, e o terceiro levava o
            `refresh` — o ícone que a app já usa para a alternância das tarefas
            e para a manutenção de um equipamento. Sem nome por baixo e com um
            ícone emprestado, ninguém sabia o que era: o dono da casa leu-o como
            «igual ao Claro». Não é — é o que SEGUE O TELEMÓVEL.
            O escolhido leva o anel do acento, como a bola de uma pessoa.

            ⚠ O «Sistema» tem agora ÍCONE PRÓPRIO (15/09/2026, a pedido: «o
            ícone do telemóvel»). A amostra partida ao meio dizia «os dois
            aspetos», mas não dizia de onde vem a escolha — e num telemóvel
            claro continuava a parecer-se com o «Claro». O aparelho desenhado
            di-lo sem palavra nenhuma: o que o telemóvel disser.

            ⚠ E AS TRÊS BOLAS SÃO IGUAIS — mesmo fundo, mesma tinta («todos
            devem ter o mesmo background e cor do ícone que o Claro tem,
            sempre»). Eram AMOSTRAS: a do «Escuro» com a página escura por
            dentro, a do «Sistema» partida ao meio. Uma amostra tem de se
            entender antes de se ler, e três amostras diferentes davam três
            pesos diferentes na mesma fila — a escura puxava o olho para si
            como se fosse a escolhida.

            Agora o que distingue os três é o ÍCONE, que é o que se lê primeiro,
            e a escolha é o anel do acento. O fundo fixo tem ainda a vantagem de
            não depender do tema em vigor: a tinta do ícone está medida contra
            ele nos doze temas, e não há como um deles a apagar. */}
        <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'flex-start' }}>
          {[{ k: 'claro', icon: 'sun', label: 'Claro' },
            { k: 'escuro', icon: 'moon', label: 'Escuro' },
            { k: 'sistema', icon: 'telemovel', label: 'Sistema' }].map(o => {
            const on = mode === o.k;
            return (
              <Pressable key={o.k} onPress={() => mudarPreferencia(user, { aspeto: o.k })}
                accessibilityRole="button"
                accessibilityLabel={`Aspeto ${o.label} — ${MODO_EXPLICA[o.k]}`}
                accessibilityState={{ selected: on }} aria-pressed={on}
                style={{ width: 52, minHeight: 44, alignItems: 'center', justifyContent: 'flex-start' }}>
                {/* ⚠ A MESMA BOLA DAS CORES, à letra (15/09/2026: «os círculos de
                    cima devem ter o mesmo tamanho dos de baixo»). Eram 32 dentro
                    de um anel de 40; as do esquema de cor, quatro linhas abaixo
                    no mesmo cartão, são 34 com a borda POR DENTRO. Duas bolas
                    com dois diâmetros e duas maneiras de dizer «esta» — à
                    distância de um olhar uma da outra.
                    Agora é o `BOLA_DO_ESQUEMA`, lido do outro componente e não
                    escrito aqui: se lá mudar, muda aqui. */}
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: BOLA_DO_ESQUEMA, height: BOLA_DO_ESQUEMA, borderRadius: R.pill,
                    backgroundColor: CLARO_DA_AMOSTRA,
                    // A borda de 1 existe sempre: a bola é quase branca e sem
                    // ela desaparecia dentro de um cartão claro. A de 2 no
                    // acento é a marca de escolhida, como na bola das cores.
                    borderWidth: on ? 2 : 1, borderColor: on ? t.titulo : t.border,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={o.icon} size={18} color={TINTA_NO_CLARO} />
                  </View>
                </View>
                <Text numberOfLines={1} style={{ fontFamily: FONT.ui, fontSize: 11, lineHeight: 12, marginTop: -2,
                  maxWidth: 52, color: on ? t.actFg : t.text3, fontWeight: on ? '600' : '400' }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: t.divider }} />

      <View style={{ gap: S.md }}>
        <Label t={t}>Cor do perfil</Label>
        <EscolhaDeEsquema t={t} escolhido={scheme}
          onEscolher={(i) => mudarPreferencia(user, { esquema: i })} />
        <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
          {MODO_LABEL[mode]} ({MODO_EXPLICA[mode]}) · {SCHEMES[scheme].name}. Vale só para
          este perfil — os outros membros mantêm o que escolheram.
        </Text>
      </View>
      </Card>

      {/* ── Avisos ─────────────────────────────────────────────────────────
          Os dados estão em `s.notif` desde sempre e nada os mostrava. Sobe a
          cabeçalho próprio: era um `Label` de 12 px a servir de secção. */}
      <View>
        <SectionTitle t={t}>Avisos</SectionTitle>
        <Card t={t} style={{ gap: S.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
            {/* ⚠ A frase tem de dizer o que É, e não o que seria (16/09/2026).
                Estava no presente do indicativo — «Um resumo por dia às 20:00»
                — com o interruptor ao lado DESLIGADO: a app afirmava um aviso
                que não manda. Desligada, diz o que está desligado. */}
            <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 14.5, lineHeight: 22, color: t.text2 }}>
              {s.notif.digest
                ? `Um resumo por dia às ${s.notif.hour}, avisando ${plural(s.notif.lead, 'dia', 'dias')} antes de cada prazo.`
                : `Sem resumo diário. Ligue para receber um por dia às ${s.notif.hour}, ${plural(s.notif.lead, 'dia', 'dias')} antes de cada prazo.`}
            </Text>
            <Toggle t={t} on={s.notif.digest} label="Resumo diário"
              onPress={() => mudarPreferencia(user, { notif: { digest: !s.notif.digest } })} />
          </View>
        </Card>
      </View>

      {/* ── A App ──────────────────────────────────────────────────────────
          Este cartão não tinha cabeçalho nenhum, e vinha depois de uma régua
          que não separava nada com nome. */}
      <View>
        <SectionTitle t={t}>A App</SectionTitle>
        <View style={{ paddingHorizontal: S.xs }}>
          <Row t={t} icon="fileText" title="Documentação" sub="O que a app faz, versão a versão"
            onPress={() => { onClose(); onDoc?.(); }} last />
        </View>
        {/* ⚠ Isto era uma LINHA, com ícone, título e subtítulo — igual à
            Documentação ao lado, que abre um ecrã. Uma afirmação vestida de
            navegação: parecia tocável e não era. É uma nota de rodapé, e passa
            a ter o aspeto de uma. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md,
          paddingHorizontal: 2, paddingTop: S.md }}>
          <Icon name="lock" size={14} color={t.text3} />
          <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 11.5, lineHeight: 18, color: t.text3 }}>
            {/* Os dados da casa vivem no servidor; o dispositivo guarda só uma
                cópia de trabalho. Sem sessão, a cópia pode estar atrasada. */}
            {servidor.auth.valida()
              ? 'Guardado no servidor da casa — os mesmos dados em todos os dispositivos, incluindo a saúde.'
              : 'Sem ligação ao servidor da casa — o que vê é uma cópia neste dispositivo, que pode não ser a mais recente.'}
          </Text>
        </View>
      </View>

      {/* ── Apagar Dados ───────────────────────────────────────────────────
          ⚠ Estes dois botões estavam soltos no fim da página, sem cabeçalho e
          sem uma palavra a dizer o que faziam. E o mais perigoso dos dois era
          o ÚNICO pintado com a cor de ação — que nesta app se lê como «este é
          o botão principal do ecrã». O que ele faz é apagar a casa.

          Agora têm secção com nome, uma frase que diz o que os espera, e a cor
          de erro do sistema em vez do acento do esquema. A cor de ação volta a
          querer dizer só uma coisa. */}
      {admin ? (
        <View>
          <SectionTitle t={t}>Apagar Dados</SectionTitle>
          <Card t={t} style={{ gap: S.lg }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 21, color: t.text2 }}>
              As duas acções não se desfazem, e nenhuma acontece ao toque:{' '}
              {nAdmins > 1
                ? `pedem a confirmação dos ${nAdmins} administradores desta casa.`
                : 'pedem a sua confirmação.'}
            </Text>
            {/* ── Lado a lado ──────────────────────────────────────────────
                Eram dois cilindros de largura inteira, empilhados. Lado a lado
                ocupam metade da altura e leem-se como o que são: duas variantes
                da mesma decisão, e não duas secções.

                ⚠ Metade da largura obriga a encurtar o rótulo, e é onde isto
                pode correr mal: «Repor Dados de Demonstração» não cabe em
                155 px. Fica «Repor Demonstração» / «Começar de Zero», com o
                `accessibilityLabel` inteiro para quem ouve o ecrã — e o cartão
                acima já explica o que as duas fazem em prosa.

                ⚠ E ficam a um dedo de distância uma da outra. As duas são
                irreversíveis; o que as protege é a confirmação dos
                administradores, que nenhuma delas dispensa — e é por isso que
                aproximá-las é aceitável. Sem essa porta não o seria. */}
            <View style={{ flexDirection: 'row', gap: S.md }}>
              <Pressable onPress={() => { setErroAoApagar(null); setAApagar('repor'); }}
                accessibilityRole="button" accessibilityLabel="Repor dados de demonstração"
                style={{ flex: 1, minHeight: 44, borderRadius: R.row, borderWidth: 1, borderColor: t.state.err,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="refresh" size={18} color={t.state.errTexto} />
                <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: '500', color: t.state.errTexto }}>
                  Repor Demonstração
                </Text>
              </Pressable>
              <Pressable onPress={() => { setErroAoApagar(null); setAApagar('zero'); }}
                accessibilityRole="button" accessibilityLabel="Começar de zero, casa nova"
                style={{ flex: 1, minHeight: 44, borderRadius: R.row, borderWidth: 1, borderColor: t.state.err,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="trash" size={18} color={t.state.errTexto} />
                <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: '500', color: t.state.errTexto }}>
                  Começar de Zero
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>
      ) : null}

      {aEscolherAvatar ? (
        <Sheet t={t} title="Avatar" sub={`Como ${user} aparece na casa`}
          onClose={() => setAEscolherAvatar(false)}>
          <EscolherAvatar t={t} user={user} onFeito={() => setAEscolherAvatar(false)} />
        </Sheet>
      ) : null}

      {/* A confirmação dos administradores. Vive dentro da folha do Perfil, e
          não fora dela: o INVARIANTE #1 quer o rodapé como último filho da raiz
          da app, e uma folha aberta fora da árvore levava-o com ela. */}
      {aApagar ? (
        <Sheet t={t} title={APAGAR[aApagar].titulo}
          sub="Precisa de todos os administradores"
          onClose={() => setAApagar(null)}>
          <ConfirmarAdministradores
            t={t} user={user}
            titulo={APAGAR[aApagar].titulo}
            aviso={APAGAR[aApagar].aviso}
            rotuloAcao={APAGAR[aApagar].rotulo}
            erro={erroAoApagar}
            onCancelar={() => setAApagar(null)}
            onConfirmado={async () => {
              try {
                await APAGAR[aApagar].fazer();
                setAApagar(null);
                onClose();
              } catch (e) {
                // A folha fica aberta com o erro à vista. Fechá-la aqui era
                // deixar quem carregou sem saber se a casa foi ou ficou.
                setErroAoApagar(e.message || 'Não foi possível apagar.');
              }
            }} />
        </Sheet>
      ) : null}
    </Sheet>
  );
}
