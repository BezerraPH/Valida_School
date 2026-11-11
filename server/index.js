// Valida School Central API Server & Real-time WebSocket Hub
// Suporte a Relações N:N, PIN Familiar Multialuno, Termos Legais e Vans Escolares
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, studentQueries, pinQueries, logQueries, vanQueries, dailyCodeQueries } from './database.js';
import { WhatsappService } from './whatsappService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '15mb' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`🔌 Cliente WebSocket conectado. Total ativos: ${clients.size}`);

  ws.send(JSON.stringify({
    type: 'CONECTADO',
    payload: { message: 'Conectado ao Hub em Tempo Real Valida School' }
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`🔌 Cliente desconectado. Total ativos: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.warn('Erro na conexão WebSocket:', err);
    clients.delete(ws);
  });
});

export function broadcastEvent(type, payload) {
  const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        console.warn('Falha ao enviar evento via WebSocket:', err);
      }
    }
  }
}

// ==========================================
// ROTAS REST DA API
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'Valida School API', timestamp: new Date().toISOString() });
});

// 1. Listar todos os alunos com autorizações N:N
app.get('/api/alunos', (req, res) => {
  try {
    const students = studentQueries.getAll();
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar alunos', details: err.message });
  }
});

// 2. Buscar aluno por matrícula ou CPF (Usado no Totem)
app.get('/api/alunos/buscar', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Parâmetro q é obrigatório' });

    const student = studentQueries.findByMatriculaOrCpf(q);
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });

    res.json(student);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar aluno', details: err.message });
  }
});

// 2b. Cadastrar Novo Aluno e Responsável Inicial (Exclusivo Escola)
app.post('/api/alunos', (req, res) => {
  try {
    const studentData = req.body;
    if (!studentData || !studentData.nome || !studentData.matricula) {
      return res.status(400).json({ error: 'Nome e matrícula do aluno são obrigatórios' });
    }
    const created = studentQueries.createStudent(studentData);
    broadcastEvent('NOVO_ALUNO', created);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar aluno', details: err.message });
  }
});

// 2c. Editar Dados do Aluno (Exclusivo Escola)
app.put('/api/alunos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = studentQueries.updateStudent(id, req.body);
    broadcastEvent('ALUNO_ATUALIZADO', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar aluno', details: err.message });
  }
});

// 2d. Excluir Aluno (Exclusivo Escola)
app.delete('/api/alunos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = studentQueries.deleteStudent(id);
    broadcastEvent('ALUNO_REMOVIDO', { id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir aluno', details: err.message });
  }
});

// 3. Obter todos os filhos de um responsável legal (Ponto 3: 1 pai -> N filhos)
app.get('/api/responsaveis/:guardianId/filhos', (req, res) => {
  try {
    const { guardianId } = req.params;
    const children = studentQueries.getStudentsByGuardian(guardianId);
    res.json(children);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar filhos do responsável', details: err.message });
  }
});

// 3b. Atualizar Biometria Facial de um Responsável / Autorizado
app.post('/api/responsaveis/biometria', (req, res) => {
  try {
    const { studentId, adultId, photo, faceDescriptor } = req.body;
    if (!adultId || !faceDescriptor) {
      return res.status(400).json({ error: 'adultId e faceDescriptor são obrigatórios' });
    }
    const updated = studentQueries.updateAdultBiometrics(studentId, adultId, photo, faceDescriptor);
    broadcastEvent('BIOMETRIA_ATUALIZADA', { studentId, adultId });
    res.json({ success: true, adult: updated });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar biometria', details: err.message });
  }
});

// 3c. Editar Perfil Simples do Responsável (Foto, Telefone, E-mail - bloqueia CPF/Matrícula/Filhos)
app.put('/api/responsaveis/:id/perfil', (req, res) => {
  try {
    const { id } = req.params;
    const updated = studentQueries.updateGuardianProfile(id, req.body);
    broadcastEvent('PERFIL_ATUALIZADO', { adultId: id });
    res.json({ success: true, adult: updated });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar perfil do responsável', details: err.message });
  }
});

// 4. Cadastrar Terceiro com Termo de Autorização Eletrônico (Ponto 5 e 6)
app.post('/api/autorizacoes/terceiro', (req, res) => {
  try {
    const { alunoIds, adulto, parentesco, validadeTipo, validadeAte, termoTexto, criadoPorNome } = req.body;
    if (!alunoIds || !alunoIds.length || !adulto || !adulto.nome) {
      return res.status(400).json({ error: 'Dados incompletos para autorização de terceiro' });
    }

    const result = studentQueries.addThirdPartyAuthorization({
      alunoIds,
      adulto,
      parentesco,
      validadeTipo,
      validadeAte,
      termoTexto,
      criadoPorNome
    });

    broadcastEvent('AUTORIZACAO_CRIADA', result);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar autorização', details: err.message });
  }
});

// 4b. Editar Autorização de Terceiro/Van existente
app.put('/api/autorizacoes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = studentQueries.updateThirdPartyAuthorization(id, req.body);
    broadcastEvent('AUTORIZACAO_ATUALIZADA', result);
    res.json(result);
  } catch (err) {
    res.status(403).json({ error: err.message || 'Erro ao editar autorização' });
  }
});

// 5. Revogar ou Excluir Permanentemente Autorização de Terceiro (Ponto 6)
app.delete('/api/autorizacoes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const permanent = req.query.permanent === 'true';
    const result = studentQueries.revokeAuthorization(id, permanent);
    broadcastEvent('AUTORIZACAO_REVOGADA', { authId: id, permanent });
    res.json(result);
  } catch (err) {
    res.status(403).json({ error: err.message || 'Erro ao revogar/excluir autorização' });
  }
});

// 6. Gerar PIN Individual ou Familiar Unificado (Ponto 9: 1 PIN para múltiplos filhos)
app.post('/api/pins/gerar', (req, res) => {
  try {
    const { studentId, criadoPor, code } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId é obrigatório' });
    }
    const pin = pinQueries.createFamilyPin([studentId], criadoPor || 'App Responsável', code);
    broadcastEvent('PIN_GERADO', pin);
    res.status(201).json(pin);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar PIN', details: err.message });
  }
});

app.post('/api/pins/gerar-familiar', (req, res) => {
  try {
    const { studentIds, criadoPor, code } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds deve ser um array com pelo menos 1 ID de aluno' });
    }

    const pin = pinQueries.createFamilyPin(studentIds, criadoPor || 'App Responsável', code);
    broadcastEvent('PIN_GERADO', pin);
    res.status(201).json(pin);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar PIN Familiar', details: err.message });
  }
});

// 7. Consultar PIN Ativo de um Aluno / Família
app.get('/api/pins/ativo/:studentId', (req, res) => {
  try {
    const { studentId } = req.params;
    const active = pinQueries.getActivePinForStudent(studentId);
    res.json(active || { active: false });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar PIN ativo', details: err.message });
  }
});

// 8. Validar PIN no Totem (Suporte automático a PIN Familiar Multialuno)
app.post('/api/pins/validar', (req, res) => {
  try {
    const { code, studentIdOrMatricula } = req.body;
    if (!code) return res.status(400).json({ error: 'Código PIN é obrigatório' });

    const validation = pinQueries.validatePin(code, studentIdOrMatricula);
    res.json(validation);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao validar PIN', details: err.message });
  }
});

// 9. Registrar Saída de Aluno Individual ou Família
app.post('/api/saidas/registrar', (req, res) => {
  try {
    const { code, logData, batchLogs } = req.body;

    if (code) {
      pinQueries.consumePin(code);
    }

    const logsToSave = batchLogs && Array.isArray(batchLogs) ? batchLogs : [logData];
    const savedLogs = [];

    for (const item of logsToSave) {
      if (!item) continue;
      const logEntry = logQueries.record(item);
      savedLogs.push(logEntry);

      const isDeniedOrBlocked = logEntry.status === 'NEGADO' || logEntry.status === 'BLOQUEADO';

      if (isDeniedOrBlocked) {
        broadcastEvent('ALERTA_SEGURANCA', logEntry);
        continue;
      }

      // Notifica em tempo real (TV e App) apenas para liberações confirmadas
      broadcastEvent('ALUNO_LIBERADO', logEntry);

      // Dispara WhatsApp para a família
      const allStudents = studentQueries.getAll();
      const student = allStudents.find(s => s.id === logEntry.studentId);
      if (student && Array.isArray(student.responsaveis)) {
        for (const resp of student.responsaveis) {
          if (resp.telefone && resp.tipo === 'LEGAL') {
            WhatsappService.notificarSaidaLiberada({
              telefone: resp.telefone,
              alunoNome: logEntry.alunoNome,
              adultoNome: logEntry.adultoNome,
              parentesco: logEntry.adultoParentesco,
              portao: logEntry.portao,
              timestamp: logEntry.timestamp,
              fotoUrl: logEntry.fotoCapturadaAoVivo
            }).catch(e => console.warn('Erro ao enviar WhatsApp:', e));
          }
        }
      }
    }

    res.status(201).json({ success: true, logs: savedLogs });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar saída', details: err.message });
  }
});

// ==========================================
// ROTAS DO MÓDULO TRANSPORTE ESCOLAR / VAN (Ponto 8)
// ==========================================

// 10. Consultar Rota de Alunos da Van Escolar
app.get('/api/vans/rota/:driverCpfOrId', (req, res) => {
  try {
    const { driverCpfOrId } = req.params;
    const roster = vanQueries.getVanRoster(driverCpfOrId);

    if (!roster) {
      return res.status(404).json({ error: 'Motorista de van não encontrado ou não homologado' });
    }

    res.json(roster);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter rota da van', details: err.message });
  }
});

// 11. Liberar Lote de Alunos da Van Escolar com 1 Biometria
app.post('/api/vans/liberar-lote', (req, res) => {
  try {
    const { driverId, studentIds, photoUrl, portao } = req.body;
    if (!driverId || !studentIds || !studentIds.length) {
      return res.status(400).json({ error: 'driverId e lista de studentIds são obrigatórios' });
    }

    const releasedLogs = vanQueries.registerBatchRelease(driverId, studentIds, photoUrl, portao);

    // Emite evento consolidado de lote para as TVs das salas de aula
    const allStudentsList = studentQueries.getAll();
    const studentsInBatch = allStudentsList.filter(s => studentIds.includes(s.id));
    const firstLog = releasedLogs[0];

    broadcastEvent('VAN_LOTE_LIBERADO', {
      driver: {
        id: driverId,
        nome: firstLog?.adultoNome || 'Motorista de Van',
        vanEmpresa: firstLog?.adultoNome?.split('(')[1]?.replace(')', '') || 'Transporte Escolar'
      },
      count: releasedLogs.length,
      studentIds,
      students: studentsInBatch
    });

    // Emite evento em tempo real para as TVs de todas as salas
    for (const log of releasedLogs) {
      broadcastEvent('ALUNO_LIBERADO', log);

      // Dispara comprovante no WhatsApp dos pais de cada criança da van
      const allStudents = studentQueries.getAll();
      const student = allStudents.find(s => s.id === log.studentId);
      if (student && Array.isArray(student.responsaveis)) {
        for (const resp of student.responsaveis) {
          if (resp.telefone && resp.tipo === 'LEGAL') {
            WhatsappService.notificarSaidaLiberada({
              telefone: resp.telefone,
              alunoNome: log.alunoNome,
              adultoNome: log.adultoNome,
              parentesco: log.adultoParentesco,
              portao: log.portao,
              timestamp: log.timestamp,
              fotoUrl: log.fotoCapturadaAoVivo
            }).catch(e => console.warn('Erro ao enviar WhatsApp:', e));
          }
        }
      }
    }

    res.status(201).json({ success: true, count: releasedLogs.length, logs: releasedLogs });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao liberar lote de van', details: err.message });
  }
});

// 12. Listar Logs de Auditoria
app.get('/api/logs', (req, res) => {
  try {
    const logs = logQueries.getAll();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter logs', details: err.message });
  }
});

// ==========================================
// CÓDIGO SECRETO DIÁRIO (LIBERAÇÃO ADMINISTRATIVA)
// ==========================================

// 13. Consultar Código Secreto do Dia (Painel da Coordenação / Admin)
app.get('/api/admin/codigo-diario', (req, res) => {
  try {
    const codeInfo = dailyCodeQueries.getOrCreateToday();
    res.json(codeInfo);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao consultar código secreto diário', details: err.message });
  }
});

// 14. Rotacionar / Gerar Novo Código Secreto Hoje (Painel da Coordenação / Admin)
app.post('/api/admin/codigo-diario/rotacionar', (req, res) => {
  try {
    const codeInfo = dailyCodeQueries.rotateToday();
    broadcastEvent('CODIGO_DIARIO_ATUALIZADO', { dataDia: codeInfo.dataDia, rotacoes: codeInfo.rotacoes });
    res.json(codeInfo);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao rotacionar código secreto diário', details: err.message });
  }
});

// 15. Validar Código Secreto Diário no Totem para Liberação sem PIN e sem Biometria
app.post('/api/admin/validar-codigo-diario', (req, res) => {
  try {
    const { code, studentId, funcionarioNome, motivo } = req.body;
    if (!code || !studentId) {
      return res.status(400).json({ valid: false, reason: 'Código diário e aluno são obrigatórios.' });
    }

    const check = dailyCodeQueries.validateCode(code);
    if (!check.valid) {
      return res.status(401).json({ valid: false, reason: 'Código Secreto Diário inválido ou expirado.' });
    }

    const allStudents = studentQueries.getAll();
    const student = allStudents.find(s => s.id === studentId || s.matricula === studentId);
    if (!student) {
      return res.status(404).json({ valid: false, reason: 'Aluno não localizado para liberação administrativa.' });
    }

    const operador = (funcionarioNome || '').trim() || 'Funcionário Autorizado da Escola';
    const justificativa = (motivo || '').trim() || 'Liberação direta sem PIN/Biometria via Código Secreto Diário';

    const logEntry = logQueries.record({
      studentId: student.id,
      alunoNome: student.nome,
      alunoMatricula: student.matricula,
      alunoTurma: student.turma,
      adultoId: 'admin-override',
      adultoNome: operador,
      adultoParentesco: 'Funcionário / Código Secreto Diário',
      fotoCapturadaAoVivo: student.foto || null,
      similaridadeBiometrica: 'Bypass Autorizado (Código Diário)',
      metodo: `Código Secreto Diário: ${justificativa}`,
      status: 'LIBERADO',
      portao: 'Portaria Principal'
    });

    broadcastEvent('ALUNO_LIBERADO', logEntry);

    if (Array.isArray(student.responsaveis)) {
      for (const resp of student.responsaveis) {
        if (resp.telefone && resp.tipo === 'LEGAL') {
          WhatsappService.notificarSaidaLiberada({
            telefone: resp.telefone,
            alunoNome: logEntry.alunoNome,
            adultoNome: logEntry.adultoNome,
            parentesco: logEntry.adultoParentesco,
            portao: logEntry.portao,
            timestamp: logEntry.timestamp,
            fotoUrl: logEntry.fotoCapturadaAoVivo
          }).catch(e => console.warn('Erro ao enviar WhatsApp:', e));
        }
      }
    }

    res.json({ valid: true, student, log: logEntry });
  } catch (err) {
    res.status(500).json({ valid: false, reason: 'Erro interno ao validar código diário.', details: err.message });
  }
});

// ==========================================
// SERVIÇO DE FRONTEND ESTÁTICO (PRODUÇÃO / CONTAINER)
// ==========================================
if (fs.existsSync(distPath)) {
  console.log(`📦 Modo Produção / Container: Servindo frontend compilado de ${distPath}`);
  app.use(express.static(distPath));

  // SPA fallback universal (compatível com Express 4 e Express 5)
  app.use((req, res, next) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Inicia Servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor Valida School API rodando em: http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Hub ativo na mesma porta ws://localhost:${PORT}`);
});
