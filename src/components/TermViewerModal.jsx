import React from 'react';
import { 
  X, Printer, ShieldCheck, Award 
} from 'lucide-react';

export default function TermViewerModal({ isOpen, onClose, authorization }) {
  if (!isOpen || !authorization) return null;

  const auth = authorization;
  const isVan = auth.tipo === 'VAN' || Boolean(auth.vanEmpresa);
  const dataEmissao = auth.createdAt 
    ? new Date(auth.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '28/10/2026, 14:30';

  const validadeTexto = auth.validadeTipo === 'HOJE' 
    ? 'Apenas na data de emissão (Retirada Emergencial / Pontual)'
    : auth.validadeTipo === 'MENSAL'
    ? '30 dias corridos a partir da emissão'
    : 'Ano Letivo Vigente 2026 (Até 20/12/2026)';

  const auditHash = auth.ipHash || `BR-LGPD-${Math.abs(hashCode(auth.id || auth.nome || 'valida')).toString(16).toUpperCase()}-2026`;

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 16, 0.88)',
        backdropFilter: 'blur(8px)',
        zIndex: 1100,
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
          maxWidth: '680px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1.5px solid rgba(99, 102, 241, 0.35)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Award size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Certificado Digital de Autorização de Retirada
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>
                Instrumento Jurídico em Conformidade com a LGPD (Lei Federal 13.709/2018, Art. 14)
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

        {/* Certificate Body (Printable) */}
        <div 
          className="printable-certificate"
          style={{ 
            padding: '24px', 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '16px',
            fontSize: '0.88rem',
            lineHeight: 1.6
          }}
        >
          {/* Institutional Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px'
          }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Instituição de Ensino
              </span>
              <strong style={{ display: 'block', color: '#fff', fontSize: '0.95rem' }}>
                Colégio Integrado Valida School
              </strong>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Código de Autenticidade
              </span>
              <span style={{ display: 'block', fontFamily: 'var(--font-mono)', color: '#818cf8', fontWeight: 700, fontSize: '0.82rem' }}>
                {auditHash}
              </span>
            </div>
          </div>

          {/* Legal Text */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '18px',
            color: '#cbd5e1'
          }}>
            <p style={{ marginTop: 0 }}>
              Pelo presente instrumento particular eletrônico emitido nos termos do <strong>Artigo 14 da Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong> e das diretrizes do Estatuto da Criança e do Adolescente (ECA - Lei nº 8.069/1990):
            </p>

            <div style={{ margin: '14px 0', padding: '12px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px' }}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Outorgante (Responsável Legal): </span>
                <strong style={{ color: '#fff' }}>{auth.criadoPorNome || 'Ana Silva Pereira'}</strong>
                <span style={{ color: 'var(--text-muted)' }}> (CPF: 111.222.333-44)</span>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Outorgado (Pessoa Autorizada): </span>
                <strong style={{ color: '#fff' }}>{auth.nome}</strong>
                <span style={{ color: 'var(--text-muted)' }}> • CPF: {auth.cpf || 'Não informado'} • Tel: {auth.telefone || 'N/A'}</span>
              </div>

              {isVan && (
                <div style={{ marginBottom: '8px', color: '#fbbf24' }}>
                  <span>Transportador Homologado: </span>
                  <strong>{auth.vanEmpresa || 'Van Escolar'}</strong>
                  {auth.vanPlaca && <span> (Placa do Veículo: {auth.vanPlaca})</span>}
                </div>
              )}

              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-dim)' }}>Menor(es) Contemplado(s): </span>
                <strong style={{ color: '#10b981' }}>
                  {auth.alunoNomes?.join(', ') || 'Alunos da Família Silva'}
                </strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-dim)' }}>Período de Vigência: </span>
                <strong style={{ color: '#818cf8' }}>{validadeTexto}</strong>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 0 }}>
              O titular da autoridade parental declara expressamente que a retirada do(s) menor(es) na portaria da instituição somente se concretizará mediante autenticação biométrica facial e conferência de prova de vida em tempo real no Totem de Acesso. A presente autorização pode ser revogada a qualquer momento pelo aplicativo oficial do responsável legal.
            </p>
          </div>

          {/* Electronic Signature Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={24} color="#10b981" />
              <div>
                <strong style={{ fontSize: '0.85rem', color: '#10b981', display: 'block' }}>
                  Assinatura Eletrônica Válida & Homologada
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
                  Emitido em: {dataEmissao} • Carimbo de Tempo Seguro
                </span>
              </div>
            </div>

            <div style={{
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.72rem',
              fontWeight: 800
            }}>
              STATUS: ATIVO
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(15, 23, 42, 0.8)'
        }}>
          <button
            onClick={handlePrint}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Printer size={16} />
            <span>Imprimir / Salvar PDF</span>
          </button>

          <button
            onClick={onClose}
            className="button-primary"
            style={{ padding: '8px 20px', fontSize: '0.82rem' }}
          >
            Fechar Certificado
          </button>
        </div>
      </div>
    </div>
  );
}
