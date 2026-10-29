import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, Check, AlertCircle, RefreshCw, UserCheck, Video } from 'lucide-react';
import { 
  startCameraStream, stopCameraStream, detectFaceAndComputeDescriptor, 
  getVideoDevices 
} from '../services/faceService';
import { addAuthorizedAdult, getStudents } from '../services/storage';
import { playSuccessChime } from '../services/audioService';

export default function RegisterModal({ isOpen, onClose, studentId, onSaved }) {
  const [students] = useState(() => getStudents());
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || students[0]?.id || '');
  const [nome, setNome] = useState('');
  const [parentesco, setParentesco] = useState('Pai/Mãe');
  const [cpf, setCpf] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Camera devices
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => localStorage.getItem('valida_school_preferred_camera') || '');

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  function stopCamera() {
    if (streamRef.current) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
  }

  async function startCamera(deviceId = null) {
    try {
      setErrorMsg('');
      stopCamera();

      // Aguarda um frame para o elemento de vídeo ser renderizado no DOM
      await new Promise(r => setTimeout(r, 60));

      const stream = await startCameraStream(videoRef.current, deviceId || selectedCameraId);
      streamRef.current = stream;
    } catch (err) {
      console.warn('Erro ao abrir câmera no modal:', err);
      setErrorMsg('Não foi possível acessar a câmera. Verifique permissões ou selecione outro dispositivo.');
    }
  }

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isMounted = true;
    async function initCamera() {
      try {
        const devs = await getVideoDevices();
        if (!isMounted) return;
        setVideoDevices(devs);

        let targetId = selectedCameraId;
        if (!targetId && devs.length > 0) {
          targetId = devs[0].deviceId;
          setSelectedCameraId(targetId);
        }

        await startCamera(targetId);
      } catch (err) {
        console.warn('Erro ao inicializar câmera:', err);
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedCameraId]);

  function handleCameraChange(deviceId) {
    setSelectedCameraId(deviceId);
    localStorage.setItem('valida_school_preferred_camera', deviceId);
  }

  async function handleCapturePhoto() {
    if (!videoRef.current) return;
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      // Mirror image horizontally to match webcam display
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      // Detect face and compute 128-d biometric descriptor
      const detection = await detectFaceAndComputeDescriptor(canvas);

      if (!detection || !detection.descriptor) {
        setErrorMsg('Nenhum rosto foi detectado com clareza. Posicione-se bem iluminado e olhe diretamente para a câmera.');
        setIsProcessing(false);
        return;
      }

      setCapturedPhoto(photoDataUrl);
      setFaceDescriptor(detection.descriptor);
      stopCamera();
    } catch (err) {
      setErrorMsg('Falha no processamento facial: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleRetake() {
    setCapturedPhoto(null);
    setFaceDescriptor(null);
    startCamera();
  }

  function handleSave() {
    if (!nome.trim()) {
      setErrorMsg('Por favor, informe o nome completo do adulto.');
      return;
    }
    if (!capturedPhoto || !faceDescriptor) {
      setErrorMsg('É necessário capturar uma foto com biometria facial para autorizar a saída.');
      return;
    }

    const newAdult = {
      id: 'resp-' + Date.now(),
      nome: nome.trim(),
      parentesco,
      cpf: cpf.trim() || 'Não informado',
      foto: capturedPhoto,
      biometriaCadastrada: true,
      faceDescriptor
    };

    addAuthorizedAdult(selectedStudentId, newAdult);
    playSuccessChime();
    if (onSaved) onSaved();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
              Cadastrar Biometria Facial
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Tire uma foto do seu rosto para autorizar a liberação imediata no Totem
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
          {/* Student Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Vincular a qual Aluno(a):
            </label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nome} (Matrícula: {s.matricula} • {s.turma})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Seu Nome Completo (ou do Adulto que vai buscar):
            </label>
            <input
              type="text"
              id="input-adulto-nome"
              placeholder="Ex: Pedro Silva / Maria Santos"
              value={nome}
              onChange={e => setNome(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Parentesco / Vínculo:
              </label>
              <select
                id="select-adulto-parentesco"
                value={parentesco}
                onChange={e => setParentesco(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
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

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                CPF (Opcional):
              </label>
              <input
                type="text"
                id="input-adulto-cpf"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Camera Selector (If multiple cameras present) */}
        {videoDevices.length > 1 && (
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <Video size={14} color="var(--primary)" />
              <span>Selecione sua Câmera ({videoDevices.length} disponíveis):</span>
            </label>
            <select
              value={selectedCameraId}
              onChange={e => handleCameraChange(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            >
              {videoDevices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Câmera ${d.deviceId.slice(0, 8)}...`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Biometric Camera Box */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            position: 'relative',
            width: '100%',
            height: '240px',
            background: '#000',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '2px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {!capturedPhoto ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)'
                  }}
                />
                {/* Oval Guide */}
                <div style={{
                  position: 'absolute',
                  width: '140px',
                  height: '180px',
                  borderRadius: '50%',
                  border: '2px dashed #818cf8',
                  pointerEvents: 'none',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)'
                }} />
              </>
            ) : (
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <img
                  src={capturedPhoto}
                  alt="Rosto Capturado"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'var(--success-surface)',
                  border: '1px solid var(--success)',
                  color: 'var(--success)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <UserCheck size={14} />
                  <span>Biometria Extraída com Sucesso!</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
            {!capturedPhoto ? (
              <button
                type="button"
                id="btn-capturar-rosto"
                className="button-primary"
                onClick={handleCapturePhoto}
                disabled={isProcessing}
                style={{ width: '100%' }}
              >
                <Camera size={18} />
                <span>{isProcessing ? 'Extraindo biometria...' : 'Fotografar Rosto & Extrair Biometria'}</span>
              </button>
            ) : (
              <button
                type="button"
                id="btn-recapturar-rosto"
                className="button-secondary"
                onClick={handleRetake}
                style={{ width: '100%' }}
              >
                <RefreshCw size={16} />
                <span>Tirar Outra Foto</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            id="btn-salvar-adulto"
            className="button-primary"
            onClick={handleSave}
            disabled={!capturedPhoto || !faceDescriptor}
          >
            <Check size={18} />
            <span>Salvar Rosto no Sistema</span>
          </button>
        </div>
      </div>
    </div>
  );
}
