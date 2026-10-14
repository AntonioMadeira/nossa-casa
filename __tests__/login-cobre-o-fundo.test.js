// A entrada cobre a janela toda, e o conteúdo vive na coluna da app.
//
// O defeito: o ecrã de entrada era um `ImageBackground` com `flex: 1` e mais
// nada. Duas consequências, uma raiz.
//
//  1. A fotografia mandava na disposição com o tamanho natural dela. Medido no
//     navegador: a camada da imagem a 1920×1280 numa janela de 1400×800 — o
//     fundo a não cobrir o fundo.
//  2. O painel do «Bem-vindo» ia de 16 a 1384 numa janela de 1400. O resto da
//     app vive numa coluna de `LARGURA_APP` centrada, que o `App.jsx` monta na
//     própria raiz — e o Login é devolvido ANTES dela, portanto nunca a teve.
//
// Isto lê a fonte porque é aí que o defeito estava: nas medidas do estilo. Um
// teste de árvore renderizada não mede caixas em lado nenhum — o jsdom não faz
// disposição, e devolvia zeros com o defeito presente e ausente.
import { readFileSync } from 'fs';
import { join } from 'path';

const fonte = readFileSync(join(__dirname, '..', 'src', 'screens', 'Login.jsx'), 'utf8');

describe('a entrada cobre a janela', () => {
  test('não há `ImageBackground` — era ele que deixava a imagem mandar', () => {
    // A etiqueta e o import, não a palavra: o comentário que explica porque
    // ele saiu tem de poder dizer o nome dele.
    expect(fonte).not.toMatch(/<ImageBackground/);
    expect(fonte).not.toMatch(/import \{[^}]*ImageBackground/);
  });

  test('a fotografia é uma camada absoluta que preenche a raiz', () => {
    // O bloco da imagem, do `<Image` até ao `/>` que o fecha.
    const bloco = fonte.slice(fonte.indexOf('<Image source='));
    const estilo = bloco.slice(0, bloco.indexOf('/>'));

    expect(estilo).toContain('login-bg.jpg');
    expect(estilo).toContain("position: 'absolute'");
    expect(estilo).toMatch(/top: 0/);
    expect(estilo).toMatch(/bottom: 0/);
    expect(estilo).toContain('resizeMode="cover"');
  });

  test('⚠ e com `width` e `height` a 100%, não só com o `inset`', () => {
    // Este é o guarda que interessa. Com `top/left/right/bottom: 0` e mais
    // nada, a react-native-web acrescenta ao estilo as dimensões intrínsecas
    // do ficheiro — 1920×1280 — e elas ganham. A imagem cobria a janela por
    // acidente até a janela ser maior do que ela.
    const bloco = fonte.slice(fonte.indexOf('<Image source='));
    const estilo = bloco.slice(0, bloco.indexOf('/>'));

    expect(estilo).toMatch(/width: '100%'/);
    expect(estilo).toMatch(/height: '100%'/);
  });

  test('o escurecido cobre a janela toda, e não só a coluna', () => {
    // Se ele entrasse na coluna, num monitor a fotografia aparecia clara nas
    // margens e escura ao meio.
    const i = fonte.indexOf("rgba(0,0,0,0.6)");
    expect(i).toBeGreaterThan(0);
    const linha = fonte.slice(fonte.lastIndexOf('<View', i), i);
    expect(linha).toContain("position: 'absolute'");
    expect(linha).toMatch(/right: 0/);
    expect(linha).toMatch(/bottom: 0/);
  });

  test('o conteúdo vive numa coluna de `LARGURA_APP`, como o resto da app', () => {
    expect(fonte).toContain('LARGURA_APP');
    expect(fonte).toMatch(/maxWidth: LARGURA_APP/);
    expect(fonte).toMatch(/marginHorizontal: 'auto'/);
    // E vem do tema, que é onde o número é decidido.
    expect(fonte).toMatch(/import \{[^}]*LARGURA_APP[^}]*\} from '\.\.\/theme'/);
  });

  test('a coluna está DENTRO da raiz, depois das camadas de fundo', () => {
    // A ordem é o que faz o escurecido ficar por baixo do painel e a coluna
    // por cima da fotografia. Trocada, o painel desaparecia debaixo do escuro.
    const imagem = fonte.indexOf('<Image source=');
    const escuro = fonte.indexOf('rgba(0,0,0,0.6)');
    const coluna = fonte.indexOf('maxWidth: LARGURA_APP');
    expect(imagem).toBeLessThan(escuro);
    expect(escuro).toBeLessThan(coluna);
  });

  test('a raiz é uma `View` com cor de fundo — a janela nunca fica branca', () => {
    // Enquanto a fotografia carrega, e nas margens que ela não cubra num
    // monitor muito largo, o que se vê é o `chrome` do esquema.
    const raiz = fonte.slice(fonte.indexOf('return ('), fonte.indexOf('<Image source='));
    expect(raiz).toMatch(/backgroundColor: t\.chrome/);
    expect(raiz).toMatch(/flex: 1/);
  });
});
