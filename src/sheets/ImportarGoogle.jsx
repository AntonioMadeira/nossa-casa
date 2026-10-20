import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useStore, VISIBILIDADES } from '../store';
import { S, R, FONT } from '../theme';
import { Label, Primary, Pill, Opcao, Tile, Empty } from '../ui';
import Icon from '../Icon';
import { dayLabel } from '../format';
import * as servidor from '../pocketbase';
import { semOsQueJaEstaoNaCasa } from '../agenda-duplicados';

// Trazer da agenda da Google para a Nossa Casa.
//
// ── O que esta folha era ────────────────────────────────────────────────────
//
// Uma imitação. Tinha três eventos escritos no código — «Reunião com professor
// Léo», «Dentista Mia», «Reunião de trabalho» — e nunca chamou a Google. Quem
// carregasse em «importar do Google» via três eventos que não existiam na
// agenda dele, e ao importar gravava `day: '2026-08-28'` em vez de
// `day: 'd2026-08-28'`: a app lê chaves com o prefixo, e portanto os eventos
// entravam na loja e não apareciam em ecrã nenhum.
//
// ── O que faz agora ─────────────────────────────────────────────────────────
//
// Lê os próximos trinta dias da agenda de quem entrou, esconde o que já foi
// importado ou dispensado, e entrega ao `importGoogleEvents` — que é o único
// sítio que sabe escrever a chave do dia e a visibilidade.
//
// Sem autorização da agenda não mostra uma lista vazia a fingir que procurou:
// diz que falta autorizar e como se autoriza.
export default function ImportarGoogle({ t, user, onClose }) {
  const { set, s, importGoogleEvents, idsGoogleDaCasa, allEvents } = useStore();
  const [eventos, setEventos] = useState([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState(null);
  const [semAutorizacao, setSemAutorizacao] = useState(false);
  const [visibilidade, setVisibilidade] = useState('familia');
  const [escolhidos, setEscolhidos] = useState({});
  const [aLigar, setALigar] = useState(false);

  // Ligar e, se correr bem, ler logo a agenda — quem carregou aqui veio para
  // importar, não para ver um ecrã a dizer que agora já pode tentar.
  const ligarAgenda = async () => {
    setALigar(true);
    setErro(null);
    try {
      if (await servidor.google.ligar()) {
        setSemAutorizacao(false);
        setACarregar(true);
        const vindos = await servidor.google.eventos({ dias: 30, max: 50 });
        const jaVistos = s.googleCalendarImported || {};
        const nossos = idsGoogleDaCasa();
        // E o que a casa já tem, venha de onde vier: ver `agenda-duplicados.js`.
        const novos = semOsQueJaEstaoNaCasa(vindos.filter(e => !jaVistos[e.id] && !nossos.has(e.id)), allEvents());
        setEventos(novos);
        setEscolhidos(Object.fromEntries(novos.map(e => [e.id, !e.recorrente])));
        setACarregar(false);
      } else {
        setErro('A ligação à agenda não ficou concluída.');
      }
    } catch (e) {
      setErro(e.message);
      setACarregar(false);
    }
    setALigar(false);
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!servidor.google.disponivel()) {
        if (vivo) { setSemAutorizacao(true); setACarregar(false); }
        return;
      }
      try {
        const vindos = await servidor.google.eventos({ dias: 30, max: 50 });
        if (!vivo) return;
        // O que já passou por aqui não volta a aparecer — importado ou
        // dispensado, a resposta já foi dada. E o que a app pôs LÁ também não:
        // senão o evento agendado aqui voltava como novidade e ficava a dobrar.
        const jaVistos = s.googleCalendarImported || {};
        const nossos = idsGoogleDaCasa();
        // E o que a casa já tem, venha de onde vier: um telemóvel novo não sabe o
        // que o outro importou, e sem isto oferecia-o outra vez (e ficava a dobrar).
        const novos = semOsQueJaEstaoNaCasa(vindos.filter(e => !jaVistos[e.id] && !nossos.has(e.id)), allEvents());
        setEventos(novos);
        // As séries vêm desligadas: importar uma reunião semanal como trinta
        // eventos soltos enche a agenda da casa e não se desfaz com um toque.
        setEscolhidos(Object.fromEntries(novos.map(e => [e.id, !e.recorrente])));
      } catch (e) {
        if (vivo) setErro(e.message);
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => { vivo = false; };
  }, [user]);

  const quantos = Object.values(escolhidos).filter(Boolean).length;

  const importar = () => {
    const aTrazer = eventos.filter(e => escolhidos[e.id]);
    // A forma que o `importGoogleEvents` espera. `date` sem prefixo é o certo
    // aqui: é ele que põe o `d`, e é ele o único sítio que o sabe fazer.
    importGoogleEvents(aTrazer.map(e => ({
      id: e.id,
      title: e.titulo,
      date: e.dia,
      time: e.hora || '',
      isRecurring: e.recorrente,
    })), user, visibilidade);

    // Os que ficaram de fora também levam marca: senão a folha volta a
    // oferecê-los a cada abertura, para sempre.
    const dispensados = eventos.filter(e => !escolhidos[e.id]);
    if (dispensados.length) {
      set(x => ({
        googleCalendarImported: {
          ...x.googleCalendarImported,
          ...Object.fromEntries(dispensados.map(e => [e.id, true])),
        },
      }));
    }
    onClose();
  };

  if (aCarregar) {
    return (
      <View style={{ gap: S.md, paddingVertical: 20, alignItems: 'center' }}>
        <Icon name="refresh" size={26} color={t.text3} />
        <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>
          A ler a agenda da Google…
        </Text>
      </View>
    );
  }

  if (semAutorizacao) {
    return (
      <View style={{ gap: S.lg }}>
        <Tile t={t} kind="warn" icon="warning">
          A agenda da Google ainda não está ligada nesta conta.
        </Tile>
        <Text style={{ fontFamily: FONT.ui, fontSize: 12.5, lineHeight: 19, color: t.text3 }}>
          Liga-se uma vez. O consentimento pede apenas os eventos da agenda —
          não o correio, não os contactos — e a autorização fica no servidor da
          casa, nunca neste aparelho.
        </Text>
        {erro ? <Tile t={t} kind="err" icon="warning">{erro}</Tile> : null}
        <Primary t={t} comum label={aLigar ? 'A ligar…' : 'Ligar a agenda da Google'}
          icon="calendar" disabled={aLigar} onPress={ligarAgenda} />
        <Primary t={t} comum label="Fechar" onPress={onClose} />
      </View>
    );
  }

  if (erro) {
    return (
      <View style={{ gap: S.lg }}>
        <Tile t={t} kind="err" icon="warning">{erro}</Tile>
        <Primary t={t} comum label="Fechar" onPress={onClose} />
      </View>
    );
  }

  if (eventos.length === 0) {
    return (
      <View style={{ gap: S.lg }}>
        <Empty t={t} icon="calendar" title="Sem eventos novos."
          hint="Os próximos trinta dias da sua agenda já estão todos nesta casa, ou foram dispensados." />
        <Primary t={t} comum label="Fechar" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={{ gap: S.lg }}>
      <Text style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>
        {eventos.length === 1 ? 'Um evento novo na sua agenda.'
          : `${eventos.length} eventos novos na sua agenda.`}
      </Text>

      <ScrollView style={{ maxHeight: 300 }}>
        <View style={{ gap: S.md }}>
          {eventos.map(e => {
            const on = !!escolhidos[e.id];
            return (
              <Pressable key={e.id}
                onPress={() => setEscolhidos(p => ({ ...p, [e.id]: !p[e.id] }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }} aria-checked={on}
                accessibilityLabel={`Trazer ${e.titulo}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: S.md,
                  minHeight: 44, padding: 14, borderRadius: R.row,
                  borderWidth: 1, borderColor: on ? t.accent : t.border,
                  backgroundColor: on ? t.subtle : 'transparent' }}>
                {/* `R.sm`, e não um 4 escrito à mão: é o mesmo número, e um
                    número solto é o primeiro passo para haver cinco cantos. */}
                <View style={{ width: 20, height: 20, borderRadius: R.sm, borderWidth: 2,
                  borderColor: on ? t.accent : t.border,
                  backgroundColor: on ? t.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text numberOfLines={2} style={{ fontFamily: FONT.body, fontSize: 15, color: t.text2 }}>
                    {e.titulo}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
                    <Text style={{ fontFamily: FONT.ui, fontSize: 11.5, color: t.text3 }}>
                      {dayLabel(`d${e.dia}`)}{e.hora ? ` · ${e.hora}` : ' · todo o dia'}
                    </Text>
                    {e.recorrente ? (
                      <Pill label="Repete-se" fg={t.state.infoDeep} bg={t.state.infoBg} border={t.state.info} />
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Quem vê — os mesmos três níveis do Novo Evento. Era um interruptor de
          «partilhar todos», e por isso a importação era o único sítio da app
          onde não se podia dizer «só os adultos». */}
      <View style={{ gap: S.md }}>
        <Label t={t}>Quem vê estes eventos</Label>
        {VISIBILIDADES.map(v => (
          <Opcao key={v.chave} t={t} titulo={v.rotulo} detalhe={v.detalhe}
            selected={visibilidade === v.chave}
            onPress={() => setVisibilidade(v.chave)} />
        ))}
      </View>

      <Primary t={t} comum label={quantos === 1 ? 'Trazer 1 evento' : `Trazer ${quantos} eventos`}
        disabled={quantos === 0} onPress={importar} />
    </View>
  );
}
