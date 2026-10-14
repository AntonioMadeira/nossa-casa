/// <reference path="../pb_data/types.d.ts" />
// Limite de tentativas de login. Antes, 300 logins falhados seguidos eram todos
// aceites, e o PIN das crianças tem 4 dígitos (10 000 combinações): adivinhava-se
// em minutos. Os limites são por IP e por rótulo; o mais específico ganha.
//
// ⚠ Atrás do túnel da Cloudflare o PocketBase vê o IP do `cloudflared`
// (127.0.0.1), e sem isto toda a família partilharia o mesmo balde. Por isso se
// declara o cabeçalho `CF-Connecting-IP` como fonte do IP real. Só é seguro
// porque o PocketBase escuta em 127.0.0.1 e a única entrada é o túnel.
migrate((app) => {
  const settings = app.settings()

  settings.trustedProxy.headers = ["CF-Connecting-IP"]
  settings.trustedProxy.useLeftmostIP = false
  settings.rateLimits.enabled = true
  settings.rateLimits.rules = [
    { label: "*:authWithPassword", maxRequests: 10, duration: 60 },
    { label: "*:auth",             maxRequests: 20, duration: 60 },
    { label: "*:create",           maxRequests: 60, duration: 60 },
    { label: "/api/",              maxRequests: 600, duration: 10 },
  ]

  return app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.enabled = false
  return app.save(settings)
})
