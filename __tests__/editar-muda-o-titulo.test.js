/**
 * Editar muda o título.
 *
 * ── O que se pediu ───────────────────────────────────────────────────────────
 *
 * 15/09/2026: «quando se faz editar, o título não tem opção de alterar.
 * Verifica onde existe esta situação». Das onze folhas de edição, três tinham
 * o nome do que se edita fixo no cabeçalho e sem campo: a tarefa (urgência,
 * prazo, responsável, alternância — e nem o nome nem os pontos), a ficha do
 * equipamento (fotografias e manutenção — e nem o nome, a categoria, o preço,
 * a data de compra ou o fim da garantia), e a folha das tomas de uma receita
 * (o nome do medicamento). O dono da casa escolheu as três.
 *
 * ── A propriedade ────────────────────────────────────────────────────────────
 *
 *   1. Cada folha de edição oferece o que a folha de criar oferece — quem cria
 *      com cinco coisas altera com cinco (a regra do `GerirArtigo`).
 *   2. O título vai num RASCUNHO e sobe de uma vez no «Guardar», nunca a cada
 *      tecla (uma escrita no servidor por letra).
 *   3. ⚠ Mudar o nome de uma receita não apaga o plano de tomas: o `update`
 *      da receita só leva o plano quando o plano vem.
 */
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');

jest.mock('../src/pocketbase', () => ({
  estaLigado: () => false,
  auth: { valida: () => false, membro: () => null },
  ler: {},
  google: { disponivel: () => false, porLigar: () => false, verificar: async () => false },
}));

const { StoreProvider, useStore } = require('../src/store');

const RAIZ = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

const montadas = [];
const loja = (casa) => {
  const cofre = {};
  const Envolve = () => {
    const st = useStore();
    cofre.st = st;
    React.useMemo(() => st.set(casa), []);
    return null;
  };
  let a = null;
  TestRenderer.act(() => {
    a = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Envolve)));
  });
  montadas.push(a);
  return cofre;
};
afterEach(() => {
  TestRenderer.act(() => { montadas.forEach(a => a.unmount()); });
  montadas.length = 0;
});

