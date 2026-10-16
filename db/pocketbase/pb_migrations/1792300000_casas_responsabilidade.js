/// <reference path="../pb_data/types.d.ts" />
// O registo de que quem criou a casa aceitou a responsabilidade pelos dados
// (16/10/2026): a versão do texto, quando, e com que e-mail. Escreve-os o hook
// `casa-criar`, e ninguém os altera depois. Só ACRESCENTA três campos de texto —
// o mesmo que as linhas `responsabilidade_*` do `acrescentar-campos.mjs` fazem,
// para um servidor onde esse script não corre. As casas que já existiam ficam
// com os campos vazios: não aceitaram nada, porque nada lhes foi pedido.
const CAMPOS = [
  ['responsabilidade_versao', 20],
  ['responsabilidade_aceite_em', 40],
  ['responsabilidade_por', 120],
];
migrate((app) => {
  const casas = app.findCollectionByNameOrId('casas');
  let mudou = false;
  for (const [nome, max] of CAMPOS) {
    if (casas.fields.getByName(nome)) continue;
    casas.fields.add(new TextField({ name: nome, max }));
    mudou = true;
  }
  if (mudou) app.save(casas);
}, (app) => {
  const casas = app.findCollectionByNameOrId('casas');
  let mudou = false;
  for (const [nome] of CAMPOS) {
    if (!casas.fields.getByName(nome)) continue;
    casas.fields.removeByName(nome);
    mudou = true;
  }
  if (mudou) app.save(casas);
});
