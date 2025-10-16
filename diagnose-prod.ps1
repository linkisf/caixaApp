param(
  [string]$ComposeFile = "C:\caixaApp\docker-compose.prod.yml",
  [string]$EnvFile     = "C:\caixaApp\.env",
  [string]$NginxName   = "erp_nginx",
  [string]$BackendName = "erp_backend",
  [string]$DbName      = "erp_db",
  [int]$TimeoutSec     = 8
)

$ErrorActionPreference = "Stop"

function OK($m){ Write-Host "[OK]   $m" -ForegroundColor Green }
function FAIL($m){ Write-Host "[FAIL] $m" -ForegroundColor Red }
function INFO($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function WARN($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }

# 0) Pre-checagens
try { docker info | Out-Null } catch { FAIL "Docker nao esta rodando."; exit 1 }
if (!(Test-Path $ComposeFile)) { FAIL "Compose nao encontrado: $ComposeFile"; exit 1 }
if (!(Test-Path $EnvFile))     { FAIL ".env nao encontrado: $EnvFile"; exit 1 }

# 1) Ler .env
$envMap=@{}
Get-Content $EnvFile | Where-Object {$_ -and $_ -notmatch '^\s*#' -and $_ -match '='} | ForEach-Object {
  $k,$v = $_ -split '=',2
  $envMap[$k.Trim()]=$v.Trim()
}
# Fallbacks sem usar ?:
if ($envMap.ContainsKey("NGINX_HTTP_PORT") -and $envMap["NGINX_HTTP_PORT"]) {
  $nginxPort = [int]$envMap["NGINX_HTTP_PORT"]
} else {
  $nginxPort = 80
}
if ($envMap.ContainsKey("VITE_API_BASE_URL") -and $envMap["VITE_API_BASE_URL"]) {
  $apiBase = $envMap["VITE_API_BASE_URL"]
} else {
  $apiBase = "/api"
}
INFO "Variaveis: NGINX_HTTP_PORT=$nginxPort | VITE_API_BASE_URL=$apiBase"

# 2) Containers no ar
$ps = docker compose -f $ComposeFile ps --format json | ConvertFrom-Json
$names = $ps.Name
if ($names -notcontains $NginxName) { FAIL "Container $NginxName nao esta no ar."; exit 1 } else { OK "$NginxName em execucao." }
if ($names -notcontains $BackendName){ FAIL "Container $BackendName nao esta no ar."; exit 1 } else { OK "$BackendName em execucao." }
if ($names -notcontains $DbName)    { FAIL "Container $DbName nao esta no ar."; exit 1 } else { OK "$DbName em execucao." }

# 3) Nginx servindo estatico?
try {
  $resp = Invoke-WebRequest -Uri ("http://localhost:"+$nginxPort+"/") -UseBasicParsing -TimeoutSec $TimeoutSec
  if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) { OK "Nginx servindo o frontend (HTTP $($resp.StatusCode))." }
  else { FAIL "Nginx respondeu HTTP $($resp.StatusCode) em /." }
} catch { FAIL ("Nginx nao respondeu em http://localhost:"+$nginxPort+"/ -> "+$_.Exception.Message) }

# 4) Nginx -> Backend /health
$hit = ""
# tenta backend:8000
$hit = docker exec $NginxName sh -lc "wget -qO- http://backend:8000/health" 2>$null
if (-not $hit) {
  # tenta erp_backend:8000
  $hit = docker exec $NginxName sh -lc "wget -qO- http://erp_backend:8000/health" 2>$null
}
if (-not $hit) {
  FAIL "Do Nginx nao foi possivel acessar o backend (/health). Verifique proxy_pass/host ou backend offline."
} else {
  OK ("Nginx alcanca o backend /health: "+$hit)
}

# 5) Backend ouvindo na porta certa e bind correto?
$listen = docker exec $BackendName sh -lc "ss -lntp 2>/dev/null" 2>$null
if (-not $listen) { $listen = docker exec $BackendName sh -lc "netstat -lntp 2>/dev/null" 2>$null }
if ($listen -match "0\.0\.0\.0:8000" -or $listen -match ":::8000") {
  OK "Backend ouvindo em 0.0.0.0:8000."
} elseif ($listen -match "127\.0\.0\.1:8000") {
  FAIL "Backend ouvindo em 127.0.0.1:8000 (errado no Docker). Ajuste app.listen(port, '0.0.0.0')."
} else {
  WARN "Nao foi possivel confirmar bind do backend (ss/netstat indisponivel?)."
}

