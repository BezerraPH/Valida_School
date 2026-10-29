// WhatsApp Notification Service with Strategy Pattern (Valida School)
// Compatible with: 'mock' (Console/Dev), 'waha' / 'evolution' (Docker On-Premise) and 'meta' (Official Cloud API)

const PROVIDER = process.env.WHATSAPP_PROVIDER || 'mock';
const META_TOKEN = process.env.WHATSAPP_META_TOKEN || '';
const META_PHONE_ID = process.env.WHATSAPP_META_PHONE_ID || '';
const WAHA_URL = process.env.WAHA_URL || 'http://localhost:3000';

export class WhatsappService {
  /**
   * Dispara comprovante de saída para os pais
   */
  static async notificarSaidaLiberada({ telefone, alunoNome, adultoNome, parentesco, portao, timestamp, fotoUrl }) {
    if (!telefone) return;
    const cleanPhone = telefone.replace(/\D/g, '');
    const hora = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const mensagem = 
      `🔒 *Valida School — Comprovante de Saída Escolar*\n\n` +
      `Olá! Informamos que seu(sua) filho(a) *${alunoNome}* foi liberado(a) com segurança.\n\n` +
      `👤 *Retirado por:* ${adultoNome} (${parentesco || 'Autorizado'})\n` +
      `🕒 *Horário:* ${hora}\n` +
      `📍 *Local:* ${portao || 'Portaria Principal'}\n` +
      `✅ *Método:* PIN Dinâmico + Biometria Facial Atestada\n\n` +
      `_Este é um registro oficial de segurança emitido pela instituição._`;

    return this.enviarMensagem(cleanPhone, mensagem, fotoUrl);
  }

  /**
   * Dispara alerta de segurança imediato caso ocorra excesso de erros de PIN no Totem
   */
  static async notificarAlertaSeguranca({ telefone, alunoNome, motivo }) {
    if (!telefone) return;
    const cleanPhone = telefone.replace(/\D/g, '');
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const mensagem =
      `⚠️ *ALERTA DE SEGURANÇA — Valida School*\n\n` +
      `Atenção: Foi detectada uma ocorrência de segurança envolvendo seu(sua) filho(a) *${alunoNome}* na portaria às ${hora}.\n\n` +
      `Motivo: *${motivo || '3 tentativas incorretas de PIN consecutivas'}*.\n` +
      `Acesso automático temporariamente suspenso por 5 minutos por precaução.\n\n` +
      `Se não foi alguém de sua confiança, entre em contato imediatamente com a coordenação escolar.`;

    return this.enviarMensagem(cleanPhone, mensagem);
  }

  /**
   * Envio agnóstico de mensagem via Provider ativo
   */
  static async enviarMensagem(to, texto, mediaUrl = null) {
    console.log(`📱 [WhatsApp - ${PROVIDER.toUpperCase()}] Enviando para ${to}:`);
    console.log(texto);
    if (mediaUrl) console.log(`   📎 Anexo (Foto da portaria): ${mediaUrl.slice(0, 50)}...`);

    if (PROVIDER === 'mock') {
      return { success: true, provider: 'mock', status: 'simulated' };
    }

    // Provedor Waha / Evolution API (Docker)
    if (PROVIDER === 'waha' || PROVIDER === 'evolution') {
      try {
        const response = await fetch(`${WAHA_URL}/api/sendText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: `${to}@c.us`,
            text: texto,
            session: 'default'
          })
        });
        return await response.json();
      } catch (err) {
        console.warn('Erro ao disparar via WAHA/Evolution:', err.message);
        return { success: false, error: err.message };
      }
    }

    // Provedor Oficial Meta Cloud API
    if (PROVIDER === 'meta') {
      try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${META_PHONE_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${META_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: texto }
          })
        });
        return await response.json();
      } catch (err) {
        console.warn('Erro ao disparar via Meta Cloud API:', err.message);
        return { success: false, error: err.message };
      }
    }
  }
}
