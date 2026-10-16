/**
 * «Criar a minha casa»: o que se valida, o que se gera, e o ecrã por onde se passa.
 *
 * A ordem de uma casa nova é: a pessoa diz como se chama a casa e ela própria,
 * vai à Google, o SERVIDOR cria a casa e faz dela administradora, e só então se
 * acrescentam as crianças e os outros adultos. Aqui prova-se a parte do
 * cliente; a do servidor está em `db/pocketbase/provar-criar-casa.mjs`.
 */
const React = require('react');
const TestRenderer = require('react-test-renderer');
const {
  erroDoNomeDaCasa, erroDoNome, erroDoRascunho, limparRascunho,
  pinAleatorio, senhaAleatoria, membrosDoRascunho, emailValido, MAX_CASA, MAX_NOME, semCasa,
} = require('../src/criar-casa');
const CriarCasa = require('../src/CriarCasa').default;

// Um sorteio previsível, para as provas não dependerem da sorte.
const sorteioDe = (seq) => { let i = 0; return (n) => seq[i++ % seq.length] % n; };

describe('o nome da casa e o da pessoa', () => {
  it('a casa precisa de um nome, e não passa de 40 caracteres', () => {
    expect(erroDoNomeDaCasa('')).toMatch(/como se chama a casa/);
    expect(erroDoNomeDaCasa('   ')).toMatch(/como se chama a casa/);
    expect(erroDoNomeDaCasa('x'.repeat(MAX_CASA + 1))).toMatch(/40 caracteres/);
    expect(erroDoNomeDaCasa('Silva')).toBeNull();
    expect(erroDoNomeDaCasa('x'.repeat(MAX_CASA))).toBeNull();
  });
  it('a pessoa precisa de um nome, e não passa de 30', () => {
    expect(erroDoNome('')).toMatch(/seu nome/);
    expect(erroDoNome('y'.repeat(MAX_NOME + 1))).toMatch(/30 caracteres/);
    expect(erroDoNome('Ana')).toBeNull();
  });
  it('e-mail: tem de parecer um', () => {
    expect(emailValido('ana@exemplo.pt')).toBe(true);
    for (const mau of ['', 'ana', 'ana@', '@x.pt', 'a b@x.pt', 'ana@x']) expect(emailValido(mau)).toBe(false);
  });
});

describe('a app deteta que o e-mail ainda não está em nenhuma casa', () => {
  const doServidor = 'Este e-mail ainda não faz parte de nenhuma casa. Crie a sua, ou peça o convite a um administrador.';
  it('reconhece a frase que o servidor devolve (casa-criar.pb.js)', () => {
    expect(semCasa(doServidor)).toBe(true);
    // o ficheiro do servidor tem de continuar a dizer isto, senão o cliente deixa de a reconhecer
    const hook = require('fs').readFileSync(require('path').join(__dirname, '..', 'db', 'pocketbase', 'pb_hooks', 'casa-criar.pb.js'), 'utf8');
    expect(hook.replace(/'\s*\+\s*'/g, '')).toMatch(/ainda não faz parte de nenhuma casa/);
  });
  it('⚠ não confunde com outros erros da entrada', () => {
    for (const outro of ['Failed to authenticate.', 'Este e-mail não está autorizado a criar casas neste servidor.',
      'O servidor da casa não está a responder.', '', null, undefined]) expect(semCasa(outro)).toBe(false);
  });
});

describe('o rascunho inteiro', () => {
  const bom = { nomeCasa: 'Silva', nome: 'Ana', criancas: ['Léo', 'Mia'], adultos: [{ nome: 'Rui', email: 'rui@x.pt' }] };
  it('um rascunho bom passa', () => expect(erroDoRascunho(bom)).toBeNull());
  it('só a casa e o nome também: o resto é opcional', () => {
    expect(erroDoRascunho({ nomeCasa: 'Silva', nome: 'Ana' })).toBeNull();
  });
  it('⚠ dois com o mesmo nome (sem olhar a maiúsculas) são recusados', () => {
    expect(erroDoRascunho({ ...bom, criancas: ['Léo', 'léo'] })).toMatch(/Já há alguém chamado/);
    expect(erroDoRascunho({ ...bom, criancas: ['ana'] })).toMatch(/Já há alguém chamado/);
    expect(erroDoRascunho({ ...bom, adultos: [{ nome: 'Léo', email: 'l@x.pt' }] })).toMatch(/Já há alguém chamado/);
  });
  it('⚠ um adulto sem e-mail válido é recusado: é com ele que entra pela Google', () => {
    expect(erroDoRascunho({ ...bom, adultos: [{ nome: 'Rui', email: 'rui' }] })).toMatch(/e-mail válido/);
  });
  it('põe um limite ao que se acrescenta de uma vez', () => {
    expect(erroDoRascunho({ ...bom, criancas: Array.from({ length: 9 }, (_, i) => `C${i}`) })).toMatch(/No máximo 8/);
  });
  it('limparRascunho apara, tira vazios e só deixa texto', () => {
    expect(limparRascunho({
      nomeCasa: '  Silva ', nome: ' Ana ', criancas: [' Léo ', '', '  '],
      adultos: [{ nome: ' Rui ', email: ' r@x.pt ' }, { nome: '', email: '' }],
    })).toEqual({ nomeCasa: 'Silva', nome: 'Ana', criancas: ['Léo'], adultos: [{ nome: 'Rui', email: 'r@x.pt' }] });
  });
});

