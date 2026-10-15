/// <reference path="../pb_data/types.d.ts" />
// O carimbo do último «Começar de Zero» (15/10/2026): texto, escrito pelo hook
// `limpar-casa`. Cada aparelho compara-o com o que viu e apaga a sua cópia local
// quando é novo. Só ACRESCENTA um campo — o mesmo que a linha `zerado_em` do
// `acrescentar-campos.mjs` faz, para um servidor onde esse script não corre.
migrate((app) => {
  const casas = app.findCollectionByNameOrId('casas');
  if (casas.fields.getByName('zerado_em')) return;
  casas.fields.add(new TextField({ name: 'zerado_em', max: 40 }));
  app.save(casas);
}, (app) => {
  const casas = app.findCollectionByNameOrId('casas');
  if (!casas.fields.getByName('zerado_em')) return;
  casas.fields.removeByName('zerado_em');
  app.save(casas);
});
