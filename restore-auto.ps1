param(
  [string]$BackupPath = "C:\caixaApp\backend\backups\caixaAppDB_2025-10-16_100643.backup",
  [string]$ContainerName = "erp_db",
  [string]$EnvFile = "C:\caixaApp\.env",
  [string]$Database = $null,
  [string]$DbUser = "postgres",
  [ValidateSet("Prompt","Keep","Drop")]
  [string]$IfExists = "Prompt",
  [switch]$DropSchema,
  [switch]$KeepConnections,
  [switch]$VerboseSql,
  [string]$OwnerUser = $null
)

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK]  $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Err($m){ Write-Host "[ERR] $m" -ForegroundColor Red }

if (!(Test-Path $BackupPath)) { Err "Arquivo não encontrado: $BackupPath"; exit 1 }
try { docker info | Out-Null } catch { Err "Docker não está rodando."; exit 1 }
if (-not (docker ps --filter "name=$ContainerName" --format "{{.Names}}")) { Err "Container '$ContainerName' não está em execução."; exit 1 }

# .env / banco
if (Test-Path $EnvFile) {
  $envMap=@{}; Get-Content $EnvFile | ?{$_ -and $_ -notmatch '^\s*#' -and $_ -match '='} | %{
    $k,$v = $_ -split '=',2; $envMap[$k.Trim()]=$v.Trim()
  }
  if (-not $Database) { $Database = $envMap["PGDATABASE"] }
}
if (-not $Database -or [string]::IsNullOrWhiteSpace($Database)) { Err "Informe -Database ou ajuste PGDATABASE no .env."; exit 1 }

Info "Destino: container '$ContainerName' | database '$Database' | executor '$DbUser'"

# Detectar tipo do arquivo
$ext = [IO.Path]::GetExtension($BackupPath).ToLowerInvariant()
$base = [IO.Path]::GetFileName($BackupPath)
$signature = ""
try { $fs=[IO.File]::OpenRead($BackupPath); $buf=New-Object byte[] 5; [void]$fs.Read($buf,0,5); $fs.Close(); $signature=[Text.Encoding]::ASCII.GetString($buf) } catch {}
$kind = switch ($true) {
  ($signature -eq "PGDMP") { "pgrestore"; break }
  ($ext -in ".backup",".dump",".tar") { "pgrestore"; break }
  ($base.ToLowerInvariant().EndsWith(".sql.gz")) { "sql_gz"; break }
  ($ext -eq ".gz") { "sql_gz"; break }
  ($ext -eq ".sql") { "sql"; break }
  default { "unknown" }
}
Info "Arquivo: $base | Ext: $ext | Assinatura: '$signature' | Tipo detectado: $kind"
if ($kind -eq "unknown") { Err "Tipo não suportado. Use .backup/.dump/.tar, .sql.gz ou .sql"; exit 1 }

# Funções utilitárias
function DbExists {
  $out = docker exec $ContainerName psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${Database}'"
  if ($LASTEXITCODE -ne 0) { Err "Falha ao consultar existência do DB."; exit 1 }
  return (($out | Out-String).Trim() -eq "1")
}
function TerminateConns {
  docker exec $ContainerName psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${Database}' AND pid <> pg_backend_pid();" | Out-Null
}
function DropDb {
  TerminateConns
  docker exec $ContainerName dropdb -U postgres "${Database}"
  if ($LASTEXITCODE -ne 0) { Err "Falha ao dropar DB '${Database}'."; exit 1 }
}
function CreateDb {
  docker exec $ContainerName createdb -U postgres "${Database}"
  if ($LASTEXITCODE -ne 0) { Err "Falha ao criar DB '${Database}'."; exit 1 }
}

# Existência do DB + IfExists
if (DbExists) {
  Ok "Banco já existe."
  switch ($IfExists) {
    "Prompt" {
      $choice = Read-Host "Apagar e recriar o banco '$Database'? (S/N)"
      if ($choice -match '^[sS]') { $IfExists = "Drop" } else { $IfExists = "Keep" }
    }
    default { }
  }
  if ($IfExists -eq "Drop") {
    Info "Dropando e recriando o banco..."
    DropDb
    CreateDb
    Ok "Banco recriado."
  } else {
    Warn "Mantendo o banco existente (Keep)."
  }
} else {
  Info "Criando banco '$Database'..."
  CreateDb
  Ok "Banco criado."
}

