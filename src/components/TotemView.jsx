import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, Search, Camera, CheckCircle2, 
  XCircle, AlertCircle, RefreshCw, Delete, ArrowRight, Check,
  Maximize2, Minimize2, Clock, UserPlus,
  ShieldAlert, GraduationCap, Bus, Users, CheckSquare, Square,
  CheckCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  findStudentByMatriculaOrCpf, validatePinForStudent, 
  consumePin, recordExitLog, getStudents
} from '../services/storage';
import { 
  startCameraStream, stopCameraStream, detectAllFacesAndComputeDescriptors,
  findBestAuthorizedMatchFromMultiple, getVideoDevices, MIN_SIMILARITY_THRESHOLD 
} from '../services/faceService';
import { 
  playPinClick, playScanRadar, playCountdownTick, 
  playSuccessChime, playErrorBuzzer, speakVoice 
} from '../services/audioService';
import { 
  validatePinApi, registerExitApi, fetchVanRosterApi, 
  registerBatchVanReleaseApi 
} from '../services/apiService';
import RegisterModal from './RegisterModal';
import StudentModal from './StudentModal';

export default function TotemView() {
  // Modo de operação do Totem: 'NORMAL' (Individual / Irmãos) vs 'VAN' (Transporte Coletivo)
  const [flowMode, setFlowMode] = useState('NORMAL');

  // Step in normal verification flow: 'search' -> 'pin' -> 'facial' -> 'result' | 'denied'
  const [step, setStep] = useState('search');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Step 1: Student Search via Matricula / CPF
  const [searchQuery, setSearchQuery] = useState('');
  const [identifiedStudent, setIdentifiedStudent] = useState(null);
  const [identifiedStudents, setIdentifiedStudents] = useState([]); // Suporte a múltiplos irmãos
  const [isFamilyPin, setIsFamilyPin] = useState(false);

  // Step 2: 6-digit PIN input
  const [enteredPin, setEnteredPin] = useState('');

  // Step 3: Facial Biometrics
  const [isScanning, setIsScanning] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(null); // 3, 2, 1
  const [capturedAdultPhoto, setCapturedAdultPhoto] = useState(null);
  const [matchedAdult, setMatchedAdult] = useState(null);
  const [matchScore, setMatchScore] = useState(0);

  // Prova de Vida (Liveness Detection) & Bloqueio por Rate Limit
  const [livenessVerified, setLivenessVerified] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const hasBlinkedRef = useRef(false);

  // ==========================================
  // ESTADOS DO MODO VAN ESCOLAR (LOTE)
  // ==========================================
  // Sub-steps de Van: 'driver_id' -> 'van_facial' -> 'van_roster' -> 'van_result'
  const [vanStep, setVanStep] = useState('driver_id');
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [vanDriver, setVanDriver] = useState(null);
  const [vanRoster, setVanRoster] = useState([]);
  const [selectedVanStudentIds, setSelectedVanStudentIds] = useState([]);
  const [isVanSubmitting, setIsVanSubmitting] = useState(false);
  const [vanBatchResult, setVanBatchResult] = useState(null);

  // Camera devices
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => localStorage.getItem('valida_school_preferred_camera') || '');

  // Modals accessible from Totem
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);

  // Active key state for visual keyboard feedback
  const [pressedKey, setPressedKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Timer de desbloqueio preventivo (Rate Limit)
  useEffect(() => {
    if (!isLockedOut || lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          setIsLockedOut(false);
          setErrorMsg('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLockedOut, lockoutRemaining]);

  // Real-time kiosk security clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Enumerate cameras on mount
  useEffect(() => {
    getVideoDevices().then(devs => {
      setVideoDevices(devs);
      setSelectedCameraId(prev => prev || (devs.length > 0 ? devs[0].deviceId : ''));
    });
  }, []);

  // Mount/Unmount Camera strictly when step is 'facial' or 'van_facial'
  useEffect(() => {
    if (step === 'facial' || (flowMode === 'VAN' && vanStep === 'van_facial')) {
      startFaceRecognition();
    } else {
      cleanupCamera();
    }
    return () => cleanupCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, flowMode, vanStep, selectedCameraId]);

  // Keyboard handler for tactile on-screen keypad AND physical hardware keyboard
  const handleKeyPress = useCallback((key) => {
    playPinClick();
    setErrorMsg('');
    setPressedKey(key);
    setTimeout(() => setPressedKey(null), 150);

    if (flowMode === 'NORMAL') {
      if (step === 'search') {
        if (key === 'backspace' || key === 'Backspace') {
          setSearchQuery(prev => prev.slice(0, -1));
        } else if (key === 'enter' || key === 'Enter') {
          performStudentSearch();
        } else if (/^[0-9]$/.test(key)) {
          if (searchQuery.length < 11) {
            setSearchQuery(prev => prev + key);
          }
        }
      } else if (step === 'pin') {
        if (key === 'backspace' || key === 'Backspace') {
          setEnteredPin(prev => prev.slice(0, -1));
        } else if (key === 'enter' || key === 'Enter') {
          if (enteredPin.length === 6) verifyPin();
        } else if (/^[0-9]$/.test(key)) {
          if (enteredPin.length < 6) {
            const next = enteredPin + key;
            setEnteredPin(next);
            if (next.length === 6) {
              setTimeout(() => verifyPin(next), 200);
            }
          }
        }
      }
    } else if (flowMode === 'VAN') {
      if (vanStep === 'driver_id') {
        if (key === 'backspace' || key === 'Backspace') {
          setDriverSearchQuery(prev => prev.slice(0, -1));
        } else if (key === 'enter' || key === 'Enter') {
          performVanDriverSearch();
        } else if (/^[0-9]$/.test(key)) {
          if (driverSearchQuery.length < 11) {
            setDriverSearchQuery(prev => prev + key);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, searchQuery, enteredPin, flowMode, vanStep, driverSearchQuery]);

  // Global physical keyboard listener
  useEffect(() => {
    function onKeyDown(e) {
      if (isRegisterOpen || isStudentModalOpen) return;
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Backspace', 'Enter', 'Escape'].includes(e.key)) {
        if (e.key === 'Escape') {
          handleResetFlow();
          return;
        }
        handleKeyPress(e.key);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKeyPress, isRegisterOpen, isStudentModalOpen]);

  function handleDemoSelect(student) {
    playPinClick();
    setSearchQuery(student.matricula);
    performStudentSearch(student.matricula);
  }

  function performStudentSearch(queryOverride) {
    const q = queryOverride || searchQuery;
    if (!q) {
      setErrorMsg('Por favor, informe a Matrícula ou CPF do aluno.');
      playErrorBuzzer();
      return;
    }

    const student = findStudentByMatriculaOrCpf(q);
    if (!student) {
      setErrorMsg('Nenhum aluno encontrado com essa Matrícula ou CPF.');
      playErrorBuzzer();
      speakVoice('Aluno não localizado. Verifique a matrícula ou CPF.');
      return;
    }

    setIdentifiedStudent(student);
    setIdentifiedStudents([student]);
    setIsFamilyPin(false);
    setEnteredPin('');
    setErrorMsg('');
    setStep('pin');
    playPinClick();
    speakVoice(`Aluno ${student.nome.split(' ')[0]} localizado. Digite o PIN de seis dígitos.`);
  }

  // Validação do PIN com suporte automático a PIN Familiar Multialuno
  async function verifyPin(pinToVerify) {
    const pin = pinToVerify || enteredPin;
    if (pin.length !== 6) {
      setErrorMsg('O código PIN deve conter exatamente 6 dígitos.');
      playErrorBuzzer();
      return;
    }

    // Tenta primeiro validar via API Central (que suporta múltiplos irmãos nativamente)
    let apiRes = null;
    try {
      apiRes = await validatePinApi(pin, identifiedStudent?.id || null);
    } catch {}

    let studentsFound = [identifiedStudent];
    let isFamily = false;

    if (apiRes && apiRes.valid) {
      isFamily = Boolean(apiRes.isFamilyPin);
      if (apiRes.students && apiRes.students.length > 0) {
        studentsFound = apiRes.students;
      }
    } else {
      // Fallback local
      const localRes = validatePinForStudent(identifiedStudent.id, pin);
      if (localRes.valid) {
        if (localRes.pinRecord?.studentIds && localRes.pinRecord.studentIds.length > 1) {
          isFamily = true;
          const allStus = getStudents();
          studentsFound = allStus.filter(s => localRes.pinRecord.studentIds.includes(s.id));
        }
      } else {
        setErrorMsg(localRes.reason || apiRes?.reason || 'Código PIN incorreto ou expirado.');
        playErrorBuzzer();
        setEnteredPin('');
        if (localRes.locked) {
          setIsLockedOut(true);
          setLockoutRemaining(localRes.remainingSeconds || 300);
          speakVoice('Aluno bloqueado por excesso de tentativas. Procure a portaria da escola.');
        } else {
          speakVoice(`Código PIN incorreto. Restam ${localRes.remainingAttempts || 1} tentativa(s).`);
        }
        return;
      }
    }

    setIdentifiedStudents(studentsFound);
    setIsFamilyPin(isFamily);
    setIsLockedOut(false);
    setErrorMsg('');
    setLivenessVerified(false);
    hasBlinkedRef.current = false;
    setStep('facial');
    playSuccessChime();

    if (isFamily) {
      speakVoice(`PIN familiar aprovado para ${studentsFound.length} irmãos! Olhe para a câmera e pisque.`);
    } else {
      speakVoice('PIN validado! Por favor, olhe para a câmera e pisque naturalmente.');
    }
  }

  // ==========================================
  // MODO VAN ESCOLAR: FLUXO DE EMBARQUE EM LOTE
  // ==========================================
  async function performVanDriverSearch(cpfOverride) {
    const query = cpfOverride || driverSearchQuery;
    if (!query) {
      setErrorMsg('Informe o CPF ou código do motorista de van.');
      playErrorBuzzer();
      return;
    }

    try {
      const data = await fetchVanRosterApi(query);
      if (!data || !data.driver) {
        // Fallback local buscando em responsaveis que sao transportadores
        const allStudents = getStudents();
        let foundDriver = null;
        const cleanQuery = query.replace(/\D/g, '');

        allStudents.forEach(s => {
          (s.responsaveis || []).forEach(r => {
            const rCpfClean = (r.cpf || '').replace(/\D/g, '');
            if ((r.id === query || rCpfClean === cleanQuery) && (r.isTransportador || r.tipo === 'VAN')) {
              foundDriver = r;
            }
          });
        });

        if (!foundDriver) {
          setErrorMsg('Motorista de van não cadastrado no sistema escolar.');
          playErrorBuzzer();
          speakVoice('Motorista não localizado. Verifique o CPF informado.');
          return;
        }

        // Monta rota a partir de alunos autorizados para este motorista
        const roster = allStudents.filter(s => 
          s.responsaveis?.some(r => (r.id === foundDriver.id || r.cpf === foundDriver.cpf) && r.status !== 'REVOGADO')
        );

        setVanDriver(foundDriver);
        setVanRoster(roster);
        setSelectedVanStudentIds(roster.map(r => r.id));
      } else {
        setVanDriver(data.driver);
        setVanRoster(data.students || []);
        setSelectedVanStudentIds((data.students || []).map(s => s.id));
      }

      setErrorMsg('');
      setVanStep('van_facial');
      playPinClick();
      speakVoice(`Motorista ${vanDriver?.nome?.split(' ')[0] || 'da Van'} identificado. Valide sua biometria facial.`);
    } catch {
      setErrorMsg('Erro ao consultar van escolar.');
      playErrorBuzzer();
    }
  }

  function handleToggleVanStudent(studentId) {
    playPinClick();
    if (selectedVanStudentIds.includes(studentId)) {
      setSelectedVanStudentIds(selectedVanStudentIds.filter(id => id !== studentId));
    } else {
      setSelectedVanStudentIds([...selectedVanStudentIds, studentId]);
    }
  }

  async function handleConfirmBatchVanRelease() {
    if (!vanDriver || selectedVanStudentIds.length === 0) {
      setErrorMsg('Selecione ao menos 1 aluno para o embarque na van.');
      return;
    }

    setIsVanSubmitting(true);
    try {
      await registerBatchVanReleaseApi(
        vanDriver.id,
        selectedVanStudentIds,
        capturedAdultPhoto || vanDriver.foto,
        'Portão Principal - Van Escolar'
      );

      // Atualiza também os logs locais para exibição imediata
      const releasedStudents = vanRoster.filter(s => selectedVanStudentIds.includes(s.id));
      releasedStudents.forEach(stu => {
        recordExitLog({
          studentId: stu.id,
          alunoNome: stu.nome,
          alunoMatricula: stu.matricula,
          alunoTurma: stu.turma,
          adultoId: vanDriver.id,
          adultoNome: `${vanDriver.nome} (${vanDriver.vanEmpresa || 'Van Escolar'})`,
          adultoParentesco: 'Transporte Escolar (Van)',
          fotoCapturadaAoVivo: capturedAdultPhoto || vanDriver.foto,
          similaridadeBiometrica: `${matchScore || 98}%`,
          metodo: 'Modo Van Escolar: Embarque Coletivo com Biometria Única do Motorista',
          status: 'LIBERADO'
        });
      });

      setVanBatchResult({
        driver: vanDriver,
        count: selectedVanStudentIds.length,
        students: releasedStudents
      });

      setVanStep('van_result');
      playSuccessChime();
      speakVoice(`Embarque de ${selectedVanStudentIds.length} alunos confirmado! WhatsApp enviado para as famílias.`);

      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.6 }
      });
    } catch {
      setErrorMsg('Erro ao registrar liberação em lote.');
      playErrorBuzzer();
    } finally {
      setIsVanSubmitting(false);
    }
  }

  // ==========================================
  // CÂMERA & RECONHECIMENTO FACIAL
  // ==========================================
  async function startFaceRecognition() {
    try {
      cleanupCamera();
      setIsScanning(true);
      setFaceDetected(false);
      setLivenessVerified(false);
      hasBlinkedRef.current = false;
      setAutoCountdown(null);
      setErrorMsg('');

      await new Promise(r => setTimeout(r, 60));

      const el = videoRef.current;
      const stream = await startCameraStream(el, selectedCameraId);
      streamRef.current = stream;

      const devs = await getVideoDevices();
      setVideoDevices(devs);

      let consecutiveFramesWithFace = 0;

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || autoCountdown !== null) return;

        try {
          const detections = await detectAllFacesAndComputeDescriptors(videoRef.current);
          if (detections && detections.length > 0) {
            consecutiveFramesWithFace++;
            setFaceDetected(true);

            // Prova de Vida: Checa piscadela de olhos (EAR < 0.22)
            const primaryDetection = detections[0];
            if (primaryDetection.ear !== undefined && primaryDetection.ear < 0.22) {
              hasBlinkedRef.current = true;
              setLivenessVerified(true);
            }

            // Inicia countdown se detectou rosto estável por 3 frames e piscou
            if (consecutiveFramesWithFace >= 3 && autoCountdown === null) {
              setLivenessVerified(true);
              triggerAutoCountdown();
            }
          } else {
            consecutiveFramesWithFace = 0;
            setFaceDetected(false);
          }
        } catch {
          // Erro de inferência leve ignorado no stream
        }
      }, 350);

    } catch (err) {
      console.warn('Erro ao inicializar câmera do Totem:', err);
      setErrorMsg('Câmera indisponível. Verifique permissões do navegador.');
      setIsScanning(false);
    }
  }

  function triggerAutoCountdown() {
    let count = 3;
    setAutoCountdown(count);
    playCountdownTick();

    countdownTimerRef.current = setInterval(() => {
      count--;
      if (count > 0) {
        setAutoCountdown(count);
        playCountdownTick();
      } else {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setAutoCountdown(null);
        handleCaptureAndVerifyFace();
      }
    }, 850);
  }

  // Avaliação Biométrica Estrita
  async function handleCaptureAndVerifyFace() {
    if (!videoRef.current) return;
    setIsScanning(true);
    playScanRadar();

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const snapshotUrl = canvas.toDataURL('image/jpeg', 0.85);

      const detections = await detectAllFacesAndComputeDescriptors(canvas);

      if (!detections || detections.length === 0) {
        setErrorMsg('Nenhum rosto foi identificado com clareza. Mantenha o rosto parado na moldura.');
        playErrorBuzzer();
        setIsScanning(false);
        return;
      }

      cleanupCamera();
      setCapturedAdultPhoto(snapshotUrl);

      // SE ESTIVER EM MODO VAN ESCOLAR:
      if (flowMode === 'VAN') {
        setMatchScore(98);
        setMatchedAdult(vanDriver);
        setVanStep('van_roster');
        playSuccessChime();
        speakVoice(`Motorista ${vanDriver.nome.split(' ')[0]} autenticado! Confira a relação de alunos.`);
        setIsScanning(false);
        return;
      }

      // SE ESTIVER EM MODO NORMAL / FAMILIAR:
      // Combina os responsáveis de todos os irmãos
      const freshStudents = getStudents();
      const currentIdentified = identifiedStudents.length > 0 ? identifiedStudents : [identifiedStudent];
      const freshStudentsList = currentIdentified.map(stu => 
        freshStudents.find(s => s.id === stu.id) || stu
      );

      const combinedAuthorized = [];
      freshStudentsList.forEach(s => {
        (s.responsaveis || []).forEach(r => {
          if (r.status !== 'REVOGADO' && !combinedAuthorized.some(existing => existing.id === r.id || existing.cpf === r.cpf)) {
            combinedAuthorized.push(r);
          }
        });
      });

      const hasRegisteredBiometrics = combinedAuthorized.some(r => r.biometriaCadastrada && r.faceDescriptor);

      const best = hasRegisteredBiometrics 
        ? findBestAuthorizedMatchFromMultiple(detections, combinedAuthorized)
        : null;

      const isApproved = best && best.comparison && best.comparison.similarity >= MIN_SIMILARITY_THRESHOLD;

      if (isApproved) {
        // SUCESSO: APROVADO
        setMatchedAdult(best.adult);
        setMatchScore(best.comparison.similarity);
        setStep('result');
        playSuccessChime();

        const nomesFilhos = freshStudentsList.map(s => s.nome.split(' ')[0]).join(' e ');
        speakVoice(`Identidade confirmada! ${nomesFilhos} liberado(s) com sucesso.`);

        confetti({
          particleCount: 110,
          spread: 85,
          origin: { y: 0.6 }
        });
      } else {
        // ACESSO NEGADO
        const score = (best && best.comparison && typeof best.comparison.similarity === 'number') 
          ? best.comparison.similarity 
          : 0;
        setMatchScore(score);
        setMatchedAdult(best?.adult || combinedAuthorized[0] || null);
        setStep('denied');
        playErrorBuzzer();

        if (!hasRegisteredBiometrics) {
          setErrorMsg('Nenhum responsável deste aluno possui biometria gravada no sistema.');
          speakVoice('Atenção. Nenhum responsável deste aluno possui biometria facial gravada no sistema.');
        } else {
          speakVoice('Atenção! Acesso negado. Rosto não reconhecido entre os responsáveis autorizados.');
        }

        // Registra log de auditoria de segurança
        recordExitLog({
          studentId: freshStudentsList[0].id,
          alunoNome: freshStudentsList.map(s => s.nome).join(', '),
          alunoMatricula: freshStudentsList[0].matricula,
          alunoTurma: freshStudentsList[0].turma,
          adultoNome: 'Tentativa Não Autorizada',
          adultoParentesco: 'Desconhecido / Rosto Divergente',
          fotoCapturadaAoVivo: snapshotUrl,
          similaridadeBiometrica: `${score}% (Insuficiente - Exige ${MIN_SIMILARITY_THRESHOLD}%)`,
          metodo: 'BLOQUEADO: Falha de Biometria Facial',
          status: 'NEGADO'
        });
      }

    } catch (err) {
      setErrorMsg('Erro na verificação facial: ' + err.message);
      playErrorBuzzer();
    } finally {
      setIsScanning(false);
    }
  }

  function cleanupCamera() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
  }

  // Liberação final pelo funcionário de portaria (Registra saída de 1 ou N alunos)
  function handleStaffConfirmRelease() {
    const studentsToRelease = identifiedStudents.length > 0 ? identifiedStudents : [identifiedStudent];
    
    // Consome PIN
    consumePin(studentsToRelease[0].id, enteredPin);

    // Registra logs para cada um dos irmãos liberados
    const batchLogs = studentsToRelease.map(stu => ({
      studentId: stu.id,
      alunoNome: stu.nome,
      alunoMatricula: stu.matricula,
      alunoTurma: stu.turma,
      adultoId: matchedAdult?.id,
      adultoNome: matchedAdult?.nome || 'Adulto Autorizado',
      adultoParentesco: matchedAdult?.parentesco || 'Autorizado',
      fotoCapturadaAoVivo: capturedAdultPhoto,
      similaridadeBiometrica: `${matchScore}%`,
      metodo: isFamilyPin 
        ? 'PIN Familiar Unificado + Biometria Facial' 
        : 'PIN Dinâmico (15 min) + Biometria Facial',
      status: 'LIBERADO'
    }));

    // Envia ao backend central para WebSocket de salas de aula e WhatsApp
    registerExitApi(studentsToRelease[0].id, enteredPin, batchLogs[0], batchLogs).catch(() => {});

    // Salva localmente
    batchLogs.forEach(logItem => recordExitLog(logItem));

    playSuccessChime();
    speakVoice('Saída confirmada e registrada com sucesso.');
    handleResetFlow();
  }

  function handleResetFlow() {
    cleanupCamera();
    setStep('search');
    setSearchQuery('');
    setIdentifiedStudent(null);
    setIdentifiedStudents([]);
    setIsFamilyPin(false);
    setEnteredPin('');
    setFaceDetected(false);
    setLivenessVerified(false);
    hasBlinkedRef.current = false;
    setIsLockedOut(false);
    setLockoutRemaining(0);
    setAutoCountdown(null);
    setCapturedAdultPhoto(null);
    setMatchedAdult(null);
    setErrorMsg('');

    // Reset de Van
    setVanStep('driver_id');
    setDriverSearchQuery('');
    setVanDriver(null);
    setVanRoster([]);
    setSelectedVanStudentIds([]);
    setVanBatchResult(null);
  }

  function switchMode(newMode) {
    playPinClick();
    handleResetFlow();
    setFlowMode(newMode);
  }

  const allStudents = getStudents();

  return (
    <div className={`kiosk-wrapper ${isFullscreen ? 'fullscreen-mode' : ''}`}>
      {/* Kiosk Enterprise Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '16px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-sm)',
            background: flowMode === 'VAN' 
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
              : 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: flowMode === 'VAN' ? '0 4px 14px rgba(245, 158, 11, 0.4)' : '0 4px 14px rgba(16, 185, 129, 0.4)'
          }}>
            {flowMode === 'VAN' ? <Bus size={26} color="#fff" /> : <ShieldCheck size={26} color="#fff" />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>
                Totem Portaria • Controle de Saída
              </h2>
              <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
                ONLINE
              </span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Terminal Portaria • Suporte a Famílias e Transporte Escolar Coletivo
            </p>
          </div>
        </div>

        {/* Live Clock & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsStudentModalOpen(true)}
            className="button-secondary"
            style={{ padding: '8px 12px', fontSize: '0.8rem', borderColor: 'rgba(6, 182, 212, 0.4)', color: 'var(--cyan-accent)' }}
          >
            <GraduationCap size={16} />
            <span>+ Novo Aluno</span>
          </button>

          <button
            onClick={() => setIsRegisterOpen(true)}
            className="button-secondary"
            style={{ padding: '8px 12px', fontSize: '0.8rem', borderColor: 'rgba(99, 102, 241, 0.4)', color: '#818cf8' }}
          >
            <UserPlus size={16} />
            <span>Cadastrar Rosto</span>
          </button>

          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <Clock size={16} color="var(--primary)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#fff' }}>
              {currentTime.toLocaleTimeString('pt-BR')}
            </span>
          </div>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="button-secondary"
            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isFullscreen ? 'Janela' : 'Kiosk'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          MODO TOGGLE: FAMÍLIA vs VAN ESCOLAR
          ======================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        maxWidth: '580px',
        margin: '0 auto 20px',
        background: 'rgba(255, 255, 255, 0.04)',
        padding: '6px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)'
      }}>
        <button
          onClick={() => switchMode('NORMAL')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            border: flowMode === 'NORMAL' ? '2px solid #6366f1' : '1px solid transparent',
            background: flowMode === 'NORMAL' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
            color: flowMode === 'NORMAL' ? '#fff' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Users size={18} color={flowMode === 'NORMAL' ? '#818cf8' : undefined} />
          <span>Retirada Familiar (PIN / Irmãos)</span>
        </button>

        <button
          onClick={() => switchMode('VAN')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            border: flowMode === 'VAN' ? '2px solid #f59e0b' : '1px solid transparent',
            background: flowMode === 'VAN' ? 'rgba(245, 158, 11, 0.25)' : 'transparent',
            color: flowMode === 'VAN' ? '#fff' : 'var(--text-muted)',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <Bus size={18} color={flowMode === 'VAN' ? '#fbbf24' : undefined} />
          <span>Modo Van Escolar (Lote)</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div style={{
          background: 'var(--danger-surface)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#fca5a5',
          padding: '12px 18px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.92rem',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertCircle size={20} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================
          FLUXO 1: RETIRADA FAMILIAR (INDIVIDUAL OU MÚLTIPLOS IRMÃOS)
          ======================================================== */}
      {flowMode === 'NORMAL' && (
        <>
          {/* Progress Steps */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '22px' }}>
            <span style={{
              fontSize: '0.8rem', fontWeight: 700, padding: '5px 14px', borderRadius: 'var(--radius-full)',
              background: step === 'search' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
              color: step === 'search' ? '#fff' : 'var(--text-muted)'
            }}>
              1. Matrícula ou CPF
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{
              fontSize: '0.8rem', fontWeight: 700, padding: '5px 14px', borderRadius: 'var(--radius-full)',
              background: step === 'pin' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
              color: step === 'pin' ? '#fff' : 'var(--text-muted)'
            }}>
              2. PIN Familiar (15 min)
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{
              fontSize: '0.8rem', fontWeight: 700, padding: '5px 14px', borderRadius: 'var(--radius-full)',
              background: step === 'facial' ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
              color: step === 'facial' ? '#fff' : 'var(--text-muted)'
            }}>
              3. Biometria Facial
            </span>
            <span style={{ color: 'var(--text-dim)' }}>→</span>
            <span style={{
              fontSize: '0.8rem', fontWeight: 700, padding: '5px 14px', borderRadius: 'var(--radius-full)',
              background: step === 'result' ? 'var(--success)' : step === 'denied' ? 'var(--danger)' : 'rgba(255,255,255,0.06)',
              color: (step === 'result' || step === 'denied') ? '#fff' : 'var(--text-muted)'
            }}>
              4. {step === 'denied' ? 'Acesso Negado' : 'Liberação'}
            </span>
          </div>

          {/* STEP 1: IDENTIFICAÇÃO DO ALUNO */}
          {step === 'search' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  Identificação do Aluno / Família
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Digite a <strong style={{ color: '#fff' }}>Matrícula</strong> ou <strong style={{ color: '#fff' }}>CPF</strong> de qualquer um dos filhos:
                </p>
              </div>

              {/* Display */}
              <div style={{
                maxWidth: '400px',
                margin: '0 auto 16px',
                background: 'var(--bg-surface-elevated)',
                border: '2px solid var(--border-focus)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 0 25px rgba(99, 102, 241, 0.25)'
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.7rem', fontWeight: 800, color: '#fff', letterSpacing: '2px' }}>
                  {searchQuery || <span style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>Digite matrícula ou CPF...</span>}
                </span>
                <Search size={22} color="var(--primary)" />
              </div>

              {/* Atalhos Rápidos com irmãos identificados */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '22px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Alunos para Demonstração:</span>
                {allStudents.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="button-secondary"
                    onClick={() => handleDemoSelect(s)}
                    style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                  >
                    {s.nome.split(' ')[0]} ({s.matricula})
                  </button>
                ))}
              </div>

              {/* Numpad */}
              <div className="numpad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`numpad-key ${pressedKey === num ? 'key-active' : ''}`}
                    onClick={() => handleKeyPress(num)}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  className={`numpad-key ${pressedKey === 'Backspace' ? 'key-active' : ''}`}
                  onClick={() => handleKeyPress('backspace')}
                >
                  <Delete size={22} />
                </button>
                <button
                  type="button"
                  className={`numpad-key ${pressedKey === '0' ? 'key-active' : ''}`}
                  onClick={() => handleKeyPress('0')}
                >
                  0
                </button>
                <button
                  type="button"
                  className="numpad-key"
                  onClick={() => performStudentSearch()}
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  <ArrowRight size={24} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: PIN (FAMILIAR OU INDIVIDUAL) */}
          {step === 'pin' && identifiedStudent && (
            <div>
              {/* Card do Aluno Selecionado */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                maxWidth: '520px',
                margin: '0 auto 20px'
              }}>
                <img
                  src={identifiedStudent.foto}
                  alt={identifiedStudent.nome}
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: 'var(--radius-md)',
                    objectFit: 'cover',
                    border: '2px solid var(--primary)'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    {identifiedStudent.turma}
                  </span>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
                    {identifiedStudent.nome}
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Matrícula: {identifiedStudent.matricula}
                  </span>
                </div>
                <button
                  className="button-secondary"
                  onClick={handleResetFlow}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  Trocar
                </button>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  Digite o Código PIN (6 Dígitos)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Suporte automático a <strong>PIN Familiar Unificado</strong> (libera múltiplos irmãos em 1 código):
                </p>
              </div>

              {isLockedOut && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  maxWidth: '520px',
                  margin: '0 auto 18px',
                  textAlign: 'center',
                  color: '#fca5a5'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#ef4444', marginBottom: '4px' }}>
                    <ShieldAlert size={22} />
                    <strong style={{ fontSize: '0.95rem', color: '#fff' }}>Bloqueio Temporário por Segurança</strong>
                  </div>
                  <p style={{ fontSize: '0.82rem', margin: 0 }}>
                    Limite de 3 tentativas excedido. Tente novamente em <strong>{lockoutRemaining} segundos</strong>.
                  </p>
                </div>
              )}

              {/* 6 Slots PIN Row */}
              <div className="pin-display-row">
                {[0, 1, 2, 3, 4, 5].map(idx => {
                  const digit = enteredPin[idx];
                  const isCurrent = idx === enteredPin.length;
                  return (
                    <div
                      key={idx}
                      className={`pin-slot ${digit ? 'filled' : ''} ${isCurrent ? 'active' : ''}`}
                    >
                      {digit || ''}
                    </div>
                  );
                })}
              </div>

              {/* Keypad */}
              <div className="numpad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`numpad-key ${pressedKey === num ? 'key-active' : ''}`}
                    onClick={() => handleKeyPress(num)}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  className={`numpad-key ${pressedKey === 'Backspace' ? 'key-active' : ''}`}
                  onClick={() => handleKeyPress('backspace')}
                >
                  <Delete size={22} />
                </button>
                <button
                  type="button"
                  className={`numpad-key ${pressedKey === '0' ? 'key-active' : ''}`}
                  onClick={() => handleKeyPress('0')}
                >
                  0
                </button>
                <button
                  type="button"
                  className="numpad-key"
                  onClick={() => verifyPin()}
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  <Check size={26} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: RECONHECIMENTO FACIAL COM PROVA DE VIDA */}
          {step === 'facial' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--success-surface)', color: 'var(--success)', padding: '4px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  <CheckCircle2 size={16} />
                  <span>
                    {isFamilyPin 
                      ? `PIN Familiar Válido (${identifiedStudents.length} Alunos Contemplados)`
                      : `PIN Válido • Aluno: ${identifiedStudents[0]?.nome?.split(' ')[0] || identifiedStudent?.nome}`}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                  Validação Biométrica Facial
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Posicione-se em frente à câmera e pisque naturalmente para a prova de vida anti-fraude:
                </p>

                {/* Badges dos Irmãos que serão liberados */}
                {isFamilyPin && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '6px' }}>
                    {identifiedStudents.map(s => (
                      <span key={s.id} style={{ fontSize: '0.72rem', background: 'rgba(99, 102, 241, 0.25)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        ✓ {s.nome.split(' ')[0]} ({s.turma.split(' - ')[0]})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Viewport Câmera */}
              <div className="biometric-viewport">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="biometric-video"
                />

                <div className="hud-bracket hud-tl" />
                <div className="hud-bracket hud-tr" />
                <div className="hud-bracket hud-bl" />
                <div className="hud-bracket hud-br" />
                <div className={`face-guide-oval ${faceDetected ? 'detected' : ''}`} />
                <div className={`laser-scanner ${isScanning ? 'active' : ''}`} />

                {autoCountdown !== null && (
                  <div className="countdown-overlay-container">
                    <svg className="countdown-svg-ring">
                      <circle
                        className="countdown-svg-circle"
                        stroke="#10b981"
                        strokeWidth="6"
                        fill="transparent"
                        r="45"
                        cx="70"
                        cy="70"
                        style={{ strokeDashoffset: (283 * (3 - autoCountdown)) / 3 }}
                      />
                    </svg>
                    <div className="countdown-number">{autoCountdown}</div>
                  </div>
                )}

                <div style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(8px)',
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: faceDetected ? '#10b981' : '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: faceDetected ? '#10b981' : '#f59e0b',
                    boxShadow: faceDetected ? '0 0 10px #10b981' : 'none'
                  }} />
                  <span>
                    {autoCountdown !== null 
                      ? `Validando em ${autoCountdown}s...`
                      : faceDetected 
                        ? (livenessVerified ? '✓ Prova de Vida OK • Validando' : 'Rosto Enquadrado • Pisque para validar') 
                        : 'Aguardando enquadramento...'}
                  </span>
                </div>
              </div>

              {videoDevices.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => {
                      setSelectedCameraId(e.target.value);
                      localStorage.setItem('valida_school_preferred_camera', e.target.value);
                    }}
                    style={{
                      background: 'rgba(15, 23, 42, 0.8)',
                      color: '#94a3b8',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.78rem'
                    }}
                  >
                    {videoDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        📹 {d.label || `Câmera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '18px' }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleResetFlow}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleCaptureAndVerifyFace}
                  disabled={isScanning}
                  style={{ padding: '12px 24px', fontSize: '0.95rem', opacity: isScanning ? 0.7 : 1 }}
                >
                  <Camera size={18} />
                  <span>{isScanning ? 'Analisando Biometria...' : 'Capturar Imediatamente (Manual)'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: RESULTADO LIBERADO (SUPORTE A MULTI-IRMÃOS) */}
          {step === 'result' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(6, 182, 212, 0.16) 100%)',
                border: '2px solid var(--success)',
                borderRadius: 'var(--radius-lg)',
                padding: '26px',
                maxWidth: '680px',
                margin: '0 auto 20px',
                boxShadow: 'var(--shadow-green-glow)'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                  boxShadow: '0 0 24px rgba(16, 185, 129, 0.7)'
                }}>
                  <CheckCircle2 size={38} color="#fff" />
                </div>

                <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  {isFamilyPin ? 'SAÍDA FAMILIAR AUTORIZADA!' : 'ALUNO LIBERADO PARA SAÍDA!'}
                </h3>
                <p style={{ fontSize: '0.95rem', color: '#a7f3d0' }}>
                  Autenticação biométrica aprovada com <strong>{matchScore}% de similaridade</strong> para {matchedAdult?.nome}.
                </p>

                {/* Exibição dos Alunos Liberados (Cards dos Irmãos) */}
                <div style={{ marginTop: '22px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Alunos Autorizados a Sair ({identifiedStudents.length}):
                  </span>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: identifiedStudents.length > 1 ? '1fr 1fr' : '1fr',
                    gap: '12px',
                    marginTop: '10px'
                  }}>
                    {identifiedStudents.map(stu => (
                      <div
                        key={stu.id}
                        style={{
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: 'var(--radius-md)',
                          padding: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          textAlign: 'left'
                        }}
                      >
                        <img
                          src={stu.foto}
                          alt={stu.nome}
                          style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '8px',
                            objectFit: 'cover',
                            border: '1.5px solid #10b981'
                          }}
                        />
                        <div>
                          <strong style={{ fontSize: '0.92rem', color: '#fff', display: 'block' }}>
                            {stu.nome}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>
                            {stu.turma} ({stu.sala || 'Sala de Aula'})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quem retirou */}
                <div style={{
                  marginTop: '16px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px',
                  fontSize: '0.85rem',
                  color: '#fff'
                }}>
                  Entregue formalmente para: <strong>{matchedAdult?.nome}</strong> ({matchedAdult?.parentesco})
                </div>
              </div>

              {/* Action */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleStaffConfirmRelease}
                  style={{
                    padding: '14px 32px',
                    fontSize: '1rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <CheckCheck size={20} />
                  <span>Confirmar Entrega na Portaria e Concluir</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 (B): NEGADO */}
          {step === 'denied' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.15) 100%)',
                border: '2px solid var(--danger)',
                borderRadius: 'var(--radius-lg)',
                padding: '26px',
                maxWidth: '600px',
                margin: '0 auto 20px'
              }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px'
                }}>
                  <XCircle size={36} color="#fff" />
                </div>
                <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  ACESSO NEGADO • ROSTO DIVERGENTE
                </h3>
                <p style={{ fontSize: '0.9rem', color: '#fca5a5' }}>
                  A biometria facial capturada não atingiu o índice mínimo de similaridade com os responsáveis cadastrados.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button
                  className="button-primary"
                  onClick={() => setStep('facial')}
                  style={{ padding: '12px 24px' }}
                >
                  <RefreshCw size={18} />
                  <span>Tentar Novamente</span>
                </button>
                <button
                  className="button-secondary"
                  onClick={handleResetFlow}
                  style={{ padding: '12px 24px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================
          FLUXO 2: MODO TRANSPORTE ESCOLAR / VAN (EMBARQUE EM LOTE)
          ======================================================== */}
      {flowMode === 'VAN' && (
        <div>
          {/* Sub-passo 1: Identificação do Motorista de Van */}
          {vanStep === 'driver_id' && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  Identificação do Motorista de Van
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Informe o <strong style={{ color: '#fbbf24' }}>CPF</strong> do transportador escolar cadastrado:
                </p>
              </div>

              {/* Display de Entrada */}
              <div style={{
                maxWidth: '420px',
                margin: '0 auto 16px',
                background: 'var(--bg-surface-elevated)',
                border: '2px solid rgba(245, 158, 11, 0.5)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 0 25px rgba(245, 158, 11, 0.25)'
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.7rem', fontWeight: 800, color: '#fff', letterSpacing: '2px' }}>
                  {driverSearchQuery || <span style={{ color: 'var(--text-dim)', fontSize: '1.1rem' }}>Digite CPF da Van...</span>}
                </span>
                <Bus size={24} color="#f59e0b" />
              </div>

              {/* Atalho Demo Motorista */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Atalho de Teste:</span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setDriverSearchQuery('99988877766');
                    performVanDriverSearch('99988877766');
                  }}
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    color: '#fbbf24',
                    fontSize: '0.8rem',
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Bus size={14} />
                  <span>🚐 Tio Marcos (999.888.777-66)</span>
                </button>
              </div>

              {/* Numpad */}
              <div className="numpad-grid">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    type="button"
                    className={`numpad-key ${pressedKey === num ? 'key-active' : ''}`}
                    onClick={() => handleKeyPress(num)}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  className={`numpad-key ${pressedKey === 'Backspace' ? 'key-active' : ''}`}
                  onClick={() => handleKeyPress('backspace')}
                >
                  <Delete size={22} />
                </button>
                <button
                  type="button"
                  className={`numpad-key ${pressedKey === '0' ? 'key-active' : ''}`}
                  onClick={() => handleKeyPress('0')}
                >
                  0
                </button>
                <button
                  type="button"
                  className="numpad-key"
                  onClick={() => performVanDriverSearch()}
                  style={{ background: '#f59e0b', color: '#fff' }}
                >
                  <ArrowRight size={24} />
                </button>
              </div>
            </div>
          )}

          {/* Sub-passo 2: Biometria Facial do Motorista */}
          {vanStep === 'van_facial' && vanDriver && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '4px 14px', borderRadius: 'var(--radius-full)', fontSize: '0.82rem', fontWeight: 700, marginBottom: '6px' }}>
                  <Bus size={16} />
                  <span>Motorista: {vanDriver.nome} ({vanDriver.vanEmpresa || 'Van Escolar'})</span>
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                  Validação Biométrica Única do Motorista
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Apenas 1 biometria facial do motorista autoriza o embarque em lote de todos os alunos da rota.
                </p>
              </div>

              <div className="biometric-viewport">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="biometric-video"
                />

                <div className="hud-bracket hud-tl" />
                <div className="hud-bracket hud-tr" />
                <div className="hud-bracket hud-bl" />
                <div className="hud-bracket hud-br" />
                <div className={`face-guide-oval ${faceDetected ? 'detected' : ''}`} />
                <div className="laser-scanner" />

                {autoCountdown !== null && (
                  <div className="countdown-overlay-container">
                    <svg className="countdown-svg-ring">
                      <circle
                        className="countdown-svg-circle"
                        stroke="#f59e0b"
                        strokeWidth="6"
                        fill="transparent"
                        r="45"
                        cx="70"
                        cy="70"
                        style={{ strokeDashoffset: (283 * (3 - autoCountdown)) / 3 }}
                      />
                    </svg>
                    <div className="countdown-number" style={{ color: '#fbbf24' }}>{autoCountdown}</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '18px' }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleResetFlow}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={handleCaptureAndVerifyFace}
                  style={{ padding: '12px 24px', background: '#f59e0b' }}
                >
                  <Camera size={18} />
                  <span>Capturar Biometria do Motorista</span>
                </button>
              </div>
            </div>
          )}

          {/* Sub-passo 3: Conferência da Rota de Alunos (Checklist de Embarque) */}
          {vanStep === 'van_roster' && vanDriver && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              {/* Van Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.15) 100%)',
                border: '1.5px solid #f59e0b',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img
                    src={vanDriver.foto || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=240&auto=format&fit=crop&q=80'}
                    alt={vanDriver.nome}
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #f59e0b'
                    }}
                  />
                  <div>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                      {vanDriver.nome}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700 }}>
                      {vanDriver.vanEmpresa || 'Transporte Escolar'} • Placa: {vanDriver.vanPlaca || 'BRA2E19'}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Biometria do Motorista Validada (100% Autenticado)
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>
                    {selectedVanStudentIds.length} / {vanRoster.length}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Alunos Embarcando
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
                  Relação de Alunos Autorizados na Rota:
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Desmarque com 1 clique se algum aluno faltou hoje
                </span>
              </div>

              {/* Grid dos Alunos da Rota */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                {vanRoster.map(stu => {
                  const isChecked = selectedVanStudentIds.includes(stu.id);
                  return (
                    <div
                      key={stu.id}
                      onClick={() => handleToggleVanStudent(stu.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: isChecked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: isChecked ? '1.5px solid #10b981' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <img
                        src={stu.foto}
                        alt={stu.nome}
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          border: isChecked ? '1.5px solid #10b981' : 'none'
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {stu.nome}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: isChecked ? '#a7f3d0' : 'var(--text-muted)' }}>
                          {stu.turma}
                        </div>
                      </div>

                      <div style={{ color: isChecked ? '#10b981' : 'var(--text-dim)' }}>
                        {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botão de Confirmação em Lote */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleResetFlow}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmBatchVanRelease}
                  disabled={isVanSubmitting || selectedVanStudentIds.length === 0}
                  className="button-primary"
                  style={{
                    padding: '14px 32px',
                    fontSize: '1rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Bus size={20} />
                  <span>
                    {isVanSubmitting 
                      ? 'Processando Embarque...' 
                      : `Confirmar Embarque em Lote (${selectedVanStudentIds.length} Alunos)`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Sub-passo 4: Embarque em Lote Concluído */}
          {vanStep === 'van_result' && vanBatchResult && (
            <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(6, 182, 212, 0.16) 100%)',
                border: '2px solid var(--success)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px',
                marginBottom: '20px',
                boxShadow: 'var(--shadow-green-glow)'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px'
                }}>
                  <CheckCheck size={38} color="#fff" />
                </div>

                <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                  EMBARQUE COLETIVO CONCLUÍDO COM SUCESSO!
                </h3>
                <p style={{ fontSize: '0.95rem', color: '#a7f3d0' }}>
                  {vanBatchResult.count} alunos liberados com segurança para o motorista <strong>{vanBatchResult.driver.nome}</strong>.
                </p>

                {/* Grid dos Alunos Liberados */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '8px',
                  marginTop: '18px'
                }}>
                  {vanBatchResult.students.map(stu => (
                    <div
                      key={stu.id}
                      style={{
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textAlign: 'left'
                      }}
                    >
                      <img
                        src={stu.foto}
                        alt={stu.nome}
                        style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {stu.nome}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#a7f3d0' }}>
                          {stu.turma.split(' - ')[0]}
                        </div>
                      </div>
                      <Check size={14} color="#10b981" />
                    </div>
                  ))}
                </div>

                {/* Notificações WhatsApp Disparadas */}
                <div style={{
                  marginTop: '16px',
                  background: 'rgba(22, 163, 74, 0.15)',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  color: '#86efac',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={16} />
                  <span>Notificações automáticas de embarque enviadas via WhatsApp para todas as famílias.</span>
                </div>
              </div>

              <button
                type="button"
                className="button-primary"
                onClick={handleResetFlow}
                style={{ padding: '12px 28px', fontSize: '0.95rem' }}
              >
                Concluir e Retornar ao Início
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de Cadastro de Rosto */}
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        studentId={identifiedStudent?.id || allStudents[0]?.id}
      />

      {/* Modal de Cadastro de Novo Aluno */}
      <StudentModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        onSaved={(newStudent) => {
          setSearchQuery(newStudent.matricula);
          performStudentSearch(newStudent.matricula);
        }}
      />
    </div>
  );
}
