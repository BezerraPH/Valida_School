# 🐳 Guia de Containerização e Deploy — Valida School

Este documento descreve como executar o **Valida School** de forma 100% isolada, segura e portátil utilizando **Docker** e **Docker Compose**, simplificando a implantação em servidores locais de escolas, creches ou instâncias em nuvem (VPS, AWS, Google Cloud, Azure).

---

## 🎯 1. Arquitetura do Container

O projeto utiliza um **Dockerfile Multi-Stage** de alta eficiência baseado em **Node.js 22 Alpine**:

1. **Estágio de Construção (`builder`):** Instala dependências de compilação, executa `npm run build` e empacota o frontend React SPA juntamente com os modelos neurais de biometria facial (`face-api`).
2. **Estágio de Produção (`runner`):** 
   - Contém apenas as dependências de produção do backend (`express`, `ws`, `cors`).
   - Servidor unificado: o Node.js serve a **API REST**, o **Hub WebSocket** e os **arquivos estáticos do frontend** na mesma porta com suporte a SPA routing (`/totem`, `/escola`, `/responsavel`, `/chamada`).
   - Banco de dados relacional **SQLite** com persistência atômica via volume Docker.
   - Segurança: roda com usuário restrito não-root (`USER node`).

---

## 🚀 2. Como Rodar com 1 Comando

### Pré-requisitos:
- Ter o **Docker** e o **Docker Compose** instalados no servidor ou computador.

### Passo a Passo:

Na raiz do projeto (`valida_school`), execute:

```bash
# 1. Construir e iniciar o container em segundo plano
docker compose up -d --build

# 2. Verificar o status do container
docker compose ps

# 3. Acompanhar os logs em tempo real
docker compose logs -f
```

---

## 🌐 3. Acessos do Sistema

Assim que o container subir, todas as interfaces estarão disponíveis:

| Módulo | URL de Acesso | Descrição |
| :--- | :--- | :--- |
| **Totem da Portaria** | `http://localhost:3080/totem` | Terminal touch com reconhecimento facial, PIN e Modo Van Escolar. |
| **Portal do Responsável** | `http://localhost:3080/responsavel` | Geração de PIN familiar, autorização de terceiros com Termo LGPD. |
| **Painel da Coordenação** | `http://localhost:3080/escola` | Monitoramento ao vivo, contingência manual e exportação de CSV oficial. |
| **Smart TV Salas de Aula** | `http://localhost:3080/chamada` | Painel de chamada com síntese de voz e alerta sonoro. |
| **API Healthcheck** | `http://localhost:3080/api/health` | Verificação de integridade do serviço. |

> **Nota:** A porta padrão externa foi ajustada para `3080` para evitar conflito com outros serviços como Nextcloud (`8080`). Você pode alterar a qualquer momento no `docker-compose.yml`.

---

## 💾 4. Persistência de Dados e Backups

Todos os dados escolares (cadastros de alunos, matrículas, termos de autorização assinados, fotos de prova de vida e logs de auditoria) são gravados em um **volume persistente**:

- **Caminho interno no container:** `/app/data/valida_school.db`
- **Nome do volume Docker:** `valida_school_data`

### Como Fazer Backup do Banco de Dados:

Para extrair um backup do banco de dados da escola a qualquer momento sem parar o sistema:

```bash
docker run --rm -v valida_school_data:/data -v ${PWD}:/backup alpine cp /data/valida_school.db /backup/backup_escola_$(date +%Y%m%d).db
```

### Como Restaurar um Backup:

```bash
docker run --rm -v valida_school_data:/data -v ${PWD}:/backup alpine cp /backup/meu_arquivo_backup.db /data/valida_school.db
```

---

## 🔒 5. Deploy com Proxy Reverso Nginx (Opcional para Redes com HTTPS)

Para implantações onde o totem da escola é acessado via Wi-Fi/Rede local e o navegador exige **HTTPS** para liberar a câmera:

Execute a composição com o proxy Nginx incluído:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Isso inicializa o **Nginx** na porta `80` (e preparado para certificados SSL na porta `443`), fazendo o roteamento automático de WebSockets e requisições HTTP para a aplicação.

---

## 🛑 6. Comandos de Manutenção

```bash
# Parar o serviço mantendo os dados preservados:
docker compose down

# Reiniciar o serviço:
docker compose restart

# Atualizar o container após alterações no código:
docker compose up -d --build
```

