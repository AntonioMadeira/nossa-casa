import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TASKS, ITEMS, EVENTS, EQUIP, ENV_BASE, SECTIONS, MEMBERS, ROLES, HEALTH, HEALTH_DOCS,
  VAULT, GOALS, META_MOVS, DE } from './data';
import { TODAY_KEY, TODAY, MONTHS, dueInfo, daysUntil, warrantyDaysLeft, chaveDeDMY,
         chaveRelativa, plural, EUR, parseKey, dkey, pad2, agoraNaApp } from './format';
import { chaveDaReceita, planoDaReceita } from './medicacao';
import { ORCAMENTO_BASE, rendimentoDoMes as rendimentoDoMesDe, fatorDoMes,
         doMensalParaAnual, doAnualParaMensal, normalizarOrcamento } from './orcamento';
import { iconesDosCorredores, donoDeCadaIcone, corredoresPorEscolher,
         ICONE_POR_ESCOLHER } from './icone-do-corredor';
import { observacao, precosDe, estimativaDe, compararLojas } from './precos';
// As decisões sobre o que vai para a agenda da Google — puras, e num ficheiro
// à parte porque o `pocketbase.js` traz um SDK que o Jest não importa.
import { paraGoogle, enfileirar, naoVaiPassar } from './agenda-google';
// A camada do servidor entra por importação dinâmica, não estática. Duas
// razões: o SDK do PocketBase é ESM e uma importação estática arrastava-o
// para dentro dos testes — a suite de regressões deixou de carregar inteira,
// de 119 testes para 18, assim que a loja passou a falar com o servidor. E
// numa app que corre local, carregar um cliente de rede que nunca é usado é
// peso a mais no arranque.
let sync = null;
const carregarSync = async () => {
  if (sync) return sync;
  try { sync = await import('./sync'); } catch (e) {
    // ⚠ O mesmo silêncio do `catch` do `lerDoServidor` (classe 39): um `sync`
    // que não carrega faz a app correr local como se não houvesse servidor, e
    // sem uma linha na consola é indistinguível de não haver. Diz-se.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[carregarSync] o módulo de sincronização não carregou:', e && e.message ? e.message : e);
    }
    sync = null;
  }
  return sync;
};

// ── Visibilidade da saúde (INVARIANTE #3) ───────────────────────────────────
// Puras e exportadas de propósito: uma regra de visibilidade que só se
// verifica a olho, no ecrã, não é uma regra — é uma esperança. Assim há uma
// prova em __tests__ que corre sem React e sem interface, e que falha se
// alguém alargar o filtro sem dar por isso.
//
// A ficha de um adulto é só dele; as das crianças são visíveis aos adultos e
// invisíveis às próprias. Esta é a regra do cliente — a do servidor está em
// docs/seguranca.html, tem 15 provas, e é a que conta.
// ⚠ O `quadro` é o dos MEMBROS DESTA CASA, e tem de ser passado.
//
// Isto lia o `MEMBERS` do `data.js` — a família de demonstração — e mais nada.
// Numa casa a sério com outras pessoas, a resposta vinha de uma família
// inventada: o António existe nesta casa e não no `data.js`, portanto
// `MEMBERS['António']` é `undefined`, e a regra concluía que ele não é um
// adulto conhecido. A app escondia-lhe as fichas das crianças que o SERVIDOR
// lhe devolvia — três consultas descarregadas e zero no ecrã.
//
// Não é uma fuga: o servidor manda, e manda bem. É o contrário — a app a
// esconder o que a pessoa tem direito a ver, sem dizer porquê.
//
// O `podeVerEvento` já levava o quadro desde sempre; este ficou para trás, e a
// demonstração tapou-o porque lá os nomes coincidem.
export const podeVerSaude = (member, viewer, quadro = MEMBERS) =>
  quadro[member] && quadro[member].kid
    ? !!(quadro[viewer] && !quadro[viewer].kid)
    : member === viewer;

// As receitas com prazo a acabar que este membro pode ver.
export const receitasAExpirarDe = (docs, viewer, limite = 30, quadro = MEMBERS) => (docs || [])
  .filter(d => d.kind === 'Receita' && d.expires && podeVerSaude(d.member, viewer, quadro))
  .map(d => ({ ...d, dias: daysUntil(d.expires) }))
  .filter(d => d.dias !== null && d.dias <= limite)
  .sort((a, b) => a.dias - b.dias);

// As consultas já marcadas para os próximos dias que este membro pode ver.
export const consultasProximasDe = (consultas, viewer, limite = 7) => (consultas || [])
  .filter(h => podeVerSaude(h.member, viewer))
  .map(h => ({ ...h, dias: daysUntil(h.day) }))
  .filter(h => h.dias !== null && h.dias >= 0 && h.dias <= limite)
  .sort((a, b) => a.dias - b.dias);

// ── Visibilidade de um evento (INVARIANTE #3) ───────────────────────────────
//
// Três níveis, e não dois. Havia `shared: true/false` — ou a casa toda, ou
// mais ninguém — e faltava o do meio, que é o que uma família precisa mais
// vezes: uma consulta, uma reunião na escola, uma conta a pagar. Coisas que os
// dois adultos têm de saber e que não têm de aparecer na agenda de uma criança
// de sete anos.
//
// Puras e exportadas de propósito, como o `podeVerSaude`: uma regra de
// visibilidade que só se verifica a olho, no ecrã, não é uma regra — é uma
// esperança.
//
// ⚠ Esta é a regra do CLIENTE. O INVARIANTE #3 diz que a que conta é a do
// servidor: um evento que este filtro esconde continua a chegar ao
// dispositivo. Quando os eventos passarem para o PocketBase, a coleção
// `eventos` precisa da regra equivalente — está por fazer, e está dito.
export const VISIBILIDADES = [
  { chave: 'familia', rotulo: 'Toda a família',
    detalhe: 'Aparece na agenda de todos, incluindo as crianças.' },
  { chave: 'adultos', rotulo: 'Só os adultos',
    detalhe: 'Os adultos da casa veem; as crianças não.' },
  { chave: 'so-eu', rotulo: 'Só eu',
    detalhe: 'Mais ninguém o vê, nem o outro adulto.' },
];

// A forma antiga era um booleano. Um evento gravado antes disto não tem
// `visibilidade`, e ler `undefined` como «só eu» esconderia metade da agenda
// da casa de um dia para o outro.
export const visibilidadeDe = (evento) => {
  if (!evento) return 'so-eu';
  if (evento.visibilidade) return evento.visibilidade;
  return evento.shared ? 'familia' : 'so-eu';
};

// Quem pode MUDAR um evento, que não é o mesmo que quem o vê.
//
// Um adulto muda o que vê: numa casa de dois, obrigar a Rita a pedir ao Tomás
// para corrigir a hora de uma reunião de pais é atrito sem ganho — os dois já
// veem o evento e os dois vão à reunião.
//
// Uma criança muda só o que é seu. A agenda da casa não é dela para arrumar,
// e é a mesma linha que o resto da app já traça.
export const podeEditarEvento = (evento, viewer, quadro = MEMBERS) => {
  if (!podeVerEvento(evento, viewer, quadro)) return false;
  if (evento.owner === viewer) return true;
  return !!(quadro[viewer] && !quadro[viewer].kid);
};

export const podeVerEvento = (evento, viewer, quadro = MEMBERS) => {
  if (!evento) return false;
  if (evento.owner === viewer) return true;             // o dono vê sempre o seu
  const v = visibilidadeDe(evento);
  if (v === 'familia') return true;
  if (v === 'adultos') return !!(quadro[viewer] && !quadro[viewer].kid);
  return false;
};

// ── PIN ─────────────────────────────────────────────────────────────────────
// O PIN era gravado em claro: o armazenamento local tinha `{"Léo": "2470"}`,
// legível por qualquer coisa com acesso à página. O db/README.md diz «resumo,
// não o valor», e o servidor faz isso; o cliente não fazia.
//
// Isto não é criptografia — é uma app local, e não há segredo a guardar do
// dono do dispositivo. É para o PIN de uma criança não ficar à vista de quem
// abra as ferramentas do navegador. O nome entra no resumo para que o mesmo
// PIN em dois membros dê resumos diferentes.
export const resumoPin = (nome, pin) => {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const texto = `nossa-casa/pin/${nome}/${pin}`;
  for (let i = 0; i < texto.length; i++) {
    h1 = Math.imul(h1 ^ texto.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + texto.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return `h${h1.toString(36)}${h2.toString(36)}`;
};

// ── Renomear um membro ───────────────────────────────────────────────────────
//
// Na loja local o nome NÃO é um rótulo: é a chave que liga tarefas, eventos,
// cofres, fichas de saúde, PIN, papéis e esquemas de cor. Mudá-lo é uma
// migração, e uma migração incompleta perde dados em silêncio — uma tarefa
// atribuída a um nome que já não existe deixa de aparecer no filtro e não dá
// erro nenhum.
//
// Por isso os sítios estão numa tabela, e não espalhados por um punhado de
// `.replace`. As duas listas foram levantadas do estado a sério, com uma
// sonda que anda pelo objeto todo — não de cabeça.
//
// O que NÃO se reescreve, de propósito: o texto que as pessoas escreveram.
// Uma tarefa chamada «Levar o Léo à escola» fica com esse título, e o registo
// da casa continua a dizer o que aconteceu na altura. Reescrever o que alguém
// escreveu é presumir que todos os «Léo» daquele texto são este Léo.

// Mapas cuja CHAVE é o nome do membro.
export const MAPAS_POR_MEMBRO = [
  'membros', 'roles', 'pins', 'paidPts', 'schemeByUser', 'themeByUser',
];

// Campos cujo VALOR é o nome de um membro. `lista` percorre um array, `mapa`
// percorre os valores de um objeto, `mapaDeListas` percorre as listas dentro
// de um objeto.
//
// `listas` é para campos que guardam VÁRIOS nomes — os responsáveis de um
// evento. Sem isto, renomear um membro deixava o nome antigo lá dentro e o
// evento passava a nomear alguém que já não existe. É o mesmo defeito que a
// tabela existe para evitar, uma forma abaixo.
export const CAMPOS_COM_MEMBRO = [
  { chave: 'newTasks', forma: 'lista', campos: ['who'] },
  { chave: 'taskEdits', forma: 'mapa', campos: ['who'] },
  { chave: 'added', forma: 'lista', campos: ['owner'], listas: ['responsaveis'] },
  { chave: 'eventEdits', forma: 'mapa', campos: ['owner'], listas: ['responsaveis'] },
  { chave: 'vaultMoves', forma: 'lista', campos: ['kid'] },
  { chave: 'health', forma: 'lista', campos: ['member'] },
  { chave: 'healthDocs', forma: 'lista', campos: ['member'] },
  { chave: 'healthNotes', forma: 'mapaDeListas', campos: ['author'] },
  { chave: 'shopPlan', forma: 'objeto', campos: ['who'] },
];

// Devolve o estado com o membro renomeado. Pura de propósito: assim prova-se
// sem React, e serve de migração se um dia for preciso.
//
// O PIN sai. O resumo é calculado com o nome lá dentro — é isso que faz o
// mesmo PIN em dois membros dar resumos diferentes — portanto um PIN gravado
// para «Léo» não valida para «Leonardo», e não há forma de o recalcular sem o
// valor em claro, que ninguém tem. Sai, e o ecrã diz que sai.
export const renomearNoEstado = (estado, antigo, novo) => {
  // Sem isto, renomear para o mesmo nome apagava o PIN à mesma: a troca de
  // chave era inofensiva, mas a linha que limpa o PIN não olhava para o nome
  // antigo. A loja nunca chegava aqui — devolve cedo — e a prova chegou.
  if (antigo === novo) return estado;
  const fora = { ...estado };
  const trocaChave = (obj) => {
    if (!obj || typeof obj !== 'object' || !(antigo in obj)) return obj;
    const { [antigo]: valor, ...resto } = obj;
    return { ...resto, [novo]: valor };
  };
  const trocaValor = (registo, campos, listas = []) => {
    if (!registo || typeof registo !== 'object') return registo;
    let mexido = null;
    for (const c of campos || []) {
      if (registo[c] === antigo) (mexido = mexido || { ...registo })[c] = novo;
    }
    for (const c of listas) {
      const xs = registo[c];
      if (Array.isArray(xs) && xs.includes(antigo)) {
        (mexido = mexido || { ...registo })[c] = xs.map(x => (x === antigo ? novo : x));
      }
    }
    return mexido || registo;
  };

  for (const chave of MAPAS_POR_MEMBRO) fora[chave] = trocaChave(fora[chave]);

  // O PIN não sobrevive à mudança de nome, e a inicial acompanha-a.
  if (fora.pins) { const { [novo]: _fora, ...resto } = fora.pins; fora.pins = resto; }
  if (fora.membros && fora.membros[novo]) {
    fora.membros = { ...fora.membros, [novo]: { ...fora.membros[novo],
      initial: String(novo).trim().charAt(0).toUpperCase() } };
  }

  for (const { chave, forma, campos, listas } of CAMPOS_COM_MEMBRO) {
    const v = fora[chave];
    if (!v) continue;
    if (forma === 'lista') fora[chave] = v.map(r => trocaValor(r, campos, listas));
    else if (forma === 'objeto') fora[chave] = trocaValor(v, campos, listas);
    else if (forma === 'mapa') {
      fora[chave] = Object.fromEntries(
        Object.entries(v).map(([k, r]) => [k, trocaValor(r, campos, listas)]));
    } else if (forma === 'mapaDeListas') {
      fora[chave] = Object.fromEntries(Object.entries(v)
        .map(([k, lista]) => [k, (lista || []).map(r => trocaValor(r, campos, listas))]));
    }
  }
  return fora;
};

// Pontos de partida da demonstração. Uma criança acrescentada à casa começa a
// zero — não herda o histórico de ninguém.
const PONTOS_INICIAIS = { 'Léo': 14, 'Mia': 11 };

// Despesas partilhadas por acertar, na demonstração. As 14 despesas do mês
// estão nos dados; o valor está aqui até o cálculo real das partilhas existir.
const ACERTO_INICIAL = 86.5;

const KEY = 'nossa-casa/v1';

// A cópia de segurança de antes da última migração. Uma só, sempre a última —
// ver o bloco que a escreve, no carregamento.
const BACKUP = `${KEY}.antes-da-migracao`;

// As chaves que versões anteriores usaram para o mesmo e deixaram atrás.
// Limpam-se no arranque: eram uma por migração, e nenhuma saía.
const BACKUPS_ANTIGOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => `${KEY}.antes-de-v${n}`);

// Só isto é gravado. O resto — separador ativo, folha aberta, rascunhos — é UI.
//
// ⚠ Uma chave que ninguém LÊ é gravada na mesma, e engana duas vezes: aparece
// no ficheiro como se guardasse alguma coisa, e no `o-que-sobe.js` com uma
// razão escrita para não subir. Saíram duas em 05/09/2026 — o `extraLog` e o
// `importDone` — ambas herdadas do protótipo, ambas com o trabalho já feito por
// outra chave (`vaultMoves` e `googleCalendarImported`).
//
// Tirar uma daqui é seguro e não pede migração: o carregamento só copia as
// chaves que estão nesta lista, e a gravação só escreve estas. O que ficou no
// disco fica lá, ignorado.
//
// O guarda é `__tests__/nenhuma-chave-sem-quem-a-leia.test.js`.
const DATA_KEYS = [
  'done', 'pending', 'status', 'registered', 'gastoLocal', 'acertoMovs', 'partilhasPagas', 'despesasMeias', 'gastoPorEnvelope', 'vaultMoves', 'paidPts',
  'envMove', 'added', 'newTasks', 'taskEdits', 'taskGone', 'taskOrder', 'pontosDeTarefasApagadas',
  'newItems', 'itemGone', 'itemEdits', 'itemOrder', 'feitas', 'listasIds', 'envelopesDaCasa', 'envelopesProprios', 'seccoesDaCasa', 'iconesDeSeccao', 'mes',
  'metasDaCasa', 'metaMovs', 'metasProprias', 'objetivosCofre', 'pratos', 'ementa',
  'contasFixas', 'contasPagas', 'contratos', 'trocas', 'extractos',
  'newEquip', 'equipGone', 'equipEdits', 'schemeByUser', 'themeByUser', 'notif',
  'rotate', 'urg', 'due', 'monthName', 'monthLimits', 'monthZero', 'clearedSeeds',
  'eventGone', 'eventEdits', 'roles', 'pins', 'pontosLigados', 'ementaDesligada', 'iconesDesligados', 'pointValue', 'payDay', 'splitHalf',
  'rendimento', 'orcamento', 'zeradoEm', 'stores', 'shopPlan', 'shopHistory', 'precos', 'precoPago', 'health', 'specialities', 'equipCats', 'equipCatsProprias', 'registo',
  'recurringReset', 'healthNotes', 'healthRecipes', 'healthDecisions', 'healthDocs', 'healthGone',
  'healthArchived', 'healthTomas', 'healthAlergias',
  'googleCalendarImported', // Google Calendar imports
  'filaGoogle',             // o que falta empurrar para a agenda da Google
  'membros', 'nomeDaCasa', 'deDemonstracao',
  'casaDoServidor',         // a casa cuja leitura está guardada neste aparelho
];

// Versão do formato gravado. Sobe sempre que a forma de um campo persistido
// muda, e MIGRATIONS ganha a entrada correspondente. Sem isto, dados antigos
// eram lidos com a forma nova e ganhavam silenciosamente ao código.
export const SCHEMA = 15;

// Uma migração por salto de versão: recebe o objeto lido e devolve-o corrigido.
export const MIGRATIONS = {
  // v14 → v15: a secção de um artigo era um ÍNDICE e passa a ser o NOME.
  //
  // `i.s = 0..3` apontava para uma lista de quatro nomes que a casa não podia
  // mudar. A partir do momento em que ela os pode reordenar ou apagar, um
  // índice aponta para outra coisa a cada mudança — apagar «Frescos» fazia a
  // mercearia toda mudar de corredor, em silêncio.
  //
  // ⚠ Sem isto, os artigos gravados ficavam com um número num campo que os
  // ecrãs passaram a comparar com um nome: TODAS as secções apareceriam vazias.
  // É a mesma lição da migração 14 — corrigir a leitura do servidor só serve as
  // leituras futuras, e o `newItems` está no disco.
  15: (o) => {
    const artigos = o.newItems;
    if (!Array.isArray(artigos)) return o;
    if (!artigos.some(a => a && typeof a.s === 'number')) return o;
    // A lista que a casa tem; se ainda não tem nenhuma, são as sementes — que
    // é exactamente o que os índices significavam.
    const lista = (o.seccoesDaCasa || []).length ? o.seccoesDaCasa : SECTIONS;
    return {
      ...o,
      newItems: artigos.map(a => (a && typeof a.s === 'number'
        ? { ...a, s: lista[a.s] || lista[0] || null }
        : a)),
    };
  },

  // v13 → v14: os artigos que vieram do servidor ficaram com a forma dele.
  //
  // O `puxarCasa` montava `{ section, habitual }` e os ecrãs leem `{ s, staple }`
  // — a forma das sementes, que é a que o `criarArtigo` também escreve. Estava
  // corrigido no `sync.js`, e não bastava: o `newItems` é gravado, e quem já
  // tinha a app ficava com os artigos na forma antiga até à leitura seguinte.
  //
  // Sem isto, as quatro secções do Modo Compras continuavam vazias nos
  // telemóveis que não voltassem a falar com o servidor — que é o caso de quem
  // corre a app sem ele. Um campo que muda de nome numa chave GRAVADA pede
  // migração; corrigir o `sync.js` só serve as leituras futuras.
  //
  // ⚠ Só mexe no que tem a forma antiga: um artigo já com `s` fica intacto.
  14: (o) => {
    const artigos = o.newItems;
    if (!Array.isArray(artigos)) return o;
    if (!artigos.some(a => a && a.s === undefined && a.section !== undefined)) return o;
    return {
      ...o,
      newItems: artigos.map(a => {
        if (!a || a.s !== undefined) return a;
        const { section, habitual, ...resto } = a;
        return {
          ...resto,
          s: Number(section) || 0,
          staple: habitual !== undefined ? !!habitual : !!a.staple,
        };
      }),
    };
  },

  // v1 → v2: o cofre deixou de ser um saldo escrito e as sementes deixaram de
  // ser gravadas. Se o saldo antigo divergir das sementes, a diferença fica
  // como movimento de acerto — dinheiro nunca desaparece numa migração.
  2: (o) => {
    const seedOf = (kid) => VAULT.reduce((n, m) => (m.kid === kid ? n + m.delta : n), 0);
    const seedIds = new Set(VAULT.map(m => m.id));
    // as sementes que estavam gravadas saem; ficam só os movimentos do utilizador
    const mine = (o.vaultMoves || []).filter(m => !seedIds.has(m.id));
    const acertos = [];
    for (const [kid, saldo] of Object.entries(o.vault || {})) {
      const diff = Math.round((saldo - seedOf(kid)) * 100) / 100;
      if (diff !== 0) acertos.push({
        id: `vm-acerto-${kid}`, kid, delta: diff, kind: 'semanada',
        day: TODAY_KEY, label: 'Acerto de saldo anterior',
        sub: 'da versão anterior da app',
      });
    }
    const { vault, ...resto } = o;
    return { ...resto, vaultMoves: [...mine, ...acertos] };
  },

  // v2 → v3: os registos de saúde gravados tinham `date` com o texto do
  // formulário; as sementes têm `day` em chave. Passam todos a `day`. Um
  // registo cuja data não se consiga ler mantém o texto no sítio da chave —
  // fica visível e mal ordenado, o que é melhor do que desaparecer.
  3: (o) => ({
    ...o,
    health: (o.health || []).map((h) => {
      const { date, ...resto } = h;
      if (resto.day) return resto;
      return { ...resto, day: chaveDeDMY(date) || date, time: resto.time || '' };
    }),
  }),

  // v3 → v4: os PIN estavam gravados em claro. Quem já tinha um passa a
  // resumo; o valor antigo deixa de existir em disco a seguir a isto.
  4: (o) => ({
    ...o,
    pins: Object.fromEntries(Object.entries(o.pins || {})
      .map(([n, p]) => [n, /^[0-9]{4,6}$/.test(String(p)) ? resumoPin(n, p) : p])),
  }),

  // v4 → v5: o acerto entre adultos era um booleano `settled` mais o montante
  // somado ao livro dos pontos das crianças. Passa a ser uma lista de
  // movimentos, como o cofre e os envelopes. Quem já tinha acertado leva um
  // movimento pelo valor todo, para não ver a dívida ressuscitar.
  5: (o) => {
    const { settled, ...resto } = o;
    return {
      ...resto,
      acertoMovs: o.acertoMovs
        || (settled ? [{ valor: ACERTO_INICIAL, data: null, nota: 'acerto anterior' }] : []),
    };
  },

  // v5 → v6: quem já tinha limpado as sementes ficou com o DINHEIRO da
  // demonstração. A limpeza corre uma vez, na transição, e essas casas já
  // tinham transitado — continuavam a mostrar «Disponível 383,00 € de
  // 1 770,00 €», que são os gastos e os limites da família inventada.
  //
  // A condição é estreita de propósito: só quem limpou as sementes E nunca
  // definiu limites próprios. Quem tem `monthLimits` escolheu-os, e isso não
  // se toca — apagar o orçamento de alguém para corrigir um defeito meu seria
  // trocar um erro por outro pior.
  6: (o) => (o.clearedSeeds && !o.monthLimits
    ? { ...o, ...SEM_DINHEIRO_SEMEADO() }
    : o),

  // v6 → v7: a visibilidade de um evento era `shared: true/false` e passa a
  // três níveis. A tradução é direta e não muda o que ninguém vê: o que era
  // partilhado passa a «toda a família», o que não era passa a «só eu». O
  // nível do meio é novo e ninguém o tem ainda.
  7: (o) => ({
    ...o,
    added: (o.added || []).map(e => {
      // Os eventos que o «Guardar evento» gravou no campo errado. Existem, têm
      // título e data, e nunca apareceram em lado nenhum porque a app lê
      // `day` e eles tinham `date`. Recuperam-se em vez de ficarem órfãos —
      // alguém os escreveu de propósito.
      const { date, ...resto } = e;
      const comDia = e.day ? resto
        : date ? { ...resto, day: /^d/.test(String(date)) ? date : `d${date}` }
        : resto;
      return comDia.visibilidade ? comDia
        : { ...comDia, visibilidade: comDia.shared ? 'familia' : 'so-eu' };
    }),
    eventEdits: Object.fromEntries(Object.entries(o.eventEdits || {})
      .map(([k, e]) => [k, e && e.shared !== undefined && !e.visibilidade
        ? { ...e, visibilidade: e.shared ? 'familia' : 'so-eu' } : e])),
  }),

  // v7 → v8: o responsável de um evento era UM nome; passa a ser uma lista.
  // Uma reunião de pais é dos dois, e as sementes já o diziam — em texto
  // livre, porque a folha só deixava escolher um.
  //
  // Sem esta migração, os eventos já gravados ficavam com o nome no campo
  // antigo: a tabela do renomear deixaria de o percorrer, e renomear um membro
  // deixava o evento a nomear alguém que já não existe. Em silêncio, como
  // sempre.
  8: (o) => {
    const converter = (e) => {
      if (!e || typeof e !== 'object' || e.responsaveis) return e;
      const { responsible, ...resto } = e;
      return responsible ? { ...resto, responsaveis: [responsible] } : resto;
    };
    return {
      ...o,
      added: (o.added || []).map(converter),
      eventEdits: Object.fromEntries(Object.entries(o.eventEdits || {})
        .map(([k, e]) => [k, converter(e)])),
    };
  },

  // v12 → v13: as três lojas da demonstração saem de uma casa a sério.
  //
  // «Continente de Belém», «Pingo Doce da Ajuda», «Mercado de Alcântara» são
  // sementes — lojas de Lisboa escritas no código para a demonstração ter algo
  // que mostrar. Numa casa de verdade são o palpite de outra pessoa sobre onde
  // essa família faz compras.
  //
  // ⚠ Só saem se estiverem INTACTAS: a lista tem de ser exactamente aquelas
  // três, na mesma ordem. Quem lhes mexeu — acrescentou, renomeou, tirou uma —
  // fez uma escolha, e uma migração não desfaz escolhas.
  //
  // O `shopPlan.store` é um ÍNDICE nesta lista. Fica em zero, que é o que uma
  // casa nova tem, e o `lojaDoPlano()` responde «nenhuma» enquanto a lista
  // estiver vazia — daí as seis leituras diretas terem passado por lá.
  13: (o) => {
    const SEMENTES = ['Continente de Belém', 'Pingo Doce da Ajuda', 'Mercado de Alcântara'];
    const lista = o.stores;
    if (!Array.isArray(lista) || lista.length !== SEMENTES.length) return o;
    if (!lista.every((nome, i) => nome === SEMENTES[i])) return o;
    // Numa casa de demonstração ficam: é lá que servem para algo.
    if (!o.clearedSeeds) return o;
    return { ...o, stores: [] };
  },

  // v11 → v12: o plano de compras apontava para quem não existe.
  //
  // Visto no ecrã das Compras: «Compras de domingo · Domingo, 23/08» com um
  // avatar «?» ao lado. Duas coisas erradas, as duas gravadas da semente:
  //
  //   who   «Tomás» — o segundo adulto da casa de DEMONSTRAÇÃO. Numa casa que
  //         não o tem, `MEMBROS['Tomás']` é `undefined`, o avatar sai «?» e a
  //         cor sai cinzenta. É a mesma família dos nomes escritos à mão que
  //         se tiraram do código — este estava nos DADOS, e por isso sobreviveu.
  //   day   `d2026-08-23`, a data fixa antiga. Corrigi a semente e não os
  //         dados de quem já tinha a app aberta, como no `monthName`.
  //
  // O responsável passa a ser o primeiro adulto da casa — não se adivinha um
  // nome, lê-se o quadro. E o dia, se já passou, passa a ser o próximo domingo:
  // a ida às compras da casa é ao domingo, e um plano para um dia que já lá vai
  // não é um plano.
  12: (o) => {
    const plano = o.shopPlan;
    if (!plano) return o;
    const quadro = o.membros || {};
    const nomes = Object.keys(quadro);
    const adultos = nomes.filter(n => !quadro[n].kid);
    const naCasa = nomes.includes(plano.who);

    // Sem quadro gravado não se mexe no responsável: apagá-lo seria pior do
    // que deixá-lo — a casa vem do servidor e o nome pode ser válido lá.
    const who = (nomes.length && !naCasa) ? (adultos[0] || nomes[0]) : plano.who;

    const hoje = new Date(TODAY.y, TODAY.m, TODAY.d);
    const p = /^d(\d{4})-(\d{2})-(\d{2})$/.exec(plano.day || '');
    const passou = p && new Date(+p[1], +p[2] - 1, +p[3]) < hoje;
    const day = passou ? chaveRelativa((7 - hoje.getDay()) % 7) : plano.day;

    return (who === plano.who && day === plano.day)
      ? o
      : { ...o, shopPlan: { ...plano, who, day } };
  },

  // v10 → v11: o mês do orçamento numa casa que nunca abriu um mês.
  //
  // O `monthName` da semente era `'Agosto'` escrito à mão. Corrigi a semente,
  // mas quem já tinha a app aberta ficou com o valor gravado: o Dinheiro dizia
  // «Conta conjunta · Agosto de 2026» e o Início «Orçamento de Agosto», a 1 de
  // setembro.
  //
  // `monthZero: true` é a marca de uma casa que ainda não abriu mês nenhum —
  // é o que o `SEM_DINHEIRO_SEMEADO` põe, e o «Abrir Mês» é que o desliga.
  // Nessas, o nome do mês não é uma escolha de ninguém, é um resto. Numa casa
  // que JÁ abriu um mês não se toca: aí o nome é o que um adulto decidiu, e
  // sobrepor-lhe o relógio seria desfazer uma acção.
  11: (o) => (o.monthZero && o.monthName !== MONTHS[TODAY.m]
    ? { ...o, monthName: MONTHS[TODAY.m] }
    : o),

  // v8 → v9: a recuperação do `date` outra vez, porque a primeira não chegou
  // a correr onde era precisa.
  //
  // A migração 7 faz exactamente isto, e está certa. Só que foi escrita DEPOIS
  // de a loja desta casa já estar estampada com 8 — e uma migração numerada
  // abaixo da versão gravada nunca corre. Quatro eventos ficaram com
  // `date: '2026-08-14'` e nenhum `day`, e portanto invisíveis em todos os
  // ecrãs: existem, têm título e data, e a app não os mostra.
  //
  // Corrigir a 7 no lugar não serviria de nada, pela mesma razão. Tem de ser
  // um número NOVO. A operação é idempotente: numa loja onde a 7 correu, não
  // há `date` nenhum e isto não toca em nada.
  // v9 → v10: a lista de esquemas mudou, e a escolha é guardada por ÍNDICE.
  //
  // Sem isto, reordenar `SCHEMES` mudava a cor de toda a gente em silêncio:
  // quem estava em violeta (índice 1) acordava em cião, e a única pista era a
  // app estar de outra cor. Não dá erro, não dá aviso — muda e pronto.
  //
  //   antes  0 Azul Sóbrio  1 Violeta  2 Cião  3 Verde  4 Grafite  5 Céu
  //   agora  0 Violeta      1 Cião     2 Céu   3 Rosa   4 Menta    5 Cinza
  //
  // Os três que saíram vão para o mais próximo do que era: o Azul Sóbrio para
  // o Céu, o Verde para o Menta, o Grafite para o Cinza. Ninguém fica com uma
  // cor que não escolheria.
  10: (o) => {
    const NOVO = { 0: 2, 1: 0, 2: 1, 3: 4, 4: 5, 5: 2 };
    return {
      ...o,
      schemeByUser: Object.fromEntries(Object.entries(o.schemeByUser || {})
        .map(([quem, i]) => [quem, NOVO[i] ?? 0])),
    };
  },

  9: (o) => {
    const comDia = (e) => {
      if (!e || typeof e !== 'object' || e.day || !e.date) return e;
      const { date, ...resto } = e;
      return { ...resto, day: /^d/.test(String(date)) ? date : `d${date}` };
    };
    return {
      ...o,
      added: (o.added || []).map(comDia),
      eventEdits: Object.fromEntries(Object.entries(o.eventEdits || {})
        .map(([k, e]) => [k, comDia(e)])),
    };
  },
};

// O próximo domingo, para o plano de compras da demonstração.
//
// A ida às compras da casa é ao domingo, e a semente tinha o dia escrito —
// `d2026-08-23`. Fora dessa semana, o ecrã mostrava um plano para um dia que
// já tinha passado.
const proximoDomingo = () => {
  const hoje = new Date(TODAY.y, TODAY.m, TODAY.d);
  // getDay(): 0 é domingo. Se hoje for domingo, é hoje.
  return chaveRelativa((7 - hoje.getDay()) % 7);
};

export const DEMO = () => ({
  done: TASKS.reduce((a, t) => (a[t.id] = !!t.done, a), {}),
  pending: {}, status: {}, registered: 0, gastoLocal: {}, acertoMovs: [], partilhasPagas: {}, despesasMeias: 0, gastoPorEnvelope: {},
  vaultMoves: [],
  paidPts: Object.fromEntries(Object.keys(MEMBERS).filter(n => MEMBERS[n].kid).map(n => [n, 0])),
  envMove: {}, added: [], newTasks: [], taskEdits: {}, taskGone: {}, taskOrder: {},
  // Vazio quer dizer «ainda são as sementes» — materializa-se ao primeiro toque.
  seccoesDaCasa: [],
  // O ícone que a família ESCOLHEU para cada corredor: `nome → ícone`
  // (25/09/2026). Só os escolhidos entram — um corredor que não esteja aqui
  // ganha o ícone que o nome sugere (`src/icone-do-corredor.js`).
  iconesDeSeccao: {},
  // `nome → id` das três listas da casa, por lista. É o que permite renomear e
  // apagar do lado do servidor sem mudar a forma que os ecrãs leem.
  listasIds: {},
  // Os envelopes da casa, quando vêm do servidor. Vazio = corre com as
  // sementes do `ENV_BASE`, como antes de haver servidor.
  envelopesDaCasa: [],
  // Se a CASA é dona da lista de envelopes, ou se ainda corre com as sementes.
  // Distingue «a casa apagou todos» de «ninguém mexeu», que uma lista vazia não
  // distingue — apagar o último envelope trazia as quatro sementes de volta.
  envelopesProprios: false,
  // O mês aberto, quando vem do servidor: o id da linha, o dia em que abriu, e
  // os limites dele. Nulo = a casa ainda não abriu nenhum.
  mes: null,
  // As linhas de `tarefas_feitas` que o servidor tem, por «tarefa|dia». É o
  // que permite DESMARCAR: sem o id da linha não há o que apagar do outro lado.
  feitas: {},
  pontosDeTarefasApagadas: [],
  newItems: [], itemGone: {}, itemEdits: {}, itemOrder: {},
  newEquip: [], equipGone: {}, equipEdits: {},
  // ── As metas ──────────────────────────────────────────────────────────────
  //
  // `metasDaCasa` são as DEFINIÇÕES e `metaMovs` os movimentos; o que está
  // juntado é a soma dos segundos (INVARIANTE #2), nunca um campo.
  //
  // Vazias, a lista são as sementes — como os envelopes e os corredores. A
  // bandeira diz se o servidor já respondeu, e é ela que distingue «esta casa
  // não tem metas» de «esta casa ainda corre com as sementes».
  metasDaCasa: [], metaMovs: [], metasProprias: false,
  // O objetivo do cofre de cada criança, por nome: `{ Léo: { id, nome, alvo } }`.
  // O juntado é o saldo do cofre, nunca um campo daqui.
  objetivosCofre: {},
  // A ementa da semana: os pratos da casa (`{ id, nome, ingredientes: [{ rotulo, s }] }`)
  // e o jantar de cada dia, por chave de dia (`{ 'd2026-09-14': pratoId }`).
  pratos: [], ementa: {},
  // As contas fixas: a definição (`{ id, idServidor, nome, valor, dia, envelope,
  // quemPaga }`) e os pagamentos (`{ conta, mes, dia, valor, por }`). «Paga
  // este mês» é haver um pagamento da conta no mês — nunca um campo da conta.
  contasFixas: [], contasPagas: [],
  // Os contratos (`{ id, idServidor, nome, fornecedor, renovaEm, fidelizacaoAte,
  // responsavel, ficheiro, ficheiroLocal, porSubir }`), ao lado dos equipamentos.
  contratos: [],
  // As trocas de tarefas entre irmãos (`{ id, idServidor, dia, de, para,
  // propostaPor, aceiteEm, aceitePor }`): uma linha por troca, do DIA. A
  // atribuição deriva-se no `allTasks` — nada se escreve na tarefa.
  trocas: [],
  // Os extractos dos meses que o servidor derivou (`extractosDe`): o mais
  // recente primeiro, cada um com os seus movimentos por ordem do tempo.
  //
  // ⚠ Vazio sem servidor, e sem substituto local. O extracto é uma lista de
  // LINHAS — cada despesa, cada semanada, cada acerto —, e a app sem servidor
  // não guarda linhas de despesa: guarda as SOMAS (`registered`, `gastoLocal`).
  // Fabricar aqui um extracto a partir de somas era escrever uma lista que
  // ninguém registou, e o cabeçalho deixava de ser a soma do que se mostra.
  // Sem servidor, a secção não aparece.
  extractos: [],
  schemeByUser: {}, themeByUser: {},
  notif: { digest: true, hour: '20:00', lead: 1 },
  rotate: {},
  urg: TASKS.reduce((a, t) => (a[t.id] = t.urg ?? 1, a), {}),
  due: TASKS.reduce((a, t) => (t.due && (a[t.id] = { key: t.due, time: t.dueTime }), a), {}),
  // Era `'Agosto'` escrito à mão. A 1 de setembro o cabeçalho do Dinheiro
  // dizia «Conta conjunta · Agosto de 2026» e o Início «Orçamento de Agosto»,
  // com o resto da app já em setembro.
  monthName: MONTHS[TODAY.m], monthLimits: null, monthZero: false,
  clearedSeeds: false, eventGone: {}, eventEdits: {},
  roles: { ...ROLES },
  pins: {},                       // sem PIN de fábrica — o adulto define
  // ── Os pontos são opcionais ────────────────────────────────────────────────
  //
  // Nem toda a casa quer pagar tarefas. Ligado por omissão porque é o que a app
  // fazia até 04/09/2026 e desligá-lo a quem já o usa seria uma surpresa.
  //
  // ⚠ Desligar NÃO apaga nada. Os pontos são somas de movimentos (INVARIANTE
  // #2) e continuam lá; o que muda é o que se mostra e o que se pede ao criar
  // uma tarefa. Voltar a ligar traz tudo de volta ao estado exacto — e há uma
  // prova só para isso, porque a tentação de «limpar ao desligar» é real e
  // seria perda de dados disfarçada de arrumação.
  //
  // ⚠ Vai no DEMO e não no BLANK. O `BLANK()` espalha o `DEMO()`, portanto isto
  // chega aos dois — e pôr o valor só no BLANK é um defeito que já foi cometido
  // duas vezes neste ficheiro, com o `healthArchived`.
  pontosLigados: true,
  // A ementa da semana, pela NEGATIVA (12/09/2026): `false` — o valor com que um
  // `bool` nasce no servidor e com que uma chave ausente se lê cá — é «ligada».
  ementaDesligada: false,
  // Os ícones dos corredores, pela mesma NEGATIVA e pela mesma razão
  // (25/09/2026): `false` é «com ícones», que é o que a casa tinha antes de o
  // interruptor existir. Desligar não apaga escolha nenhuma — o
  // `iconesDeSeccao` fica intacto e voltar a ligar traz tudo de volta.
  iconesDesligados: false,
  // Mínimo 0, e não 0,01: uma casa pode querer os pontos como contagem e não
  // como dinheiro — «cinco pontos» sem euros por trás.
  pointValue: 0.10, payDay: 0, splitHalf: true,
  rendimento: 3200,              // o que entra por mês; os envelopes saem daqui
  // Por mês (como sempre) ou para o ano todo — ver `src/orcamento.js`.
  // O carimbo do último «Começar de Zero» que este aparelho viu (ver `lerDoServidor`).
  zeradoEm: null,
  orcamento: ORCAMENTO_BASE(),
  stores: ['Continente de Belém', 'Pingo Doce da Ajuda', 'Mercado de Alcântara'],
  shopPlan: {
    who: Object.keys(MEMBERS).filter(n => !MEMBERS[n].kid)[1] || Object.keys(MEMBERS)[0],
    // O próximo domingo, e não `'d2026-08-23'`. A data fixa passou, e o ecrã
    // dizia «Compras de domingo · Domingo, 23/08» numa semana que começava a
    // 31/08 — um plano para um dia que já lá vai.
    // ⚠ Havia aqui um `time: '10:30'`, e era um campo que SÓ a demonstração
    // tinha. A `listas_compras` não o modela, o `puxarCasa` devolve o plano
    // inteiro com `{idServidor, store, who, day}`, e nada na app o deixa
    // escolher. Numa casa ligada ao servidor a linha do plano lia-se
    // «Quarta, 09/09 ·  · Pingo Doce do Restelo» — dois separadores com nada
    // no meio, porque o ecrã fazia `${dia} · ${plano.time || ''} · ${loja}`.
    //
    // É a terceira vez desta classe: um campo das sementes que os dados do
    // servidor não trazem, depois do `today` das tarefas e do `used` dos
    // envelopes. Guarda:
    // `__tests__/o-plano-de-compras-tem-os-mesmos-campos-dos-dois-lados.test.js`.
    // ⚠ A hora está aqui OUTRA VEZ, e desta vez com sítio no servidor.
    //
    // Foi tirada em 07/09/2026 porque só a demonstração a tinha: o
    // `planeada_para` descia sem hora e a linha do plano lia-se «Quarta, 09/09
    // ·  · Pingo Doce» — dois separadores com nada no meio. O `planeada_para`
    // é um campo `date` e sempre soube guardar o instante; o que faltava era
    // alguém a escrevê-la. Agora o `mudarPlanoDeCompras` escreve-a.
    day: proximoDomingo(), time: '10:30', store: 0,
  },
  shopHistory: [],
  // O histórico de preços da casa: uma observação por artigo, loja e dia.
  // Aditivo, nunca reescrito — ver src/precos.js.
  precos: [],
  // O que se escreveu NESTA ida às compras, por artigo. É um rascunho: vira
  // observações quando a conta se fecha, e limpa-se a seguir. Sem isto, o
  // preço escrito no corredor dos frescos desaparecia ao mudar de secção.
  precoPago: {},
  health: [], specialities: ['Medicina geral', 'Dentista', 'Pediatria', 'Oftalmologia'],
  equipCats: ['Eletrodomésticos', 'Aquecimento', 'Informática', 'Outros'],
  // Se a CASA é dona da lista de categorias (pode ser vazia), ou se ainda corre
  // com as quatro sementes — ver `categoriasDaCasa`.
  equipCatsProprias: false,
  registo: [],
  recurringReset: {}, // taskId -> TODAY_KEY when reset
  healthNotes: {}, // healthId -> [{ author, date, text }]
  healthRecipes: {}, // healthId -> [{ id, name, dosage, quantity, unit, expiresAt, decision, frequency, durationDays, boxSize }]
  healthDecisions: {}, // healthId -> { type, status, note }
  // As tomas de cada receita, pela `chaveDaReceita` -> [{ id, idServidor, quando, por }].
  // Aditivas: marcar acrescenta, desmarcar tira — nunca um contador na receita.
  healthTomas: {},
  // As alergias, por membro -> [{ id, idServidor, nome, gravidade, nota }].
  healthAlergias: {},
  // ⚠ Estas duas eram gravadas e não nasciam.
  //
  // Estavam nas DATA_KEYS e não no DEMO(): numa casa nova valiam
  // `undefined`, e cada leitura tinha de as defender com `|| []`. Ninguém
  // rebentou porque as guardas lá estavam — mas uma guarda em cada sítio é
  // uma forma cara de não ter a forma certa. Apanhado por um teste de fumo.
  healthDocs: [],    // documentos acrescentados a uma ficha
  healthGone: {},    // fichas apagadas
  // ⚠ E fiz o mesmo com esta, no dia em que a escrevi: pus `healthArchived`
  // nas DATA_KEYS e o valor por omissão só no `BLANK()`. O comentário acima
  // descreve o defeito, e a mesma prova de fumo apanhou-o outra vez. Uma
  // consulta arquivada é `{ id: true }`; arquivar não apaga nada.
  healthArchived: {},
  googleCalendarImported: {}, // eventId -> true (track which Google Calendar events were imported)
  // ⚠ O que ainda não chegou à agenda da Google, e porquê está no
  // `agenda-google.js`. Uma escrita que falha não se engole: se «tudo o que se
  // marca vai para a Google» é o comportamento, uma rede em baixo não o pode
  // transformar em «quase tudo» sem ninguém dar por isso.
  filaGoogle: [],

  // Quem vive nesta casa. Era uma constante importada de data.js, e a app
  // inteira assumia estas quatro pessoas — 40 leituras diretas e 57 sítios com
  // os nomes escritos à mão. Com servidor vêm de lá; sem ele, ficam estas e a
  // casa fica marcada como demonstração.
  membros: { ...MEMBERS },
  nomeDaCasa: 'Bengui',
  deDemonstracao: true,
  // O `id` da casa do servidor que esta cópia local reflete. `null` até à
  // primeira leitura; muda de valor só quando OUTRA casa entra neste aparelho.
  casaDoServidor: null,
});

// O dinheiro que uma casa sem sementes tem: nenhum.
//
// `clearedSeeds` limpava as tarefas, os eventos, as compras e a saúde, e
// deixava o DINHEIRO — os gastos e os limites de `ENV_BASE` vivem lá e não
// passam por essa bandeira. Uma casa acabada de ligar ao servidor mostrava
// «Disponível 383,00 € de 1 770,00 €»: os 1 387 € gastos pela família de
// demonstração contra os limites que ela tinha. Um número inventado no sítio
// onde a app é mais lida.
//
// As CATEGORIAS ficam — Mercearia, Casa & contas — porque são um ponto de
// partida razoável e mudam-se na Gestão. O que sai são os valores.
export const SEM_DINHEIRO_SEMEADO = () => ({
  monthZero: true,                                     // nada gasto ainda
  monthLimits: Object.fromEntries(ENV_BASE.map(e => [e.name, 0])),
  rendimento: 0,
  orcamento: ORCAMENTO_BASE(),
  registered: 0,
  // ⚠ E a repartição também. O `registered` sozinho deixava os envelopes a
  // mostrar o gasto da demonstração numa casa que se acabou de esvaziar — a
  // classe de defeito «valor por omissão só numa das funções».
  gastoLocal: {},
});

// Casa nova: os mesmos campos, todos vazios
export const BLANK = () => ({
  ...DEMO(), done: {}, urg: {}, due: {}, vaultMoves: [],
  clearedSeeds: true, shopHistory: [], health: [],
  healthNotes: {}, healthRecipes: {}, healthDecisions: {}, healthTomas: {}, healthAlergias: {}, googleCalendarImported: {},
  healthDocs: [], healthGone: {}, healthArchived: {}, filaGoogle: [],
  ...SEM_DINHEIRO_SEMEADO(),
  // «Começar de Zero» apaga TUDO, e não deixa um ponto de partida: nem os
  // envelopes (a `SEM_DINHEIRO_SEMEADO` guarda-os com os valores a zero, e é o
  // que serve a uma casa acabada de ligar — aqui não), nem as metas, as contas
  // fixas, os pratos, as lojas. As bandeiras `...Proprios` dizem que a lista
  // vazia é da casa; sem elas as sementes voltavam.
  envelopesDaCasa: [], envelopesProprios: true, monthLimits: {}, envMove: {}, gastoPorEnvelope: {},
  metasDaCasa: [], metasProprias: true, metaMovs: [], objetivosCofre: {},
  contasFixas: [], contasPagas: [], contratos: [], pratos: [], ementa: {}, trocas: [],
  extractos: [], acertoMovs: [], partilhasPagas: {}, despesasMeias: 0,
  stores: [], precos: [], precoPago: {}, registo: [], mes: null,
  specialities: [], equipCats: [], equipCatsProprias: true,
});

// ── O `id` de uma nota de saúde ──────────────────────────────────────────────
//
// ⚠ Era `'note-' + Date.now()`, e passou a haver quem mexa numa nota PELO id —
// editar e apagar. Duas notas acrescentadas no mesmo milissegundo ficavam com
// o mesmo id, e editar uma alterava as duas. Não é hipótese remota: qualquer
// prova que acrescente duas notas seguidas cai lá dentro, e na app basta um
// toque duplo.
//
// O contador vive fora do estado de propósito — não é dado da casa, não se
// grava, e não tem de sobreviver a nada. Só tem de não repetir dentro da mesma
// sessão, e o `Date.now()` à frente resolve o resto.
let contadorDeNotas = 0;
const idDeNota = () => `note-${Date.now()}-${++contadorDeNotas}`;

const Ctx = createContext(null);
const reducer = (s, patch) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) });

// ── Que linhas do registo faltam mandar ──────────────────────────────────────
//
// Está fora do efeito, e exportada, porque a decisão tem dois casos que só se
// veem na SEGUNDA leitura — e um efeito de React não se põe à prova sem montar
// a app inteira. Assim prova-se a decisão, que é onde estava o defeito.
//
// A chave é o par instante+texto: as linhas antigas não têm `id`, e duas acções
// iguais no mesmo milissegundo não existem.
export const chaveDeRegisto = (r) => `${r.at}|${r.t}`;

// Acrescenta uma linha ao registo da casa, e é a única forma de o fazer.
//
// ⚠ Traz o TETO consigo. A lista era um `[novo, ...x.registo]` repetido em
// catorze sítios e nada a cortava: uma casa com dois anos de uso levava
// milhares de linhas para dentro do telefone a cada gravação. O servidor já
// devolve só as cem mais recentes; aqui guardam-se duzentas, que é folga para o
// que ainda não subiu.
// A ÁREA da casa a que a linha pertence, e é ela que faz o registo ser mais do
// que uma parede de texto: dá o filtro, e dá o destino ao toque. Os nomes são
// os mesmos do `AREAS` da Documentação — uma lista só, e uma prova a conferi-la.
export const REGISTO_MAX = 200;
export const maisRegisto = (x, t, a = null) =>
  [{ t, at: Date.now(), ...(a ? { a } : {}) }, ...(x.registo || [])].slice(0, REGISTO_MAX);

export const registosPorEnviar = (lista, jaEnviados) => (lista || []).filter((r) => {
  // ⚠ Uma linha com `id` VEIO do servidor, e por definição já lá está.
  //
  // Sem isto havia um ciclo: a leitura punha as linhas do servidor na loja, o
  // efeito via instantes que nunca tinha enviado — os do servidor, não os
  // locais — e mandava-as outra vez. A leitura seguinte trazia o dobro.
  if (r.id) return false;
  return !jaEnviados.has(chaveDeRegisto(r));
});

// ⚠ HÁ SERVIDOR, e não «o módulo carregou».
//
// Três sítios perguntavam `sync ? … : …` a querer dizer «esta casa está ligada
// a um servidor». Não é o que a expressão diz: o `sync` é o MÓDULO, e o
// `carregarSync` atribui-o no arranque haja ou não `EXPO_PUBLIC_PB_URL` — o
// `pocketbase.js` carrega sem URL, e é o `estaLigado()` que sabe a diferença.
// Na app o ramo local nunca corria; corria só no Jest, onde o `import('./sync')`
// rebenta com o SDK em ESM e cai no `catch`. As provas viam o lado certo e a
// app o errado, que é a pior maneira de um defeito viver (15/09/2026).
//
// O que isso partia: «Pagar semanada» não descontava os pontos e o segundo
// toque pagava outra vez; fechar o mês não limpava o gasto nem o acerto.
const comServidor = () => !!(sync && sync.ligado && sync.ligado());

export function StoreProvider({ children }) {
  const [state, set] = useReducer(reducer, null, DEMO);
  const ready = useRef(false);
  // Se se pode escrever no disco. Fica falso quando ler os dados correu mal:
  // gravar por cima do que não se conseguiu ler é como se apaga uma casa.
  const gravavelRef = useRef(true);
  // O que falhou, para poder ser dito em vez de adivinhado.
  const falhaAoMigrarRef = useRef(null);
  const sig = useRef('');
  // Nome local → identificador do servidor. Vazio enquanto a app correr só
  // local, que é o caso quando não há EXPO_PUBLIC_PB_URL.
  const mapaServidor = useRef({ casa: null, membros: {}, envelopes: {} });
  // As linhas do registo que já não é preciso mandar. Nulo = o disco ainda não
  // foi lido, e nada sobe até isso acontecer.
  const registosEnviados = useRef(null);
  // Se o ecrã das Compras está aberto. Só enquanto estiver é que vale a pena
  // ter uma subscrição aberta contra o servidor.
  const [aSeguirCompras, setASeguirCompras] = useState(false);

  // Ler a casa do servidor. Corre no arranque E outra vez depois de alguém
  // entrar — que é o que faltava.
  //
  // No arranque não há sessão ainda: as regras das coleções recusam, a leitura
  // volta vazia, e a app fica com a casa de demonstração. Se isto não voltasse
  // a correr depois da entrada, quem entrasse pela Google ficava com o seu
  // nome de utilizador e o quadro da família de demonstração — e a app
  // rebentava em `MEMBERS[user].kid`, porque esse utilizador não está lá.
  // Foi exatamente o que aconteceu: ecrã branco, `Cannot read properties of
  // undefined (reading 'kid')`.
  const lerDoServidor = async () => {
    try {
      const s = await carregarSync();
      const casa = s && await s.puxarCasa();
      if (!casa) return false;
      // ── ⚠ OUTRA casa neste aparelho ──────────────────────────────────────
      //
      // A cópia local é de UMA casa, e não sabia de qual. A leitura que se
      // segue substitui o que o servidor manda cheio e deixa ficar o que manda
      // vazio (é a regra certa para uma casa sem servidor e para a demonstração)
      // — mas se quem entra é de OUTRA casa, «vazio» é a verdade dela, e o que
      // ficava era a casa anterior: a administradora de uma casa nova, num
      // telemóvel onde antes entrara outra família, via o jantar, as tarefas e a
      // garantia do frigorífico dessa família (casa simulada, 13/09/2026).
      // Mudou a casa: o estado volta a `BLANK()` ANTES de ler, e só ficam as
      // preferências de aspeto, que são de quem olha e não da casa.
      //
      // ⚠ E o mesmo quando a casa foi ZERADA noutro aparelho. O «Começar de
      // Zero» apaga o servidor e a cópia de quem carrega no botão — e a cópia
      // dos OUTROS telemóveis ficava: mostravam o que o browser tinha apagado,
      // e o que lá estava podia voltar a subir. O hook deixa um carimbo
      // (`zerado_em`); um aparelho que não o viu apaga a sua cópia, uma vez.
      set(x => {
        const outraCasa = x.casaDoServidor && casa.casaId && x.casaDoServidor !== casa.casaId;
        const foiZerada = !!casa.zeradoEm && casa.zeradoEm !== x.zeradoEm;
        if (outraCasa || foiZerada) {
          return { ...BLANK(), schemeByUser: x.schemeByUser, themeByUser: x.themeByUser, notif: x.notif,
            casaDoServidor: casa.casaId, zeradoEm: casa.zeradoEm || null };
        }
        return { casaDoServidor: casa.casaId || x.casaDoServidor };
      });
      mapaServidor.current = {
        casa: casa.casaId,
        membros: Object.fromEntries((casa._servidor.membros || []).map(m => [m.nome, m.id])),
        envelopes: Object.fromEntries((casa._servidor.envelopes || []).map(e => [e.nome, e.id])),
      };
      // O servidor manda: se respondeu com membros, são estes e mais nenhuns.
      // Sem servidor, a app fica com a família de demonstração — e o Perfil
      // di-lo, para ninguém confundir uma com a outra.
      //
      // Os PAPÉIS vêm com eles. Isto faltava, e o efeito era exatamente o
      // contrário do esperado: o servidor dizia que o António administra a
      // casa, `s.roles` continuava a ser o da demonstração — onde não há
      // nenhum António — e `isAdmin` respondia que não. Quem administra a casa
      // entrava e não via a Gestão, que é o único sítio onde a podia gerir.
      if (Object.keys(casa.membros || {}).length) {
        const papeis = Object.fromEntries(Object.entries(casa.membros)
          .map(([nome, m]) => [nome, m.papel || (m.kid ? 'crianca' : 'adulto')]));
        set(x => ({
          membros: casa.membros,
          roles: papeis,
          nomeDaCasa: casa.nomeDaCasa,
          deDemonstracao: false,

          // Quando o servidor responde com uma casa a sério, a demonstração
          // acaba. As sementes ficavam: o Início mostrava tarefas do Léo e do
          // Tomás, e eventos com o avatar a `?`, numa casa onde nenhum deles
          // vive. Os membros vinham do servidor e as tarefas de uma família
          // inventada — duas casas ao mesmo tempo, no mesmo ecrã.
          //
          // Só as SEMENTES saem. O que a pessoa criou — `newTasks`, `added`,
          // `newItems`, o cofre — não é semente e fica. E isto acontece uma
          // vez: quem já tinha limpado continua limpo, e quem quiser a
          // demonstração de volta tem «Repor dados de demonstração» no Perfil.
          ...(x.clearedSeeds ? {} : {
            clearedSeeds: true,
            ...SEM_DINHEIRO_SEMEADO(),
            registo: maisRegisto(x, 'A casa passou a ser a do servidor; os dados de demonstração saíram', 'A App'),
          }),
        }));
      }
      // Os movimentos de cofre do servidor substituem os locais: são a mesma
      // coisa vista de outro sítio, e o servidor tem os dos dois telemóveis.
      // Um saldo nunca é escrito — continua a ser a soma.
      //
      // ⚠ E o `paidPts` vem com eles, porque é a mesma soma sobre as mesmas
      // linhas. Era um campo que cada telefone escrevia sozinho: a Rita pagava
      // a semanada, o Tomás continuava a ver os pontos por pagar, e pagava
      // outra vez. SUBSTITUI-se, nunca se funde — fundir duas versões de uma
      // soma é somá-la duas vezes.
      if (casa.vaultMoves.length) {
        set({ vaultMoves: casa.vaultMoves, paidPts: casa.paidPts || {} });
      }

      // ── As metas ───────────────────────────────────────────────────────────
      //
      // A lista da casa SUBSTITUI as sementes, e os movimentos substituem os
      // locais — a mesma regra do cofre e pela mesma razão: fundir duas versões
      // de uma soma é somá-la duas vezes.
      //
      // ⚠ E substitui mesmo VINDO VAZIO, ao contrário do cofre. Uma casa que
      // apaga a última meta tem zero metas, e ficar com as duas da demonstração
      // era mostrar objetivos que ninguém tem. Quem manda na lista é o servidor
      // — a mesma lição do `shopPlan` nulo que deixava a ida de sábado no ecrã
      // para sempre.
      //
      // A bandeira `metasProprias` é o que distingue «a casa não tem metas»
      // de «esta casa ainda corre com as sementes»: sem ela, uma casa ligada e
      // sem metas voltava a mostrar as férias no Algarve a cada leitura.
      set(x => ({
        metasDaCasa: casa.metas || [],
        metaMovs: casa.metaMovs || [],
        metasProprias: true,
        // O servidor devolve só os objetivos que quem pergunta pode ver: a
        // criança o seu, os adultos todos. Substitui-se, não se funde.
        objetivosCofre: casa.objetivosCofre || {},
        // A ementa é da casa: o servidor manda, substitui-se por inteiro.
        pratos: casa.pratos || [],
        ementa: casa.ementa || {},
        // As contas fixas e os pagamentos delas, pela mesma regra. Os
        // pagamentos são as despesas com `conta_fixa` — SUBSTITUEM, não se
        // fundem: fundir duas versões da mesma lista é pagar duas vezes.
        contasFixas: casa.contasFixas || [],
        contasPagas: casa.contasPagas || [],
        // ⚠ Os contratos substituem-se — mas um documento que ainda só está
        // NESTE telemóvel («por subir») não se perde na leitura: cola-se à
        // linha que veio do servidor, até subir.
        contratos: (casa.contratos || []).map(c => {
          const local = (x.contratos || []).find(k => k.idServidor === c.id && k.porSubir);
          return local ? { ...c, ficheiroLocal: local.ficheiroLocal, porSubir: true } : c;
        }),
        // As trocas de tarefas são do dia e o servidor manda: substituem-se.
        // O que fica de fora é uma proposta deste telemóvel ainda por subir,
        // e essa sobe pela fila e volta na leitura seguinte.
        trocas: casa.trocas || [],
        // Os extractos dos meses, derivados das linhas do servidor.
        // Substituem-se — uma derivação não se funde com outra.
        extractos: casa.extractos || [],
      }));

      // ⚠ O acerto de contas entre os adultos, pela mesma razão e com a mesma
      // regra: SUBSTITUI, nunca funde. Era uma escrita de sentido único — subia
      // para a coleção `acertos` e nunca voltava —, e por isso o telemóvel de
      // quem recebeu continuava a mostrar a dívida por pagar.
      //
      // Aqui substitui-se mesmo quando vem VAZIO, ao contrário do cofre: uma
      // lista vazia é a resposta certa depois de o mês fechar, e ficar com os
      // movimentos locais era voltar a ter uma dívida já acertada.
      if (Array.isArray(casa.acertoMovs)) set({ acertoMovs: casa.acertoMovs });
      // E quanto cada adulto pagou das despesas partilhadas — a base do acerto.
      if (casa.partilhasPagas) set({ partilhasPagas: casa.partilhasPagas });
      // E o gasto de cada envelope — sem isto, tudo caía na Mercearia.
      //
      // ⚠ E o `gastoLocal` esvazia-se com esta leitura, senão conta duas vezes:
      // as despesas que este telemóvel registou já vêm dentro destes números.
      // É o mesmo raciocínio do cofre e do acerto — o que o servidor devolve
      // SUBSTITUI o que estava de cá, não se soma a ele.
      if (casa.gastoPorEnvelope) set({ gastoPorEnvelope: casa.gastoPorEnvelope, gastoLocal: {} });
      // ⚠ Os corredores, com a ORDEM que o servidor tem. Sem esta linha a lista
      // descia e ficava por aplicar — o meio-caminho que já deixou o gasto do
      // mês somado e nunca usado.
      if (casa.seccoesDaCasa && casa.seccoesDaCasa.length) {
        set({ seccoesDaCasa: casa.seccoesDaCasa });
        // ⚠ SUBSTITUI, e mesmo quando vem vazio: tirar o ícone escolhido a um
        // corredor é uma decisão, e fundir com o mapa local ressuscitava-o. O
        // par disto é o `envMove`, pela mesma razão.
        set({ iconesDeSeccao: casa.iconesDeSeccao || {} });
      }
      if (typeof casa.despesasMeias === 'number') set({ despesasMeias: casa.despesasMeias });

      // ── A agenda e as tarefas do servidor ─────────────────────────────────
      //
      // Substituem as locais, pela mesma razão do cofre: são a mesma coisa
      // vista de outro sítio, e o servidor tem as dos dois telemóveis. Até
      // 04/09/2026 nada disto subia — as tarefas e a agenda viviam só no
      // telefone de quem as escreveu, e dois telefones nunca se viam.
      //
      // ⚠ Substitui-se apenas quando o servidor TEM alguma coisa. Uma casa
      // acabada de ligar responde com listas vazias, e apagar o que a pessoa
      // escreveu antes de ligar seria perder trabalho por ter ligado.
      //
      // ⚠ E `urg`/`due` são FUNDIDOS, não substituídos: são mapas indexados por
      // id e há tarefas locais ainda por subir cujas entradas não podem
      // desaparecer. As chaves do servidor ganham, porque são as partilhadas.
      // ── As regras da casa ─────────────────────────────────────────────────
      //
      // O servidor manda: são regras da CASA, não deste telefone. Até
      // 04/09/2026 viviam só no telefone de quem as mudou — a Rita desligava os
      // pontos e o Tomás continuava a vê-los, e os dois telefones pagavam
      // semanadas de valores diferentes sem nenhum deles saber.
      if (casa.regras) set(casa.regras);

      // As três listas da casa — especialidades, categorias de equipamento e
      // lojas. Substituem as locais quando o servidor tem alguma: são da casa,
      // não deste telefone.
      if (Object.keys(casa.listas || {}).length) {
        set(x => ({ ...casa.listas, listasIds: { ...x.listasIds, ...casa.listasIds } }));
      }

      // ── Os envelopes, e o que se moveu entre eles ─────────────────────────
      //
      // ⚠ O `envMove` do servidor SUBSTITUI o local, e é a diferença que
      // importa: ele é a SOMA das transferências, não um mapa que cada telefone
      // reescreve. Fundi-lo com o local voltava a somar duas vezes o que este
      // telefone já mandou.
      if ((casa.envelopesDaCasa || []).length) {
        set({ envelopesDaCasa: casa.envelopesDaCasa, envelopesProprios: true, envMove: casa.envMove || {} });
      }

      // ⚠ E o GASTO do mês, que o `puxarCasa` calculava e NINGUÉM aplicava.
      //
      // O `registered` só crescia pelo `registarDespesa` local. Numa casa a
      // sério — que é toda a casa ligada — o orçamento dizia «0,00 € gastos» com
      // dez despesas na base de dados: as do outro adulto nunca contavam, e as
      // deste telefone desapareciam ao recarregar a página.
      //
      // É o mesmo defeito do `paidPts` e do `acertoMovs`: uma soma que o
      // servidor faz e o cliente ignora. Só que este não passou pelo guarda do
      // `o-que-sobe`, porque lá a pergunta era «o `puxarCasa` calcula-o?» — e
      // calculava. Faltava a segunda metade: «e alguém o USA?».
      //
      // Apanhado a semear a casa para experimentar a app, e não por uma prova.
      if (typeof casa.registered === 'number') set({ registered: casa.registered });

      // ── As compras ────────────────────────────────────────────────────────
      //
      // ⚠ O `status` do servidor SUBSTITUI o local, e é a diferença que
      // importa: ele vem da linha de cada artigo, e não de um mapa que este
      // telefone reescreveu. Fundi-lo deixava um artigo apanhado pelo outro
      // adulto a aparecer por comprar aqui.
      // Os equipamentos: a coleção existia desde o início e ninguém escrevia
      // nela. A garantia da máquina de lavar era conhecida de um telefone só.
      if ((casa.newEquip || []).length) set({ newEquip: casa.newEquip });

      // ── As preferências de quem está ligado ───────────────────────────────
      //
      // ⚠ UMA chave só nos mapas — a desta pessoa. O servidor devolve só a
      // linha de quem pergunta, e escrever as dos outros por cima apagava o que
      // este dispositivo tivesse guardado localmente para eles.
      if (casa.preferencias) {
        const p = casa.preferencias;
        set(x => ({
          schemeByUser: { ...x.schemeByUser, [p.nome]: p.esquema },
          themeByUser: { ...x.themeByUser, [p.nome]: p.aspeto },
          notif: { ...x.notif, ...p.notif },
        }));
      }

      // O mês aberto. É ele que define o intervalo dos totais, e por isso vem
      // ANTES de o `registered` e o `envMove` serem lidos — que já vêm
      // filtrados por ele.
      if (casa.mes) {
        set(x => ({
          mes: casa.mes,
          ...(casa.mes.monthLimits ? { monthLimits: casa.mes.monthLimits } : {}),
        }));
      }

      // ⚠ E o NULO também se aplica — era o que faltava.
      //
      // O `puxarCasa` devolve `shopPlan: null` quando não há lista aberta, e o
      // `if (casa.shopPlan)` deitava isso fora. Consequência: a Rita fecha a
      // conta na caixa, a lista fecha no servidor, e o telemóvel do Tomás
      // continua a mostrar a ida de sábado com os artigos todos — para sempre,
      // porque nenhuma leitura seguinte a tira de lá.
      //
      // É a mesma forma dos «saldos escritos» do INVARIANTE #2, virada ao
      // contrário: aqui não é um total que não se recalcula, é uma ausência que
      // não se propaga. Quem manda na lista ABERTA é o servidor.
      //
      // ⚠ E o `itemOrder` SUBSTITUI o local, como o `taskOrder` das tarefas e
      // pela mesma razão: os postos são relativos, e fundir os do servidor com
      // os deste telefone dá dois números iguais no mesmo corredor e uma lista
      // que salta de cada vez que se lê.
      set(x => (casa.shopPlan
        ? {
          newItems: casa.newItems,
          itemOrder: casa.itemOrder || {},
          status: casa.status || {},
          shopPlan: { ...x.shopPlan, ...casa.shopPlan },
        }
        : { newItems: [], itemOrder: {}, status: {}, shopPlan: null }));

      // ⚠ O histórico das idas vem à parte da lista ABERTA, e é de propósito:
      // entre duas idas não há lista aberta nenhuma — `casa.shopPlan` é nulo — e
      // é exatamente aí que o ecrã das compras mostra o histórico. Pendurá-lo na
      // condição de cima deixava-o vazio no único momento em que se lê.
      if ((casa.shopHistory || []).length) set({ shopHistory: casa.shopHistory });

      // ⚠ O registo da casa SUBSTITUI o local, e traz o `quem` — que é a única
      // coisa que o registo local nunca podia ter. «Quem mudou isto?» é uma
      // pergunta que a outra pessoa faz, e catorze sítios escreviam a resposta
      // num telefone só.
      //
      // Substitui-se em vez de fundir porque o servidor tem as linhas dos dois
      // telefones e este só tem as suas. O que fica de fora é a história deste
      // aparelho de antes de haver servidor — e essa não se manda para trás,
      // que seria assiná-la com o nome de quem estivesse ligado hoje.
      if ((casa.registo || []).length) set({ registo: casa.registo });

      if ((casa.added || []).length) set({ added: casa.added });
      if ((casa.newTasks || []).length) {
        set(x => ({
          newTasks: casa.newTasks,
          urg: { ...x.urg, ...casa.urg },
          due: { ...x.due, ...casa.due },
          // ⚠ A ordem à mão SUBSTITUI a local, e não se funde como o `urg` e o
          // `due`. Os postos são relativos: fundir os do servidor com os deste
          // telefone dava dois grupos numerados de zero misturados no mesmo
          // grupo, e uma lista que salta de cada vez que se lê. A ordem é da
          // casa — quem manda é quem a tem inteira.
          taskOrder: casa.taskOrder || {},
          // O `done` do servidor é o de HOJE. Funde-se, senão uma tarefa
          // marcada neste telefone e ainda por subir voltava a por fazer.
          done: { ...x.done, ...casa.done },
          // E o `pending` — as marcações de criança à espera de um adulto —
          // pela mesma razão. O que o servidor já dá por FEITO deixa de estar
          // à espera, seja o que for que este telefone pensava.
          pending: { ...x.pending, ...(casa.pending || {}),
            ...Object.fromEntries(Object.keys(casa.done || {}).map(id => [id, false])) },
          feitas: casa.feitas || {},
        }));
      }
      return true;
    } catch (e) {
      // ⚠ Um erro AQUI não é o servidor em baixo — é código partido a fazer de
      // conta que é. Em 12/09/2026 uma leitura com as 30 coleções a responder
      // 200 acabou neste `catch` em silêncio, a app ficou com a família de
      // demonstração e o ecrã disse ao dono da casa que ele «não faz parte
      // desta casa». Diz-se na consola o que rebentou; o comportamento para a
      // app não muda — fica local, como antes.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[lerDoServidor] a leitura da casa falhou:', e && e.message ? e.message : e);
      }
      return false;     // servidor indisponível — a app fica local
    }
  };

  // ler ao arrancar
  useEffect(() => {
    (async () => {
      // ⚠ Uma migração que atire NÃO pode apagar a casa.
      //
      // Isto era um `try` só, com `catch` a dizer «armazenamento indisponível»,
      // e o `ready.current = true` logo abaixo, fora dele. O caminho que isso
      // abria:
      //
      //   1. uma migração atira (um campo com forma inesperada, um descuido)
      //   2. o catch engole o erro — e a mensagem manda olhar para o disco
      //   3. o `set(patch)` nunca corre: a app fica com o estado INICIAL
      //   4. `ready` fica verdadeiro
      //   5. o efeito de gravação escreve o estado inicial por cima de tudo,
      //      já com `v: SCHEMA` — e a migração nunca volta a correr
      //
      // Eventos, movimentos do cofre, histórico de preços: tudo, em silêncio,
      // sem uma linha no ecrã. Uma casa não se perde por um `catch` genérico.
      //
      // Agora são três passos separados, e o único que pode seguir em frente
      // sem dados é a leitura do disco falhar — aí não havia nada para perder.
      let raw = null;
      try { raw = await AsyncStorage.getItem(KEY); }
      catch (e) { /* armazenamento indisponível — segue em memória */ }

      // As cópias que as versões anteriores deixaram, uma por migração. Saem
      // sem cerimónia: a única que serve para recuperar é a última, e essa
      // passou a viver numa chave fixa.
      for (const antiga of BACKUPS_ANTIGOS) {
        try { await AsyncStorage.removeItem(antiga); } catch (e) { /* segue */ }
      }

      if (raw) {
        let saved = null;
        try { saved = JSON.parse(raw); } catch (e) { saved = null; }
        const v = saved && typeof saved.v === 'number' ? saved.v : 0;

        // Gravado por uma versão mais recente: não sabemos ler, e ler mal é
        // pior do que não ler. Fica-se pelas predefinições — mas também não
        // se grava por cima, senão uma abertura na versão antiga estragava a
        // casa de quem já anda na nova.
        if (saved && v > SCHEMA) {
          gravavelRef.current = false;
        } else if (saved) {
          // A cópia do que está no disco, ANTES de lhe mexer. É baratíssima e
          // é a diferença entre um erro de migração ser um susto ou uma perda.
          //
          // ⚠ Uma chave FIXA, e não `.antes-de-v${v}`.
          //
          // Com a versão no nome, cada migração deixava uma cópia nova e
          // nenhuma saía: `antes-de-v9`, `antes-de-v10`, `antes-de-v11`… um
          // monte de casas velhas a ocupar o armazenamento do telemóvel para
          // sempre. Já se via uma no navegador ao fim de uma tarde.
          //
          // Uma cópia só, sempre a última: é a que serve para recuperar de uma
          // migração que corra mal, e as anteriores só existiriam para
          // recuperar de um erro que já passou. A versão vai dentro do próprio
          // conteúdo, no campo `v` — não precisa de estar no nome.
          if (v < SCHEMA) {
            try { await AsyncStorage.setItem(BACKUP, raw); }
            catch (e) { /* sem espaço: segue, o resto já protege */ }
          }
          try {
            for (let n = v + 1; n <= SCHEMA; n++) {
              if (MIGRATIONS[n]) saved = MIGRATIONS[n](saved);
            }
            const patch = {};
            DATA_KEYS.forEach(k => { if (saved[k] !== undefined) patch[k] = saved[k]; });
            set(patch);
            // ⚠ O registo que veio do DISCO é o que não sobe — e semeia-se
            // AQUI, e não à primeira passagem do efeito.
            //
            // Semeado no efeito, apanhava de caminho a linha que o
            // `lerDoServidor` acabava de escrever («A casa passou a ser a do
            // servidor»): ela existia já quando o efeito correu pela primeira
            // vez, ficava marcada como enviada, e a primeira linha da história
            // de uma casa nunca subia nem tinha autor. Era a única que se via
            // numa casa acabada de ligar.
            registosEnviados.current = new Set((saved.registo || []).map(chaveDeRegisto));
          } catch (e) {
            // NÃO se grava. O disco fica como está, com a cópia ao lado, e a
            // app corre em memória até alguém corrigir a migração.
            gravavelRef.current = false;
            falhaAoMigrarRef.current = { deVersao: v, paraVersao: SCHEMA, erro: String(e && e.message || e) };
            if (typeof console !== 'undefined' && console.error) {
              console.error(`[Nossa Casa] A migração de v${v} para v${SCHEMA} falhou. `
                + `Os dados no disco NÃO foram tocados e há uma cópia em `
                + `«${BACKUP}». A app corre em memória até isto ser corrigido.`, e);
            }
          }
        }
      }
      ready.current = true;
      // Sem nada gravado no disco — casa nova — não há história antiga
      // nenhuma, e tudo o que se escreva daqui para a frente sobe.
      if (registosEnviados.current === null) registosEnviados.current = new Set();

      // Depois do local, o servidor — nesta ordem de propósito: a app tem de
      // desenhar já com o que tem em disco, e a rede é um extra que chega
      // quando chegar. Sem ligação, isto não faz nada e a app corre como
      // sempre correu.
      //
      // ⚠ Só com sessão. Sem ela isto disparava as ~55 leituras de coleções
      // (`perPage=500`) no ecrã de entrada, todas recusadas ou vazias, e
      // atrasava o arranque a ~20 s. Quem tem sessão gravada é lido pelo
      // `App.jsx` logo que ela é retomada (`sessaoPronta` + `lerDoServidor`),
      // e quem entra é lido pelo próprio ecrã de entrada.
      try {
        const s = await carregarSync();
        if (s && s.sessao && s.sessao()) await lerDoServidor();
      } catch (e) { /* sem sessão: nada a ler */ }
    })();
  }, []);

  // gravar a cada alteração, sem escrever igual duas vezes
  useEffect(() => {
    if (!ready.current) return;
    // ⚠ A guarda que faltava. Sem ela, uma migração falhada era seguida por
    // uma gravação do estado INICIAL por cima dos dados.
    if (!gravavelRef.current) return;
    const out = { v: SCHEMA, savedAt: new Date().toISOString() };
    DATA_KEYS.forEach(k => { out[k] = state[k]; });
    const payload = JSON.stringify(out);
    const s = payload.replace(/"savedAt":"[^"]*",?/, '');
    if (s === sig.current) return;
    sig.current = s;
    AsyncStorage.setItem(KEY, payload).catch(() => {});
  }, [state]);

  // ── O registo da casa sobe daqui, e de mais lado nenhum ───────────────────
  //
  // ⚠ São CATORZE os sítios do `build` que acrescentam uma linha ao registo —
  // apagar uma tarefa, mudar um papel, renomear a casa, alguém entrar, alguém
  // sair. Pôr a escrita em cada um deles era catorze oportunidades de esquecer
  // a décima quinta, que é exatamente a forma de defeito das oito funções de
  // escrita que ninguém chamava.
  //
  // Aqui é um sítio só, e vê tudo o que entra na lista: quem acrescentar um
  // registo novo amanhã não tem de saber que isto existe.
  //
  // ⚠ E o que veio do DISCO não sobe: é a história deste telefone de antes de
  // haver servidor, e mandá-la em bloco enchia a casa de linhas antigas
  // assinadas por quem calhasse estar ligado. O que sobe é o que acontecer daqui
  // para a frente.
  //
  // ⚠ Esse conjunto semeia-se ao LER O DISCO — ver o efeito de carregamento —, e
  // não na primeira passagem deste. Semeado aqui, apanhava de caminho a linha
  // que o `lerDoServidor` acabava de escrever, e a primeira linha da história de
  // uma casa nunca subia nem tinha autor.
  useEffect(() => {
    if (!ready.current || !sync) return;
    if (registosEnviados.current === null) return;   // o disco ainda não foi lido
    const lista = state.registo || [];
    const ses = sync.sessao && sync.sessao();
    if (!ses) return;

    for (const r of registosPorEnviar(lista, registosEnviados.current)) {
      // Marca-se ANTES de enviar. Se a escrita falhar fica na fila do
      // `escrever`, e voltar a marcá-la aqui só a mandaria duas vezes.
      registosEnviados.current.add(chaveDeRegisto(r));
      sync.registoDaCasa({
        casa: ses.casa, texto: r.t, quem: ses.membro, quando: r.at, area: r.a,
      }).catch(() => {});
    }
  }, [state.registo]);

  // ── Dois adultos na mesma loja ────────────────────────────────────────────
  //
  // Enquanto as Compras estiverem abertas, o que o outro telemóvel marcar chega
  // a este sem ser preciso sair e voltar. Ver `seguirCompras` no `sync.js`.
  //
  // ⚠ Relê a casa inteira em vez de aplicar o evento à mão, e é de propósito: o
  // `puxarCasa` já sabe fundir o que veio do servidor com o que está por subir
  // deste telefone. Aplicar um `create` de artigo à mão era escrever uma
  // segunda fusão, mais pobre, ao lado da que já existe e está provada.
  //
  // ⚠ E espera meio segundo. Quem apanha meia dúzia de artigos seguidos manda
  // meia dúzia de eventos, e uma leitura por cada era a lista a saltar debaixo
  // dos dedos de quem está a marcar.
  const seguirRef = useRef({ cancelar: null, temporizador: null });
  useEffect(() => {
    let vivo = true;
    if (!aSeguirCompras) return undefined;

    (async () => {
      const cancelar = await sync?.seguirCompras?.(() => {
        clearTimeout(seguirRef.current.temporizador);
        seguirRef.current.temporizador = setTimeout(() => {
          if (vivo) lerDoServidor();
        }, 500);
      });
      if (!vivo) { cancelar?.(); return; }
      seguirRef.current.cancelar = cancelar;
    })();

    return () => {
      vivo = false;
      clearTimeout(seguirRef.current.temporizador);
      seguirRef.current.cancelar?.();
      seguirRef.current.cancelar = null;
    };
  }, [aSeguirCompras]);

  const api = useMemo(() => build(state, set, mapaServidor, lerDoServidor, setASeguirCompras), [state]);

  // ── O que ficou por empurrar para a agenda da Google tenta outra vez ──────
  //
  // ⚠ Uma escrita na Google que falha NÃO se engole com um `.catch(() => {})`.
  // O caso que interessa é invisível: a app fica certa, a agenda fica sem o
  // evento, e ninguém descobre até faltar a uma consulta.
  //
  // A fila escoa-se quando a app abre e sempre que ela muda, o que cobre os
  // três casos verdadeiros: a rede voltou, a agenda acabou de ser ligada, ou
  // acabou de entrar uma marcação nova.
  //
  // ⚠ E é AQUI, depois do `api`, e não lá em cima com os outros efeitos: as
  // funções que empurram vivem dentro do `build`, que é outra função.
  const aEscoarGoogle = useRef(false);
  useEffect(() => {
    if (!ready.current || aEscoarGoogle.current) return;
    if (!(state.filaGoogle || []).length) return;
    aEscoarGoogle.current = true;
    api.escoarFilaGoogle().finally(() => { aEscoarGoogle.current = false; });
  }, [state.filaGoogle]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fora do StoreProvider');
  return v;
};

// ─── derivações. Tudo o que a interface lê passa por aqui.
// `lerDoServidor` vem de fora porque vive no fornecedor, onde estão os efeitos
// e a referência ao mapa do servidor. Passá-lo é mais honesto do que duplicá-lo
// aqui — havia duas cópias a divergir à espera de acontecer.
function build(s, set, mapaServidor = { current: { casa: null, membros: {}, envelopes: {} } },
               lerDoServidor = async () => false, seguirCompras = () => {}) {
  // Quem vive nesta casa. Vinha de listas escritas à mão — `['Léo', 'Mia']` em
  // seis sítios, `['Rita', 'Tomás', 'Léo', 'Mia']` noutros seis. Acrescentar
  // alguém à casa dava-lhe um avatar e mais nada: não aparecia no filtro das
  // tarefas, não tinha cofre, não podia ser responsável por um evento.
  const quadro = s.membros || MEMBERS;
  const membrosDaCasa = Object.keys(quadro);
  const criancas = membrosDaCasa.filter(n => quadro[n]?.kid);
  const adultos = membrosDaCasa.filter(n => !quadro[n]?.kid);

  // Concordância de género a partir do quadro da casa. O `DE` do data.js lê a
  // constante dos quatro membros e devolve «do» para toda a gente que não
  // esteja lá — uma Ana acrescentada à casa ficava «do Ana».
  const artigo = (n) => (quadro[n]?.fem ? 'a' : 'o');
  const oNome = (n) => `${quadro[n]?.fem ? 'A' : 'O'} ${n}`;
  const aoNome = (n) => `${quadro[n]?.fem ? 'à' : 'ao'} ${n}`;
  const deNome = (n) => (quadro[n]?.fem ? 'da' : 'do');

  // O acerto de contas entre os adultos da casa. O valor devido é uma soma de
  // movimentos, como manda o invariante 2: o que estava escrito era
  // `settled: true` mais o montante somado a `paidPts['Tomás']` — um campo
  // booleano que dois telefones se anulavam a escrever, e euros arrumados no
  // livro dos pontos das crianças, que o fecho do mês limpava.
  //
  // Quem deve a quem sai da ordem dos adultos da casa e não de dois nomes.
  // Numa casa de um adulto não há nada a acertar, e a secção não aparece.
  // ⚠ A BASE vem das despesas partilhadas, e não de uma constante.
  //
  // Era `s.clearedSeeds ? 0 : ACERTO_INICIAL` — 86,50 €, um número da
  // demonstração. Numa casa a sério `clearedSeeds` é verdadeiro, logo a base era
  // ZERO e o «Contas entre Nós» dizia «Está tudo acertado» por mais desigual que
  // fosse quem pagou o quê. A secção estava morta e parecia viva.
  //
  // Com servidor, o `partilhado` diz quanto cada adulto pagou das despesas
  // marcadas «a meias» DESTE mês. Quem pagou a mais tem a receber metade da
  // diferença — é a fórmula da vista `v_acerto_saldo`, que o esquema tem desde o
  // primeiro dia e o cliente nunca usou.
  //
  // Sem servidor, fica o número da demonstração, que é o que a demonstração
  // precisa para mostrar a secção.
  const partilhasPagas = s.partilhasPagas || {};
  const temPartilhas = adultos.some(n => partilhasPagas[n] !== undefined);

  const acerto = (() => {
    if (adultos.length < 2) return null;
    let credor = adultos[0];
    let devedor = adultos[1];
    let base = s.clearedSeeds ? 0 : ACERTO_INICIAL;

    if (temPartilhas) {
      const a = partilhasPagas[adultos[0]] || 0;
      const b = partilhasPagas[adultos[1]] || 0;
      // Quem pagou MAIS é o credor. Metade da diferença é o que falta acertar.
      if (b > a) { credor = adultos[1]; devedor = adultos[0]; }
      base = Math.round(Math.abs(a - b) / 2 * 100) / 100;
    }

    // ⚠ Os pagamentos contam com DIREÇÃO. Somar todos os movimentos dava o
    // mesmo resultado a um pagamento do Tomás para a Rita e a um da Rita para o
    // Tomás — que se anulam, não se somam. Os movimentos antigos, sem `de` nem
    // `para`, contam como antes: são da demonstração local.
    const pago = (s.acertoMovs || []).reduce((soma, m) => {
      if (!m.de && !m.para) return soma + (m.valor || 0);
      if (m.de === devedor && m.para === credor) return soma + (m.valor || 0);
      if (m.de === credor && m.para === devedor) return soma - (m.valor || 0);
      return soma;
    }, 0);

    return { devedor, credor, base, pago, valor: Math.max(0, Math.round((base - pago) * 100) / 100) };
  })();
  const acertado = !acerto || acerto.valor === 0;

  // Traduzir um nome local para o identificador do servidor. Devolve null
  // quando a app corre local — e é isso que faz as escritas não acontecerem
  // em vez de rebentarem.
  const idDoMembro = (nome) => mapaServidor.current.membros[nome] || null;
  const idDoEnvelope = (nome) => mapaServidor.current.envelopes[nome] || null;
  const isRecurring = (t) => t.recur === 'Todos os dias' || t.recur === 'Dias de semana';

  // As trocas de tarefas de HOJE, e só essas: uma troca vale para o dia, e à
  // meia-noite acabou — a de ontem não desfaz nada porque nunca escreveu nada.
  const trocasDeHojeEm = (x) => (x.trocas || []).filter(tr => tr.dia === TODAY_KEY);
  const trocasAceitesDeHoje = (x) => trocasDeHojeEm(x).filter(tr => !!tr.aceiteEm);

  const allTasks = () => {
    const base = [...(s.clearedSeeds ? [] : TASKS), ...s.newTasks]
      .filter(t => !s.taskGone[t.id])
      .map(t => ({ ...t, ...(s.taskEdits[t.id] || {}) }))
      .map(t => ({
        ...t,
        // A rotação passa a tarefa à criança seguinte da casa, seja qual for
        // o tamanho da família. Estava a escolher entre dois nomes fixos.
        who: s.rotate[t.id] && criancas.includes(t.who)
          ? criancas[(criancas.indexOf(t.who) + 1) % criancas.length] : t.who,
        urgency: s.urg[t.id] ?? 1,
        dueKey: (s.due[t.id] || {}).key,
        dueTime: (s.due[t.id] || {}).time,
      }));

    // ── A troca de hoje, aceite: a tarefa fica com quem a troca diz ─────────
    //
    // «O lixo pelas plantas, só hoje» (12/09/2026). É DERIVADO, como a
    // rotação: a linha da troca existe, a tarefa não muda, e amanhã cada uma
    // volta a quem era sem ninguém desfazer nada. `trocadaCom` guarda o dono
    // de hoje-não-fosse-a-troca, para a linha dizer «Troca com o Léo · só hoje».
    const donoDe = Object.fromEntries(base.map(t => [t.id, t.who]));
    const trocadas = {};
    for (const tr of trocasAceitesDeHoje(s)) {
      if (!(tr.de in donoDe) || !(tr.para in donoDe)) continue;
      trocadas[tr.de] = donoDe[tr.para];
      trocadas[tr.para] = donoDe[tr.de];
    }
    const comTroca = Object.keys(trocadas).length
      ? base.map(t => (trocadas[t.id] !== undefined && trocadas[t.id] !== t.who
        ? { ...t, trocadaCom: t.who, who: trocadas[t.id] } : t))
      : base;
    // Ordem: a urgência manda nos grupos (INVARIANTE #6) e, DENTRO de cada
    // grupo, manda o PRAZO — quem acaba primeiro aparece primeiro.
    //
    // ⚠ Dentro do grupo a ordem era a de criação. Isso punha uma tarefa que
    // acaba hoje abaixo de uma que acaba na semana que vem, só por ter sido
    // escrita depois — e o cabeçalho da secção diz «por urgência», o que dava
    // a entender que dentro do grupo a ordem era alguma coisa.
    //
    // Duas decisões que a ordenação por prazo obriga a tomar:
    //
    //   sem prazo         vem DEPOIS de quem tem. Uma tarefa com data marcada
    //                     pesa mais do que uma que pode ser feita a qualquer
    //                     momento. O '￿' põe-na no fim sem um caso à parte.
    //   dia sem hora      vem depois das que têm hora nesse dia. Uma tarefa
    //                     «para o dia 20» acaba ao fim do dia 20, portanto
    //                     depois da que acaba às 18:00 do dia 20.
    //
    // Empatados, fica a ordem de criação — que é a que a lista já tinha, e é
    // estável, o que impede a lista de saltar sozinha entre desenhos.
    const prazo = (t) => (t.dueKey ? t.dueKey + ' ' + (t.dueTime || '99:99') : '￿');

    // O posto que a MÃO deu à tarefa, ao arrastá-la. Só existe para as que
    // foram arrastadas; as outras não têm posto e vêm depois, pelo prazo.
    //
    // ⚠ `Infinity - Infinity` é `NaN`, e um comparador que devolve NaN deixa a
    // ordenação por conta do motor — a lista sai numa ordem qualquer. Duas sem
    // posto empatam, e o empate resolve-se no critério seguinte.
    const posto = (t) => {
      const n = (s.taskOrder || {})[t.id];
      return typeof n === 'number' ? n : Infinity;
    };
    const porPosto = (a, b) => {
      const x = posto(a), y = posto(b);
      return x === y ? 0 : x - y;
    };

    return comTroca
      .map((t, i) => ({ ...t, _criacao: i }))
      .sort((a, b) => a.urgency - b.urgency
        || porPosto(a, b)
        || (prazo(a) < prazo(b) ? -1 : prazo(a) > prazo(b) ? 1 : 0)
        || a._criacao - b._criacao)
      .map(({ _criacao, ...t }) => t);
  };

  // Arrastar uma tarefa: a mão manda DENTRO do grupo de urgência.
  //
  // Recebe os identificadores das tarefas de UM grupo, na ordem que a mão lhes
  // deu, e escreve o posto de cada uma. A urgência continua a decidir o grupo
  // (INVARIANTE #6); o posto decide dentro dele.
  //
  // Devolve null quando corre bem e uma frase em português quando não, como o
  // `renomearMembro`.
  const reordenarTarefas = (ids) => {
    const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
    if (lista.length < 2) return null;                  // nada a reordenar
    if (new Set(lista).size !== lista.length) return 'A mesma tarefa aparece duas vezes na ordem.';

    const todas = allTasks();
    const porId = new Map(todas.map(t => [t.id, t]));
    if (lista.some(id => !porId.has(id))) return 'Essa tarefa não existe nesta casa.';

    const urgs = new Set(lista.map(id => porId.get(id).urgency));
    if (urgs.size > 1) return 'A ordem só se muda dentro do mesmo grupo de urgência.';
    const urg = [...urgs][0];

    // ⚠ A vista pode estar filtrada por membro, e então `lista` é um
    // SUBCONJUNTO do grupo. Escrever postos só ao subconjunto deixava metade do
    // grupo sem posto — e essa metade saltava para o fim assim que o filtro
    // saísse. Em vez disso percorre-se o grupo INTEIRO e, em cada lugar que era
    // de uma das arrastadas, entra a seguinte da ordem nova. Quem não estava à
    // vista fica onde estava.
    const grupo = todas.filter(t => t.urgency === urg).map(t => t.id);
    const fila = [...lista];
    const nova = grupo.map(id => (lista.includes(id) ? fila.shift() : id));

    // ⚠ Os postos contam de UM, dos dois lados. No servidor é obrigatório —
    // um campo `number` não é anulável, e o zero é que faz de «sem posto» —, e
    // aqui é para os dois mapas terem os mesmos números: com a loja a contar de
    // zero e o servidor de um, a lista mudava de ordem na primeira leitura.
    set(x => ({
      taskOrder: {
        ...(x.taskOrder || {}),
        ...Object.fromEntries(nova.map((id, i) => [id, i + 1])),
      },
    }));

    // ⚠ E vai para o servidor, porque a ordem é da CASA. Até 05/09/2026 ficava
    // só aqui: a Rita arrastava «Levar o lixo» para cima e o Tomás continuava a
    // vê-la em terceiro — os dois a falar da «primeira tarefa» a pensar em
    // tarefas diferentes.
    //
    // Escreve-se o grupo INTEIRO, e não só as arrastadas: os postos são
    // relativos, e mexer numa muda o lugar de todas as que estão abaixo.
    // Escrever só as que a mão tocou deixava as outras com o posto de antes, e
    // dois números iguais no mesmo grupo desempatam-se pelo prazo — a lista
    // saltava sozinha na leitura seguinte.
    if (sync) {
      nova.forEach((id, i) => {
        const noServidor = tarefaNoServidor(id);
        if (noServidor) sync.alterarTarefa(noServidor, { posto: i + 1 }).catch(() => {});
      });
    }
    return null;
  };

  // ── Os artigos da lista de compras ──────────────────────────────────────
  //
  // ⚠ As alterações vivem num mapa `itemEdits`, e não escritas por cima do
  // artigo: uma SEMENTE do `data.js` não se pode alterar — é uma constante do
  // módulo. É a mesma forma do `taskEdits` e do `equipEdits`, e pela mesma
  // razão.
  //
  // ⚠ E a ordem DENTRO do corredor é a que a mão deu, pelo `itemOrder`. Sem
  // posto, o artigo ordena-se pela ordem de criação — que é a que a lista já
  // tinha, é estável, e impede a lista de saltar sozinha entre desenhos.
  //
  // `Infinity - Infinity` é `NaN`, e um comparador que devolve NaN deixa a
  // ordenação por conta do motor: a lista sai numa ordem qualquer. Dois sem
  // posto EMPATAM, e o empate resolve-se no critério seguinte. Custou uma
  // lista de tarefas a saltar sozinha para eu escrever isto duas vezes.
  const postoDoArtigo = (i) => {
    const n = (s.itemOrder || {})[i.id];
    return typeof n === 'number' ? n : Infinity;
  };
  const allItems = () => [...(s.clearedSeeds ? [] : ITEMS), ...s.newItems]
    .filter(i => !s.itemGone[i.id])
    .map(i => ({ ...i, ...((s.itemEdits || {})[i.id] || {}) }))
    .map((i, ordem) => ({ ...i, _criacao: ordem }))
    .sort((a, b) => {
      const x = postoDoArtigo(a), y = postoDoArtigo(b);
      return (x === y ? 0 : x - y) || a._criacao - b._criacao;
    })
    .map(({ _criacao, ...i }) => i);

  // Apagar um artigo da lista de compras.
  //
  // O `itemGone` estava no estado e neste filtro desde sempre, e nada o
  // escrevia — o mesmo andaime sem obra que as tarefas tinham. Um artigo posto
  // por engano ficava na lista até alguém fechar a conta com ele dentro.
  //
  // ── O que sai, e o que fica ────────────────────────────────────────────
  //
  // Saem o artigo e os rascunhos DESTA ida às compras: se está apanhado, e o
  // preço que se escreveu na loja.
  //
  // ⚠ FICA o histórico de preços. É o que a casa aprendeu sobre quanto custa
  // uma coisa e onde — o mesmo princípio dos pontos de uma tarefa apagada: um
  // artigo sai da lista, não se desaprende o que ele custou. Aqui nem é
  // preciso cuidado nenhum: o `precos` é indexado pelo RÓTULO do artigo e não
  // pelo id, portanto apagar por id nunca lhe toca. Está dito porque a
  // próxima pessoa a mexer nisto não tem como saber.
  const removerArtigo = (id) => {
    // ⚠ O `id` do servidor lê-se ANTES do `set` — depois dele o artigo já não
    // está na lista, e não há de onde o tirar. É a mesma armadilha do
    // `removerTarefa`.
    const noServidor = artigoNoServidor(id);
    if (sync && noServidor) sync.apagarArtigo(noServidor).catch(() => {});
    return removerArtigoLocal(id);
  };

  const removerArtigoLocal = (id) => set(x => {
    const a = allItems().find(i => i.id === id);
    if (!a) return {};

    const daApp = (x.newItems || []).some(i => i.id === id);
    const fora = (m) => { const { [id]: _, ...resto } = m || {}; return resto; };

    return {
      newItems: daApp ? x.newItems.filter(i => i.id !== id) : x.newItems,
      itemGone: daApp ? x.itemGone : { ...x.itemGone, [id]: true },
      status: fora(x.status), precoPago: fora(x.precoPago),
      registo: maisRegisto(x, `«${a.label}» saiu da lista de compras`, 'Compras'),
    };
  });
  const allEvents = () => [...(s.clearedSeeds ? [] : EVENTS), ...s.added, ...s.health.map(h => h.event).filter(Boolean)]
    .filter(e => e && !s.eventGone[e.id])
    .map(e => ({ ...e, ...(s.eventEdits[e.id] || {}) }));
  // Como allTasks: sementes do código, sobrepostas pelas edições do utilizador.
  // As sementes são só de leitura, por isso editar é gravar um remendo.
  const allEquip = () => [...(s.clearedSeeds ? [] : EQUIP), ...s.newEquip]
    .filter(e => !s.equipGone[e.id])
    .map(e => ({ ...e, ...((s.equipEdits || {})[e.id] || {}) }));
  const equipNoServidor = (id) =>
    (allEquip().find(e => e.id === id) || {}).idServidor || null;

  // ── Criar um equipamento ────────────────────────────────────────────────
  //
  // Isto vivia dentro do ecrã, que escrevia direto no `set`. A coleção
  // `equipamentos` existia no servidor desde o início e ninguém escrevia nela:
  // a garantia da máquina de lavar era conhecida de um telefone só.
  //
  // As fotografias (`fatura`, `foto`) vão à parte, no `editEquip`, pelo
  // `fotografiaDoEquipamento` — um `update` com ficheiro, como o documento do
  // contrato: a fila serializa em JSON, e um ficheiro não é JSON.
  const FOTOS_DO_EQUIPAMENTO = ['fatura', 'foto'];
  const criarEquipamento = ({ name, cat, bought, warrantyEnd, shop, price, maint, maintDate }) => {
    const nome = String(name || '').trim();
    if (!nome) return null;
    const id = 'eq-' + Date.now();
    set(x => ({
      newEquip: [...(x.newEquip || []), {
        id, name: nome, cat, bought, warrantyEnd,
        ...(shop ? { shop } : {}), ...(price ? { price } : {}),
        ...(maint ? { maint } : {}), ...(maintDate ? { maintDate } : {}),
      }],
      registo: maisRegisto(x, `Equipamento «${nome}» acrescentado`, 'Equipamentos'),
    }));

    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.equipamentoDaCasa({
        casa: ses.casa, nome, categoria: cat, compradoEm: bought,
        loja: shop, preco: price, garantiaAte: warrantyEnd,
        manutencao: maint, manutencaoAte: maintDate,
      })
        .then((r) => { if (r && r.id) set(x => ({
          newEquip: (x.newEquip || []).map(e => (e.id === id ? { ...e, idServidor: r.id } : e)),
        })); })
        .catch(() => {});
    }
    return id;
  };

  // Um remendo local a UM campo do equipamento (as fotografias e o «por subir»).
  const remendarEquip = (id, campos) => set(x => ({
    equipEdits: { ...(x.equipEdits || {}), [id]: { ...((x.equipEdits || {})[id] || {}), ...campos } },
  }));

  const editEquip = (id, campos) => {
    // ⚠ As fotografias (13/09/2026): ficam no aparelho PRIMEIRO, marcadas «por
    // subir», e sobem à parte — a fila serializa em JSON e um ficheiro não é
    // JSON. Quando o servidor responde, o `blob:`/`file://` local dá lugar ao
    // URL dele, que é o único que serve ao outro telemóvel e sobrevive a
    // recarregar a página. Escolhiam-se e nunca subiam: a fatura fotografada
    // ficava num telemóvel só, e na web morria ao recarregar.
    const fotos = FOTOS_DO_EQUIPAMENTO.filter(c => campos[c] !== undefined);
    const porSubir = Object.fromEntries(fotos.map(c => [`${c}PorSubir`, !!campos[c]]));
    remendarEquip(id, { ...campos, ...porSubir });
    const noServidor = equipNoServidor(id);
    if (sync && noServidor) {
      for (const c of fotos) {
        if (!campos[c]) continue;
        sync.fotografiaDoEquipamento(noServidor, c, { uri: campos[c], nome: `${c}.jpg`, mime: 'image/jpeg' })
          .then((r) => { if (r && r.url) remendarEquip(id, { [c]: r.url, [`${c}PorSubir`]: false }); })
          .catch(() => {});   // fica «por subir», e a ficha di-lo
      }
    }
    const texto = Object.fromEntries(Object.entries(campos).filter(([k]) => !FOTOS_DO_EQUIPAMENTO.includes(k)));
    if (!Object.keys(texto).length) return;
    if (sync && noServidor) sync.alterarEquipamento(noServidor, {
      ...(campos.name !== undefined ? { nome: campos.name } : {}),
      ...(campos.cat !== undefined ? { categoria: campos.cat } : {}),
      ...(campos.bought !== undefined ? { compradoEm: campos.bought } : {}),
      ...(campos.shop !== undefined ? { loja: campos.shop } : {}),
      ...(campos.price !== undefined ? { preco: campos.price } : {}),
      ...(campos.warrantyEnd !== undefined ? { garantiaAte: campos.warrantyEnd } : {}),
      ...(campos.maint !== undefined ? { manutencao: campos.maint } : {}),
      ...(campos.maintDate !== undefined ? { manutencaoAte: campos.maintDate } : {}),
    }).catch(() => {});
  };

  // ⚠ O `id` do servidor lê-se ANTES do `set`, como no `removerTarefa` e no
  // `removerArtigo`. É a terceira vez que a mesma armadilha aparece.
  const removeEquip = (id) => {
    const noServidor = equipNoServidor(id);
    if (sync && noServidor) sync.apagarEquipamento(noServidor).catch(() => {});
    set(x => ({ equipGone: { ...x.equipGone, [id]: true } }));
  };

  // ⚠ A lista dos envelopes vem do SERVIDOR quando há um. Eram sementes no
  // código (`ENV_BASE`) e mais nada: a lista da casa não existia em lado
  // nenhum, e «criar um envelope» era acrescentar uma chave a um mapa de
  // limites — que o `map` abaixo nem sequer via.
  //
  // Sem servidor, as sementes ficam: a app tem de correr sem rede, e corria
  // assim antes de haver servidor.
  // ⚠ O `used` que a linha TRAZ, e não zero (15/09/2026).
  //
  // Era `{ ...e, used: 0 }`. Numa casa sem servidor o gasto de cada envelope
  // vive nas sementes, e a lista da casa só passa a existir quando alguém
  // mexe nos envelopes — criar, renomear ou apagar um materializava as
  // sementes SEM o `used` e punha o «Gasto até agora» da casa inteira a zero:
  // 1 387,00 € a desaparecer e o «Disponível» a subir outro tanto, por se ter
  // criado um envelope chamado «Férias». Com servidor o número vinha certo na
  // leitura seguinte e por isso passou despercebido.
  // ⚠ E a bandeira, não o comprimento: a casa que apagou todos tem zero.
  const baseDeEnvelopes = (s.envelopesProprios || (s.envelopesDaCasa || []).length)
    ? (s.envelopesDaCasa || []).map(e => ({ ...e, used: e.used || 0 }))
    : ENV_BASE;

  // ⚠ O gasto de cada envelope é o DELE, e não o do mês inteiro.
  //
  // Era `e.name === 'Mercearia' ? s.registered : 0`: o total do mês despejado
  // na Mercearia e zero em todos os outros. Funcionava na demonstração, onde as
  // únicas despesas eram compras. Com despesas a sério, a Mercearia aparecia a
  // 1 248,64 € de um limite de 590 — «Restam −658,64 €» — e o condomínio, a luz
  // e a água ficavam num «Casa & contas 0,00 €».
  //
  // Sem servidor não há repartição nenhuma para fazer, e fica o comportamento
  // de sempre: as sementes trazem o `used` delas.
  const gastoNoEnvelope = s.gastoPorEnvelope || {};
  const temGastoDoServidor = Object.keys(gastoNoEnvelope).length > 0;

  // ⚠ E sem servidor, o gasto de cada envelope é o DELE também.
  //
  // Isto era `(e.name === 'Mercearia' ? s.registered : 0)`: o contador local
  // inteiro despejado na Mercearia, e zero nos outros cinco. Sem servidor —
  // que é como a app corre por omissão — registar uma despesa em «Casa &
  // contas» não movia nada em ecrã nenhum. Medido: nem o envelope, nem o
  // «Gasto», nem o «Disponível».
  //
  // O `gastoLocal` é a mesma coisa que o `gastoPorEnvelope` do servidor —
  // envelope → soma do mês — do lado de cá. Duas chaves porque significam
  // coisas diferentes: uma é a verdade do servidor, a outra é o que ainda não
  // passou por ele. Escrever nas duas era a classe de defeito das duas fontes.
  //
  // ⚠ E SOMA-SE ao do servidor, não é uma alternativa a ele.
  //
  // A primeira correcção pôs o `gastoLocal` só no ramo de baixo, e ficou a meio
  // pela pior das razões: o caso comum não é «nunca houve servidor», é «houve e
  // agora não há». Nesse, o `gastoPorEnvelope` está cheio de números de ontem,
  // o `temGastoDoServidor` é verdadeiro, e uma despesa registada hoje voltava a
  // ser invisível — corrigida a causa, o sintoma ficou igual. Visto no
  // navegador: `gastoLocal: {"Casa & contas": 15}` gravado, e o ecrã a dizer
  // 357,69 € como antes.
  //
  // A soma não conta duas vezes porque o `gastoLocal` se esvazia na leitura que
  // traz o `gastoPorEnvelope` — ver o `puxarCasa`. O que ainda estiver na fila
  // deixa de aparecer até chegar lá, e isso é uma falta de um instante em vez
  // de um número errado para sempre.
  const gastoLocal = s.gastoLocal || {};

  // O orçamento por mês ou para o ano (`src/orcamento.js`). Em modo anual o
  // limite de cada envelope — o do mês médio — multiplica-se pelo peso do mês
  // corrente; em modo mensal o fator é 1 e isto não faz nada. O fator aplica-se
  // ANTES das transferências: mover dinheiro entre envelopes é euros, não peso.
  const orcamentoDaCasa = normalizarOrcamento(s.orcamento);
  const mesCorrente = new Date().getMonth();
  const fatorDoMesCorrente = fatorDoMes(orcamentoDaCasa, mesCorrente);
  const rendimentoDoMes = rendimentoDoMesDe(orcamentoDaCasa, mesCorrente, s.rendimento);
  const arredonda2 = (v) => Math.round(v * 100) / 100;

  const envelopes = baseDeEnvelopes.map(e => ({
    ...e,
    used: (temGastoDoServidor
      ? (gastoNoEnvelope[e.name] || 0)
      : (s.monthZero ? 0 : e.used)) + (gastoLocal[e.name] || 0),
    limit: arredonda2((s.monthLimits && s.monthLimits[e.name] !== undefined
      ? s.monthLimits[e.name] : e.limit) * fatorDoMesCorrente) + (s.envMove[e.name] || 0),
  }));

  // O gasto é a soma dos envelopes, nunca um número à parte. Estava escrito à
  // mão como 1687,40, e os envelopes somam 1387,00 — 300,40 € de diferença.
  // O «Disponível» dava 82,60 € onde a referência mostra 383,00 €, e como o
  // cabeçalho do Início mostra esse número, a app dizia-o errado em todo o
  // lado. É o INVARIANTE #2 noutra roupagem: um total que devia ser uma soma
  // foi escrito, e divergiu da coisa que devia resumir.
  const spent = envelopes.reduce((a, e) => a + e.used, 0);

  // ⚠ E o ORÇAMENTO é a soma dos MESMOS envelopes — a lição de cima, que eu
  // apliquei ao gasto e não ao total que ele se compara.
  //
  // Era `Object.values(s.monthLimits).reduce(...)`: uma segunda fonte para a
  // mesma coisa, ao lado da lista que o ecrã mostra. Divergiam no uso normal,
  // e sem dizer nada:
  //
  //   apagar   um envelope saía da lista e o limite dele FICAVA no
  //            `monthLimits` — o orçamento continuava a contá-lo, e o
  //            «Disponível» do Início ficava alto para sempre.
  //   renomear a lista mudava de nome e o mapa não: o orçamento passava a
  //            contar um envelope que já não existe.
  //   o limite mudava no servidor e não no mapa, e o orçamento só se mexia na
  //            leitura seguinte.
  //
  // E `{}` é VERDADEIRO em JavaScript: com o mapa vazio, o ramo das sementes
  // nunca corria e o orçamento dava ZERO com quatro envelopes na lista — que
  // foi como isto se viu.
  //
  // O `monthLimits` passa a ser só o que sempre devia ter sido: o AJUSTE deste
  // mês a um envelope, que o `limit` acima já aplica. Deixa de ser uma segunda
  // cópia do conjunto todo.
  const budget = envelopes.reduce((a, e) => a + e.limit, 0);

  // ── Há um mês aberto? ─────────────────────────────────────────────────────
  //
  // ⚠ A resposta NÃO é `!s.monthZero`, e foi o primeiro sítio a perguntá-lo que
  // me ensinou isso: o cartão do mês na Gestão dizia «Sem mês aberto» numa casa
  // com 1 248,64 € já gastos e a linha de `meses` aberta no servidor desde
  // 01/09, com o botão de fechar desactivado.
  //
  // O `monthZero` é a bandeira LOCAL de quem nunca abriu um mês NESTE
  // dispositivo. Numa casa ligada fica a `true` para sempre: o mês veio do
  // servidor, o `abrirMes` nunca correu aqui, e nada a limpa. Quem responde é o
  // `s.mes` — a linha sem `fechado_em` —, e o `monthZero` é a reserva de quem
  // corre sem servidor, como a app sempre correu.
  //
  // Vive aqui, e não no ecrã: já é a mesma pergunta em dois sítios (o cartão, e
  // o `used` dos envelopes acima), e um facto derivado escrito duas vezes é a
  // classe de defeito que já pôs o orçamento a divergir da lista.
  const mesAberto = s.mes ? true : !s.monthZero;
  // Desde quando, para quem quiser dizê-lo. `null` quando o mês é local: sem
  // servidor não há data de abertura gravada em sítio nenhum.
  const mesAbertoDesde = (s.mes || {}).inicio || null;

  // ⚠ Com o quadro DESTA casa, e não com a família do `data.js`.
  const canSeeHealth = (member, viewer) => podeVerSaude(member, viewer, quadro);

  const allHealth = () => [...(s.clearedSeeds ? [] : HEALTH), ...(s.health || [])]
    .filter(h => !(s.healthGone || {})[h.id]);
  const healthOf = (member, viewer) => (canSeeHealth(member, viewer)
    ? allHealth().filter(h => h.member === member).sort((a, b) => (b.day || '').localeCompare(a.day || ''))
    : []);
  const allHealthDocs = () => [...(s.clearedSeeds ? [] : HEALTH_DOCS), ...(s.healthDocs || [])];
  // Os documentos de UMA consulta. O  é a origem, e é o que o
  // TAREFAS.md chama «nenhum exame órfão».
  const docsDaConsulta = (healthId) => allHealthDocs().filter(d => d.healthId === healthId);
  const estaArquivada = (healthId) => !!(s.healthArchived || {})[healthId];
  const docsOf = (member, viewer) => (canSeeHealth(member, viewer)
    ? allHealthDocs().filter(d => d.member === member)
    : []);
  // A próxima consulta a contar de hoje, ou nada se já passaram todas.
  const nextHealth = (member, viewer) => healthOf(member, viewer)
    .filter(h => h.day >= TODAY_KEY)
    .sort((a, b) => a.day.localeCompare(b.day))[0] || null;

  // ── O que precisa de atenção no Início ───────────────────────────────────
  // As três listas que faltavam ao «Precisa de Si». As duas de saúde passam
  // por canSeeHealth como todo o resto: a Rita não vê as receitas nem as
  // consultas do Tomás no ecrã dela (INVARIANTE #3). Não é uma decisão de
  // interface — a lista nem sequer as contém.
  const garantiasAExpirar = () => allEquip()
    .map(e => ({ ...e, dias: warrantyDaysLeft(e) }))
    .filter(e => e.dias >= 0 && e.dias <= 90)
    .sort((a, b) => a.dias - b.dias);

  const receitasAExpirar = (viewer) => receitasAExpirarDe(allHealthDocs(), viewer, 30, quadro);
  const consultasProximas = (viewer) => consultasProximasDe(allHealth(), viewer);

  // Saldo do cofre: soma, nunca leitura de um campo (INVARIANTE #2).
  // Sementes do código + o que o utilizador acrescentou, como em allTasks.
  const allVaultMoves = () => [...(s.clearedSeeds ? [] : VAULT), ...(s.vaultMoves || [])];
  const vaultMoves = (kid) => allVaultMoves()
    .filter(m => m.kid === kid)
    .sort((a, b) => (b.day || '').localeCompare(a.day || ''));
  const vaultOf = (kid) => allVaultMoves()
    .reduce((n, m) => (m.kid === kid ? n + m.delta : n), 0);
  // Pagar parte ou a totalidade do acerto. Um movimento, somado — nunca
  // `settled = true`. Dois telefones a acertar metade cada um dão a conta
  // saldada; a escrita de um booleano dava metade paga e a dívida fechada.
  const pagarAcerto = (valor, nota, de, para) => {
    const v = Math.round(Number(valor) * 100) / 100;
    if (!(v > 0)) return;
    set(x => ({
      acertoMovs: [...(x.acertoMovs || []), { valor: v, data: TODAY_KEY, nota: nota || '' }],
      // ⚠ E no registo (15/09/2026): é dinheiro que passa de uma pessoa para a
      // outra, e era a operação com mais razão para deixar rasto de todas.
      registo: maisRegisto(x, `Acerto de contas: ${EUR(v)}${de && para ? ` de ${de} para ${para}` : ''}${nota ? ` · ${nota}` : ''}`, 'Dinheiro'),
    }));

    // ⚠ E sobe. O `sync.acerto` existia e ninguém o chamava: o acerto entre os
    // dois adultos ficava no telefone de quem carregou no botão, e o outro
    // continuava a ver a dívida por pagar. É dinheiro entre duas pessoas — o
    // sítio onde discordar dói mais.
    if (sync) {
      const ses = sync.sessao();
      const idDe = idDoMembro(de);
      const idPara = idDoMembro(para);
      if (ses && idDe && idPara) sync.acerto({
        casa: ses.casa, de: idDe, para: idPara, valor: v,
        data: TODAY_KEY.replace(/^d/, ''),
      }).catch(() => {});
    }
  };

  // Acrescenta um movimento. Nunca substitui o saldo.
  //
  // Vai também para o servidor, como inserção com chave de idempotência. É
  // aqui que o INVARIANTE #2 deixa de ser uma regra local e passa a valer
  // entre telemóveis: se cada um gravasse «saldo = X», dois créditos de 5 €
  // dariam 5. Assim dão 10. A escrita passa por uma fila, portanto sem rede
  // fica pendente em vez de se perder, e a chave impede que reenviar a fila
  // pague a semanada duas vezes.
  // ⚠ O `pontos` é quantos pontos ESTE movimento pagou, e não é decoração: é
  // dele que sai o `paidPts` dos dois telefones. Ver o comentário do campo em
  // `criar-colecoes.mjs`. Um bónus ou uma retirada passam zero.
  const vaultAdd = (kid, delta, kind, label, sub, day = TODAY_KEY, pontos = 0) => {
    set(x => ({
      vaultMoves: [...(x.vaultMoves || []), {
        id: 'vm-' + Date.now() + '-' + Math.round(Math.random() * 1e6),
        kid, delta, kind, label, sub, day, pontos,
      }],
      // Sem servidor o `paidPts` continua a somar-se aqui, porque não há
      // segunda leitura que o refaça. Com servidor NÃO se escreve: a próxima
      // `puxarCasa` traz a soma, e escrevê-lo aqui era voltar a ter duas
      // versões do mesmo número — a local e a do servidor — a divergir.
      ...(comServidor() || !pontos ? {} : {
        paidPts: { ...x.paidPts, [kid]: (x.paidPts[kid] ?? 0) + pontos },
      }),
      // No registo da casa, dito por palavras: quem, quanto, e a troco de quê.
      registo: maisRegisto(x, kind === 'semanada'
        ? `Semanada de ${kid}: ${EUR(delta)}${pontos ? ` · ${plural(pontos, 'ponto', 'pontos')}` : ''}`
        : kind === 'bonus'
          ? `Bónus de ${EUR(delta)} para ${kid}`
          : `Retirada de ${EUR(Math.abs(delta))} do cofre de ${kid}`, 'Dinheiro'),
    }));
    // A fila guarda a escrita; falhar aqui não pode estragar o ecrã, que já
    // tem o movimento. Sem servidor, `sync` é null e isto não faz nada.
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.movimentoDeCofre({
        casa: ses.casa, membro: idDoMembro(kid), tipo: kind,
        valor: delta, motivo: label, data: day.replace(/^d/, ''),
        autorizadoPor: ses.membro, pontos,
      }).catch(() => {});
    }
  };

  // ── As metas da família ─────────────────────────────────────────────────
  //
  // Uma meta é um objetivo em EUROS: o nome, quanto se quer juntar, e para
  // quando. Nada de percentagens — a barra mostra o progresso, os números
  // dizem-se em euros.
  //
  // ⚠ O que está juntado é a SOMA dos movimentos (INVARIANTE #2). Havia um
  // `metas.atual` no servidor com a forma errada — um saldo escrito — e a
  // semente do `data.js` tinha um `at: 1920` igualmente escrito. Saíram os
  // dois: dois telemóveis a reforçar a meta das férias no mesmo dia não se
  // podem anular, e era exactamente isso que um total escrito fazia.
  //
  // A lista MATERIALIZA-SE antes de se lhe mexer, como os envelopes e os
  // corredores: enquanto ninguém tocar nas metas, a lista são as sementes.
  //
  // ⚠ E a bandeira é «a casa é DONA da lista», não «o servidor respondeu».
  // Escrita da segunda maneira — `metasDaCasa.length || metasProprias` —
  // apagar a ÚLTIMA meta punha a lista a zero, a condição do comprimento
  // falhava, e as duas metas da demonstração voltavam. Medido a apagar as duas
  // seguidas: a prova entrou em ciclo infinito e o Node ficou sem memória, que
  // é a versão barulhenta do que na app seria uma meta a ressuscitar sozinha.
  //
  // É a mesma armadilha do `monthZero` — uma bandeira cujo nome descreve como
  // ela ficou verdadeira em vez de descrever o que ela significa.
  const listaDeMetas = (x) => (x.metasProprias
    ? (x.metasDaCasa || [])
    : (x.clearedSeeds ? [] : GOALS.map(g => ({ ...g }))));

  const todosOsMetaMovs = (x) => [
    ...(x.clearedSeeds || x.metasProprias ? [] : META_MOVS),
    ...(x.metaMovs || []),
  ];

  // As metas como os ecrãs as leem: com o `at` somado dos movimentos.
  const metas = listaDeMetas(s).map(m => ({
    ...m,
    at: todosOsMetaMovs(s).reduce((n, mv) => (mv.meta === m.id ? n + mv.delta : n), 0),
  }));

  // Os movimentos de uma meta, do mais recente para o mais antigo — que é o que
  // permite ao ecrã dizer de onde vieram os 50 €.
  const movimentosDaMeta = (id) => todosOsMetaMovs(s)
    .filter(mv => mv.meta === id)
    .sort((a, b) => (b.day || '').localeCompare(a.day || ''));

  const metaNoServidor = (id) =>
    ((s.metasDaCasa || []).find(m => m.id === id) || {}).idServidor || null;

  // ── O objetivo do cofre de uma criança ──────────────────────────────────
  //
  // «Bicicleta, 120 €». Devolve `null` quando ficou, ou a frase do que falta.
  // O juntado é o `vaultOf(kid)` — nunca se escreve aqui (INVARIANTE #2). A
  // linha é da criança: ela define e muda a sua, e um adulto pode ajudá-la.
  const definirObjetivo = (kid, { nome, alvo } = {}) => {
    const n = String(nome || '').trim();
    if (!n) return 'Dê um nome ao objetivo.';
    const v = Math.round(Number(String(alvo).replace(',', '.')) * 100) / 100;
    if (!(v >= 0.01)) return 'Escreva quanto quer juntar, em euros.';
    if (v > 1000) return 'O máximo é 1 000 €.';
    set(x => ({
      objetivosCofre: { ...(x.objetivosCofre || {}), [kid]: { ...((x.objetivosCofre || {})[kid] || {}), nome: n, alvo: v } },
      registo: maisRegisto(x, `Objetivo do cofre ${DE(kid)} ${kid}: ${n} · ${EUR(v)}`, 'Dinheiro'),
    }));
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.definirObjetivoDoCofre({ casa: ses.casa, membro: idDoMembro(kid), nome: n, alvo: v })
        .then(r => { if (r && r.id) set(x => ({
          objetivosCofre: { ...(x.objetivosCofre || {}), [kid]: { ...((x.objetivosCofre || {})[kid] || {}), id: r.id } },
        })); })
        .catch(() => {});
    }
    return null;
  };

  const apagarObjetivo = (kid) => {
    const o = (s.objetivosCofre || {})[kid];
    if (!o) return;
    if (sync && o.id) sync.apagarObjetivoDoCofre(o.id).catch(() => {});
    set(x => {
      const { [kid]: fora, ...resto } = x.objetivosCofre || {};
      return { objetivosCofre: resto, registo: maisRegisto(x, `Objetivo do cofre ${DE(kid)} ${kid} retirado: ${o.nome}`, 'Dinheiro') };
    });
  };

  // ── A ementa da semana ──────────────────────────────────────────────────
  //
  // Um prato é um molde: nome e ingredientes `{ rotulo, s }`. Os artigos só
  // nascem quando se põe o prato na lista — pelo `criarArtigo`, como qualquer
  // outro, com `pedido_por` quem o pôs.
  const pratoNoServidor = (id) => ((s.pratos || []).find(p => p.id === id) || {}).idServidor || null;
  const normal = (txt) => String(txt || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // Devolve `{ id }` quando ficou, ou a frase do que falta.
  const criarPrato = (nome, ingredientes) => {
    const n = String(nome || '').trim();
    if (!n) return 'O prato precisa de um nome.';
    if ((s.pratos || []).some(p => normal(p.nome) === normal(n))) return 'Já existe um prato com esse nome.';
    const ing = (Array.isArray(ingredientes) ? ingredientes : [])
      .map(ig => ({ rotulo: String((ig && ig.rotulo) || '').trim(), s: (ig && ig.s) || null }))
      .filter(ig => ig.rotulo);
    if (!ing.length) return 'Escreva pelo menos um ingrediente.';
    const id = 'prato-' + Date.now();
    set(x => ({
      pratos: [...(x.pratos || []), { id, idServidor: null, nome: n, ingredientes: ing }],
      registo: maisRegisto(x, `Prato criado: ${n} · ${plural(ing.length, 'ingrediente', 'ingredientes')}`, 'Compras'),
    }));
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.pratoDaCasa({ casa: ses.casa, nome: n, ingredientes: ing })
        .then(r => { if (r && r.id) set(x => ({
          pratos: (x.pratos || []).map(p => (p.id === id ? { ...p, idServidor: r.id } : p)),
        })); })
        .catch(() => {});
    }
    return { id };
  };

  const alterarPrato = (id, campos = {}) => {
    const prato = (s.pratos || []).find(p => p.id === id);
    if (!prato) return 'Esse prato não existe nesta casa.';
    const mudanca = {};
    if (campos.nome !== undefined) {
      const n = String(campos.nome || '').trim();
      if (!n) return 'O prato precisa de um nome.';
      if ((s.pratos || []).some(p => p.id !== id && normal(p.nome) === normal(n))) return 'Já existe um prato com esse nome.';
      mudanca.nome = n;
    }
    if (campos.ingredientes !== undefined) {
      const ing = (Array.isArray(campos.ingredientes) ? campos.ingredientes : [])
        .map(ig => ({ rotulo: String((ig && ig.rotulo) || '').trim(), s: (ig && ig.s) || null }))
        .filter(ig => ig.rotulo);
      if (!ing.length) return 'Escreva pelo menos um ingrediente.';
      mudanca.ingredientes = ing;
    }
    set(x => ({ pratos: (x.pratos || []).map(p => (p.id === id ? { ...p, ...mudanca } : p)) }));
    if (sync && prato.idServidor) sync.alterarPrato(prato.idServidor, mudanca).catch(() => {});
    return null;
  };

  const apagarPrato = (id) => {
    const prato = (s.pratos || []).find(p => p.id === id);
    if (!prato) return;
    if (sync && prato.idServidor) sync.apagarPrato(prato.idServidor).catch(() => {});
    set(x => ({
      pratos: (x.pratos || []).filter(p => p.id !== id),
      // Os dias que o tinham ficam sem jantar — o servidor faz o mesmo em cascata.
      ementa: Object.fromEntries(Object.entries(x.ementa || {}).filter(([, pid]) => pid !== id)),
      registo: maisRegisto(x, `Prato apagado: ${prato.nome}`, 'Compras'),
    }));
  };

  // O jantar de um dia (chave `dAAAA-MM-DD`). `null` tira o jantar do dia.
  const marcarJantar = (dia, pratoId) => {
    if (!parseKey(dia)) return 'Esse dia não é uma data.';
    if (pratoId && !(s.pratos || []).some(p => p.id === pratoId)) return 'Esse prato não existe nesta casa.';
    set(x => {
      const { [dia]: fora, ...resto } = x.ementa || {};
      return { ementa: pratoId ? { ...resto, [dia]: pratoId } : resto };
    });
    if (sync) {
      const ses = sync.sessao();
      const noServidor = pratoId ? pratoNoServidor(pratoId) : null;
      // Um prato acabado de criar ainda pode não ter id no servidor: o dia
      // sobe na leitura seguinte da app, quando o prato já lá estiver.
      if (ses && (!pratoId || noServidor)) sync.jantarDoDia({ casa: ses.casa, dia, prato: noServidor }).catch(() => {});
    }
    return null;
  };

  // Que ingredientes do prato já estão na lista, e quais entram.
  const oQueFalta = (pratoId) => {
    const prato = (s.pratos || []).find(p => p.id === pratoId);
    if (!prato) return [];
    const naLista = new Set(allItems().map(a => normal(a.label)));
    return prato.ingredientes.map(ig => ({ ...ig, jaNaLista: naLista.has(normal(ig.rotulo)) }));
  };

  // Põe na lista os ingredientes que faltam — artigos normais, com quem os pôs.
  // Devolve quantos entraram.
  const porOQueFaltaNaLista = (pratoId, quem) => {
    const faltam = oQueFalta(pratoId).filter(ig => !ig.jaNaLista);
    for (const ig of faltam) {
      criarArtigo({ label: ig.rotulo, section: ig.s || seccoes[0], est: 0, staple: false, by: quem, vis: 'familia' });
    }
    return faltam.length;
  };

  // ── As contas fixas ─────────────────────────────────────────────────────
  //
  // A renda, a luz, a internet: o que se paga todos os meses no mesmo dia. A
  // conta é a DEFINIÇÃO; «paga este mês» é haver uma despesa deste mês a
  // apontar para ela (INVARIANTE #2 — um estado que se lê de linhas, nunca um
  // campo que se escreve). O mês é o do CALENDÁRIO, e não o mês aberto do
  // orçamento: uma conta que vence «dia 1» é do mês em que o dia 1 cai.
  //
  // 12/09/2026 — a quarta das dez funcionalidades.
  const mesDeHoje = () => `${TODAY.y}-${pad2(TODAY.m + 1)}`;
  const contaFixaPorId = (id) => (s.contasFixas || []).find(c => c.id === id) || null;

  // Em que dia vence num mês: o dia da conta, ou o último do mês quando ele
  // não existe — a conta do dia 31 vence a 28 de fevereiro, não a «31».
  const vencimentoNoMes = (dia, y = TODAY.y, m = TODAY.m) => {
    const ultimo = new Date(y, m + 1, 0).getDate();
    return dkey(y, m, Math.min(Math.max(1, Number(dia) || 1), ultimo));
  };

  // ⚠ Pelo id LOCAL ou pelo do servidor: uma conta criada neste telemóvel tem
  // `cf-…` cá e o id do servidor lá, e o pagamento que desce traz o segundo.
  const contaPagaNoMes = (c, mes = mesDeHoje()) => (s.contasPagas || [])
    .some(p => p.mes === mes && (p.conta === c.id || (c.idServidor && p.conta === c.idServidor)));

  // As contas como o ecrã as lê: com «paga», o vencimento deste mês e os dias
  // até lá. Por pagar primeiro, pelo dia; as pagas no fim.
  const contasDoMes = () => (s.contasFixas || [])
    .map(c => {
      const vence = vencimentoNoMes(c.dia);
      return { ...c, paga: contaPagaNoMes(c), vence, dias: daysUntil(vence) };
    })
    .sort((a, b) => (a.paga !== b.paga ? (a.paga ? 1 : -1)
      : (a.dia - b.dia) || String(a.nome).localeCompare(String(b.nome))));

  // O que vence dentro de `dias` e ainda não está pago — inclui o que já
  // passou. É a linha do «Precisa de Si».
  const contasAVencer = (dias = 2) => contasDoMes()
    .filter(c => !c.paga && c.dias <= dias)
    .sort((a, b) => a.dias - b.dias);

  const validarConta = ({ nome, valor, dia, envelope, quemPaga }, excepto = null) => {
    const n = String(nome || '').trim();
    if (!n) return 'Dê um nome à conta.';
    if ((s.contasFixas || []).some(c => c.id !== excepto && normal(c.nome) === normal(n))) return 'Já existe uma conta com esse nome.';
    const v = Math.round(Number(String(valor).replace(',', '.')) * 100) / 100;
    if (!(v >= 0.01)) return 'Escreva o valor da conta, em euros.';
    const d = Number(dia);
    if (!(Number.isInteger(d) && d >= 1 && d <= 31)) return 'O dia do mês vai de 1 a 31.';
    if (!envelopes.some(e => e.name === envelope)) return 'Escolha um envelope da casa.';
    if (quemPaga && !adultos.includes(quemPaga)) return 'Quem paga tem de ser um adulto da casa.';
    return { nome: n, valor: v, dia: d, envelope, quemPaga: quemPaga || null };
  };

  // Devolve `{ id }` quando ficou, ou a frase do que falta.
  const criarContaFixa = (campos) => {
    const ok = validarConta(campos);
    if (typeof ok === 'string') return ok;
    const id = 'cf-' + Date.now();
    set(x => ({
      contasFixas: [...(x.contasFixas || []), { id, idServidor: null, ...ok }],
      registo: maisRegisto(x, `Conta fixa criada: ${ok.nome} · ${EUR(ok.valor)} · dia ${ok.dia}`, 'Dinheiro'),
    }));
    if (sync) {
      const ses = sync.sessao();
      const idEnv = envelopeNoServidor(ok.envelope);
      // Sem envelopes do servidor a conta não tem onde entrar: a casa ainda
      // corre com as sementes, e fica local.
      if (ses && idEnv) sync.contaFixaDaCasa({
        casa: ses.casa, nome: ok.nome, valor: ok.valor, dia: ok.dia, envelope: idEnv,
        quemPaga: ok.quemPaga ? idDoMembro(ok.quemPaga) : null,
      })
        .then(r => { if (r && r.id) set(x => ({
          contasFixas: (x.contasFixas || []).map(c => (c.id === id ? { ...c, idServidor: r.id } : c)),
        })); })
        .catch(() => {});
    }
    return { id };
  };

  const alterarContaFixa = (id, campos = {}) => {
    const conta = contaFixaPorId(id);
    if (!conta) return 'Essa conta não existe nesta casa.';
    const ok = validarConta({ ...conta, ...campos }, id);
    if (typeof ok === 'string') return ok;
    set(x => ({ contasFixas: (x.contasFixas || []).map(c => (c.id === id ? { ...c, ...ok } : c)) }));
    if (sync && conta.idServidor) {
      const idEnv = envelopeNoServidor(ok.envelope);
      if (idEnv) sync.alterarContaFixa(conta.idServidor, {
        nome: ok.nome, valor: ok.valor, dia: ok.dia, envelope: idEnv,
        quemPaga: ok.quemPaga ? idDoMembro(ok.quemPaga) : null,
      }).catch(() => {});
    }
    return null;
  };

  // Apagar a conta não apaga o que já se pagou: as despesas ficam no envelope.
  const apagarContaFixa = (id) => {
    const conta = contaFixaPorId(id);
    if (!conta) return;
    if (sync && conta.idServidor) sync.apagarContaFixa(conta.idServidor).catch(() => {});
    set(x => ({
      contasFixas: (x.contasFixas || []).filter(c => c.id !== id),
      contasPagas: (x.contasPagas || []).filter(p => p.conta !== id && p.conta !== conta.idServidor),
      registo: maisRegisto(x, `Conta fixa apagada: ${conta.nome}`, 'Dinheiro'),
    }));
  };

  // Marcar como paga = registar a despesa da conta, no envelope dela, com quem
  // paga. É uma despesa NORMAL — entra no gasto, na conta entre os dois se a
  // casa divide, e sobe pela fila com a chave do mês. Devolve `null` quando
  // ficou, ou a frase do que impede.
  const pagarContaFixa = (id, quem) => {
    const c = contaFixaPorId(id);
    if (!c) return 'Essa conta não existe nesta casa.';
    const mes = mesDeHoje();
    if (contaPagaNoMes(c, mes)) return `«${c.nome}» já está paga este mês.`;
    const pagador = c.quemPaga || quem;
    if (!adultos.includes(pagador)) return 'Quem paga tem de ser um adulto da casa.';
    registarDespesa({
      envelope: c.envelope, valor: c.valor, descricao: c.nome, pagador,
      divideMeias: s.splitHalf !== false, contaFixa: c, mes,
    });
    set(x => ({
      contasPagas: [...(x.contasPagas || []), { conta: c.id, mes, dia: TODAY_KEY, valor: c.valor, por: pagador }],
    }));
    return null;
  };

  // As contas fixas na Agenda: uma linha por vencimento, este mês e o
  // seguinte. Não são eventos — não se editam nem se apagam — e só um adulto
  // as vê: é orçamento, e a criança não a recebe do servidor nem daqui
  // (INVARIANTE #3).
  const contasNaAgenda = (viewer) => {
    if (!quadro[viewer] || quadro[viewer].kid) return [];
    const meses = [[TODAY.y, TODAY.m], TODAY.m === 11 ? [TODAY.y + 1, 0] : [TODAY.y, TODAY.m + 1]];
    return (s.contasFixas || []).flatMap(c => meses.map(([y, m]) => {
      const mes = `${y}-${pad2(m + 1)}`;
      const paga = contaPagaNoMes(c, mes);
      return {
        id: `conta-fixa:${c.id}:${mes}`,
        day: vencimentoNoMes(c.dia, y, m),
        time: '',
        title: `${c.nome} · ${EUR(c.valor)}`,
        // ⚠ Quem paga, e não quem olha (26/09/2026). O `owner` era
        // `c.quemPaga || viewer`: uma conta fixa SEM pagador aparecia com a
        // cara de quem estivesse a ver, e por isso a MESMA conta tinha dono
        // diferente nos dois telemóveis — a Rita via-a dela e o Tomás via-a
        // dele. Um dado da casa que se lê de maneira diferente conforme quem
        // abre a app é a definição de ambíguo.
        //
        // Sem pagador, o dono é NINGUÉM: o campo é opcional e quer dizer «de
        // quem marcar» (ver `CamposContaFixa`). O `avatarDe` desenha isso como
        // a bola cinzenta com «?», e a linha ao lado di-lo por palavras — cor e
        // palavra, nunca só cor.
        //
        // ⚠ DUAS PARTES, e a segunda é o que o AVATAR NÃO consegue dizer.
        // Medido na Agenda, num telefone de 375: a linha tem 167 px e cabem
        // dois pedaços, nunca três. «Conta fixa · Casa & contas · paga» mede
        // 183 — ou seja, a linha JÁ CORTAVA antes de aqui se mexer, e o que
        // caía era o «paga». Escrevi primeiro três pedaços e o corte comeu
        // exactamente a palavra que eu lá tinha posto para explicar o «?».
        //
        //   sem pagador   →  «quem marcar»   (o «?» precisa de explicação)
        //   com pagador   →  o envelope      (o avatar já diz quem)
        //   paga          →  «paga»          (é essa a notícia)
        //
        // O envelope não se perde: está por extenso na lista do Dinheiro, que
        // é onde o orçamento se lê.
        who: `Conta fixa · ${paga ? 'paga' : (c.quemPaga ? c.envelope : 'quem marcar')}`,
        owner: c.quemPaga || null,
        visibilidade: 'adultos',
        contaFixa: c.id,
        paga,
      };
    }));
  };

  // ── Os contratos e as renovações ────────────────────────────────────────
  //
  // O seguro do carro, a internet, a inspeção: o que renova ou acaba num dia,
  // com fidelização e com quem trata. Vivem ao lado dos equipamentos e avisam
  // como as garantias — a 30 dias. O documento (a apólice, o contrato
  // assinado) fica no dispositivo PRIMEIRO e sobe à parte, porque a fila
  // serializa em JSON; `porSubir` diz a verdade sobre onde ele está, como o
  // anexo de saúde. 12/09/2026 — a quinta das dez funcionalidades.
  const contratoPorId = (id) => (s.contratos || []).find(c => c.id === id) || null;

  // Os contratos como o ecrã os lê: com os dias até renovar (nulo sem data).
  // Os que têm data primeiro, do mais próximo para o mais longe.
  const contratosDaCasa = () => (s.contratos || [])
    .map(c => ({
      ...c,
      dias: c.renovaEm ? daysUntil(c.renovaEm) : null,
      diasFidelizacao: c.fidelizacaoAte ? daysUntil(c.fidelizacaoAte) : null,
    }))
    .sort((a, b) => ((a.dias === null) - (b.dias === null))
      || ((a.dias ?? 0) - (b.dias ?? 0))
      || String(a.nome).localeCompare(String(b.nome)));

  // O que renova dentro de `dias` — ou já passou. É a linha do «Precisa de Si».
  const contratosARenovar = (dias = 30) => contratosDaCasa()
    .filter(c => c.dias !== null && c.dias <= dias);

  const validarContrato = ({ nome, fornecedor, renovaEm, fidelizacaoAte, responsavel }) => {
    const n = String(nome || '').trim();
    if (!n) return 'Dê um nome ao contrato.';
    const r = String(renovaEm || '').trim();
    const f = String(fidelizacaoAte || '').trim();
    if (r && !chaveDeDMY(r)) return 'A data de renovação não é uma data (dd/mm/aaaa).';
    if (f && !chaveDeDMY(f)) return 'A data de fidelização não é uma data (dd/mm/aaaa).';
    if (responsavel && !adultos.includes(responsavel)) return 'Quem trata do contrato tem de ser um adulto da casa.';
    return { nome: n, fornecedor: String(fornecedor || '').trim(), renovaEm: r, fidelizacaoAte: f, responsavel: responsavel || null };
  };

  // O documento sobe à parte, quando o contrato já tem id no servidor. Ou
  // sobe e a marca «por subir» cai, ou falha e fica — o ecrã di-lo.
  const subirDocumentoDoContrato = (id, idServidor, uri) => {
    if (!sync || !idServidor || !uri) return;
    const ses = sync.sessao();
    if (!ses) return;
    sync.documentoDoContrato(idServidor, { uri, nome: 'contrato.jpg', mime: 'image/jpeg' })
      .then(() => set(x => ({
        contratos: (x.contratos || []).map(c => (c.id === id ? { ...c, porSubir: false } : c)),
      })))
      .catch(() => {});
  };

  // Devolve `{ id }` quando ficou, ou a frase do que falta. `ficheiro` é a URI
  // da imagem escolhida, se houver.
  const criarContrato = (campos = {}) => {
    const ok = validarContrato(campos);
    if (typeof ok === 'string') return ok;
    const id = 'ct-' + Date.now();
    const uri = campos.ficheiro || null;
    set(x => ({
      contratos: [...(x.contratos || []), {
        id, idServidor: null, ...ok, ficheiro: null,
        ...(uri ? { ficheiroLocal: uri, porSubir: true } : {}),
      }],
      registo: maisRegisto(x, `Contrato acrescentado: ${ok.nome}${ok.fornecedor ? ` · ${ok.fornecedor}` : ''}`, 'Equipamentos'),
    }));
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.contratoDaCasa({
        casa: ses.casa, nome: ok.nome, fornecedor: ok.fornecedor,
        renovaEm: ok.renovaEm, fidelizacaoAte: ok.fidelizacaoAte,
        responsavel: ok.responsavel ? idDoMembro(ok.responsavel) : null,
      })
        .then(r => {
          if (!r || !r.id) return;
          set(x => ({ contratos: (x.contratos || []).map(c => (c.id === id ? { ...c, idServidor: r.id } : c)) }));
          subirDocumentoDoContrato(id, r.id, uri);
        })
        .catch(() => {});
    }
    return { id };
  };

  // ⚠ Os campos e o documento são DUAS escritas à mesma linha: quem chama
  // manda ou um ou outro de cada vez — a ficha guarda os campos num botão e
  // escolhe o documento noutro. Duas no mesmo tique é a classe 27.
  const alterarContrato = (id, campos = {}) => {
    const c = contratoPorId(id);
    if (!c) return 'Esse contrato não existe nesta casa.';
    const { ficheiro: uri, ...resto } = campos;
    const ok = validarContrato({ ...c, ...resto });
    if (typeof ok === 'string') return ok;
    set(x => ({
      contratos: (x.contratos || []).map(k => (k.id === id
        ? { ...k, ...ok, ...(uri ? { ficheiroLocal: uri, porSubir: true } : {}) } : k)),
    }));
    if (sync && c.idServidor) {
      if (Object.keys(resto).length) sync.alterarContrato(c.idServidor, {
        nome: ok.nome, fornecedor: ok.fornecedor, renovaEm: ok.renovaEm, fidelizacaoAte: ok.fidelizacaoAte,
        responsavel: ok.responsavel ? idDoMembro(ok.responsavel) : null,
      }).catch(() => {});
      if (uri) subirDocumentoDoContrato(id, c.idServidor, uri);
    }
    return null;
  };

  const apagarContrato = (id) => {
    const c = contratoPorId(id);
    if (!c) return;
    if (sync && c.idServidor) sync.apagarContrato(c.idServidor).catch(() => {});
    set(x => ({
      contratos: (x.contratos || []).filter(k => k.id !== id),
      registo: maisRegisto(x, `Contrato apagado: ${c.nome}`, 'Equipamentos'),
    }));
  };

  const criarMeta = (nome, alvo, quando) => {
    const n = String(nome || '').trim();
    if (!n) return 'A meta precisa de um nome.';
    const v = Math.round(Number(alvo) * 100) / 100;
    if (!(v > 0)) return 'Escreva quanto quer juntar, em euros.';
    if (listaDeMetas(s).some(m => m.name.toLowerCase() === n.toLowerCase())) {
      return 'Já existe uma meta com esse nome.';
    }

    const id = 'meta-' + Date.now();
    set(x => ({
      metasProprias: true,
      metasDaCasa: [...listaDeMetas(x), { id, idServidor: null, name: n, of: v, when: String(quando || '').trim() }],
      // ⚠ E os movimentos das SEMENTES materializam-se com a lista. Sem isto,
      // criar a primeira meta fazia as duas da demonstração saírem da lista e
      // os movimentos delas ficarem a somar para metas que já não existem.
      metaMovs: todosOsMetaMovs(x),
      registo: maisRegisto(x, `Meta criada: ${n} · ${EUR(v)}`, 'Dinheiro'),
    }));

    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.criarMeta({ casa: ses.casa, nome: n, alvo: v, quando })
        // O id do servidor cola-se à linha que já existe cá, e não cria uma
        // segunda: sem isto a meta aparecia a dobrar na leitura seguinte.
        .then(r => { if (r && r.id) set(x => ({
          metasDaCasa: (x.metasDaCasa || []).map(m => (m.id === id ? { ...m, idServidor: r.id } : m)),
        })); })
        .catch(() => {});
    }
    return null;
  };

  const alterarMeta = (id, campos = {}) => {
    const meta = listaDeMetas(s).find(m => m.id === id);
    if (!meta) return 'Essa meta não existe nesta casa.';

    const mudanca = {};
    if (campos.name !== undefined) {
      const n = String(campos.name || '').trim();
      if (!n) return 'A meta precisa de um nome.';
      if (listaDeMetas(s).some(m => m.id !== id && m.name.toLowerCase() === n.toLowerCase())) {
        return 'Já existe uma meta com esse nome.';
      }
      mudanca.name = n;
    }
    if (campos.of !== undefined) {
      const v = Math.round(Number(campos.of) * 100) / 100;
      if (!(v > 0)) return 'Escreva quanto quer juntar, em euros.';
      mudanca.of = v;
    }
    if (campos.when !== undefined) mudanca.when = String(campos.when || '').trim();

    set(x => ({
      metasProprias: true,
      metasDaCasa: listaDeMetas(x).map(m => (m.id === id ? { ...m, ...mudanca } : m)),
      metaMovs: todosOsMetaMovs(x),
    }));

    const noServidor = metaNoServidor(id);
    if (sync && noServidor) {
      sync.alterarMeta(noServidor, {
        ...(mudanca.name !== undefined ? { nome: mudanca.name } : {}),
        ...(mudanca.of !== undefined ? { alvo: mudanca.of } : {}),
        ...(mudanca.when !== undefined ? { quando: mudanca.when } : {}),
      }).catch(() => {});
    }
    return null;
  };

  // ⚠ Apagar uma meta leva os MOVIMENTOS dela, aqui e no servidor
  // (`cascadeDelete`). Deixá-los era ficar com linhas a somar para uma meta que
  // ninguém vê — invisíveis, e a acumular.
  //
  // E a pergunta que o ecrã faz tem de dizer quanto se está a deixar de contar:
  // é dinheiro que a casa juntou.
  const apagarMeta = (id) => {
    const meta = metas.find(m => m.id === id);
    if (!meta) return 'Essa meta não existe nesta casa.';
    const noServidor = metaNoServidor(id);
    if (sync && noServidor) sync.apagarMeta(noServidor).catch(() => {});
    set(x => ({
      metasProprias: true,
      metasDaCasa: listaDeMetas(x).filter(m => m.id !== id),
      metaMovs: todosOsMetaMovs(x).filter(mv => mv.meta !== id),
      registo: maisRegisto(x, `Meta apagada: ${meta.name} · ${EUR(meta.at)} juntados`, 'Dinheiro'),
    }));
    return null;
  };

  // Reforçar uma meta. Um MOVIMENTO, somado — nunca um total escrito.
  //
  // O valor pode ser negativo: é assim que se tira dinheiro de uma meta, porque
  // a linha do servidor não se edita nem se apaga. Corrigir é lançar o
  // movimento contrário, como nas despesas.
  const reforcarMeta = (id, valor, motivo, quem) => {
    const meta = listaDeMetas(s).find(m => m.id === id);
    if (!meta) return 'Essa meta não existe nesta casa.';
    const v = Math.round(Number(valor) * 100) / 100;
    if (!v) return 'Escreva um valor em euros.';

    const doMovimento = {
      id: 'mm-' + Date.now() + '-' + Math.round(Math.random() * 1e6),
      meta: id, delta: v, day: TODAY_KEY,
      label: String(motivo || '').trim(), por: quem || '',
    };
    set(x => ({
      metasProprias: true,
      metaMovs: [...todosOsMetaMovs(x), doMovimento],
      metasDaCasa: listaDeMetas(x),
      registo: maisRegisto(x, v > 0
        ? `Meta reforçada: ${meta.name} · ${EUR(v)}`
        : `Retirado da meta ${meta.name}: ${EUR(Math.abs(v))}`, 'Dinheiro'),
    }));

    const noServidor = metaNoServidor(id);
    if (sync && noServidor) {
      const ses = sync.sessao();
      if (ses) sync.reforcarMeta({
        casa: ses.casa, meta: noServidor, valor: v,
        motivo: doMovimento.label, por: idDoMembro(quem),
        data: TODAY_KEY.replace(/^d/, ''),
      }).catch(() => {});
    }
    return null;
  };

  // ── Os pontos que uma criança GANHOU ──────────────────────────────────────
  //
  // ⚠ Duas coisas estavam mal, e juntas produziam um valor impossível no ecrã:
  // «Pagar Semanada · −1,00 €».
  //
  // **A janela.** Isto contava `s.done[t.id]` — o mapa das tarefas feitas
  // HOJE, que o `recurringReset` limpa à meia-noite. E o `paidPts` conta os
  // pontos pagos DESDE SEMPRE. Duas janelas diferentes subtraídas uma à outra:
  // bastava uma semanada ter sido paga ontem para o «por pagar» de hoje nascer
  // negativo, e ficar negativo até a criança fazer tarefas que cobrissem tudo o
  // que já lhe foi pago na vida.
  //
  // **A confirmação.** Contava uma tarefa marcada, confirmada ou não. O ecrã
  // da Documentação promete o contrário, em letras: «Uma criança marca a tarefa
  // como feita e um adulto confirma — os pontos só contam depois disso». A
  // criança marcava e os pontos apareciam logo.
  //
  // O modelo certo é o INVARIANTE #2, como em todo o resto: uma SOMA sobre as
  // linhas. As linhas são as `tarefas_feitas` — uma por (tarefa, dia), com
  // índice único —, e conta-se o ponto de cada uma que esteja CONFIRMADA.
  // Assim as duas metades da subtração falam da mesma coisa: pontos ganhos de
  // sempre, menos pontos pagos de sempre.
  const pontosGanhos = (k) => {
    const todas = allTasks();
    const porId = Object.fromEntries(todas.map(t => [t.id, t]));
    // ⚠ A troca de hoje vale para HOJE. A tarefa trocada aparece com o `who` de
    // hoje e guarda em `trocadaCom` quem a tem nos outros dias — e o histórico
    // é desses dias. Contava-se tudo a quem tem a tarefa hoje: aceite a troca,
    // o Léo herdava os dez lixos do mês da Mia até à meia-noite, e o «por pagar»
    // dela ficava negativo (revisão de 13/09/2026).
    const donoNoDia = (t, diaChave) => (diaChave === TODAY_KEY || !t.trocadaCom ? t.who : t.trocadaCom);
    const minhas = todas.filter(t => t.who === k);
    const contadas = new Set();
    let n = 0;

    // Todas as marcações confirmadas, de sempre. O `feitas` vem do servidor e
    // traz o histórico inteiro, com o `confirmada` de cada linha.
    for (const [chave, linha] of Object.entries(s.feitas || {})) {
      if (!linha || !linha.confirmada) continue;
      const [idTarefa, diaISO] = chave.split('|');
      const t = porId[idTarefa];
      if (!t) continue;
      // ⚠ QUEM MARCOU a linha ganha o ponto — e não quem tem a tarefa agora
      // (15/09/2026). Reatribuir uma rotina diária ao fim de um mês movia
      // trinta marcações confirmadas de uma criança para a outra de uma vez, e
      // deixava o «por pagar» da primeira negativo. Um ponto ganho é de quem o
      // ganhou; o `marcada_por` sabe-o e passou a descer do servidor.
      //
      // O ramo antigo fica para as linhas SEM `por` — as que desceram antes
      // desta correção — e para as marcadas por um adulto em nome de uma
      // criança, onde quem marca não é quem faz.
      const marcou = linha.por;
      const dono = (marcou && criancas.includes(marcou))
        ? marcou : donoNoDia(t, diaISO ? `d${diaISO}` : TODAY_KEY);
      if (dono !== k) continue;
      contadas.add(chave);
      n += t.pts || 0;
    }

    // ⚠ E quando o `feitas` tem alguma coisa, é ELE e mais nada.
    //
    // A primeira versão somava também o `done` de hoje que não estivesse já
    // contado — e deu 0,40 € onde a conta é 0,20 €. Duas razões, as duas
    // minhas:
    //
    //   · o `done` guarda RESTOS de dias anteriores. A leitura do servidor
    //     funde-o (`{ ...x.done, ...casa.done }`) em vez de o substituir, e o
    //     `recurringReset` só limpa quando a app abre. «Levar o lixo» de ontem
    //     continuava lá hoje, e contava outra vez.
    //   · uma marcação de hoje POR CONFIRMAR não está no `pending` quando veio
    //     do servidor — está no `feitas` com `confirmada: false`. A volta do
    //     `done` não olhava para isso e contava-a.
    //
    // Com servidor, o livro das linhas é a verdade inteira e não precisa de
    // ajuda. A janela de segundos entre marcar e a linha subir não vale um
    // caminho paralelo que erra em dois sítios.
    if (contadas.size || Object.keys(s.feitas || {}).length) return n;

    // Sem servidor, o `feitas` está sempre vazio — só se escreve quando há
    // linha do outro lado. Aqui a verdade é o `done` de hoje, e o `pending` é
    // «a criança marcou e falta um adulto confirmar»: essas não contam, que é
    // a regra que o ecrã promete.
    for (const t of minhas) {
      if (!s.done[t.id]) continue;
      if ((s.pending || {})[t.id]) continue;
      if (TASKS.some(x => x.id === t.id && x.done)) continue;   // semente já feita
      n += t.pts || 0;
    }
    return n;
  };

  const kidPts = criancas.reduce((a, k) => {
    // Os pontos de partida são semente da demonstração; uma criança nova
    // começa a zero, que é o correto — não herda o histórico de ninguém.
    const base = s.clearedSeeds ? 0 : (PONTOS_INICIAIS[k] || 0);
    // ⚠ Os pontos de tarefas APAGADAS somam-se à parte, e é o INVARIANTE #2.
    //
    // Isto soma sobre `allTasks()`, que filtra as apagadas. Apagar uma tarefa
    // já FEITA tirava à criança pontos que ela ganhou — e se já tivessem sido
    // pagos, o `kidPts - paidPts` ficava NEGATIVO e a criança passava a dever
    // pontos à casa por causa de uma arrumação de um adulto.
    //
    // Um ponto ganho não se desfaz porque a tarefa deixou de interessar. O
    // livro é aditivo: apagar escreve um movimento, não reescreve uma soma.
    const guardados = (s.pontosDeTarefasApagadas || [])
      .filter(m => m.quem === k).reduce((n, m) => n + (m.pts || 0), 0);
    a[k] = base + guardados + pontosGanhos(k);
    return a;
  }, {});

  // ── O extracto do mês ───────────────────────────────────────────────────
  //
  // Cada movimento de dinheiro da casa, por ordem do tempo, com quem o fez e o
  // saldo a seguir a ele — despesas, cofres, metas, acertos, transferências.
  // Todos os meses ficam em arquivo, e um mês fechado não muda quando o
  // seguinte abre, porque as LINHAS dele não se mexem (`extracto-do-mes.js`).
  // Só adultos: é dinheiro da casa, e a app da criança não tem porta para isto.
  //
  // ⚠ Substituiu o «retrato do mês» em 17/09/2026, por decisão dele. O retrato
  // era a SOMA do mesmo mês — gasto por envelope, tarefas, compras, acertos —, e
  // vivia ao lado disto a responder à mesma pergunta com menos detalhe. Duas
  // portas para a mesma decisão, que é a classe de defeito que
  // `__tests__/duas-portas-para-a-mesma-decisao.test.js` guarda. O extracto tem
  // as mesmas linhas de origem, e mostra-as uma a uma em vez de somadas.
  //
  // ⚠ Sem servidor devolve VAZIO, e é a resposta honesta: a app local guarda as
  // somas do mês, não as linhas de despesa. Ver o comentário do `extractos` no
  // estado.
  const extractosDaCasa = () => s.extractos || [];
  const extractoDoMesAberto = () => extractosDaCasa().find(e => e.aberto) || extractosDaCasa()[0] || null;

  // Apagar uma tarefa.
  //
  // Havia `taskGone` no estado e no filtro do `allTasks` desde sempre, e NADA
  // o escrevia: uma tarefa criada por engano ficava na casa para sempre, e a
  // folha de gestão só oferecia urgência, prazo e responsável.
  //
  // ── O que sai, e o que fica ────────────────────────────────────────────
  //
  // Sai a tarefa e os mapas que só lhe dizem respeito — urgência, prazo,
  // edições, rotação, estado de feita. Ficam OS PONTOS que ela já rendeu, num
  // movimento aditivo (INVARIANTE #2): um ponto ganho não se desfaz porque a
  // tarefa deixou de interessar.
  //
  // As criadas na app saem de `newTasks`; as da semente não podem sair de lá —
  // vêm de um ficheiro — e por isso ficam marcadas no `taskGone`. Duas formas
  // de desaparecer porque há duas formas de existir.
  const removerTarefa = (id) => {
    // ⚠ O `id` do servidor lê-se ANTES de o `set` correr — depois dele a
    // tarefa já não está na lista e não há de onde o tirar.
    const noServidor = tarefaNoServidor(id);
    if (sync && noServidor) sync.apagarTarefa(noServidor).catch(() => {});
    return removerTarefaLocal(id);
  };

  const removerTarefaLocal = (id) => set(x => {
    const t = allTasks().find(y => y.id === id);
    if (!t) return {};

    const daApp = (x.newTasks || []).some(y => y.id === id);
    const fora = (m) => { const { [id]: _, ...resto } = m || {}; return resto; };

    // O ponto ganho é da criança, não da tarefa.
    const rende = x.done[id] && (t.pts || 0) > 0 && criancas.includes(t.who)
      && !TASKS.some(y => y.id === id && y.done);

    return {
      newTasks: daApp ? x.newTasks.filter(y => y.id !== id) : x.newTasks,
      taskGone: daApp ? x.taskGone : { ...x.taskGone, [id]: true },
      urg: fora(x.urg), due: fora(x.due), taskEdits: fora(x.taskEdits), taskOrder: fora(x.taskOrder),
      rotate: fora(x.rotate), done: fora(x.done), pending: fora(x.pending),
      pontosDeTarefasApagadas: rende
        ? [...(x.pontosDeTarefasApagadas || []),
           { id, quem: t.who, pts: t.pts, titulo: t.title, at: Date.now() }]
        : (x.pontosDeTarefasApagadas || []),
      registo: maisRegisto(x, `A tarefa «${t.title}» foi apagada`, 'Tarefas'),
    };
  });

  // ── Criar um evento na agenda ───────────────────────────────────────────
  //
  // ⚠ O `sync.eventoDaCasa` existia e NINGUÉM o chamava. Escrevi-o em
  // 04/09/2026 e escrevi na mensagem do commit que «a agenda passa a viver na
  // base de dados» — a LEITURA passou, e por isso os eventos do servidor
  // apareciam. Nada escrevia lá. A frase dizia mais do que era verdade.
  //
  // Três sítios criavam eventos com `set({ added: [...] })` direto: a folha de
  // agendar, a marcação de consulta e a importação da Google. Passam todos por
  // aqui.
  //
  // Devolve o `id` local, para quem chama poder ligar-lhe outra coisa — é o
  // que a consulta faz com o `healthId`.
  // ── A agenda da Google, para TODOS os eventos ─────────────────────────────
  //
  // ⚠ Isto vivia no `NovoEvento.jsx`, com um interruptor. Consequência: uma
  // consulta marcada na Saúde nunca chegava à Google — a folha dizia «e o
  // evento na agenda», e a agenda do telemóvel não sabia dela. Agora é aqui, e
  // é sempre, porque os três sítios que criam eventos passam todos por baixo.
  //
  // O que vai — e o que NÃO vai, no caso de uma consulta — está decidido no
  // `agenda-google.js`, que é puro e tem provas.

  // O evento inteiro, juntando o que foi criado e o que foi alterado depois.
  // O `eDeSaude` precisa da `tag` e do `healthId`, e o `editarEvento` só
  // recebe os campos que mudaram.
  const eventoInteiro = (id, extra) => {
    const base = (s.added || []).find(e => e.id === id) || {};
    return { ...base, ...((s.eventEdits || {})[id] || {}), ...(extra || {}) };
  };

  // Quem se convida: os membros da casa que este evento alcança E têm e-mail.
  // A regra é a do `NovoEvento`, que a trouxe consigo — e uma consulta não
  // convida ninguém, o que quem decide é o `convidadosParaGoogle`.
  const emailsDoEvento = (ev) => {
    const vis = ev.visibilidade || 'so-eu';
    if (vis !== 'familia' && vis !== 'adultos') return [];
    return Object.entries(s.membros || {})
      .filter(([nome, m]) => nome !== ev.owner && m && m.email && !m.kid)
      .map(([, m]) => m.email);
  };

  const porFazerNaGoogle = (entrada) =>
    set(x => ({ filaGoogle: enfileirar(x.filaGoogle || [], entrada) }));

  const feitoNaGoogle = (id) =>
    set(x => ({ filaGoogle: (x.filaGoogle || []).filter(e => e.id !== id) }));

  // ⚠ Guarda-se sob as DUAS chaves: a local e a do servidor.
  //
  // A resposta da Google e a do servidor da casa chegam cada uma no seu tempo,
  // e qualquer das duas pode ser a primeira. Se a do servidor chegar antes, a
  // cópia de chave feita no `criarEvento` já passou e este `idGoogle` nascia
  // órfão — debaixo de um `evt-…` que a leitura seguinte apaga.
  const guardarIdGoogle = (id, idGoogle) => set(x => {
    const noServidor = ((x.added || []).find(e => e.id === id) || {}).idServidor;
    const edits = { ...x.eventEdits, [id]: { ...(x.eventEdits[id] || {}), idGoogle } };
    if (noServidor) edits[noServidor] = { ...(x.eventEdits[noServidor] || {}), idGoogle };
    return { eventEdits: edits };
  });

  const idGoogleDe = (id) => {
    const edits = s.eventEdits || {};
    const noServidor = eventoNoServidor(id);
    return (edits[id] || {}).idGoogle
      || (noServidor ? (edits[noServidor] || {}).idGoogle : null)
      || ((s.added || []).find(e => e.id === id) || {}).idGoogle
      || null;
  };

  // Uma tentativa. Devolve `true` quando a entrada pode sair da fila — que é
  // tanto quando correu bem como quando NUNCA vai correr: um evento que a
  // Google já não tem, ou uma autorização retirada, repetem-se para sempre sem
  // nunca passar. É a mesma distinção que a fila do servidor aprendeu à sua
  // custa.
  const tentarNaGoogle = async (entrada) => {
    if (!sync || !sync.agendaGoogle || !sync.agendaGoogle.disponivel()) return false;
    try {
      if (entrada.acao === 'apagar') {
        if (entrada.idGoogle) await sync.agendaGoogle.apagar(entrada.idGoogle);
        return true;
      }
      const alvo = entrada.idGoogle || idGoogleDe(entrada.id);
      if (entrada.acao === 'alterar' && alvo) {
        await sync.agendaGoogle.alterar(alvo, entrada.corpo);
        return true;
      }
      // Sem `idGoogle`, uma alteração é uma criação: o evento nunca lá chegou.
      const idGoogle = await sync.agendaGoogle.criar(entrada.corpo);
      guardarIdGoogle(entrada.id, idGoogle);
      return true;
    } catch (e) {
      return naoVaiPassar(e);
    }
  };

  const empurrarParaGoogle = (entrada) => {
    // ⚠ A fila é para uma REDE que caiu, não para uma agenda que nunca foi
    // ligada. Sem esta guarda, numa casa que nunca autorizou a Google cada
    // evento entrava numa fila que nada esvazia — e ao fim de um ano eram
    // centenas de entradas gravadas no disco à espera de uma coisa que não vai
    // acontecer.
    //
    // E quando a agenda for ligada um dia, começa-se do zero: despejar meses de
    // eventos antigos numa agenda acabada de autorizar é enchê-la de coisas que
    // já passaram.
    if (!sync || !sync.agendaGoogle || !sync.agendaGoogle.disponivel()) return;
    // ⚠ SÓ enfileira. Não tenta aqui.
    //
    // Tentava as duas coisas — punha na fila e mandava logo —, e o efeito que
    // escoa a fila dispara precisamente por ela ter mudado. Dois caminhos a
    // criar o mesmo evento, e a Google fica com ele A DOBRAR: dois eventos com
    // o mesmo título e a mesma hora, e um deles sem `idGoogle` guardado, pelo
    // que apagar na app só apaga um.
    //
    // Apanhado com o evento de prova a sério, na agenda a sério: a importação
    // ofereceu-o de volta e havia DOIS ids do lado de lá. Nenhuma prova o via,
    // porque a duplicação nasce da corrida entre o efeito e a chamada, e não
    // de nenhuma das duas sozinha.
    //
    // Uma porta: enfileirar. O efeito escoa, e escoa uma vez.
    porFazerNaGoogle(entrada);
  };

  // A fila inteira, pela ordem em que entrou. Chamada pelo fornecedor sempre
  // que ela muda.
  //
  // ⚠ Pela ORDEM, e parando à primeira que não passa: alterar antes de criar
  // mandava uma alteração de um evento que ainda não existe, e o resto da fila
  // dependia sempre da entrada anterior ter chegado.
  const escoarFilaGoogle = async () => {
    for (const entrada of (s.filaGoogle || [])) {
      const pronto = await tentarNaGoogle(entrada);
      if (!pronto) break;      // a rede não voltou; o resto fica para depois
      feitoNaGoogle(entrada.id);
    }
  };

  // ⚠ `idGoogle` quer dizer «este evento JÁ existe na agenda da Google» — veio
  // de lá, não vai para lá. Sem esta distinção, importar um evento devolvia-o à
  // Google como novo e a agenda ficava com ele a dobrar: o mesmo defeito da
  // dupla porta, visto do outro lado do espelho.
  //
  // `semRegisto` é para quem escreve a sua própria linha. Trazer cinco eventos
  // da agenda escrevia cinco linhas no registo da casa a dizer a mesma coisa.
  const criarEvento = ({ day, time, title, who, owner, visibilidade, tag, healthId, id,
                         idGoogle, semRegisto, extra }) => {
    // ⚠ `Date.now()` E MAIS NADA não chega.
    //
    // Dois eventos criados no mesmo milissegundo ficavam com o MESMO id — e
    // trazer três da agenda da Google é exactamente isso: um ciclo, sem espera
    // nenhuma pelo meio. Os três eventos ficavam a partilhar id, e o
    // `idGoogle` do último apagava o dos anteriores: dois deles perdiam a
    // ligação à agenda e passavam a ser intocáveis.
    //
    // Só se viu quando a importação passou a usar esta porta; até aí ela tinha
    // sufixo próprio e o `criarEvento` era chamado uma vez de cada vez.
    const idLocal = id || ('ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
    set(x => ({
      added: [...(x.added || []), {
        id: idLocal, day, time: time || '', title, who: who || '',
        owner, visibilidade: visibilidade || 'so-eu', tag: tag || '',
        ...(healthId ? { healthId } : {}),
        ...(extra || {}),
      }],
      // ⚠ Só o TÍTULO, e nem sempre. Um evento «Só eu» é privado por regra do
      // servidor (INVARIANTE #3), e escrever-lhe o título no registo da casa —
      // que todos os adultos leem — era contornar essa regra pela porta das
      // traseiras. Desses fica só que houve um evento.
      registo: semRegisto ? x.registo
        : maisRegisto(x, (visibilidade || 'so-eu') === 'so-eu'
          ? 'Um evento privado foi agendado'
          : `Evento «${title}» agendado`, 'Agenda'),
    }));

    // O identificador da Google de um evento que veio de lá guarda-se já: é ele
    // que faz o `editar` e o `apagar` chegarem à agenda, e que impede a
    // importação seguinte de o oferecer outra vez como novidade.
    if (idGoogle) guardarIdGoogle(idLocal, idGoogle);

    if (sync) {
      const ses = sync.sessao();
      const autor = idDoMembro(owner);
      // O `responsavel` é opcional; o `who` da loja é uma frase («Léo ·
      // Consulta de saúde»), portanto só se manda quando é mesmo um membro.
      const responsavel = idDoMembro(who);
      if (ses && autor) sync.eventoDaCasa({
        casa: ses.casa, dia: day, hora: time, titulo: title,
        responsavel, autor, visibilidade: visibilidade || 'so-eu',
        etiqueta: tag || '',
        // ⚠ O `healthId` local não serve: o servidor quer o id DELE. Só se
        // manda quando a consulta já subiu e aprendeu o seu.
        episodio: healthId ? episodioNoServidor(healthId) : null,
      })
        .then((r) => { if (r && r.id) set(x => ({
          added: (x.added || []).map(e => (e.id === idLocal ? { ...e, idServidor: r.id } : e)),
          // ⚠ E o `idGoogle` muda de chave com ele.
          //
          // O identificador da Google era guardado em `eventEdits[idLocal]`. Na
          // leitura seguinte, o evento volta do servidor COM O ID DO SERVIDOR —
          // o `evt-1788…` desaparece, e com ele a única ligação entre este
          // evento e o que ele é na agenda da Google. A partir daí, editar e
          // apagar deixavam de lá chegar, sem erro nenhum: a app dizia
          // «apagado» e o evento ficava na agenda para sempre.
          //
          // Bastava fechar a app entre criar e apagar. Apanhado com o evento de
          // prova, na agenda a sério, e não por nenhuma das 1363 provas: todas
          // elas correm sem servidor, e sem servidor o id local nunca muda.
          eventEdits: (x.eventEdits || {})[idLocal]
            ? { ...x.eventEdits, [r.id]: { ...(x.eventEdits[r.id] || {}), ...x.eventEdits[idLocal] } }
            : x.eventEdits,
        })); })
        .catch(() => {});
    }

    // E para a agenda da Google — sempre, e não só quando alguém liga um
    // interruptor. Uma consulta leva o título neutro; ver `agenda-google.js`.
    //
    // ⚠ Excepto quando veio DE lá: nesse caso já existe, e mandá-lo outra vez
    // duplicava-o na agenda de quem o importou.
    if (!idGoogle) {
      const ev = { day, time, title, owner, visibilidade, tag, healthId };
      empurrarParaGoogle({
        id: idLocal, acao: 'criar',
        corpo: paraGoogle(ev, { autor: owner, emails: emailsDoEvento(ev) }),
      });
    }

    return idLocal;
  };

  const eventoNoServidor = (id) =>
    ((s.added || []).find(e => e.id === id) || {}).idServidor || null;

  // ── Um evento alterado, na forma do servidor ────────────────────────────
  //
  // ⚠ Isto estava escrito DUAS VEZES — no `alterarEventoDaCasa` e no
  // `editarEvento` —, palavra por palavra. E as duas cópias tinham o mesmo
  // buraco: mandavam o dia, a hora, o título e a visibilidade, e mais nada.
  //
  // O `responsavel` e a `etiqueta` ficavam neste telefone. Mudar quem é
  // responsável por um evento, ou trocar-lhe a etiqueta de «Escola» para
  // «Saúde», não chegava ao outro adulto — sem erro nenhum, porque a escrita
  // acontecia e ia incompleta.
  //
  // Uma cópia só, e os dois campos que faltavam entram nela.
  const eventoParaServidor = (campos) => ({
    ...(campos.day !== undefined ? { dia: campos.day } : {}),
    ...(campos.time !== undefined ? { hora: campos.time } : {}),
    ...(campos.title !== undefined ? { titulo: campos.title } : {}),
    ...(campos.visibilidade !== undefined ? { visibilidade: campos.visibilidade } : {}),
    ...(campos.tag !== undefined ? { etiqueta: campos.tag } : {}),
    // O `who` da loja é um NOME, e às vezes uma frase («Léo · Consulta de
    // saúde»): só se manda quando é mesmo um membro, como na criação.
    ...(campos.who !== undefined ? { responsavel: idDoMembro(campos.who) } : {}),
  });

  const alterarEventoDaCasa = (id, campos) => {
    set(x => ({ added: (x.added || []).map(e => (e.id === id ? { ...e, ...campos } : e)) }));
    const noServidor = eventoNoServidor(id);
    if (sync && noServidor) {
      sync.alterarEvento(noServidor, eventoParaServidor(campos)).catch(() => {});
    }
  };

  // ── As compras ──────────────────────────────────────────────────────────
  //
  // ⚠ O `estado` de um artigo vive NA LINHA dele. O comentário da coleção
  // `artigos` já avisava, antes de eu o fazer errado:
  //
  //   «O estado vive na linha do artigo. Se fosse uma lista de identificadores
  //    confirmados, dois telefones na mesma loja anulavam-se; assim, fundem-se.»
  //
  // O cliente tinha exactamente a lista que o comentário proíbe: um mapa
  // `status` que cada telefone reescrevia por inteiro. Dois adultos a dividir
  // os corredores anulavam o trabalho um do outro. É a mesma forma do
  // `envMove`, e a terceira vez que este projeto a encontra.
  const artigoNoServidor = (id) =>
    (allItems().find(a => a.id === id) || {}).idServidor || null;

  // A lista de compras ABERTA no servidor. Nula quando a casa está entre duas
  // idas — e isso é um estado válido, não um erro.
  const listaAberta = () => (s.shopPlan || {}).idServidor || null;

  // ── A lista partilhada com quem não tem a app ───────────────────────────
  //
  // Um endereço só de leitura da lista aberta, válido uma hora, para a avó
  // que vai ao supermercado sem a app. Não é dado da loja — é uma resposta do
  // servidor que a folha mostra e mais nada —, por isso não há chave em
  // `DATA_KEYS`. Sem servidor, ou sem ida às compras aberta, devolve a razão.
  // (12/09/2026 — a nona das dez funcionalidades.)
  const partilharLista = async (quem) => {
    // ⚠ `sync` carregado não quer dizer servidor ligado: sem `EXPO_PUBLIC_PB_URL`
    // o módulo existe e a ligação não. A pergunta certa é a do `ligado()`.
    if (!sync || !sync.ligado()) return { erro: 'Só com o servidor ligado se partilha a lista.' };
    const ses = sync.sessao();
    if (!ses) return { erro: 'Entre outra vez para partilhar a lista.' };
    const lista = listaAberta();
    if (!lista) return { erro: 'Não há uma ida às compras aberta para partilhar.' };
    try {
      const r = await sync.partilharLista({ casa: ses.casa, lista, criadaPor: ses.membro });
      set(x => ({ registo: maisRegisto(x, 'A lista de compras foi partilhada por um endereço só de leitura, válido uma hora', 'Compras') }));
      return { ...r, quem };
    } catch (e) {
      return { erro: (e && e.message) || 'Não foi possível partilhar a lista.' };
    }
  };
  const desfazerPartilha = async (id) => {
    if (!sync || !id) return null;
    try {
      const r = await sync.apagarPartilhaDaLista(id);
      // ⚠ Sem servidor o `sync` devolve `{ pendente: true }` e não apaga nada —
      // e a folha dizia «o endereço já não abre nada» com o endereço a valer
      // mais uma hora (revisão de 13/09/2026). Diz-se a verdade.
      if (r && r.pendente) return 'Só com o servidor ligado se desfaz a partilha. O endereço expira sozinho ao fim de uma hora.';
      set(x => ({ registo: maisRegisto(x, 'A partilha da lista de compras foi desfeita', 'Compras') }));
      return null;
    } catch (e) {
      return (e && e.message) || 'Não foi possível desfazer a partilha.';
    }
  };

  // `vis`: quem vê o artigo — `familia` (todos) ou `adultos` (a prenda que a
  // criança não pode ver). É o servidor que não a devolve à criança; aqui
  // guarda-se para a pastilha e para a leitura sem servidor.
  const criarArtigo = ({ label, section, est, staple, by, vis }) => {
    const rotulo = String(label || '').trim();
    if (!rotulo) return null;
    const id = 'art-' + Date.now();
    const visibilidade = vis === 'adultos' ? 'adultos' : 'familia';
    set(x => ({
      // ⚠ O NOME do corredor, e não o índice. Quem chama pode mandar as duas
      // coisas — a folha do artigo ainda escolhe por posição —, e a tradução
      // faz-se aqui, num sítio só.
      newItems: [...(x.newItems || []), {
        id,
        s: typeof section === 'number' ? (listaDeSeccoes(x)[section] || listaDeSeccoes(x)[0]) : section,
        label: rotulo, est: est || 0, staple, by, vis: visibilidade,
      }],
    }));

    if (sync) {
      const ses = sync.sessao();
      const lista = listaAberta();
      // Sem lista aberta o artigo não tem onde entrar — fica local até haver
      // uma, que é melhor do que inventar uma ida às compras.
      if (ses && lista) sync.artigoDeCompras({
        casa: ses.casa, lista, rotulo,
        corredor: seccaoNoServidor(
          typeof section === 'number' ? (seccoes[section] || seccoes[0]) : section),
        pedidoPor: idDoMembro(by), habitual: !!staple, estimativa: est,
        visibilidade,
      })
        .then((r) => { if (r && r.id) set(x => ({
          newItems: (x.newItems || []).map(a => (a.id === id ? { ...a, idServidor: r.id } : a)),
        })); })
        .catch(() => {});
    }
    return id;
  };

  // ── Repetir uma ida às compras ──────────────────────────────────────────
  //
  // 16/09/2026, o dono da casa, a olhar para o Histórico de Compras: «para que
  // serve isto afinal???». Não servia para nada: era uma lista só de leitura, e
  // o botão «Repetir compra» que ela teve foi tirado em 13/09 porque a entrada
  // do histórico não guardava os artigos — não havia o que repetir.
  //
  // Os artigos das listas fechadas nunca saíram do servidor: continuam presos à
  // sua lista, com o rótulo e o corredor. O que faltava era trazê-los na leitura
  // (ver `shopHistory`, em `src/sync.js`), e é isto que os usa.
  //
  // ⚠ Acrescenta só O QUE FALTA. Repetir uma ida com a lista de hoje já meia
  // feita não pode duplicar o que já lá está — a comparação é pelo rótulo, sem
  // maiúsculas nem acentos a contar, que é como uma pessoa compara «Leite» com
  // «leite».
  //
  // ⚠ E devolve a CONTAGEM, para quem chama poder perguntar antes de fazer. Uma
  // ida de trinta artigos acrescentada sem aviso é uma lista de compras que
  // ninguém reconhece.
  const semAcentos = (x) => String(x || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // TODOS os artigos de uma ida, cada um a dizer se já está na lista de hoje.
  //
  // 18/09/2026, o dono da casa, a olhar para o botão «Repetir»: «quando clico
  // aqui não devia ver-se o que foi comprado para validar se quero repetir ou
  // não?». Devia — e os artigos já cá estavam: o que faltava era uma função que
  // os desse TODOS, e não só os que faltam, para a folha poder mostrar os que
  // já lá estão com a razão à vista em vez de os fazer desaparecer.
  //
  // ⚠ Esta é a fonte única. O `artigosQueFaltamDaIda` filtra-a, e não repete a
  // comparação — duas contas do mesmo número é a classe de defeito que já pôs a
  // grelha de envelopes a mostrar uma lista e a confirmação a aplicar outra.
  const artigosDaIda = (at) => {
    const ida = (s.shopHistory || []).find(h => h.at === at);
    if (!ida || !Array.isArray(ida.artigos)) return [];
    const jaLa = new Set(allItems().map(i => semAcentos(i.label)));
    const vistos = new Set();
    const saida = [];
    for (const a of ida.artigos) {
      const chave = semAcentos(a.rotulo);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ ...a, jaNaLista: jaLa.has(chave) });
    }
    return saida;
  };

  const artigosQueFaltamDaIda = (at) => artigosDaIda(at).filter(a => !a.jaNaLista);

  // ⚠ `rotulos` é a ESCOLHA de quem está a ver a folha, e é opcional: sem ela
  // repete-se tudo o que falta, que é o que a pergunta antiga fazia. Com ela,
  // repete-se só o que ficou marcado — e compara-se pelo mesmo `semAcentos`,
  // porque um rótulo que vem do ecrã é texto como qualquer outro.
  const repetirCompra = (at, quem, rotulos = null) => {
    const todos = artigosQueFaltamDaIda(at);
    const escolha = Array.isArray(rotulos) ? new Set(rotulos.map(semAcentos)) : null;
    const faltam = escolha ? todos.filter(a => escolha.has(semAcentos(a.rotulo))) : todos;
    // ⚠ Pelo `criarArtigo`, um a um, e não por um `set` com a lista inteira: é
    // ele que sabe traduzir o corredor, falar com o servidor e guardar o
    // `idServidor` de cada linha. Escrever aqui uma segunda via era a classe de
    // defeito que já pôs a grelha de envelopes a mostrar uma lista e a
    // confirmação a aplicar outra.
    for (const a of faltam) {
      criarArtigo({
        label: a.rotulo,
        // O corredor da outra vez, se a casa ainda o tiver; senão o primeiro.
        section: (a.corredor && seccoes.includes(a.corredor)) ? a.corredor : seccoes[0],
        est: 0, staple: false, by: quem, vis: 'familia',
      });
    }
    return faltam.length;
  };

  // ── Alterar um artigo ───────────────────────────────────────────────────
  //
  // Havia criar e apagar, e mais nada: escrever «Leite meio-gordo» em vez de
  // «Leite» era apagar e voltar a escrever, e com isso perdia-se o lugar dele
  // no corredor e o estado desta ida.
  //
  // ⚠ Vai para um mapa `itemEdits` e não por cima do artigo, porque as
  // sementes do `data.js` são uma constante do módulo. Ver o `allItems`.
  //
  // Os campos são os MESMOS que a folha de criar oferece — rótulo, corredor,
  // estimativa, habitual. Nem mais um: o `by` é a frase debaixo do rótulo e o
  // servidor é que a compõe, na leitura; escrevê-la aqui era ficar com duas
  // versões da mesma linha.
  const alterarArtigo = (id, campos = {}) => {
    const artigo = allItems().find(a => a.id === id);
    if (!artigo) return 'Esse artigo não existe nesta lista.';

    const mudanca = { ...campos };
    if (mudanca.label !== undefined) {
      const rotulo = String(mudanca.label || '').trim();
      if (!rotulo) return 'O artigo precisa de um nome.';
      mudanca.label = rotulo;
    }
    if (mudanca.s !== undefined && !seccoes.includes(mudanca.s)) {
      return 'Esse corredor não existe nesta casa.';
    }

    // ── Mudar de corredor põe o artigo no FIM do corredor novo ──────────────
    //
    // O posto é o lugar DENTRO do corredor, e levá-lo consigo punha o artigo a
    // meio do corredor novo sem que ninguém o tivesse posto lá.
    //
    // ⚠ E limpá-lo não bastava — foi o que uma prova apanhou. Sem posto, o
    // artigo ordena-se pela ordem de CRIAÇÃO, e um artigo antigo cai a meio do
    // corredor novo exactamente como se tivesse trazido o número: medido, a
    // banana passou para os «Frescos» e entrou à frente da manteiga.
    //
    // Portanto escreve-se a ordem do corredor de destino INTEIRO, com o
    // recém-chegado no fim — a mesma volta do `reordenarArtigos`, e pela mesma
    // razão: os postos são relativos, e escrever só um deixa o resto empatado.
    const mudouDeCorredor = mudanca.s !== undefined && mudanca.s !== artigo.s;
    const noDestino = mudouDeCorredor
      ? [...allItems().filter(a => a.s === mudanca.s && a.id !== id).map(a => a.id), id]
      : [];

    set(x => ({
      itemEdits: { ...(x.itemEdits || {}), [id]: { ...((x.itemEdits || {})[id] || {}), ...mudanca } },
      ...(mudouDeCorredor
        ? {
          itemOrder: {
            ...(x.itemOrder || {}),
            ...Object.fromEntries(noDestino.map((k, i) => [k, i + 1])),
          },
        }
        : {}),
    }));

    const paraOServidor = {
      ...(mudanca.label !== undefined ? { rotulo: mudanca.label } : {}),
      ...(mudanca.s !== undefined ? { corredor: seccaoNoServidor(mudanca.s) } : {}),
      ...(mudanca.est !== undefined ? { estimativa: mudanca.est } : {}),
      ...(mudanca.staple !== undefined ? { habitual: mudanca.staple } : {}),
      ...(mudanca.vis !== undefined ? { visibilidade: mudanca.vis } : {}),
    };

    if (!sync) return null;

    // ⚠ UMA escrita por linha, e o artigo que muda de corredor leva o posto
    // consigo. Eram duas — a alteração e, no mesmo tique, a ordem do corredor
    // de destino — e as duas caíam na MESMA linha do servidor.
    //
    // Medido com a casa a sério: as bananas apareciam na Mercearia no ecrã e
    // continuavam nos «Frescos» no servidor. O SDK do PocketBase cancela um
    // pedido pendente quando lhe chega outro com a mesma chave, e a primeira
    // escrita — a do corredor — era abortada em silêncio. O
    // `autoCancellation(false)` do `src/pocketbase.js` fecha a porta; escrever
    // uma vez por linha é não bater nela.
    if (mudouDeCorredor) {
      noDestino.forEach((k, i) => {
        const sid = artigoNoServidor(k);
        if (!sid) return;
        sync.alterarArtigo(sid, {
          ...(k === id ? paraOServidor : {}),
          posto: i + 1,
        }).catch(() => {});
      });
      return null;
    }

    const noServidor = artigoNoServidor(id);
    if (noServidor && Object.keys(paraOServidor).length) {
      sync.alterarArtigo(noServidor, paraOServidor).catch(() => {});
    }
    return null;
  };

  // ── A ordem dos artigos dentro do corredor ──────────────────────────────
  //
  // A mesma forma do `reordenarTarefas`, e o grupo aqui é o CORREDOR: a lista
  // do Modo Compras leva a pessoa de corredor em corredor, e dentro de cada um
  // a ordem é a que a mão deu. Arrastar não muda de corredor — isso é a folha
  // de gestão, com o nome do corredor à vista.
  const reordenarArtigos = (ids) => {
    const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
    if (lista.length < 2) return null;                  // nada a reordenar
    if (new Set(lista).size !== lista.length) return 'O mesmo artigo aparece duas vezes na ordem.';

    const todos = allItems();
    const porId = new Map(todos.map(a => [a.id, a]));
    if (lista.some(id => !porId.has(id))) return 'Esse artigo não existe nesta lista.';

    const corredores = new Set(lista.map(id => porId.get(id).s));
    if (corredores.size > 1) return 'A ordem só se muda dentro do mesmo corredor.';
    const corredor = [...corredores][0];

    // ⚠ A vista pode mostrar só parte do corredor, e então `lista` é um
    // SUBCONJUNTO dele. Escrever postos só ao subconjunto deixava o resto sem
    // posto, e esse resto saltava para o fim. Percorre-se o corredor INTEIRO e,
    // em cada lugar que era de uma das arrastadas, entra a seguinte da ordem
    // nova; quem não estava à vista fica onde estava. É a mesma volta do
    // `reordenarTarefas`, e é por isso que reordenar uma página não desarruma
    // a outra.
    const grupo = todos.filter(a => a.s === corredor).map(a => a.id);
    const fila = [...lista];
    const nova = grupo.map(id => (lista.includes(id) ? fila.shift() : id));

    // Os postos contam de UM dos dois lados: no servidor porque um `number` não
    // é anulável e o zero faz de «sem posto», e aqui para os dois mapas terem
    // os mesmos números.
    set(x => ({
      itemOrder: {
        ...(x.itemOrder || {}),
        ...Object.fromEntries(nova.map((id, i) => [id, i + 1])),
      },
    }));

    // E vai para o servidor, porque a ordem é da CASA: sem isto a Rita
    // arrastava o leite para cima e o Tomás continuava a vê-lo em terceiro.
    // Escreve-se o corredor INTEIRO, e não só os arrastados: os postos são
    // relativos, e dois números iguais no mesmo corredor desempatam-se pela
    // ordem de criação — a lista saltava sozinha na leitura seguinte.
    if (sync) {
      const ids = nova.map(id => artigoNoServidor(id)).filter(Boolean);
      if (ids.length === nova.length) sync.reordenarArtigos(ids).catch(() => {});
    }
    return null;
  };

  // Marcar um artigo: por comprar → apanhado → sem stock. Três estados, não
  // dois: «sem stock» não é o mesmo que «por comprar», e quem está na loja já
  // lá foi ver.
  const marcarArtigo = (id, estado) => {
    // ⚠ A MESMA omissão que os ecrãs leem (15/09/2026): `s.status[id] ||
    // (i.real ? 'done' : 'open')`. Aqui era só `|| 'open'`, e um artigo com
    // preço pago de uma ida anterior — que os três ecrãs mostram apanhado —
    // contava como por apanhar: o primeiro toque para o desmarcar gravava
    // «done» por cima de «done» e não mudava nada no ecrã. Eram precisos dois
    // toques para desfazer um, o primeiro sem resposta nenhuma.
    const artigo = allItems().find(i => i.id === id);
    const agora = s.status[id] || ((artigo && artigo.real) ? 'done' : 'open');
    const proximo = agora === estado ? 'open' : estado;
    set(x => ({ status: { ...x.status, [id]: proximo } }));

    const noServidor = artigoNoServidor(id);
    if (sync && noServidor) sync.marcarArtigo(noServidor, proximo, s.precoPago[id]).catch(() => {});
  };

  // ── A ida às compras: abrir e fechar ────────────────────────────────────
  //
  // Uma `listas_compras` sem `fechada_em` é a lista ABERTA. Fechar a conta põe
  // a data e abre outra: é assim que o histórico fica, e que a lista seguinte
  // nasce vazia sem ninguém apagar nada.
  const mudarPlanoDeCompras = (campos) => {
    set(x => ({ shopPlan: { ...x.shopPlan, ...campos } }));
    if (!sync) return;
    const ses = sync.sessao();
    if (!ses) return;

    const lista = listaAberta();
    const daLoja = (nome) => ((s.listasIds || {}).stores || {})[nome] || null;
    const linha = {
      ...(campos.store !== undefined ? { loja: daLoja((s.stores || [])[campos.store]) } : {}),
      ...(campos.who !== undefined ? { comprador: idDoMembro(campos.who) } : {}),
      // ⚠ O dia e a hora vão sempre JUNTOS: uma hora sem dia não é um
      // instante, e o servidor guarda os dois no mesmo campo. Mudar só a hora
      // manda o dia que já lá está.
      ...(campos.day !== undefined || campos.time !== undefined
        ? {
          planeadaPara: campos.day !== undefined ? campos.day : (s.shopPlan || {}).day,
          hora: campos.time !== undefined ? campos.time : (s.shopPlan || {}).time,
        }
        : {}),
    };
    if (!Object.keys(linha).length) return;

    // Sem lista aberta, abre-se uma: mudar o plano É começar a planear a ida.
    if (lista) { sync.alterarListaDeCompras(lista, linha).catch(() => {}); return; }
    sync.listaDeCompras({
      casa: ses.casa,
      loja: linha.loja, comprador: linha.comprador,
      planeadaPara: linha.planeadaPara, hora: linha.hora,
    })
      .then((r) => { if (r && r.id) set(x => ({ shopPlan: { ...x.shopPlan, idServidor: r.id } })); })
      .catch(() => {});
  };

  // O `total` fecha a ida com o que ela custou. Sem ele, o histórico das
  // compras vivia só no telefone de quem foi ao supermercado.
  const fecharIdaAsCompras = (total = 0) => {
    const loja = lojaDoPlano();
    set(x => ({
      registo: maisRegisto(x, `Ida às compras fechada${loja ? ` · ${loja}` : ''} · ${EUR(total)}`, 'Compras'),
      // ⚠ A IDA TERMINA AQUI, e não só no servidor (15/09/2026).
      //
      // Isto escrevia uma linha de registo e mais nada. Com servidor o lixo era
      // apanhado na leitura seguinte (`status: {}` quando não há lista aberta);
      // SEM servidor nada o apanhava: a lista ficava toda confirmada, o botão
      // continuava armado, e tocá-lo outra vez registava uma SEGUNDA despesa do
      // mesmo valor. Medido na casa de demonstração: 50,90 € a virarem 101,80 €
      // por uma ida ao supermercado.
      //
      // O que termina: as marcas desta ida (`status`) e os artigos que só
      // valiam para ela. Os habituais ficam — voltam à lista na semana
      // seguinte, que é o que «habitual» quer dizer.
      status: {},
      newItems: (x.newItems || []).filter(i => i.staple),
      itemGone: {},
    }));
    const lista = listaAberta();
    if (sync && lista) {
      sync.alterarListaDeCompras(lista, { fechadaEm: TODAY_KEY, total }).catch(() => {});
      set(x => ({ shopPlan: { ...x.shopPlan, idServidor: null } }));
    }
  };

  // ── Registar uma despesa ────────────────────────────────────────────────
  //
  // ⚠ O `sync.despesa` existia e NINGUÉM o chamava. A app somava ao
  // `registered` local e mais nada: as despesas nunca chegavam ao servidor, e
  // o orçamento de cada telefone contava só o que ele próprio tinha gasto.
  //
  // É o mesmo «andaime sem obra» que o `itemGone` e o `addHealthRecord` já
  // tinham tido — uma função de escrita sem chamador não dá erro nenhum, e as
  // provas do servidor passam porque chamam-na diretamente.
  //
  // ⚠ E é uma INSERÇÃO, nunca a substituição de um total. Corrigir uma despesa
  // é anular e recriar: a coleção não tem `updateRule` nem `deleteRule`.
  // `contaFixa` e `mes` vêm só do `pagarContaFixa`: a conta que esta despesa
  // paga, e o mês em que a paga — é o que faz a segunda do mês colidir.
  const registarDespesa = ({ envelope, valor, descricao, pagador, divideMeias, dia = TODAY_KEY, contaFixa = null, mes = null }) => {
    const v = Math.round(Number(valor) * 100) / 100;
    if (!(v > 0)) return;

    // ⚠ Aqui havia `acertoMovs: []`, e é a TERCEIRA cópia do mesmo apagão —
    // depois do `fecharMes` e do fecho da conta das compras. Registar uma
    // despesa apagava os pagamentos do acerto entre os dois adultos: quem
    // tivesse acertado contas nessa semana via a dívida voltar por ter
    // registado um café.
    //
    // O acerto é uma soma de linhas do servidor, filtrada pelo mês. Não se zera
    // em lado nenhum.
    // ⚠ Isto era `registered: x.registered + (envelope === 'Mercearia' ? v : 0)`,
    // e o `used` de cada envelope lia esse número SÓ na Mercearia. Sem servidor
    // a correr — que é como a app corre por omissão — uma despesa em qualquer
    // outro envelope não fazia nada. Nada: o envelope ficava igual, o «Gasto»
    // ficava igual, e o «Disponível» do topo continuava a dizer um número que
    // já não era verdade. Medido: 12,00 € em «Casa & contas» ou «Sair & lazer»
    // não movia um cêntimo em ecrã nenhum.
    //
    // A causa é a idade do código: nasceu quando as únicas despesas da casa
    // eram compras de supermercado, e a Mercearia era o único destino possível.
    // Ficou uma condição escrita à mão, com um nome de envelope no meio.
    //
    // Agora o gasto local é por ENVELOPE, aditivo (INVARIANTE #2), e o
    // `registered` é o total do mês — que é o que a descrição dele sempre disse
    // que era.
    set(x => ({
      registered: x.registered + v,
      gastoLocal: { ...(x.gastoLocal || {}), [envelope]: ((x.gastoLocal || {})[envelope] || 0) + v },
      registo: maisRegisto(x, `Despesa de ${EUR(v)} em ${envelope}${descricao ? ` · ${descricao}` : ''}`, 'Dinheiro'),
      // ⚠ «Dividir a meias» entra MESMO nas «Contas entre Nós» (15/09/2026).
      //
      // A folha promete-o em letras — «Metade (20,00 €) entra na conta entre os
      // dois» — e isto não lhe tocava: o `partilhasPagas` e o `despesasMeias`
      // só eram escritos pela leitura do servidor, e nada relê a casa depois de
      // uma escrita. O cartão do acerto ficava igual durante toda a sessão, por
      // mais despesas a meias que se registassem.
      //
      // O `partilhasPagas` é quanto CADA adulto pôs em despesas partilhadas
      // deste mês — uma soma aditiva, como tudo o resto (INVARIANTE #2). Com
      // servidor a leitura seguinte traz a soma dele e substitui esta; até lá,
      // o ecrã diz a verdade em vez de dizer a de ontem.
      ...(divideMeias && pagador ? {
        partilhasPagas: { ...(x.partilhasPagas || {}), [pagador]: ((x.partilhasPagas || {})[pagador] || 0) + v },
        despesasMeias: (x.despesasMeias || 0) + 1,
      } : {}),
    }));

    if (sync) {
      const ses = sync.sessao();
      const idEnv = envelopeNoServidor(envelope);
      const idPagador = idDoMembro(pagador);
      // Sem envelopes do servidor a despesa não tem onde entrar: a casa ainda
      // corre com as sementes, e fica local.
      // ⚠ A conta só vai se já tiver id no servidor — uma conta acabada de
      // criar sem rede ainda não o tem, e a despesa sobe na mesma, só que sem
      // a ligação. O dinheiro sai do envelope de qualquer maneira; o que se
      // perde é a marca «paga» no outro telemóvel até à leitura seguinte.
      const idConta = contaFixa ? contaFixa.idServidor || null : null;
      if (ses && idEnv && idPagador) sync.despesa({
        casa: ses.casa, envelope: idEnv, valor: v, pagador: idPagador,
        descricao: descricao || '', data: dia.replace(/^d/, ''),
        divideMeias: divideMeias !== false,
        contaFixa: idConta,
        idemKey: idConta && mes ? `conta-fixa:${idConta}:${mes}` : null,
      }).catch(() => {});
    }
  };

  // ── Mover dinheiro entre envelopes ──────────────────────────────────────
  //
  // ⚠ Isto era `set({ envMove: { ...x.envMove, [de]: -v, [para]: +v } })` — um
  // SALDO ESCRITO, e o INVARIANTE #2 ao contrário. A consequência é a que o
  // CLAUDE.md descreve: se a Rita mover 50 € da Mercearia para o Lazer e o
  // Tomás mover 30 € do Lazer para a Casa, o último a gravar apaga o outro.
  //
  // Passa a ser uma TRANSFERÊNCIA — uma linha, aditiva, com chave de
  // idempotência — e o `envMove` que os ecrãs leem é a soma delas. Localmente
  // continua a somar-se ao mapa, para a app funcionar sem rede; a diferença é
  // que o servidor manda quando responde.
  const moverEntreEnvelopes = (deNome, paraNome, valor) => {
    const v = Number(valor) || 0;
    if (v <= 0 || deNome === paraNome) return;

    set(x => ({
      envMove: {
        ...x.envMove,
        [deNome]: (x.envMove[deNome] || 0) - v,
        [paraNome]: (x.envMove[paraNome] || 0) + v,
      },
      // ⚠ E no registo da casa (15/09/2026). O orçamento dos dois adultos muda,
      // e o sítio que existe para responder a «quem mudou isto?» ficava calado
      // — era uma das cinco operações de dinheiro sem rasto, ao lado de todas
      // as outras que registam.
      registo: maisRegisto(x, `${EUR(v)} movidos de ${deNome} para ${paraNome}`, 'Dinheiro'),
    }));

    if (sync) {
      const ses = sync.sessao();
      const idDe = (s.envelopesDaCasa || []).find(e => e.name === deNome);
      const idPara = (s.envelopesDaCasa || []).find(e => e.name === paraNome);
      // Sem envelopes do servidor não há para onde mandar a transferência — a
      // casa ainda corre com as sementes, e o movimento fica local.
      if (ses && idDe && idPara) sync.transferenciaEntreEnvelopes({
        casa: ses.casa, de: idDe.id, para: idPara.id, valor: v,
        mes: TODAY_KEY.replace(/^d/, ''), por: ses.membro,
      }).catch(() => {});
    }
  };

  // ── Os envelopes: criar, alterar e apagar ───────────────────────────────
  const envelopeNoServidor = (nome) =>
    ((s.envelopesDaCasa || []).find(e => e.name === nome) || {}).id || null;

  // ── Os corredores da loja ─────────────────────────────────────────────────
  //
  // A ordem É o dado: uma secção não é só um nome, é o lugar dela no percurso.
  // Por isso a lista é ORDENADA e não um conjunto.
  //
  // ⚠ E o artigo guarda o NOME do corredor, não o índice. Era `i.s = 0..3`, um
  // índice numa lista de quatro nomes fixos; a partir do momento em que a casa
  // os pode reordenar, um índice aponta para outra coisa a cada mudança — a
  // mesma armadilha da grelha de envelopes que mostrava uma lista e aplicava
  // outra.
  const seccoes = (s.seccoesDaCasa || []).length ? s.seccoesDaCasa : SECTIONS;

  // Materializa-se antes de se lhe mexer, como os envelopes: enquanto ninguém
  // lhes tocar, a lista são as sementes e o `seccoesDaCasa` está vazio.
  const listaDeSeccoes = (x) => ((x.seccoesDaCasa || []).length ? x.seccoesDaCasa : [...SECTIONS]);

  const seccaoNoServidor = (nome) => ((s.listasIds || {}).seccoes || {})[nome] || null;

  // ── O ícone de um corredor ────────────────────────────────────────
  //
  // 25/09/2026, desenho 3 com a 2 por trás: o nome sugere, a família decide.
  // A decisão é que manda, e não se perde quando o corredor muda de nome.
  // ⚠ Calcula-se para a LISTA INTEIRA, e não corredor a corredor: é isso que
  // garante que não há dois iguais («não repitas icons nas secções»). Ver o
  // `iconesDosCorredores`.
  const iconesDeTodosOsCorredores = () => iconesDosCorredores(seccoes, s.iconesDeSeccao || {});

  // ⚠ O interruptor «sem ícones» (25/09/2026, «deve haver uma opção slider a
  // dizer sem ícones»). Pela POSITIVA aqui e pela negativa no dado, como o
  // `ementaNaCasa`: quem lê pergunta «há ícones?» e não «não estão desligados?».
  const iconesNosCorredores = s.iconesDesligados !== true;

  // ⚠ Desligado, isto devolve `null` — e é de propósito. O sítio onde a
  // decisão se toma é UM, e nenhum ecrã pode mostrar um ícone que a casa
  // desligou por se ter esquecido de perguntar. Quem desenhar o resultado tem
  // de o tratar: um `null` no `<Icon name>` dá um SVG VAZIO do tamanho pedido
  // — um buraco de 19 px, sem erro nenhum —, e o guarda
  // `__tests__/a-casa-pode-ficar-sem-icones.test.js` enumera os ecrãs e chumba
  // quem o deixe passar. O `SectionTitle` já trata do `icone` ausente.
  const iconeDaSeccao = (nome) => (iconesNosCorredores
    ? (iconesDeTodosOsCorredores()[nome] || ICONE_POR_ESCOLHER)
    : null);
  // Os corredores que ainda ninguém marcou — o ecrã de administração di-lo em
  // vez de deixar a pessoa contar as caixas.
  const corredoresSemIcone = () => corredoresPorEscolher(seccoes, s.iconesDeSeccao || {});
  // De quem é cada ícone — a grelha de escolher precisa disto para dizer «este
  // já é do Talho» em vez de o tirar a outro sem avisar.
  const donoDosIcones = () => donoDeCadaIcone(seccoes, s.iconesDeSeccao || {});

  // ⚠ `null` (ou o mesmo que a adivinha daria) volta a pôr o corredor à solta:
  // a entrada SAI do mapa em vez de ficar lá a repetir o palpite. Uma escolha
  // que diz o mesmo que a sugestão não é uma escolha — e se um dia a tabela
  // melhorar, esse corredor acompanha-a em vez de ficar preso ao que dizia hoje.
  const escolherIconeDaSeccao = (nome, icone) => {
    const n = String(nome || '').trim();
    if (!n) return;
    // ⚠ A `caixa` é desistir de escolher, e por isso SAI do mapa em vez de
    // ficar lá escrita. Guardar «escolhi a caixa» e «ainda não escolhi» como
    // coisas diferentes dava dois estados que se desenham igual — e um deles
    // ficava para sempre, sem maneira de o distinguir do outro.
    const solto = !icone || icone === ICONE_POR_ESCOLHER;
    set(x => {
      const mapa = { ...(x.iconesDeSeccao || {}) };
      if (solto) delete mapa[n]; else mapa[n] = icone;
      return { iconesDeSeccao: mapa };
    });
    const id = seccaoNoServidor(n);
    if (sync && id) sync.iconeDaSeccao(id, solto ? '' : icone).catch(() => {});
  };

  const criarSeccao = (nome) => {
    const n = String(nome || '').trim();
    if (!n) return 'A secção precisa de um nome.';
    if (listaDeSeccoes(s).some(x => x.toLowerCase() === n.toLowerCase())) {
      return 'Já existe uma secção com esse nome.';
    }
    let posto = 0;
    set(x => {
      const lista = [...listaDeSeccoes(x), n];
      posto = lista.length;
      return { seccoesDaCasa: lista };
    });
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.criarSeccao({ casa: ses.casa, nome: n, posto })
        // O id guarda-se para que renomear, apagar e reordenar tenham para
        // onde ir — como nas outras listas da casa.
        .then(r => { if (r && r.id) set(x => ({
          listasIds: { ...x.listasIds, seccoes: { ...(x.listasIds || {}).seccoes, [n]: r.id } },
        })); })
        .catch(() => {});
    }
    return null;
  };

  // ⚠ Renomear reescreve os ARTIGOS, porque a chave é o nome. É o mesmo que o
  // `alterarEnvelope` faz com o `monthLimits`: uma lista que muda de nome e
  // deixa as linhas a apontar para o nome velho é uma lista partida.
  const alterarSeccao = (nome, novoNome) => {
    const n = String(novoNome || '').trim();
    if (!n || n === nome) return null;
    if (listaDeSeccoes(s).some(x => x !== nome && x.toLowerCase() === n.toLowerCase())) {
      return 'Já existe uma secção com esse nome.';
    }
    const id = seccaoNoServidor(nome);
    if (sync && id) sync.renomearSeccao(id, n).catch(() => {});
    set(x => ({
      seccoesDaCasa: listaDeSeccoes(x).map(v => (v === nome ? n : v)),
      newItems: (x.newItems || []).map(a => (a.s === nome ? { ...a, s: n } : a)),
      listasIds: {
        ...(x.listasIds || {}),
        seccoes: Object.fromEntries(Object.entries((x.listasIds || {}).seccoes || {})
          .map(([k, v]) => [k === nome ? n : k, v])),
      },
    }));
    return null;
  };

  // ⚠ Apagar uma secção NÃO apaga os artigos dela: passam para a primeira que
  // sobrar. Um artigo sem corredor desaparecia de todas as abas menos «Todos»,
  // e ninguém saberia porquê.
  const apagarSeccao = (nome) => {
    const lista = listaDeSeccoes(s);
    if (lista.length <= 1) return 'A casa tem de ter pelo menos uma secção.';
    const sobra = lista.find(v => v !== nome) || null;
    const id = seccaoNoServidor(nome);
    if (sync && id) sync.apagarSeccao(id).catch(() => {});
    set(x => ({
      seccoesDaCasa: listaDeSeccoes(x).filter(v => v !== nome),
      newItems: (x.newItems || []).map(a => (a.s === nome ? { ...a, s: sobra } : a)),
    }));
    // E os artigos que mudaram de corredor sobem, senão o outro telemóvel
    // continuava a vê-los na secção apagada.
    if (sync && sobra) {
      const idSobra = seccaoNoServidor(sobra);
      for (const a of (s.newItems || [])) {
        if (a.s === nome && a.idServidor) sync.mudarCorredor(a.idServidor, idSobra).catch(() => {});
      }
    }
    return null;
  };

  // A ordem nova, inteira. ⚠ Recebe NOMES e não índices, pela mesma razão de
  // sempre — e recusa uma lista que não seja a mesma gente, senão uma ordem
  // parcial apagava as que ficaram de fora.
  const reordenarSeccoes = (nomes) => {
    const nova = (Array.isArray(nomes) ? nomes : []).filter(Boolean);
    const antiga = listaDeSeccoes(s);
    if (nova.length !== antiga.length) return 'A ordem tem de ter todas as secções.';
    if (new Set(nova).size !== nova.length) return 'A mesma secção aparece duas vezes.';
    if (nova.some(n => !antiga.includes(n))) return 'Essa secção não existe nesta casa.';
    set(() => ({ seccoesDaCasa: nova }));
    if (sync) {
      const ids = nova.map(n => seccaoNoServidor(n)).filter(Boolean);
      if (ids.length === nova.length) sync.reordenarSeccoes(ids).catch(() => {});
    }
    return null;
  };

  // ⚠ A lista da casa MATERIALIZA-SE antes de se lhe mexer.
  //
  // Enquanto ninguém toca nos envelopes, a lista são as sementes do `data.js` e
  // o `envelopesDaCasa` está vazio. No momento em que a casa cria, apaga ou
  // renomeia um, passa a ser dona da lista inteira — senão criar «Férias»
  // deixava a casa com UM envelope e os outros quatro desapareciam.
  // ⚠ E o `used` das sementes acompanha (15/09/2026): materializar a lista sem
  // ele apagava o gasto de toda a casa numa app sem servidor.
  const listaDeEnvelopes = (x) => ((x.envelopesProprios || (x.envelopesDaCasa || []).length)
    ? (x.envelopesDaCasa || [])
    : ENV_BASE.map(e => ({ id: null, name: e.name, limit: e.limit, color: e.color || null, used: e.used || 0 })));

  // ⚠ E escreve-se LOCAL PRIMEIRO, como tudo o resto nesta app.
  //
  // Isto só escrevia no `monthLimits` e esperava pelo servidor para pôr a
  // linha na lista. Numa casa sem servidor — que é como esta app corria antes
  // de haver um, e como corre quando a rede falha — criar um envelope não
  // acrescentava nada à lista: mexia num mapa de limites que o ecrã nem lê.
  const criarEnvelope = (nome, limite = 500) => {
    const n = String(nome || '').trim();
    if (!n) return;
    set(x => ({
      envelopesProprios: true,
      envelopesDaCasa: [...listaDeEnvelopes(x), { id: null, name: n, limit: limite, color: null }],
      monthLimits: { ...(x.monthLimits || {}), [n]: limite },
      // ⚠ E no registo da casa (15/09/2026): um envelope novo soma ao orçamento
      // da casa, e era uma das cinco escritas de dinheiro sem rasto.
      registo: maisRegisto(x, `Envelope «${n}» criado · limite ${EUR(limite)}`, 'Dinheiro'),
    }));
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.criarEnvelope({ casa: ses.casa, nome: n, limite })
        // O `id` do servidor cola-se à linha que já existe cá, e não cria uma
        // segunda: sem isto o envelope aparecia a dobrar assim que a resposta
        // chegasse.
        .then((r) => { if (r && r.id) set(x => ({
          envelopesDaCasa: (x.envelopesDaCasa || []).map(e => (
            e.name === n && !e.id ? { ...e, id: r.id } : e)),
        })); })
        .catch(() => {});
    }
  };

  // ⚠ O `monthLimits` é indexado pelo NOME, e por isso tem de acompanhar o
  // nome. Renomear mudava a lista e deixava o ajuste debaixo do nome antigo:
  // o envelope voltava ao limite de base e o orçamento continuava a contar o
  // ajuste de um envelope que já não se chama assim.
  const alterarEnvelope = (nome, campos) => {
    const id = envelopeNoServidor(nome);
    if (sync && id) sync.alterarEnvelope(id, campos).catch(() => {});
    set(x => {
      const limites = { ...(x.monthLimits || {}) };
      const novoNome = campos.nome && campos.nome !== nome ? campos.nome : nome;
      let lista = listaDeEnvelopes(x);

      if (novoNome !== nome) {
        lista = lista.map(e => (e.name === nome ? { ...e, name: novoNome } : e));
        if (nome in limites) { limites[novoNome] = limites[nome]; delete limites[nome]; }
      }
      // E o limite muda AQUI e não só no servidor: sem isto, mudar um limite
      // não mexia no orçamento até à leitura seguinte.
      if ('limite' in campos) {
        const v = Number(campos.limite) || 0;
        lista = lista.map(e => (e.name === novoNome ? { ...e, limit: v } : e));
        if (novoNome in limites) limites[novoNome] = v;
      }
      return { envelopesProprios: true, envelopesDaCasa: lista, monthLimits: limites,
        registo: maisRegisto(x, novoNome !== nome
          ? `Envelope «${nome}» passou a «${novoNome}»`
          : `Envelope «${novoNome}»: limite ${EUR(Number(campos.limite) || 0)}`, 'Dinheiro') };
    });
  };

  // ⚠ E o ajuste do mês sai COM o envelope. Ficava para trás, e o orçamento
  // continuava a contar o limite de um envelope apagado — o «Disponível» do
  // Início ficava alto e ninguém percebia de onde vinha a diferença.
  const apagarEnvelope = (nome) => {
    const id = envelopeNoServidor(nome);
    if (sync && id) sync.apagarEnvelope(id).catch(() => {});
    set(x => {
      const limites = { ...(x.monthLimits || {}) };
      delete limites[nome];
      return {
        envelopesProprios: true,
        envelopesDaCasa: listaDeEnvelopes(x).filter(e => e.name !== nome),
        monthLimits: limites,
        registo: maisRegisto(x, `Envelope «${nome}» apagado`, 'Dinheiro'),
      };
    });
  };

  // ── O mês: abrir e fechar ───────────────────────────────────────────────
  //
  // ⚠ Fechar o mês fazia `registered: 0` e `envMove: {}` — escrever zero por
  // cima de duas SOMAS. Enquanto tudo era local funcionava por acidente: o
  // total era um campo, e zerá-lo zerava-o.
  //
  // Com as despesas e as transferências como linhas no servidor, deixa de
  // funcionar: as linhas ficam, e a leitura seguinte traz o total todo de
  // volta. O mês fechado reabria sozinho.
  //
  // O modelo certo é o que a coleção `meses` já previa: o mês ABERTO é o que
  // não tem `fechado_em`, e os totais são as somas FILTRADAS por ele. Não há
  // nada a zerar — o mês seguinte começa do zero por ser outra soma.
  const mesNoServidor = () => (s.mes || {}).idServidor || null;

  const abrirMes = ({ nome, limites, rendimento }) => {
    set(x => ({
      monthLimits: limites,
      monthZero: false,
      monthName: nome,
      registo: maisRegisto(x, `Mês de ${nome} aberto`, 'Dinheiro'),
      // ⚠ O `registered` e o `envMove` NÃO se zeram à mão. Sem servidor ficam
      // como estão até haver despesas do mês novo; com servidor, a leitura
      // seguinte traz as somas já filtradas.
      ...(comServidor() ? {} : { registered: 0, gastoLocal: {}, envMove: {} }),
    }));

    if (!sync) return;
    const ses = sync.sessao();
    if (!ses) return;
    // Fecha-se o anterior antes de abrir o seguinte: dois meses abertos ao
    // mesmo tempo tornavam o «mês aberto» uma escolha ao acaso.
    const anterior = mesNoServidor();
    const acao = anterior
      ? sync.alterarMes(anterior, { fechadoEm: TODAY_KEY }).catch(() => {})
      : Promise.resolve();
    acao.then(() => sync.abrirMes({
      casa: ses.casa, mes: TODAY_KEY, rendimento: rendimento ?? s.rendimento, limites,
    }))
      .then((r) => { if (r && r.id) set(x => ({ mes: { ...x.mes, idServidor: r.id } })); })
      .catch(() => {});
  };

  const fecharMes = () => {
    set(x => ({
      // ⚠ Com servidor NADA se zera aqui, e é a lição do mês que reabria
      // sozinho: `acertoMovs` e `paidPts` são somas de linhas que ficam no
      // servidor, e escrever zero por cima delas dura até à leitura seguinte.
      // O mês novo começa limpo por ser OUTRA soma — os acertos filtram-se pelo
      // mês, e os pontos pagos acompanham as tarefas que os ganharam.
      ...(comServidor() ? {} : {
        acertoMovs: [],
        paidPts: Object.fromEntries(criancas.map(n => [n, 0])),
        registered: 0,
        // ⚠ O `gastoLocal` anda com o `registered`: são o total e a repartição
        // do MESMO mês. Zerar um e deixar o outro punha o «Gasto» a zero com
        // os envelopes ainda a mostrar o mês anterior.
        gastoLocal: {},
        envMove: {},
      }),
      registo: maisRegisto(x, `Mês de ${x.monthName} fechado · ${EUR(x.registered || 0)} gastos`, 'Dinheiro'),
    }));
    const id = mesNoServidor();
    if (sync && id) {
      sync.alterarMes(id, { fechadoEm: TODAY_KEY })
        .then(() => set(x => ({ mes: null })))
        .catch(() => {});
    }
  };

  const mudarLimiteDoMes = (envelope, limite) => {
    set(x => ({ monthLimits: { ...(x.monthLimits || {}), [envelope]: limite } }));
    const id = mesNoServidor();
    if (sync && id) {
      sync.alterarMes(id, { limites: { ...(s.monthLimits || {}), [envelope]: limite } })
        .catch(() => {});
    }
  };

  // ── As preferências de cada um ──────────────────────────────────────────
  //
  // ⚠ A coleção `preferencias` é a única que NÃO é da casa: a regra é `membro =
  // @request.auth.id` nas cinco operações, e cada um vê e escreve as suas — nem
  // quem administra vê as dos outros.
  //
  // Por isso isto só escreve as de QUEM ESTÁ LIGADO. Mudar as de outra pessoa
  // seria recusado pelo servidor, e não faz sentido nenhum: a cor do avatar do
  // Tomás é dele.
  const mudarPreferencia = (quem, campos) => {
    set(x => ({
      ...(campos.esquema !== undefined
        ? { schemeByUser: { ...x.schemeByUser, [quem]: campos.esquema } } : {}),
      ...(campos.aspeto !== undefined
        ? { themeByUser: { ...x.themeByUser, [quem]: campos.aspeto } } : {}),
      ...(campos.notif !== undefined
        ? { notif: { ...x.notif, ...campos.notif } } : {}),
    }));

    if (!sync) return;
    const ses = sync.sessao();
    // ⚠ Só as do próprio. Se `quem` não for quem está ligado, fica local — e é
    // o correcto: o servidor recusaria, e a app não deve fingir que mandou.
    if (!ses || ses.nome !== quem) return;

    const n = { ...s.notif, ...(campos.notif || {}) };
    sync.preferenciasDoMembro({
      membro: ses.membro,
      ...(campos.esquema !== undefined ? { esquemaCor: campos.esquema } : {}),
      ...(campos.aspeto !== undefined ? { aspeto: campos.aspeto } : {}),
      ...(campos.notif !== undefined ? {
        resumoAtivo: n.digest, resumoHora: n.hour, avisoPrazoDias: n.lead,
      } : {}),
    }).catch(() => {});
  };

  // ── As três listas da casa ──────────────────────────────────────────────
  //
  // Especialidades, categorias de equipamento e lojas. Uma porta só: as três
  // têm a mesma forma no servidor, e três caminhos separados eram três sítios
  // onde a quarta lista se ia esquecer.
  //
  // A loja continua a guardá-las como listas de TEXTO — é o que os ecrãs leem —
  // e o `listasIds` guarda o `nome → id` que permite renomear e apagar lá.
  const idNaLista = (chave, nome) => ((s.listasIds || {})[chave] || {})[nome] || null;

  const listaAcrescenta = (chave, nome) => {
    const n = String(nome || '').trim();
    if (!n) return;
    if (sync) {
      const ses = sync.sessao();
      if (ses) sync.acrescentarNaLista(chave, { casa: ses.casa, nome: n })
        // O id guarda-se para que renomear e apagar tenham para onde ir.
        .then((r) => { if (r && r.id) set(x => ({
          listasIds: { ...x.listasIds, [chave]: { ...(x.listasIds || {})[chave], [n]: r.id } },
        })); })
        .catch(() => {});
    }
  };

  const listaRenomeia = (chave, antigo, novo) => {
    const id = idNaLista(chave, antigo);
    if (sync && id) sync.renomearNaLista(chave, id, novo).catch(() => {});
    // O mapa segue o nome, senão a segunda alteração não encontrava o id.
    set(x => {
      const mapa = { ...((x.listasIds || {})[chave] || {}) };
      if (mapa[antigo]) { mapa[novo] = mapa[antigo]; delete mapa[antigo]; }
      return { listasIds: { ...x.listasIds, [chave]: mapa } };
    });
  };

  const listaApaga = (chave, nome) => {
    const id = idNaLista(chave, nome);
    if (sync && id) sync.apagarDaLista(chave, id).catch(() => {});
    set(x => {
      const mapa = { ...((x.listasIds || {})[chave] || {}) };
      delete mapa[nome];
      return { listasIds: { ...x.listasIds, [chave]: mapa } };
    });
  };

  // Para as listas que os ecrãs ainda mudam por `set`: muda e sobe, numa vez.
  //
  // Descobre-se o que mudou comparando as duas listas — é mais simples do que
  // pedir a quem chama que o diga, e não há como enganar-se sobre a operação.
  const mudarListaDaCasa = (chave, proxima) => {
    const antes = s[chave] || [];
    // ⚠ A LOJA DA IDA é um índice nesta lista, e um índice não sobrevive a uma
    // linha apagada (15/09/2026). Apagar «Continente de Belém» deixava o
    // `shopPlan.store` a 0 e a ida passava, em silêncio, a ser no «Pingo Doce
    // da Ajuda» — e o histórico de preços da ida inteira ia para a loja errada,
    // que é o dado que sustenta o conselho «esta lista sai mais barata no X».
    // Aqui resolve-se o NOME antes de a lista mudar, e volta a escrever-se como
    // nome: o `lojaDoPlano` lê as duas formas, e a partir daqui nunca mais há
    // índices por resolver.
    const lojaAntes = chave === 'stores' ? lojaDoPlano() : null;
    set({ [chave]: proxima });
    if (chave === 'stores') {
      const fica = lojaAntes && proxima.includes(lojaAntes) ? lojaAntes : null;
      set(x => ({ shopPlan: { ...(x.shopPlan || {}), store: fica } }));
    }

    const entraram = proxima.filter(n => !antes.includes(n));
    const sairam = antes.filter(n => !proxima.includes(n));

    // ⚠ Um a sair e um a entrar é um RENOMEAR, não apagar-e-criar. A diferença
    // importa: uma loja apagada leva atrás — ou trava — as listas de compras
    // que a referem, e voltaria com id novo e sem histórico. O renomear guarda
    // a linha e muda-lhe o nome.
    //
    // A posição confirma-o: renomear troca o nome NO SÍTIO, e criar acrescenta
    // ao fim. Sem esta segunda condição, apagar um e criar outro na mesma
    // gravação passava por renomear.
    if (entraram.length === 1 && sairam.length === 1
        && proxima.indexOf(entraram[0]) === antes.indexOf(sairam[0])) {
      listaRenomeia(chave, sairam[0], entraram[0]);
      return;
    }

    for (const nome of entraram) listaAcrescenta(chave, nome);
    for (const nome of sairam) listaApaga(chave, nome);
  };

  // ── Mudar uma regra da casa ─────────────────────────────────────────────
  //
  // Uma porta só para o valor do ponto, o dia de pagamento, a divisão a meias,
  // o interruptor dos pontos e o rendimento. A Gestão chamava `set(...)`
  // direto, e enquanto nada subia dava no mesmo — a partir do momento em que
  // sobe, cada `set` solto é uma regra que fica num telefone.
  //
  // ⚠ Recebe os nomes da LOJA e traduz-se no `sync`, num sítio só.
  const mudarRegraDaCasa = (campos) => {
    set(campos);
    if (sync) {
      const ses = sync.sessao();
      if (ses && ses.casa) sync.regrasDaCasa(ses.casa, campos).catch(() => {});
    }
  };

  // ── O orçamento: rendimento, e por mês ou para o ano ──────────────────────
  //
  // Uma porta só para os três botões do separador Orçamento da Gestão:
  //   { rendimento }  o rendimento mensal (modo mensal)
  //   { modo }        'anual' parte do que a casa já tem a doze vezes; 'mensal'
  //                   fica com o rendimento do mês em que se estava
  //   { total }       o rendimento do ANO (modo anual); redistribui por igual
  //   { meses }       os doze valores, à mão — têm de somar o total
  // Sobe para a casa como o `rendimento` e as outras regras: é da CASA, e o
  // outro adulto tem de ver o mesmo orçamento.
  const definirOrcamento = ({ rendimento, modo, total, meses }) => {
    const atual = normalizarOrcamento(s.orcamento);
    const mes = new Date().getMonth();
    const ano = atual.ano || new Date().getFullYear();
    let campos = {};
    if (rendimento !== undefined) campos.rendimento = Math.max(0, Number(rendimento) || 0);
    if (modo === 'anual' && atual.modo !== 'anual') {
      campos.orcamento = doMensalParaAnual(s.rendimento, ano);
    } else if (modo === 'mensal' && atual.modo === 'anual') {
      campos = { ...campos, ...doAnualParaMensal(atual, mes) };
    }
    const base = campos.orcamento || atual;
    if (base.modo === 'anual' && total !== undefined && Array.isArray(meses)) {
      // Os dois de uma vez: o ano muda de total E fica com esta distribuição
      // (um mês alterado à mão, sem tirar aos outros).
      campos.orcamento = { ...base, total: Math.max(0, Number(total) || 0), meses: meses.map(Number) };
    } else if (base.modo === 'anual' && total !== undefined) {
      campos.orcamento = { ...base, total: Math.max(0, Number(total) || 0), meses: null };
    } else if (base.modo === 'anual' && Array.isArray(meses)) {
      campos.orcamento = { ...base, meses: meses.map(Number) };
    }
    if (!Object.keys(campos).length) return;
    mudarRegraDaCasa(campos);
  };

  // ── Criar uma tarefa ────────────────────────────────────────────────────
  //
  // ⚠ Isto vivia dentro da folha «Nova Tarefa», que escrevia direto no `set`.
  // Enquanto nada subia, dava no mesmo; a partir do momento em que sobe, uma
  // escrita na folha é uma escrita sem sítio onde a sincronização possa viver —
  // e a folha seguinte que alguém acrescentasse esquecia-se dela.
  const criarTarefa = ({ title, who, recur, pts, urg: urgencia, dueKey, dueTime }) => {
    const t = String(title || '').trim();
    if (!t) return null;
    const id = 'tsk-' + Date.now();
    set(x => ({
      newTasks: [...(x.newTasks || []), { id, title: t, who, recur, pts: Number(pts) || 0 }],
      urg: { ...x.urg, [id]: Number.isFinite(Number(urgencia)) ? Number(urgencia) : 1 },
      due: dueKey ? { ...x.due, [id]: { key: dueKey, time: dueTime || '18:00' } } : x.due,
      registo: maisRegisto(x, `Tarefa «${t}» criada${who ? ` para ${who}` : ''}`, 'Tarefas'),
    }));

    if (sync) {
      const ses = sync.sessao();
      const atribuidoA = idDoMembro(who);
      if (ses) sync.tarefaDaCasa({
        casa: ses.casa, titulo: t, atribuidoA,
        recorrencia: recur, pontos: Number(pts) || 0,
        urgencia, prazo: dueKey || null, prazoHora: dueTime || null,
      })
        // O id do servidor guarda-se para que marcar, alterar e apagar tenham
        // para onde ir. Sem ele, a tarefa fica partilhada e imutável.
        .then((r) => { if (r && r.id) set(x => ({
          newTasks: (x.newTasks || []).map(n => (n.id === id ? { ...n, idServidor: r.id } : n)),
        })); })
        .catch(() => {});
    }
    return id;
  };

  // ── Editar uma tarefa ───────────────────────────────────────────────────
  //
  // ⚠ As alterações vivem num mapa `taskEdits` porque uma SEMENTE não se pode
  // editar no sítio. Uma tarefa que veio do servidor não é semente: essa
  // altera-se lá, e é o que a segunda metade faz.
  //
  // O `sync.alterarTarefa` existia e ninguém o chamava — a folha de gerir
  // escrevia direto no `taskEdits`, e reatribuir uma tarefa ficava no telefone
  // de quem a reatribuiu.
  const editarTarefa = (id, campos) => {
    set(x => ({
      taskEdits: { ...x.taskEdits, [id]: { ...(x.taskEdits[id] || {}), ...campos } },
    }));
    const noServidor = tarefaNoServidor(id);
    if (sync && noServidor) sync.alterarTarefa(noServidor, {
      ...(campos.title !== undefined ? { titulo: campos.title } : {}),
      ...(campos.who !== undefined ? { atribuidoA: idDoMembro(campos.who) } : {}),
      ...(campos.pts !== undefined ? { pontos: campos.pts } : {}),
      ...(campos.recur !== undefined ? { recorrencia: campos.recur } : {}),
    }).catch(() => {});
  };

  // A urgência e o prazo vivem em MAPAS (`urg`, `due`), não na tarefa — e por
  // isso não passam pelo `editarTarefa`. Passavam por um `set` direto do ecrã
  // das Tarefas, e ficavam só neste telemóvel: o outro adulto via a ordem
  // antiga. É a classe «ecrã a escrever no estado por fora da loja»
  // (revisão de 13/09/2026). O servidor tem `urgencia` e `prazo` desde o início.
  const mudarUrgencia = (id, urgencia) => {
    const n = Number.isFinite(Number(urgencia)) ? Number(urgencia) : 1;
    set(x => ({ urg: { ...x.urg, [id]: n } }));
    const noServidor = tarefaNoServidor(id);
    if (sync && noServidor) sync.alterarTarefa(noServidor, { urgencia: n }).catch(() => {});
  };
  // `prazo` é `{ key, time }` ou `null` para tirar o prazo.
  const mudarPrazo = (id, prazo) => {
    set(x => {
      const due = { ...x.due };
      if (prazo && prazo.key) due[id] = { key: prazo.key, time: prazo.time || '18:00' };
      else delete due[id];
      return { due };
    });
    const noServidor = tarefaNoServidor(id);
    // ⚠ A hora vai JUNTO (15/09/2026): só a data subia, e a leitura seguinte
    // punha todas as tarefas com prazo às 00:00, ou seja «atrasadas» desde a
    // meia-noite.
    if (sync && noServidor) sync.alterarTarefa(noServidor, {
      prazo: prazo && prazo.key ? prazo.key : null,
      prazoHora: prazo && prazo.time ? prazo.time : null,
    }).catch(() => {});
  };

  // O `id` de uma tarefa no servidor. Nulo enquanto ela for só local.
  const tarefaNoServidor = (id) =>
    (allTasks().find(t => t.id === id) || {}).idServidor || null;

  // Tarefa: por fazer → (criança) a confirmar → (adulto) concluída
  // Recorrentes: rastrear quando foram resetadas hoje para reassumir amanhã
  //
  // ⚠ O cálculo do estado seguinte saiu de dentro do `set` para uma função
  // pura, e é de propósito: a decisão do que SOBE depende do estado que vai
  // ficar, e recalculá-la à parte era escrever a mesma lógica duas vezes — com
  // a segunda a ficar mais fraca, como já aconteceu com o `canSeeHealth`.
  const proximoEstadoDaTarefa = (x, id, byChild) => {
    const task = allTasks().find(t => t.id === id);
    const done = !!x.done[id], pend = !!x.pending[id];
    const isRecur = task && isRecurring(task);

    if (byChild) return pend || done
      ? { pending: { ...x.pending, [id]: false }, done: { ...x.done, [id]: false } }
      : { pending: { ...x.pending, [id]: true } };

    if (pend) {
      return {
        pending: { ...x.pending, [id]: false },
        done: { ...x.done, [id]: true },
        ...(isRecur ? { recurringReset: { ...x.recurringReset, [id]: TODAY_KEY } } : {}),
      };
    }

    return {
      done: { ...x.done, [id]: !done },
      pending: { ...x.pending, [id]: false },
      ...(isRecur && !done ? { recurringReset: { ...x.recurringReset, [id]: TODAY_KEY } } : {}),
    };
  };

  const tapTask = (id, byChild) => {
    const patch = proximoEstadoDaTarefa(s, id, byChild);
    set(patch);

    // ── E sobe, como uma LINHA ────────────────────────────────────────────
    //
    // ⚠ Marcar CRIA uma linha em `tarefas_feitas`; desmarcar APAGA-A. Nunca se
    // escreve um booleano «feita» na tarefa — é o INVARIANTE #2, e o servidor
    // tem um índice único em (tarefa, dia) que faz dois telefones colidirem em
    // vez de se anularem.
    //
    if (!sync) return;
    const ses = sync.sessao();
    const tarefa = tarefaNoServidor(id);
    if (!ses || !tarefa) return;          // tarefa ainda só local: nada a subir
    const hoje = TODAY_KEY.replace(/^d/, '');

    // ── O caminho da CRIANÇA: «a confirmar» ───────────────────────────────
    //
    // ⚠ Dizia aqui «se `done` não muda, não há nada a subir» — e a marcação
    // da criança nunca subia: ficava no telemóvel dela, e a mãe não a via.
    // Marcar cria a MESMA linha (sem `confirmada_em`: os pontos não contam
    // ainda); desmarcar apaga-a, e o servidor só deixa a criança apagar a
    // sua, enquanto ninguém a confirmou. Ligado em 10/09/2026.
    const mudouDone = 'done' in patch && !!patch.done[id] !== !!s.done[id];
    const mudouPend = 'pending' in patch && !!patch.pending[id] !== !!s.pending[id];
    if (byChild && !mudouDone && mudouPend) {
      if (patch.pending[id]) {
        sync.marcarTarefaFeita({ casa: ses.casa, tarefa, dia: TODAY_KEY, marcadaPor: ses.membro })
          .then((r) => { if (r && r.id) set(x => ({
            feitas: { ...x.feitas, [`${tarefa}|${hoje}`]: { id: r.id, confirmada: false } },
          })); })
          .catch(() => {});
      } else {
        const linha = (s.feitas || {})[`${tarefa}|${hoje}`];
        if (linha && !linha.confirmada) {
          sync.desmarcarTarefaFeita(linha.id)
            .then(() => set(x => {
              const { [`${tarefa}|${hoje}`]: fora, ...resto } = x.feitas || {};
              return { feitas: resto };
            }))
            .catch(() => {});
        }
      }
      return;
    }

    if (!mudouDone) return;
    const ficouFeita = !!patch.done[id];
    if (ficouFeita) {
      sync.marcarTarefaFeita({ casa: ses.casa, tarefa, dia: TODAY_KEY, marcadaPor: ses.membro })
        .then((r) => { if (r && r.id) {
          set(x => ({
            feitas: { ...x.feitas, [`${tarefa}|${hoje}`]: { id: r.id, confirmada: !byChild } },
          }));
          // ⚠ Quando é um ADULTO a dar por feita, isso É a confirmação — e é
          // ela que faz os pontos contarem. O campo `confirmada_em` estava no
          // esquema desde o início e nada o escrevia: os pontos de todas as
          // crianças ficavam por confirmar para sempre.
          //
          // Uma criança a marcar não confirma nada: fica `pending` na app, e
          // no servidor a linha fica sem `confirmada_em`. É a mesma regra.
          if (!byChild) sync.confirmarTarefaFeita(r.id, ses.membro).catch(() => {});
        } })
        .catch(() => {});
    } else {
      const linha = (s.feitas || {})[`${tarefa}|${hoje}`];
      if (!linha) return;
      sync.desmarcarTarefaFeita(linha.id)
        .then(() => set(x => {
          const { [`${tarefa}|${hoje}`]: fora, ...resto } = x.feitas || {};
          return { feitas: resto };
        }))
        .catch(() => {});
    }
  };

  // ── A troca de tarefas entre irmãos ─────────────────────────────────────
  //
  // «O lixo pelas plantas, só hoje.» Uma linha por troca, do dia (`trocas`);
  // a atribuição deriva-se no `allTasks` — a tarefa fica com quem a troca diz
  // — e à meia-noite acabou, sem nada para desfazer. O servidor é que manda
  // em quem pode o quê (só quem tem a tarefa propõe, só quem recebe aceita e
  // assina, só um adulto desfaz uma aceite); aqui repete-se o mínimo para a
  // app sem servidor dizer o mesmo que ele diria.
  // (12/09/2026 — a oitava das dez funcionalidades.)

  // As trocas de hoje, com os nomes e os títulos que os ecrãs mostram. Quem
  // propôs é o dono ORIGINAL da `de`; quem recebe, o dono original da `para`
  // — aceite, o `who` já veio trocado, e o original está em `trocadaCom`.
  const trocasDeHoje = () => {
    const tarefas = allTasks();
    return trocasDeHojeEm(s).map(tr => {
      const de = tarefas.find(t => t.id === tr.de);
      const para = tarefas.find(t => t.id === tr.para);
      if (!de || !para) return null;
      return {
        ...tr,
        tarefaDe: de.title, tarefaPara: para.title,
        quemDe: de.trocadaCom || de.who, quemPara: para.trocadaCom || para.who,
      };
    }).filter(Boolean);
  };
  const trocasDe = (kid) => trocasDeHoje().filter(tr => tr.quemDe === kid || tr.quemPara === kid);

  // Uma tarefa feita, «a confirmar», ou já numa troca de hoje não se troca.
  const numaTroca = (id) => trocasDeHojeEm(s).some(tr => tr.de === id || tr.para === id);
  // ⚠ Uma tarefa que ALTERNA entre as crianças não entra numa troca: a app
  // mostra-a com a criança da vez, mas no servidor o `atribuido_a` é o dono
  // de base, e a regra (`tarefa_de.atribuido_a = @request.auth.id`) recusava a
  // proposta — que ficava na fila a tentar para sempre e desaparecia da app
  // na leitura seguinte, sem uma palavra (revisão de 13/09/2026).
  const podeTrocar = (t) => !!t && !s.done[t.id] && !(s.pending || {})[t.id] && !numaTroca(t.id) && !s.rotate[t.id];

  // O que uma criança pode oferecer, e o que pode pedir aos irmãos.
  const tarefasParaTrocar = (kid) => {
    const tarefas = allTasks().filter(podeTrocar);
    return {
      minhas: tarefas.filter(t => t.who === kid),
      deles: tarefas.filter(t => t.who !== kid && criancas.includes(t.who)),
    };
  };

  const proporTroca = (kid, minhaId, deleId) => {
    if (!criancas.includes(kid)) return 'Só uma criança propõe uma troca.';
    const tarefas = allTasks();
    const minha = tarefas.find(t => t.id === minhaId);
    const dele = tarefas.find(t => t.id === deleId);
    if (!minha || !dele) return 'Escolha as duas tarefas.';
    if (minha.who !== kid) return 'A tarefa a dar tem de ser sua.';
    if (dele.who === kid || !criancas.includes(dele.who)) return 'A troca é com um irmão.';
    if (!podeTrocar(minha) || !podeTrocar(dele)) {
      return 'Uma tarefa feita, à espera de confirmação, que alterna ou já numa troca não se troca.';
    }
    // Sobe com os ids do servidor das duas tarefas. Com o servidor LIGADO, uma
    // tarefa ainda só local não tem troca que suba — e a linha local morria na
    // leitura seguinte (`trocas: casa.trocas`), depois de a criança a ter visto
    // «proposta». Diz-se antes, em vez de prometer. Sem servidor fica local,
    // como tudo o resto.
    const noServidorDe = tarefaNoServidor(minha.id);
    const noServidorPara = tarefaNoServidor(dele.id);
    if (sync && sync.ligado() && (!noServidorDe || !noServidorPara)) {
      return 'Uma destas tarefas ainda não chegou ao servidor. Tente daqui a um momento.';
    }
    const id = `troca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nova = { id, idServidor: null, dia: TODAY_KEY, de: minha.id, para: dele.id,
      propostaPor: kid, aceiteEm: null, aceitePor: null };
    set(x => ({
      // As de outros dias saem: nunca desfazem nada, e não vale a pena guardá-las.
      trocas: [...trocasDeHojeEm(x), nova],
      registo: maisRegisto(x, `Troca proposta ${deNome(kid)} ${kid} ${aoNome(dele.who)}: «${minha.title}» por «${dele.title}»`, 'Tarefas'),
    }));
    if (sync && noServidorDe && noServidorPara) {
      const ses = sync.sessao();
      if (ses) {
        sync.trocaDeTarefas({ casa: ses.casa, dia: TODAY_KEY, tarefaDe: noServidorDe,
          tarefaPara: noServidorPara, propostaPor: ses.membro })
          .then((r) => { if (r && r.id) set(x => ({
            trocas: (x.trocas || []).map(tr => (tr.id === id ? { ...tr, idServidor: r.id } : tr)),
          })); })
          .catch(() => {});
      }
    }
    return null;
  };

  const aceitarTroca = (kid, id) => {
    const tr = trocasDeHoje().find(x => x.id === id);
    if (!tr) return 'Essa troca já não existe.';
    if (tr.aceiteEm) return 'Essa troca já foi aceite.';
    if (tr.quemPara !== kid) return 'Só quem recebe a proposta a aceita.';
    const agora = agoraNaApp().toISOString();
    set(x => ({
      trocas: (x.trocas || []).map(t => (t.id === id ? { ...t, aceiteEm: agora, aceitePor: kid } : t)),
      registo: maisRegisto(x, `Troca aceite: «${tr.tarefaDe}» por «${tr.tarefaPara}» · ${tr.quemDe} e ${kid}, só hoje`, 'Tarefas'),
    }));
    if (sync && tr.idServidor) {
      const ses = sync.sessao();
      if (ses) sync.aceitarTrocaDeTarefas(tr.idServidor, ses.membro).catch(() => {});
    }
    return null;
  };

  // Recusar, retirar ou anular: é a mesma coisa — a linha sai. Quem recebeu
  // recusa e quem propôs retira, enquanto estiver por aceitar; um adulto
  // anula sempre.
  const desfazerTroca = (quem, id) => {
    const tr = trocasDeHoje().find(x => x.id === id);
    if (!tr) return 'Essa troca já não existe.';
    const adulto = adultos.includes(quem);
    if (!adulto && tr.aceiteEm) return 'Uma troca aceite só um adulto desfaz.';
    if (!adulto && tr.quemDe !== quem && tr.quemPara !== quem) return 'Essa troca não é sua.';
    const frase = adulto ? 'Troca anulada' : tr.quemDe === quem ? 'Proposta de troca retirada' : 'Troca recusada';
    set(x => ({
      trocas: (x.trocas || []).filter(t => t.id !== id),
      registo: maisRegisto(x, `${frase}: «${tr.tarefaDe}» por «${tr.tarefaPara}» · ${tr.quemDe} e ${tr.quemPara}`, 'Tarefas'),
    }));
    if (sync && tr.idServidor) sync.apagarTrocaDeTarefas(tr.idServidor).catch(() => {});
    return null;
  };

  // Editar e apagar um evento.
  //
  // `eventGone` e `eventEdits` já eram aplicados na leitura desde sempre — e
  // nenhum ecrã os escrevia. Infraestrutura sem porta: um evento com a hora
  // errada ficava com a hora errada, e um evento a mais ficava para sempre.
  //
  // Os remendos vão para `eventEdits` em vez de reescreverem o evento: as
  // sementes vivem no código e não se podem alterar, e um evento criado na app
  // é tratado da mesma maneira para não haver dois caminhos.
  // ⚠ As alterações vivem num mapa `eventEdits` porque uma SEMENTE não se pode
  // editar no sítio. Um evento que veio do servidor não é semente: esse
  // altera-se lá, e é o que a segunda metade faz.
  const editarEvento = (id, campos) => {
    set(x => ({
      eventEdits: { ...x.eventEdits, [id]: { ...(x.eventEdits[id] || {}), ...campos } },
    }));
    const noServidor = eventoNoServidor(id);
    if (sync && noServidor) {
      sync.alterarEvento(noServidor, eventoParaServidor(campos)).catch(() => {});
    }

    // ⚠ E a Google. Sem isto, mudar a hora de uma consulta deixava a agenda a
    // apitar à hora antiga — que é pior do que não ter lá nada, porque parece
    // certo.
    const ev = eventoInteiro(id, campos);
    empurrarParaGoogle({
      id, acao: 'alterar', idGoogle: idGoogleDe(id),
      corpo: paraGoogle(ev, { autor: ev.owner, emails: emailsDoEvento(ev) }),
    });
  };

  // Apagar é marcar como ido, não tirar da lista. As sementes não se conseguem
  // remover de outra maneira, e assim os dois casos comportam-se igual.
  //
  // ⚠ Mas um evento do SERVIDOR apaga-se lá: marcá-lo como ido só neste
  // telefone deixava-o na agenda do outro adulto para sempre.
  const removerEvento = (id) => {
    const noServidor = eventoNoServidor(id);
    if (sync && noServidor) sync.apagarEvento(noServidor).catch(() => {});
    // ⚠ Apagado aqui, apagado lá. Um evento que se apaga na app e fica na
    // Google é pior do que nunca lá ter ido.
    empurrarParaGoogle({ id, acao: 'apagar', idGoogle: idGoogleDe(id) });
    set(x => ({
      eventGone: { ...x.eventGone, [id]: true },
      registo: maisRegisto(x, 'Um evento foi apagado da agenda', 'Agenda'),
    }));
  };

  // Os eventos da casa que JÁ NÃO EXISTEM na agenda da Google.
  //
  // O apagar tinha um sentido só: apagado aqui, apagado lá. Ao contrário não
  // acontecia nada — um evento apagado na Google ficava nesta casa a apitar à
  // hora de uma coisa que já não existe, que é o mesmo defeito visto do outro
  // lado do espelho.
  //
  // ⚠ SÓ se consideram os eventos cujo dia cai DENTRO da janela que foi lida.
  //
  // Sem esse cuidado, um evento marcado para daqui a dois meses — fora dos
  // trinta dias que se pedem à Google — parecia apagado só por não vir na
  // resposta, e a app oferecia-se para o apagar. Perguntar antes salva a casa
  // de perder o evento, mas uma pergunta errada repetida a cada entrada é uma
  // forma lenta de ensinar alguém a dizer «sim» sem ler.
  //
  // Devolve os eventos, e não só os identificadores: quem pergunta tem de
  // poder dizer QUAIS.
  const eventosQueSairamDaGoogle = (idsNaGoogle, dias = 30) => {
    const presentes = new Set(idsNaGoogle || []);
    const hoje = new Date(TODAY.y, TODAY.m, TODAY.d);
    const fim = new Date(hoje.getTime() + dias * 86400000);
    return allEvents().filter(e => {
      if (!e.idGoogle || presentes.has(e.idGoogle)) return false;
      const p = /^d(\d{4})-(\d{2})-(\d{2})$/.exec(e.day || '');
      if (!p) return false;                       // sem dia legível, não se toca
      const quando = new Date(+p[1], +p[2] - 1, +p[3]);
      return quando >= hoje && quando < fim;
    });
  };

  // Os eventos da Google que esta casa CRIOU.
  //
  // Sem isto o ciclo fechava-se em cima de si próprio: agenda-se na app, o
  // evento vai para a agenda da Google, e da vez seguinte a importação lê-o de
  // lá e oferece-o como novidade. Quem aceitasse ficava com o mesmo almoço
  // duas vezes na agenda da casa, e sem maneira de perceber porquê.
  //
  // O identificador da Google já era guardado — em `eventEdits[id].idGoogle`,
  // para editar e apagar do lado de lá. Só faltava alguém o LER na direcção
  // contrária. É aqui, e não nas folhas, para a Agenda e o aviso automático
  // usarem a mesma resposta.
  const idsGoogleDaCasa = () => {
    const ids = new Set();
    for (const e of s.added || []) if (e && e.idGoogle) ids.add(e.idGoogle);
    for (const e of Object.values(s.eventEdits || {})) if (e && e.idGoogle) ids.add(e.idGoogle);
    return ids;
  };

  // ── Preços ────────────────────────────────────────────────────────────────
  const definirPrecoPago = (idArtigo, valor) => set(x => {
    const texto = String(valor == null ? '' : valor).trim().replace(',', '.');
    const v = Number(texto);
    // `Number('')` é ZERO, e `Number.isFinite(0)` é verdadeiro: apagar o campo
    // gravava «este artigo custou 0 €» em vez de tirar o rascunho. O campo
    // vazio distingue-se do zero pelo TEXTO, não pelo número — e o zero
    // escrito é legítimo, porque há artigos oferecidos.
    if (texto === '' || !Number.isFinite(v) || v < 0) {
      const { [idArtigo]: _fora, ...resto } = x.precoPago || {};
      return { precoPago: resto };
    }
    return { precoPago: { ...(x.precoPago || {}), [idArtigo]: Math.round(v * 100) / 100 } };
  });

  // Fechar a conta transforma o rascunho em histórico. É aqui, e não a cada
  // tecla: uma observação por dígito escrito enchia o histórico de preços que
  // nunca existiram.
  // O dia do plano de compras: o próximo domingo, enquanto ninguém escolher
  // outro que ainda esteja para vir.
  //
  // Era só o valor gravado, e por isso envelhecia: numa segunda-feira o ecrã
  // dizia «Compras de domingo · Domingo, 23/08» — um plano para um dia que já
  // lá ia. Uma migração corrige isso UMA vez; na semana seguinte volta.
  //
  // A ida às compras desta casa é ao domingo. Enquanto o dia gravado estiver
  // no passado, o que se mostra é o próximo domingo — e no dia em que alguém
  // marcar outra data, essa data manda, porque é uma escolha.
  const diaDoPlano = () => {
    const guardado = s.shopPlan ? s.shopPlan.day : null;
    const hoje = new Date(TODAY.y, TODAY.m, TODAY.d);
    const p = /^d(\d{4})-(\d{2})-(\d{2})$/.exec(guardado || '');
    if (p && new Date(+p[1], +p[2] - 1, +p[3]) >= hoje) return guardado;
    // getDay(): 0 é domingo. Se hoje for domingo, é hoje.
    return chaveRelativa((7 - hoje.getDay()) % 7);
  };

  // A loja do plano de compras, ou nada.
  //
  // Seis sítios liam `s.stores[s.shopPlan.store]` à mão. Numa casa sem lojas
  // — e uma casa nova não tem nenhuma — isso é ler uma posição que não existe,
  // e o ecrã escrevia «undefined» a seguir à hora. Aqui a resposta é uma só, e
  // é `null` quando não há loja escolhida.
  // ⚠ Aceita as DUAS formas: o NOME (o que se escreve desde 15/09/2026) e o
  // índice (o que está gravado nas casas de antes). Um índice não sobrevive a
  // uma loja apagada — ver o `mudarListaDaCasa`.
  const lojaDoPlano = () => {
    const lista = s.stores || [];
    const v = s.shopPlan ? s.shopPlan.store : null;
    if (typeof v === 'string') return lista.includes(v) ? v : null;
    return (typeof v === 'number' && lista[v]) ? lista[v] : null;
  };

  // ⚠ Sem loja não se grava histórico de preços.
  //
  // O histórico é «o que esta casa pagou, NAS lojas dela»: uma observação com
  // `loja: null` não responde a pergunta nenhuma — o `precosDe` filtra as que
  // não têm loja, portanto ficaria a ocupar espaço e a não contar para nada.
  // Melhor não a escrever do que escrever lixo.
  const registarPrecos = (artigos, loja, dia = TODAY_KEY) => set(x => {
    if (!loja) return {};
    const novas = (artigos || [])
      .filter(a => (x.precoPago || {})[a.id] > 0)
      .map(a => observacao({ rotulo: a.label, loja, valor: x.precoPago[a.id], dia }));
    // A chave da observação leva o artigo, o dia e o valor: registar a mesma
    // compra duas vezes não duplica o histórico.
    const jaLa = new Set((x.precos || []).map(o => o.id));
    return {
      precos: [...(x.precos || []), ...novas.filter(o => !jaLa.has(o.id))],
      precoPago: {},
    };
  });

  const isAdmin = (name) => s.roles[name] === 'admin';

  // Papéis: só criança→adulto e adulto↔admin. Nunca adulto→criança.
  const canChangeRole = (from, to) => {
    if (from === to) return false;
    if (to === 'crianca') return false;
    if (from === 'crianca' && to === 'admin') return false;
    return true;
  };

  const setRole = (name, role) => {
    // A recusa calcula-se ANTES: uma casa não fica sem administração, e se
    // ficasse o servidor recusava de qualquer modo (há um hook para isso).
    // Recusar aqui evita mandar uma escrita que se sabe que vai voltar.
    const admins = Object.entries(s.roles).filter(([n, r]) => r === 'admin' && n !== name);
    if (s.roles[name] === 'admin' && role !== 'admin' && admins.length === 0) return;

    set(x => ({
      roles: { ...x.roles, [name]: role },
      registo: maisRegisto(x, `${name} passou a ${role === 'admin' ? 'administração' : 'adulto'}`, 'Gestão da Casa'),
    }));

    // ⚠ E sobe. O papel é o que decide quem vê o orçamento, quem gere a casa e
    // quem lê as fichas de saúde — vive nas REGRAS do servidor, e mudá-lo só
    // no telefone não mudava nada de facto. A Rita promovia o Tomás e o
    // servidor continuava a recusar-lhe a Gestão.
    if (sync) {
      const id = idDoMembro(name);
      if (id) sync.editarMembro(id, { papel: role }).catch(() => {});
    }
  };

  // O avatar do próprio membro: a fotografia da conta, ou a inicial numa cor.
  //
  // ── Porque é uma escolha e não a fotografia sempre que ela existe ───────────
  //
  // Nem toda a gente quer a cara na app da casa, e quem entrou com a Google não
  // pediu por isso que a fotografia do perfil dela passasse a estar em cada
  // linha de tarefa. A fotografia fica GUARDADA — é grátis — mas quem a mostra
  // é esta escolha.
  //
  // A cor não é decoração: é o que distingue as pessoas no filtro da agenda, no
  // ponto do calendário e na barra da ficha de saúde. Duas iguais na mesma casa
  // tornam esses sítios ilegíveis, por isso a folha não deixa escolher uma que
  // já é de outro membro.
  //
  // Escreve LOCAL primeiro e no servidor a seguir, como tudo o resto nesta app
  // menos a limpeza da casa. Um avatar que não chega ao servidor é um avatar
  // que o outro telemóvel não vê — não é uma casa em dois estados.
  const definirAvatar = async (name, { cor, figura, usarFoto } = {}) => {
    set(x => ({
      membros: { ...x.membros, [name]: { ...x.membros[name],
        ...(cor !== undefined ? { cor } : {}),
        ...(figura !== undefined ? { figura } : {}),
        ...(usarFoto !== undefined ? { usarFoto: !!usarFoto } : {}) } },
    }));
    // A fotografia no servidor é o ENDEREÇO dela, e esse não muda com a
    // escolha — o que muda é mostrá-la ou não, e isso é deste aparelho. A COR
    // é que é da casa inteira: é ela que distingue as pessoas no filtro da
    // agenda e no ponto do calendário, e tem de ser a mesma nos dois telemóveis.
    if (cor === undefined && figura === undefined) return null;
    const sy = await carregarSync();
    if (!sy || !sy.ligado()) return null;
    try {
      await sy.guardarAspeto({
        ...(cor !== undefined ? { cor: cor || '' } : {}),
        ...(figura !== undefined ? { figura: figura || '' } : {}),
      });
      return null;
    } catch (e) { return e.message || 'O avatar não chegou ao servidor.'; }
  };

  // Ir buscar a fotografia da conta Google.
  //
  // Devolve `null` quando correu bem, e a mensagem quando não. Guarda no
  // membro o ENDEREÇO — a imagem fica na Google — e liga-a: quem carregou num
  // botão que diz «trazer a fotografia» quer vê-la, e obrigar a um segundo
  // toque a seguir seria fazer de conta que não se percebeu.
  const trazerFotografia = async (name) => {
    const sy = await carregarSync();
    if (!sy || !sy.ligado()) return 'A app está a correr sem servidor.';
    try {
      const foto = await sy.trazerFotografiaDaGoogle();
      set(x => ({ membros: { ...x.membros, [name]: {
        ...x.membros[name], avatar: foto, usarFoto: true } } }));
      return null;
    } catch (e) {
      return e.message || 'Não foi possível trazer a fotografia.';
    }
  };

  // PIN: recusa dígitos iguais, sequências, e reutilização
  const pinError = (name, pin) => {
    if (!/^\d{6}$/.test(pin)) return 'O PIN tem de ter 6 dígitos.';
    if (/^(\d)\1{5}$/.test(pin)) return 'Não pode ter os seis dígitos iguais.';
    const seq = '0123456789';
    if (seq.includes(pin) || seq.split('').reverse().join('').includes(pin)) return 'Não pode ser uma sequência.';
    // Os PIN gravados são resumos, portanto compara-se resumo com resumo —
    // cada um calculado com o nome do dono, que é o que os torna distintos.
    const repetido = Object.entries(s.pins)
      .find(([n, p]) => n !== name && p === resumoPin(n, pin));
    if (repetido) return `Já é o PIN ${DE(repetido[0])} ${repetido[0]}.`;
    return null;
  };

  const setPin = (name, pin) => {
    const err = pinError(name, pin);
    if (err) return err;
    set(x => ({
      pins: { ...x.pins, [name]: resumoPin(name, pin) },
      // O «tem PIN» do servidor, antecipado: o `puxarCasa` seguinte confirma.
      ...(x.membros && x.membros[name]
        ? { membros: { ...x.membros, [name]: { ...x.membros[name], pinDefinido: true } } } : {}),
    }));

    // ⚠ E sobe — como PALAVRA-PASSE do membro, não como resumo.
    //
    // O resumo local (`resumoPin`) serve a entrada sem servidor, e é isso e
    // nada mais: o comentário dele di-lo, «não é criptografia». O PIN a sério
    // é a palavra-passe da criança no PocketBase, com bcrypt feito pelo
    // servidor — é assim que o §3.2 fica satisfeito sem escrever criptografia
    // nenhuma, e o valor correto nunca chega a outro dispositivo.
    //
    // Sem isto, o PIN definido no telefone da Rita não deixava a criança
    // entrar no dela: um lado tinha o resumo novo, o servidor o antigo.
    if (sync) {
      const id = idDoMembro(name);
      // ⚠ Pela ROTA, e não por `editarMembro`. A coleção exige `oldPassword`
      // e recusava — «Cannot be blank» — em silêncio, porque isto é um
      // `.catch(() => {})`. Apanhado pela prova das regras da casa.
      if (id) sync.definirPin(id, pin).catch(() => {});
    }
    return null;
  };

  // Verificar é comparar resumos, nunca o valor. O ecrã de entrada fazia
  // `p === s.pins[kid]`, contra o PIN em claro.
  const verificarPin = (name, pin) => !!s.pins[name] && s.pins[name] === resumoPin(name, pin);

  // ── O PIN vive no SERVIDOR (09/09/2026) ─────────────────────────────────────
  //
  // O dono da casa: «tudo deve ser guardado no servidor; o administrador pode
  // fazer reset e as crianças podem alterar o PIN». Três coisas, e as três
  // estavam a meio: o PIN subia como palavra-passe, mas a criança ENTRAVA
  // contra o resumo local, o «tem PIN» era esse resumo — que só existia no
  // telemóvel onde o PIN fora posto —, e a criança não tinha como mudá-lo.
  //
  // O resumo local FICA, com um papel só: a entrada sem servidor. Com servidor,
  // acompanha o que lá está, para a casa continuar a abrir sem rede.

  // Se a criança tem PIN. Com servidor é o `pin_definido` do membro, escrito
  // pelo hook e pela rota; sem servidor, o resumo local.
  const temPin = (name) => {
    const m = (s.membros || {})[name];
    if (sync && sync.ligado() && m && m.pinDefinido !== undefined) return !!m.pinDefinido;
    return !!s.pins[name];
  };

  // A criança entra. Devolve `{ ok }`; `erro` só quando a culpa não é do PIN
  // — servidor em baixo, por exemplo — para o ecrã não gastar uma das cinco
  // tentativas com uma coisa que a criança não fez.
  const entrarCrianca = async (name, pin) => {
    const m = (s.membros || {})[name];
    if (sync && sync.ligado() && m && m.login) {
      try {
        await sync.entrarCrianca(m.login, pin);
      } catch (e) {
        const status = e && e.status;
        if (status === 400 || status === 401 || status === 403) return { ok: false };
        return { ok: false, erro: 'O servidor da casa não está a responder. Tente outra vez daqui a nada.' };
      }
      set(x => ({ pins: { ...x.pins, [name]: resumoPin(name, pin) } }));
      return { ok: true };
    }
    return { ok: verificarPin(name, pin) };
  };

  // A criança muda o seu PIN, sabendo o atual. Devolve a mensagem de erro, ou
  // null. A qualidade verifica-se aqui para ela saber porquê enquanto escreve;
  // o servidor verifica outra vez, e é ele que manda.
  const mudarMeuPin = async (name, atual, novo) => {
    const err = pinError(name, novo);
    if (err) return err;
    const ses = sync && sync.ligado() ? sync.sessao() : null;
    if (ses && ses.nome === name) {
      try { await sync.mudarMeuPin(atual, novo); }
      catch (e) { return e.message || 'Não foi possível mudar o PIN.'; }
    } else if (!verificarPin(name, atual)) {
      return 'O PIN atual não está certo.';
    }
    set(x => ({ pins: { ...x.pins, [name]: resumoPin(name, novo) } }));
    return null;
  };

  // ─── Gerir a casa: nome, e quem lá vive ────────────────────────────────────
  //
  // Estas quatro escrevem no SERVIDOR primeiro e na loja só depois — ao
  // contrário de tudo o resto aqui, e de propósito. O resto da app são
  // remendos sobre sementes locais; isto é a composição da casa. Se o servidor
  // recusar — a casa a ficar sem administração, um nome repetido, histórico a
  // apontar para quem sai — o ecrã tem de dizer porquê, e não mostrar uma casa
  // que o servidor não tem.
  //
  // Sem servidor não fazem nada: a casa que se vê é a de demonstração, e
  // configurar uma amostra não configura nada. Cada uma devolve uma frase de
  // erro ou `null`, como o `setPin` já fazia.
  const podeGerirCasa = () => !!(sync && !s.deDemonstracao && mapaServidor.current.casa);

  const SEM_SERVIDOR = 'Esta é a casa de demonstração. Ligue-se ao servidor da '
    + 'família para acrescentar ou remover membros.';

  // O PocketBase responde em inglês e com o vocabulário das coleções. Quem
  // está a tentar tirar alguém da casa não precisa de saber o que é uma
  // «required relation reference» — precisa de saber que o histórico fica.
  const RECUSAS = [
    [/required relation reference|relation reference/i,
      'Não é possível remover: a casa tem registos em nome deste membro — tarefas, '
      + 'movimentos ou despesas. O histórico da casa não se apaga por alguém sair.'],
    [/last admin|sem administra|administrador/i,
      'A casa não pode ficar sem administração. Dê a administração a outro adulto primeiro.'],
    [/value must be unique|already exists|unique/i,
      'Já existe alguém com esse nome nesta casa.'],
    [/failed to authenticate|not allowed|forbidden|403/i,
      'O servidor recusou: só a administração da casa pode fazer esta alteração.'],
  ];
  const emPortugues = (e) => {
    const bruto = [e?.message, JSON.stringify(e?.data || e?.response || {})].join(' ');
    for (const [padrao, frase] of RECUSAS) if (padrao.test(bruto)) return frase;
    return e?.message ? `O servidor recusou: ${e.message}` : 'O servidor recusou a alteração.';
  };

  const SEM_ADMIN = 'A casa não pode ficar sem administração. Dê a administração '
    + 'a outro adulto primeiro.';

  // Verdade com ou sem rede, e por isso verificada antes da guarda do
  // servidor. `novoPapel` a null quer dizer «este membro sai da casa».
  const deixaCasaSemAdmin = (nome, novoPapel) => {
    if ((s.roles[nome] || 'crianca') !== 'admin') return false;
    if (novoPapel === 'admin') return false;
    return Object.entries(s.roles).filter(([n, r]) => r === 'admin' && n !== nome).length === 0;
  };

  const nomeDeCasaInvalido = (nome) => {
    const n = String(nome || '').trim();
    if (!n) return 'A casa precisa de um nome.';
    if (n.length > 40) return 'O nome da casa não pode passar de 40 caracteres.';
    return null;
  };

  const renomearCasa = async (nome) => {
    const err = nomeDeCasaInvalido(nome);
    if (err) return err;
    if (!podeGerirCasa()) return SEM_SERVIDOR;
    const n = String(nome).trim();
    try {
      await sync.renomearCasa(mapaServidor.current.casa, n);
    } catch (e) { return emPortugues(e); }
    set(x => ({
      nomeDaCasa: n,
      registo: maisRegisto(x, `A casa passou a chamar-se ${n}`, 'Gestão da Casa'),
    }));
    return null;
  };

  // Validação local antes de incomodar o servidor. O servidor volta a validar
  // — é ele que protege — mas uma recusa que se vê sem rede vê-se mais depressa.
  const membroInvalido = ({ nome, papel, email, segredo }, aExcluir = null) => {
    const n = String(nome || '').trim();
    if (!n) return 'O membro precisa de um nome.';
    if (n.length > 30) return 'O nome não pode passar de 30 caracteres.';
    if (quadro[n] && n !== aExcluir) return `Já existe ${DE(n) === 'da' ? 'uma' : 'um'} ${n} nesta casa.`;
    if (!['crianca', 'adulto', 'admin'].includes(papel)) return 'Escolha o papel do membro.';
    if (papel === 'crianca') {
      const errPin = pinError(n, String(segredo || ''));
      if (errPin) return errPin;
    } else {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim()))
        return 'Um adulto entra com a conta Google, e precisa do endereço de e-mail.';
      if (String(segredo || '').length < 8)
        return 'A palavra-passe do servidor tem de ter pelo menos 8 caracteres.';
    }
    return null;
  };

  const acrescentarMembro = async ({ nome, papel, email, fem, segredo }) => {
    const err = membroInvalido({ nome, papel, email, segredo });
    if (err) return err;
    if (!podeGerirCasa()) return SEM_SERVIDOR;
    const n = String(nome).trim();
    let criado;
    try {
      criado = await sync.acrescentarMembro({
        casa: mapaServidor.current.casa, nome: n, papel,
        email: papel === 'crianca' ? null : String(email).trim(),
        fem: !!fem, cor: null,
        pin: papel === 'crianca' ? segredo : undefined,
        palavraPasse: papel === 'crianca' ? undefined : segredo,
      });
    } catch (e) { return emPortugues(e); }
    // O id vem do servidor; sem ele, a próxima escrita de dinheiro deste
    // membro não sabia para onde ir.
    if (criado?.id) mapaServidor.current.membros[n] = criado.id;
    set(x => ({
      membros: { ...x.membros, [n]: {
        id: criado?.id || null,
        initial: n.charAt(0).toUpperCase(),
        email: papel === 'crianca' ? null : String(email).trim(),
        kid: papel === 'crianca', papel, fem: !!fem, cor: null,
      } },
      roles: { ...x.roles, [n]: papel },
      // O PIN local é um resumo, como o de toda a gente. O servidor guarda o
      // seu; são dois segredos do mesmo valor, não um copiado do outro.
      pins: papel === 'crianca' ? { ...x.pins, [n]: resumoPin(n, String(segredo)) } : x.pins,
      // A criança nasce com a entrada dos pontos pagos.
      //
      // Sem ela, o saldo era `kidPts - undefined` = NaN em qualquer sítio que
      // não se defendesse. Defender em cada leitura é o remédio; ter a forma
      // certa desde o início é a cura.
      paidPts: papel === 'crianca' ? { ...x.paidPts, [n]: 0 } : x.paidPts,
      registo: maisRegisto(x, `${n} entrou na casa`, 'Gestão da Casa'),
    }));
    return null;
  };

  // Muda o que se pode mudar sem partir nada: papel, concordância, e-mail,
  // cor. O NOME não está aqui de propósito — na loja local o nome é a chave
  // que liga tarefas, eventos, cofres e fichas de saúde, e mudá-lo é uma
  // migração, não uma edição.
  const editarMembro = async (nome, campos) => {
    if (!quadro[nome]) return 'Esse membro não existe nesta casa.';
    if (campos.papel && campos.papel !== (s.roles[nome] || 'crianca')) {
      if (!canChangeRole(s.roles[nome] || 'crianca', campos.papel))
        return 'Essa mudança de papel não é permitida.';
      if (deixaCasaSemAdmin(nome, campos.papel)) return SEM_ADMIN;
    }
    if (!podeGerirCasa()) return SEM_SERVIDOR;
    const id = mapaServidor.current.membros[nome];
    if (!id) return 'Esse membro ainda não existe no servidor.';
    try {
      await sync.editarMembro(id, {
        ...(campos.papel ? { papel: campos.papel } : {}),
        ...(campos.fem !== undefined ? { fem: !!campos.fem } : {}),
        ...(campos.email !== undefined ? { email: campos.email } : {}),
        ...(campos.cor !== undefined ? { cor: campos.cor } : {}),
      });
    } catch (e) { return emPortugues(e); }
    set(x => ({
      membros: { ...x.membros, [nome]: { ...x.membros[nome],
        ...(campos.papel ? { papel: campos.papel, kid: campos.papel === 'crianca' } : {}),
        ...(campos.fem !== undefined ? { fem: !!campos.fem } : {}),
        ...(campos.email !== undefined ? { email: campos.email } : {}),
        ...(campos.cor !== undefined ? { cor: campos.cor } : {}),
      } },
      ...(campos.papel ? { roles: { ...x.roles, [nome]: campos.papel } } : {}),
      registo: maisRegisto(x, `${nome}: dados alterados`, 'Gestão da Casa'),
    }));
    return null;
  };

  // Mudar o nome de um membro. É a operação mais invasiva das cinco: no
  // servidor são dois campos, e aqui é uma migração de todo o estado gravado
  // — ver `renomearNoEstado`, que é onde vive a tabela dos sítios.
  //
  // A ordem é servidor primeiro. Ao contrário, uma recusa do servidor deixava
  // a app com um nome que a casa não tem, e todas as escritas seguintes desse
  // membro iam para um identificador que já não lhe corresponde.
  const renomearMembro = async (antigo, novo) => {
    if (!quadro[antigo]) return 'Esse membro não existe nesta casa.';
    const n = String(novo || '').trim();
    if (!n) return 'O membro precisa de um nome.';
    if (n === antigo) return null;                  // nada a fazer
    if (n.length > 30) return 'O nome não pode passar de 30 caracteres.';
    if (quadro[n]) return `Já existe ${quadro[n].fem ? 'uma' : 'um'} ${n} nesta casa.`;
    if (!podeGerirCasa()) return SEM_SERVIDOR;
    const id = mapaServidor.current.membros[antigo];
    if (!id) return 'Esse membro ainda não existe no servidor.';
    try {
      // O `login` acompanha o nome: é derivado dele, e deixá-lo para trás
      // punha a criança a entrar com um nome que já não é o dela.
      await sync.editarMembro(id, {
        nome: n,
        login: `${mapaServidor.current.casa}_${n.toLowerCase().replace(/\s+/g, '-')}`,
      });
    } catch (e) { return emPortugues(e); }
    delete mapaServidor.current.membros[antigo];
    mapaServidor.current.membros[n] = id;
    set(x => ({
      ...renomearNoEstado(x, antigo, n),
      registo: maisRegisto(x, `${antigo} passou a chamar-se ${n}`, 'Gestão da Casa'),
    }));
    return null;
  };

  const removerMembro = async (nome) => {
    if (!quadro[nome]) return 'Esse membro não existe nesta casa.';
    if (deixaCasaSemAdmin(nome, null)) return SEM_ADMIN;
    if (!podeGerirCasa()) return SEM_SERVIDOR;
    const id = mapaServidor.current.membros[nome];
    if (!id) return 'Esse membro ainda não existe no servidor.';
    try {
      await sync.removerMembro(id);
    } catch (e) { return emPortugues(e); }
    delete mapaServidor.current.membros[nome];
    set(x => {
      const { [nome]: _fora, ...restantes } = x.membros;
      const { [nome]: _semPapel, ...papeis } = x.roles;
      const { [nome]: _semPin, ...pinsRestantes } = x.pins;
      return {
        membros: restantes, roles: papeis, pins: pinsRestantes,
        registo: maisRegisto(x, `${nome} saiu da casa`, 'Gestão da Casa'),
      };
    });
    return null;
  };

  // Health: agregar métodos para gestão de saúde
  // Um registo de saúde tem a forma das sementes: `day` em chave e `time`.
  // Escrevia `date` com o texto cru do formulário, e como o ecrã lia `date` e
  // as sementes têm `day`, o ecrã acabou apontado só aos registos gravados —
  // que estavam sempre vazios. Daí dizer «1 consulta» num cartão e «Sem
  // registos de saúde.» duas linhas abaixo. Uma forma só, e o problema não
  // volta a poder existir.
  // ⚠ `extra` e não mais dois argumentos posicionais. Já eram quatro; com o
  // médico e a nota seriam seis, e uma chamada com seis posições é onde se
  // trocam dois argumentos sem ninguém dar por isso.
  //
  // O `doctor` é o campo que a app LIA em cinco sítios e nunca escrevia —
  // `FichaSaude.jsx:51`, `:111`, `:159`, `exportar-saude.js:113` e
  // `ExportarSaude.jsx:169`. A app mostrava «Dentista · Dr. Cardoso» para as
  // sementes e nunca o podia mostrar para uma consulta a sério.
  //
  // A `nota` é a de quem MARCA — «jejum, levar exames anteriores». Não
  // confundir com o `healthNotes`, que são as notas escritas DEPOIS da
  // consulta, cada uma com autor e data. Daí o singular.
  // No servidor o campo chama-se `notas`, e a tradução faz-se no `sync`.
  const addHealthRecord = (member, data, specialty, time, extra = {}) => {
    const id = 'hlth-' + Date.now();
    const day = chaveDeDMY(data) || data;
    const doctor = String(extra.doctor || '').trim();
    const nota = String(extra.nota || '').trim();
    set(x => ({
      health: [...(x.health || []), {
        id, member, day, specialty, time: time || '',
        doctor, nota,
        createdAt: new Date().toISOString(),
      }],
    }));

    // A consulta sobe — mas só para um servidor que viva na casa. O
    // `episodioDeSaude` chama o `recusaSaude`, portanto a condição é imposta
    // no sync e não repetida aqui: se este ficheiro a repetisse, seriam duas
    // ideias da mesma regra e a segunda acabaria mais fraca.
    //
    // Como no cofre: a fila guarda a escrita e falhar aqui não pode estragar o
    // ecrã, que já tem a consulta. Sem servidor, `sync` é null e isto não faz
    // nada. Com servidor fora de casa, o `recusaSaude` rebenta e o `.catch`
    // engole — a consulta fica local, que é o que se quer.
    if (sync) {
      const ses = sync.sessao();
      const idServidor = idDoMembro(member);
      // ⚠ `medico` e `notas` são os nomes das COLEÇÕES, não os da loja. O
      // PocketBase ignora campos que não conhece em silêncio: mandar `doctor`
      // e `nota` passava a escrita e deixava cair os dois dados.
      if (ses && idServidor) sync.episodioDeSaude({
        casa: ses.casa, membro: idServidor, especialidade: specialty,
        dia: day.replace(/^d/, ''), hora: time || '',
        medico: doctor, notas: nota,
      })
        // ⚠ Guardar o `id` do servidor não é arrumação: um anexo é uma relação
        // para o episódio, e sem este `id` o anexo não tem para onde apontar.
        // Quando a consulta fica na fila não há `id`, e o anexo espera — que é
        // melhor do que subir solto.
        .then((r) => { if (r && r.id) set(x => ({
          health: (x.health || []).map(h => (h.id === id ? { ...h, idServidor: r.id } : h)),
        })); })
        .catch(() => {});
    }
    return id;
  };

  // ── As notas de uma consulta ──────────────────────────────────────────────
  //
  // Estão sempre à mão e alteram-se: o que o médico disse escreve-se à pressa
  // na sala de espera e corrige-se depois. Até aqui só havia `addHealthNote` —
  // uma nota com um erro de escrita ficava lá para sempre.
  //
  // ⚠ Mexe-se numa nota pelo `id`, NUNCA pela posição na lista. Dois telefones
  // que acrescentem uma nota cada um à mesma consulta produzem listas com
  // ordens diferentes, e um `editar(indice)` alterava a nota errada no segundo
  // telefone. É a mesma razão do INVARIANTE #2.
  // O `idServidor` de uma consulta — é a ele que a nota se pende.
  const episodioNoServidor = (healthId) =>
    (allHealth().find(h => h.id === healthId) || {}).idServidor || null;

  const addHealthNote = (healthId, author, text) => {
    const t = String(text || '').trim();
    if (!t) return 'A nota não pode ficar vazia.';
    const idLocal = idDeNota();
    set(x => ({
      healthNotes: {
        ...x.healthNotes,
        [healthId]: [...(x.healthNotes[healthId] || []), {
          id: idLocal,
          author,
          date: new Date().toISOString(),
          text: t,
        }],
      },
    }));

    // A nota sobe, e só para um servidor que viva na casa: o `notaDeSaude`
    // chama o `recusaSaude`, portanto a condição é imposta no sync e não
    // repetida aqui. Falhar não estraga o ecrã, que já tem a nota.
    //
    // ⚠ Sem `idServidor` do episódio a nota NÃO sobe, e é o correcto: uma nota
    // é uma relação para a consulta, e sem ela ficava órfã do outro lado. A
    // consulta aprende o seu id quando subir, e a nota fica local até lá.
    if (sync) {
      const ses = sync.sessao();
      const episodio = episodioNoServidor(healthId);
      const autor = idDoMembro(author);
      if (ses && episodio && autor) sync.notaDeSaude({
        casa: ses.casa, episodio, autor, texto: t,
      })
        // O id do servidor guarda-se para que ALTERAR e APAGAR tenham para
        // onde ir. Sem ele, a correcção ficava só neste telefone.
        .then((r) => { if (r && r.id) set(x => ({
          healthNotes: {
            ...x.healthNotes,
            [healthId]: (x.healthNotes[healthId] || []).map(n => (
              n.id === idLocal ? { ...n, idServidor: r.id } : n)),
          },
        })); })
        .catch(() => {});
    }
    return null;
  };

  // Devolvem null quando correm bem e uma frase em português quando não, como
  // o `renameSpecialty`.
  //
  // ⚠ Só quem escreveu a nota a altera ou apaga. Uma nota é o relato de uma
  // pessoa sobre o que ouviu na consulta; o outro adulto reescrevê-la em
  // silêncio seria pior do que não a poder corrigir. `quem` é obrigatório
  // precisamente para isto não se poder esquecer.
  const notaDaConsulta = (healthId, notaId) =>
    ((s.healthNotes || {})[healthId] || []).find(n => n.id === notaId) || null;

  const editarNotaSaude = (healthId, notaId, texto, quem) => {
    const n = notaDaConsulta(healthId, notaId);
    if (!n) return 'Essa nota já não existe.';
    if (n.author !== quem) return 'Só quem escreveu a nota a pode alterar.';
    const t = String(texto || '').trim();
    if (!t) return 'A nota não pode ficar vazia.';
    if (t.length > 2000) return 'A nota não pode passar de 2000 caracteres.';
    if (t === n.text) return null;                   // nada a fazer
    set(x => ({
      healthNotes: {
        ...x.healthNotes,
        [healthId]: (x.healthNotes[healthId] || []).map(o => (
          // `editadaEm` e não sobrescrever a `date`: a data em que a nota foi
          // escrita é o que a situa na consulta, e perdê-la ao corrigir uma
          // gralha apagava a única pista de quando aquilo foi dito.
          o.id === notaId ? { ...o, text: t, editadaEm: new Date().toISOString() } : o)),
      },
    }));
    // A alteração sobe se a nota já lá estiver. `n.idServidor` só existe depois
    // de ela ter subido; sem ele não há o que alterar do outro lado.
    if (sync && n.idServidor) sync.alterarNotaDeSaude(n.idServidor, t).catch(() => {});
    return null;
  };

  const apagarNotaSaude = (healthId, notaId, quem) => {
    const n = notaDaConsulta(healthId, notaId);
    if (!n) return 'Essa nota já não existe.';
    if (n.author !== quem) return 'Só quem escreveu a nota a pode apagar.';
    set(x => ({
      healthNotes: {
        ...x.healthNotes,
        [healthId]: (x.healthNotes[healthId] || []).filter(o => o.id !== notaId),
      },
    }));
    if (sync && n.idServidor) sync.apagarNotaDeSaude(n.idServidor).catch(() => {});
    return null;
  };

  // ── Um documento numa ficha ─────────────────────────────────────────────
  //
  // O arquivo clínico LIA (`allHealthDocs`, com procura, filtros e a origem no
  // `healthId`) e nada ESCREVIA: as sementes de `HEALTH_DOCS` eram o único
  // conteúdo possível. Numa casa a sério não havia como juntar um relatório a
  // uma consulta.
  //
  // ⚠ Sem ficheiro. O `expires` só existe para receitas, e é ele que põe a
  // linha no «Precisa de Si» do Início — ver `receitasAExpirarDe`. A
  // FOTOGRAFIA do documento é outra coisa e fica de fora: um ficheiro clínico
  // de menor entra em `anexos`, e é dessa peça que os cinco pontos do
  // db/postgres/README.md mais falam.
  const addHealthDoc = (healthId, member, dados = {}) => {
    const id = 'doc-' + Date.now();
    const kind = dados.kind || 'Exame';
    const title = String(dados.title || '').trim();
    if (!title) return null;
    const foto = dados.foto || null;

    // ⚠ A fotografia fica no dispositivo PRIMEIRO, e o `porSubir` diz a
    // verdade sobre onde ela está.
    //
    // O anexo não pode passar pela fila de escritas — ela serializa em JSON e
    // um ficheiro não é JSON — portanto o carregamento é direto e pode falhar.
    // Guardar antes de tentar é o que impede a fotografia de se perder por não
    // haver rede; o `porSubir` é o que impede a app de fingir que ela já está
    // no servidor.
    set(x => ({
      healthDocs: [...(x.healthDocs || []), {
        id, healthId, member, kind, title,
        // Só as receitas têm prazo. Um exame com `expires` aparecia no
        // «Precisa de Si» como receita a expirar.
        ...(kind === 'Receita' && dados.expires ? { expires: dados.expires } : {}),
        ...(foto ? { foto, porSubir: true } : {}),
        createdAt: new Date().toISOString(),
      }],
    }));

    // E sobe — pelas mesmas condições do episódio: só para um servidor que
    // viva na casa. O `recusaSaude` decide, e não este ficheiro.
    if (sync && foto) {
      const ses = sync.sessao();
      if (ses) {
        sync.anexoDeSaude({
          casa: ses.casa,
          // O episódio no SERVIDOR, não o id local. Sem ele o anexo ficaria
          // órfão do outro lado, que é o que o TAREFAS.md proíbe.
          episodio: (s.health || []).find(h => h.id === healthId)?.idServidor || null,
          tipo: kind, titulo: title, uri: foto,
          nome: `${title.replace(/[^\w.-]+/g, '-').slice(0, 40)}.jpg`,
          mime: 'image/jpeg',
        })
          // ⚠ Com o `id` do servidor E o URL dele (13/09/2026). Só se marcava
          // `porSubir: false`: o documento local ficava sem `idServidor`, a
          // leitura seguinte não o ligava ao anexo do servidor, e o `blob:` da
          // fotografia — morto ao recarregar a página — continuava a ser a
          // imagem dele. O PDF dizia «um documento não pôde ser incluído» com
          // a fotografia no servidor, intacta.
          .then((r) => set(x => ({
            healthDocs: (x.healthDocs || []).map(d => (d.id === id ? {
              ...d, porSubir: false,
              ...(r && r.id ? { idServidor: r.id } : {}),
              ...(r && sync.urlDoFicheiro && sync.urlDoFicheiro(r, 'ficheiro') ? { foto: sync.urlDoFicheiro(r, 'ficheiro') } : {}),
            } : d)),
          })))
          .catch(() => {});   // fica `porSubir: true`, e o ecrã di-lo
      }
    }
    return id;
  };

  // ── Arquivar uma consulta ───────────────────────────────────────────────
  //
  // Arquivar NÃO apaga: os anexos ficam ligados e a consulta volta com um
  // toque. É por isso que é um sinalizador e não uma remoção — o `healthGone`
  // é que apaga, e é outra coisa.
  //
  // Uma consulta arquivada sai da lista principal e do «precisa de ação», e
  // continua no arquivo clínico. Quem decide isso é o ecrã; a loja só guarda.
  // ── ⚠ A saúde desce do servidor ───────────────────────────────────────────
  //
  // O `ler.saude()` do cliente existia, comentado e documentado, e NINGUÉM lhe
  // chamava. A saúde era a única área da app de sentido único: a Rita marcava
  // uma consulta à Mia, ela subia, e o telemóvel do Tomás nunca a via.
  //
  // ⚠ Pede-se ficha a ficha, e por TODOS os membros da casa.
  //
  // Não se filtra aqui por quem pode ver — o servidor é que decide, e devolve
  // vazio para a ficha de outro adulto. Repetir a regra deste lado eram duas
  // ideias da mesma coisa, e a segunda acabaria mais fraca (INVARIANTE #3).
  //
  // Corre ao ABRIR a Saúde, e não no arranque: o `ler.casa()` não toca nestas
  // coleções de propósito, para o dado não chegar ao dispositivo de quem lá não
  // tem nada que fazer.
  const lerSaudeDoServidor = async () => {
    if (!sync || !sync.puxarSaude) return false;
    const ids = (mapaServidor.current || {}).membros || {};
    if (!Object.keys(ids).length) return false;

    const { episodios, anexos, notas, receitas, decisoes, tomas, alergias } = await sync.puxarSaude(ids)
      .catch(() => ({ episodios: [], anexos: [], notas: [], receitas: [], decisoes: [], tomas: [], alergias: [] }));

    set(x => {
      // ⚠ Uma consulta que já existe cá GUARDA o seu id local.
      //
      // Escrevi isto primeiro a deitar fora tudo o que tinha `idServidor` e a
      // recriar da resposta com ids novos — e as notas, as receitas e os
      // documentos ficavam órfãos, porque são indexados pelo id LOCAL. A
      // consulta voltava sem nada pendurado nela.
      const jaCa = new Map((x.health || [])
        .filter(h => h.idServidor).map(h => [h.idServidor, h]));

      const health = [
        // O que ainda não subiu fica: é o que se escreveu sem rede.
        ...(x.health || []).filter(h => !h.idServidor),
        // E o que o servidor tem manda no resto — incluindo no que ele já não
        // tem, que desaparece por não vir na resposta.
        ...episodios.map((e) => {
          const ja = jaCa.get(e.idServidor);
          return ja
            ? { ...ja, ...e, id: ja.id }
            : { ...e, id: `srv-${e.idServidor}`, createdAt: new Date().toISOString() };
        }),
      ];

      // Os anexos penduram-se pelo id LOCAL da consulta, e o servidor fala do
      // id dele: aqui é onde os dois se ligam.
      const localDoEpisodio = new Map(health
        .filter(h => h.idServidor).map(h => [h.idServidor, h.id]));
      const docsCa = new Map((x.healthDocs || [])
        .filter(d => d.idServidor).map(d => [d.idServidor, d]));

      const healthDocs = [
        // A fotografia que ainda está só neste telemóvel não se perde.
        ...(x.healthDocs || []).filter(d => !d.idServidor),
        ...anexos.map((a) => {
          const healthId = localDoEpisodio.get(a.episodioNoServidor);
          if (!healthId) return null;   // anexo de uma ficha que não se vê
          const ja = docsCa.get(a.idServidor);
          return ja
            ? { ...ja, ...a, id: ja.id, healthId }
            : { ...a, id: `doc-srv-${a.idServidor}`, healthId,
                createdAt: new Date().toISOString() };
        }).filter(Boolean),
      ];

      // ── E o que pende de cada consulta ──────────────────────────────────
      //
      // Os três mapas são indexados pelo id LOCAL da consulta, e o servidor
      // fala do id dele. Uma consulta que não se veja não traz nada atrás.
      const porEpisodio = (linhas, jaLa) => {
        const fora = {};
        for (const l of linhas || []) {
          const healthId = localDoEpisodio.get(l.episodioNoServidor);
          if (!healthId) continue;
          (fora[healthId] ||= []).push({ ...l, id: `srv-${l.idServidor}` });
        }
        // O que ainda não subiu fica, e vai à frente do que veio de baixo: é o
        // que se escreveu sem rede, e é o mais recente.
        for (const [k, v] of Object.entries(jaLa || {})) {
          const locais = (v || []).filter(n => !n.idServidor);
          if (locais.length) fora[k] = [...(fora[k] || []), ...locais];
        }
        return fora;
      };

      const healthNotes = porEpisodio(notas, x.healthNotes);
      const healthRecipes = porEpisodio(receitas, x.healthRecipes);

      // A decisão é UMA por consulta, e não uma lista.
      const healthDecisions = { ...x.healthDecisions };
      for (const dec of decisoes || []) {
        const healthId = localDoEpisodio.get(dec.episodioNoServidor);
        if (healthId) healthDecisions[healthId] = dec;
      }

      // As tomas, pela chave da receita — `srv-<id>`, que é o id com que a
      // receita volta do servidor. O que ainda não subiu fica, debaixo da chave
      // que tinha; uma toma do servidor SUBSTITUI a local com o mesmo id.
      const healthTomas = {};
      for (const tm of tomas || []) {
        (healthTomas[`srv-${tm.receitaNoServidor}`] ||= []).push({ ...tm, id: `srv-${tm.idServidor}` });
      }
      for (const [k, lista] of Object.entries(x.healthTomas || {})) {
        const locais = (lista || []).filter(tm => !tm.idServidor);
        if (locais.length) healthTomas[k] = [...(healthTomas[k] || []), ...locais];
      }

      // As alergias, pelo nome do membro. O servidor manda; o que ainda não
      // subiu (sem `idServidor`) fica, atrás do que veio.
      const healthAlergias = {};
      for (const a of alergias || []) {
        (healthAlergias[a.member] ||= []).push({ ...a, id: `srv-${a.idServidor}` });
      }
      for (const [membro, lista] of Object.entries(x.healthAlergias || {})) {
        const locais = (lista || []).filter(a => !a.idServidor);
        if (locais.length) healthAlergias[membro] = [...(healthAlergias[membro] || []), ...locais];
      }

      return { health, healthDocs, healthNotes, healthRecipes, healthDecisions, healthTomas, healthAlergias };
    });
    return true;
  };

  const arquivarConsulta = (healthId, arquivar = true) => {
    set(x => ({
      healthArchived: { ...(x.healthArchived || {}), [healthId]: !!arquivar },
    }));
  };

  // ── A ficha de emergência ────────────────────────────────────────────────
  //
  // Alergias, medicação em curso, médico e contactos — o que a escola precisa
  // de saber num dia mau. Só as ALERGIAS são dado novo (`alergias_saude`); o
  // resto deriva do que a ficha já tem. Quem vê é quem vê a ficha
  // (INVARIANTE #3): uma criança não vê a sua, e o PDF sai do telemóvel de um
  // adulto. 12/09/2026 — a sétima das dez funcionalidades.
  const alergiasDe = (member, viewer) => (canSeeHealth(member, viewer)
    ? [...((s.healthAlergias || {})[member] || [])].sort((a, b) => {
      const peso = { grave: 0, moderada: 1, leve: 2 };
      return (peso[a.gravidade] ?? 1) - (peso[b.gravidade] ?? 1) || String(a.nome).localeCompare(String(b.nome));
    })
    : []);

  // Devolve `{ id }` quando ficou, ou a frase do que falta.
  const criarAlergia = (member, viewer, { nome, gravidade, nota } = {}) => {
    if (!canSeeHealth(member, viewer)) return 'Não pode escrever nesta ficha.';
    const n = String(nome || '').trim();
    if (!n) return 'Diga a que é a alergia.';
    const g = ['leve', 'moderada', 'grave'].includes(gravidade) ? gravidade : 'moderada';
    if (((s.healthAlergias || {})[member] || []).some(a => normal(a.nome) === normal(n))) return 'Essa alergia já está na ficha.';
    const id = 'alg-' + Date.now();
    const linha = { id, idServidor: null, nome: n, gravidade: g, nota: String(nota || '').trim() };
    set(x => ({
      healthAlergias: { ...(x.healthAlergias || {}), [member]: [...((x.healthAlergias || {})[member] || []), linha] },
      // ⚠ Sem o nome da alergia: o registo da casa é lido por todos os adultos,
      // e a ficha existe para o guardar.
      registo: maisRegisto(x, `Alergia acrescentada à ficha ${DE(member)} ${member}`, 'Saúde'),
    }));
    if (sync) {
      const ses = sync.sessao();
      const idMembro = idDoMembro(member);
      if (ses && idMembro) sync.alergiaDeSaude({ casa: ses.casa, membro: idMembro, nome: n, gravidade: g, nota: linha.nota })
        .then(r => { if (r && r.id) set(x => ({
          healthAlergias: { ...(x.healthAlergias || {}), [member]: ((x.healthAlergias || {})[member] || []).map(a => (a.id === id ? { ...a, idServidor: r.id } : a)) },
        })); })
        .catch(() => {});
    }
    return { id };
  };

  const apagarAlergia = (member, viewer, id) => {
    if (!canSeeHealth(member, viewer)) return 'Não pode escrever nesta ficha.';
    const a = ((s.healthAlergias || {})[member] || []).find(k => k.id === id);
    if (!a) return 'Essa alergia já não está na ficha.';
    if (sync && a.idServidor) {
      try { sync.apagarAlergiaDeSaude(a.idServidor).catch(() => {}); }
      catch (e) { return e.message; }
    }
    set(x => ({
      healthAlergias: { ...(x.healthAlergias || {}), [member]: ((x.healthAlergias || {})[member] || []).filter(k => k.id !== id) },
    }));
    return null;
  };

  // A ficha inteira, derivada: `null` para quem não a pode ver.
  const fichaDeEmergencia = (member, viewer) => {
    if (!canSeeHealth(member, viewer)) return null;
    const consultas = healthOf(member, viewer);
    // A medicação EM CURSO: a receita com plano cujo intervalo inclui hoje, ou
    // a sem plano cuja validade ainda não passou.
    const medicacao = [];
    for (const h of consultas) {
      for (const r of (s.healthRecipes[h.id] || [])) {
        const plano = planoDaReceita(r, h.day);
        const emCurso = plano
          ? (TODAY_KEY >= plano.inicio && TODAY_KEY <= plano.fim)
          : (r.expiresAt ? (daysUntil(r.expiresAt) ?? -1) >= 0 : false);
        if (emCurso) medicacao.push({ id: r.id, nome: r.name, dose: r.dosage || '', plano: plano ? plano.descricao : null, ate: plano ? plano.fim : null });
      }
    }
    const medicos = [...new Set(consultas.map(h => String(h.doctor || '').trim()).filter(Boolean))];
    // Os adultos da casa, com o correio quando o há — é o que a escola liga.
    const contactos = adultos.map(n => ({ nome: n, email: (quadro[n] || {}).email || null }));
    return { membro: member, alergias: alergiasDe(member, viewer), medicacao, medicos, contactos };
  };

  // ── Apagar uma consulta ───────────────────────────────────────────────────
  //
  // ⚠ O `healthGone` era lido a cada leitura de fichas e NUNCA escrito.
  //
  // A maquinaria de apagar estava montada — a lista existia, o filtro lia-a —
  // e não havia porta nenhuma: nem botão, nem menu, nem gesto. Uma consulta
  // marcada por engano ficava para sempre. Arquivar esconde-a da lista; não a
  // tira da casa nem do servidor. Apanhado a percorrer os ecrãs, 06/09/2026, e
  // é a mesma forma do `tempoReal`: construído e sem quem lhe chame.

  // O que cai com uma consulta. Serve para a pergunta DIZER o que leva atrás em
  // vez de a pessoa descobrir depois — e é a mesma contagem que o apagar usa,
  // para não haver duas versões da verdade.
  const oQueCaiCom = (healthId) => ({
    notas: (s.healthNotes[healthId] || []).length,
    receitas: (s.healthRecipes[healthId] || []).length,
    documentos: docsDaConsulta(healthId).length,
    decisao: !!(s.healthDecisions || {})[healthId],
    naAgenda: allEvents().some(e => e.healthId === healthId),
  });

  // ⚠ Quem pode apagar. Três respostas, e nenhuma é «a interface esconde o
  // botão» — o INVARIANTE #3 diz que a regra vive no servidor, e ela lá está
  // desde 03/09. Isto é a MESMA regra do lado de cá, para a app poder explicar
  // o não em vez de mandar o pedido e mostrar um 404.
  //
  //   · a consulta tem de existir
  //   · quem pede tem de a poder VER (`podeVerSaude`): a de um adulto é dele,
  //     as das crianças são dos adultos, e uma criança não vê a sua
  //   · e a saúde só sai deste telefone para um servidor DENTRO de casa
  const porqueNaoApaga = (healthId, quemPede) => {
    const r = allHealth().find(h => h.id === healthId);
    if (!r) return 'Essa consulta já não existe.';
    if (!podeVerSaude(r.member, quemPede)) return 'Esta ficha não é sua.';
    return null;
  };

  // Devolve `null` quando apagou, ou a razão por escrito quando não.
  // ── Porque é que o servidor não deixou, dito em português ──────────────────
  //
  // ⚠ A mensagem do PocketBase vem em inglês — «The requested resource wasn't
  // found.», «Only superusers can perform this action.» — e o ecrã mostra-a tal
  // e qual num `Tile`. Uma app inteira em português europeu que, no momento em
  // que falha, responde em inglês, parece avariada em vez de se explicar.
  //
  // Traduz-se o que se sabe e diz-se o resto com o número, que é melhor do que
  // uma frase vaga: quem nos ler o registo precisa de distinguir os casos.
  const porqueNaoApagouNoServidor = (e) => {
    const estado = Number(e && e.status) || 0;
    if (estado === 401) return 'A sessão expirou. Entre outra vez e tente de novo.';
    if (estado === 403) return 'O servidor não deixou apagar esta consulta.';
    // Sem estado é rede: não houve resposta nenhuma. A consulta fica como está,
    // de propósito — apagá-la aqui e não lá fazia a leitura seguinte trazê-la
    // de volta, sem ninguém perceber porquê.
    if (!estado) return 'Não consegui falar com o servidor. A consulta fica como está — tente quando houver ligação.';
    return `O servidor recusou apagar a consulta (${estado}).`;
  };

  // ⚠ ASSÍNCRONA, e é uma correcção — não uma preferência de estilo.
  //
  // Isto era síncrono e o servidor era chamado assim:
  //
  //     try { sync.apagarEpisodioDeSaude(id).catch(() => {}); }
  //     catch (e) { return e.message; }
  //
  // O `apagarEpisodioDeSaude` é `async`. O que ele atira vira uma promessa
  // REJEITADA, e uma promessa rejeitada não chega a um `try/catch` síncrono: o
  // `catch (e)` nunca disparava, o `.catch(() => {})` engolia em silêncio, e a
  // execução seguia para a lápide.
  //
  // O comentário a seguir promete «se o servidor recusar, a consulta fica
  // intacta aqui» — e o código fazia exactamente o contrário. A app dava a
  // consulta por apagada e a linha ficava no servidor.
  const apagarConsulta = async (healthId, quemPede) => {
    const porque = porqueNaoApaga(healthId, quemPede);
    if (porque) return porque;

    const noServidor = episodioNoServidor(healthId);
    const r = allHealth().find(h => h.id === healthId);

    // ⚠ O servidor PRIMEIRO, ao contrário do resto da app.
    //
    // É a mesma escolha do «Começar de Zero»: se o servidor recusar — sessão
    // caducada, papel mudado entretanto —, a consulta fica intacta aqui e a
    // folha diz porquê. Apagar cá e falhar lá deixava as duas metades a
    // discordar, e a leitura seguinte trazia-a de volta sem ninguém perceber.
    if (sync && noServidor) {
      try {
        await sync.apagarEpisodioDeSaude(noServidor);
      } catch (e) {
        // ⚠ O 404 NÃO é recusa: quer dizer que a linha já não está lá. Travar
        // nele deixava uma consulta impossível de apagar para sempre — apagada
        // no servidor por outro dispositivo, e eterna neste.
        if (Number(e && e.status) !== 404) return porqueNaoApagouNoServidor(e);
      }
    }

    // O evento da agenda vai com ela. Um evento «Consulta» que aponta para uma
    // consulta que já não existe fica a apitar à hora de nada — e o
    // `removerEvento` leva-o também da agenda da Google.
    for (const e of allEvents().filter(ev => ev.healthId === healthId)) removerEvento(e.id);

    set(x => {
      const semChave = (mapa) => { const m = { ...(mapa || {}) }; delete m[healthId]; return m; };
      // As tomas vão com as receitas da consulta — no servidor é a cascata.
      const chavesDasReceitas = new Set((x.healthRecipes[healthId] || []).map(chaveDaReceita));
      const healthTomas = Object.fromEntries(Object.entries(x.healthTomas || {})
        .filter(([k]) => !chavesDasReceitas.has(k)));
      return {
        // A lápide, que é o que faz a consulta desaparecer das leituras — e a
        // razão de ela existir: uma consulta-SEMENTE não se pode tirar de lado
        // nenhum, e uma do servidor apaga-se lá.
        healthGone: { ...(x.healthGone || {}), [healthId]: true },
        healthNotes: semChave(x.healthNotes),
        healthRecipes: semChave(x.healthRecipes),
        healthTomas,
        healthDecisions: semChave(x.healthDecisions),
        healthArchived: semChave(x.healthArchived),
        healthDocs: (x.healthDocs || []).filter(d => d.healthId !== healthId),
        // ⚠ Sem o nome nem a especialidade. O registo da casa é lido por todos
        // os adultos, e uma linha «Consulta de Dentista da Mia apagada» põe no
        // histórico exatamente o que a ficha existe para fechar.
        registo: maisRegisto(x, 'Uma consulta foi apagada', 'Saúde'),
      };
    });
    return null;
  };

  // ⚠ O `sync.receitaDeSaude` existia desde 04/09/2026 e ninguém o chamava.
  // Escrevi a coleção, escrevi a função, e não liguei nem uma nem outra: a
  // receita ficava no telefone de quem a escreveu, e o outro adulto que fosse
  // à farmácia não a via. Apanhado pelo guarda em
  // `__tests__/nenhuma-escrita-sem-quem-a-chame.test.js`.
  // `plano` é o das tomas — `{ frequency, durationDays, boxSize }` — e é
  // opcional: uma receita sem plano continua a ser uma receita.
  const planoLimpo = (plano = {}) => ({
    frequency: Math.max(0, Math.round(Number(plano.frequency) || 0)),
    durationDays: Math.max(0, Math.round(Number(plano.durationDays) || 0)),
    boxSize: Math.max(0, Math.round(Number(plano.boxSize) || 0)),
  });
  // `plano` traz também as `notas` da receita (15/09/2026), texto livre.
  const addRecipe = (healthId, name, dosage, quantity, unit, expiresAt, plano = {}) => {
    const idLocal = 'rx-' + Date.now();
    const p = planoLimpo(plano);
    const notas = String(plano.notas || '').trim();
    set(x => ({
      healthRecipes: {
        ...x.healthRecipes,
        [healthId]: [...(x.healthRecipes[healthId] || []), {
          id: idLocal,
          name, dosage, quantity, unit,
          expiresAt,
          decision: null,
          notas,
          ...p,
        }],
      },
    }));

    if (sync) {
      const ses = sync.sessao();
      const episodio = episodioNoServidor(healthId);
      if (ses && episodio) sync.receitaDeSaude({
        casa: ses.casa, episodio, nome: name, dose: dosage,
        quantidade: quantity, unidade: unit, expiraEm: expiresAt, notas,
        frequencia: p.frequency, duracaoDias: p.durationDays, caixa: p.boxSize,
      })
        .then((r) => { if (r && r.id) set(x => ({
          healthRecipes: {
            ...x.healthRecipes,
            [healthId]: (x.healthRecipes[healthId] || []).map(o => (
              o.id === idLocal ? { ...o, idServidor: r.id } : o)),
          },
        })); })
        .catch(() => {});
    }
  };

  const setRecipeDecision = (healthId, recipeId, decision) => {
    set(x => ({
      healthRecipes: {
        ...x.healthRecipes,
        [healthId]: (x.healthRecipes[healthId] || []).map(r =>
          r.id === recipeId ? { ...r, decision } : r
        ),
      },
    }));
  };

  // ── A medicação a partir da receita ────────────────────────────────────────
  //
  // O plano (tomas por dia, dias, caixa) vive na receita; cada toma marcada é
  // uma LINHA com quando e quem — aditiva, como o cofre: marcar acrescenta,
  // desmarcar tira, e o «quantas» é a contagem (INVARIANTE #2). Tudo sobe pelo
  // travão de casa das consultas, por decisão do dono da casa em 12/09/2026.
  // Só um adulto chega aqui: a criança não vê a sua ficha (INVARIANTE #3).
  const receitaDe = (healthId, recipeId) =>
    (s.healthRecipes[healthId] || []).find(r => r.id === recipeId) || null;

  // Define ou muda o plano de uma receita. Devolve `null` quando ficou, ou a
  // frase do que falta.
  const definirTomas = (healthId, recipeId, plano = {}) => {
    const receita = receitaDe(healthId, recipeId);
    if (!receita) return 'Essa receita não existe nesta ficha.';
    const p = planoLimpo(plano);
    if (!p.frequency) return 'Diga quantas tomas por dia.';
    if (!p.durationDays) return 'Diga durante quantos dias.';
    if (p.frequency > 12) return 'Mais de doze tomas por dia não é um plano — confirme a receita.';
    set(x => ({
      healthRecipes: {
        ...x.healthRecipes,
        [healthId]: (x.healthRecipes[healthId] || []).map(r => (r.id === recipeId ? { ...r, ...p } : r)),
      },
    }));
    if (sync && receita.idServidor) {
      sync.alterarReceitaDeSaude(receita.idServidor, {
        frequencia: p.frequency, duracaoDias: p.durationDays, caixa: p.boxSize,
      }).catch(() => {});
    }
    return null;
  };

  // Muda o nome do medicamento e as notas de uma receita (15/09/2026 — «quando
  // se faz editar, o título não tem opção de alterar», e «adicionar notas»).
  // Cada campo só conta quando VEM. Devolve `null` quando ficou, ou a frase do
  // que falta. As tomas não se mexem: a chave delas é o id da receita.
  const alterarReceita = (healthId, recipeId, campos = {}) => {
    const receita = receitaDe(healthId, recipeId);
    if (!receita) return 'Essa receita não existe nesta ficha.';
    const mudanca = {};
    if ('name' in campos) {
      const nome = String(campos.name || '').trim();
      if (!nome) return 'Escreva o nome do medicamento.';
      if (nome !== receita.name) mudanca.name = nome;
    }
    if ('notas' in campos) {
      const notas = String(campos.notas || '').trim();
      if (notas !== (receita.notas || '')) mudanca.notas = notas;
    }
    // A dose, a quantidade, a unidade e a validade — o que a folha de criar
    // pede (15/09/2026: «parece-me incompleto»).
    for (const k of ['dosage', 'quantity', 'unit', 'expiresAt']) {
      if (!(k in campos)) continue;
      const v = String(campos[k] || '').trim();
      if (k === 'expiresAt' && !v) return 'A receita precisa de uma validade.';
      if (v !== (receita[k] || '')) mudanca[k] = v;
    }
    if (!Object.keys(mudanca).length) return null;
    set(x => ({
      healthRecipes: {
        ...x.healthRecipes,
        [healthId]: (x.healthRecipes[healthId] || []).map(r => (r.id === recipeId ? { ...r, ...mudanca } : r)),
      },
    }));
    if (sync && receita.idServidor) sync.alterarReceitaDeSaude(receita.idServidor, {
      ...('name' in mudanca ? { nome: mudanca.name } : {}),
      ...('notas' in mudanca ? { notas: mudanca.notas } : {}),
      ...('dosage' in mudanca ? { dose: mudanca.dosage } : {}),
      ...('quantity' in mudanca ? { quantidade: mudanca.quantity } : {}),
      ...('unit' in mudanca ? { unidade: mudanca.unit } : {}),
      ...('expiresAt' in mudanca ? { expiraEm: mudanca.expiresAt } : {}),
    }).catch(() => {});
    return null;
  };

  // As tomas de uma receita, das mais recentes para as mais antigas.
  const tomasDaReceita = (healthId, recipeId) => {
    const receita = receitaDe(healthId, recipeId);
    if (!receita) return [];
    return [...((s.healthTomas || {})[chaveDaReceita(receita)] || [])]
      .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  };

  // Marca uma toma: quem, e quando (ISO; agora, por omissão). Devolve `null`
  // quando ficou, ou a frase do que impede. ⚠ Duas no mesmo minuto recusam-se
  // cá, e no servidor colidem no índice — nunca contam duas vezes.
  let contadorDeTomas = 0;
  // ⚠ `agoraNaApp()`, e não `new Date()`: o «agora» é o do dia da app — com o
  // dia fixado para as provas, uma toma marcada «agora» tem de cair em «hoje».
  const marcarToma = (healthId, recipeId, por, quando = agoraNaApp().toISOString()) => {
    const receita = receitaDe(healthId, recipeId);
    if (!receita) return 'Essa receita não existe nesta ficha.';
    if (!adultos.includes(por)) return 'Só um adulto da casa marca uma toma.';
    const instante = new Date(quando);
    if (Number.isNaN(instante.getTime())) return 'Esse instante não é uma data.';
    const iso = instante.toISOString();
    const chave = chaveDaReceita(receita);
    const minuto = iso.slice(0, 16);
    if (((s.healthTomas || {})[chave] || []).some(tm => String(tm.quando).slice(0, 16) === minuto)) {
      return 'Essa toma já está marcada.';
    }
    const idLocal = `toma-${Date.now()}-${++contadorDeTomas}`;
    set(x => ({
      healthTomas: {
        ...(x.healthTomas || {}),
        [chave]: [...((x.healthTomas || {})[chave] || []), { id: idLocal, quando: iso, por }],
      },
    }));
    // Sobe pelo travão da saúde — o `tomaDeSaude` chama o `recusaSaude`. Sem
    // id do servidor na receita, a toma fica local até a receita subir.
    if (sync) {
      const ses = sync.sessao();
      const idPor = idDoMembro(por);
      if (ses && receita.idServidor && idPor) sync.tomaDeSaude({
        casa: ses.casa, receita: receita.idServidor, quando: iso, por: idPor,
      })
        .then(r => { if (r && r.id) set(x => ({
          healthTomas: {
            ...(x.healthTomas || {}),
            [chave]: ((x.healthTomas || {})[chave] || []).map(tm => (tm.id === idLocal ? { ...tm, idServidor: r.id } : tm)),
          },
        })); })
        .catch(() => {});
    }
    return null;
  };

  // Desmarca uma toma — só quem a marcou, cá e no servidor.
  const desmarcarToma = (healthId, recipeId, tomaId, quem) => {
    const receita = receitaDe(healthId, recipeId);
    if (!receita) return 'Essa receita não existe nesta ficha.';
    const chave = chaveDaReceita(receita);
    const toma = ((s.healthTomas || {})[chave] || []).find(tm => tm.id === tomaId);
    if (!toma) return 'Essa toma já não está marcada.';
    if (toma.por !== quem) return `Só ${toma.por} pode desmarcar esta toma.`;
    if (sync && toma.idServidor) {
      try { sync.apagarTomaDeSaude(toma.idServidor).catch(() => {}); }
      catch (e) { return e.message; }
    }
    set(x => ({
      healthTomas: {
        ...(x.healthTomas || {}),
        [chave]: ((x.healthTomas || {})[chave] || []).filter(tm => tm.id !== tomaId),
      },
    }));
    return null;
  };

  // O título dos eventos das tomas — é por ele que se sabe se já estão na agenda.
  const tituloDasTomas = (receita, plano) => `${receita.name} · ${plural(plano.frequencia, 'toma', 'tomas')}`;
  const agendaTemTomas = (healthId, recipeId) => {
    const record = allHealth().find(h => h.id === healthId);
    const receita = receitaDe(healthId, recipeId);
    const plano = record && receita ? planoDaReceita(receita, record.day) : null;
    if (!plano) return false;
    const titulo = tituloDasTomas(receita, plano);
    return allEvents().some(e => e.healthId === healthId && e.tag === 'Medicação' && e.title === titulo);
  };

  // Põe as tomas na Agenda: um evento por dia do plano, de hoje em diante,
  // «só adultos» — a criança não vê a sua medicação na agenda dela. Não
  // duplica os dias que já lá estão. Devolve quantos entraram, ou a frase do
  // que impede.
  const porTomasNaAgenda = (healthId, recipeId, owner) => {
    const record = allHealth().find(h => h.id === healthId);
    const receita = receitaDe(healthId, recipeId);
    if (!record || !receita) return 'Essa receita não existe nesta ficha.';
    const plano = planoDaReceita(receita, record.day);
    if (!plano) return 'Defina primeiro as tomas por dia e a duração.';
    const titulo = tituloDasTomas(receita, plano);
    const ja = new Set(allEvents()
      .filter(e => e.healthId === healthId && e.tag === 'Medicação' && e.title === titulo)
      .map(e => e.day));
    let n = 0;
    for (const dia of plano.dias) {
      if (dia < TODAY_KEY || ja.has(dia)) continue;
      criarEvento({
        day: dia, time: '', title: titulo, who: `${record.member} · Medicação`,
        owner, visibilidade: 'adultos', tag: 'Medicação', healthId, semRegisto: true,
      });
      n++;
    }
    // Uma linha no registo, e não catorze. Sem o nome do medicamento: o
    // registo é lido por todos os adultos, e a ficha existe para o guardar.
    if (n) set(x => ({ registo: maisRegisto(x, `Tomas de uma receita ${DE(record.member)} ${record.member} na agenda: ${plural(n, 'dia', 'dias')}`, 'Saúde') }));
    return n;
  };

  // ⚠ Idem. E aqui a coleção tem um ÍNDICE ÚNICO por episódio, de propósito:
  // uma decisão é um ESTADO, não um movimento, e não se pode somar. Dois
  // telefones que decidam ao mesmo tempo encontram-se no servidor em vez de
  // criarem uma linha cada um — é o `decisaoDeSaude` que trata disso.
  const setHealthDecision = (healthId, type, status, note) => {
    set(x => ({
      healthDecisions: {
        ...x.healthDecisions,
        [healthId]: { type, status, note, updatedAt: new Date().toISOString() },
      },
    }));

    if (sync) {
      const ses = sync.sessao();
      const episodio = episodioNoServidor(healthId);
      if (ses && episodio) sync.decisaoDeSaude({
        casa: ses.casa, episodio, tipo: type, estado: status, nota: note,
      }).catch(() => {});
    }
  };

  // Quantas consultas guardam este nome.
  //
  // ⚠ `allHealth()` e não `s.health`: as sementes são código e só o que se
  // acrescenta é que se grava. Contar pelo gravado dizia «sem consultas» de uma
  // especialidade com três à vista no ecrã — e essa é exactamente a conta que
  // decide se ela se pode apagar.
  const consultasDaEspecialidade = (nome) =>
    allHealth().filter(h => h.specialty === nome).length;

  // Devolvem null quando correm bem e uma frase em português quando não, como o
  // `renameSpecialty` e o `renomearMembro`. Não rebentam: quem chama mostra a
  // frase.
  // ⚠ `quem` é obrigatório, e é a resposta a uma divergência que o dono da casa
  // decidiu em 05/09/2026: o SERVIDOR manda. A regra das três listas exige
  // administração (`createRule: casa && admin`), e a app deixava qualquer
  // adulto criar uma especialidade — a dele ficava no telefone dele, recusada
  // ao subir e sem uma palavra.
  //
  // Agora a app diz o mesmo que o servidor, e di-lo ANTES de tentar. Sem o
  // `quem` a chamada não passa: um esquecimento não pode abrir a porta.
  const SO_ADMIN = 'Só quem administra a casa pode gerir as especialidades.';

  const SO_ADMIN_CATEGORIAS = 'Só quem administra a casa pode criar categorias.';

  const addEquipCat = (nome, quem) => {
    if (!isAdmin(quem)) return SO_ADMIN_CATEGORIAS;
    const n = String(nome || '').trim();
    if (!n) return 'A categoria precisa de um nome.';
    if (n.length > 40) return 'O nome não pode passar de 40 caracteres.';
    if ((s.equipCats || []).some(e => e.toLowerCase() === n.toLowerCase())) {
      return 'Já existe uma categoria com esse nome.';
    }
    set(x => ({
      equipCatsProprias: true,
      equipCats: [...(x.equipCats || []), n],
      registo: maisRegisto(x, `Categoria de equipamento criada: ${n}`, 'Equipamentos'),
    }));
    listaAcrescenta('equipCats', n);
    return null;
  };

  const addSpecialty = (nome, quem) => {
    if (!isAdmin(quem)) return SO_ADMIN;
    const n = String(nome || '').trim();
    if (!n) return 'A especialidade precisa de um nome.';
    if (n.length > 40) return 'O nome não pode passar de 40 caracteres.';
    // Sem acentos-cegos: «Pediatria» e «pediatria» são a mesma, e duas linhas
    // iguais na lista não se distinguem ao marcar uma consulta.
    if ((s.specialities || []).some(e => e.toLowerCase() === n.toLowerCase())) {
      return 'Já existe uma especialidade com esse nome.';
    }
    set(x => ({
      specialities: [...(x.specialities || []), n],
      registo: maisRegisto(x, `Especialidade criada: ${n}`, 'Saúde'),
    }));
    listaAcrescenta('specialities', n);
    return null;
  };

  // ⚠ Uma especialidade só se apaga quando não tem consultas.
  //
  // Isto apagava sempre, e o ecrã perguntava antes com uma mensagem que
  // prometia que «as consultas já marcadas com ela ficam como estão». Ficavam —
  // a apontar, em TEXTO, para um nome que já não está em lado nenhum. O
  // `renameSpecialty` teve de aprender a migrar os episódios precisamente por
  // este motivo, e apagar deixava-os órfãos pela porta do lado.
  //
  // A regra é a do protótipo, e a do `docs/especificacao-ecras.md`: apagar as
  // que não têm consultas. Quem quiser tirar uma que está em uso renomeia-a,
  // que leva as consultas atrás.
  const removeSpecialty = (nome, quem) => {
    if (!isAdmin(quem)) return SO_ADMIN;
    if (!(s.specialities || []).includes(nome)) {
      return 'Essa especialidade não existe nesta casa.';
    }
    const usadas = consultasDaEspecialidade(nome);
    if (usadas) {
      return `«${nome}» tem ${plural(usadas, 'consulta', 'consultas')} e não se apaga. Renomeie-a — o nome novo vai com elas.`;
    }
    set(x => ({
      specialities: (x.specialities || []).filter(e => e !== nome),
      registo: maisRegisto(x, `Especialidade apagada: ${nome}`, 'Saúde'),
    }));
    listaApaga('specialities', nome);
    return null;
  };

  // Renomear uma especialidade tem de LEVAR CONSIGO tudo o que guarda o nome —
  // e o nome está em TRÊS sítios, não em um:
  //
  //     specialities        a lista, que é a única que se vê
  //     health[].specialty  os episódios. Guardam a especialidade como TEXTO,
  //                         não por referência
  //     added[].title       o evento da agenda que «marcar consulta» cria, com
  //                         o título `Consulta <especialidade>` lá dentro
  //
  // ⚠ Isto era só a primeira linha. Renomear trocava o nome na lista e deixava
  // as consultas a apontar para um nome que já não existia — a ficha do Léo
  // continuava a dizer «Pediatria» e a lista já não a tinha. Por isso a
  // interface de renomear foi retirada até isto ficar feito.
  //
  // ⚠ Nos eventos a troca é por título EXATO (`Consulta <antigo>`) e só com a
  // etiqueta «Saúde». Uma substituição de texto solta apanharia um evento que
  // alguém escreveu à mão e que só por acaso tem a palavra lá dentro.
  //
  // Devolve null quando corre bem e uma frase em português quando não, como o
  // `renomearMembro`.
  const renameSpecialty = (antigo, novo, quem) => {
    if (!isAdmin(quem)) return SO_ADMIN;
    const lista = s.specialities || [];
    if (!lista.includes(antigo)) return 'Essa especialidade não existe nesta casa.';
    const n = String(novo || '').trim();
    if (!n) return 'A especialidade precisa de um nome.';
    if (n === antigo) return null;                 // nada a fazer
    if (n.length > 40) return 'O nome não pode passar de 40 caracteres.';

    // ⚠ Renomear para um nome que JÁ existe é uma fusão, não um erro: as
    // consultas do nome antigo passam para o que fica e a lista não ganha uma
    // entrada repetida. É o que uma pessoa quer dizer quando corrige
    // «Pediatra» para a «Pediatria» que já lá estava.
    //
    // A comparação ignora maiúsculas e o alvo é a grafia que JÁ está na lista —
    // senão «pediatria» e «Pediatria» ficavam as duas, que é o mesmo defeito
    // com outra cara. Mudar só as maiúsculas do próprio nome continua a ser um
    // renomear: o `find` exclui o antigo.
    const existente = lista.find(e => e !== antigo && e.toLowerCase() === n.toLowerCase());
    const alvo = existente || n;

    set(x => ({
      specialities: existente
        ? (x.specialities || []).filter(e => e !== antigo)
        : (x.specialities || []).map(e => (e === antigo ? alvo : e)),
      health: (x.health || []).map(h => (
        h.specialty === antigo ? { ...h, specialty: alvo } : h)),
      added: (x.added || []).map(e => (
        e.tag === 'Saúde' && e.title === `Consulta ${antigo}`
          ? { ...e, title: `Consulta ${alvo}` } : e)),
      registo: maisRegisto(x, existente
        ? `A especialidade ${antigo} passou a contar como ${alvo}`
        : `A especialidade ${antigo} passou a chamar-se ${alvo}`, 'Saúde'),
    }));

    // ⚠ Uma FUSÃO não é um renomear: quando o nome novo já existe, a antiga
    // desaparece da lista e as consultas passam a contar na que fica. Do lado
    // do servidor isso é apagar a linha antiga, não renomeá-la — renomeá-la
    // deixava duas linhas com o mesmo nome, que é o defeito que a fusão existe
    // para evitar.
    if (existente) listaApaga('specialities', antigo);
    else listaRenomeia('specialities', antigo, alvo);
    return null;
  };

  // Google Calendar: importar eventos
  // events: array de { id, title, date, time, description, isRecurring }
  // `visibilidade`: um dos três níveis, como em qualquer outro evento. Era um
  // booleano, e por isso a importação era o único sítio da app onde não se
  // podia dizer «só os adultos».
  // ⚠ Isto era um `set` direto no `added`, e o evento importado ficava NUM
  // TELEMÓVEL SÓ.
  //
  // A Rita trazia da agenda dela a reunião da escola, via-a na Nossa Casa, e o
  // Tomás não via nada — a app diz «Sincronizar eventos do Google Calendar» e
  // sincronizava com metade da casa. É a mesma forma de defeito das oito
  // funções de escrita que ninguém chamava, e a mesma que o `criarEvento` da
  // folha de agendar teve até 05/09.
  //
  // Agora passa pela MESMA porta que os outros dois sítios que criam eventos.
  // Ganha com isso o servidor da casa, e ganha a garantia de não voltar à
  // Google: o `idGoogle` diz ao `criarEvento` que este já lá está.
  const importGoogleEvents = (events, user, visibilidade = 'familia') => {
    for (const ev of events) {
      criarEvento({
        // O mesmo defeito que o «Guardar evento» tinha: a app lê chaves
        // (`d2026-08-27`) e isto punha `2026-08-27`. Os eventos importados
        // gravavam-se e não apareciam.
        day: /^d/.test(String(ev.date)) ? ev.date : `d${ev.date}`,
        time: ev.time || '',
        title: ev.title,
        who: user,
        owner: user,
        visibilidade,
        // ⚠ O identificador da Google guarda-se, e não se guardava.
        //
        // Sem ele, um evento trazido da agenda podia ser editado e apagado na
        // app e a Google nunca saber: a mesma reunião, com duas horas
        // diferentes, em dois sítios, sem nada a dizer qual está certa. E o
        // «Apagar» dizia «sai da agenda de quem o via», deixava-o na Google, e
        // no dia seguinte ele estava lá a apitar.
        idGoogle: ev.id,
        // Uma linha só no fim, e não uma por evento.
        semRegisto: true,
        // O que só a app usa. O servidor não tem `source` nem `isRecurring`, e
        // inventar-lhe campos era o caminho para eles caírem em silêncio.
        extra: { source: 'Google Calendar', isRecurring: ev.isRecurring || false },
      });
    }

    const imported = {};
    events.forEach(ev => { imported[ev.id] = true; });
    set(x => ({
      googleCalendarImported: { ...(x.googleCalendarImported || {}), ...imported },
      registo: maisRegisto(x,
        `${plural(events.length, 'evento trazido', 'eventos trazidos')} da agenda da Google`,
        'Agenda'),
    }));
  };

  return {
    s, set,
    allTasks, allItems, allEvents, allEquip, editEquip, removeEquip, removerArtigo,
    budget, spent, remaining: budget - spent, envelopes, kidPts,
    rendimentoDoMes, definirOrcamento, mesCorrente,
    mesAberto, mesAbertoDesde,
    vaultOf, vaultMoves, vaultAdd,
    // As metas: a lista já com o juntado somado, e as quatro operações.
    metas, movimentosDaMeta, criarMeta, alterarMeta, apagarMeta, reforcarMeta,
    verificarPin, temPin, entrarCrianca, mudarMeuPin,
    // Os membros da casa. Quem consome isto NUNCA deve importar MEMBERS de
    // data.js: essas são as sementes da demonstração, não a casa de quem está
    // a usar a app.
    membros: s.membros || MEMBERS,
    membrosDaCasa, criancas, adultos, acerto, acertado, pagarAcerto,
    precos: s.precos || [],
    definirPrecoPago, registarPrecos,
    // O que se sabe do preço deste artigo, na loja onde se vai comprar.
    precoDe: (artigo, loja) => estimativaDe(s.precos || [], artigo, loja),
    precosDeArtigo: (rotulo) => precosDe(s.precos || [], rotulo),
    // Qual das lojas sai mais barata para esta lista — ou `null`, que é a
    // resposta certa enquanto não houver o que comparar.
    compararLojas: (artigos) => compararLojas(s.precos || [], artigos, s.stores || []),
    podeVerEvento: (e, viewer) => podeVerEvento(e, viewer, quadro),
    podeEditarEvento: (e, viewer) => podeEditarEvento(e, viewer, quadro),
    editarEvento, removerEvento, idsGoogleDaCasa, eventosQueSairamDaGoogle,
    lojaDoPlano, diaDoPlano,
    artigo, oNome, aoNome, deNome,
    nomeDaCasa: s.nomeDaCasa || 'Bengui',
    deDemonstracao: s.deDemonstracao !== false,
    canSeeHealth, allHealth, healthOf, allHealthDocs, docsOf, nextHealth,
    garantiasAExpirar, receitasAExpirar, consultasProximas,
    tapTask, isAdmin, canChangeRole, setRole, setPin, pinError, isRecurring, definirAvatar, trazerFotografia,
    removerTarefa, criarTarefa, editarTarefa, mudarUrgencia, mudarPrazo, tarefaNoServidor, mudarRegraDaCasa, mudarListaDaCasa,
    trocasDeHoje, trocasDe, tarefasParaTrocar, proporTroca, aceitarTroca, desfazerTroca,
    extractosDaCasa, extractoDoMesAberto,
    partilharLista, desfazerPartilha,
    moverEntreEnvelopes, criarEnvelope, alterarEnvelope, apagarEnvelope, registarDespesa,
    criarEvento, alterarEventoDaCasa, eventoNoServidor, escoarFilaGoogle,
    criarArtigo, alterarArtigo, reordenarArtigos, repetirCompra, artigosQueFaltamDaIda, artigosDaIda,
    definirObjetivo, apagarObjetivo,
    criarPrato, alterarPrato, apagarPrato, marcarJantar, oQueFalta, porOQueFaltaNaLista,
    contasDoMes, contasAVencer, contasNaAgenda, criarContaFixa, alterarContaFixa, apagarContaFixa, pagarContaFixa,
    contratosDaCasa, contratosARenovar, criarContrato, alterarContrato, apagarContrato,
    marcarArtigo, artigoNoServidor, mudarPlanoDeCompras, fecharIdaAsCompras,
    seccoes, criarSeccao, alterarSeccao, apagarSeccao, reordenarSeccoes,
    iconeDaSeccao, escolherIconeDaSeccao, donoDosIcones, corredoresSemIcone,
    // Pela positiva, como o `ementaNaCasa`. A grelha de escolher e os títulos
    // dos corredores leem isto; o dado é que está pela negativa.
    iconesNosCorredores,
    criarEquipamento, equipNoServidor, mudarPreferencia,
    abrirMes, fecharMes, mudarLimiteDoMes,
    podeGerirCasa, renomearCasa, acrescentarMembro, editarMembro, renomearMembro, removerMembro,
    lerDoServidor, seguirCompras,
    dueOf: (t) => (t.dueKey ? dueInfo(t.dueKey, t.dueTime) : null),
    resetDemo: () => { AsyncStorage.removeItem(KEY).catch(() => {}); set(DEMO()); },
    // «Começar de Zero» neste aparelho: o estado volta a estar vazio, e a cópia de
    // segurança da migração — que guarda a casa ANTIGA inteira — sai também.
    // `zeradoEm` é o carimbo que o servidor devolveu, para este aparelho não se
    // apagar uma segunda vez quando ler a casa.
    startBlank: (zeradoEm = null) => {
      Promise.resolve(AsyncStorage.removeItem(BACKUP)).catch(() => {});
      set({ ...BLANK(), zeradoEm });
    },
    // Health feature methods
    addHealthRecord, addHealthNote, editarNotaSaude, apagarNotaSaude, notaDaConsulta,
    addRecipe, setRecipeDecision, setHealthDecision,
    definirTomas, alterarReceita, tomasDaReceita, marcarToma, desmarcarToma, agendaTemTomas, porTomasNaAgenda,
    alergiasDe, criarAlergia, apagarAlergia, fichaDeEmergencia,
    addHealthDoc, arquivarConsulta, docsDaConsulta, estaArquivada,
    apagarConsulta, porqueNaoApaga, oQueCaiCom, lerSaudeDoServidor,
    addSpecialty, addEquipCat, removeSpecialty, renameSpecialty, consultasDaEspecialidade,
    reordenarTarefas,
    // ⚠ UMA leitura da bandeira, e não `s.pontosLigados !== false` repetido em
    // seis ecrãs. O `!== false` é preciso porque uma casa gravada antes de
    // 04/09/2026 não tem o campo, e ausente significa LIGADO — era o que a app
    // fazia. Um `!!s.pontosLigados` desligava os pontos a quem já os usava, em
    // silêncio, ao actualizar.
    pontosNasTarefas: s.pontosLigados !== false,
    // A ementa da semana é opcional (12/09/2026). A chave é pela NEGATIVA, e por
    // isso ausente ou `false` é ligada sem truque nenhum — uma casa gravada
    // antes do campo, cá ou no servidor, não perde a secção em silêncio.
    ementaNaCasa: s.ementaDesligada !== true,
    // Google Calendar import
    importGoogleEvents,
  };
}
