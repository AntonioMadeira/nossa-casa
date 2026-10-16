import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { S, R, FONT } from './theme';
import Icon, { GoogleG as G } from './Icon';
import {
  MAX_CASA, MAX_NOME, MAX_CRIANCAS, MAX_ADULTOS,
  erroDoNomeDaCasa, erroDoNome, erroDoRascunho, limparRascunho, emailValido,
} from './criar-casa';

// «Criar a minha casa»: quatro passos curtos antes de ir à Google.
//
//   1. como se chama a casa      2. como se chama quem a cria
//   3. quem mais vive cá (pode saltar)      4. confirmar, e ir à Google
//
// Pergunta-se ANTES da Google, de propósito: a Google só serve para dizer quem
// é a pessoa, e a casa que ela vai criar já tem nome quando ela volta. Nada é
// criado até à volta: se a pessoa desistir na Google, não nasceu casa nenhuma.
//
// Aqui só se recolhe e valida. Quem vai à Google é o ecrã de entrada
// (`onCriar`); quem acrescenta as crianças e os adultos é a app, depois do
// login, porque só uma administradora os pode acrescentar.

// Cinzentos sólidos (e não brancos com alfa): sobre a fotografia o alfa muda de
// contraste com o que está por trás, e o texto pequeno tem de se ler sempre.
const BRANCO = '#D5DDE6';
const APAGADO = '#AEB9C6';

const campo = {
  minHeight: 48, borderRadius: R.row, backgroundColor: '#FFFFFF', color: '#0B1B2B',
  paddingHorizontal: 14, fontFamily: FONT.body, fontSize: 16,
};

const Rotulo = ({ children }) => (
  <Text style={{ fontFamily: FONT.ui, fontSize: 13, color: BRANCO }}>{children}</Text>
);

const Botao = ({ rotulo, onPress, primario = false, desativado = false, icone = null }) => (
  <Pressable onPress={onPress} disabled={desativado} accessibilityRole="button" accessibilityLabel={rotulo}
    accessibilityState={{ disabled: desativado }}
    style={({ pressed }) => ({
      minHeight: primario ? 56 : 48, borderRadius: R.row, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 10, opacity: desativado ? 0.55 : 1,
      ...(primario
        ? { backgroundColor: pressed ? '#E8EEF5' : '#FFFFFF' }
        : { borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', backgroundColor: pressed ? 'rgba(255,255,255,0.08)' : 'transparent' }),
    })}>
    {icone}
    <Text style={{ fontFamily: FONT.display, fontSize: primario ? 16 : 15, fontWeight: primario ? '700' : '500',
      color: primario ? '#0B1B2B' : '#FFFFFF', letterSpacing: 0.4 }}>{rotulo}</Text>
  </Pressable>
);

const Etiqueta = ({ texto, onRemover, rotulo }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 14, paddingRight: 4,
    borderRadius: R.row, backgroundColor: 'rgba(255,255,255,0.16)' }}>
    <Text style={{ fontFamily: FONT.body, fontSize: 14, color: '#FFFFFF' }}>{texto}</Text>
    <Pressable onPress={onRemover} accessibilityRole="button" accessibilityLabel={rotulo}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="close" size={16} color="#FFFFFF" />
    </Pressable>
  </View>
);

