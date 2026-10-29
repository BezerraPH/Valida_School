// LocalStorage Database & State Manager with Central Server Sync (Valida School)
import { 
  initWebSocket, fetchStudentsFromApi, createStudentApi, 
  updateBiometricsApi, generatePinApi, generateFamilyPinApi,
  revokeAuthorizationApi, registerExitApi, fetchLogsFromApi 
} from './apiService';

const STORAGE_KEY_STUDENTS = 'valida_school_students';
const STORAGE_KEY_PINS = 'valida_school_pins';
const STORAGE_KEY_LOGS = 'valida_school_logs';

// Initial Mock Seed Data com múltiplos irmãos (Família Silva) e Van Escolar
const INITIAL_STUDENTS = [
  {
    id: 'stu-1',
    matricula: '202601',
    cpf: '12345678900',
    nome: 'Lucas Silva Pereira',
    turma: '5º Ano - Fundamental I',
    sala: 'Sala 12',
    turno: 'Tarde',
    foto: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=240&auto=format&fit=crop&q=80',
    responsaveis: [
      {
        id: 'resp-ana',
        authId: 'auth-1',
        nome: 'Ana Silva Pereira',
        parentesco: 'Mãe (Responsável Legal)',
        telefone: '(11) 98765-4321',
        cpf: '11122233344',
        foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
        tipo: 'LEGAL',
        status: 'ATIVO',
        validadeTipo: 'PERMANENTE',
        biometriaCadastrada: true,
        faceDescriptor: null
      },
      {
        id: 'resp-carlos',
        authId: 'auth-3',
        nome: 'Carlos Eduardo Pereira',
        parentesco: 'Pai (Responsável Legal)',
        telefone: '(11) 98765-1122',
        cpf: '22233344455',
        foto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80',
        tipo: 'LEGAL',
        status: 'ATIVO',
        validadeTipo: 'PERMANENTE',
        biometriaCadastrada: true,
        faceDescriptor: null
      },
      {
        id: 'resp-beto',
        authId: 'auth-5',
        nome: 'Roberto Mendes (Tio Beto)',
        parentesco: 'Tio Autorizado',
        telefone: '(11) 97654-9988',
        cpf: '33344455566',
        foto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80',
        tipo: 'TERCEIRO',
        status: 'ATIVO',
        validadeTipo: 'ANUAL',
        biometriaCadastrada: true,
        faceDescriptor: null
      },
      {
        id: 'resp-van-marcos',
        authId: 'auth-8',
        nome: 'Marcos Oliveira (Tio Marcos)',
        parentesco: 'Transportador Escolar (Van)',
        telefone: '(11) 96655-4433',
        cpf: '99988877766',
        foto: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=240&auto=format&fit=crop&q=80',
        tipo: 'VAN',
        status: 'ATIVO',
        validadeTipo: 'ANUAL',
        isTransportador: true,
        vanEmpresa: 'Tio Marcos Transporte Escolar',
        vanPlaca: 'BRA2E19',
        biometriaCadastrada: true,
        faceDescriptor: null
      }
    ]
  },
  {
    id: 'stu-2',
    matricula: '202602',
    cpf: '12345678901',
    nome: 'Enzo Silva Pereira',
    turma: '1º Ano - Fundamental I',
    sala: 'Sala 02',
    turno: 'Tarde',
    foto: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=240&auto=format&fit=crop&q=80',
    responsaveis: [
      {
        id: 'resp-ana',
        authId: 'auth-2',
        nome: 'Ana Silva Pereira',
        parentesco: 'Mãe (Responsável Legal)',
        telefone: '(11) 98765-4321',
        cpf: '11122233344',
        foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
        tipo: 'LEGAL',
        status: 'ATIVO',
        validadeTipo: 'PERMANENTE',
        biometriaCadastrada: true,
        faceDescriptor: null
      },
      {
        id: 'resp-carlos',
        authId: 'auth-4',
        nome: 'Carlos Eduardo Pereira',
        parentesco: 'Pai (Responsável Legal)',
        telefone: '(11) 98765-1122',
        cpf: '22233344455',
        foto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80',
        tipo: 'LEGAL',
        status: 'ATIVO',
        validadeTipo: 'PERMANENTE',
        biometriaCadastrada: true,
        faceDescriptor: null
      },
      {
        id: 'resp-beto',
        authId: 'auth-6',
        nome: 'Roberto Mendes (Tio Beto)',
        parentesco: 'Tio Autorizado',
        telefone: '(11) 97654-9988',
        cpf: '33344455566',
        foto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80',
        tipo: 'TERCEIRO',
        status: 'ATIVO',
        validadeTipo: 'ANUAL',
        biometriaCadastrada: true,
        faceDescriptor: null
      }
    ]
  },
  {
    id: 'stu-3',
    matricula: '202603',
    cpf: '98765432100',
    nome: 'Beatriz Martins Santos',
    turma: '3º Ano - Fundamental I',
    sala: 'Sala 08',
    turno: 'Tarde',
    foto: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=240&auto=format&fit=crop&q=80',
    responsaveis: [
      {
        id: 'resp-mariana',
        authId: 'auth-7',
        nome: 'Mariana Martins Santos',
        parentesco: 'Mãe (Responsável Legal)',
        telefone: '(11) 99123-4567',
        cpf: '44455566677',
        foto: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80',
        tipo: 'LEGAL',
        status: 'ATIVO',
        validadeTipo: 'PERMANENTE',
        biometriaCadastrada: true,
        faceDescriptor: null
      },
      {
        id: 'resp-van-marcos',
        authId: 'auth-9',
        nome: 'Marcos Oliveira (Tio Marcos)',
        parentesco: 'Transportador Escolar (Van)',
        telefone: '(11) 96655-4433',
        cpf: '99988877766',
        foto: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=240&auto=format&fit=crop&q=80',
        tipo: 'VAN',
        status: 'ATIVO',
        validadeTipo: 'ANUAL',
        isTransportador: true,
        vanEmpresa: 'Tio Marcos Transporte Escolar',
        vanPlaca: 'BRA2E19',
        biometriaCadastrada: true,
        faceDescriptor: null
      }
    ]
  }
];