// ── A tarefa ─────────────────────────────────────────────────────────────────
describe('a tarefa: o título e os pontos alteram-se na folha de gerir', () => {
  const tarefas = semComentarios(ler('src/screens/Tarefas.jsx'));
  const folha = tarefas.slice(tarefas.indexOf('title={task.title}'), tarefas.indexOf('Apagar Tarefa'));

  it('a folha tem o campo do título, com o mesmo rótulo em voz da folha de criar', () => {
    // O rótulo VISÍVEL é «Título» desde que a folha passou a ter secções
    // (15/09/2026): o título da secção «A Tarefa» diz o resto. O rótulo em
    // VOZ, que é o que um leitor de ecrã lê sem o contexto à volta, continua
    // a ser o inteiro, e igual ao da folha de criar.
    expect(folha).toMatch(/<SectionTitle t=\{t\}>A Tarefa<\/SectionTitle>/);
    expect(folha).toMatch(/<Label t=\{t\}>Título<\/Label>/);
    expect(folha).toMatch(/accessibilityLabel="Título da tarefa"/);
    expect(semComentarios(ler('src/sheets/NovaTarefa.jsx'))).toMatch(/accessibilityLabel="Título da tarefa"/);
  });

  it('e os pontos, no NumField, só com os pontos ligados e só enquanto a tarefa não rendeu', () => {
    expect(folha).toMatch(/\{pontosNasTarefas && !jaRendeu\(task\.id\) \? \([\s\S]*?<NumField[\s\S]*?rotulo="Pontos de bónus"/);
  });

  it('⚠ o título vai num rascunho e sobe no «Guardar alterações», não a cada tecla', () => {
    // A cada tecla era `editarTarefa` dentro do `onChangeText` — uma escrita
    // no servidor por letra.
    expect(folha).toMatch(/onChangeText=\{\(v\) => setRascunho\(r => \(\{ \.\.\.r, title: v \}\)\)\}/);
    expect(folha).not.toMatch(/onChangeText=\{\(v\) => editarTarefa/);
    expect(tarefas).toMatch(/const guardarTarefa = \(\) => \{[\s\S]*?editarTarefa\(task\.id, \{[\s\S]*?title: tituloDoRascunho\.trim\(\)/);
    expect(folha).toMatch(/onPress=\{guardarTarefa\}/);
  });

  it('um título vazio não se guarda — o botão desliga-se', () => {
    expect(folha).toMatch(/disabled=\{!tituloDoRascunho\.trim\(\)\}/);
  });

  it('a loja aceita o título e os pontos, e manda-os ao servidor com os nomes dele', () => {
    const c = loja({
      membros: { 'Rita': { initial: 'R', fem: true }, 'Léo': { initial: 'L', kid: true } },
      roles: { 'Rita': 'admin', 'Léo': 'crianca' },
      clearedSeeds: true,
      newTasks: [{ id: 'x1', title: 'Pôr o lixo', who: 'Léo', recur: 'Uma vez', pts: 5 }],
      urg: { x1: 1 }, due: {}, done: {},
    });
    TestRenderer.act(() => { c.st.editarTarefa('x1', { title: 'Pôr o lixo e o vidro', pts: 8 }); });
    const t = c.st.allTasks().find(x => x.id === 'x1');
    expect(t.title).toBe('Pôr o lixo e o vidro');
    expect(t.pts).toBe(8);
    const store = semComentarios(ler('src/store.jsx'));
    expect(store).toMatch(/campos\.title !== undefined \? \{ titulo: campos\.title \}/);
    expect(store).toMatch(/campos\.pts !== undefined \? \{ pontos: campos\.pts \}/);
  });
});

// ── O equipamento ────────────────────────────────────────────────────────────
describe('o equipamento: a ficha altera o que a folha de registar pede', () => {
  const ficha = semComentarios(ler('src/sheets/FichaEquipamento.jsx'));

  it('nome, categoria, preço, data de compra e fim da garantia', () => {
    expect(ficha).toMatch(/accessibilityLabel="Nome do equipamento"/);
    // ⚠ 26/09/2026: a categoria passou a ser um `CampoDeEscolha`, porque
    // deixou de ser uma constante e passou a ler a lista da CASA.
    expect(ficha).toMatch(/<CampoDeEscolha t=\{t\} rotulo="Categoria"/);
    // O `(\{\}\s*)?` é o que fica de um comentário JSX depois de os tirar.
    expect(ficha).toMatch(/<Label t=\{t\}>Preço<\/Label>\s*(\{\}\s*)?<NumField/);
    // «Comprado a» desde que o preço e a data passaram a partilhar a linha
    // (15/09/2026, opção E de `design/formularios-das-folhas.dc.html`): em meia
    // linha, «Data de compra» não cabia no rótulo.
    expect(ficha).toMatch(/<Label t=\{t\}>Comprado a<\/Label>\s*(\{\}\s*)?<CampoData[^>]*maximo=\{TODAY_KEY\}/);
    expect(ficha).toMatch(/<Label t=\{t\}>Fim da garantia<\/Label>\s*(\{\}\s*)?<CampoData/);
  });

  it('⚠ as categorias são as MESMAS ao registar e ao alterar — um módulo, dois leitores', () => {
    // ⚠ E desde 26/09/2026 a lista é a da CASA, não a constante: o `equipCats`
    // existia na loja e no servidor, o `puxarCasa` descia-o, e NENHUM ecrã o
    // lia — uma categoria escrita no servidor nunca aparecia na app. A
    // constante ficou como SEMENTE, para quem corre sem servidor.
    const modulo = ler('src/categorias-de-equipamento.js');
    expect(modulo).toMatch(/export const CATEGORIAS_DE_EQUIPAMENTO = \[/);
    expect(modulo).toMatch(/export const categoriasDaCasa = \(lista, propria = false\) =>/);
    const ecra = semComentarios(ler('src/screens/Equipamentos.jsx'));
    expect(ecra).toMatch(/categoriasDaCasa\(s\.equipCats, s\.equipCatsProprias\)/);
    expect(ficha).toMatch(/categoriasDaCasa\(daCasa\.equipCats, daCasa\.equipCatsProprias\)/);
    // Um módulo, dois leitores — continua a ser a propriedade.
    for (const f of [ecra, ficha]) {
      expect(f).toMatch(/from '\.\.?\/categorias-de-equipamento'/);
    }
  });

  it('vai tudo de uma vez pelo `editEquip`, no «Guardar alterações», e desligado sem mudança', () => {
    expect(ficha).toMatch(/const guardar = \(\) => \{[\s\S]*?editEquip\(equip\.id, \{\s*name: form\.name\.trim\(\), cat: form\.cat,/);
    expect(ficha).toMatch(/label="Guardar alterações"[\s\S]*?disabled=\{!form\.name\.trim\(\) \|\| !mudou\} onPress=\{guardar\}/);
    // As fotografias continuam a ir por si (classe 27: duas escritas à mesma
    // linha no mesmo tique).
    expect(ficha).toMatch(/editEquip\(equip\.id, \{ \[campo\]: r\.assets\[0\]\.uri \}\)/);
  });

  it('a loja aplica o nome e a categoria a um equipamento da casa', () => {
    const c = loja({
      membros: { 'Rita': { initial: 'R', fem: true } }, roles: { 'Rita': 'admin' }, clearedSeeds: true,
      newEquip: [{ id: 'e1', name: 'Frigorifico', cat: 'Outros', bought: '01/01/2025', warrantyEnd: '01/01/2027' }],
    });
    TestRenderer.act(() => { c.st.editEquip('e1', { name: 'Frigorífico LG', cat: 'Eletrodomésticos', price: 899 }); });
    const e = c.st.allEquip().find(x => x.id === 'e1');
    expect(e).toMatchObject({ name: 'Frigorífico LG', cat: 'Eletrodomésticos', price: 899 });
  });
});

// ── A receita ────────────────────────────────────────────────────────────────
describe('a receita: o nome do medicamento altera-se na folha das tomas', () => {
  const H = 'h2';
  const FERRO = { id: 'rx-ferro', name: 'Ferro 30 mg', dosage: '1 comprimido', quantity: '', unit: '',
    expiresAt: '31/12/2026', decision: null, frequency: 1, durationDays: 14, boxSize: 20 };
  const CASA = { healthRecipes: { [H]: [FERRO] }, healthTomas: {} };

  it('a folha tem o campo do nome e o das notas, e o «Guardar alterações» só aparece quando algo mudou', () => {
    const folha = semComentarios(ler('src/sheets/TomasDaReceita.jsx'));
    expect(folha).toMatch(/accessibilityLabel="Nome do medicamento"/);
    expect(folha).toMatch(/accessibilityLabel="Notas da receita"/);
    // ⚠ `textoMudou || (p && planoMudou)`, e não `p && mudou`: numa receita
    // ainda sem plano não havia botão nenhum que guardasse o nome, a dose, a
    // validade ou as notas, e o que se escrevia perdia-se ao fechar a folha.
    expect(folha).toMatch(/\{\(textoMudou \|\| \(p && planoMudou\)\) \? \(\s*<BotaoCompacto[^>]*label="Guardar alterações"/);
    expect(folha).toMatch(/alterarReceita\(record\.id, recipe\.id, \{\s*name: rascunho\.name, dosage: rascunho\.dosage, quantity: rascunho\.quantity, unit: rascunho\.unit,\s*expiresAt: rascunho\.expiresAt, notas: rascunho\.notas,/);
    // A receita completa (15/09/2026, «parece-me incompleto»): o que a folha
    // de criar pede, esta altera — com os mesmos rótulos.
    for (const rotulo of ['Dose', 'Quantidade', 'Unidade']) {
      expect(folha).toContain(`accessibilityLabel="${rotulo}"`);
      expect(ler('src/screens/Saude.jsx')).toContain(`accessibilityLabel="${rotulo}"`);
    }
    expect(folha).toMatch(/<CampoData t=\{t\} valor=\{chaveDeDMY\(rascunho\.expiresAt\)\}/);
  });

  it('a folha cresce com o plano: sem plano, só a receita e «Definir plano» no rodapé', () => {
    const folha = semComentarios(ler('src/sheets/TomasDaReceita.jsx'));
    expect(folha).toMatch(/useAcaoDaFolha\(p\s*\? <Primary comum t=\{t\} label="Tomado agora"[\s\S]*?: <Primary comum t=\{t\} label="Definir plano"/);
    // Hoje, Antes e a Agenda vivem dentro do `{p ? (` — não se mostram vazios.
    const i = folha.indexOf('{p ? (\n        <>');
    expect(i).toBeGreaterThan(0);
    const bloco = folha.slice(i, folha.indexOf('</>', i));
    for (const s of ['Hoje ·', 'Antes de hoje', 'Pôr as tomas na Agenda']) expect(bloco).toContain(s);
    // E o plano é uma linha de três números compactos, aqui e na folha de criar.
    expect(folha.match(/<NumField t=\{t\} compacto/g)).toHaveLength(1);
    expect(semComentarios(ler('src/screens/Saude.jsx'))).toMatch(/<NumField t=\{t\} compacto/);
  });

  it('a loja altera a dose, a quantidade, a unidade e a validade — e recusa a validade vazia', () => {
    const c = loja(CASA);
    let msg;
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { dosage: '2 comprimidos', quantity: '30', unit: 'un', expiresAt: '30/11/2026' }); });
    expect(msg).toBeNull();
    expect(c.st.s.healthRecipes[H][0]).toMatchObject({ dosage: '2 comprimidos', quantity: '30', unit: 'un', expiresAt: '30/11/2026', frequency: 1 });
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { expiresAt: '' }); });
    expect(msg).toBe('A receita precisa de uma validade.');
    const sync = semComentarios(ler('src/sync.js'));
    for (const k of ['dose', 'quantidade', 'unidade']) expect(sync).toMatch(new RegExp(`if \\('${k}' in campos\\) linha\\.${k} = `));
    expect(sync).toMatch(/if \('expiraEm' in campos\) linha\.expira_em = isoDeDMY\(campos\.expiraEm\)/);
  });

  it('⚠ a folha das tomas tem a forma das «Gerir…» (desenho A, 15/09/2026)', () => {
    // «Este layout não me parece consistente com o resto da app»: botão comum
    // no corpo com o rodapé vazio, «Fechar» escrito, quatro formas de botão.
    const folha = semComentarios(ler('src/sheets/TomasDaReceita.jsx'));
    expect(folha).toMatch(/useAcaoDaFolha\(p\s*\? <Primary comum t=\{t\} label="Tomado agora"/);   // o rodapé fixo
    expect(folha).toMatch(/<Bar t=\{t\} pct=\{pct\}/);                                       // o estado como a meta
    expect(folha).toMatch(/<Row t=\{t\} icon="calendar" title="Pôr as tomas na Agenda"/);   // linha com seta, não botão
    expect(folha).toMatch(/<Linha key=\{tm\.id\}/);                                          // uma Linha por toma
    expect(folha).not.toMatch(/PastilhaTocavel/);                                           // a pastilha verde saiu
    expect(folha).not.toMatch(/>\s*Fechar\s*</);                                             // o «Fechar» escrito saiu
    expect(folha).not.toMatch(/onClose/);                                                    // a folha fecha no ×
    // Um só botão compacto no corpo, para tudo o que se altera na receita; e
    // os dois `Primary` são o MESMO rodapé, um por estado (sem/com plano).
    expect(folha.match(/<BotaoCompacto/g)).toHaveLength(1);
    expect(folha.match(/<Primary\b/g)).toHaveLength(2);
  });

  it('⚠ as notas nascem nos DOIS sítios do servidor, e na folha de criar a receita', () => {
    // «adicionar notas» (15/09/2026). Um campo novo precisa do
    // `criar-colecoes.mjs` E da tabela do `acrescentar-campos.mjs` (CLAUDE.md).
    expect(ler('db/pocketbase/criar-colecoes.mjs')).toMatch(/txt\('notas', \{ max: 500 \}\)/);
    expect(ler('db/pocketbase/acrescentar-campos.mjs')).toMatch(/\['receitas_saude', 'notas', \{ type: 'text', max: 500 \}\]/);
    const sync = semComentarios(ler('src/sync.js'));
    expect(sync).toMatch(/notas: r\.notas \|\| ''/);
    expect(sync).toMatch(/if \('notas' in campos\) linha\.notas = /);
    // E quem cria com notas altera com notas — o mesmo rótulo nos dois sítios.
    expect(ler('src/screens/Saude.jsx')).toMatch(/accessibilityLabel="Notas da receita"/);
    expect(ler('src/screens/Saude.jsx')).toMatch(/\{recipe\.notas \? \(/);
  });

  it('as notas guardam-se sem tocar no nome, e vice-versa', () => {
    const c = loja(CASA);
    let msg;
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { notas: '  Depois do jantar ' }); });
    expect(msg).toBeNull();
    expect(c.st.s.healthRecipes[H][0]).toMatchObject({ name: 'Ferro 30 mg', notas: 'Depois do jantar', frequency: 1 });
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { name: 'Ferro 30 mg · Ferrum', notas: 'Depois do jantar' }); });
    expect(c.st.s.healthRecipes[H][0]).toMatchObject({ name: 'Ferro 30 mg · Ferrum', notas: 'Depois do jantar' });
    // E a receita criada com notas fica com elas.
    TestRenderer.act(() => { c.st.addRecipe(H, 'Vitamina D', '', '', '', '31/12/2026', { notas: 'Com uma refeição' }); });
    expect(c.st.s.healthRecipes[H][1]).toMatchObject({ name: 'Vitamina D', notas: 'Com uma refeição' });
  });

  it('a loja muda o nome e deixa o plano e as tomas como estavam', () => {
    const c = loja(CASA);
    TestRenderer.act(() => { c.st.marcarToma(H, 'rx-ferro', 'Rita'); });
    expect(c.st.tomasDaReceita(H, 'rx-ferro')).toHaveLength(1);
    let msg;
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { name: 'Ferro 30 mg · Ferrum' }); });
    expect(msg).toBeNull();
    const r = c.st.s.healthRecipes[H][0];
    expect(r).toMatchObject({ name: 'Ferro 30 mg · Ferrum', frequency: 1, durationDays: 14, boxSize: 20 });
    expect(c.st.tomasDaReceita(H, 'rx-ferro')).toHaveLength(1);
  });

  it('um nome vazio recusa-se com uma frase; o mesmo nome não escreve nada', () => {
    const c = loja(CASA);
    let msg;
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { name: '   ' }); });
    expect(msg).toBe('Escreva o nome do medicamento.');
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-ferro', { name: 'Ferro 30 mg' }); });
    expect(msg).toBeNull();
    TestRenderer.act(() => { msg = c.st.alterarReceita(H, 'rx-nao-ha', { name: 'X' }); });
    expect(msg).toBe('Essa receita não existe nesta ficha.');
  });

  it('⚠ o `update` da receita só leva o plano quando o plano vem — mudar o nome não o zera', () => {
    // O `alterarReceitaDeSaude` mandava SEMPRE `planoNoServidor(campos)`: um
    // pedido só com o nome punha frequência, dias e caixa a zero.
    const sync = semComentarios(ler('src/sync.js'));
    const fn = sync.slice(sync.indexOf('export async function alterarReceitaDeSaude'), sync.indexOf('// ── As tomas'));
    expect(fn).toMatch(/if \('nome' in campos\) linha\.nome = /);
    expect(fn).toMatch(/\['frequencia', 'duracaoDias', 'caixa'\]\.some\(k => k in campos\)\) Object\.assign\(linha, planoNoServidor\(campos\)\)/);
    expect(fn).not.toMatch(/update\(idNoServidor, planoNoServidor\(campos\)\)/);
  });
});

