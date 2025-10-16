<# 
  Subida de ERP Financeiro (produção) - Windows PowerShell
  Requisitos: Docker Desktop + Docker Compose V2
#>

$ErrorActionPreference = "Stop"

function Write-Info($msg){ Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg){ Write-Host "[OK]   $msg" -ForegroundColor Green }
function Write-Warn($msg){ Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg){ Write-Host "[ERR]  $msg" -ForegroundColor Red }

# --- 0) Ajuste de encoding no console (para acentos) ---
try {
  chcp 65001 | Out-Null
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
} catch { }

# --- 1) Ir para a pasta do projeto ---
$root = "C:\caixaApp"
if (-not (Test-Path $root)) { Write-Err "Pasta $root não encontrada."; exit 1 }
Set-Location $root

Write-Host "=== Subindo ERP Financeiro no Docker (produção) ===" -ForegroundColor Magenta

# --- 2) Verificar Docker e Compose ---
Write-Info "Verificando Docker..."
try { docker info --format '{{.ServerVersion}}' | Out-Null } catch { Write-Err "Docker não está rodando. Abra o Docker Desktop e tente novamente."; exit 1 }
Write-Ok "Docker OK"

Write-Info "Verificando Docker Compose V2..."
try { docker compose version | Out-Null } catch { Write-Err "Docker Compose V2 não disponível. Atualize seu Docker Desktop."; exit 1 }
Write-Ok "Docker Compose OK"

# --- 3) Verificar arquivos essenciais ---
$composeFile = Join-Path $root "docker-compose.prod.yml"
if (-not (Test-Path $composeFile)) { Write-Err "Arquivo docker-compose.prod.yml não encontrado em $root."; exit 1 }

$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { Write-Err "Arquivo .env não encontrado em $root."; exit 1 }

$backendDockerfile = Join-Path $root "backend\Dockerfile"
if (-not (Test-Path $backendDockerfile)) { Write-Err "backend/Dockerfile ausente."; exit 1 }

$frontendDir = Join-Path $root "frontend"
$frontendDockerfile = Join-Path $root "frontend\Dockerfile"
if (-not (Test-Path $frontendDir)) { Write-Err "Pasta frontend/ ausente."; exit 1 }
if (-not (Test-Path $frontendDockerfile)) { Write-Warn "frontend/Dockerfile não encontrado. O build será feito via container Node (sem o Dockerfile)." }

$nginxConf = Join-Path $root "nginx\nginx.conf"
if (-not (Test-Path $nginxConf)) { Write-Err "nginx/nginx.conf ausente."; exit 1 }

$nginxDockerfile = Join-Path $root "nginx\Dockerfile"
if (-not (Test-Path $nginxDockerfile)) {
  Write-Warn "nginx/Dockerfile não existe. Vou criar um minimal agora."
  "FROM nginx:1.27-alpine`nCOPY nginx.conf /etc/nginx/nginx.conf" | Set-Content -Path $nginxDockerfile -Encoding ascii
  Write-Ok "nginx/Dockerfile criado."
}

# --- 4) Ler .env e validar variáveis ---
Write-Info "Lendo .env..."
$envMap = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and ($line -notmatch '^\s*#') -and ($line -match '=')) {
    $k,$v = $line -split '=',2
    $envMap[$k.Trim()] = $v.Trim()
  }
}

# Variáveis obrigatórias (se faltar alguma, aborta)
$required = @(
  "POSTGRES_DB","POSTGRES_USER","POSTGRES_PASSWORD",
  "NODE_ENV",
  "PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD",
  "BACKEND_PORT",
  "VITE_API_BASE_URL",
  "NGINX_HTTP_PORT",
  "PGADMIN_DEFAULT_EMAIL","PGADMIN_DEFAULT_PASSWORD","PGADMIN_HTTP_PORT"
)
$missing = $required | Where-Object { -not $envMap.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($envMap[$_]) }
if ($missing.Count -gt 0) {
  Write-Err "Variáveis faltando no .env: $($missing -join ', ')"
  exit 1
}

# --- 5) Checar portas livres (NGINX e pgAdmin) ---
function Test-PortFree([int]$port) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return -not $conns
  } catch { return $true } # se falhar a checagem, assume livre para não bloquear
}

$nginxPort = [int]$envMap["NGINX_HTTP_PORT"]
$pgAdminPort = [int]$envMap["PGADMIN_HTTP_PORT"]

Write-Info "Checando porta do Nginx ($nginxPort)..."
if (-not (Test-PortFree $nginxPort)) { Write-Err "Porta $nginxPort já está em uso. Ajuste NGINX_HTTP_PORT no .env."; exit 1 }
Write-Ok "Porta $nginxPort livre."