# 6) Conferir entrypoint: server.js vs index.js
$hasServer = docker exec $BackendName sh -lc "test -f /app/src/server.js && echo yes || echo no"
$hasIndex  = docker exec $BackendName sh -lc "test -f /app/src/index.js && echo yes || echo no"
if ($hasIndex -eq "yes" -and $hasServer -eq "no") {
  WARN "Dockerfile usa CMD ['node','src/server.js'] mas existe apenas src/index.js. Ajuste para src/index.js OU crie server.js."
} else {
  OK ("Arquivos de entrada verificados (server.js="+$hasServer+", index.js="+$hasIndex+").")
}

# 7) Health da API via Nginx
try {
  $h = Invoke-WebRequest -Uri ("http://localhost:"+$nginxPort+$apiBase+"/health") -UseBasicParsing -TimeoutSec $TimeoutSec
  if ($h.StatusCode -ge 200 -and $h.StatusCode -lt 300 -and ($h.Content -match "ok")) { OK ("GET "+$apiBase+"/health via Nginx OK.") }
  else { FAIL ($apiBase+"/health via Nginx respondeu HTTP "+$h.StatusCode) }
} catch { FAIL ("Falha ao acessar "+$apiBase+"/health via Nginx: "+$_.Exception.Message) }

# 8) nginx.conf contem proxy_pass correto?
$conf = docker exec $NginxName sh -lc "cat /etc/nginx/nginx.conf" 2>$null
if (-not $conf) {
  FAIL "Nao consegui ler /etc/nginx/nginx.conf dentro do Nginx."
} else {
  if ($conf -match "location\s+/api/") {
    if ($conf -match "proxy_pass\s+http://backend:8000/") { OK "nginx.conf: proxy_pass http://backend:8000/ OK." }
    elseif ($conf -match "proxy_pass") { WARN "nginx.conf tem proxy_pass, mas nao aponta para backend:8000. Verifique o host." }
    else { FAIL "location /api/ sem proxy_pass." }
  } else {
    FAIL "nginx.conf sem bloco location /api/."
  }
}

# 9) Testes de rotas reais
$routes = @(
  ($apiBase+"/funcionarios"),
  ($apiBase+"/funcoes"),
  ($apiBase+"/funcionarios/tipos-saida")
)
foreach ($r in $routes) {
  $url = "http://localhost:"+$nginxPort+$r
  try {
    $r2 = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $TimeoutSec
    if ($r2.StatusCode -ge 200 -and $r2.StatusCode -lt 300) { OK ("GET "+$r+" -> HTTP "+$r2.StatusCode) }
    else {
      $snippet = ""
      if ($r2.Content) { $snippet = $r2.Content.Substring(0, [Math]::Min(120, $r2.Content.Length)) }
      FAIL ("GET "+$r+" -> HTTP "+$r2.StatusCode+" conteudo: "+$snippet)
    }
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match "502") { FAIL ("GET "+$r+" -> 502 (proxy Nginx para Backend). Veja logs e rotas.") }
    else { FAIL ("GET "+$r+" -> falha: "+$msg) }
  }
}

# 10) O frontend esta chamando /api?
$assets = "C:\caixaApp\frontend\dist\assets"
if (Test-Path $assets) {
  $apiInBundle = Get-ChildItem -Path $assets -Recurse -Include *.js -ErrorAction SilentlyContinue |
    Select-String -Pattern "/api/" -SimpleMatch -List | Select-Object -First 1
  if ($apiInBundle) { OK "Bundle do frontend contem '/api/' (VITE_API_BASE_URL provavelmente OK)." }
  else {
    WARN "Nao encontrei '/api/' nos bundles. O frontend pode estar chamando rotas sem prefixo (/funcionarios)."
    Write-Host "  -> Garanta VITE_API_BASE_URL=/api no build e uso de import.meta.env.VITE_API_BASE_URL" -ForegroundColor Yellow
  }
} else {
  WARN "Nao encontrei frontend/dist/assets para verificar VITE_API_BASE_URL."
}

# 11) Logs para acao
INFO "Ultimas linhas do Nginx:"
docker logs $NginxName --tail=50

INFO "Ultimas linhas do Backend:"
docker logs $BackendName --tail=50

OK "Diagnostico concluido."
