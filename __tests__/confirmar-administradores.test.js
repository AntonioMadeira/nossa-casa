/**
 * Apagar a casa precisa de TODOS os administradores.
 *
 * «Repor Dados de Demonstração» e «Começar de Zero» apagavam a casa AO TOQUE —
 * `onPress={resetDemo}`, sem uma pergunta, e lado a lado no Perfil.
 *
 * Uma confirmação normal resolveria o dedo enganado. Não resolve o resto: o
 * histórico, os cofres das crianças e as contas entre os adultos não são de
 * quem calha ter o telemóvel na mão.
 *
 * ⚠ Isto é a regra da INTERFACE. Quem impede a sério é o servidor — nove provas
 * em `db/pocketbase/provar-limpar-casa.mjs`. Esta folha é a porta; o servidor é
 * a fechadura. O que aqui se verifica é que a porta não abre sozinha.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');

// A camada do servidor é substituída para se poder dizer o que ela responde.
//
// ⚠ A espia vive DENTRO da fábrica. O `jest.mock` é içado para o topo do
// ficheiro e a sua fábrica não vê nada de fora — declarar o `jest.fn()` acima
// dela dá «module factory is not allowed to reference any out-of-scope
// variables», e a suite não chega a correr.
jest.mock('../src/pocketbase', () => {
  const espia = jest.fn();
  return {
    estaLigado: () => true,
    auth: { valida: () => false, membro: () => null, confirmarCredencial: espia },
    ler: {},
    google: { disponivel: () => false, porLigar: () => false, verificar: async () => false },
    __espia: espia,
  };
});
const confirmarCredencial = require('../src/pocketbase').__espia;

const { StoreProvider, useStore } = require('../src/store');
const { buildTheme } = require('../src/theme');
const ConfirmarAdministradores = require('../src/sheets/ConfirmarAdministradores').default;

const CASA = {
  membros: {
    'Rita':  { initial: 'R', email: 'rita@exemplo.pt', fem: true },
    'Tomás': { initial: 'T', email: 'tomas@exemplo.pt' },
    'Léo':   { initial: 'L', kid: true },
  },
  roles: { 'Rita': 'admin', 'Tomás': 'admin', 'Léo': 'crianca' },
};

const montar = (props = {}, casa = CASA) => {
  let arvore = null;
  const Envolve = () => {
    const st = useStore();
    React.useMemo(() => st.set(casa), []);
    return React.createElement(ConfirmarAdministradores, {
      t: buildTheme(0, false), user: 'Rita',
      titulo: 'Começar de Zero',
      aviso: 'Não se desfaz.',
      rotuloAcao: 'Apagar os dados da casa',
      onConfirmado: jest.fn(),
      onCancelar: jest.fn(),
      ...props,
    });
  };
  TestRenderer.act(() => {
    arvore = TestRenderer.create(
      React.createElement(StoreProvider, null, React.createElement(Envolve)));
  });
  return arvore;
};

// O botão destrutivo, pelo rótulo.
const acao = (arvore) => arvore.root.findAll(n =>
  n.props && n.props.accessibilityLabel === 'Apagar os dados da casa')[0];

const texto = (arvore) => {
  const junta = (n) => {
    if (n === null || n === undefined || n === false) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(junta).join(' ');
    return junta(n.children || (n.props && n.props.children) || null);
  };
  return junta(arvore.toJSON());
};

beforeEach(() => confirmarCredencial.mockReset());

describe('com dois administradores', () => {
  it('a acção nasce BLOQUEADA', () => {
    const a = montar();
    expect(acao(a).props.accessibilityState.disabled).toBe(true);
  });

  it('e diz de quem falta a confirmação, com a concordância certa', () => {
    // «Falta a confirmação do Tomás» — não «da», e não um nome escrito à mão.
    expect(texto(montar())).toContain('Falta a confirmação do Tomás');
  });

  it('quem pede já conta: está autenticado nesta sessão', () => {
    // Pedir-lhe a palavra-passe outra vez seria a mesma prova duas vezes no
    // mesmo minuto.
    expect(texto(montar())).toContain('já está nesta sessão');
  });

  it('lista os administradores, e NÃO as crianças', () => {
    const t = texto(montar());
    expect(t).toContain('Rita');
    expect(t).toContain('Tomás');
    expect(t).not.toContain('Léo');
  });

  it('a palavra-passe do outro é verificada pelo SERVIDOR', async () => {
    confirmarCredencial.mockResolvedValue({ id: 'x', nome: 'Tomás', papel: 'admin' });
    const a = montar();
    const campo = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Palavra-passe de Tomás')[0];
    await TestRenderer.act(async () => { campo.props.onChangeText('seja-o-que-for'); });
    const botao = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Confirmar')[0];
    await TestRenderer.act(async () => { await botao.props.onPress(); });

    expect(confirmarCredencial).toHaveBeenCalledWith('tomas@exemplo.pt', 'seja-o-que-for');
    expect(acao(a).props.accessibilityState.disabled).toBe(false);
  });

  it('⚠ a credencial certa DE OUTRA PESSOA não confirma a linha', async () => {
    // Sem esta verificação, um administrador confirmava a linha do outro com a
    // sua própria palavra-passe — e as duas chaves eram a mesma chave.
    confirmarCredencial.mockResolvedValue({ id: 'y', nome: 'Rita', papel: 'admin' });
    const a = montar();
    const campo = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Palavra-passe de Tomás')[0];
    await TestRenderer.act(async () => { campo.props.onChangeText('a-da-rita'); });
    const botao = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Confirmar')[0];
    await TestRenderer.act(async () => { await botao.props.onPress(); });

    expect(acao(a).props.accessibilityState.disabled).toBe(true);
    expect(texto(a)).toContain('Palavra-passe errada');
  });

  it('uma credencial de quem não é administrador também não conta', async () => {
    confirmarCredencial.mockResolvedValue({ id: 'z', nome: 'Tomás', papel: 'adulto' });
    const a = montar();
    const campo = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Palavra-passe de Tomás')[0];
    await TestRenderer.act(async () => { campo.props.onChangeText('x'); });
    const botao = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Confirmar')[0];
    await TestRenderer.act(async () => { await botao.props.onPress(); });
    expect(acao(a).props.accessibilityState.disabled).toBe(true);
  });

  it('uma palavra-passe errada não confirma', async () => {
    confirmarCredencial.mockResolvedValue(null);
    const a = montar();
    const campo = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Palavra-passe de Tomás')[0];
    await TestRenderer.act(async () => { campo.props.onChangeText('errada'); });
    const botao = a.root.findAll(n => n.props
      && n.props.accessibilityLabel === 'Confirmar')[0];
    await TestRenderer.act(async () => { await botao.props.onPress(); });
    expect(acao(a).props.accessibilityState.disabled).toBe(true);
  });
});

describe('com um administrador só', () => {
  const casaDeUm = {
    membros: { 'Rita': { initial: 'R', email: 'rita@exemplo.pt', fem: true } },
    roles: { 'Rita': 'admin' },
  };

  it('quem pede é o único, e a acção fica livre', () => {
    const a = montar({}, casaDeUm);
    expect(acao(a).props.accessibilityState.disabled).toBe(false);
    expect(texto(a)).toContain('Precisa da sua confirmação');
  });
});

describe('os dois botões do Perfil já não apagam ao toque', () => {
  const fs = require('fs');
  const path = require('path');
  // Sem comentários: o que explica o defeito CITA o defeito, e uma rede que
  // apanha a explicação obriga a não escrever a explicação.
  const perfil = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'screens', 'Perfil.jsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

  it('nenhum chama a acção destrutiva directamente', () => {
    expect(perfil).not.toMatch(/onPress=\{resetDemo\}/);
    expect(perfil).not.toMatch(/onPress=\{startBlank\}/);
  });

  it('ambos abrem a folha de confirmação', () => {
    expect(perfil).toMatch(/setAApagar\('repor'\)/);
    expect(perfil).toMatch(/setAApagar\('zero'\)/);
    expect(perfil).toMatch(/ConfirmarAdministradores/);
  });

  it('o «Começar de Zero» limpa o SERVIDOR antes da loja local', () => {
    // Ao contrário de tudo o resto nesta app, que é local-primeiro: se o
    // servidor recusar, a casa local fica intacta e a folha diz porquê.
    // Limpar aqui e falhar lá deixava as duas metades a discordar.
    const bloco = perfil.slice(perfil.indexOf('zero: {'), perfil.indexOf('zero: {') + 900);
    expect(bloco.indexOf('limparCasaNoServidor')).toBeLessThan(bloco.indexOf('startBlank('));
  });
});
