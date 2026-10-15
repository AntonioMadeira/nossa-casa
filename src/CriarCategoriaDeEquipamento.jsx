import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { useStore } from './store';
import { S, R, FONT } from './theme';
import { Primary } from './ui';

// A saída do campo «Categoria» quando a casa não tem nenhuma (o «Começar de
// Zero» deixa a lista vazia). Um campo sem opções e sem saída era uma promessa
// que não se cumpre: sem categoria não se regista um equipamento.
//
// Só quem administra cria — é a regra do servidor (`categorias_equip`) e a do
// `addEquipCat`. Aos outros diz-se a quem pedir, em vez de um campo que falha.
// Criada, a categoria fica JÁ escolhida no rascunho de quem a veio criar.
export default function CriarCategoriaDeEquipamento({ t, user = null, aoCriar }) {
  const { s, addEquipCat } = useStore();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState(null);

  if (s.roles && s.roles[user] !== 'admin') {
    return (
      <Text style={{ fontFamily: FONT.ui, fontSize: 12, lineHeight: 18, color: t.text3 }}>
        Peça a um administrador da casa que crie a primeira categoria.
      </Text>
    );
  }

  const criar = () => {
    const n = nome.trim();
    if (!n) return;
    const e = addEquipCat(n, user);
    if (e) return setErro(e);
    setNome('');
    setErro(null);
    if (aoCriar) aoCriar(n);
  };

  return (
    <View style={{ gap: S.sm }}>
      <TextInput value={nome} onChangeText={(v) => { setNome(v); setErro(null); }}
        placeholder="Nome da categoria" placeholderTextColor={t.text3}
        accessibilityLabel="Nome da nova categoria" maxLength={40}
        onSubmitEditing={criar} returnKeyType="done"
        style={{ minHeight: 44, paddingHorizontal: S.md, fontFamily: FONT.body,
          fontSize: 15, color: t.text2, borderRadius: R.row, borderWidth: 1,
          borderColor: t.border, backgroundColor: t.card }} />
      {erro ? (
        <Text accessibilityRole="alert"
          style={{ fontFamily: FONT.ui, fontSize: 12, color: t.errTexto }}>{erro}</Text>
      ) : null}
      <Primary t={t} comum icon="plus" label="Criar categoria"
        onPress={criar} disabled={!nome.trim()} />
    </View>
  );
}
