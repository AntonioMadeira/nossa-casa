/**
 * A arrumação do ecrã do Perfil.
 *
 * A ordem dos assuntos estava certa; o que estava desarrumado era a GRAMÁTICA:
 *
 *   · duas escalas de título para o mesmo nível — «A Casa» era um SectionTitle
 *     de 20 px e «Aspeto» era um Label de 12, sendo irmãos;
 *   · metade do conteúdo sem título nenhum — o cartão da Documentação e os dois
 *     botões destrutivos apareciam soltos no fim da página;
 *   · três tratamentos para o mesmo tipo de coisa — controlos soltos, um
 *     cartão, outro cartão;
 *   · uma linha que parecia tocável e não era;
 *   · e a acção MAIS PERIGOSA era a única pintada com a cor de ação.
 *
 * Uma página em que metade das secções tem cabeçalho lê-se como desarrumada
 * mesmo com a ordem certa. É esse o defeito que estas provas guardam.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');
const fs = require('fs');
const path = require('path');

jest.mock('../src/pocketbase', () => ({
  estaLigado: () => false,
  auth: { valida: () => false, membro: () => null },
  ler: {},
  google: { disponivel: () => false, porLigar: () => false, verificar: async () => false },
}));

const { StoreProvider, useStore } = require('../src/store');
const { buildTheme, SCHEMES } = require('../src/theme');
const Perfil = require('../src/screens/Perfil').default;
// O Sheet lê os insets, e isso exige o provedor. Sem métricas iniciais ele
// espera pela medição e nunca chega a desenhar num renderizador de teste.
const { SafeAreaProvider } = require('react-native-safe-area-context');
const METRICAS = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'Perfil.jsx'), 'utf8');
// Sem comentários: o que explica o defeito CITA o defeito, e uma rede que
// apanha a explicação obriga a não escrever a explicação.
const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

const CASA = {
  membros: { 'Rita': { initial: 'R', email: 'rita@exemplo.pt', fem: true },
             'Tomás': { initial: 'T', email: 'tomas@exemplo.pt' } },
  roles: { 'Rita': 'admin', 'Tomás': 'admin' },
};

const montar = (casa = CASA, user = 'Rita') => {
  let arvore = null;
  const Envolve = () => {
    const st = useStore();
    React.useMemo(() => st.set(casa), []);
    return React.createElement(Perfil, {
      t: buildTheme(0, false), user, onClose: jest.fn(), onSignOut: jest.fn(),
    });
  };
  TestRenderer.act(() => {
    arvore = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICAS },
        React.createElement(StoreProvider, null, React.createElement(Envolve))));
  });
  return arvore;
};

const texto = (a) => {
  const junta = (n) => {
    if (n === null || n === undefined || n === false) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(junta).join(' ');
    return junta(n.children || (n.props && n.props.children) || null);
  };
  return junta(a.toJSON());
};

const porRotulo = (a, r) => a.root.findAll(n => n.props && n.props.accessibilityLabel === r)[0];

// Os títulos de secção, pela ordem em que aparecem no ficheiro.
const seccoes = () => [...semComentarios.matchAll(/<SectionTitle[^>]*>([^<]+)</g)].map(m => m[1].trim());

describe('as secções', () => {
  it('são cinco, com nome, e por esta ordem', () => {
    // A ordem é a da distância a quem lê: primeiro a casa, depois este perfil,
    // depois a app, e no fim o que não se desfaz.
    expect(seccoes()).toEqual(['A Casa', 'Aparência', 'Avisos', 'A App', 'Apagar Dados']);
  });

  it('⚠ nenhum bloco fica sem cabeçalho', () => {
    // Era isto: o cartão da Documentação e os dois botões destrutivos
    // apareciam soltos no fim da página, sem uma palavra a dizer o que eram.
    for (const nome of ['A App', 'Apagar Dados']) {
      expect(seccoes()).toContain(nome);
    }
    const t = texto(montar());
    expect(t).toContain('A App');
    expect(t).toContain('Apagar Dados');
  });

  it('⚠ o «Avisos» deixou de ser um Label a fazer de secção', () => {
    // Um Label de 12 px em slate e um SectionTitle de 20 px na cor do esquema
    // não podem estar ao mesmo nível da leitura.
    expect(semComentarios).not.toMatch(/<Label t=\{t\}>Avisos<\/Label>/);
    expect(semComentarios).toMatch(/<SectionTitle t=\{t\}>Avisos<\/SectionTitle>/);
  });

  it('e o Label passa a rotular campos DENTRO de um cartão', () => {
    expect(semComentarios).toMatch(/<Label t=\{t\}>Claro ou escuro<\/Label>/);
    expect(semComentarios).toMatch(/<Label t=\{t\}>Cor do perfil<\/Label>/);
  });
});

describe('a linha do Avatar', () => {
  it('existe, e abre a escolha', () => {
    // A escolha só se abria tocando na bola do cabeçalho da folha, e nada no
    // ecrã dizia que aquilo era tocável. Um gesto que não se anuncia não
    // existe.
    const a = montar();
    const linha = porRotulo(a, 'Avatar');
    expect(linha).toBeTruthy();
    expect(typeof linha.props.onPress).toBe('function');
  });

  it('diz a escolha EM CURSO, e não «ver» ou «alterar»', () => {
    expect(texto(montar())).toContain('A sua inicial');
  });

  it('e a bola do cabeçalho continua a abri-la — quem já sabia não perde', () => {
    expect(porRotulo(montar(), 'Escolher avatar')).toBeTruthy();
  });
});

describe('⚠ as duas acções destrutivas', () => {
  const bloco = () => semComentarios.slice(semComentarios.indexOf('Apagar Dados'));

  it('nenhuma leva a cor de AÇÃO', () => {
    // «Repor Dados de Demonstração» tinha contorno de 2 px no acento — nesta
    // app isso lê-se como «este é o botão principal do ecrã». O que ele faz é
    // apagar a casa. A cor de ação volta a querer dizer só uma coisa.
    expect(bloco()).not.toMatch(/borderColor: t\.accent/);
    expect(bloco()).not.toMatch(/color: t\.accent/);
  });

  it('levam a cor de ERRO, que é do sistema e não do esquema', () => {
    expect(bloco()).toMatch(/borderColor: t\.state\.err/);
    expect(bloco()).toMatch(/color: t\.state\.errTexto/);
  });

  it('e a secção diz de antemão o que as espera', () => {
    const t = texto(montar());
    expect(t).toContain('não se desfazem');
    expect(t).toContain('nenhuma acontece ao toque');
  });

  it('a frase conta os administradores, e concorda com o número', () => {
    // Com um só, «pedem a confirmação de 1 administrador» lê-se mal.
    expect(texto(montar())).toContain('dos 2 administradores');
    const so = { membros: { 'Rita': { initial: 'R', fem: true } }, roles: { 'Rita': 'admin' } };
    expect(texto(montar(so, 'Rita'))).toContain('pedem a sua confirmação');
  });

  it('continuam a não apagar ao toque', () => {
    expect(semComentarios).not.toMatch(/onPress=\{resetDemo\}/);
    expect(semComentarios).not.toMatch(/onPress=\{startBlank\}/);
    expect(semComentarios).toMatch(/setAApagar\('repor'\)/);
    expect(semComentarios).toMatch(/setAApagar\('zero'\)/);
  });
});

describe('⚠ «Guardado neste dispositivo» deixou de fingir que é tocável', () => {
  it('não é uma Row', () => {
    // Tinha ícone, título e subtítulo — igual à Documentação ao lado, que abre
    // um ecrã. Uma afirmação vestida de navegação.
    expect(semComentarios).not.toMatch(/<Row[^>]*title="Guardado neste dispositivo"/);
    expect(semComentarios).toMatch(/Guardado no servidor da casa —/);
  });

  it('e a Documentação, que é tocável, continua a sê-lo', () => {
    const a = montar();
    const doc = porRotulo(a, 'Documentação');
    expect(doc && typeof doc.props.onPress).toBe('function');
  });
});

describe('o alvo do interruptor (INVARIANTE #5)', () => {
  it('⚠ tem 44 de altura, e não conta com o hitSlop', () => {
    // Media 46×27 e contava com o `hitSlop={10}` para chegar aos 44. O
    // `hitSlop` funciona no telemóvel e o react-native-web IGNORA-O — no
    // navegador o alvo era mesmo 27. Medido no Perfil, com os 25 alvos do
    // ecrã: era o único abaixo de 44.
    const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.jsx'), 'utf8');
    const i = ui.indexOf('export const Toggle');
    const bloco = ui.slice(i, i + 700);
    expect(bloco).toMatch(/minHeight: 44/);
  });

  it('e o desenho continua a ter 27 — o alvo cresceu, a pastilha não', () => {
    const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui.jsx'), 'utf8');
    const bloco = ui.slice(ui.indexOf('export const Toggle'), ui.indexOf('export const Toggle') + 700);
    expect(bloco).toMatch(/width: 46, height: 27/);
  });
});

describe('o que não podia mudar', () => {
  it('a Gestão da Casa continua só para administradores', () => {
    expect(porRotulo(montar(), 'Gestão da Casa')).toBeTruthy();
    const adulto = { membros: { 'Rita': { initial: 'R' }, 'Tomás': { initial: 'T' } },
      roles: { 'Rita': 'admin', 'Tomás': 'adulto' } };
    expect(porRotulo(montar(adulto, 'Tomás'), 'Gestão da Casa')).toBeFalsy();
  });

  it('e as acções destrutivas também', () => {
    const adulto = { membros: { 'Rita': { initial: 'R' }, 'Tomás': { initial: 'T' } },
      roles: { 'Rita': 'admin', 'Tomás': 'adulto' } };
    expect(texto(montar(adulto, 'Tomás'))).not.toContain('Apagar Dados');
  });

  it('os seis esquemas continuam todos escolhíveis', () => {
    const a = montar();
    for (const sc of SCHEMES) expect(porRotulo(a, `Esquema ${sc.name}`)).toBeTruthy();
  });
});
