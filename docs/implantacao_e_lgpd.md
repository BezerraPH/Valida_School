# Manual de Implantação Escolar e Conformidade LGPD — Valida School

> **Documento Oficial de Engenharia e Compliance Jurídico**  
> Destinado a diretores escolares, gestores de TI e assessoria jurídica para implantação em escolas e creches.

---

## 1. Termo de Consentimento para Tratamento de Dados Biométricos de Crianças e Adolescentes (LGPD)

> **Fundamentação Legal:** Art. 14, § 1º e Art. 5º, inciso II da Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD).

### Minuta de Consentimento (Pronta para Inclusão no Contrato de Matrícula)

```
TERMO DE CONSENTIMENTO ESPECÍFICO E DESTACADO PARA TRATAMENTO DE DADOS BIOMÉTRICOS DE MENOR

Pelo presente instrumento, eu, [NOME COMPLETO DO RESPONSÁVEL LEGAL], portador(a) do CPF nº [CPF], na qualidade de responsável legal pelo(a) menor [NOME COMPLETO DO ALUNO], matriculado(a) sob o nº [MATRÍCULA], MANIFESTO MEU CONSENTIMENTO LIVRE, INFORMADO E INEQUÍVOCO para que o [NOME DA INSTITUIÇÃO DE ENSINO], em parceria tecnológica com a plataforma Valida School, colete, processe e armazene dados biométricos faciais (representação vetorial matemática de 128 pontos) do(a) menor e dos adultos por mim formalmente autorizados a realizar sua retirada das dependências escolares.

1. FINALIDADE ESPECÍFICA:
O tratamento dos dados biométricos e registros fotográficos destina-se EXCLUSIVAMENTE a:
a) Assegurar a integridade física e o controle rigoroso de acesso e saída do(a) menor;
b) Validar a identidade dos responsáveis autorizados no portão escolar por dupla autenticação (PIN dinâmico temporário + conferência biométrica facial com prova de vida);
c) Registrar trilha de auditoria eletrônica imutável com data, hora e foto comprobatória da entrega do aluno;
d) Emitir notificações instantâneas no WhatsApp/celular dos pais quando da liberação do aluno.

2. SEGURANÇA E NÃO COMPARTILHAMENTO:
A instituição compromete-se a:
a) Não comercializar, alugar ou transferir os dados biométricos a quaisquer terceiros para fins de marketing, perfilamento comercial ou publicidade;
b) Criptografar em repouso e em trânsito (AES-256 / TLS 1.3) todos os descritores biométricos;
c) Restringir o acesso aos registros apenas aos funcionários e inspetores devidamente autorizados e vinculados a termos de sigilo profissional.

3. PRAZO DE RETENÇÃO E REVOGAÇÃO:
O consentimento poderá ser revogado a qualquer momento pelo responsável legal mediante solicitação formal por escrito à secretaria da escola. Em caso de transferência ou conclusão do ciclo escolar, os dados biométricos serão excluídos definitivamente em até 30 (trinta) dias após a rescisão contratual.

Local e Data: ____________________, _____ de ________________ de 20____.

_____________________________________________________________
Assinatura do Responsável Legal (Mãe / Pai / Guardião)
```

---

## 2. Especificação do Kit de Hardware Homologado

Para garantir velocidade de reconhecimento (< 1 segundo por aluno) e durabilidade na portaria:

### A. Terminal Totem da Portaria (Quiosque)
* **Processador:** Mini PC com arquitetura x86 moderna (recomendado: Intel N100 / N95 de 4 núcleos, 3.4 GHz, baixo consumo de 6W).
* **Memória RAM:** 8 GB DDR4 / DDR5 (permite execução suave das redes neurais de visão computacional em segundo plano).
* **Armazenamento:** 128 GB SSD NVMe (espaço para banco de dados SQLite/PostgreSQL e logs de fotos por até 2 anos).
* **Display / Monitor:** Tela Touchscreen capacitiva de 15,6" a 21,5" Full HD (1920x1080), preferencialmente com acabamento anti-reflexo para portarias iluminadas pelo sol.
* **Câmera:** Câmera Full HD (1080p a 30fps) com lente grande angular (90° a 110° FOV), controle automático de ganho (AGC) e compensação de contraluz (WDR), permitindo enquadrar adultos de 1,50m a 2,00m sem necessidade de ajuste mecânico.
* **Gabinete:** Totem de pedestal em aço carbono com pintura eletrostática, fechadura com chave e furação VESA padrão.

### B. Painel de Chamada nas Salas de Aula / Pátio
* **Equipamento:** Qualquer Smart TV comum conectada à rede Wi-Fi da escola ou monitor acoplado a um TV Box (Chromecast, Google TV, Xiaomi Mi Box ou Raspberry Pi 4/5).
* **Como rodar:** Basta abrir o navegador e acessar a URL dedicada da escola: `http://servidor-local:3001/chamada` (ou domínio em nuvem) e pressionar o botão **"Tela Cheia TV"**.

---

## 3. Guia Operacional para Porteiros e Professores

| Cenário | O que fazer? |
| :--- | :--- |
| **Fluxo Normal de Saída** | O adulto chega ao totem, digita a matrícula/CPF do aluno, insere o PIN de 6 dígitos gerado pelo pai no celular, olha para a câmera e pisca. O sistema aprova, toca o sino na sala de aula e envia comprovante no WhatsApp dos pais. |
| **Tentativas de PIN Incorreto** | Se o adulto errar o PIN 3 vezes, o totem bloqueia temporariamente aquele aluno por 5 minutos e envia um **Alerta de Segurança imediato** no WhatsApp dos pais. O porteiro deve pedir um documento oficial com foto e consultar o painel da escola (`/escola`). |
| **Queda Temporária de Internet** | O Totem opera com **Cache Offline-First**. Ele continua validando PINs e biometrias em memória local e grava os logs de auditoria no SQLite local. Assim que o Wi-Fi voltar, todos os registros são sincronizados com a nuvem automaticamente. |
| **Liberação de Emergência / Falta de Energia** | O inspetor acessa o painel `/escola` no celular/tablet 4G e clica em **"Liberação Manual de Contingência"**, seleciona o aluno, digita o motivo e o nome do adulto, e o sistema registra a custódia. |
