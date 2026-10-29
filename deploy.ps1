# ==============================================================================
# Valida School - Script de Deploy Automatizado (Windows -> Ubuntu Server)
# ==============================================================================
# Uso: .\deploy.ps1
# Ou: .\deploy.ps1 -CommitMessage "Nova melhoria no Totem"
# ==============================================================================

param(
  [string]$ServerHost = "192.168.1.6",
  [string]$ServerUser = "meksteel",
  [string]$RemoteDir = "~/0_projects/valida_school",
  [string]$CommitMessage = "Atualização automática Valida School"
)

Write-Host "🚀 Iniciando Deploy do Valida School..." -ForegroundColor Cyan

# 1. Verifica se há alterações locais não commitadas
$status = git status --porcelain
if ($status) {
    Write-Host "📦 Salvando alterações locais..." -ForegroundColor Yellow
    git add .
    git commit -m "$CommitMessage"
}

# 2. Envia para o repositório remoto (Gitea)
Write-Host "📤 Enviando código para o Gitea..." -ForegroundColor Yellow
try {
    git push
} catch {
    Write-Warning "Aviso no git push. Prosseguindo com o deploy remoto..."
}

# 3. Executa a atualização remota no servidor Ubuntu via SSH
Write-Host "🔄 Atualizando e rebuildando container no servidor ($ServerHost)..." -ForegroundColor Yellow
ssh "${ServerUser}@${ServerHost}" "cd $RemoteDir && git pull && docker compose up -d --build"

Write-Host "✅ Deploy finalizado com sucesso no servidor!" -ForegroundColor Green
Write-Host "🌐 Totem da Portaria:      http://${ServerHost}:3080/totem" -ForegroundColor Cyan
Write-Host "📱 Portal do Responsável:  http://${ServerHost}:3080/responsavel" -ForegroundColor Cyan
Write-Host "🏫 Painel da Coordenação:  http://${ServerHost}:3080/escola" -ForegroundColor Cyan
Write-Host "📺 Smart TV das Salas:     http://${ServerHost}:3080/chamada" -ForegroundColor Cyan

