// SQLite Database Engine using Node.js 22 native DatabaseSync
// Modelagem N:N (Muitos para Muitos), PIN Familiar Multialuno e Modo Van Escolar
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'valida_school.db');

// Garante que o diretório do banco de dados exista (necessário para volumes persistentes Docker)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase() {
  console.log('📦 Inicializando banco de dados SQLite central em:', DB_PATH);

  // 1. Tabela Instituições
  db.exec(`
    CREATE TABLE IF NOT EXISTS instituicoes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      unidade TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabela Alunos
  db.exec(`
    CREATE TABLE IF NOT EXISTS alunos (
      id TEXT PRIMARY KEY,
      instituicao_id TEXT DEFAULT 'inst-1',
      matricula TEXT UNIQUE NOT NULL,
      cpf TEXT,
      nome TEXT NOT NULL,
      turma TEXT NOT NULL,
      sala TEXT NOT NULL,
      turno TEXT NOT NULL,
      foto TEXT,
      bloqueio_judicial INTEGER DEFAULT 0,
      observacoes TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Tabela Responsáveis, Terceiros e Motoristas de Van (Entidade Adultos)
  db.exec(`
    CREATE TABLE IF NOT EXISTS responsaveis (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE,
      telefone TEXT NOT NULL,
      email TEXT,
      foto TEXT,
      biometria_cadastrada INTEGER DEFAULT 0,
      face_descriptor TEXT,
      is_transportador INTEGER DEFAULT 0,
      van_empresa TEXT,
      van_placa TEXT,
      van_rota TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Tabela de Autorizações de Retirada (Relação N:N com Validade e Termo Legal)
  db.exec(`
    CREATE TABLE IF NOT EXISTS autorizacoes_retirada (
      id TEXT PRIMARY KEY,
      aluno_id TEXT NOT NULL,
      responsavel_id TEXT NOT NULL,
      tipo TEXT NOT NULL, -- 'LEGAL' (titular matrícula), 'TERCEIRO' (tio, avô), 'VAN' (transportador)
      parentesco_vinculo TEXT NOT NULL,
      validade_tipo TEXT DEFAULT 'PERMANENTE', -- 'PERMANENTE', 'ANUAL', 'PONTUAL_HOJE', 'DATA_ESPECIFICA'
      validade_ate INTEGER, -- timestamp ms
      termo_assinado INTEGER DEFAULT 1,
      termo_texto TEXT,
      termo_ip_hash TEXT,
      status TEXT DEFAULT 'ATIVO', -- 'ATIVO', 'REVOGADO'
      criado_por_nome TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE,
      FOREIGN KEY (responsavel_id) REFERENCES responsaveis(id) ON DELETE CASCADE
    );
  `);

  // 5. Tabela PINs Dinâmicos (Suporte a PIN Familiar Multialuno)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pins_temporarios (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      alunos_ids TEXT NOT NULL, -- JSON array de IDs dos alunos vinculados a este PIN
      criado_por TEXT,
      criado_em INTEGER NOT NULL,
      expira_em INTEGER NOT NULL,
      usado INTEGER DEFAULT 0,
      usado_em INTEGER
    );
  `);

  // 6. Tabela Controle de Tentativas de PIN (Rate Limit / Anti-Brute-Force)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tentativas_pin (
      chave_identificador TEXT PRIMARY KEY, -- matricula, aluno_id ou codigo
      tentativas INTEGER DEFAULT 0,
      ultimo_erro_em INTEGER DEFAULT 0,
      bloqueado_ate INTEGER DEFAULT 0
    );
  `);

  // 7. Tabela Trilha de Auditoria Imutável (Logs de Saída)
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs_saida (
      id TEXT PRIMARY KEY,
      aluno_id TEXT NOT NULL,
      aluno_nome TEXT NOT NULL,
      aluno_matricula TEXT NOT NULL,
      aluno_turma TEXT,
      adulto_id TEXT,
      adulto_nome TEXT NOT NULL,
      adulto_parentesco TEXT,
      foto_capturada TEXT,
      similaridade TEXT,
      metodo TEXT NOT NULL,
      status TEXT NOT NULL,
      portao TEXT DEFAULT 'Portaria Principal',
      timestamp TEXT NOT NULL
    );
  `);

  seedData();
}

