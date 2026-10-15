import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import CampoData from '../CampoData';
import { useStore } from '../store';
import { S, R, FONT } from '../theme';
import { TODAY, pad2, plural, warrantyDaysLeft, daysUntil, EUR, chaveDeDMY, dmyDeChave, TODAY_KEY } from '../format';
import { Card, SectionTitle, Linha, Empty, AddButton, Label, Primary, Pill, NumField } from '../ui';
import Icon from '../Icon';
import Sheet from '../Sheet';
import FichaEquipamento from '../sheets/FichaEquipamento';
import FichaContrato from '../sheets/FichaContrato';
import NovoContrato from '../sheets/NovoContrato';
import { estadoDoContrato, linhaDoContrato } from '../contratos';
import { CATEGORIAS_DE_EQUIPAMENTO, categoriasDaCasa } from '../categorias-de-equipamento';
import CampoDeEscolha from '../CampoDeEscolha';
import CriarCategoriaDeEquipamento from '../CriarCategoriaDeEquipamento';

// dd/mm/aaaa → milissegundos UTC. É o formato em que as datas são guardadas.
const parseDMY = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || ''));
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
};
const fmtDMY = (ms) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

// As categorias vivem num módulo próprio desde 15/09/2026: a ficha também as
// lê, para se poder mudar a categoria depois de registar.
// ⚠ A semente, para o estado inicial do formulário antes de a loja estar à
// mão. A lista que os campos mostram é a da CASA — ver `categorias` lá dentro.
const CATS = CATEGORIAS_DE_EQUIPAMENTO;

// Um número negativo de «dias de garantia» não se lê. Diga-se o que aconteceu.
const warrantyLabel = (days) => {
  if (days <= 0) return `Garantia terminou há ${plural(Math.abs(days), 'dia', 'dias')}`;
  return `Faltam ${plural(days, 'dia', 'dias')} de garantia`;
};

