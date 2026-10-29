import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import PortalHub from './components/PortalHub';
import TotemView from './components/TotemView';
import GuardianView from './components/GuardianView';
import SchoolView from './components/SchoolView';
import CallBoardView from './components/CallBoardView';
import RegisterModal from './components/RegisterModal';
import StudentModal from './components/StudentModal';
import { ShieldCheck, ArrowLeft, Camera, GraduationCap } from 'lucide-react';
import { getStudents } from './services/storage';

function ModuleNavigationWrapper({ children, title, onOpenRegisterFace, onOpenStudentModal }) {
  const location = useLocation();
  const isKiosk = location.pathname === '/totem';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sleek Sub-Header Navigation */}
      <header style={{
        background: 'rgba(10, 13, 20, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link 
            to="/" 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              transition: 'all 0.2s ease'
            }}
            title="Voltar ao Portal Hub"
          >
            <ArrowLeft size={16} />
            <span>Hub Principal</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>/</span>
            <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{title}</strong>
          </div>
        </div>

        {/* Global Quick Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onOpenRegisterFace}
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Camera size={14} color="#818cf8" />
            <span>Cadastrar Meu Rosto</span>
          </button>

          <button
            onClick={onOpenStudentModal}
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              border: 'none',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 10px rgba(6, 182, 212, 0.3)'
            }}
          >
            <GraduationCap size={14} />
            <span>+ Novo Aluno</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content" style={{ flex: 1 }}>
        {children}
      </main>

      {/* Footer */}
      {!isKiosk && (
        <footer style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--border-subtle)',
          padding: '16px 24px',
          textAlign: 'center',
          fontSize: '0.78rem',
          color: 'var(--text-dim)',
          background: 'rgba(10, 13, 20, 0.95)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <ShieldCheck size={16} color="var(--success)" />
            <span>Valida School • Sistema Corporativo com Dupla Validação (PIN Dinâmico + Biometria Facial)</span>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const students = getStudents();

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing Hub */}
        <Route path="/" element={<PortalHub />} />

        {/* 1. Totem Portaria */}
        <Route 
          path="/totem" 
          element={
            <ModuleNavigationWrapper 
              title="Totem da Portaria"
              onOpenRegisterFace={() => setIsRegisterModalOpen(true)}
              onOpenStudentModal={() => setIsStudentModalOpen(true)}
            >
              <TotemView onOpenStudentModal={() => setIsStudentModalOpen(true)} />
            </ModuleNavigationWrapper>
          } 
        />

        {/* 2. App Responsável PWA */}
        <Route 
          path="/responsavel" 
          element={
            <ModuleNavigationWrapper 
              title="App dos Pais (Responsável)"
              onOpenRegisterFace={() => setIsRegisterModalOpen(true)}
              onOpenStudentModal={() => setIsStudentModalOpen(true)}
            >
              <GuardianView onOpenStudentModal={() => setIsStudentModalOpen(true)} />
            </ModuleNavigationWrapper>
          } 
        />

        {/* 3. Painel da Escola & Coordenação */}
        <Route 
          path="/escola" 
          element={
            <ModuleNavigationWrapper 
              title="Painel da Coordenação"
              onOpenRegisterFace={() => setIsRegisterModalOpen(true)}
              onOpenStudentModal={() => setIsStudentModalOpen(true)}
            >
              <SchoolView onOpenStudentModal={() => setIsStudentModalOpen(true)} />
            </ModuleNavigationWrapper>
          } 
        />

        {/* 4. Painel Smart TV de Chamadas nas Salas de Aula */}
        <Route path="/chamada" element={<CallBoardView />} />
      </Routes>

      {/* Global Face Registration Modal */}
      <RegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        studentId={students[0]?.id}
        onSaved={() => {}}
      />

      {/* Global Student Registration Modal */}
      <StudentModal
        isOpen={isStudentModalOpen}
        onClose={() => setIsStudentModalOpen(false)}
        onSaved={() => {}}
      />
    </BrowserRouter>
  );
}
