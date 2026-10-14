/// <reference path="../pb_data/types.d.ts" />
// Sobe o limite de logins de 10 para 20 por minuto, por IP.
//
// 10/min era apertado para uma casa: vários telemóveis atrás do mesmo IP, e uma
// criança a errar o PIN três vezes, chegam lá. 20/min deixa a família em paz e
// continua a limitar quem tenta adivinhar: um IP faz no máximo ~28 800
// tentativas por dia, e um PIN de 6 dígitos tem 1 000 000 de combinações — mais
// de um mês para as esgotar a partir de um só endereço.
migrate((app) => {
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.map((r) =>
    r.label === "*:authWithPassword" ? { ...r, maxRequests: 20, duration: 60 } : r)
  return app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.map((r) =>
    r.label === "*:authWithPassword" ? { ...r, maxRequests: 10, duration: 60 } : r)
  return app.save(settings)
})
