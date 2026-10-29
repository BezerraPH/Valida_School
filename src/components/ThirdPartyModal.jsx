import React, { useState } from 'react';
import { 
  ShieldCheck, X, FileText, Check, AlertCircle, 
  Bus, UserCheck, Shield
} from 'lucide-react';
import { addThirdPartyAuthorizationApi } from '../services/apiService';
import { getStudents, saveStudents } from '../services/storage';
import { playSuccessChime } from '../services/audioService';

export default function ThirdPartyModal({ isOpen, onClose, currentGuardian, childrenList = [], onAuthorized }) {
  const [tipo, setTipo] = useState('TERCEIRO'); // 'TERCEIRO' ou 'VAN'
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [parentesco, setParentesco] = useState('Tio(a)');
  const [vanEmpresa, setVanEmpresa] = useState('');
  const [vanPlaca, setVanPlaca] = useState('');
  const [validadeTipo, setValidadeTipo] = useState('ANUAL'); // 'HOJE', 'MENSAL', 'ANUAL'
  const [selectedStudentIds, setSelectedStudentIds] = useState(() => childrenList.map(c => c.id));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const guardianName = currentGuardian?.nome || 'Ana Silva Pereira';
  const guardianCpf = currentGuardian?.cpf || '111.222.333-44';

  function handleToggleStudent(stuId) {
    if (selectedStudentIds.includes(stuId)) {
      if (selectedStudentIds.length === 1) {
        setErrorMsg('Selecione pelo menos um aluno para a autorização.');
        return;
      }
      setSelectedStudentIds(selectedStudentIds.filter(id => id !== stuId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, stuId]);
      setErrorMsg('');
    }
  }

  const selectedStudentsNames = childrenList
    .filter(c => selectedStudentIds.includes(c.id))
    .map(c => c.nome)
    .join(', ');

  const termoTexto = `TERMO ELETRÔNICO DE AUTORIZAÇÃO DE RETIRADA DE MENOR
(Conforme Lei Geral de Proteção de Dados - LGPD nº 13.709/2018, Art. 14)

Eu, ${guardianName}, portador(a) do CPF ${guardianCpf}, na qualidade de responsável legal pelo(s) menor(es) matriculado(s):
${selectedStudentsNames || '[Nenhum aluno selecionado]'},

AUTORIZO EXPRESSAMENTE a pessoa abaixo qualificada:
Nome do Autorizado: ${nome || '[A preencher]'}
CPF: ${cpf || '[A preencher]'}
Telefone/WhatsApp: ${telefone || '[A preencher]'}
Vínculo/Função: ${tipo === 'VAN' ? `Transportador Escolar (${vanEmpresa || 'Van'}, Placa: ${vanPlaca || 'N/A'})` : parentesco}
Vigência: ${validadeTipo === 'HOJE' ? 'Apenas hoje (retirada pontual)' : validadeTipo === 'MENSAL' ? '30 dias corridos' : 'Ano Letivo Vigente 2026'}

a comparecer à instituição de ensino e realizar a retirada do(s) referido(s) menor(es) mediante autenticação biométrica facial e prova de vida no Totem de Portaria.

Declaro que este consentimento é fornecido em melhor interesse do(s) menor(es) e autorizo o tratamento de dados biométricos exclusivamente para fins de segurança e controle de acesso escolar.`;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');

    if (!nome.trim() || !cpf.trim() || !telefone.trim()) {
      setErrorMsg('Por favor, preencha todos os campos obrigatórios (Nome, CPF e Telefone).');
      return;
    }

    if (selectedStudentIds.length === 0) {
      setErrorMsg('Selecione ao menos um filho para esta autorização.');
      return;
    }

    if (!acceptedTerms) {
      setErrorMsg('É obrigatório ler e dar o aceite formal no Termo de Autorização.');
      return;
    }

    setIsSubmitting(true);

    try {
      let validadeAte = null;
      const now = Date.now();
      if (validadeTipo === 'HOJE') {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        validadeAte = endOfDay.getTime();
      } else if (validadeTipo === 'MENSAL') {
        validadeAte = now + (30 * 24 * 60 * 60 * 1000);
      } else {
        validadeAte = now + (300 * 24 * 60 * 60 * 1000); // Ano Letivo
      }

      const payload = {
        alunoIds: selectedStudentIds,
        adulto: {
          nome: nome.trim(),
          cpf: cpf.trim(),
          telefone: telefone.trim(),
          isTransportador: tipo === 'VAN',
          vanEmpresa: tipo === 'VAN' ? vanEmpresa.trim() : null,
          vanPlaca: tipo === 'VAN' ? vanPlaca.trim() : null,
          foto: tipo === 'VAN' 
            ? 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=240&auto=format&fit=crop&q=80'
            : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80'
        },
        parentesco: tipo === 'VAN' ? 'Transporte Escolar (Van)' : parentesco,
        validadeTipo,
        validadeAte,
        termoTexto,
        criadoPorNome: `${guardianName} (Responsável Legal)`
      };

      // Tenta enviar para a API central
      const result = await addThirdPartyAuthorizationApi(payload);

      // Atualiza também o localStorage para garantia offline imediata
      const students = getStudents();
      const authId = result?.createdAuthIds?.[0] || `auth-${Date.now()}`;
      const adultId = result?.adultId || `resp-${Date.now()}`;

      for (const stuId of selectedStudentIds) {
        const stu = students.find(s => s.id === stuId);
        if (stu) {
          if (!stu.responsaveis) stu.responsaveis = [];
          stu.responsaveis.push({
            id: adultId,
            authId,
            nome: payload.adulto.nome,
            cpf: payload.adulto.cpf,
            telefone: payload.adulto.telefone,
            foto: payload.adulto.foto,
            parentesco: payload.parentesco,
            tipo: payload.adulto.isTransportador ? 'VAN' : 'TERCEIRO',
            status: 'ATIVO',
            validadeTipo,
            validadeAte,
            isTransportador: payload.adulto.isTransportador,
            vanEmpresa: payload.adulto.vanEmpresa,
            vanPlaca: payload.adulto.vanPlaca,
            biometriaCadastrada: true,
            faceDescriptor: null
          });
        }
      }
      saveStudents(students);

      playSuccessChime();
      if (onAuthorized) onAuthorized();
      onClose();
    } catch (err) {
      console.error('Erro ao emitir autorização:', err);
      setErrorMsg('Falha ao registrar autorização. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 16, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div 
        className="card-glass"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(99, 102, 241, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Autorizar Terceiro ou Van Escolar
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 600 }}>
                Emissão de Termo Formal de Retirada (LGPD Art. 14)
              </span>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.85rem'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tipo de Autorizado (Pessoa ou Van) */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
              1. Tipo de Autorizado
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setTipo('TERCEIRO')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: tipo === 'TERCEIRO' ? '2px solid #6366f1' : '1px solid var(--border-subtle)',
                  background: tipo === 'TERCEIRO' ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-surface-elevated)',
                  color: tipo === 'TERCEIRO' ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <UserCheck size={16} color={tipo === 'TERCEIRO' ? '#818cf8' : undefined} />
                <span>Pessoa Física (Familiar/Tio)</span>
              </button>

              <button
                type="button"
                onClick={() => setTipo('VAN')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: tipo === 'VAN' ? '2px solid #f59e0b' : '1px solid var(--border-subtle)',
                  background: tipo === 'VAN' ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-surface-elevated)',
                  color: tipo === 'VAN' ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Bus size={16} color={tipo === 'VAN' ? '#fbbf24' : undefined} />
                <span>Transporte Escolar (Van)</span>
              </button>
            </div>
          </div>

          {/* Filhos contemplados */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
              2. Filhos autorizados para esta pessoa retirar:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {childrenList.map(child => {
                const isSelected = selectedStudentIds.includes(child.id);
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => handleToggleStudent(child.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-full)',
                      border: isSelected ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.18)' : 'var(--bg-surface-elevated)',
                      color: isSelected ? '#34d399' : 'var(--text-muted)',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: isSelected ? '#10b981' : 'transparent',
                      border: isSelected ? 'none' : '1px solid var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {isSelected && <Check size={11} color="#fff" />}
                    </div>
                    <span>{child.nome} ({child.turma.split(' - ')[0]})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dados do Autorizado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Nome Completo do Autorizado *
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Roberto Mendes da Silva"
                value={nome}
                onChange={e => setNome(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                CPF *
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={e => setCpf(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Telefone / WhatsApp *
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="(11) 90000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                required
              />
            </div>

            {tipo === 'TERCEIRO' ? (
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                  Grau de Parentesco / Relação com a Criança
                </label>
                <select
                  className="input-field"
                  value={parentesco}
                  onChange={e => setParentesco(e.target.value)}
                >
                  <option value="Tio(a)">Tio(a)</option>
                  <option value="Avô / Avó">Avô / Avó</option>
                  <option value="Padrinho / Madrinha">Padrinho / Madrinha</option>
                  <option value="Irmão / Irmã Maior de Idade">Irmão / Irmã (Maior de 18 anos)</option>
                  <option value="Cuidador(a) / Babá">Cuidador(a) / Babá</option>
                  <option value="Vizinho(a) de Confiança">Vizinho(a) de Confiança</option>
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Empresa / Cooperativa de Van
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ex: Tio Marcos Transporte"
                    value={vanEmpresa}
                    onChange={e => setVanEmpresa(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                    Placa do Veículo (Opcional)
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="ABC-1234 ou BRA2E19"
                    value={vanPlaca}
                    onChange={e => setVanPlaca(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Validade */}
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
              3. Período de Validade desta Autorização
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { id: 'HOJE', label: 'Apenas Hoje', sub: 'Excepcional' },
                { id: 'MENSAL', label: '30 Dias', sub: 'Temporário' },
                { id: 'ANUAL', label: 'Ano Letivo 2026', sub: 'Recorrente' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setValidadeTipo(opt.id)}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    border: validadeTipo === opt.id ? '2px solid #818cf8' : '1px solid var(--border-subtle)',
                    background: validadeTipo === opt.id ? 'rgba(129, 140, 248, 0.2)' : 'var(--bg-surface-elevated)',
                    color: '#fff',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Termo Jurídico LGPD com Rolagem */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={14} />
                Termo de Responsabilidade & Consentimento LGPD (Art. 14)
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                Validade Jurídica Digital
              </span>
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              maxHeight: '110px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap'
            }}>
              {termoTexto}
            </div>

            {/* Checkbox de Aceite Formal */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginTop: '10px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: '#fff',
              background: acceptedTerms ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              border: acceptedTerms ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent'
            }}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                style={{ marginTop: '2px', accentColor: '#6366f1' }}
              />
              <span>
                Declaro sob as penas da lei que sou o(a) responsável legal pelas crianças acima e <strong>concedo formalmente esta autorização de saída</strong>, ciente de que poderei revogá-la a qualquer momento neste aplicativo.
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)'
          }}>
            <button
              type="button"
              className="button-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="button-primary"
              disabled={isSubmitting || !acceptedTerms}
              style={{
                background: acceptedTerms 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                  : 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ShieldCheck size={18} />
              <span>{isSubmitting ? 'Registrando...' : 'Assinar e Conceder Autorização'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
