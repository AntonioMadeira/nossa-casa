/**
 * «Começar de Zero» apaga a cópia local — a deste aparelho, e a dos outros.
 *
 * O botão apagava o servidor e o estado de quem o carregava. A cópia de
 * segurança da migração (que guarda a casa ANTIGA inteira) ficava no aparelho,
 * e a cópia dos OUTROS telemóveis sobrevivia: mostravam o que o browser tinha
 * apagado. Agora o servidor deixa um carimbo (`zerado_em`) e cada aparelho que
 * não o viu apaga a sua cópia.
 */
const React = require('react');
const fs = require('fs');
const path = require('path');
const TestRenderer = require('react-test-renderer');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { StoreProvider, useStore } = require('../src/store');

const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const loja = () => {
  let api = null;
  const Sonda = () => { api = useStore(); return null; };
  TestRenderer.act(() => {
    TestRenderer.create(React.createElement(StoreProvider, null, React.createElement(Sonda)));
  });
  return () => api;
};

describe('neste aparelho', () => {
  it('esvazia a casa e guarda o carimbo que o servidor devolveu', () => {
    const l = loja();
    TestRenderer.act(() => { l().criarEnvelope('Férias', 300); });
    TestRenderer.act(() => { l().startBlank('2026-10-15T22:00:00.000Z'); });
    expect(l().envelopes).toHaveLength(0);
    expect(l().s.zeradoEm).toBe('2026-10-15T22:00:00.000Z');
  });

  it('⚠ apaga também a cópia de segurança da migração, que guarda a casa antiga', () => {
    const l = loja();
    AsyncStorage.removeItem.mockClear();
    TestRenderer.act(() => { l().startBlank(); });
    const chaves = AsyncStorage.removeItem.mock.calls.map(c => c[0]);
    expect(chaves.some(k => /antes-da-migracao/.test(k))).toBe(true);
  });
});

describe('nos outros aparelhos', () => {
  const hook = ler('db/pocketbase/pb_hooks/limpar-casa.pb.js');
  const store = ler('src/store.jsx');

  it('o servidor carimba a casa e devolve o carimbo', () => {
    expect(hook).toMatch(/linhaDaCasa\.set\('zerado_em', zeradoEm\)/);
    expect(hook).toMatch(/zerado_em: zeradoEm/);
  });

  it('o campo existe nos dois sítios do esquema e numa migração', () => {
    expect(ler('db/pocketbase/criar-colecoes.mjs')).toMatch(/txt\('zerado_em'/);
    expect(ler('db/pocketbase/acrescentar-campos.mjs')).toMatch(/'zerado_em', \{ type: 'text'/);
    expect(ler('db/pocketbase/pb_migrations/1792200001_casas_zerado_em.js')).toMatch(/zerado_em/);
  });

  it('⚠ um aparelho que não viu o carimbo apaga a sua cópia ao ler a casa', () => {
    expect(store).toMatch(/const foiZerada = !!casa\.zeradoEm && casa\.zeradoEm !== x\.zeradoEm;/);
    expect(store).toMatch(/if \(outraCasa \|\| foiZerada\)/);
    expect(ler('src/sync.js')).toMatch(/zeradoEm: \(aCasa && aCasa\.zerado_em\) \|\| null/);
  });

  it('e quem carregou no botão não se apaga uma segunda vez: leva o carimbo consigo', () => {
    expect(ler('src/screens/Perfil.jsx')).toMatch(/startBlank\(\(apagada && apagada\.zerado_em\) \|\| null\)/);
  });
});