Write-Info "Checando porta do pgAdmin ($pgAdminPort) em 127.0.0.1..."
# Nota: bind é em 127.0.0.1, mas a checagem considera todas as interfaces; suficiente para aviso
if (-not (Test-PortFree $pgAdminPort)) { Write-Err "Porta $pgAdminPort já está em uso. Ajuste PGADMIN_HTTP_PORT no .env."; exit 1 }
Write-Ok "Porta $pgAdminPort livre."

# --- 6) Build do frontend DENTRO de container Node (gera ./frontend/dist) ---
$distDir = Join-Path $frontendDir "dist"
$needBuild = $true
if (Test-Path $distDir) {
  $files = Get-ChildItem -Path $distDir -Recurse -File -ErrorAction SilentlyContinue
  if ($files.Count -gt 0) { $needBuild = $false }
}

if ($needBuild) {
  Write-Info "Construindo frontend dentro de container Node (npm ci && npm run build)..."
  $nodeCmd = @(
    "docker","run","--rm",
    "-v", "${PWD}\frontend:/app",
    "-w","/app",
    "-e","VITE_API_BASE_URL=$($envMap["VITE_API_BASE_URL"])",
    "node:20-alpine","sh","-lc",
    "apk add --no-cache python3 make g++ git >/dev/null 2>&1; npm ci && npm run build"
  )
  $proc = Start-Process -FilePath $nodeCmd[0] -ArgumentList $nodeCmd[1..($nodeCmd.Length-1)] -NoNewWindow -PassThru -Wait
  if ($proc.ExitCode -ne 0) { Write-Err "Falha no build do frontend."; exit 1 }

  if (-not (Test-Path $distDir) -or (Get-ChildItem -Path $distDir -Recurse -File).Count -eq 0) {
    Write-Err "Build do frontend não gerou arquivos em frontend/dist."
    exit 1
  }
  Write-Ok "Frontend build concluído."
} else {
  Write-Ok "frontend/dist já existe. Pulando build."
}

# --- 7) Validar compose (lint) ---
Write-Info "Validando docker-compose.prod.yml..."
docker compose -f $composeFile config | Out-Null
Write-Ok "Compose válido."

# --- 8) Subir stack com build ---
Write-Info "Subindo containers (com build)..."
docker compose -f $composeFile up -d --build

Write-Info "Status inicial:"
docker compose -f $composeFile ps

# --- 9) Aguardar Postgres saudável ---
Write-Info "Aguardando Postgres (erp_db) ficar healthy..."
$maxWait = 180
$elapsed = 0
while ($true) {
  $status = docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{end}}" erp_db 2>$null
  if ($status -eq "healthy") { break }
  Start-Sleep -Seconds 3
  $elapsed += 3
  if ($elapsed -ge $maxWait) {
    Write-Err "Postgres não ficou healthy em $maxWait s. Veja 'docker logs erp_db'."
    exit 1
  }
}
Write-Ok "Postgres healthy."

# --- 10) Rodar migrations no backend (se existir script) ---
Write-Info "Tentando executar migrations (npm run migrate) no backend..."
try {
  # Checa se package.json tem o script "migrate"
  $hasMigrate = docker exec erp_backend sh -lc "node -e ""const p=require('./package.json'); console.log(p.scripts&&p.scripts.migrate?'yes':'no')""" 2>$null
  if ($hasMigrate -eq "yes") {
    docker compose -f $composeFile exec -T backend npm run migrate
    Write-Ok "Migrations executadas (se havia algo a aplicar)."
  } else {
    Write-Warn "Script 'migrate' não encontrado no backend. Pulando migrations."
  }
} catch {
  Write-Warn "Não foi possível executar migrations no backend: $($_.Exception.Message)"
}

# --- 11) Smoke test via Nginx (/api/health) ---
$baseUrl = "http://localhost:$nginxPort"
$healthUrl = "$baseUrl/api/health"
Write-Info "Smoke test: $healthUrl"
$ok = $false
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
  if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
    Write-Ok "API respondeu em /api/health (HTTP $($resp.StatusCode))."
    $ok = $true
  }
} catch {
  Write-Warn "Falha no /api/health: $($_.Exception.Message)"
}

if (-not $ok) {
  # tenta página estática / (SPA)
  try {
    $resp2 = Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 10
    if ($resp2.StatusCode -ge 200 -and $resp2.StatusCode -lt 500) {
      Write-Ok "Frontend estático respondeu em /. Verifique o backend em /api/health."
      $ok = $true
    }
  } catch {
    Write-Err "Nem API nem frontend responderam. Verifique 'docker logs erp_nginx' e 'docker logs erp_backend'."
    exit 1
  }
}

Write-Host "=== Serviços no ar. Acesse: $baseUrl ===" -ForegroundColor Magenta
Write-Host "pgAdmin (se habilitado): http://127.0.0.1:$pgAdminPort" -ForegroundColor DarkGray
