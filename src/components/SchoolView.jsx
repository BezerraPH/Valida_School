/**
 * ============================================================================
 * PAINEL DA COORDENAÇÃO & GESTÃO ESCOLAR — VALIDA SCHOOL
 * ============================================================================
 * Rota: `/escola`
 * Responsabilidade:
 *   1. Consultar/Ocultar/Copiar/Regenerar o Código Secreto Diário de Liberação Administrativa.
 *   2. Monitorar KPIs em tempo real (alunos cadastrados, saídas liberadas, pendentes e alertas).
 *   3. Auditar logs com filtros (Famílias, Vans, Código/Contingência, Negados), Termo LGPD e CSV.
 *   4. Gerenciar a base oficial de alunos (matrícula, CPF, turma, sala) na aba Alunos & Matrículas.
 * ============================================================================
 */
import React, { useState, useEffect } from 'react';
import { 
  Users, CheckCircle2, ShieldAlert, Clock, Search, 
  FileText, GraduationCap, Download, KeyRound, Eye, EyeOff,
  RefreshCw, Copy, CheckCheck, Edit3, Trash2
} from 'lucide-react';
import { 
  getStudents, getExitLogs, subscribeStorage, recordExitLog, deleteStudentLocal 
} from '../services/storage';
import { fetchDailySecretCodeApi, rotateDailySecretCodeApi } from '../services/apiService';
import { playSuccessChime, playPinClick } from '../services/audioService';
import TermViewerModal from './TermViewerModal';
import StudentModal from './StudentModal';