function seedData() {
  const count = db.prepare('SELECT COUNT(*) as total FROM alunos').get();
  if (count.total === 0) {
    console.log('🌱 Populando banco com estrutura N:N (Múltiplos filhos e Vans)...');

    db.prepare(`
      INSERT INTO instituicoes (id, nome, unidade)
      VALUES ('inst-1', 'Colégio Integrado Valida School', 'Unidade Central - Matriz')
    `).run();

    // 1. Cadastra Adultos (Pais, Terceiros e Motorista de Van)
    const insAdult = db.prepare(`
      INSERT INTO responsaveis (id, nome, cpf, telefone, foto, is_transportador, van_empresa, van_placa, van_rota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Mãe dos irmãos Lucas e Enzo Silva
    insAdult.run('resp-ana', 'Ana Silva Pereira', '11122233344', '(11) 98765-4321', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80', 0, null, null, null);
    // Pai dos irmãos Lucas e Enzo Silva
    insAdult.run('resp-carlos', 'Carlos Eduardo Pereira', '22233344455', '(11) 98765-1122', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80', 0, null, null, null);
    // Tio autorizado pela mãe
    insAdult.run('resp-beto', 'Roberto Mendes (Tio Beto)', '33344455566', '(11) 97654-9988', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80', 0, null, null, null);
    // Mãe da aluna Beatriz
    insAdult.run('resp-mariana', 'Mariana Martins Santos', '44455566677', '(11) 99123-4567', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80', 0, null, null, null);
    // Motorista de Van Escolar
    insAdult.run('resp-van-marcos', 'Marcos Antunes (Tio Marcos da Van)', '99988877766', '(11) 99888-7766', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=240&auto=format&fit=crop&q=80', 1, 'Tio Marcos Transporte Escolar', 'ABC-4E29', 'Rota 01 - Jardins / Centro');

    // 2. Cadastra Alunos (Irmãos Lucas e Enzo + Aluna Beatriz)
    const insStudent = db.prepare(`
      INSERT INTO alunos (id, instituicao_id, matricula, cpf, nome, turma, sala, turno, foto)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Família Silva (Filho 1 e Filho 2)
    insStudent.run('stu-1', 'inst-1', '202601', '12345678900', 'Lucas Silva Pereira', '5º Ano - Fundamental I', 'Sala 12', 'Tarde', 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=240&auto=format&fit=crop&q=80');
    insStudent.run('stu-2', 'inst-1', '202602', '12345678911', 'Enzo Silva Pereira', '1º Ano - Fundamental I', 'Sala 03', 'Tarde', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=240&auto=format&fit=crop&q=80');
    // Família Santos
    insStudent.run('stu-3', 'inst-1', '202603', '98765432100', 'Beatriz Martins Santos', '3º Ano - Fundamental I', 'Sala 08', 'Tarde', 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=240&auto=format&fit=crop&q=80');

    // 3. Cadastra Relações N:N com Autorizações e Termos
    const insAuth = db.prepare(`
      INSERT INTO autorizacoes_retirada (id, aluno_id, responsavel_id, tipo, parentesco_vinculo, validade_tipo, validade_ate, termo_assinado, status, criado_por_nome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const anoLetivoFim = Date.now() + (300 * 24 * 60 * 60 * 1000);

    // Ana Silva Pereira (Mãe) -> Vinculada a Lucas e Enzo (Responsável Legal)
    insAuth.run('auth-1', 'stu-1', 'resp-ana', 'LEGAL', 'Mãe (Responsável Legal)', 'PERMANENTE', null, 1, 'ATIVO', 'Secretaria Escolar');
    insAuth.run('auth-2', 'stu-2', 'resp-ana', 'LEGAL', 'Mãe (Responsável Legal)', 'PERMANENTE', null, 1, 'ATIVO', 'Secretaria Escolar');

    // Carlos Eduardo (Pai) -> Vinculado a Lucas e Enzo (Responsável Legal)
    insAuth.run('auth-3', 'stu-1', 'resp-carlos', 'LEGAL', 'Pai (Responsável Legal)', 'PERMANENTE', null, 1, 'ATIVO', 'Secretaria Escolar');
    insAuth.run('auth-4', 'stu-2', 'resp-carlos', 'LEGAL', 'Pai (Responsável Legal)', 'PERMANENTE', null, 1, 'ATIVO', 'Secretaria Escolar');

    // Tio Beto -> Autorizado pela Mãe para buscar Lucas e Enzo
    insAuth.run('auth-5', 'stu-1', 'resp-beto', 'TERCEIRO', 'Tio Autorizado', 'ANUAL', anoLetivoFim, 1, 'ATIVO', 'Ana Silva Pereira (Mãe)');
    insAuth.run('auth-6', 'stu-2', 'resp-beto', 'TERCEIRO', 'Tio Autorizado', 'ANUAL', anoLetivoFim, 1, 'ATIVO', 'Ana Silva Pereira (Mãe)');

    // Mariana Martins -> Mãe de Beatriz
    insAuth.run('auth-7', 'stu-3', 'resp-mariana', 'LEGAL', 'Mãe (Responsável Legal)', 'PERMANENTE', null, 1, 'ATIVO', 'Secretaria Escolar');

    // Tio Marcos da Van -> Autorizado para Lucas e Beatriz
    insAuth.run('auth-8', 'stu-1', 'resp-van-marcos', 'VAN', 'Transportador Escolar (Van)', 'ANUAL', anoLetivoFim, 1, 'ATIVO', 'Ana Silva Pereira (Mãe)');
    insAuth.run('auth-9', 'stu-3', 'resp-van-marcos', 'VAN', 'Transportador Escolar (Van)', 'ANUAL', anoLetivoFim, 1, 'ATIVO', 'Mariana Martins Santos (Mãe)');

    console.log('✅ Banco N:N populado com sucesso!');
  }
}

// Queries de Acesso e Regras de Negócio
export const studentQueries = {
  getAll() {
    const students = db.prepare('SELECT * FROM alunos ORDER BY nome ASC').all();
    return students.map(s => {
      const auths = db.prepare(`
        SELECT a.id as auth_id, a.tipo, a.parentesco_vinculo, a.validade_tipo, a.validade_ate, a.status, a.criado_por_nome,
               r.id as adult_id, r.nome, r.cpf, r.telefone, r.foto, r.biometria_cadastrada, r.face_descriptor,
               r.is_transportador, r.van_empresa, r.van_placa, r.van_rota
        FROM autorizacoes_retirada a
        JOIN responsaveis r ON a.responsavel_id = r.id
        WHERE a.aluno_id = ? AND a.status = 'ATIVO'
      `).all(s.id);

      const responsaveis = auths.map(a => ({
        id: a.adult_id,
        authId: a.auth_id,
        nome: a.nome,
        cpf: a.cpf,
        telefone: a.telefone,
        foto: a.foto,
        parentesco: a.parentesco_vinculo,
        tipo: a.tipo,
        validadeTipo: a.validade_tipo,
        validadeAte: a.validade_ate,
        isTransportador: Boolean(a.is_transportador),
        vanEmpresa: a.van_empresa,
        vanPlaca: a.van_placa,
        biometriaCadastrada: Boolean(a.biometria_cadastrada),
        faceDescriptor: a.face_descriptor ? JSON.parse(a.face_descriptor) : null
      }));

      return {
        ...s,
        bloqueioJudicial: Boolean(s.bloqueio_judicial),
        responsaveis
      };
    });
  },

  findByMatriculaOrCpf(query) {
    if (!query) return null;
    const clean = query.replace(/\D/g, '').trim();
    const students = this.getAll();
    return students.find(s => {
      const sMat = (s.matricula || '').replace(/\D/g, '');
      const sCpf = (s.cpf || '').replace(/\D/g, '');
      if (sMat === clean || sCpf === clean) return true;
      if (s.responsaveis && Array.isArray(s.responsaveis)) {
        return s.responsaveis.some(r => (r.cpf || '').replace(/\D/g, '') === clean);
      }
      return false;
    }) || null;
  },

  // Retorna todos os filhos vinculados a um responsável legal (pelo CPF ou ID)
  getStudentsByGuardian(guardianCpfOrId) {
    const clean = (guardianCpfOrId || '').replace(/\D/g, '').trim();
    const all = this.getAll();

    return all.filter(student => 
      student.responsaveis.some(r => 
        (r.id === guardianCpfOrId || (r.cpf && r.cpf.replace(/\D/g, '') === clean)) &&
        r.tipo === 'LEGAL'
      )
    );
  },

  // Cadastra terceiro autorizado com termo formal
  addThirdPartyAuthorization({ alunoIds, adulto, parentesco, validadeTipo, validadeAte, termoTexto, criadoPorNome }) {
    let adultId = adulto.id;

    // Se o adulto já existe pelo CPF, reutiliza; senão cria
    const cleanCpf = (adulto.cpf || '').replace(/\D/g, '');
    let existing = null;
    if (cleanCpf) {
      existing = db.prepare("SELECT id FROM responsaveis WHERE replace(replace(cpf, '.', ''), '-', '') = ?").get(cleanCpf);
    }

    if (existing) {
      adultId = existing.id;
    } else {
      adultId = adultId || `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(`
        INSERT INTO responsaveis (id, nome, cpf, telefone, foto, is_transportador, van_empresa, van_placa)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        adultId,
        adulto.nome,
        adulto.cpf || null,
        adulto.telefone,
        adulto.foto || null,
        adulto.isTransportador ? 1 : 0,
        adulto.vanEmpresa || null,
        adulto.vanPlaca || null
      );
    }

    // Cria as autorizações para cada um dos alunos selecionados
    const insAuth = db.prepare(`
      INSERT INTO autorizacoes_retirada (
        id, aluno_id, responsavel_id, tipo, parentesco_vinculo,
        validade_tipo, validade_ate, termo_assinado, termo_texto, status, criado_por_nome
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'ATIVO', ?)
    `);

    const createdAuthIds = [];
    for (const stuId of alunoIds) {
      const authId = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      insAuth.run(
        authId,
        stuId,
        adultId,
        adulto.isTransportador ? 'VAN' : 'TERCEIRO',
        parentesco,
        validadeTipo || 'ANUAL',
        validadeAte || null,
        termoTexto || 'Termo de autorização de retirada de menor assinado digitalmente pelo responsável legal.',
        criadoPorNome || 'Responsável Legal'
      );
      createdAuthIds.push(authId);
    }

    return { adultId, createdAuthIds };
  },

  revokeAuthorization(authId) {
    db.prepare("UPDATE autorizacoes_retirada SET status = 'REVOGADO' WHERE id = ?").run(authId);
    return { success: true, authId };
  },

  updateAdultBiometrics(studentId, adultId, photo, faceDescriptor) {
    db.prepare(`
      UPDATE responsaveis
      SET foto = ?, face_descriptor = ?, biometria_cadastrada = 1
      WHERE id = ?
    `).run(photo, JSON.stringify(faceDescriptor), adultId);

    return db.prepare('SELECT * FROM responsaveis WHERE id = ?').get(adultId);
  }
};

// PIN Familiar e Gerenciamento de Tokens
export const pinQueries = {
  createFamilyPin(alunosIds, criadoPor = 'App Responsável') {
    // Invalida PINs ativos anteriores desses alunos
    for (const stuId of alunosIds) {
      db.prepare(`
        UPDATE pins_temporarios 
        SET usado = 1 
        WHERE alunos_ids LIKE ? AND usado = 0
      `).run(`%"${stuId}"%`);
    }

    const id = `pin-${Date.now()}`;
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();
    const expiraEm = now + (15 * 60 * 1000); // 15 minutos

    db.prepare(`
      INSERT INTO pins_temporarios (id, codigo, alunos_ids, criado_por, criado_em, expira_em, usado)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, codigo, JSON.stringify(alunosIds), criadoPor, now, expiraEm);

    return {
      id,
      code: codigo,
      studentIds: alunosIds,
      createdAt: now,
      expiresAt: expiraEm,
      used: false
    };
  },

  getActivePinForStudent(studentId) {
    const now = Date.now();
    const pins = db.prepare(`
      SELECT * FROM pins_temporarios
      WHERE usado = 0 AND expira_em > ?
      ORDER BY criado_em DESC
    `).all(now);

    for (const p of pins) {
      try {
        const ids = JSON.parse(p.alunos_ids);
        if (Array.isArray(ids) && ids.includes(studentId)) {
          return {
            id: p.id,
            code: p.codigo,
            studentIds: ids,
            createdAt: p.criado_em,
            expiresAt: p.expira_em,
            used: Boolean(p.usado)
          };
        }
      } catch {}
    }
    return null;
  },

  validatePin(enteredCode, studentIdOrMatricula = null) {
    const now = Date.now();

    // 1. Busca o PIN pelo código
    const pin = db.prepare(`
      SELECT * FROM pins_temporarios
      WHERE codigo = ? AND usado = 0 AND expira_em > ?
    `).get(enteredCode, now);

    if (!pin) {
      return {
        valid: false,
        reason: 'Código PIN inválido ou expirado (limite de 15 minutos).'
      };
    }

    let alunosIds = [];
    try {
      alunosIds = JSON.parse(pin.alunos_ids);
    } catch {
      alunosIds = [];
    }

    // Se for especificado um aluno de referência, valida se ele está contemplado no PIN
    const allStudents = studentQueries.getAll();
    if (studentIdOrMatricula) {
      const targetStudent = allStudents.find(s => s.id === studentIdOrMatricula || s.matricula === studentIdOrMatricula);
      if (targetStudent && !alunosIds.includes(targetStudent.id)) {
        return {
          valid: false,
          reason: 'O código PIN informado não pertence a este aluno ou família.'
        };
      }
    }

    // Busca os dados completos de todos os alunos vinculados a este PIN
    const matchedStudents = allStudents.filter(s => alunosIds.includes(s.id));

    return {
      valid: true,
      isFamilyPin: matchedStudents.length > 1,
      studentsCount: matchedStudents.length,
      students: matchedStudents,
      pinRecord: {
        id: pin.id,
        code: pin.codigo,
        studentIds: alunosIds,
        expiresAt: pin.expira_em
      }
    };
  },

  consumePin(codigo) {
    const now = Date.now();
    db.prepare('UPDATE pins_temporarios SET usado = 1, usado_em = ? WHERE codigo = ?').run(now, codigo);
  }
};

// Módulo de Transporte Escolar / Van
export const vanQueries = {
  // Lista todos os alunos vinculados à rota de um motorista de van
  getVanRoster(driverCpfOrId) {
    const clean = (driverCpfOrId || '').replace(/\D/g, '').trim();

    const driver = db.prepare(`
      SELECT * FROM responsaveis
      WHERE (id = ? OR replace(replace(cpf, '.', ''), '-', '') = ?) AND is_transportador = 1
    `).get(driverCpfOrId, clean);

    if (!driver) return null;

    const allStudents = studentQueries.getAll();
    const authorizedStudents = allStudents.filter(s => 
      s.responsaveis.some(r => r.id === driver.id && r.tipo === 'VAN')
    );

    return {
      driver: {
        id: driver.id,
        nome: driver.nome,
        empresa: driver.van_empresa,
        placa: driver.van_placa,
        rota: driver.van_rota,
        foto: driver.foto,
        biometriaCadastrada: Boolean(driver.biometria_cadastrada),
        faceDescriptor: driver.face_descriptor ? JSON.parse(driver.face_descriptor) : null
      },
      students: authorizedStudents
    };
  },

  // Registra a liberação em lote das crianças que embarcaram na van com 1 biometria
  registerBatchRelease(driverId, studentIds, photoUrl, portao = 'Portaria Principal') {
    const driver = db.prepare('SELECT * FROM responsaveis WHERE id = ?').get(driverId);
    if (!driver) throw new Error('Motorista não localizado');

    const allStudents = studentQueries.getAll();
    const logs = [];

    for (const stuId of studentIds) {
      const student = allStudents.find(s => s.id === stuId);
      if (!student) continue;

      const log = logQueries.record({
        studentId: student.id,
        alunoNome: student.nome,
        alunoMatricula: student.matricula,
        alunoTurma: student.turma,
        adultoId: driver.id,
        adultoNome: `${driver.nome} (${driver.van_empresa || 'Van Escolar'})`,
        adultoParentesco: `Transporte Escolar • Placa ${driver.van_placa || 'N/A'}`,
        fotoCapturadaAoVivo: photoUrl,
        similaridadeBiometrica: '100% (Modo Van Homologado)',
        metodo: 'Transporte Escolar em Lote (Biometria Única de Condutor)',
        status: 'LIBERADO',
        portao
      });

      logs.push(log);
    }

    return logs;
  }
};

export const logQueries = {
  getAll(limit = 100) {
    return db.prepare('SELECT * FROM logs_saida ORDER BY timestamp DESC LIMIT ?').all(limit).map(l => ({
      id: l.id,
      studentId: l.aluno_id,
      alunoNome: l.aluno_nome,
      alunoMatricula: l.aluno_matricula,
      alunoTurma: l.aluno_turma,
      adultoId: l.adulto_id,
      adultoNome: l.adulto_nome,
      adultoParentesco: l.adulto_parentesco,
      fotoCapturadaAoVivo: l.foto_capturada,
      similaridadeBiometrica: l.similaridade,
      metodo: l.metodo,
      status: l.status,
      portao: l.portao,
      timestamp: l.timestamp
    }));
  },

  record(log) {
    const id = log.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timestamp = log.timestamp || new Date().toISOString();

    db.prepare(`
      INSERT INTO logs_saida (
        id, aluno_id, aluno_nome, aluno_matricula, aluno_turma,
        adulto_id, adulto_nome, adulto_parentesco, foto_capturada,
        similaridade, metodo, status, portao, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      log.studentId || 'N/A',
      log.alunoNome,
      log.alunoMatricula || 'N/A',
      log.alunoTurma || '',
      log.adultoId || null,
      log.adultoNome,
      log.adultoParentesco || '',
      log.fotoCapturadaAoVivo || null,
      log.similaridadeBiometrica || 'N/A',
      log.metodo,
      log.status || 'LIBERADO',
      log.portao || 'Portaria Principal',
      timestamp
    );

    return { id, timestamp, ...log };
  }
};
