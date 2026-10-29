# ==============================================================================
# Valida School - Container de Produção Otimizado (Multi-Stage)
# ==============================================================================
# Etapa 1: Compilação do Frontend SPA (React + Vite)
# Etapa 2: Runtime Unificado com Node.js 22 (API REST, WebSocket Hub e SQLite)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. BUILDER STAGE
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifestos de dependência
COPY package*.json ./

# Instala dependências completas para o build
RUN npm ci

# Copia código-fonte do projeto
COPY . .

# Compila o frontend de produção (gera a pasta /app/dist com modelos neurais)
RUN npm run build

# ------------------------------------------------------------------------------
# 2. RUNNER STAGE (Imagem Final de Produção)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Metadados e variáveis de ambiente de produção
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/valida_school.db

LABEL maintainer="Valida School Team" \
      version="2.0.0" \
      description="Sistema Integrado de Liberação Escolar Segura com Biometria Facial"

# Instala apenas dependências de produção para manter a imagem ultra-leve
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia os serviços do backend
COPY server/ ./server/

# Copia o frontend compilado da etapa builder
COPY --from=builder /app/dist ./dist/

# Cria pasta de dados persistentes para o banco SQLite e define permissões de segurança
RUN mkdir -p /app/data && chown -R node:node /app

# Executa com usuário não-root (boa prática estrita de segurança)
USER node

# Porta unificada (Frontend + API REST + WebSocket)
EXPOSE 3000

# Volume persistente para cadastros, termos e registros de auditoria
VOLUME ["/app/data"]

# Verificação de saúde periódica
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Inicializa o servidor central
CMD ["node", "server/index.js"]

