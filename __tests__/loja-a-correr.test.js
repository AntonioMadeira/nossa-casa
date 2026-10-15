/**
 * A loja a correr — não o código-fonte dela.
 *
 * Os outros ficheiros lêem texto: apanham «este nome está escrito à mão», mas
 * não apanham «esta constante não existe no âmbito onde é lida». Foi
 * exatamente isso que apareceu no navegador depois de tirar os nomes daqui —
 * um `ReferenceError` que nenhuma das 138 provas de leitura via.
 *
 * Aqui monta-se o StoreProvider a sério e lê-se o que ele devolve.
 */

const React = require('react');
const TestRenderer = require('react-test-renderer');
const { StoreProvider, useStore } = require('../src/store');


// Monta a loja e devolve a api que ela expõe.
const montar = () => {
  let api = null;
  const Sonda = () => { api = useStore(); return null; };
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
  });
  return api;
};

describe('A loja monta e responde', () => {
  test('monta sem rebentar', () => {
    expect(montar()).toBeTruthy();
  });

  test('a casa de demonstração tem dois adultos e duas crianças', () => {
    const st = montar();
    expect(st.membrosDaCasa).toEqual(['Rita', 'Tomás', 'Léo', 'Mia']);
    expect(st.adultos).toEqual(['Rita', 'Tomás']);
    expect(st.criancas).toEqual(['Léo', 'Mia']);
  });

  // O defeito que só o navegador viu: `ACERTO_INICIAL` lido dentro de `build`.
  test('o acerto entre adultos está calculado, não indefinido', () => {
    const { acerto, acertado } = montar();
    expect(acerto).not.toBeNull();
    expect(acerto.devedor).toBe('Tomás');
    expect(acerto.credor).toBe('Rita');
    expect(acerto.valor).toBeCloseTo(86.5);
    expect(acerto.pago).toBe(0);
    expect(acertado).toBe(false);
  });

  test('a concordância de género segue o quadro da casa', () => {
    const { oNome, aoNome, artigo, deNome } = montar();
    expect(oNome('Rita')).toBe('A Rita');
    expect(oNome('Tomás')).toBe('O Tomás');
    expect(aoNome('Rita')).toBe('à Rita');
    expect(aoNome('Tomás')).toBe('ao Tomás');
    expect(artigo('Mia')).toBe('a');
    expect(deNome('Léo')).toBe('do');
  });

  test('os pontos das crianças arrancam nas sementes', () => {
    const { kidPts } = montar();
    expect(Object.keys(kidPts)).toEqual(['Léo', 'Mia']);
    expect(kidPts['Léo']).toBeGreaterThanOrEqual(14);
    expect(kidPts['Mia']).toBeGreaterThanOrEqual(11);
  });

  // Tudo o que os ecrãs desestruturam tem de existir E não ser undefined.
  // O teste de leitura só confirma que o nome aparece no `return`.
  test('nada do que a loja expõe sai indefinido', () => {
    const st = montar();
    const indefinidos = Object.entries(st)
      .filter(([, v]) => v === undefined)
      .map(([k]) => k);
    expect(indefinidos).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O ponto de tudo isto: uma casa que não é a da demonstração. Enquanto os
// nomes estiveram escritos à mão, acrescentar uma Ana dava-lhe um avatar e
// mais nada.
describe('Uma casa diferente da de demonstração', () => {
  const CASA_NOVA = {
    'Ana':    { initial: 'A', kid: false, fem: true,  email: 'ana@exemplo.pt' },
    'Bruno':  { initial: 'B', kid: false, fem: false, email: 'bruno@exemplo.pt' },
    'Carlos': { initial: 'C', kid: true,  fem: false },
    'Dina':   { initial: 'D', kid: true,  fem: true  },
    'Eva':    { initial: 'E', kid: true,  fem: true  },
  };

  // Monta a loja, troca o quadro da casa, e devolve a api já com o novo quadro.
  const casaNova = () => {
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    let r;
    TestRenderer.act(() => {
      r = TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    });
    TestRenderer.act(() => { api.set({ membros: CASA_NOVA, nomeDaCasa: 'Ferreira' }); });
    r.update(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    return api;
  };

  test('os cinco membros contam, e as crianças são as três', () => {
    const st = casaNova();
    expect(st.membrosDaCasa).toEqual(['Ana', 'Bruno', 'Carlos', 'Dina', 'Eva']);
    expect(st.adultos).toEqual(['Ana', 'Bruno']);
    expect(st.criancas).toEqual(['Carlos', 'Dina', 'Eva']);
    expect(st.nomeDaCasa).toBe('Ferreira');
  });

  test('as três crianças têm pontos — e começam a zero, sem herdar histórico', () => {
    const { kidPts } = casaNova();
    expect(Object.keys(kidPts)).toEqual(['Carlos', 'Dina', 'Eva']);
    for (const n of ['Carlos', 'Dina', 'Eva']) expect(kidPts[n]).toBe(0);
  });

  test('o acerto é entre os dois adultos desta casa, com a concordância certa', () => {
    const { acerto, oNome, aoNome } = casaNova();
    expect(acerto.credor).toBe('Ana');
    expect(acerto.devedor).toBe('Bruno');
    expect(`${oNome(acerto.devedor)} deve ${aoNome(acerto.credor)}`).toBe('O Bruno deve à Ana');
  });

  test('cada membro novo tem uma cor da paleta, e nenhuma fica sem', () => {
    const { corDoMembro } = require('../src/theme');
    const { membrosDaCasa } = casaNova();
    for (const n of membrosDaCasa) expect(corDoMembro(n)).toMatch(/^#[0-9A-F]{6}$/i);
  });

  // INVARIANTE #2 numa casa qualquer: o acerto continua a somar-se. Isto é o
  // caso dos dois telefones — cada adulto acerta metade, e a conta fecha uma
  // vez. Com o booleano `settled` que estava aqui, a primeira metade fechava a
  // conta e a segunda não tinha onde entrar: 43,25 € desapareciam.
  test('acertar metade duas vezes fecha a conta; à primeira, não', () => {
    // a sonda reatribui `api` a cada render, por isso lê-se sempre a atual
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    });
    TestRenderer.act(() => { api.set({ membros: CASA_NOVA }); });

    expect(api.acerto.valor).toBeCloseTo(86.5);
    expect(api.acertado).toBe(false);

    TestRenderer.act(() => { api.pagarAcerto(43.25, 'metade'); });
    expect(api.acerto.pago).toBeCloseTo(43.25);
    expect(api.acerto.valor).toBeCloseTo(43.25);
    expect(api.acertado).toBe(false);        // meia conta não é conta fechada

    TestRenderer.act(() => { api.pagarAcerto(43.25, 'metade'); });
    expect(api.acerto.pago).toBeCloseTo(86.5);
    expect(api.acerto.valor).toBe(0);
    expect(api.acertado).toBe(true);

    // e nunca fica negativo, mesmo que alguém pague a mais
    TestRenderer.act(() => { api.pagarAcerto(10, 'a mais'); });
    expect(api.acerto.valor).toBe(0);
  });

  // Numa casa de um adulto não há nada a acertar, e a secção não pode
  // rebentar a ler `adultos[1]`.
  test('uma casa de um adulto não tem acerto — e não rebenta', () => {
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    });
    TestRenderer.act(() => {
      api.set({ membros: { 'Ana': { initial: 'A', kid: false, fem: true },
                           'Dina': { initial: 'D', kid: true, fem: true } } });
    });
    expect(api.adultos).toEqual(['Ana']);
    expect(api.acerto).toBeNull();
    expect(api.acertado).toBe(true);      // nada por acertar é acertado
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// As quatro operações da casa. Aqui prova-se o que acontece SEM servidor —
// que é o caso de quem abre a app pela primeira vez. O que acontece COM
// servidor está provado a correr contra o PocketBase, em
// db/pocketbase/provar-gerir-casa.mjs.
describe('Gerir a casa sem servidor', () => {
  const nova = () => {
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    });
    return () => api;   // devolve um leitor, porque a api muda a cada alteração
  };

  test('a casa de demonstração não se gere', () => {
    const ler = nova();
    expect(ler().podeGerirCasa()).toBe(false);
  });

  test('cada operação recusa, e diz porquê — nenhuma rebenta', async () => {
    const ler = nova();
    const respostas = [];
    await TestRenderer.act(async () => {
      respostas.push(await ler().renomearCasa('Ferreira'));
      respostas.push(await ler().acrescentarMembro({
        nome: 'Ana', papel: 'adulto', email: 'ana@exemplo.pt', segredo: 'palavra-passe' }));
      respostas.push(await ler().editarMembro('Léo', { papel: 'adulto' }));
      respostas.push(await ler().removerMembro('Mia'));
    });
    for (const r of respostas) {
      expect(typeof r).toBe('string');
      expect(r).toContain('demonstração');
    }
  });

  test('e a casa fica exatamente como estava', async () => {
    const ler = nova();
    const antes = ler().membrosDaCasa.slice();
    await TestRenderer.act(async () => {
      await ler().acrescentarMembro({ nome: 'Ana', papel: 'crianca', segredo: '2470' });
      await ler().removerMembro('Mia');
    });
    expect(ler().membrosDaCasa).toEqual(antes);
    expect(ler().nomeDaCasa).toBe('Bengui');
  });

  // A validação corre ANTES da guarda do servidor: quem escreve um PIN
  // inválido tem de o saber sem depender de haver rede.
  test('o que está mal preenchido é recusado antes de se falar com o servidor', async () => {
    const ler = nova();
    const dizer = async (campos) => {
      let r;
      await TestRenderer.act(async () => { r = await ler().acrescentarMembro(campos); });
      return r;
    };
    expect(await dizer({ nome: '  ', papel: 'crianca', segredo: '482016' }))
      .toBe('O membro precisa de um nome.');
    expect(await dizer({ nome: 'Léo', papel: 'crianca', segredo: '482016' }))
      .toMatch(/Já existe/);
    expect(await dizer({ nome: 'Ana', papel: 'crianca', segredo: '111111' }))
      .toMatch(/seis dígitos iguais/);
    expect(await dizer({ nome: 'Ana', papel: 'crianca', segredo: '123456' }))
      .toMatch(/sequência/);
    expect(await dizer({ nome: 'Ana', papel: 'adulto', email: 'não-é-email', segredo: 'palavra-passe' }))
      .toMatch(/endereço de e-mail/);
    expect(await dizer({ nome: 'Ana', papel: 'adulto', email: 'ana@exemplo.pt', segredo: 'curta' }))
      .toMatch(/8 caracteres/);
    // e o nome da casa também
    let r;
    await TestRenderer.act(async () => { r = await ler().renomearCasa('   '); });
    expect(r).toBe('A casa precisa de um nome.');
  });

  // A casa nunca pode ficar sem administração. O servidor tem um hook para
  // isto, mas quem está a tocar no botão merece a recusa antes da viagem.
  test('a última administração não sai nem se despromove', async () => {
    const ler = nova();
    let semAdmin, foraDeCasa;
    await TestRenderer.act(async () => {
      // Só a Rita administra a casa de demonstração
      semAdmin = await ler().editarMembro('Rita', { papel: 'adulto' });
      foraDeCasa = await ler().removerMembro('Rita');
    });
    expect(semAdmin).toMatch(/sem administração/);
    expect(foraDeCasa).toMatch(/sem administração/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `clearedSeeds` limpava as tarefas, os eventos, as compras e a saúde, e
// deixava o DINHEIRO: os gastos e os limites vivem em ENV_BASE e não passavam
// por essa bandeira. Uma casa acabada de ligar ao servidor mostrava
// «Disponível 383,00 € de 1 770,00 €» — os 1 387 € gastos pela família de
// demonstração contra os limites dela. Um número inventado no sítio onde a app
// é mais lida.
describe('Uma casa sem sementes não tem o dinheiro de outra família', () => {
  const { BLANK, SEM_DINHEIRO_SEMEADO } = require('../src/store');

  const comEstado = (patch) => {
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    });
    TestRenderer.act(() => { api.set(patch); });
    return api;
  };

  test('a casa de demonstração tem o orçamento da demonstração', () => {
    const st = comEstado({});
    expect(st.budget).toBe(1770);
    expect(st.spent).toBe(1387);
    expect(st.remaining).toBe(383);
  });

  test('sem sementes, o orçamento é zero — e não o de outra família', () => {
    const st = comEstado(SEM_DINHEIRO_SEMEADO());
    expect(st.budget).toBe(0);
    expect(st.spent).toBe(0);
    expect(st.remaining).toBe(0);
  });

  test('«Começar de zero» também não herda o orçamento', () => {
    const st = comEstado(BLANK());
    expect(st.budget).toBe(0);
    expect(st.spent).toBe(0);
  });

  test('⚠ «Começar de zero» apaga os envelopes também — nem as categorias ficam', () => {
    const st = comEstado(BLANK());
    expect(st.envelopes).toHaveLength(0);
  });

  // Numa casa acabada de ligar as categorias ficam: são um ponto de partida e
  // mudam-se na Gestão. O que sai são os valores. (O «Começar de zero» é
  // outra coisa, e apaga-as — ver acima.)
  test('as categorias ficam, com os valores a zero', () => {
    const st = comEstado(SEM_DINHEIRO_SEMEADO());
    expect(st.envelopes.map(e => e.name))
      .toEqual(['Mercearia', 'Crianças & escola', 'Casa & contas', 'Sair & lazer']);
    for (const e of st.envelopes) {
      expect(e.used).toBe(0);
      expect(e.limit).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A limpeza do dinheiro corre uma vez, na transição para casa a sério. Quem já
// tinha transitado antes de ela existir ficou com o orçamento da demonstração
// e nunca mais o perdia — «Disponível 383,00 € de 1 770,00 €» numa casa nova.
describe('A migração 6 tira o dinheiro da demonstração a quem já tinha limpado', () => {
  const { MIGRATIONS, SCHEMA } = require('../src/store');

  test('existe, e a versão acompanha', () => {
    expect(SCHEMA).toBeGreaterThanOrEqual(6);
    expect(typeof MIGRATIONS[6]).toBe('function');
  });

  test('quem limpou as sementes e nunca definiu limites fica a zero', () => {
    const d = MIGRATIONS[6]({ clearedSeeds: true });
    expect(d.rendimento).toBe(0);
    expect(d.monthZero).toBe(true);
    expect(Object.values(d.monthLimits).every(v => v === 0)).toBe(true);
  });

  // A condição é estreita de propósito: apagar o orçamento de alguém para
  // corrigir um defeito meu seria trocar um erro por outro pior.
  test('quem definiu os seus limites não é tocado', () => {
    const meus = { clearedSeeds: true, monthLimits: { Mercearia: 400 }, rendimento: 2000 };
    expect(MIGRATIONS[6](meus)).toEqual(meus);
  });

  test('e quem ainda está na demonstração também não', () => {
    const demo = { clearedSeeds: false, rendimento: 3200 };
    expect(MIGRATIONS[6](demo)).toEqual(demo);
  });
});