describe('o que se gera depois do login', () => {
  it('⚠ o PIN tem 6 dígitos, nunca iguais nem em sequência — em 2000 sorteios', () => {
    for (let i = 0; i < 2000; i += 1) {
      const pin = pinAleatorio();
      expect(pin).toMatch(/^\d{6}$/);
      expect(/^(\d)\1{5}$/.test(pin)).toBe(false);
      expect('0123456789'.includes(pin) || '9876543210'.includes(pin)).toBe(false);
    }
  });
  it('um sorteio que só dá dígitos iguais não fica preso: recai num PIN válido', () => {
    expect(pinAleatorio(() => 7)).toMatch(/^\d{6}$/);
    expect(pinAleatorio(() => 7)).not.toBe('777777');
  });
  it('a palavra-passe de um adulto tem 20 caracteres, mais do que os 10 que o servidor exige', () => {
    const s = senhaAleatoria();
    expect(s).toHaveLength(20);
    expect(s).toMatch(/^[A-Za-z0-9]+$/);
    expect(senhaAleatoria()).not.toBe(s);
  });
  it('um membro por cada pessoa do rascunho: adultos com e-mail, crianças com PIN', () => {
    const { membros, pins } = membrosDoRascunho(
      { adultos: [{ nome: 'Rui', email: 'rui@x.pt' }], criancas: ['Léo', 'Mia'] }, sorteioDe([3, 8, 1, 6, 2, 9, 4, 7]));
    expect(membros.map((m) => [m.nome, m.papel])).toEqual([['Rui', 'adulto'], ['Léo', 'crianca'], ['Mia', 'crianca']]);
    expect(membros[0].email).toBe('rui@x.pt');
    expect(membros[0].segredo.length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(pins)).toEqual(['Léo', 'Mia']);
    expect(membros[1].segredo).toBe(pins['Léo']);
    expect(pins['Léo']).toMatch(/^\d{6}$/);
  });
  it('sem crianças nem adultos, não há nada a acrescentar', () => {
    expect(membrosDoRascunho({ criancas: [], adultos: [] })).toEqual({ membros: [], pins: {} });
  });
});

// ── o ecrã ──────────────────────────────────────────────────────────────────
const montar = (props = {}) => {
  let r;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(CriarCasa, {
      glass: {}, onVoltar: () => {}, onCriar: () => {}, ...props,
    }));
  });
  return r;
};
const porRotulo = (r, rotulo) => r.root.findAll(
  (n) => n.props && n.props.accessibilityLabel === rotulo && typeof n.type !== 'string');
const escrever = (r, rotulo, texto) => TestRenderer.act(() => { porRotulo(r, rotulo)[0].props.onChangeText(texto); });
const carregar = (r, rotulo) => TestRenderer.act(() => { porRotulo(r, rotulo)[0].props.onPress(); });
// Todo o texto visível, colado: a árvore parte «Casa: Família Silva» em três nós.
const texto = (r) => {
  const ler = (n) => (n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(ler).join('') : ler(n.children));
  return ler(r.toJSON());
};

