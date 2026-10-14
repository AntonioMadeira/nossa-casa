# Verifica a casa, que desde 14/10/2026 vive na VPS (136.144.202.8).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\verificar-a-casa.ps1
#
# Confirma que os dois servicos da VPS estao activos, que o tunel tem ligacoes,
# que a casa responde de fora e - o que mais importa - que o painel de
# administracao, a saude e as portas directas NAO saem.
#
# Precisa de `ssh` (vem com o Windows) e da chave autorizada na VPS.
#
# NOTA 1: ficheiro so ASCII e com marca de UTF-8. O powershell.exe 5.1 le os
# .ps1 como ANSI, e um ficheiro com acentos rebenta-lhe o analisador com um erro
# de chaveta numa linha que nao tem chaveta nenhuma.
#
# NOTA 2: nada de `-SkipHttpErrorCheck`. Esse parametro so existe no PowerShell
# 7, e no 5.1 faz o pedido rebentar.
$VPS = "root@136.144.202.8"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$falhas = 0
function Ver($nome, $obtido, $esperado) {
  $ok = "$obtido" -eq "$esperado"
  if (-not $ok) { $script:falhas++ }
  "{0} {1,-52} {2}" -f $(if ($ok) { "OK  " } else { "FALHA" }), $nome, $obtido
}
# Devolve o CODIGO, seja ele qual for. No 5.1 um 404 atira, e o codigo vem da
# excepcao.
function Codigo($url, $metodo = "GET") {
  try {
    [int](Invoke-WebRequest -Uri $url -Method $metodo -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop).StatusCode
  } catch {
    if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "sem resposta" }
  }
}
function NaVps($comando) {
  (& ssh -o BatchMode=yes -o ConnectTimeout=10 $VPS $comando 2>$null) -join "`n"
}

"=== os servicos, na VPS ==="
foreach ($s in "nossa-casa", "cloudflared") {
  $x = (NaVps "systemctl is-active $s").Trim()
  Ver $s $(if ($x) { $x } else { "sem resposta do SSH" }) "active"
}

"`n=== na VPS ==="
$h = NaVps "curl -s http://127.0.0.1:8095/api/health"
Ver "127.0.0.1:8095/api/health" $(if ($h -match '"code":200') { "200" } else { "sem resposta" }) 200

# O tunel confere-se na metrica local do cloudflared, que nao atravessa o filtro
# de rede da empresa (28/09/2026: o FortiGuard bloqueia o dominio nesta rede).
$ligacoes = 0
$r = NaVps "curl -s http://127.0.0.1:20241/ready"
if ($r -match '"readyConnections":(\d+)') { $ligacoes = [int]$Matches[1] }
Ver "cloudflared com ligacoes ao bordo ($ligacoes)" ($ligacoes -gt 0) "True"

$p = NaVps "ls -d /opt/nossa-casa/pb_data/data.db 2>&1; stat -c %s /opt/nossa-casa/pb_data/data.db"
$kb = 0
if ($p -match '(\d+)\s*$') { $kb = [int]([long]$Matches[1] / 1024) }
# Uma base vazia do PocketBase anda pelos 300 KB; esta casa tem dados.
Ver "pb_data/data.db tem a casa dentro ($kb KB)" ($kb -gt 500) "True"

# Ha filtro de rede pelo meio? Distingue-se pelo erro de CONFIANCA no certificado.
$filtro = $false
try {
  Invoke-WebRequest -Uri "https://casa.anossacasa.app/api/health" -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop | Out-Null
} catch {
  $m = "$($_.Exception.Message) $($_.Exception.InnerException.Message)"
  if ($m -match "SSL|TLS|trust|certificate|certificado|secure channel") { $filtro = $true }
}

if ($filtro) {
  "`n=== de fora, pela internet: NAO MEDIDO ==="
  "     A rede desta maquina esta a interceptar o TLS de casa.anossacasa.app."
  "     Nao e o tunel nem a casa: o cloudflared tem $ligacoes ligacao(oes) ao bordo."
  "     Para medir a serio, correr isto de fora da rede da empresa."
} else {

"`n=== de fora, pela internet ==="
Ver "casa.anossacasa.app/api/health" (Codigo "https://casa.anossacasa.app/api/health") 200
Ver "casa.anossacasa.app/_/ (tem de ser 404)" (Codigo "https://casa.anossacasa.app/_/") 404
Ver "superusers auth (tem de ser 404)" (Codigo "https://casa.anossacasa.app/api/collections/_superusers/auth-with-password" "POST") 404

"`n=== a saude NAO sai ==="
foreach ($c in "episodios_saude", "notas_saude", "receitas_saude", "anexos", "alergias_saude", "tomas_saude") {
  try {
    $r = Invoke-RestMethod -Uri "https://casa.anossacasa.app/api/collections/$c/records" -TimeoutSec 20
    Ver $c $r.totalItems 0
  } catch { Ver $c "recusado" 0 }
}

}   # fim do bloco que so corre quando NAO ha filtro de rede pelo meio

"`n=== a VPS nao tem portas abertas alem do SSH ==="
# So o 22 pode estar na firewall; o 80 e o 443 foram fechados a 14/10/2026.
$ufw = NaVps "ufw status"
Ver "a firewall permite o 80" $($ufw -match '(?m)^80/tcp\s+ALLOW') "False"
Ver "a firewall permite o 443" $($ufw -match '(?m)^443/tcp\s+ALLOW') "False"

"`n" + $(if ($falhas) { "FALHAS: $falhas" } else { "TUDO BEM - a casa esta na VPS e esta como se esperava" })
exit $(if ($falhas) { 1 } else { 0 })
