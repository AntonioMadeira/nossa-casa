/**
 * UMA ESCOLHA QUE CRESCE COM A CASA NÃO SE FAZ NUMA FILA QUE QUEBRA
 * ============================================================================
 *
 * 25/09/2026. Ele abriu a folha de criar artigo e disse: «arranja uma solução
 * melhor para os filtros dos corredores, quando forem muitos vão ocupar muito
 * espaço». O simulador de `design/escolher-corredor.dc.html` mediu-o:
 *
 *     corredores        4      8     15     27
 *     pastilhas       149    197    293    485 px
 *     o campo B        83     83     83     83 px
 *
 * Escolheu a B — uma linha que abre a lista — e mandou usá-la «em todos os
 * sítios com situações semelhantes».
 *
 * ── Porque é que isto é um guarda e não um recado ────────────────────────────
 *
 * O varrimento encontrou a MESMA fila de pastilhas em dez sítios, e a mesma
 * pergunta já tinha sido respondida de três maneiras diferentes nesta app: a
 * folha de marcar consulta escreveu a sua própria B à mão; o filtro de membros
 * encolheu a célula para 52; a Documentação pôs ícones de 44 numa linha só. Uma
 * decisão que se toma quatro vezes não está tomada.
 *
 * Este guarda ENUMERA. Anda pela árvore de todos os `.jsx` da app, encontra
 * cada `<Choice>` desenhado dentro de um `.map()` numa fila que quebra de
 * linha, e cruza a lista encontrada com o INVENTÁRIO aqui em baixo. Cada
 * entrada do inventário diz de onde vêm as opções e porque é que aquela não
 * cresce. Uma fila nova, ou uma que passe a ler uma lista da casa, chumba aqui
 * e obriga a decidir — que é o que ele pediu: «avisa-me quando encontrares».
 *
 * ⚠ Lê-se a ÁRVORE, com o Babel, e não o texto. Os comentários que explicam
 * esta correcção falam de `Choice` e de `seccoes` dentro dos próprios ficheiros
 * corrigidos — é a armadilha já catalogada em
 * `armadilhas-de-tratar-codigo-como-texto`.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/parser');

const RAIZ = path.join(__dirname, '..');

const ficheirosDaApp = () => {
  const achados = [];
  const andarDir = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (fs.statSync(p).isDirectory()) andarDir(p);
      else if (/\.jsx$/.test(nome)) achados.push(p);
    }
  };
  andarDir(path.join(RAIZ, 'src'));
  const app = path.join(RAIZ, 'App.jsx');
  if (fs.existsSync(app)) achados.push(app);
  return achados;
};

const andar = (no, visita, pai = null) => {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const x of no) andar(x, visita, pai); return; }
  if (typeof no.type === 'string') { visita(no, pai); pai = no; }
  for (const k of Object.keys(no)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    andar(no[k], visita, pai);
  }
};

// Um `<View style={{ ..., flexWrap: 'wrap' }}>` — a fila que quebra.
const ehFilaQueQuebra = (no) => {
  if (no.type !== 'JSXOpeningElement') return false;
  let quebra = false;
  for (const a of no.attributes) {
    if (a.type !== 'JSXAttribute' || !a.name || a.name.name !== 'style') continue;
    andar(a.value, (x) => {
      if (x.type === 'ObjectProperty' && x.key && x.key.name === 'flexWrap') quebra = true;
    });
  }
  return quebra;
};

// De onde vem a lista: `seccoes.map(...)` → «seccoes»; `s.stores.map(...)` →
// «s.stores»; `Object.keys(X).map(...)` → «Object.keys(…)».
const fonteDoMap = (chamada) => {
  const c = chamada.callee;
  if (!c || c.type !== 'MemberExpression' || !c.property || c.property.name !== 'map') return null;
  const escreve = (no) => {
    if (!no) return '?';
    if (no.type === 'Identifier') return no.name;
    if (no.type === 'MemberExpression') {
      return `${escreve(no.object)}.${no.property && no.property.name ? no.property.name : '…'}`;
    }
    if (no.type === 'CallExpression') return `${escreve(no.callee)}(…)`;
    if (no.type === 'ArrayExpression') return '[…]';
    return no.type;
  };
  return escreve(c.object);
};

// ── O varrimento ────────────────────────────────────────────────────────────
const achados = [];
for (const ficheiro of ficheirosDaApp()) {
  let arvore;
  try {
    arvore = babel.parse(fs.readFileSync(ficheiro, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  } catch { continue; }

  andar(arvore.program, (no) => {
    if (!ehFilaQueQuebra(no)) return;
    // O elemento inteiro é o pai do `JSXOpeningElement`; procura-se lá dentro.
    // Anda-se a partir da abertura para trás não dá: parte-se do elemento.
  });

  // Segunda passagem, agora sobre os ELEMENTOS.
  andar(arvore.program, (no) => {
    if (no.type !== 'JSXElement' || !ehFilaQueQuebra(no.openingElement)) return;
    andar(no.children, (dentro) => {
      if (dentro.type !== 'CallExpression') return;
      const fonte = fonteDoMap(dentro);
      if (!fonte) return;
      // Há um `<Choice>` no que este `.map()` devolve?
      let temChoice = false;
      andar(dentro.arguments, (x) => {
        if (x.type === 'JSXOpeningElement' && x.name && x.name.name === 'Choice') temChoice = true;
      });
      if (!temChoice) return;
      achados.push({
        ficheiro: path.relative(RAIZ, ficheiro).replace(/\\/g, '/'),
        linha: dentro.loc ? dentro.loc.start.line : 0,
        fonte,
      });
    });
  });
}

const chave = (a) => `${a.ficheiro} · ${a.fonte}`;

// ── O INVENTÁRIO ────────────────────────────────────────────────────────────
//
// Cada linha é uma fila de pastilhas que FICA, e a razão por que fica. A regra
// é uma só: as opções não crescem com a casa. Duas ou três escolhas fixas vêem-
// -se melhor todas de uma vez do que escondidas atrás de um toque — e a B
// custava-lhes um toque a mais sem ganhar píxel nenhum.
const FICAM = {
  'src/sheets/NovaTarefa.jsx · URG_OPTS'
    : 'A urgência — três valores, e são o INVARIANTE #6. Nunca vai ter um quarto.',
  'src/sheets/FichaEmergencia.jsx · GRAVIDADES'
    : 'A gravidade de uma alergia — escala clínica fechada, não é lista da casa.',

};

// (Aqui estiveram, de 25 a 26/09/2026, as duas que CRESCIAM e esperavam
// decisão dele: o envelope da conta fixa e a meta do fecho do mês. Ele disse
// «corrige tudo» e as duas passaram ao `CampoDeEscolha`, com as outras duas
// formas de escolher um envelope. A lista está vazia de propósito: quando
// voltar a haver uma por decidir, escreve-se aqui com a razão.)
const POR_DECIDIR = [];

describe('uma escolha que cresce com a casa não é uma fila que quebra', () => {
  it('o varrimento funciona — encontra filas de pastilhas onde elas estão', () => {
    // Um guarda que não varre nada passa sempre.
    expect(achados.length).toBeGreaterThan(0);
  });

  it('⚠ todas as filas de pastilhas que restam estão no inventário, com a razão escrita', () => {
    const forasteiras = achados.map(chave).filter(k => !(k in FICAM));
    // Se isto falhar com uma fila nova: ou as opções são fixas e poucas, e
    // acrescenta-se aqui com a razão; ou crescem com a casa, e leva o
    // `CampoDeEscolha`. Não há terceira saída — é o que ele pediu ao mandar
    // usar a B «em todos os sítios com situações semelhantes».
    expect([...new Set(forasteiras)]).toEqual([]);
  });

  it('⚠ as que CRESCEM e ainda esperam decisão são exactamente estas duas', () => {
    // Não é uma lista de desculpas: é o que falta decidir, à vista. Uma
    // terceira fila sobre uma lista da casa chumba aqui — e é isso que faz a
    // decisão chegar a ele em vez de se instalar em silêncio.
    const inventariadas = new Set(achados.map(chave));
    for (const k of POR_DECIDIR) expect(inventariadas.has(k)).toBe(true);
    for (const k of POR_DECIDIR) expect(FICAM[k]).toMatch(/POR DECIDIR/);
  });

  it('⚠ e o inventário não tem linhas mortas', () => {
    // Uma razão escrita para uma fila que já não existe é documentação a
    // apodrecer, e faz o inventário parecer maior do que a app.
    const vivas = new Set(achados.map(chave));
    expect(Object.keys(FICAM).filter(k => !vivas.has(k))).toEqual([]);
  });
});

describe('⚠ os sítios que a opção B levou já não têm pastilhas', () => {
  // Esta é a outra metade: as provas acima impedem filas NOVAS, estas impedem
  // que as corrigidas voltem atrás. Cada uma nomeia a lista que cresce.
  const semFilaSobre = (ficheiro, fonte) => {
    const iguais = achados.filter(a => a.ficheiro === ficheiro && a.fonte === fonte);
    expect(iguais).toEqual([]);
  };

  it('o corredor — três folhas, a mesma lista da casa', () => {
    semFilaSobre('src/sheets/NovoArtigo.jsx', 'seccoes');
    semFilaSobre('src/sheets/GerirArtigo.jsx', 'seccoes');
    semFilaSobre('src/KidApp.jsx', 'seccoes');
  });

  it('a loja da ida', () => {
    semFilaSobre('src/screens/ComoFazemosCompras.jsx', 'lojas');
  });

  it('a especialidade a exportar', () => {
    semFilaSobre('src/sheets/ExportarSaude.jsx', 'especialidades');
  });

  it('as duas tarefas da troca — o pior caso, por causa dos títulos', () => {
    semFilaSobre('src/sheets/ProporTroca.jsx', 'minhas');
    semFilaSobre('src/sheets/ProporTroca.jsx', 'deles');
  });

  it('⚠ o envelope — e as TRÊS formas passaram a ser uma', () => {
    // 26/09/2026. O envelope tinha três desenhos para a mesma escolha: fila de
    // pastilhas na conta fixa, grelha de dois no «Mover» (duas vezes na mesma
    // folha) e pilha vertical na despesa nova. Só a grelha tinha razão escrita
    // — «eram oito linhas de largura total: a folha não cabia» —, e essa razão
    // é exactamente o que o campo resolve.
    semFilaSobre('src/sheets/CamposContaFixa.jsx', 'envelopes');
    const dinheiro = fs.readFileSync(path.join(RAIZ, 'src/screens/Dinheiro.jsx'), 'utf8');
    // A grelha foi-se, e não ficou nem a definição.
    expect(dinheiro).not.toMatch(/function GrelhaEnvelopes/);
    expect(dinheiro).not.toMatch(/<GrelhaEnvelopes/);
  });

  it('⚠ a meta do fecho do mês — com uma linha «Nenhuma» em vez de um gesto escondido', () => {
    semFilaSobre('src/screens/Dinheiro.jsx', 'metas');
    const dinheiro = fs.readFileSync(path.join(RAIZ, 'src/screens/Dinheiro.jsx'), 'utf8');
    // ⚠ A saída tem de continuar a existir, e agora com nome: tocar outra vez
    // na escolhida desligava o reforço e ninguém o dizia a ninguém.
    expect(dinheiro).toMatch(/valor: null, titulo: 'Nenhuma'/);
    expect(dinheiro).not.toMatch(/meta: f\.meta === g\.id \? null : g\.id/);
  });

  it('⚠ a categoria de um equipamento — e a lista deixou de ser uma constante', () => {
    // 26/09/2026. Estas duas estavam no inventário como «fixo para sempre», com
    // um aviso a dizer que no dia em que a interface fosse ligada ao `equipCats`
    // passavam a ser a classe do corredor. Foi esse dia: os dois ecrãs leem a
    // lista da CASA, com recuo para as sementes.
    semFilaSobre('src/screens/Equipamentos.jsx', 'CATS');
    semFilaSobre('src/sheets/FichaEquipamento.jsx', 'CATEGORIAS_DE_EQUIPAMENTO');
    // E leem-na mesmo — senão isto era só trocar o desenho e deixar o defeito.
    const lerFicheiro = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
    expect(lerFicheiro('src/screens/Equipamentos.jsx')).toMatch(/categoriasDaCasa\(s\.equipCats, s\.equipCatsProprias\)/);
    expect(lerFicheiro('src/sheets/FichaEquipamento.jsx')).toMatch(/categoriasDaCasa\(daCasa\.equipCats, daCasa\.equipCatsProprias\)/);
  });
});

describe('⚠ e há UM campo que abre, não vários', () => {
  const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

  it('todos os que escolhem de uma lista que cresce usam o `CampoDeEscolha`', () => {
    // A folha de marcar consulta tinha a sua própria B escrita à mão, com a
    // história no comentário. Duas Bs diferentes eram o defeito de origem
    // outra vez — e a dela nem sequer tinha tecto: com trinta especialidades o
    // acordeão voltava a empurrar o botão de marcar para fora do ecrã.
    const esperados = [
      'src/sheets/NovoArtigo.jsx', 'src/sheets/GerirArtigo.jsx', 'src/KidApp.jsx',
      'src/screens/Saude.jsx', 'src/sheets/ExportarSaude.jsx', 'src/sheets/ProporTroca.jsx',
    ];
    const semCampo = esperados.filter(f => !/CampoDeEscolha/.test(ler(f)));
    expect(semCampo).toEqual([]);
  });

  it('⚠ e a folha de marcar consulta já não tem a sua própria lista à mão', () => {
    const saude = ler('src/screens/Saude.jsx');
    // O estado do acordeão era este, e vivia dentro da folha.
    expect(saude).not.toMatch(/const \[escolhendoEsp/);
  });

  it('o limiar da pesquisa vive DENTRO do componente, e não em cada sítio', () => {
    // Senão cada folha decidia o seu, e a mesma lista de quinze tinha pesquisa
    // num sítio e não tinha no outro.
    const { PESQUISA_ACIMA_DE } = require('../src/CampoDeEscolha');
    expect(PESQUISA_ACIMA_DE).toBe(12);
  });
});
