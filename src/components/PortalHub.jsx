// Valida School Ecosystem Portal Hub (Landing Page for selecting active interface)
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, Smartphone, Monitor, Tv, School, 
  ArrowRight, Sparkles 
} from 'lucide-react';

export default function PortalHub() {
  const modules = [
    {
      to: '/totem',
      title: 'Totem da Portaria',
      subtitle: 'Terminal Quiosque Touchscreen',
      desc: 'Interface de portaria para entrada com PIN dinâmico de 15 min e validação por reconhecimento facial automático com prova de vida.',
      icon: Monitor,
      color: '#6366f1',
      badge: 'Portaria & Catracas',
      glow: 'rgba(99, 102, 241, 0.35)'
    },
    {
      to: '/responsavel',
      title: 'App dos Pais (PWA)',
      subtitle: 'Dispositivo Móvel do Responsável',
      desc: 'Permite aos pais gerarem o código PIN temporário, compartilharem via WhatsApp com tios ou vans, e gerenciarem biometrias autorizadas.',
      icon: Smartphone,
      color: '#06b6d4',
      badge: 'Mobile First',
      glow: 'rgba(6, 182, 212, 0.35)'
    },
    {
      to: '/escola',
      title: 'Painel da Coordenação',
      subtitle: 'Auditoria & Gestão Escolar',
      desc: 'Monitoramento em tempo real de saídas, cadastro de novos alunos, registro de biometrias faciais e botão de liberação de contingência manual.',
      icon: School,
      color: '#f59e0b',
      badge: 'Administração',
      glow: 'rgba(245, 158, 11, 0.35)'
    },
    {
      to: '/chamada',
      title: 'Painel TV das Salas',
      subtitle: 'Smart TV nas Salas de Aula e Pátio',
      desc: 'Exibe os alunos liberados na portaria em tempo real via WebSockets com aviso sonoro e sintetizador de voz (TTS) para os professores.',
      icon: Tv,
      color: '#10b981',
      badge: 'Tempo Real (WebSockets)',
      glow: 'rgba(16, 185, 129, 0.35)'
    }
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #111827 0%, #030712 100%)',
      color: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      {/* Top Brand Bar */}
      <nav style={{
        padding: '20px 32px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(99, 102, 241, 0.5)'
          }}>
            <ShieldCheck size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.5px', margin: 0 }}>
              Valida School
            </h1>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Sistema de Segurança Escolar com Dupla Validação (PIN + Biometria)
            </span>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '0.8rem',
          color: '#34d399',
          fontWeight: 700
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span>Servidor & WebSockets Ativos</span>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px', flex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '6px 18px',
            borderRadius: '30px',
            fontSize: '0.85rem',
            fontWeight: 800,
            color: '#c7d2fe',
            marginBottom: '18px'
          }}>
            <Sparkles size={16} color="#818cf8" />
            <span>Ecossistema Completo de Segurança Escolar</span>
          </div>

          <h2 style={{ fontSize: '3rem', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '16px', lineHeight: 1.15 }}>
            Controle de Saída Escolar <br />
            <span style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Inteligente, Seguro e Sem Filas
            </span>
          </h2>
          <p style={{ fontSize: '1.15rem', color: '#94a3b8', maxWidth: '680px', margin: '0 auto' }}>
            Selecione abaixo a interface que deseja inicializar neste terminal ou dispositivo:
          </p>
        </div>

        {/* 4 Core Module Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: '24px'
        }}>
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.to}
                to={mod.to}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '24px',
                  padding: '32px 24px',
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-6px)';
                  e.currentTarget.style.borderColor = mod.color;
                  e.currentTarget.style.boxShadow = `0 20px 40px ${mod.glow}`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Header of Card */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '16px',
                    background: `linear-gradient(135deg, ${mod.color}33 0%, ${mod.color}11 100%)`,
                    border: `1px solid ${mod.color}44`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Icon size={28} color={mod.color} />
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: mod.color,
                    background: `${mod.color}1a`,
                    padding: '4px 10px',
                    borderRadius: '12px'
                  }}>
                    {mod.badge}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginBottom: '4px' }}>
                  {mod.title}
                </h3>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: mod.color, marginBottom: '14px' }}>
                  {mod.subtitle}
                </span>

                <p style={{ fontSize: '0.92rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '28px' }}>
                  {mod.desc}
                </p>

                {/* Bottom Action */}
                <div style={{
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  color: mod.color
                }}>
                  <span>Abrir Interface</span>
                  <ArrowRight size={18} />
                </div>
              </Link>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '24px 32px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: '#64748b',
        background: 'rgba(3, 7, 18, 0.95)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#10b981" />
          <span>Valida School • Sistema Corporativo Homologado para Creches e Escolas</span>
        </div>
      </footer>
    </div>
  );
}