export default function CriarCasa({ glass, onVoltar, onCriar, ocupado = false, erro = null, aviso: avisoDeFora = null }) {
  const [passo, setPasso] = useState(0);
  const [nomeCasa, setNomeCasa] = useState('');
  const [nome, setNome] = useState('');
  const [criancas, setCriancas] = useState([]);
  const [novaCrianca, setNovaCrianca] = useState('');
  const [adultos, setAdultos] = useState([]);
  const [novoAdulto, setNovoAdulto] = useState({ nome: '', email: '' });
  const [aviso, setAviso] = useState(null);

  const rascunho = () => limparRascunho({ nomeCasa, nome, criancas, adultos });

  const seguinte = () => {
    setAviso(null);
    if (passo === 0) { const e = erroDoNomeDaCasa(nomeCasa); if (e) return setAviso(e); }
    if (passo === 1) { const e = erroDoNome(nome); if (e) return setAviso(e); }
    setPasso(passo + 1);
  };
  const anterior = () => { setAviso(null); if (passo === 0) onVoltar(); else setPasso(passo - 1); };

  const juntarCrianca = () => {
    const v = novaCrianca.trim();
    if (!v) return;
    const e = erroDoNome(v);
    if (e) return setAviso(e);
    if (criancas.length >= MAX_CRIANCAS) return setAviso(`No máximo ${MAX_CRIANCAS} crianças de cada vez.`);
    if ([...criancas, nome.trim()].some((c) => c.toLowerCase() === v.toLowerCase())) return setAviso(`Já há alguém chamado ${v}.`);
    setAviso(null); setCriancas([...criancas, v]); setNovaCrianca('');
  };
  const juntarAdulto = () => {
    const n = novoAdulto.nome.trim(); const m = novoAdulto.email.trim();
    if (!n && !m) return;
    if (!n) return setAviso('Diga o nome do adulto.');
    if (!emailValido(m)) return setAviso('Falta o e-mail do adulto: é com ele que entra pela Google.');
    if (adultos.length >= MAX_ADULTOS) return setAviso(`No máximo ${MAX_ADULTOS} adultos de cada vez.`);
    if ([...criancas, nome.trim(), ...adultos.map((a) => a.nome)].some((c) => c.toLowerCase() === n.toLowerCase())) return setAviso(`Já há alguém chamado ${n}.`);
    setAviso(null); setAdultos([...adultos, { nome: n, email: m }]); setNovoAdulto({ nome: '', email: '' });
  };

  const criar = () => {
    // O que ficou escrito nos campos "acrescentar" e não foi carregado em
    // «Acrescentar» também conta: perder um nome por um botão não carregado é
    // uma surpresa má.
    let r = rascunho();
    if (novaCrianca.trim()) r = { ...r, criancas: [...r.criancas, novaCrianca.trim()] };
    if (novoAdulto.nome.trim() || novoAdulto.email.trim()) r = { ...r, adultos: [...r.adultos, { nome: novoAdulto.nome.trim(), email: novoAdulto.email.trim() }] };
    const e = erroDoRascunho(r);
    if (e) return setAviso(e);
    setAviso(null);
    onCriar(r);
  };

  const titulo = ['Como se chama a casa?', 'E o seu nome?', 'Quem mais vive aqui?', 'Está tudo certo?'][passo];

  return (
    <View style={glass}>
      <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: APAGADO, letterSpacing: 0.6 }}
        accessibilityLabel={`Passo ${passo + 1} de 4`}>
        CRIAR A MINHA CASA · PASSO {passo + 1} DE 4
      </Text>
      <Text style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: '500', color: '#FFFFFF' }}>{titulo}</Text>

      {passo === 0 ? (
        <View style={{ gap: S.sm }}>
          <Rotulo>Aparece no cabeçalho, por exemplo «Família Silva».</Rotulo>
          <TextInput value={nomeCasa} onChangeText={setNomeCasa} maxLength={MAX_CASA} autoFocus
            accessibilityLabel="Nome da casa" placeholder="Silva" placeholderTextColor="#6A7282"
            returnKeyType="next" onSubmitEditing={seguinte} style={campo} />
        </View>
      ) : null}

      {passo === 1 ? (
        <View style={{ gap: S.sm }}>
          <Rotulo>Vai ficar como administrador(a) da casa: acrescenta quem mora cá e decide o que cada um pode fazer.</Rotulo>
          <TextInput value={nome} onChangeText={setNome} maxLength={MAX_NOME} autoFocus
            accessibilityLabel="O seu nome" placeholder="Ana" placeholderTextColor="#6A7282"
            returnKeyType="next" onSubmitEditing={seguinte} style={campo} />
        </View>
      ) : null}

      {passo === 2 ? (
        <View style={{ gap: S.md }}>
          <Rotulo>Pode saltar este passo e acrescentar depois, em Gestão da Casa.</Rotulo>

          <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '500', color: '#FFFFFF' }}>Crianças</Text>
          <Rotulo>Cada uma recebe um PIN de 6 dígitos para entrar. Mostramos-lho no fim, uma vez.</Rotulo>
          {criancas.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {criancas.map((c) => (
                <Etiqueta key={c} texto={c} rotulo={`Tirar ${c}`} onRemover={() => setCriancas(criancas.filter((x) => x !== c))} />
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={novaCrianca} onChangeText={setNovaCrianca} maxLength={MAX_NOME}
              accessibilityLabel="Nome da criança" placeholder="Nome da criança" placeholderTextColor="#6A7282"
              returnKeyType="done" onSubmitEditing={juntarCrianca} style={{ ...campo, minHeight: 48, flex: 1 }} />
            <Pressable onPress={juntarCrianca} accessibilityRole="button" accessibilityLabel="Acrescentar criança"
              style={{ width: 48, minHeight: 48, borderRadius: R.row, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
                alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '500', color: '#FFFFFF' }}>Outros adultos</Text>
          <Rotulo>Entram pela Google com o e-mail que escrever aqui.</Rotulo>
          {adultos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {adultos.map((a) => (
                <Etiqueta key={a.email} texto={`${a.nome} · ${a.email}`} rotulo={`Tirar ${a.nome}`}
                  onRemover={() => setAdultos(adultos.filter((x) => x.email !== a.email))} />
              ))}
            </View>
          ) : null}
          <TextInput value={novoAdulto.nome} onChangeText={(v) => setNovoAdulto({ ...novoAdulto, nome: v })} maxLength={MAX_NOME}
            accessibilityLabel="Nome do adulto" placeholder="Nome do adulto" placeholderTextColor="#6A7282" style={campo} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={novoAdulto.email} onChangeText={(v) => setNovoAdulto({ ...novoAdulto, email: v })}
              accessibilityLabel="E-mail do adulto" placeholder="e-mail@exemplo.pt" placeholderTextColor="#6A7282"
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
              returnKeyType="done" onSubmitEditing={juntarAdulto} style={{ ...campo, minHeight: 48, flex: 1 }} />
            <Pressable onPress={juntarAdulto} accessibilityRole="button" accessibilityLabel="Acrescentar adulto"
              style={{ width: 48, minHeight: 48, borderRadius: R.row, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
                alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {passo === 3 ? (
        <View style={{ gap: S.md }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: R.row, padding: 14, gap: 6 }}>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, color: '#FFFFFF' }}>Casa: Família {nomeCasa.trim()}</Text>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, color: '#FFFFFF' }}>Administrador(a): {nome.trim()}</Text>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, color: '#FFFFFF' }}>
              Crianças: {criancas.length ? criancas.join(', ') : 'nenhuma por agora'}
            </Text>
            <Text style={{ fontFamily: FONT.body, fontSize: 15, color: '#FFFFFF' }}>
              Outros adultos: {adultos.length ? adultos.map((a) => a.nome).join(', ') : 'nenhum por agora'}
            </Text>
          </View>
          <Rotulo>
            Vai à Google confirmar quem é. A casa só é criada quando voltar: se desistir na Google, não fica nada criado.
          </Rotulo>
        </View>
      ) : null}

      {/* Um aviso que não é um erro: o e-mail entrou bem pela Google, só não está
          em nenhuma casa — e é este o ecrã onde se começa uma. */}
      {avisoDeFora && !aviso && !erro ? (
        <Text accessibilityRole="alert" style={{ fontFamily: FONT.body, fontSize: 14, lineHeight: 21, color: '#FFFFFF' }}>{avisoDeFora}</Text>
      ) : null}
      {aviso || erro ? (
        <Text accessibilityRole="alert" style={{ fontFamily: FONT.ui, fontSize: 13, lineHeight: 19, color: '#FFB4A8' }}>{aviso || erro}</Text>
      ) : null}

      {passo < 3 ? (
        <Botao rotulo={passo === 2 && !criancas.length && !adultos.length && !novaCrianca.trim() && !novoAdulto.nome.trim() && !novoAdulto.email.trim() ? 'Saltar' : 'Seguinte'}
          onPress={seguinte} primario />
      ) : (
        <Botao rotulo={ocupado ? 'A abrir a Google…' : 'Criar com a Google'} onPress={criar} primario desativado={ocupado}
          icone={<G />} />
      )}
      <Botao rotulo="Voltar" onPress={anterior} />
    </View>
  );
}