// `abrir` é o id de um equipamento cuja ficha deve estar aberta à chegada. É o
// que faz «Garantia a expirar · Frigorífico» levar ao frigorífico, e não a uma
// lista onde é preciso voltar a procurá-lo.
// E `contrato:<id>` abre a ficha de um contrato — é o que o aviso «Seguro do
// carro · renova em 23 dias» do Início faz.
export default function Equipamentos({ t, user = null, abrir }) {
  const { s, allEquip, criarEquipamento, contratosDaCasa } = useStore();
  // ⚠ A lista da CASA (26/09/2026). Os dois ecrãs que escolhem categoria liam a
  // constante de quatro, e o `equipCats` — que o servidor enche e o `puxarCasa`
  // desce — não era lido por ecrã nenhum. Uma categoria escrita no servidor
  // nunca aparecia. Ver `categoriasDaCasa`.
  const categorias = categoriasDaCasa(s.equipCats, s.equipCatsProprias);
  const [sheet, setSheet] = useState(null);
  const abreContrato = typeof abrir === 'string' && abrir.startsWith('contrato:');
  const [ficha, setFicha] = useState(abrir && !abreContrato ? abrir : null);   // equipamento cuja ficha está aberta
  const [fichaContrato, setFichaContrato] = useState(abreContrato ? abrir.slice('contrato:'.length) : null);
  const [form, setForm] = useState({ name: '', bought: '', warranty: 365, cat: CATS[0] });

  const eq = allEquip();
  // Os contratos: com data de renovação primeiro, do mais próximo para o mais
  // longe. A pastilha do estado leva os tons dos três papéis de cada estado.
  const contratos = contratosDaCasa();
  const aRenovar = contratos.filter(c => c.dias !== null && c.dias <= 30).length;
  const pastilhaDoContrato = (c) => {
    const e = estadoDoContrato(c);
    if (!e) return null;
    const cores = e.tom === 'err'
      ? { fg: t.state.errTexto, bg: t.state.errBg, border: t.state.err }
      : { fg: t.state.warnDeep, bg: t.state.warnBg, border: t.state.warn };
    return <Pill label={e.texto} {...cores} />;
  };

  const byWarranty = warrantyDaysLeft;

  const inWarranty = eq.filter(e => byWarranty(e) > 90);
  const expiring = eq.filter(e => {
    const d = byWarranty(e);
    return d > 0 && d <= 90;
  });
  const expired = eq.filter(e => byWarranty(e) <= 0);

  // Gravar na mesma forma das sementes (cat/bought/warrantyEnd). Guardar uma
  // forma diferente era o que fazia a lista mostrar «undefined».
  const handleSave = () => {
    if (!form.name.trim()) return;
    const boughtMs = parseDMY(form.bought) ?? Date.UTC(TODAY.y, TODAY.m, TODAY.d);
    // ⚠ Pelo `criarEquipamento` da loja, que também o manda para o servidor.
    // A coleção `equipamentos` existia desde o início e ninguém escrevia nela:
    // a garantia da máquina de lavar era conhecida de um telefone só.
    criarEquipamento({
      name: form.name.trim(),
      cat: form.cat,
      bought: fmtDMY(boughtMs),
      warrantyEnd: fmtDMY(boughtMs + (form.warranty || 365) * 86400000),
    });
    setSheet(null);
    setForm({ name: '', bought: '', warranty: 365, cat: CATS[0] });
  };

  // Uma lista só, «Registados», como na referência 11 — não três secções por
  // estado de garantia. O estado vai na pastilha à direita e na borda, que é
  // onde se lê sem ter de perceber em que secção se está.
  const estadoDe = (e) => {
    const d = byWarranty(e);
    if (d < 0) return { label: 'Fora de Garantia', cor: t.state.err, fundo: t.state.errBg, texto: t.state.errTexto };
    if (d <= 90) return { label: 'Garantia a Expirar', cor: t.state.warn, fundo: t.state.warnBg, texto: t.state.warnDeep };
    return { label: 'Em Garantia', cor: t.state.ok, fundo: t.state.okBg, texto: t.state.okTexto };
  };

  const valor = eq.reduce((a, e) => a + (e.price || 0), 0);
  const aExpirar = eq.filter(e => { const d = byWarranty(e); return d >= 0 && d <= 90; }).length;
  const expiradas = eq.filter(e => byWarranty(e) < 0).length;
  // A manutenção mais próxima que ainda não passou.
  const proxima = eq.map(e => e.maintDate).filter(Boolean)
    .map(v => ({ v, dias: daysUntil(v) }))
    .filter(x => x.dias !== null && x.dias >= 0)
    .sort((a, b) => a.dias - b.dias)[0];

  return (
    <>
      {/* O resumo que a referência tem no topo e faltava por inteiro. */}
      <Card t={t} style={{ gap: S.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: S.lg }}>
          {[['Equipamentos', String(eq.length), t.text2],
            ['Valor registado', EUR(valor), t.text2],
            ['Garantias a expirar', String(aExpirar), aExpirar ? t.state.warnTexto : t.text2],
            ['Garantias expiradas', String(expiradas), expiradas ? t.state.errTexto : t.text2],
            // Os contratos que renovam dentro de trinta dias, ou cuja data já passou.
            ['Contratos a renovar', String(aRenovar), aRenovar ? t.state.warnTexto : t.text2]].map(([rot, val, cor]) => (
            <View key={rot} style={{ width: '50%', gap: 2 }}>
              <Label t={t}>{rot}</Label>
              <Text style={{ fontFamily: FONT.display, fontSize: 20, color: cor }}>{val}</Text>
            </View>
          ))}
        </View>
        {proxima ? (
          <View style={{ gap: 2 }}>
            <Label t={t}>Próxima manutenção</Label>
            <Text style={{ fontFamily: FONT.display, fontSize: 20, color: t.text2 }}>{proxima.v}</Text>
          </View>
        ) : null}
      </Card>

      {/* ⚠ A MESMA FORMA DOS CONTRATOS, vinte linhas abaixo (16/09/2026).
          Aqui o título da secção só aparecia quando havia equipamentos, e
          lá dentro havia um `<Empty>` num ramo `eq.length === 0` que NUNCA
          corria — estava dentro do `eq.length ? …`. Quatro linhas de código
          morto, e uma casa sem equipamentos ficava com um aviso sem título de
          secção por cima, ao lado dos Contratos que têm os dois. */}
      <View>
        <SectionTitle t={t}>Registados</SectionTitle>
        {eq.length === 0 ? (
          <Empty t={t} icon="houseGear" title="Sem equipamentos registados."
            hint="Comece a registar os aparelhos da casa: a app avisa antes de a garantia acabar." />
        ) : (
          <View>
            {/* Linhas planas (desenho C, 09/09/2026): o estado da garantia,
                que era a borda do cartão, passa a faixa da linha. */}
            {eq.map((e, k) => {
              const est = estadoDe(e);
              return (
                <Linha key={e.id} t={t} faixa={est.cor} last={k === eq.length - 1}>
                  <Pressable onPress={() => setFicha(e.id)} accessibilityRole="button"
                    accessibilityLabel={e.name}
                    style={{ gap: S.md, minHeight: 52, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: '600', color: t.text2 }}>
                          {e.name}
                        </Text>
                        <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
                          {[e.bought && `Comprado a ${e.bought}`, e.price && EUR(e.price)]
                            .filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Pill label={est.label} fg={est.texto} bg={est.fundo} border={est.cor} />
                    </View>
                    {/* A manutenção seguinte, com relógio, como na referência.
                        Estava nos dados desde sempre e não aparecia. */}
                    {e.maint ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md,
                        borderTopWidth: 1, borderTopColor: t.divider, paddingTop: S.md }}>
                        <Icon name="clock" size={16} color={t.text3} />
                        <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
                          {e.maint}{e.maintDate ? ` · ${e.maintDate}` : ''}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                </Linha>
              );
            })}
          </View>
        )}
      </View>

      <AddButton t={t} label="registar equipamento" onPress={() => setSheet('novo')} />

      {/* ── Os contratos e as renovações ─────────────────────────────────────
          O seguro do carro, a internet, a inspeção (12/09/2026, a quinta das
          dez funcionalidades). A mesma linha plana dos equipamentos: nome e
          fornecedor, por baixo quando renova, a fidelização e quem trata, e a
          pastilha do estado à direita — «renova em 23 dias», «passou há 4
          dias». A linha toda abre a ficha; um alvo por linha. */}
      <View>
        <SectionTitle t={t}>Contratos</SectionTitle>
        {contratos.length === 0 ? (
          <Empty t={t} icon="fileText" title="Sem contratos registados."
            hint="O seguro, a internet, a inspeção: registe a data em que renovam e a app avisa 30 dias antes." />
        ) : (
          <View>
            {contratos.map((c, k) => {
              const e = estadoDoContrato(c);
              return (
                <Linha key={c.id} t={t} last={k === contratos.length - 1}
                  faixa={e ? (e.tom === 'err' ? t.state.err : t.state.warn) : undefined}>
                  <Pressable onPress={() => setFichaContrato(c.id)} accessibilityRole="button"
                    accessibilityLabel={`${c.nome}${c.fornecedor ? ` · ${c.fornecedor}` : ''}`}
                    accessibilityHint="Abrir a ficha do contrato"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: S.md,
                      minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
                    <View style={{ flex: 1, gap: 3 }}>
                      {/* ⚠ O nome e o FORNECEDOR deixaram de ser colados numa
                          linha só (25/09/2026). Estavam unidos por « · » e a
                          seguir cortados a ~28 caracteres — e o corte caía
                          sempre no fornecedor, que é justamente o que distingue
                          dois contratos com o mesmo nome: «Internet e televisão
                          · MEO Fibra» e «Internet e televisão · MEO Satélite»
                          ficavam os dois «Internet e televisão · MEO…».

                          O fornecedor passou para o SUBTÍTULO, que já existia e
                          estava a mostrar só as datas. Assim o nome tem a linha
                          inteira (e quebra, como a `Row` do `ui.jsx`), e o
                          fornecedor é a primeira coisa do subtítulo em vez de
                          ser a primeira a desaparecer. */}
                      <Text style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: '600', color: t.text2 }}>
                        {c.nome}
                      </Text>
                      {/* ⚠ E sem `numberOfLines` (26/09/2026). Fui eu que ontem
                          pus aqui o fornecedor — que é escrito pela família — e
                          deixei-lhe o corte de uma linha por cima. Medido: o
                          bloco tem 297 px na web e 227 num telefone de 375, e
                          «MEO Satélite · fidelização até 03/2027 · Tomás» mede
                          270. Tinha tirado o fornecedor da frente do corte e
                          metido-o dentro de outro. */}
                      <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: t.text3 }}>
                        {[c.fornecedor, linhaDoContrato(c) || 'Sem datas'].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {pastilhaDoContrato(c)}
                    <Icon name="caretRight" size={16} color={t.text3} />
                  </Pressable>
                </Linha>
              );
            })}
          </View>
        )}
        <View style={{ marginTop: S.md }}>
          <AddButton t={t} label="acrescentar contrato" onPress={() => setSheet('novoContrato')} />
        </View>
      </View>

      {sheet === 'novoContrato' ? (
        <Sheet t={t} title="Novo Contrato" sub="O que renova ou acaba num dia certo"
          onClose={() => setSheet(null)}>
          <NovoContrato t={t} onClose={() => setSheet(null)} />
        </Sheet>
      ) : null}

      {fichaContrato && contratos.some(c => c.id === fichaContrato) ? (
        <FichaContrato t={t} contrato={contratos.find(c => c.id === fichaContrato)}
          onClose={() => setFichaContrato(null)} />
      ) : null}

      {sheet === 'novo' ? (
        <Sheet t={t} title="Novo Equipamento" sub="Registar com data e garantia"
          onClose={() => setSheet(null)}
          action={
            // O botão principal no rodapé fixo — regra 9 do
            // `a-coerencia-do-desenho` (15/09/2026): estava no fim do corpo.
            <Primary t={t} comum label="Guardar" onPress={handleSave} disabled={!form.name.trim()} />
          }>
          <View style={{ gap: S.lg }}>
            <View style={{ gap: S.sm }}>
              <Label t={t}>Nome</Label>
              <TextInput accessibilityLabel="Nome do equipamento"
                value={form.name}
                onChangeText={(v) => setForm(f => ({ ...f, name: v }))}
                placeholder="Ex: Frigorífico LG"
                placeholderTextColor={t.text3}
                style={{
                  minHeight: 44, paddingHorizontal: S.md, fontFamily: FONT.body,
                  fontSize: 15, color: t.text2, borderRadius: R.row, borderWidth: 1,
                  borderColor: t.border, backgroundColor: t.card,
                }}
              />
            </View>

            {/* ⚠ Um CAMPO, e não uma fila de pastilhas (26/09/2026). A partir
                do momento em que lê a lista da CASA, esta escolha CRESCE com a
                casa — e o guarda `uma-escolha-que-cresce-nao-e-uma-fila` tinha-a
                no inventário como «fixo para sempre», com um aviso a dizer
                exactamente que no dia em que a interface fosse ligada ao
                `equipCats` isto passava a ser a classe do corredor. Foi hoje. */}
            <CampoDeEscolha t={t} rotulo="Categoria" titulo="Categoria"
              sub="Para agrupar os equipamentos da casa"
              iconeDoCampo="houseGear"
              valor={form.cat}
              opcoes={categorias.map(c => ({ valor: c, titulo: c }))}
              aoEscolher={(c) => setForm(f => ({ ...f, cat: c }))}
              vazio="Esta casa ainda não tem categorias."
              acaoVazia={<CriarCategoriaDeEquipamento t={t} user={user}
                aoCriar={(c) => setForm(f => ({ ...f, cat: c }))} />} />

            <View style={{ gap: S.sm }}>
              <Label t={t}>Data de compra</Label>
              {/* Uma compra não é no futuro. O limite poupa a correção. */}
              <CampoData t={t} valor={chaveDeDMY(form.bought)} maximo={TODAY_KEY}
                onChange={(k) => setForm(f => ({ ...f, bought: dmyDeChave(k) }))} />
            </View>

            <View style={{ gap: S.sm }}>
              <Label t={t}>Garantia (dias)</Label>
              {/* O campo de número da app (14/09/2026): «−» e «+» de 30 dias. */}
              <NumField t={t} value={form.warranty} onChange={(v) => setForm(f => ({ ...f, warranty: v }))}
                step={30} min={0} max={3650} suffix={false} rotulo="Garantia em dias" />
            </View>

          </View>
        </Sheet>
      ) : null}

      {ficha ? (
        <FichaEquipamento t={t} equip={eq.find(x => x.id === ficha)} user={user} onClose={() => setFicha(null)} />
      ) : null}
    </>
  );
}
