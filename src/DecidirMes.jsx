import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { S, R, FONT, elev, LARGURA_APP } from './theme';
import Icon from './Icon';

// Diálogo de TRÊS saídas para um mês do orçamento anual que mudou de valor:
// tirar/dar aos outros meses, mudar o total do ano, ou desistir. O `Confirm` só
// tem duas, e uma delas é «Cancelar» — aqui as duas primeiras são respostas
// iguais em peso, e desistir é a saída discreta por baixo.
//
// `aoAjustar` pode vir `null`: um mês acima do total do ano não tem de onde
// tirar, e a única resposta que faz sentido é mudar o total.
export default function DecidirMes({ t, title, message, rotuloAjustar, rotuloTotal, aoAjustar, aoMudarTotal, aoCancelar }) {
  const Opcao = ({ rotulo, onPress }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={rotulo}
      style={({ pressed }) => ({
        minHeight: 44, borderRadius: R.row, borderWidth: 1, borderColor: t.actBrd,
        backgroundColor: pressed ? t.actBg : t.surface, paddingHorizontal: S.md,
        alignItems: 'center', justifyContent: 'center' })}>
      <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '700', color: t.actFg, textAlign: 'center' }}>
        {rotulo}
      </Text>
    </Pressable>
  );
  return (
    <Modal transparent animationType="fade" onRequestClose={aoCancelar} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        width: '100%', maxWidth: LARGURA_APP, marginHorizontal: 'auto', alignItems: 'center', justifyContent: 'center', padding: S.xl }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: t.surface,
          borderRadius: R.card, padding: S.xl, gap: S.lg, ...elev(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="calendar" size={24} color={t.accent} />
            <Text style={{ flex: 1, fontFamily: FONT.display, fontSize: 18, fontWeight: '500', color: t.text1 }}>{title}</Text>
          </View>
          <Text style={{ fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: t.text2 }}>{message}</Text>
          <View style={{ gap: S.md }}>
            {aoAjustar ? <Opcao rotulo={rotuloAjustar} onPress={aoAjustar} /> : null}
            <Opcao rotulo={rotuloTotal} onPress={aoMudarTotal} />
            <Pressable onPress={aoCancelar} accessibilityRole="button" accessibilityLabel="Cancelar"
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: '500', color: t.text2 }}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