# Encerrar conexões (a menos que KeepConnections)
if (-not $KeepConnections) {
  Info "Encerrando conexões ativas..."
  TerminateConns
  Ok "Conexões encerradas."
} else {
  Warn "Mantendo conexões existentes (KeepConnections)."
}

# Copiar backup para o container
$remote = "/tmp/restore${ext}"
Info "Copiando arquivo para o container: $remote"
docker cp "$BackupPath" "$($ContainerName):$remote"
if ($LASTEXITCODE -ne 0) { Err "Falha ao copiar arquivo para o container."; exit 1 }
Ok "Arquivo copiado."

# Restaurar conforme o tipo
switch ($kind) {
  "pgrestore" {
    Info "pg_restore --clean --if-exists --no-owner --no-privileges -j4 ..."
    docker exec $ContainerName pg_restore -U $DbUser --clean --if-exists --no-owner --no-privileges -j 4 -d $Database $remote
    if ($LASTEXITCODE -ne 0) { Err "Falha no pg_restore."; exit 1 }
    Ok "Restauração (pg_restore) concluída."
  }
  "sql_gz" {
    Info "gunzip | psql ..."
    $flags = "-v ON_ERROR_STOP=1"; if ($VerboseSql) { $flags += " -a" }
    docker exec $ContainerName sh -lc "gunzip -c $remote | psql $flags -U $DbUser -d $Database"
    if ($LASTEXITCODE -ne 0) { Err "Falha na restauração (.sql.gz)."; exit 1 }
    Ok "Restauração (.sql.gz) concluída."
  }
  "sql" {
    if ($DropSchema) {
      Info "Recriando schema public..."
      docker exec $ContainerName psql -v ON_ERROR_STOP=1 -U postgres -d $Database -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
      if ($LASTEXITCODE -ne 0) { Err "Falha ao recriar schema public."; exit 1 }
      Ok "Schema public recriado."
    }
    Info "psql -f ..."
    $flags = "-v ON_ERROR_STOP=1"; if ($VerboseSql) { $flags += " -a" }
    docker exec $ContainerName psql $flags -U $DbUser -d $Database -f $remote
    if ($LASTEXITCODE -ne 0) { Err "Falha na restauração (.sql)."; exit 1 }
    Ok "Restauração (.sql) concluída."
  }
}

# Reatribuir owner (opcional)
if ($OwnerUser) {
  Info "Trocando owner do schema public e objetos para '$OwnerUser'..."
  $reassign = @"
DO \$\$
DECLARE r RECORD;
BEGIN
  EXECUTE 'ALTER SCHEMA public OWNER TO $OwnerUser';
  FOR r IN
    SELECT format('%I.%I', n.nspname, c.relname) AS obj
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE 'ALTER TABLE '||r.obj||' OWNER TO $OwnerUser';
  END LOOP;
  PERFORM pg_catalog.set_config('search_path', 'public', false);
  FOR r IN
    SELECT p.oid::regprocedure::text AS obj
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE 'ALTER FUNCTION '||r.obj||' OWNER TO $OwnerUser';
  END LOOP;
END
\$\$;
"@ -replace "`r?`n"," "
  docker exec $ContainerName psql -v ON_ERROR_STOP=1 -U postgres -d $Database -c "$reassign"
  if ($LASTEXITCODE -ne 0) { Warn "Não foi possível trocar owners (verifique se '$OwnerUser' existe)."; }
  else { Ok "Owners ajustados para '$OwnerUser'." }
}

# Pós-checagem
Info "Algumas tabelas em public:"
docker exec $ContainerName psql -U $DbUser -d $Database -tAc "SELECT schemaname||'.'||tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1 LIMIT 20;"

Ok "Backup restaurado com sucesso."
