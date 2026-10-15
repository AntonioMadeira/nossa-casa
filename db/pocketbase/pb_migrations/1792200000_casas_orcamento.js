/// <reference path="../pb_data/types.d.ts" />
// O orçamento por mês ou para o ano (15/10/2026): `{ modo, ano, total, meses }`
// num campo JSON da casa. Ausente lê-se como mensal — é o que a casa sempre fez.
// Só ACRESCENTA um campo: não toca em linhas nem em regras. É o mesmo que a
// linha `['casas', 'orcamento', ...]` do `acrescentar-campos.mjs` faz, para um
// servidor onde esse script não corre.
migrate((app) => {
  const casas = app.findCollectionByNameOrId('casas');
  if (casas.fields.getByName('orcamento')) return;
  casas.fields.add(new JSONField({ name: 'orcamento', maxSize: 20000 }));
  app.save(casas);
}, (app) => {
  const casas = app.findCollectionByNameOrId('casas');
  if (!casas.fields.getByName('orcamento')) return;
  casas.fields.removeByName('orcamento');
  app.save(casas);
});