export default function SchoolView({ onOpenStudentModal }) {
  const [students, setStudents] = useState(getStudents());
  const [exitLogs, setExitLogs] = useState(getExitLogs());
  const [activeTab, setActiveTab] = useState('logs'); // 'logs' | 'students'
  const [searchTerm, setSearchTerm] = useState('');
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [selectedStudentForManual, setSelectedStudentForManual] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [inspectorName] = useState('Inspetor Carlos');
  const [isTermViewerOpen, setIsTermViewerOpen] = useState(false);
  const [selectedAuthForTerm, setSelectedAuthForTerm] = useState(null);

  // Edição de alunos protegidos pela escola
  const [editingStudent, setEditingStudent] = useState(null);
  const [isEditStudentOpen, setIsEditStudentOpen] = useState(false);

  // Código Secreto Diário de Liberação Administrativa
  const [dailyCodeInfo, setDailyCodeInfo] = useState(null);
  const [showDailyCode, setShowDailyCode] = useState(false);
  const [copiedDailyCode, setCopiedDailyCode] = useState(false);
  const [rotatingCode, setRotatingCode] = useState(false);

  useEffect(() => {
    function refresh() {
      setStudents(getStudents());
      setExitLogs(getExitLogs());
    }

    const unsub = subscribeStorage(refresh);
    refresh();

    fetchDailySecretCodeApi().then(info => {
      if (info) setDailyCodeInfo(info);
    });

    return () => unsub();
  }, []);

  async function handleRotateDailyCode() {
    const confirmed = window.confirm('Deseja gerar um novo Código Secreto Diário agora? O código anterior deixará de funcionar imediatamente.');
    if (!confirmed) return;
    setRotatingCode(true);
    try {
      const updated = await rotateDailySecretCodeApi();
      if (updated) {
        setDailyCodeInfo(updated);
        setShowDailyCode(true);
        playSuccessChime();
      }
    } finally {
      setRotatingCode(false);
    }
  }

  function handleCopyDailyCode() {
    if (!dailyCodeInfo?.codigo) return;
    navigator.clipboard.writeText(dailyCodeInfo.codigo);
    setCopiedDailyCode(true);
    setTimeout(() => setCopiedDailyCode(false), 2000);
  }

  function handleDeleteStudent(student) {
    const confirmed = window.confirm(`Deseja realmente excluir o cadastro do aluno "${student.nome}" (Matrícula: ${student.matricula})?`);
    if (!confirmed) return;
    deleteStudentLocal(student.id);
    playPinClick();
  }

  function handleManualRelease() {
    if (!selectedStudentForManual || !manualReason.trim()) return;
    const student = students.find(s => s.id === selectedStudentForManual);
    if (!student) return;

    recordExitLog({
      studentId: student.id,
      alunoNome: student.nome,
      alunoMatricula: student.matricula,
      alunoTurma: student.turma,
      adultoNome: `${inspectorName} (Liberação Manual da Escola)`,
      adultoParentesco: 'Autorização Especial',
      fotoCapturadaAoVivo: student.foto,
      similaridadeBiometrica: 'N/A (Manual)',
      metodo: `Contingência: ${manualReason.trim()}`
    });

    playSuccessChime();
    setManualModalOpen(false);
    setSelectedStudentForManual('');
    setManualReason('');
  }

  const [logFilter, setLogFilter] = useState('ALL'); // 'ALL', 'FAMILY', 'VAN', 'MANUAL'

  const filteredLogs = exitLogs.filter(log => {
    const matchesSearch = 
      (log.alunoNome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.alunoMatricula || '').includes(searchTerm) ||
      (log.adultoNome || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (logFilter === 'VAN') {
      return log.adultoParentesco?.includes('Van') || log.metodo?.includes('Van');
    }
    if (logFilter === 'FAMILY') {
      return log.metodo?.includes('Familiar') || log.adultoParentesco?.includes('Mãe') || log.adultoParentesco?.includes('Pai');
    }
    if (logFilter === 'MANUAL') {
      return log.metodo?.includes('Contingência') || log.metodo?.includes('Manual') || log.metodo?.includes('Código Secreto');
    }
    if (logFilter === 'ALERTS') {
      return log.status === 'NEGADO' || log.status === 'BLOQUEADO';
    }
    return true;
  });

  function handleExportCsv() {
    if (filteredLogs.length === 0) {
      alert('Não há registros de saída no filtro selecionado para exportar.');
      return;
    }

    const headers = [
      'Data',
      'Horário',
      'Matrícula Aluno',
      'Nome Aluno',
      'Turma',
      'Adulto Responsável',
      'Grau de Parentesco / Vínculo',
      'Método de Validação',
      'Similaridade Biométrica',
      'Status da Liberação',
      'Código de Auditoria LGPD'
    ];

    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredLogs.map(log => {
      const dateObj = new Date(log.timestamp);
      const dataStr = dateObj.toLocaleDateString('pt-BR');
      const horaStr = dateObj.toLocaleTimeString('pt-BR');

      return [
        escape(dataStr),
        escape(horaStr),
        escape(log.alunoMatricula || 'N/A'),
        escape(log.alunoNome),
        escape(log.alunoTurma),
        escape(log.adultoNome),
        escape(log.adultoParentesco),
        escape(log.metodo),
        escape(log.similaridadeBiometrica || 'N/A'),
        escape(log.status),
        escape(log.ipHash || log.id || `AUDIT-LOG-${log.studentId}`)
      ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `livro_oficial_saidas_valida_school_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const releasedLogs = exitLogs.filter(l => l.status === 'LIBERADO');
  const alertLogsCount = exitLogs.filter(l => l.status === 'NEGADO' || l.status === 'BLOQUEADO').length;
  const releasedCount = new Set(releasedLogs.map(l => l.studentId)).size;
  const totalCount = students.length;
  const remainingCount = Math.max(0, totalCount - releasedCount);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Title & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Painel da Coordenação & Portaria
          </span>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>
            Controle de Saídas em Tempo Real
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            id="btn-school-cadastrar-aluno"
            className="button-primary"
            onClick={onOpenStudentModal}
            style={{
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '0.85rem'
            }}
          >
            <GraduationCap size={16} />
            <span>+ Cadastrar Novo Aluno</span>
          </button>

          <button
            id="btn-liberacao-manual"
            className="button-secondary"
            onClick={() => setManualModalOpen(true)}
            style={{ borderColor: 'rgba(245, 158, 11, 0.4)', color: '#f59e0b', padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <ShieldAlert size={16} />
            <span>Liberação Manual (Contingência)</span>
          </button>
        </div>
      </div>

      {/* Card Exclusivo do Administrador: Código Secreto Diário */}
      <div className="card-glass" style={{
        marginBottom: '22px',
        border: '1.5px solid rgba(245, 158, 11, 0.45)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 20, 34, 0.9) 100%)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.2)',
            border: '1px solid rgba(245, 158, 11, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <KeyRound size={24} color="#fbbf24" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1rem', color: '#fff' }}>
                Código Secreto Diário de Liberação (Funcionário / Admin)
              </strong>
              <span style={{ fontSize: '0.68rem', background: 'rgba(245, 158, 11, 0.25)', color: '#fde68a', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                RENOVA DIARIAMENTE
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Permite que funcionários autorizados liberem alunos no Totem sem PIN ou biometria facial. {dailyCodeInfo?.expiraEm ? `Válido até ${dailyCodeInfo.expiraEm}.` : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '10px',
            padding: '8px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '1.35rem',
            fontWeight: 900,
            letterSpacing: '3px',
            color: '#fbbf24',
            minWidth: '155px',
            textAlign: 'center'
          }}>
            {showDailyCode ? (dailyCodeInfo?.codigo || '--------') : '••••••••'}
          </div>

          <button
            id="btn-revelar-codigo-diario"
            type="button"
            className="button-secondary"
            onClick={() => setShowDailyCode(!showDailyCode)}
            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
          >
            {showDailyCode ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{showDailyCode ? 'Ocultar' : 'Consultar Código'}</span>
          </button>

          {showDailyCode && (
            <button
              type="button"
              className="button-secondary"
              onClick={handleCopyDailyCode}
              style={{ padding: '8px 12px', fontSize: '0.8rem' }}
            >
              {copiedDailyCode ? <CheckCheck size={15} color="#10b981" /> : <Copy size={15} />}
              <span>{copiedDailyCode ? 'Copiado!' : 'Copiar'}</span>
            </button>
          )}

          <button
            type="button"
            className="button-secondary"
            onClick={handleRotateDailyCode}
            disabled={rotatingCode}
            style={{ padding: '8px 12px', fontSize: '0.8rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
            title="Invalidar código atual e gerar outro código emergencial para hoje"
          >
            <RefreshCw size={14} />
            <span>{rotatingCode ? 'Gerando...' : 'Regenerar'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px',
        marginBottom: '22px'
      }}>
        {/* KPI 1 */}
        <div className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(99, 102, 241, 0.15)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Alunos Cadastrados</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>{totalCount}</div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--success-surface)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Saídas Liberadas Hoje</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)' }}>{releasedLogs.length}</div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--warning-surface)',
            color: 'var(--warning)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Clock size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Alunos Ainda na Escola</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>{remainingCount}</div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--danger-surface)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Alertas / Tentativas Negadas</span>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: alertLogsCount > 0 ? '#f87171' : '#fff' }}>{alertLogsCount}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs: Logs vs Alunos */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={activeTab === 'logs' ? 'button-primary' : 'button-secondary'}
          style={{ padding: '9px 18px', fontSize: '0.85rem' }}
        >
          <FileText size={16} />
          <span>Histórico & Auditoria de Saídas</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={activeTab === 'students' ? 'button-primary' : 'button-secondary'}
          style={{ padding: '9px 18px', fontSize: '0.85rem' }}
        >
          <GraduationCap size={16} />
          <span>Gestão de Alunos & Matrículas ({students.length})</span>
        </button>
      </div>

      {/* ABA 1: LOGS DE AUDITORIA */}
      {activeTab === 'logs' && (
      <div className="card-glass">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--primary)" />
            <span>Registro Auditável de Liberações</span>
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Filter Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', padding: '2px', border: '1px solid var(--border-subtle)' }}>
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'FAMILY', label: '👨‍👩‍👧‍👦 Famílias' },
                { id: 'VAN', label: '🚐 Vans' },
                { id: 'MANUAL', label: '🔑 Código/Conting.' },
                { id: 'ALERTS', label: '🚨 Negados' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setLogFilter(f.id)}
                  style={{
                    background: logFilter === f.id ? 'var(--primary)' : 'transparent',
                    color: logFilter === f.id ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px'
            }}>
              <Search size={16} color="var(--text-dim)" />
              <input
                type="text"
                placeholder="Buscar aluno ou adulto..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  width: '180px'
                }}
              />
            </div>

            {/* CSV Export Button */}
            <button
              id="btn-export-csv"
              onClick={handleExportCsv}
              className="button-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#10b981',
                borderColor: 'rgba(16, 185, 129, 0.4)'
              }}
              title="Baixar planilha oficial para Conselho Tutelar e Secretaria"
            >
              <Download size={15} />
              <span>Exportar Livro (CSV)</span>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            Nenhuma liberação registrada até o momento hoje. As saídas validadas no Totem aparecerão aqui em tempo real.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 14px' }}>Horário</th>
                  <th style={{ padding: '12px 14px' }}>Aluno</th>
                  <th style={{ padding: '12px 14px' }}>Foto ao Vivo</th>
                  <th style={{ padding: '12px 14px' }}>Adulto Responsável</th>
                  <th style={{ padding: '12px 14px' }}>Validação</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px' }}>Auditoria / Termo</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '14px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <strong style={{ color: '#fff', display: 'block' }}>{log.alunoNome}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{log.alunoTurma} (Matrícula: {log.alunoMatricula})</span>
                    </td>
                    <td style={{ padding: '14px' }}>
                      {log.fotoCapturadaAoVivo ? (
                        <img
                          src={log.fotoCapturadaAoVivo}
                          alt="Foto ao vivo"
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-sm)',
                            objectFit: 'cover',
                            border: '1px solid var(--success)'
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <span style={{ color: '#fff', fontWeight: 600, display: 'block' }}>{log.adultoNome}</span>
                      <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>{log.adultoParentesco}</span>
                    </td>
                    <td style={{ padding: '14px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.metodo}</span>
                      {log.similaridadeBiometrica && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--success)' }}>
                          Similaridade: {log.similaridadeBiometrica}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '14px' }}>
                      <span style={{
                        background: (log.status === 'NEGADO' || log.status === 'BLOQUEADO') ? 'var(--danger-surface)' : 'var(--success-surface)',
                        color: (log.status === 'NEGADO' || log.status === 'BLOQUEADO') ? '#f87171' : 'var(--success)',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        {log.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => {
                          setSelectedAuthForTerm({
                            id: log.id,
                            nome: log.adultoNome,
                            cpf: log.adultoCpf || 'Auditado no Totem',
                            telefone: log.adultoTelefone || '(11) 98765-4321',
                            parentesco: log.adultoParentesco,
                            tipo: log.adultoParentesco?.includes('Van') ? 'VAN' : 'TERCEIRO',
                            vanEmpresa: log.adultoParentesco?.includes('Van') ? (log.adultoNome?.split('(')[1]?.replace(')', '') || 'Van Escolar') : null,
                            alunoNomes: [log.alunoNome],
                            validadeTipo: 'ANUAL',
                            criadoPorNome: 'Responsável Legal Contratual',
                            ipHash: `AUDIT-LOG-${log.id}`,
                            createdAt: log.timestamp
                          });
                          setIsTermViewerOpen(true);
                        }}
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.35)',
                          color: '#a5b4fc',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          cursor: 'pointer'
                        }}
                      >
                        <FileText size={13} />
                        <span>Ver Termo</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ABA 2: GESTÃO DE ALUNOS & MATRÍCULAS (EXCLUSIVO ESCOLA) */}
      {activeTab === 'students' && (
        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GraduationCap size={20} color="#06b6d4" />
                <span>Base Oficial de Alunos, CPFs e Matrículas</span>
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Estes dados são protegidos contra edição no aplicativo dos pais. Somente a coordenação/secretaria altera matrícula ou CPF.
              </p>
            </div>
            <button
              type="button"
              className="button-primary"
              onClick={onOpenStudentModal}
              style={{ padding: '8px 14px', fontSize: '0.82rem' }}
            >
              <span>+ Novo Aluno</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {students.map(stu => (
              <div key={stu.id} style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={stu.foto}
                    alt={stu.nome}
                    style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', border: '1.5px solid #06b6d4' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ color: '#fff', fontSize: '0.92rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {stu.nome}
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      Matrícula: {stu.matricula} • CPF: {stu.cpf || 'N/A'}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {stu.turma} • {stu.sala || 'Sala 01'} ({stu.turno})
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  Responsáveis ativos ({stu.responsaveis?.length || 0}):{' '}
                  <span style={{ color: '#cbd5e1' }}>
                    {stu.responsaveis?.map(r => r.nome.split(' ')[0]).join(', ') || 'Nenhum'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setEditingStudent(stu);
                      setIsEditStudentOpen(true);
                    }}
                    style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                  >
                    <Edit3 size={13} />
                    <span>Editar Dados</span>
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => handleDeleteStudent(stu)}
                    style={{ padding: '5px 10px', fontSize: '0.74rem', borderColor: 'rgba(239, 68, 68, 0.35)', color: '#f87171' }}
                  >
                    <Trash2 size={13} />
                    <span>Excluir</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contingency Modal */}
      {manualModalOpen && (
        <div className="modal-backdrop" onClick={() => setManualModalOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={22} color="#f59e0b" />
              <span>Liberação Manual de Contingência</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Utilize apenas em situações excepcionais onde o responsável autorizou diretamente a direção da escola por outro canal.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Selecione o Aluno:
                </label>
                <select
                  value={selectedStudentForManual}
                  onChange={e => setSelectedStudentForManual(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- Escolha um aluno --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.nome} ({s.matricula} - {s.turma})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Motivo / Justificativa Obrigatória:
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Responsável contatou a diretoria via telefone oficial autorizando a saída com a babá devido a emergência médica."
                  value={manualReason}
                  onChange={e => setManualReason(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '0.85rem',
                    resize: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className="button-secondary"
                onClick={() => setManualModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="button-primary"
                onClick={handleManualRelease}
                disabled={!selectedStudentForManual || !manualReason.trim()}
                style={{ background: '#f59e0b' }}
              >
                Autorizar Saída Manual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal to View Digital Signed LGPD Term Certificate */}
      <TermViewerModal
        isOpen={isTermViewerOpen}
        onClose={() => setIsTermViewerOpen(false)}
        authorization={selectedAuthForTerm}
      />

      {/* Modal to Edit Protected Student Records */}
      <StudentModal
        isOpen={isEditStudentOpen}
        onClose={() => {
          setIsEditStudentOpen(false);
          setEditingStudent(null);
        }}
        editingStudent={editingStudent}
        onSaved={() => {
          setStudents(getStudents());
          setEditingStudent(null);
        }}
      />
    </div>
  );
}