export function getStudents() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_STUDENTS);
    if (!data) {
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(INITIAL_STUDENTS));
      return INITIAL_STUDENTS;
    }
    return JSON.parse(data);
  } catch {
    return INITIAL_STUDENTS;
  }
}

export function saveStudents(students) {
  localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(students));
  notifyStorageChange();
}

export function addStudent(newStudent) {
  const students = getStudents();
  students.push(newStudent);
  saveStudents(students);
  createStudentApi(newStudent).catch(() => {});
  return newStudent;
}

export function findStudentByMatriculaOrCpf(query) {
  if (!query) return null;
  const clean = query.replace(/\D/g, '').trim();
  const students = getStudents();
  return students.find(s => {
    const sMatricula = (s.matricula || '').replace(/\D/g, '');
    const sCpf = (s.cpf || '').replace(/\D/g, '');
    if (sMatricula === clean || sCpf === clean) return true;
    if (s.responsaveis && Array.isArray(s.responsaveis)) {
      return s.responsaveis.some(r => (r.cpf || '').replace(/\D/g, '') === clean);
    }
    return false;
  }) || null;
}

export function addAuthorizedAdult(studentId, adultData) {
  const students = getStudents();
  const student = students.find(s => s.id === studentId);
  if (!student) return null;

  student.responsaveis.push(adultData);
  saveStudents(students);
  return student;
}

export function updateAdultBiometrics(studentId, adultId, photo, faceDescriptor) {
  const students = getStudents();
  const student = students.find(s => s.id === studentId);
  if (!student) return null;

  const adult = student.responsaveis.find(r => r.id === adultId);
  if (adult) {
    adult.foto = photo;
    adult.faceDescriptor = faceDescriptor;
    adult.biometriaCadastrada = true;
    saveStudents(students);
    updateBiometricsApi(studentId, adultId, photo, faceDescriptor).catch(() => {});
    return adult;
  }
  return null;
}

// PIN MANAGEMENT (15 minutes expiration)
const PIN_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes

export function generatePinForStudent(studentId) {
  return generateFamilyPin([studentId], 'App Responsável');
}

