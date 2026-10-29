// Smart TV Classroom Call Board (/chamada) for Valida School
import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, Volume2, VolumeX, Maximize2, Minimize2, Bell, 
  Sparkles, CheckCircle2, Clock, User, ShieldCheck 
} from 'lucide-react';
import { subscribeToEvents } from '../services/apiService';
import { getExitLogs } from '../services/storage';
import { playSuccessChime, speakVoice } from '../services/audioService';

export default function CallBoardView() {
  const [recentReleases, setRecentReleases] = useState(() => getExitLogs().slice(0, 12));
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastAnnouncedId, setLastAnnouncedId] = useState(null);
  const containerRef = useRef(null);

  // Relógio do painel da TV
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Escuta WebSocket em tempo real para novas liberações na portaria
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === 'ALUNO_LIBERADO') {
        const log = event.payload;
        setRecentReleases(prev => [log, ...prev.filter(l => l.id !== log.id)].slice(0, 16));

        // Anúncio sonoro na TV da sala de aula
        if (audioEnabled && log.id !== lastAnnouncedId) {
          setLastAnnouncedId(log.id);
          playSuccessChime();
          const firstName = (log.alunoNome || '').split(' ')[0];
          speakVoice(`Atenção: Aluno ${firstName}, ${log.alunoTurma || ''}, liberado no ${log.portao || 'Portão Principal'}.`);
        }
      } else if (event.type === 'VAN_LOTE_LIBERADO') {
        const { driver, students } = event.payload;
        if (students && students.length > 0) {
          const newLogs = students.map(s => ({
            id: `van-log-${s.id}-${Date.now()}`,
            alunoNome: s.nome,
            alunoTurma: s.turma,
            adultoNome: `${driver.nome} (${driver.vanEmpresa || 'Van Escolar'})`,
            adultoParentesco: 'Transporte Escolar (Van)',
            fotoCapturadaAoVivo: s.foto,
            portao: 'Portão Principal - Van Escolar',
            timestamp: Date.now()
          }));
          setRecentReleases(prev => [...newLogs, ...prev].slice(0, 16));
        }

        if (audioEnabled) {
          playSuccessChime();
          speakVoice(`Atenção professores: alunos da Van do ${driver.nome.split(' ')[0]}, dirigir-se à portaria para embarque.`);
        }
      }
    });

    return () => unsubscribe();
  }, [audioEnabled, lastAnnouncedId]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }

  const timeString = currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div 
      ref={containerRef}
      style={{
        minHeight: '100vh',
        background: '#070a12',
        color: '#f8fafc',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Plus Jakarta Sans', sans-serif"
      }}
    >
      {/* Top TV Header Bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid rgba(99, 102, 241, 0.25)',
        paddingBottom: '20px',
        marginBottom: '28px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(99, 102, 241, 0.5)'
          }}>
            <Tv size={32} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 800, color: '#818cf8' }}>
                Painel de Chamada em Salas & Pátio
              </span>
              <span style={{
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                AO VIVO
              </span>
            </div>
            <h1 style={{ fontSize: '2.1rem', fontWeight: 900, letterSpacing: '-0.5px', margin: '2px 0 0 0' }}>
              Alunos Liberados na Portaria
            </h1>
          </div>
        </div>

        {/* Right TV Clock & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '2.4rem', fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", color: '#fff', lineHeight: 1 }}>
              {timeString}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', textTransform: 'capitalize', marginTop: '4px' }}>
              {dateString}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              style={{
                background: audioEnabled ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                border: `1px solid ${audioEnabled ? 'rgba(99, 102, 241, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                color: audioEnabled ? '#a5b4fc' : '#fca5a5',
                padding: '12px 18px',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}
              title="Ativar/Desativar som do painel"
            >
              {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              <span>{audioEnabled ? 'Áudio Ativo' : 'Mudo'}</span>
            </button>

            <button
              onClick={toggleFullscreen}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                padding: '12px 18px',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                fontSize: '0.9rem'
              }}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
              <span>{isFullscreen ? 'Janela' : 'Tela Cheia TV'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid of Called Students */}
      {recentReleases.length === 0 ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '40px'
        }}>
          <div style={{
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <Bell size={42} color="#818cf8" />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>
            Aguardando primeiras liberações do turno
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', maxWidth: '500px' }}>
            Assim que os responsáveis validarem o PIN e a biometria no totem do portão, as chamadas aparecerão instantaneamente aqui.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '20px',
          alignContent: 'start'
        }}>
          {recentReleases.map((release, index) => {
            const isFirst = index === 0;
            const logTime = new Date(release.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={release.id || index}
                style={{
                  background: isFirst 
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(16, 185, 129, 0.18) 100%)' 
                    : 'rgba(255, 255, 255, 0.04)',
                  border: isFirst 
                    ? '2px solid #818cf8' 
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '18px',
                  boxShadow: isFirst ? '0 0 35px rgba(99, 102, 241, 0.35)' : 'none',
                  animation: isFirst ? 'pulseGlow 2.5s infinite' : 'none',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Visual Ribbon for Latest Call */}
                {isFirst && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#10b981',
                    color: '#fff',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    letterSpacing: '0.5px'
                  }}>
                    <Sparkles size={13} />
                    <span>ÚLTIMA CHAMADA</span>
                  </div>
                )}

                {/* Student Photo */}
                <div style={{ position: 'relative' }}>
                  <img
                    src={release.fotoCapturadaAoVivo || 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=240&auto=format&fit=crop&q=80'}
                    alt={release.alunoNome}
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '16px',
                      objectFit: 'cover',
                      border: isFirst ? '3px solid #818cf8' : '2px solid rgba(255, 255, 255, 0.2)'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    background: '#10b981',
                    borderRadius: '50%',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 8px #10b981'
                  }}>
                    <CheckCircle2 size={16} color="#fff" />
                  </div>
                </div>

                {/* Student Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background: 'rgba(99, 102, 241, 0.25)',
                      color: '#c7d2fe',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {release.alunoTurma || 'Turma Regular'}
                    </span>

                    {release.adultoParentesco?.includes('Van') && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: 'rgba(245, 158, 11, 0.25)',
                        color: '#fbbf24',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}>
                        🚐 Van Escolar
                      </span>
                    )}

                    {release.metodo?.includes('Familiar') && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}>
                        👨‍👩‍👧‍👦 Saída Familiar
                      </span>
                    )}

                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} />
                      {logTime}
                    </span>
                  </div>

                  <h3 style={{
                    fontSize: isFirst ? '1.35rem' : '1.15rem',
                    fontWeight: 900,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '4px'
                  }}>
                    {release.alunoNome}
                  </h3>

                  <div style={{
                    fontSize: '0.82rem',
                    color: '#cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <User size={14} color="#818cf8" />
                    <span>Retirado por: <strong>{release.adultoNome}</strong></span>
                  </div>

                  <div style={{
                    fontSize: '0.75rem',
                    color: '#10b981',
                    fontWeight: 700,
                    marginTop: '2px'
                  }}>
                    📍 {release.portao || 'Portaria Principal'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Info */}
      <footer style={{
        marginTop: 'auto',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        paddingTop: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.85rem',
        color: '#64748b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="#10b981" />
          <span>Sistema Valida School • Módulo de Chamada Escolar Automatizada</span>
        </div>
        <div>
          Total de alunos liberados hoje: <strong style={{ color: '#fff' }}>{recentReleases.length}</strong>
        </div>
      </footer>
    </div>
  );
}
