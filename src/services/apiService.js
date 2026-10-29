// Valida School Central API & WebSocket Client with Offline Cache
const API_BASE_URL = import.meta.env.VITE_API_URL 
  || (import.meta.env.DEV ? 'http://localhost:3001' : (typeof window !== 'undefined' ? window.location.origin : ''));

const WS_BASE_URL = import.meta.env.VITE_WS_URL 
  || (typeof window !== 'undefined' 
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}` 
      : 'ws://localhost:3001');

let socket = null;
let reconnectTimeout = null;
const eventListeners = new Set();

/**
 * Initializes real-time WebSocket connection
 */
export function initWebSocket(onEventCallback) {
  if (onEventCallback) {
    eventListeners.add(onEventCallback);
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return () => eventListeners.delete(onEventCallback);
  }

  try {
    socket = new WebSocket(WS_BASE_URL);

    socket.onopen = () => {
      console.log('⚡ Conectado ao WebSocket Central Valida School');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        eventListeners.forEach(listener => {
          try { listener(data); } catch (err) { console.warn('Erro em listener WS:', err); }
        });
      } catch (err) {
        console.warn('Erro ao processar mensagem WS:', err);
      }
    };

    socket.onclose = () => {
      socket = null;
      // Auto-reconnect after 3 seconds
      if (!reconnectTimeout) {
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          initWebSocket();
        }, 3000);
      }
    };

    socket.onerror = (err) => {
      console.warn('WebSocket Valida School indisponível (operando em modo local):', err);
    };
  } catch (err) {
    console.warn('Falha ao inicializar WebSocket:', err);
  }

  return () => {
    if (onEventCallback) eventListeners.delete(onEventCallback);
  };
}

export function subscribeToEvents(callback) {
  eventListeners.add(callback);
  return () => eventListeners.delete(callback);
}

// ==========================================
// CLIENTE HTTP REST COM FALLBACK OFFLINE
// ==========================================

export async function fetchStudentsFromApi() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/alunos`);
    if (!res.ok) throw new Error('Falha ao obter alunos do servidor');
    const data = await res.json();
    // Atualiza cache local
    localStorage.setItem('valida_school_students', JSON.stringify(data));
    return data;
  } catch (err) {
    console.warn('API indisponível, utilizando dados em cache local:', err.message);
    const cached = localStorage.getItem('valida_school_students');
    return cached ? JSON.parse(cached) : [];
  }
}

export async function searchStudentFromApi(query) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/alunos/buscar?q=${encodeURIComponent(query)}`);
    if (res.ok) return await res.json();
  } catch {}

  // Fallback para cache local
  const cached = localStorage.getItem('valida_school_students');
  const students = cached ? JSON.parse(cached) : [];
  const clean = query.replace(/\D/g, '').trim();
  return students.find(s => {
    const sMat = (s.matricula || '').replace(/\D/g, '');
    const sCpf = (s.cpf || '').replace(/\D/g, '');
    return sMat === clean || sCpf === clean;
  }) || null;
}

export async function createStudentApi(studentData) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/alunos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentData)
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao salvar no servidor, gravando localmente:', err);
  }
  return null;
}

export async function updateBiometricsApi(studentId, adultId, photo, faceDescriptor) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/responsaveis/biometria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, adultId, photo, faceDescriptor })
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao atualizar biometria no servidor:', err);
  }
  return null;
}

export async function generatePinApi(studentId, criadoPor = 'App Responsável') {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pins/gerar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, criadoPor })
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Falha na API de geração de PIN:', err);
  }
  return null;
}

export async function getActivePinApi(studentId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pins/ativo/${studentId}`);
    if (res.ok) {
      const data = await res.json();
      return data.code ? data : null;
    }
  } catch {}
  return null;
}

export async function validatePinApi(code, studentIdOrMatricula = null) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pins/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, studentIdOrMatricula })
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('API indisponível para validar PIN:', err);
  }
  return null;
}

export async function generateFamilyPinApi(studentIds, criadoPor = 'App Responsável') {
  try {
    const res = await fetch(`${API_BASE_URL}/api/pins/gerar-familiar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds, criadoPor })
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao gerar PIN Familiar:', err);
  }
  return null;
}

export async function fetchChildrenByGuardianApi(guardianId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/responsaveis/${guardianId}/filhos`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao buscar filhos do responsável:', err);
  }
  return [];
}

export async function addThirdPartyAuthorizationApi(data) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/autorizacoes/terceiro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao autorizar terceiro:', err);
  }
  return null;
}

export async function revokeAuthorizationApi(authId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/autorizacoes/${authId}`, {
      method: 'DELETE'
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao revogar autorização:', err);
  }
  return null;
}

export async function fetchVanRosterApi(driverCpfOrId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/vans/rota/${encodeURIComponent(driverCpfOrId)}`);
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao buscar rota de van:', err);
  }
  return null;
}

export async function registerBatchVanReleaseApi(driverId, studentIds, photoUrl, portao) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/vans/liberar-lote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, studentIds, photoUrl, portao })
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao registrar liberação de van em lote:', err);
  }
  return null;
}

export async function registerExitApi(studentId, code, logData, batchLogs = null) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/saidas/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, code, logData, batchLogs })
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Erro ao registrar saída no servidor:', err);
  }
  return null;
}

export async function fetchLogsFromApi() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/logs`);
    if (res.ok) {
      const logs = await res.json();
      localStorage.setItem('valida_school_logs', JSON.stringify(logs));
      return logs;
    }
  } catch {}
  const cached = localStorage.getItem('valida_school_logs');
  return cached ? JSON.parse(cached) : [];
}