export function generateFamilyPin(studentIds, criadoPor = 'App Responsável') {
  const pins = getPins();
  // Limpa PINs anteriores de qualquer um desses alunos
  const filtered = pins.filter(p => {
    if (studentIds.includes(p.studentId)) return false;
    if (p.studentIds && p.studentIds.some(id => studentIds.includes(id))) return false;
    return true;
  });

  // Gera PIN único de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();
  const expiresAt = now + PIN_VALIDITY_MS;

  const newPin = {
    code,
    studentId: studentIds[0],
    studentIds,
    isFamilyPin: studentIds.length > 1,
    criadoPor,
    createdAt: now,
    expiresAt,
    used: false
  };

  filtered.push(newPin);
  localStorage.setItem(STORAGE_KEY_PINS, JSON.stringify(filtered));
  notifyStorageChange();

  // Propaga geração para o servidor central e WebSockets
  if (studentIds.length > 1) {
    generateFamilyPinApi(studentIds, criadoPor).catch(() => {});
  } else {
    generatePinApi(studentIds[0], criadoPor).catch(() => {});
  }

  return newPin;
}

export function getActivePinForStudent(studentId) {
  const pins = getPins();
  const now = Date.now();
  return pins.find(p => 
    (p.studentId === studentId || (p.studentIds && p.studentIds.includes(studentId))) && 
    !p.used && 
    p.expiresAt > now
  ) || null;
}

export function revokeAuthorizationLocal(authId) {
  const students = getStudents();
  let modified = false;

  for (const s of students) {
    if (s.responsaveis) {
      const idx = s.responsaveis.findIndex(r => r.authId === authId || r.id === authId);
      if (idx !== -1) {
        s.responsaveis[idx].status = 'REVOGADO';
        modified = true;
      }
    }
  }

  if (modified) {
    saveStudents(students);
  }
  revokeAuthorizationApi(authId).catch(() => {});
}

const STORAGE_KEY_ATTEMPTS = 'valida_school_pin_attempts';
const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutos de bloqueio preventivo

export function getPinLockoutStatus(studentId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ATTEMPTS);
    const attemptsMap = raw ? JSON.parse(raw) : {};
    const record = attemptsMap[studentId];

    if (!record) return { locked: false, remainingAttempts: MAX_PIN_ATTEMPTS };

    const now = Date.now();
    if (record.attempts >= MAX_PIN_ATTEMPTS) {
      const elapsed = now - record.lastAttemptAt;
      if (elapsed < LOCKOUT_MS) {
        const remainingSeconds = Math.ceil((LOCKOUT_MS - elapsed) / 1000);
        return { locked: true, remainingSeconds, attempts: record.attempts };
      } else {
        // Tempo expirado, reinicia
        delete attemptsMap[studentId];
        localStorage.setItem(STORAGE_KEY_ATTEMPTS, JSON.stringify(attemptsMap));
        return { locked: false, remainingAttempts: MAX_PIN_ATTEMPTS };
      }
    }

    return { 
      locked: false, 
      remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - record.attempts) 
    };
  } catch {
    return { locked: false, remainingAttempts: MAX_PIN_ATTEMPTS };
  }
}

export function recordFailedPinAttempt(studentId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ATTEMPTS);
    const attemptsMap = raw ? JSON.parse(raw) : {};
    const current = attemptsMap[studentId] || { attempts: 0, lastAttemptAt: 0 };

    current.attempts += 1;
    current.lastAttemptAt = Date.now();
    attemptsMap[studentId] = current;
    localStorage.setItem(STORAGE_KEY_ATTEMPTS, JSON.stringify(attemptsMap));

    const remainingAttempts = Math.max(0, MAX_PIN_ATTEMPTS - current.attempts);
    const locked = current.attempts >= MAX_PIN_ATTEMPTS;

    return { locked, remainingAttempts };
  } catch {
    return { locked: false, remainingAttempts: 1 };
  }
}

export function resetPinAttempts(studentId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ATTEMPTS);
    if (!raw) return;
    const attemptsMap = JSON.parse(raw);
    if (attemptsMap[studentId]) {
      delete attemptsMap[studentId];
      localStorage.setItem(STORAGE_KEY_ATTEMPTS, JSON.stringify(attemptsMap));
    }
  } catch {}
}

