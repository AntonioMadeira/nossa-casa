/**
 * Um evento da Google que a casa já tem não se importa outra vez (21/10/2026).
 *
 * «Só tenho um evento no Google Calendar, e ao sincronizar a app pôs-me dois.»
 * Reproduzido com a casa a sério: num aparelho novo, a app oferecia como
 * novidade o evento que o servidor já tinha, e importá-lo juntava uma segunda
 * cópia (1 → 2). A decisão «já veio» vivia em duas listas guardadas NO
 * APARELHO (`googleCalendarImported`, `eventEdits[id].idGoogle`), e o servidor
 * não guarda o id da Google.
 *
 * Agora compara-se também com o que a casa TEM: mesmo dia, mesma hora, mesmo
 * título. É a mesma resposta em qualquer aparelho.
 */
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { StoreProvider, useStore } = require('../src/store');
const { jaEstaNaCasa, semOsQueJaEstaoNaCasa } = require('../src/agenda-duplicados');

const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('o mesmo evento, reconhecido pelo dia, a hora e o título', () => {
  const casa = [{ id: 'srv-1', day: 'd2026-10-23', time: '16:00', title: '🚂 Next Stop: Interview Station! - António Madeira' }];
  const daGoogle = { id: 'g-1', titulo: '🚂 Next Stop: Interview Station! - António Madeira', dia: '2026-10-23', hora: '16:00' };

  it('o evento que a casa já tem é reconhecido (chave com `d`, dia da Google sem ele)', () => {
    expect(jaEstaNaCasa(daGoogle, casa)).toBe(true);
  });
  it('não olha a maiúsculas nem a espaços a mais no título', () => {
    expect(jaEstaNaCasa({ ...daGoogle, titulo: '  🚂 NEXT   stop: interview station! - antónio madeira ' }, casa)).toBe(true);
  });
  it('a forma já traduzida para a app (title/date/time) também serve', () => {
    expect(jaEstaNaCasa({ id: 'g-1', title: casa[0].title, date: '2026-10-23', time: '16:00' }, casa)).toBe(true);
    expect(jaEstaNaCasa({ id: 'g-1', title: casa[0].title, date: 'd2026-10-23', time: '16:00' }, casa)).toBe(true);
  });
  it('⚠ outra hora, outro dia ou outro título NÃO é o mesmo evento', () => {
    expect(jaEstaNaCasa({ ...daGoogle, hora: '17:00' }, casa)).toBe(false);
    expect(jaEstaNaCasa({ ...daGoogle, dia: '2026-10-24' }, casa)).toBe(false);
    expect(jaEstaNaCasa({ ...daGoogle, titulo: 'Outra coisa' }, casa)).toBe(false);
    expect(jaEstaNaCasa({ ...daGoogle, hora: null }, casa)).toBe(false);
  });
  it('um evento de dia inteiro (sem hora) compara-se sem hora', () => {
    const dia = [{ id: 'x', day: 'd2026-11-01', time: '', title: 'Feriado' }];
    expect(jaEstaNaCasa({ id: 'g', titulo: 'Feriado', dia: '2026-11-01', hora: null }, dia)).toBe(true);
    expect(jaEstaNaCasa({ id: 'g', titulo: 'Feriado', dia: '2026-11-01', hora: '09:00' }, dia)).toBe(false);
  });
  it('sem título ou sem dia nunca se dá por repetido (não se esconde o que não se percebe)', () => {
    expect(jaEstaNaCasa({ id: 'g', titulo: '', dia: '2026-10-23', hora: '16:00' }, casa)).toBe(false);
    expect(jaEstaNaCasa({ id: 'g', titulo: 'X', dia: '', hora: '16:00' }, casa)).toBe(false);
  });
  it('uma casa sem eventos não tem repetidos', () => {
    expect(jaEstaNaCasa(daGoogle, [])).toBe(false);
    expect(jaEstaNaCasa(daGoogle, undefined)).toBe(false);
  });
  it('semOsQueJaEstaoNaCasa deixa só os novos', () => {
    const novo = { id: 'g-2', titulo: 'Dentista', dia: '2026-10-25', hora: '10:00' };
    expect(semOsQueJaEstaoNaCasa([daGoogle, novo], casa)).toEqual([novo]);
  });
});

