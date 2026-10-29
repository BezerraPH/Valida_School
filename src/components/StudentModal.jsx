import React, { useState, useRef, useEffect } from 'react';
import { 
  GraduationCap, X, Check, Camera, UserCheck, 
  AlertCircle, Upload, User, Video, Copy, CheckCheck, CheckCircle2
} from 'lucide-react';
import { 
  startCameraStream, stopCameraStream, detectFaceAndComputeDescriptor, 
  getVideoDevices 
} from '../services/faceService';
import { addStudent, getStudents, generatePinForStudent } from '../services/storage';
import { playSuccessChime } from '../services/audioService';

export default function StudentModal({ isOpen, onClose, onSaved }) {
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [cpf, setCpf] = useState('');
  const [turma, setTurma] = useState('5º Ano - Fundamental I');
  const [turno, setTurno] = useState('Tarde');
  const [fotoAluno, setFotoAluno] = useState('https://images.unsplash.com/photo-1544717305-2782549b5136?w=240&auto=format&fit=crop&q=80');

  // Responsável Inicial
  const [respNome, setRespNome] = useState('');
  const [respParentesco, setRespParentesco] = useState('Pai/Mãe');
  const [respTelefone, setRespTelefone] = useState('');
  const [respFoto, setRespFoto] = useState('');
  const [respDescriptor, setRespDescriptor] = useState(null);

  // Success Confirmation State
  const [createdSuccess, setCreatedSuccess] = useState(null); // { student, pin }
  const [copiedPin, setCopiedPin] = useState(false);

  // Camera state for capturing student or guardian photo
  const [capturingFor, setCapturingFor] = useState(null); // 'student' | 'guardian' | null
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => localStorage.getItem('valida_school_preferred_camera') || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const studentFileRef = useRef(null);
  const guardianFileRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Auto-generate next matricula
      const current = getStudents();
      const nextNum = (current.length + 1).toString().padStart(2, '0');
      setMatricula(`2026${nextNum}`);

      setNome('');
      setCpf('');
      setTurma('5º Ano - Fundamental I');
      setTurno('Tarde');
      setFotoAluno('https://images.unsplash.com/photo-1544717305-2782549b5136?w=240&auto=format&fit=crop&q=80');

      setRespNome('');
      setRespParentesco('Pai/Mãe');
      setRespTelefone('');
      setRespFoto('');
      setRespDescriptor(null);
      setCapturingFor(null);
      setErrorMsg('');
      setCreatedSuccess(null);
      setCopiedPin(false);

      getVideoDevices().then(devs => {
        setVideoDevices(devs);
        setSelectedCameraId(prev => prev || (devs.length > 0 ? devs[0].deviceId : ''));
      });
    } else {
      stopCamera();
    }

    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Restart camera if target or camera device changes while capturing
  useEffect(() => {
    if (capturingFor) {
      let active = true;
      (async () => {
        try {
          stopCamera();
          await new Promise(r => setTimeout(r, 80));
          if (!active) return;
          const stream = await startCameraStream(videoRef.current, selectedCameraId);
          if (active) {
            streamRef.current = stream;
          } else {
            stopCameraStream(stream);
          }
        } catch {
          if (active) setErrorMsg('Não foi possível iniciar a câmera para captura.');
        }
      })();

      return () => {
        active = false;
        stopCamera();
      };
    }
  }, [capturingFor, selectedCameraId]);

  function stopCamera() {
    if (streamRef.current) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
  }

  function handleCameraChange(deviceId) {
    setSelectedCameraId(deviceId);
    localStorage.setItem('valida_school_preferred_camera', deviceId);
  }

  async function handleSnapPhoto() {
    if (!videoRef.current) return;
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photoUrl = canvas.toDataURL('image/jpeg', 0.85);

      if (capturingFor === 'student') {
        setFotoAluno(photoUrl);
        setCapturingFor(null);
        stopCamera();
      } else if (capturingFor === 'guardian') {
        // Extract real face descriptor for the guardian
        const detection = await detectFaceAndComputeDescriptor(canvas);
        if (!detection || !detection.descriptor) {
          setErrorMsg('Rosto do responsável não detectado com nitidez. Centralize o rosto e tente novamente.');
          setIsProcessing(false);
          return;
        }

        setRespFoto(photoUrl);
        setRespDescriptor(detection.descriptor);
        setCapturingFor(null);
        stopCamera();
      }
    } catch (err) {
      setErrorMsg('Erro na captura da foto: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  // Handle local image file upload
  function handleFileUpload(e, target) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;
      if (target === 'student') {
        setFotoAluno(dataUrl);
      } else if (target === 'guardian') {
        setIsProcessing(true);
        const img = new Image();
        img.onload = async () => {
          try {
            const detection = await detectFaceAndComputeDescriptor(img);
            if (!detection || !detection.descriptor) {
              setErrorMsg('Rosto do responsável não identificado nesta imagem. Tente outra foto mais nítida ou use a câmera.');
              setIsProcessing(false);
              return;
            }
            setRespFoto(dataUrl);
            setRespDescriptor(detection.descriptor);
          } catch (err) {
            setErrorMsg('Erro ao analisar biometria da imagem: ' + err.message);
          } finally {
            setIsProcessing(false);
          }
        };
        img.src = dataUrl;
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSaveStudent() {
    if (!nome.trim()) {
      setErrorMsg('Por favor, informe o nome completo do aluno.');
      return;
    }
    if (!matricula.trim()) {
      setErrorMsg('Por favor, informe a matrícula do aluno.');
      return;
    }

    const responsaveisList = [];
    if (respNome.trim()) {
      responsaveisList.push({
        id: 'resp-' + Date.now(),
        nome: respNome.trim(),
        parentesco: respParentesco,
        telefone: respTelefone.trim() || '(11) 99999-9999',
        cpf: 'Não informado',
        foto: respFoto || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
        biometriaCadastrada: !!respDescriptor,
        faceDescriptor: respDescriptor || null
      });
    }

    const newStudent = {
      id: 'stu-' + Date.now(),
      nome: nome.trim(),
      matricula: matricula.trim(),
      cpf: cpf.trim() || '00000000000',
      turma,
      turno,
      sala: 'Sala 01',
      foto: fotoAluno || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=240&auto=format&fit=crop&q=80',
      responsaveis: responsaveisList
    };

    addStudent(newStudent);
    // Automatically generate an active 15-min PIN for testing immediately!
    const activePinRecord = generatePinForStudent(newStudent.id);
    playSuccessChime();

    // Show success confirmation screen
    setCreatedSuccess({
      student: newStudent,
      pin: activePinRecord.code
    });

    if (onSaved) onSaved(newStudent);
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)'
            }}>
              <GraduationCap size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                Cadastrar Novo Aluno
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Adicione o estudante e vincule um responsável autorizado com biometria facial
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* ========================================================
            SUCCESS STATE: STUDENT CREATED + ACTIVE PIN READY
            ======================================================== */}
        {createdSuccess ? (
          <div style={{ textAlign: 'center', padding: '16px 10px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--success-surface)',
              border: '2px solid var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 0 24px rgba(16, 185, 129, 0.4)'
            }}>
              <CheckCircle2 size={36} color="var(--success)" />
            </div>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
              Aluno Cadastrado com Sucesso!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '22px' }}>
              O aluno <strong style={{ color: '#fff' }}>{createdSuccess.student.nome}</strong> está pronto para ser testado no Totem da Portaria.
            </p>

            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '18px 24px',
              maxWidth: '420px',
              margin: '0 auto 24px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>Matrícula (Busca no Totem):</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 800, color: 'var(--cyan-accent)' }}>
                  {createdSuccess.student.matricula}
                </span>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.82rem', color: '#818cf8', fontWeight: 700, display: 'block' }}>
                    PIN Dinâmico de Saída (15 min):
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Gerado automaticamente para o teste
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 900, color: '#fff', letterSpacing: '2px' }}>
                    {createdSuccess.pin}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdSuccess.pin);
                      setCopiedPin(true);
                      setTimeout(() => setCopiedPin(false), 2000);
                    }}
                    className="button-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    title="Copiar código PIN"
                  >
                    {copiedPin ? <CheckCheck size={14} color="var(--success)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {createdSuccess.student.responsaveis[0]?.biometriaCadastrada ? (
                <div style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserCheck size={14} color="var(--success)" />
                  <span>Biometria do responsável <strong>{createdSuccess.student.responsaveis[0].nome}</strong> gravada com sucesso!</span>
                </div>
              ) : (
                <div style={{ marginTop: '12px', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', color: '#fde68a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} color="var(--warning)" />
                  <span>Responsável cadastrado sem biometria. Use "Cadastrar Meu Rosto" para gravar.</span>
                </div>
              )}
            </div>

            <button
              className="button-primary"
              onClick={() => {
                setCreatedSuccess(null);
                onClose();
              }}
              style={{
                padding: '14px 34px',
                fontSize: '1.05rem',
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                boxShadow: '0 4px 18px rgba(6, 182, 212, 0.45)'
              }}
            >
              <span>Ir para o Totem e Testar Saída</span>
            </button>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div style={{
                background: 'var(--danger-surface)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Live Camera Viewport if Active */}
            {capturingFor && (
              <div style={{
                background: '#000',
                borderRadius: 'var(--radius-md)',
                border: '2px solid var(--primary)',
                padding: '14px',
                marginBottom: '20px',
                textAlign: 'center'
              }}>
                <h4 style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '8px' }}>
                  {capturingFor === 'student' ? 'Fotografar Rosto do Aluno' : 'Fotografar Biometria do Responsável'}
                </h4>

                {/* Camera selector if multiple cameras */}
                {videoDevices.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Video size={14} color="var(--cyan-accent)" />
                    <select
                      value={selectedCameraId}
                      onChange={e => handleCameraChange(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        borderRadius: 'var(--radius-xs)',
                        padding: '4px 8px'
                      }}
                    >
                      {videoDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId} style={{ background: '#111', color: '#fff' }}>
                          {d.label || `Câmera ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '380px',
                  height: '220px',
                  margin: '0 auto 12px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  background: '#050508'
                }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '130px',
                    height: '170px',
                    borderRadius: '50%',
                    border: '2px dashed #818cf8',
                    pointerEvents: 'none'
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setCapturingFor(null);
                      stopCamera();
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleSnapPhoto}
                    disabled={isProcessing}
                  >
                    <Camera size={16} />
                    <span>{isProcessing ? 'Processando Biometria...' : 'Capturar Foto'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Hidden File Inputs for upload */}
            <input
              type="file"
              ref={studentFileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleFileUpload(e, 'student')}
            />
            <input
              type="file"
              ref={guardianFileRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleFileUpload(e, 'guardian')}
            />

            {/* Form Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '55vh', overflowY: 'auto', paddingRight: '4px' }}>
              {/* Section 1: Dados do Aluno */}
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                  1. Informações do Estudante
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Nome Completo do Aluno: *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Gabriel Santos Mendes"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Matrícula (Para busca no Totem): *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 202603"
                      value={matricula}
                      onChange={e => setMatricula(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '8px 12px',
                        color: '#fff',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Turma / Série:
                    </label>
                    <select
                      value={turma}
                      onChange={e => setTurma(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="Educação Infantil">Educação Infantil</option>
                      <option value="1º Ano - Fundamental I">1º Ano - Fundamental I</option>
                      <option value="2º Ano - Fundamental I">2º Ano - Fundamental I</option>
                      <option value="3º Ano - Fundamental I">3º Ano - Fundamental I</option>
                      <option value="4º Ano - Fundamental I">4º Ano - Fundamental I</option>
                      <option value="5º Ano - Fundamental I">5º Ano - Fundamental I</option>
                      <option value="6º Ano - Fundamental II">6º Ano - Fundamental II</option>
                      <option value="Ensino Médio">Ensino Médio</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Turno:
                    </label>
                    <select
                      value={turno}
                      onChange={e => setTurno(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="Tarde">Tarde</option>
                      <option value="Manhã">Manhã</option>
                      <option value="Integral">Integral</option>
                    </select>
                  </div>
                </div>

                {/* Foto do Aluno */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                  <img
                    src={fotoAluno}
                    alt="Foto do Aluno"
                    style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.2)' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setCapturingFor('student')}
                      style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                    >
                      <Camera size={14} />
                      <span>Câmera</span>
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => studentFileRef.current && studentFileRef.current.click()}
                      style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                    >
                      <Upload size={14} />
                      <span>Carregar Arquivo</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 2: Responsável Inicial Autorizado */}
              <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                  2. Responsável Autorizado (com Biometria Facial)
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Nome do Adulto que vai buscar:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Pedro Alvares / Maria Silva"
                      value={respNome}
                      onChange={e => setRespNome(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Parentesco:
                    </label>
                    <select
                      value={respParentesco}
                      onChange={e => setRespParentesco(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="Pai/Mãe">Pai / Mãe</option>
                      <option value="Responsável Legal">Responsável Legal</option>
                      <option value="Avô/Avó">Avô / Avó</option>
                      <option value="Tio/Tia">Tio / Tia</option>
                      <option value="Motorista da Van">Motorista da Van</option>
                      <option value="Outro Autorizado">Outro Autorizado</option>
                    </select>
                  </div>
                </div>

                {/* Captura Biométrica do Responsável */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.3)', padding: '10px 14px', borderRadius: 'var(--radius-xs)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {respFoto ? (
                      <img
                        src={respFoto}
                        alt="Rosto"
                        style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--success)' }}
                      />
                    ) : (
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <User size={20} color="var(--text-dim)" />
                      </div>
                    )}
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', display: 'block' }}>
                        {respFoto ? 'Biometria Facial Capturada!' : 'Biometria do Responsável'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: respDescriptor ? 'var(--success)' : 'var(--text-muted)' }}>
                        {respDescriptor ? '✓ 128 pontos faciais extraídos' : 'Fotografe o rosto para validar no totem'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => setCapturingFor('guardian')}
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <Camera size={14} />
                      <span>{respFoto ? 'Tirar Outra' : 'Câmera'}</span>
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => guardianFileRef.current && guardianFileRef.current.click()}
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      <Upload size={14} />
                      <span>Enviar Foto</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <button
                type="button"
                className="button-secondary"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={handleSaveStudent}
                disabled={isProcessing}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                <Check size={18} />
                <span>Cadastrar Aluno & Salvar</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