describe('o ecrã «Criar a minha casa»', () => {
  it('começa por perguntar como se chama a casa', () => {
    const r = montar();
    expect(texto(r)).toMatch(/Como se chama a casa\?/);
    expect(porRotulo(r, 'Nome da casa').length).toBeGreaterThan(0);
  });
  it('⚠ sem nome da casa não avança, e diz porquê', () => {
    const r = montar();
    carregar(r, 'Seguinte');
    expect(texto(r)).toMatch(/Diga como se chama a casa/);
    expect(texto(r)).toMatch(/Como se chama a casa\?/);
  });
  it('percorre os quatro passos e entrega o rascunho limpo — sem ir à Google antes de tempo', () => {
    const criar = jest.fn();
    const r = montar({ onCriar: criar });
    escrever(r, 'Nome da casa', '  Silva ');
    carregar(r, 'Seguinte');
    expect(texto(r)).toMatch(/E o seu nome\?/);
    escrever(r, 'O seu nome', 'Ana');
    carregar(r, 'Seguinte');
    expect(texto(r)).toMatch(/Quem mais vive aqui\?/);
    escrever(r, 'Nome da criança', 'Léo');
    carregar(r, 'Acrescentar criança');
    escrever(r, 'Nome do adulto', 'Rui');
    escrever(r, 'E-mail do adulto', 'rui@x.pt');
    carregar(r, 'Acrescentar adulto');
    carregar(r, 'Seguinte');
    expect(texto(r)).toMatch(/Está tudo certo\?/);
    expect(texto(r)).toMatch(/Casa: Família Silva/);
    expect(criar).not.toHaveBeenCalled();
    carregar(r, 'Criar com a Google');
    expect(criar).toHaveBeenCalledTimes(1);
    expect(criar).toHaveBeenCalledWith({
      nomeCasa: 'Silva', nome: 'Ana', criancas: ['Léo'], adultos: [{ nome: 'Rui', email: 'rui@x.pt' }],
    });
  });
  it('⚠ o que ficou escrito nos campos de acrescentar, sem carregar no botão, também conta', () => {
    const criar = jest.fn();
    const r = montar({ onCriar: criar });
    escrever(r, 'Nome da casa', 'Silva'); carregar(r, 'Seguinte');
    escrever(r, 'O seu nome', 'Ana'); carregar(r, 'Seguinte');
    escrever(r, 'Nome da criança', 'Léo');            // sem «Acrescentar»
    carregar(r, 'Seguinte'); carregar(r, 'Criar com a Google');
    expect(criar.mock.calls[0][0].criancas).toEqual(['Léo']);
  });
  it('o passo das crianças pode saltar-se, e só a casa e o nome bastam', () => {
    const criar = jest.fn();
    const r = montar({ onCriar: criar });
    escrever(r, 'Nome da casa', 'Silva'); carregar(r, 'Seguinte');
    escrever(r, 'O seu nome', 'Ana'); carregar(r, 'Seguinte');
    carregar(r, 'Saltar');
    carregar(r, 'Criar com a Google');
    expect(criar).toHaveBeenCalledWith({ nomeCasa: 'Silva', nome: 'Ana', criancas: [], adultos: [] });
  });
  it('⚠ um adulto sem e-mail válido não se acrescenta', () => {
    const r = montar();
    escrever(r, 'Nome da casa', 'Silva'); carregar(r, 'Seguinte');
    escrever(r, 'O seu nome', 'Ana'); carregar(r, 'Seguinte');
    escrever(r, 'Nome do adulto', 'Rui'); escrever(r, 'E-mail do adulto', 'rui');
    carregar(r, 'Acrescentar adulto');
    expect(texto(r)).toMatch(/Falta o e-mail do adulto/);
  });
  it('«Voltar» no primeiro passo sai do formulário; nos outros, recua um passo', () => {
    const voltar = jest.fn();
    const r = montar({ onVoltar: voltar });
    escrever(r, 'Nome da casa', 'Silva'); carregar(r, 'Seguinte');
    carregar(r, 'Voltar');
    expect(voltar).not.toHaveBeenCalled();
    expect(texto(r)).toMatch(/Como se chama a casa\?/);
    carregar(r, 'Voltar');
    expect(voltar).toHaveBeenCalledTimes(1);
  });
  it('⚠ um e-mail sem casa chega como AVISO e não como erro: abre-se o formulário, sem alarme', () => {
    const r = montar({ aviso: 'Este e-mail ainda não faz parte de nenhuma casa. Crie a sua, ou peça o convite a um administrador.' });
    expect(texto(r)).toMatch(/Crie a sua, ou peça o convite/);
    expect(texto(r)).toMatch(/Como se chama a casa\?/);
  });
  it('mostra o erro que a Google ou o servidor devolveram, sem sair do formulário', () => {
    const r = montar({ erro: 'Este e-mail não está autorizado a criar casas neste servidor.' });
    expect(texto(r)).toMatch(/não está autorizado a criar casas/);
  });
  it('os campos de escrita têm 44 px ou mais (invariante 3)', () => {
    const r = montar();
    const campos = porRotulo(r, 'Nome da casa');
    expect(campos.length).toBeGreaterThan(0);
    for (const n of campos) expect(n.props.style.minHeight).toBeGreaterThanOrEqual(44);
  });
});