// ── O NumField sobe o valor a cada tecla ─────────────────────────────────────
describe('⚠ o NumField sobe o valor a cada tecla, não só ao perder o foco', () => {
  // «Definir plano não está a fazer nada» (15/09/2026): o valor só subia no
  // `onBlur`, e o primeiro toque no botão do rodapé servia para tirar o foco
  // ao campo — nesse desenho o botão ainda estava desligado e o `onPress` era
  // `undefined`. Vale para todas as folhas com um número e um botão a seguir.
  const { NumField } = require('../src/ui');
  const { buildTheme } = require('../src/theme');
  const T = buildTheme(0, false);
  const campoDe = (r) => r.root.findAll(n => typeof n.type === 'string' && n.props && n.props.accessibilityLabel === 'Tomas por dia').pop();

  it('escrever «2» chama o onChange com 2 antes de qualquer blur', () => {
    const visto = [];
    let r;
    TestRenderer.act(() => {
      r = TestRenderer.create(React.createElement(NumField, { t: T, compacto: true, vazio: true, suffix: false, step: 1, min: 0, max: 999,
        rotulo: 'Tomas por dia', value: null, onChange: (v) => visto.push(v) }));
    });
    TestRenderer.act(() => { campoDe(r).props.onChangeText('2'); });
    expect(visto).toEqual([2]);
    TestRenderer.act(() => { campoDe(r).props.onChangeText('2,'); });   // a meio, ainda 2
    expect(visto).toEqual([2, 2]);
    TestRenderer.act(() => { campoDe(r).props.onChangeText(''); });     // vazio é vazio
    expect(visto).toEqual([2, 2, null]);
    r.unmount();
  });

  it('e os três lado a lado não saem da linha: o campo não tem largura própria', () => {
    const ui = semComentarios(ler('src/ui.jsx'));
    const campo = ui.slice(ui.indexOf('export function NumField'), ui.indexOf('export const Card'));
    // O `estreito` (15/09/2026) dá-lhe uma largura fixa para caber ao lado do
    // botão; sem ele, continua a não ter largura própria — que é o que impede
    // três campos lado a lado de saírem da linha.
    expect(campo).toMatch(/\{ flex: 1, flexBasis: 0, minWidth: 0 \}/);
    expect(campo).toMatch(/estreito \? \{ width: 104, flexGrow: 0, flexShrink: 0 \}/);
    expect(campo).toMatch(/onChangeText=\{escrever\}/);
  });

  // ⚠ O GUARDA GENÉRICO desta classe: a cada tecla é seguro para um `useState`
  // do ecrã, e não é seguro para uma escrita na LOJA ou no SERVIDOR — «0,35»
  // manda «0», «0», «0,3» e «0,35», quatro PATCH diretos e sem fila, e ganha o
  // último a CHEGAR. Quem escreve fora do ecrã usa o `aoTerminar`, que só
  // dispara no valor assente (blur, «guardar» do teclado, «−»/«+»).
  it('⚠ nenhum `onChange` de um NumField escreve fora do ecrã — isso é o `aoTerminar`', () => {
    const fs = require('fs'); const path = require('path');
    const jsx = [];
    (function percorrer(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) percorrer(p);
        else if (/\.jsx$/.test(e.name)) jsx.push(path.relative(RAIZ, p).split(path.sep).join('/'));
      }
    })(path.join(RAIZ, 'src'));

    // O que um `onChange` PODE chamar: um setter de estado do React (`setX`), e
    // os dois ajudantes locais que só fazem `onChange` para o pai.
    const LOCAIS = /^(set[A-Z]\w*|campo|muda|Number|String|Math)$/;
    const maus = [];
    let campos = 0;
    for (const rel of jsx) {
      const txt = semComentarios(ler(rel));
      let i = txt.indexOf('<NumField');
      while (i !== -1) {
        const fim = txt.indexOf('/>', i);
        const tag = txt.slice(i, fim === -1 ? txt.length : fim);
        campos += 1;
        const m = /onChange=\{([\s\S]*?)\}\s*(?:\/|[a-zA-Z-]+=)/.exec(tag + ' ')
          || /onChange=\{([\s\S]*)$/.exec(tag);
        const corpo = m ? m[1] : '';
        // ⚠ O `(?<![.\w$])` é para não apanhar o que vem depois de um ponto: o
        // `Math.round(v)` da conta fixa dava «round» e passava por chamada solta.
        const chamadas = [...corpo.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(x => x[1]);
        const foraDoEcra = chamadas.filter(c => !LOCAIS.test(c));
        if (foraDoEcra.length && !/aoTerminar=/.test(tag)) {
          maus.push(`${rel}: onChange chama ${foraDoEcra.join(', ')} sem aoTerminar`);
        }
        i = txt.indexOf('<NumField', i + 1);
      }
    }
    // Se o varrimento deixar de encontrar campos, o guarda deixou de guardar.
    expect(campos).toBeGreaterThan(15);
    expect(maus).toEqual([]);
  });

  it('e o `aoTerminar` dispara no blur e nos botões, nunca a meio de uma tecla', () => {
    const ui = semComentarios(ler('src/ui.jsx'));
    const campo = ui.slice(ui.indexOf('export function NumField'), ui.indexOf('export const Card'));
    expect(campo).toMatch(/const assente = \(v\) => \{ onChange\(v\); if \(aoTerminar\) aoTerminar\(v\); \}/);
    expect(campo).toMatch(/onPress=\{\(\) => assente\(para\)\}/);   // os botões
    expect(campo).toMatch(/assente\(aosCentimos\(/);                // o commit do blur
    // O `escrever` (a cada tecla) NÃO passa pelo assente.
    const escrever = campo.slice(campo.indexOf('const escrever'), campo.indexOf('const Botao'));
    expect(escrever).not.toMatch(/assente\(/);
  });

  it('o valor do ponto da Gestão escreve na casa só no valor assente', () => {
    const gestao = semComentarios(ler('src/screens/Gestao.jsx'));
    expect(gestao).toMatch(/value=\{pontoAEscrever \?\? s\.pointValue\}/);
    expect(gestao).toMatch(/onChange=\{setPontoAEscrever\}/);
    expect(gestao).toMatch(/aoTerminar=\{\(v\) => \{ setPontoAEscrever\(null\); mudarRegraDaCasa\(\{ pointValue: v \}\); \}\}/);
  });
});

// ── E onde já se podia ───────────────────────────────────────────────────────
describe('as outras oito folhas de edição já deixavam mudar o nome — e continuam', () => {
  it.each([
    ['src/sheets/GerirArtigo.jsx', 'Nome do artigo'],
    ['src/sheets/GerirMeta.jsx', 'Nome da meta'],
    ['src/sheets/CamposContaFixa.jsx', 'Nome da conta'],
    ['src/sheets/CamposContrato.jsx', 'Nome do contrato'],
    ['src/sheets/NovoEvento.jsx', 'Título do evento'],
    ['src/screens/Gestao.jsx', 'Nome do envelope'],
    ['src/screens/Gestao.jsx', 'Nome da loja'],
    ['src/screens/Gestao.jsx', 'Nome do membro'],
    ['src/KidApp.jsx', 'Nome do objetivo'],
  ])('%s tem «%s»', (f, rotulo) => {
    expect(ler(f)).toContain(`accessibilityLabel="${rotulo}"`);
  });
});