describe('⚠ importar não duplica, na loja a sério', () => {
  const loja = () => {
    let api = null;
    const Sonda = () => { api = useStore(); return null; };
    TestRenderer.act(() => {
      TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
    });
    return () => api;
  };
  const EV = { id: 'g-1', title: 'Reunião na escola', date: '2026-09-20', time: '18:00' };
  const contar = (api, titulo) => api().allEvents().filter(e => e.title === titulo).length;

  it('importar um evento que a casa já tem não cria uma segunda cópia', () => {
    const api = loja();
    TestRenderer.act(() => { api().criarEvento({ day: 'd2026-09-20', time: '18:00', title: 'Reunião na escola', who: 'Rita', owner: 'Rita', visibilidade: 'familia' }); });
    expect(contar(api, 'Reunião na escola')).toBe(1);
    TestRenderer.act(() => { api().importGoogleEvents([EV], 'Rita'); });
    expect(contar(api, 'Reunião na escola')).toBe(1);
  });

  it('⚠ um toque duplo no «Importar» não o cria duas vezes', () => {
    const api = loja();
    TestRenderer.act(() => {
      api().importGoogleEvents([EV], 'Rita');
      api().importGoogleEvents([EV], 'Rita');     // o mesmo gesto, a mesma lista de antes
    });
    expect(contar(api, 'Reunião na escola')).toBe(1);
  });

  it('o que não estava na casa entra, e ainda se marca como visto', () => {
    const api = loja();
    TestRenderer.act(() => { api().importGoogleEvents([EV, { id: 'g-2', title: 'Dentista', date: '2026-09-21', time: '10:00' }], 'Rita'); });
    expect(contar(api, 'Reunião na escola')).toBe(1);
    expect(contar(api, 'Dentista')).toBe(1);
    expect(api().s.googleCalendarImported['g-1']).toBe(true);
    expect(api().s.googleCalendarImported['g-2']).toBe(true);
  });

  it('um evento já na casa fica marcado como visto, para não voltar a ser oferecido', () => {
    const api = loja();
    TestRenderer.act(() => { api().criarEvento({ day: 'd2026-09-20', time: '18:00', title: 'Reunião na escola', who: 'Rita', owner: 'Rita', visibilidade: 'familia' }); });
    TestRenderer.act(() => { api().importGoogleEvents([EV], 'Rita'); });
    expect(api().s.googleCalendarImported['g-1']).toBe(true);
  });
});

describe('os três sítios que oferecem eventos da Google usam a mesma regra', () => {
  it('o aviso à entrada, a folha «Importar do Google» e a própria importação', () => {
    expect(ler('App.jsx')).toMatch(/semOsQueJaEstaoNaCasa\(/);
    expect(ler('src/sheets/ImportarGoogle.jsx').match(/semOsQueJaEstaoNaCasa\(/g)).toHaveLength(2);
    expect(ler('src/store.jsx')).toMatch(/jaEstaNaCasa\(\{ titulo: ev\.title/);
  });
});

describe('⚠ com servidor, a família de demonstração não é a casa de ninguém', () => {
  const login = ler('src/screens/Login.jsx');
  it('o ecrã de entrada esconde as contas e as crianças de demonstração quando há servidor', () => {
    expect(login).toMatch(/const semCasaNoAparelho = sync\.ligado\(\) && deDemonstracao;/);
    expect(login).toMatch(/const adultos = semCasaNoAparelho \? \[\] : adultosDaStore;/);
    expect(login).toMatch(/const criancas = semCasaNoAparelho \? \[\] : criancasDaStore;/);
  });
  it('e diz porquê, em vez de mostrar uma lista vazia', () => {
    expect(login).toMatch(/Este aparelho ainda não conhece a casa/);
  });
});
