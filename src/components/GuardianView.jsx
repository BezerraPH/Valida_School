import React, { useState, useEffect, useRef } from 'react';
import { 
  KeyRound, Clock, 
  Share2, Copy, CheckCheck, Bell,
  Home, Users, Settings, Wifi, Battery, Sparkles,
  Bus, UserX, FileCheck, FileText, ChevronRight, CheckSquare, Square,
  Camera, Upload, Video, Lock, Edit3, Trash2, ScanFace, CheckCircle2, AlertCircle
} from 'lucide-react';
import { 
  getStudents, getActivePinForStudent, generatePinForStudent, 
  generateFamilyPin, revokeAuthorizationLocal, updateGuardianProfileLocal,
  subscribeStorage, getExitLogs 
} from '../services/storage';
import {
  startCameraStream, stopCameraStream, detectFaceAndComputeDescriptor,
  compareDescriptors, getVideoDevices, captureVideoFrameDataUrl,
  extractDescriptorFromImageUrl, MIN_SIMILARITY_THRESHOLD
} from '../services/faceService';
import { playPinClick, playSuccessChime, playErrorBuzzer } from '../services/audioService';
import RegisterModal from './RegisterModal';
import ThirdPartyModal from './ThirdPartyModal';
import TermViewerModal from './TermViewerModal';