export function validatePinForStudent(studentId, enteredPin) {
  // 1. Checa se o aluno está bloqueado preventivamente
  const lockout = getPinLockoutStatus(studentId);
  if (lockout.locked) {
    return { 
      valid: false, 
      locked: true, 
      remainingSeconds: lockout.remainingSeconds,
      reason: `Aluno temporariamente bloqueado por segurança. Tente novamente em ${lockout.remainingSeconds}s ou procure a coordenação.` 
    };
  }

  const pins = getPins();
  const now = Date.now();
  const index = pins.findIndex(p => 
    p.studentId === studentId && 
    p.code === enteredPin && 
    !p.used && 
    p.expiresAt > now
  );

  if (index === -1) {
    const attemptResult = recordFailedPinAttempt(studentId);
    
    // Se estourou as tentativas agora, registra alerta de segurança imediato nos logs
    if (attemptResult.locked) {
      const students = getStudents();
      const student = students.find(s => s.id === studentId);
      recordExitLog({
        studentId,
        alunoNome: student ? student.nome : 'Desconhecido',
        alunoMatricula: student ? student.matricula : 'N/A',
        adultoNome: 'Tentativa não autorizada',
        status: 'BLOQUEADO',
        metodo: 'Alerta de Segurança: 3 tentativas de PIN incorreto excedidas'
      });

      return {
        valid: false,
        locked: true,
        remainingSeconds: 300,
        reason: 'Tentativas esgotadas! Aluno bloqueado temporariamente por 5 minutos por segurança.'
      };
    }

    return { 
      valid: false, 
      locked: false,
      remainingAttempts: attemptResult.remainingAttempts,
      reason: `PIN incorreto ou expirado. Restam ${attemptResult.remainingAttempts} tentativa(s) antes do bloqueio.` 
    };
  }

  // Sucesso: zera qualquer falha anterior
  resetPinAttempts(studentId);
  return { valid: true, pinRecord: pins[index] };
}

export function consumePin(studentId, enteredPin) {
  const pins = getPins();
  const pin = pins.find(p => p.studentId === studentId && p.code === enteredPin);
  if (pin) {
    pin.used = true;
    localStorage.setItem(STORAGE_KEY_PINS, JSON.stringify(pins));
    notifyStorageChange();
  }
}

function getPins() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PINS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// LOGS OF EXITS (AUDIT TRAIL)
export function getExitLogs() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_LOGS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function recordExitLog(logEntry) {
  const logs = getExitLogs();
  const entry = {
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    status: 'LIBERADO',
    ...logEntry
  };
  logs.unshift(entry);
  localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
  notifyStorageChange();

  // Sincroniza log com o servidor e emite evento em tempo real
  registerExitApi(entry.studentId, null, entry).catch(() => {});

  return entry;
}

// Reactive events across components
const listeners = new Set();
export function subscribeStorage(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyStorageChange() {
  listeners.forEach(cb => {
    try { cb(); } catch {}
  });
}

// Sincronização inicial e listener WebSocket
if (typeof window !== 'undefined') {
  fetchStudentsFromApi().then(remoteStudents => {
    if (remoteStudents && remoteStudents.length > 0) {
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(remoteStudents));
      notifyStorageChange();
    }
  }).catch(() => {});

  fetchLogsFromApi().then(remoteLogs => {
    if (remoteLogs && remoteLogs.length > 0) {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(remoteLogs));
      notifyStorageChange();
    }
  }).catch(() => {});

  initWebSocket((event) => {
    if ([
      'NOVO_ALUNO', 'BIOMETRIA_ATUALIZADA', 'PIN_GERADO', 
      'ALUNO_LIBERADO', 'ALERTA_SEGURANCA', 
      'AUTORIZACAO_CRIADA', 'AUTORIZACAO_REVOGADA', 'VAN_LOTE_LIBERADO'
    ].includes(event.type)) {
      fetchStudentsFromApi().then(stus => {
        if (stus && stus.length > 0) {
          localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(stus));
          notifyStorageChange();
        }
      }).catch(() => {});

      fetchLogsFromApi().then(logs => {
        if (logs && logs.length > 0) {
          localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
          notifyStorageChange();
        }
      }).catch(() => {});
    }
  });
}
