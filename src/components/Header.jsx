import React, { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, MonitorSmartphone, LayoutDashboard, Cpu, Camera, GraduationCap } from 'lucide-react';
import { areModelsLoaded, loadFaceModels } from '../services/faceService';

export default function Header({ currentView, setView, onOpenRegisterFace, onOpenStudentModal }) {
  const [aiLoaded, setAiLoaded] = useState(areModelsLoaded());

  useEffect(() => {
    loadFaceModels().then(() => setAiLoaded(true));
  }, []);

  return (
    <header className="role-header">
      <div className="brand-badge">
        <div className="brand-icon">
          <ShieldCheck size={22} color="#fff" />
        </div>
        <div>
          <span>Valida School</span>
          <span style={{ fontSize: '0.68rem', display: 'block', color: 'var(--text-dim)', fontWeight: 500, letterSpacing: '0.5px' }}>
            DUPLA VALIDAÇÃO • PIN + FACIAL
          </span>
        </div>
      </div>

      {/* Role Switcher */}
      <nav className="role-nav" aria-label="Seletor de Ambiente">
        <button
          id="btn-nav-guardian"
          className={`role-btn ${currentView === 'guardian' ? 'active' : ''}`}
          onClick={() => setView('guardian')}
          title="Visão do Responsável Legal (Pai/Mãe no celular)"
        >
          <Smartphone size={16} />
          <span>App Responsável</span>
        </button>

        <button
          id="btn-nav-totem"
          className={`role-btn ${currentView === 'totem' ? 'active' : ''}`}
          onClick={() => setView('totem')}
          title="Totem / Tablet no portão da escola com WebCam"
        >
          <MonitorSmartphone size={16} />
          <span>Totem da Portaria</span>
        </button>

        <button
          id="btn-nav-school"
          className={`role-btn ${currentView === 'school' ? 'active' : ''}`}
          onClick={() => setView('school')}
          title="Painel de Controle e Histórico da Escola"
        >
          <LayoutDashboard size={16} />
          <span>Painel da Escola</span>
        </button>
      </nav>

      {/* Action Buttons & Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          id="btn-global-cadastrar-aluno"
          onClick={onOpenStudentModal}
          className="button-secondary"
          style={{
            padding: '7px 14px',
            fontSize: '0.8rem',
            borderColor: 'rgba(6, 182, 212, 0.45)',
            color: 'var(--cyan-accent)',
            background: 'rgba(6, 182, 212, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          title="Cadastrar um novo estudante e responsável para testes"
        >
          <GraduationCap size={16} />
          <span>+ Cadastrar Aluno</span>
        </button>

        <button
          id="btn-global-cadastrar-rosto"
          onClick={onOpenRegisterFace}
          className="button-primary"
          style={{
            padding: '7px 14px',
            fontSize: '0.8rem',
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            boxShadow: '0 2px 10px rgba(99, 102, 241, 0.35)'
          }}
          title="Gravar ou cadastrar novo rosto para reconhecimento facial"
        >
          <Camera size={15} />
          <span>Cadastrar Meu Rosto</span>
        </button>

        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: aiLoaded ? 'var(--success-surface)' : 'var(--warning-surface)',
            border: `1px solid ${aiLoaded ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: aiLoaded ? 'var(--success)' : 'var(--warning)'
          }}
          title={aiLoaded ? 'Rede Neural de Reconhecimento Facial Pronta' : 'Carregando Modelos...'}
        >
          <Cpu size={14} />
          <span>{aiLoaded ? 'IA Facial Ativa' : 'Carregando IA...'}</span>
        </div>
      </div>
    </header>
  );
}