export default function GuardianView() {
  const [students, setStudents] = useState(() => getStudents());

  // Filhos vinculados a esta mãe
  const familyChildren = students.filter(s => 
    s.responsaveis?.some(r => r.nome?.includes('Ana Silva') || r.id === 'resp-ana' || r.cpf === '11122233344')
  );

  // Se por acaso não achar nenhum (ex: storage vazio), pega os 2 primeiros
  const childrenList = familyChildren.length > 0 ? familyChildren : students.slice(0, 2);

  // Busca dados atualizados da mãe logada direto do storage sincronizado
  const storedAna = childrenList
    .flatMap(c => c.responsaveis || [])
    .find(r => r.id === 'resp-ana' || r.nome?.includes('Ana Silva'));

  const loggedGuardian = storedAna || {
    id: 'resp-ana',
    nome: 'Ana Silva Pereira',
    cpf: '111.222.333-44',
    telefone: '(11) 98765-4321',
    email: 'ana.silva@email.com',
    foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
    parentesco: 'Mãe (Responsável Legal)',
    biometriaCadastrada: false,
    faceDescriptor: null
  };

  // Multi-seleção de filhos para o PIN Familiar
  const [selectedStudentIds, setSelectedStudentIds] = useState(
    childrenList.map(c => c.id)
  );

  const [activePin, setActivePin] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isThirdPartyModalOpen, setIsThirdPartyModalOpen] = useState(false);
  const [editingAuth, setEditingAuth] = useState(null);
  const [isTermViewerOpen, setIsTermViewerOpen] = useState(false);
  const [selectedAuthForTerm, setSelectedAuthForTerm] = useState(null);
  const [exitLogs, setExitLogs] = useState(() => getExitLogs());
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'adults', 'history', 'profile'
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Estados da aba Perfil (Edição permitida: Foto, Telefone, E-mail) & Teste Facial
  const [phoneDraft, setPhoneDraft] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const profilePhone = phoneDraft !== null ? phoneDraft : (loggedGuardian.telefone || '');
  const profileEmail = emailDraft !== null ? emailDraft : (loggedGuardian.email || '');
  const setProfilePhone = (val) => setPhoneDraft(val);
  const setProfileEmail = (val) => setEmailDraft(val);
  const [profileMsg, setProfileMsg] = useState('');
  const [cameraMode, setCameraMode] = useState(null); // 'profile_update' | 'face_test' | null
  const [faceTestTargetId, setFaceTestTargetId] = useState(loggedGuardian.id);
  const [faceTestResult, setFaceTestResult] = useState(null);
  const [isProcessingFace, setIsProcessingFace] = useState(false);
  const [faceErrorMsg, setFaceErrorMsg] = useState('');
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => localStorage.getItem('valida_school_preferred_camera') || '');

  const profileVideoRef = useRef(null);
  const profileStreamRef = useRef(null);
  const profileFileInputRef = useRef(null);
  const testFileInputRef = useRef(null);

  useEffect(() => {
    getVideoDevices().then(devs => {
      setVideoDevices(devs);
      setSelectedCameraId(prev => prev || (devs.length > 0 ? devs[0].deviceId : ''));
    });
  }, []);

  function stopProfileCamera() {
    if (profileStreamRef.current) {
      stopCameraStream(profileStreamRef.current);
      profileStreamRef.current = null;
    }
  }

  useEffect(() => {
    if (!cameraMode || activeTab !== 'profile') {
      stopProfileCamera();
      return;
    }

    let active = true;
    (async () => {
      try {
        stopProfileCamera();
        setFaceErrorMsg('');
        await new Promise(r => setTimeout(r, 80));
        if (!active) return;
        const stream = await startCameraStream(profileVideoRef.current, selectedCameraId);
        if (active) {
          profileStreamRef.current = stream;
        } else {
          stopCameraStream(stream);
        }
      } catch (err) {
        if (active) {
          setFaceErrorMsg(err.message || 'Câmera indisponível neste dispositivo. Use o envio de foto.');
        }
      }
    })();

    return () => {
      active = false;
      stopProfileCamera();
    };
  }, [cameraMode, activeTab, selectedCameraId]);

  // Sincroniza hora do topo estilo iOS
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Recarrega dados quando houver alteração no storage ou WebSocket
  useEffect(() => {
    function refreshData() {
      const currentList = getStudents();
      setStudents(currentList);
      
      // Checa se há PIN ativo para algum dos filhos selecionados
      if (selectedStudentIds.length > 0) {
        const pin = getActivePinForStudent(selectedStudentIds[0]);
        setActivePin(pin);
      }
      setExitLogs(getExitLogs());
    }

    const unsubscribe = subscribeStorage(refreshData);
    refreshData();
    return () => unsubscribe();
  }, [selectedStudentIds]);

  // Timer regressivo do PIN ativo
  useEffect(() => {
    if (!activePin) {
      return;
    }

    function updateTimer() {
      const remaining = Math.max(0, Math.floor((activePin.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setActivePin(null);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activePin]);

  function handleToggleChild(childId) {
    if (selectedStudentIds.includes(childId)) {
      if (selectedStudentIds.length === 1) return; // Mantém pelo menos um selecionado
      setSelectedStudentIds(selectedStudentIds.filter(id => id !== childId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, childId]);
    }
  }

  function handleGeneratePin() {
    if (selectedStudentIds.length === 0) return;
    playPinClick();

    let newPin;
    if (selectedStudentIds.length > 1) {
      newPin = generateFamilyPin(selectedStudentIds, `${loggedGuardian.nome} (App)`);
    } else {
      newPin = generatePinForStudent(selectedStudentIds[0]);
    }

    setActivePin(newPin);
    playSuccessChime();
  }

  function handleCopyPin() {
    if (!activePin) return;
    navigator.clipboard.writeText(activePin.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShareWhatsApp() {
    if (!activePin) return;
    const selectedNames = childrenList
      .filter(c => selectedStudentIds.includes(c.id))
      .map(c => c.nome)
      .join(' e ');

    const msg = encodeURIComponent(
      `🔒 *Valida School - Código de Saída Familiar*\n\n` +
      `Aluno(s): *${selectedNames}*\n` +
      `Código PIN: *${activePin.code}*\n` +
      `Válido por 15 minutos.\n\n` +
      `Apresente este código no Totem da Portaria para iniciar a validação biométrica e liberar a saída simultânea.`
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  }

  function handleRevokeAdult(authId, adultName) {
    const confirmRevoke = window.confirm(
      `ATENÇÃO: Deseja realmente revogar a autorização de retirada de "${adultName}"?\n\nEsta pessoa será bloqueada imediatamente no Totem da Portaria e não poderá retirar as crianças.`
    );
    if (!confirmRevoke) return;

    revokeAuthorizationLocal(authId, false);
    playPinClick();
  }

  function handleDeleteAdult(authId, adultName) {
    const confirmDelete = window.confirm(
      `Deseja APAGAR permanentemente o cadastro de "${adultName}" da sua lista de autorizados?\n\nEsta ação removerá o cadastro e o acesso imediatamente.`
    );
    if (!confirmDelete) return;

    revokeAuthorizationLocal(authId, true);
    playPinClick();
  }

  function handleSaveSimpleProfile(e) {
    e.preventDefault();
    updateGuardianProfileLocal(loggedGuardian.id, {
      telefone: profilePhone.trim(),
      email: profileEmail.trim()
    });
    setProfileMsg('Dados de contato salvos com sucesso!');
    playSuccessChime();
    setTimeout(() => setProfileMsg(''), 3000);
  }

  async function runBiometricCaptureFromVideoOrImage(imgOrCanvas, previewDataUrl) {
    setIsProcessingFace(true);
    setFaceErrorMsg('');
    try {
      const detection = await detectFaceAndComputeDescriptor(imgOrCanvas);
      if (!detection || !detection.descriptor) {
        setFaceErrorMsg('Nenhum rosto detectado com clareza. Melhore a iluminação e tente novamente.');
        playErrorBuzzer();
        return;
      }

      if (cameraMode === 'profile_update') {
        updateGuardianProfileLocal(loggedGuardian.id, {
          foto: previewDataUrl,
          faceDescriptor: detection.descriptor
        });
        setProfileMsg('Foto de perfil e biometria facial atualizadas com sucesso!');
        setCameraMode(null);
        stopProfileCamera();
        playSuccessChime();
        setTimeout(() => setProfileMsg(''), 4000);
      } else if (cameraMode === 'face_test') {
        const targetAdult = familyAdultsList.find(a => a.id === faceTestTargetId) || loggedGuardian;
        let savedDescriptor = targetAdult.faceDescriptor;

        // Tenta extrair descriptor direto da foto do perfil se ainda não houver vetor salvo
        if (!savedDescriptor && targetAdult.foto) {
          const fallbackDet = await extractDescriptorFromImageUrl(targetAdult.foto);
          if (fallbackDet && fallbackDet.descriptor) {
            savedDescriptor = fallbackDet.descriptor;
            if (targetAdult.id === loggedGuardian.id) {
              updateGuardianProfileLocal(loggedGuardian.id, { faceDescriptor: savedDescriptor });
            }
          }
        }

        if (!savedDescriptor) {
          setFaceTestResult({
            approved: false,
            similarity: 0,
            distance: 1.0,
            targetName: targetAdult.nome,
            noProfileVector: true,
            previewUrl: previewDataUrl,
            message: 'A foto atual do perfil não possui vetor facial válido para comparação. Atualize sua foto de perfil primeiro.'
          });
          playErrorBuzzer();
          setCameraMode(null);
          stopProfileCamera();
          return;
        }

        const comparison = compareDescriptors(detection.descriptor, savedDescriptor);
        const approved = comparison.similarity >= MIN_SIMILARITY_THRESHOLD;
        setFaceTestResult({
          approved,
          similarity: comparison.similarity,
          distance: comparison.distance,
          targetName: targetAdult.nome,
          noProfileVector: false,
          previewUrl: previewDataUrl,
          message: approved
            ? `Reconhecimento APROVADO! Sua foto de perfil está pronta para liberar no Totem (${comparison.similarity}% >= ${MIN_SIMILARITY_THRESHOLD}%).`
            : `Similaridade baixa (${comparison.similarity}%). Recomendamos atualizar a foto do perfil com melhor iluminação.`
        });
        setCameraMode(null);
        stopProfileCamera();
        if (approved) playSuccessChime();
        else playErrorBuzzer();
      }
    } catch (err) {
      setFaceErrorMsg('Erro ao processar rosto: ' + err.message);
    } finally {
      setIsProcessingFace(false);
    }
  }

  async function handleProfileSnapCamera() {
    if (!profileVideoRef.current) return;
    const snapped = captureVideoFrameDataUrl(profileVideoRef.current, true);
    if (!snapped) return;
    await runBiometricCaptureFromVideoOrImage(snapped.canvas, snapped.dataUrl);
  }

  function handleProfileFileUpload(e, mode) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setCameraMode(mode);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const img = new Image();
      img.onload = async () => {
        await runBiometricCaptureFromVideoOrImage(img, dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  const formatMinutes = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Coleta todas as pessoas autorizadas vinculadas aos filhos desta família
  const allFamilyAdultsMap = new Map();
  childrenList.forEach(child => {
    (child.responsaveis || []).forEach(adult => {
      const key = adult.id || adult.cpf || adult.nome;
      if (!allFamilyAdultsMap.has(key)) {
        allFamilyAdultsMap.set(key, {
          ...adult,
          alunoNomes: [child.nome]
        });
      } else {
        const existing = allFamilyAdultsMap.get(key);
        if (!existing.alunoNomes.includes(child.nome)) {
          existing.alunoNomes.push(child.nome);
        }
      }
    });
  });
  const familyAdultsList = Array.from(allFamilyAdultsMap.values());

  const selectedChildren = childrenList.filter(c => selectedStudentIds.includes(c.id));
  const isMultiChild = selectedChildren.length > 1;

  // Logs de saída dos filhos da família
  const familyExits = exitLogs.filter(log => childrenList.some(c => c.id === log.studentId));

  return (
    <div className="phone-mockup-wrapper">
      {/* iOS Top Status Bar */}
      <div className="phone-top-bar">
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>
          {currentTimeStr || '09:41'}
        </span>
        <div className="dynamic-island">
          <div className="dynamic-island-cam" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fff' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700 }}>5G</span>
          <Wifi size={14} />
          <Battery size={16} />
        </div>
      </div>

      {/* Main Screen Content */}
      <div className="phone-screen">
        {/* App Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Portal do Responsável
              </span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                Família Silva
              </span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginTop: '2px' }}>
              {activeTab === 'home' && 'Liberação de Saída'}
              {activeTab === 'adults' && 'Autorizados & Vans'}
              {activeTab === 'history' && 'Notificações & Histórico'}
              {activeTab === 'profile' && 'Perfil & Teste Facial'}
            </h2>
          </div>

          <button
            onClick={() => {
              setActiveTab('profile');
              setFaceTestTargetId(loggedGuardian.id);
              setFaceTestResult(null);
              setCameraMode('face_test');
            }}
            title="Testar reconhecimento facial do meu perfil"
            style={{
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              borderRadius: 'var(--radius-full)',
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <ScanFace size={14} />
            <span>Testar Rosto</span>
          </button>
        </div>

        {/* ========================================================
            TAB 1: INÍCIO (SELETOR MULTI-FILHOS & PIN FAMILIAR)
            ======================================================== */}
        {activeTab === 'home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Multi-Child Selection Widget */}
            <div className="card-glass" style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Filhos na Escola ({childrenList.length})
                </span>
                <span style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 700 }}>
                  Toque para marcar/desmarcar
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: childrenList.length > 1 ? '1fr 1fr' : '1fr', gap: '8px' }}>
                {childrenList.map(child => {
                  const isChecked = selectedStudentIds.includes(child.id);
                  return (
                    <div
                      key={child.id}
                      onClick={() => handleToggleChild(child.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isChecked ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                        border: isChecked ? '1.5px solid #818cf8' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <img
                        src={child.foto}
                        alt={child.nome}
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          border: isChecked ? '1px solid #818cf8' : 'none'
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {child.nome.split(' ')[0]}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {child.turma.split(' - ')[0]}
                        </div>
                      </div>

                      <div style={{ color: isChecked ? '#818cf8' : 'var(--text-dim)' }}>
                        {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dynamic PIN Token Generator */}
            <div 
              className="card-glass" 
              style={{ 
                background: 'linear-gradient(180deg, rgba(22, 31, 54, 0.95) 0%, rgba(15, 20, 34, 0.95) 100%)',
                border: activePin ? '1.5px solid rgba(99, 102, 241, 0.6)' : '1px solid var(--border-subtle)',
                position: 'relative',
                overflow: 'hidden',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyRound size={15} color="#818cf8" />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff', display: 'block' }}>
                      {isMultiChild ? 'PIN Familiar Unificado' : 'PIN de Saída Individual'}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700 }}>
                      {isMultiChild 
                        ? `Liberando ${selectedChildren.length} irmãos simultaneamente` 
                        : `Liberando ${selectedChildren[0]?.nome.split(' ')[0] || 'Aluno'}`}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                  Válido 15 min
                </span>
              </div>

              {/* Tag com os alunos contemplados */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                {selectedChildren.map(c => (
                  <span
                    key={c.id}
                    style={{
                      fontSize: '0.68rem',
                      background: 'rgba(99, 102, 241, 0.25)',
                      color: '#a5b4fc',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700
                    }}
                  >
                    ✓ {c.nome.split(' ')[0]} ({c.turma.split(' - ')[0]})
                  </span>
                ))}
              </div>

              {activePin ? (
                <div>
                  {/* Pin Number Large Display */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    background: 'rgba(0, 0, 0, 0.45)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    marginBottom: '10px'
                  }}>
                    {activePin.code.split('').map((digit, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '1.8rem',
                          fontWeight: 900,
                          color: '#fff',
                          fontFamily: 'monospace',
                          width: '32px',
                          textAlign: 'center',
                          textShadow: '0 0 16px rgba(99, 102, 241, 0.8)'
                        }}
                      >
                        {digit}
                      </span>
                    ))}
                  </div>

                  {/* Countdown Timer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700, marginBottom: '12px' }}>
                    <Clock size={15} />
                    <span>Expira em: {formatMinutes(timeLeft)}</span>
                  </div>

                  {/* Actions for PIN */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={handleCopyPin}
                      className="button-secondary"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', fontSize: '0.78rem' }}
                    >
                      {copied ? <CheckCheck size={14} color="#10b981" /> : <Copy size={14} />}
                      <span>{copied ? 'Copiado!' : 'Copiar PIN'}</span>
                    </button>

                    <button
                      onClick={handleShareWhatsApp}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#fff',
                        background: '#16a34a',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer'
                      }}
                    >
                      <Share2 size={14} />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.4 }}>
                    {isMultiChild 
                      ? 'Gere 1 único código PIN para liberar todos os seus filhos de uma só vez na portaria.'
                      : 'Gere o código de segurança para apresentar no totem escolar.'}
                  </p>

                  <button
                    onClick={handleGeneratePin}
                    className="button-primary"
                    style={{
                      width: '100%',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
                      boxShadow: '0 6px 20px rgba(99, 102, 241, 0.4)',
                      fontWeight: 800,
                      fontSize: '0.9rem'
                    }}
                  >
                    <Sparkles size={18} />
                    <span>
                      {isMultiChild 
                        ? `Gerar PIN Familiar Único (${selectedChildren.length} Irmãos)`
                        : 'Gerar PIN de Saída (15 min)'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Access to Authorizations */}
            <div 
              onClick={() => setActiveTab('adults')}
              className="card-glass"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Bus size={17} color="#f59e0b" />
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
                    Autorizar Tios, Avós ou Van Escolar
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Com emissão de Termo Eletrônico (LGPD Art. 14)
                  </div>
                </div>
              </div>
              <ChevronRight size={16} color="var(--text-dim)" />
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: GESTÃO DE ADULTOS AUTORIZADOS & VANS (COM TERMO)
            ======================================================== */}
        {activeTab === 'adults' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
                Gerencie quem pode retirar seus filhos. Apenas adultos cadastrados com biometria ou van têm liberação.
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <button
                onClick={() => {
                  setEditingAuth(null);
                  setIsThirdPartyModalOpen(true);
                }}
                className="button-primary"
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  fontSize: '0.85rem'
                }}
              >
                <FileCheck size={18} />
                <span>+ Autorizar Terceiro ou Van Escolar (Termo LGPD)</span>
              </button>
            </div>

            {/* List of Authorized Adults & Vans */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {familyAdultsList.map(adult => {
                const isLegal = adult.tipo === 'LEGAL' || adult.parentesco?.includes('Responsável Legal');
                const isVan = adult.tipo === 'VAN' || adult.isTransportador;
                const isRevoked = adult.status === 'REVOGADO';

                return (
                  <div
                    key={adult.id || adult.cpf}
                    className="card-glass"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '12px',
                      border: isRevoked 
                        ? '1px dashed rgba(239, 68, 68, 0.4)' 
                        : isVan 
                        ? '1px solid rgba(245, 158, 11, 0.35)' 
                        : '1px solid var(--border-subtle)',
                      opacity: isRevoked ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img
                        src={adult.foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80'}
                        alt={adult.nome}
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: isLegal 
                            ? '2px solid #3b82f6' 
                            : isVan 
                            ? '2px solid #f59e0b' 
                            : '2px solid #a855f7'
                        }}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '0.88rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {adult.nome}
                          </strong>
                        </div>

                        <div style={{ fontSize: '0.74rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{adult.parentesco}</span>
                          {adult.vanEmpresa && (
                            <span style={{ color: '#fbbf24', fontSize: '0.68rem', fontWeight: 700 }}>
                              • {adult.vanEmpresa} ({adult.vanPlaca || 'Van'})
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          CPF: {adult.cpf || 'Não informado'}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: isRevoked ? '#f87171' : 'var(--success)',
                        background: isRevoked ? 'rgba(239, 68, 68, 0.15)' : 'var(--success-surface)',
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-full)'
                      }}>
                        {isRevoked ? 'Revogado' : 'Ativo'}
                      </span>
                    </div>

                    {/* Meta info: Alunos autorizados e Vigência */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)'
                    }}>
                      <div>
                        <span>Autorizado para: </span>
                        <strong style={{ color: '#fff' }}>
                          {adult.alunoNomes?.map(n => n.split(' ')[0]).join(', ') || 'Filhos'}
                        </strong>
                        <span style={{ marginLeft: '6px', color: 'var(--text-dim)' }}>
                          ({adult.validadeTipo === 'HOJE' ? 'Hoje' : adult.validadeTipo === 'MENSAL' ? '30 dias' : 'Ano Letivo'})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setSelectedAuthForTerm({
                              ...adult,
                              criadoPorNome: loggedGuardian.nome
                            });
                            setIsTermViewerOpen(true);
                          }}
                          style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            color: '#a5b4fc',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            cursor: 'pointer'
                          }}
                        >
                          <FileText size={11} />
                          <span>Termo</span>
                        </button>

                        {isLegal ? (
                          <span style={{
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: '#93c5fd',
                            padding: '3px 7px',
                            borderRadius: '4px',
                            fontSize: '0.64rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <Lock size={10} />
                            <span>Escola</span>
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingAuth(adult);
                                setIsThirdPartyModalOpen(true);
                              }}
                              style={{
                                background: 'rgba(6, 182, 212, 0.14)',
                                border: '1px solid rgba(6, 182, 212, 0.35)',
                                color: '#67e8f9',
                                padding: '3px 7px',
                                borderRadius: '4px',
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              <Edit3 size={11} />
                              <span>Editar</span>
                            </button>

                            {!isRevoked && (
                              <button
                                onClick={() => handleRevokeAdult(adult.authId || adult.id, adult.nome)}
                                style={{
                                  background: 'rgba(245, 158, 11, 0.14)',
                                  border: '1px solid rgba(245, 158, 11, 0.35)',
                                  color: '#fbbf24',
                                  padding: '3px 7px',
                                  borderRadius: '4px',
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  cursor: 'pointer'
                                }}
                              >
                                <UserX size={11} />
                                <span>Revogar</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteAdult(adult.authId || adult.id, adult.nome)}
                              style={{
                                background: 'rgba(239, 68, 68, 0.12)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#f87171',
                                padding: '3px 7px',
                                borderRadius: '4px',
                                fontSize: '0.66rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              <Trash2 size={11} />
                              <span>Apagar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 3: HISTÓRICO DE NOTIFICAÇÕES DE SAÍDA
            ======================================================== */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Registro de todas as liberações de saída registradas no portão escolar.
            </span>

            {familyExits.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Nenhuma liberação registrada até o momento nesta data.
              </div>
            ) : (
              familyExits.map(log => (
                <div key={log.id} className="card-glass" style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCheck size={14} />
                      LIBERADO NO PORTÃO
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {log.fotoCapturadaAoVivo && (
                      <img
                        src={log.fotoCapturadaAoVivo}
                        alt="Ao vivo"
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: 'var(--radius-sm)',
                          objectFit: 'cover',
                          border: '1px solid var(--success)'
                        }}
                      />
                    )}
                    <div>
                      <div style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 800 }}>
                        Aluno: {log.alunoNome}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#818cf8' }}>
                        Retirado por: {log.adultoNome} ({log.adultoParentesco})
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                        Método: {log.metodo}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================================
            TAB 4: PERFIL EDITÁVEL (FOTO/CONTATO) & TESTE FACIAL
            ======================================================== */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.84rem' }}>
            {profileMsg && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem',
                fontWeight: 700
              }}>
                ✓ {profileMsg}
              </div>
            )}

            {faceErrorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.78rem'
              }}>
                {faceErrorMsg}
              </div>
            )}

            {/* Hidden File Inputs */}
            <input
              type="file"
              ref={profileFileInputRef}
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={e => handleProfileFileUpload(e, 'profile_update')}
            />
            <input
              type="file"
              ref={testFileInputRef}
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={e => handleProfileFileUpload(e, 'face_test')}
            />

            {/* Card 1: Foto Biométrica & Edição Simples */}
            <div className="card-glass" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={loggedGuardian.foto || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80'}
                  alt={loggedGuardian.nome}
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: loggedGuardian.faceDescriptor ? '2px solid #10b981' : '2px solid #f59e0b'
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ color: '#fff', display: 'block', fontSize: '0.96rem' }}>
                    {loggedGuardian.nome}
                  </strong>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: loggedGuardian.faceDescriptor ? '#10b981' : '#fbbf24'
                  }}>
                    {loggedGuardian.faceDescriptor
                      ? '✓ Biometria Facial Ativa (128 pontos)'
                      : '⚠️ Sem vetor facial salvo — atualize sua selfie'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setFaceTestResult(null);
                    setCameraMode(cameraMode === 'profile_update' ? null : 'profile_update');
                  }}
                  style={{ padding: '7px 10px', fontSize: '0.74rem' }}
                >
                  <Camera size={14} />
                  <span>{cameraMode === 'profile_update' ? 'Fechar Câmera' : 'Alterar Foto (Câmera)'}</span>
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => profileFileInputRef.current && profileFileInputRef.current.click()}
                  style={{ padding: '7px 10px', fontSize: '0.74rem' }}
                >
                  <Upload size={14} />
                  <span>Enviar Selfie / Arquivo</span>
                </button>
              </div>

              {/* Form editável simples: Telefone e E-mail */}
              <form onSubmit={handleSaveSimpleProfile} style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                    WhatsApp / Telefone (Editável):
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={profilePhone}
                    onChange={e => setProfilePhone(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                    E-mail de Notificações (Editável):
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="seu.email@exemplo.com"
                    value={profileEmail}
                    onChange={e => setProfileEmail(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: '0.82rem' }}
                  />
                </div>
                <button type="submit" className="button-primary" style={{ padding: '8px', fontSize: '0.8rem' }}>
                  Salvar Dados Simples do Perfil
                </button>
              </form>
            </div>

            {/* Card 2: Teste de Reconhecimento Facial (Self-Check) */}
            <div className="card-glass" style={{ padding: '14px', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <ScanFace size={18} color="#10b981" />
                <strong style={{ color: '#fff', fontSize: '0.9rem' }}>
                  Teste de Reconhecimento Facial
                </strong>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
                Valide agora se a foto salva no perfil está reconhecendo corretamente antes de ir até o Totem da escola.
              </p>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                  Quem deseja testar?
                </label>
                <select
                  className="input-field"
                  value={faceTestTargetId}
                  onChange={e => {
                    setFaceTestTargetId(e.target.value);
                    setFaceTestResult(null);
                  }}
                  style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                >
                  <option value={loggedGuardian.id}>Meu Perfil: {loggedGuardian.nome}</option>
                  {familyAdultsList
                    .filter(a => a.id !== loggedGuardian.id)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        Autorizado: {a.nome} ({a.parentesco})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    setFaceTestResult(null);
                    setCameraMode(cameraMode === 'face_test' ? null : 'face_test');
                  }}
                  style={{
                    padding: '8px',
                    fontSize: '0.76rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  }}
                >
                  <Camera size={14} />
                  <span>{cameraMode === 'face_test' ? 'Fechar Teste' : 'Testar Câmera'}</span>
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => testFileInputRef.current && testFileInputRef.current.click()}
                  style={{ padding: '8px', fontSize: '0.76rem' }}
                >
                  <Upload size={14} />
                  <span>Testar Foto</span>
                </button>
              </div>

              {/* Câmera Ativa (para Atualizar Foto ou Testar Rosto) */}
              {cameraMode && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#818cf8', marginBottom: '6px' }}>
                    {cameraMode === 'profile_update' ? '📸 Capturar Nova Foto do Perfil' : '🔍 Aponte o rosto para testar reconhecimento'}
                  </div>
                  {videoDevices.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Video size={13} color="#818cf8" />
                      <select
                        className="input-field"
                        value={selectedCameraId}
                        onChange={e => {
                          setSelectedCameraId(e.target.value);
                          localStorage.setItem('valida_school_preferred_camera', e.target.value);
                        }}
                        style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                      >
                        {videoDevices.map(d => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Câmera ${d.deviceId.slice(0, 6)}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ position: 'relative', height: '200px', background: '#000', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                    <video
                      ref={profileVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                    />
                  </div>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleProfileSnapCamera}
                    disabled={isProcessingFace}
                    style={{ width: '100%', padding: '9px', fontSize: '0.8rem' }}
                  >
                    <Camera size={15} />
                    <span>
                      {isProcessingFace
                        ? 'Processando Biometria...'
                        : (cameraMode === 'profile_update' ? 'Salvar Nova Foto de Perfil' : 'Verificar Compatibilidade Facial')}
                    </span>
                  </button>
                </div>
              )}

              {/* Resultado do Teste Facial */}
              {faceTestResult && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: faceTestResult.approved ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                  border: `1px solid ${faceTestResult.approved ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    {faceTestResult.approved ? <CheckCircle2 size={18} color="#10b981" /> : <AlertCircle size={18} color="#f87171" />}
                    <strong style={{ color: '#fff', fontSize: '0.82rem' }}>
                      {faceTestResult.approved ? `Aprovado (${faceTestResult.similarity}% similaridade)` : 'Atenção: Teste Reprovado'}
                    </strong>
                  </div>
                  <p style={{ fontSize: '0.73rem', color: '#e2e8f0', margin: 0, lineHeight: 1.4 }}>
                    {faceTestResult.message}
                  </p>
                </div>
              )}
            </div>

            {/* Card 3: Dados Protegidos Gerenciados Exclusivamente pela Escola */}
            <div className="card-glass" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.92 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#fbbf24', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Lock size={13} />
                  <span>Dados Bloqueados (Exclusivo Escola)</span>
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>Nome Completo & CPF (Somente Leitura)</label>
                <div style={{ background: 'rgba(0,0,0,0.28)', padding: '7px 10px', borderRadius: '6px', color: '#cbd5e1', fontSize: '0.78rem', marginTop: '3px' }}>
                  {loggedGuardian.nome} • CPF: {loggedGuardian.cpf}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem', display: 'block', marginBottom: '4px' }}>
                  Crianças Matriculadas ({childrenList.length} — não editável pelo app):
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {childrenList.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#cbd5e1', background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: '6px' }}>
                      <Lock size={12} color="#64748b" />
                      <span><strong>{c.nome}</strong> — {c.turma} (Matrícula: {c.matricula})</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: '#818cf8' }}>Instituição:</strong> Colégio Valida School — Para alterar CPF, matrícula ou dependentes, procure a secretaria.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* iOS Bottom Tab Bar */}
      <nav className="phone-bottom-nav">
        <button
          onClick={() => setActiveTab('home')}
          className={`tab-nav-item ${activeTab === 'home' ? 'active' : ''}`}
        >
          <Home size={18} />
          <span>Início</span>
        </button>

        <button
          onClick={() => setActiveTab('adults')}
          className={`tab-nav-item ${activeTab === 'adults' ? 'active' : ''}`}
        >
          <Users size={18} />
          <span>Autorizados</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`tab-nav-item ${activeTab === 'history' ? 'active' : ''}`}
        >
          <Bell size={18} />
          <span>Histórico</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`tab-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        >
          <Settings size={18} />
          <span>Perfil</span>
        </button>
      </nav>

      {/* Home Indicator */}
      <div className="home-indicator" />

      {/* Modal to Register New Adult with Live Camera */}
      <RegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        studentId={childrenList[0]?.id}
        onSaved={() => {
          setStudents(getStudents());
        }}
      />

      {/* Modal to Authorize or Edit Third-Party or Van Driver with Legal Term */}
      <ThirdPartyModal
        isOpen={isThirdPartyModalOpen}
        onClose={() => {
          setIsThirdPartyModalOpen(false);
          setEditingAuth(null);
        }}
        currentGuardian={loggedGuardian}
        childrenList={childrenList}
        editingAuth={editingAuth}
        onAuthorized={() => {
          setStudents(getStudents());
          setEditingAuth(null);
        }}
      />

      {/* Modal to View Digital Signed LGPD Term Certificate */}
      <TermViewerModal
        isOpen={isTermViewerOpen}
        onClose={() => setIsTermViewerOpen(false)}
        authorization={selectedAuthForTerm}
      />
    </div>
  );
}
