import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { MessageSquare, Phone, Send, FileText, Settings, ShieldAlert } from 'lucide-react';

const Communication: React.FC = () => {
  const { db } = useAppContext();
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [messageType, setMessageType] = useState<'rappel' | 'absence' | 'bulletin' | 'custom'>('rappel');
  const [recipient, setRecipient] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const generateWhatsAppLink = () => {
    let text = "";
    
    if (messageType === 'rappel') {
      text = `Bonjour cher parent,\n\nCeci est un rappel aimable concernant le paiement de la scolarité de votre enfant à ${db.school?.name}. Le délai pour la tranche actuelle est dépassé.\n\nMerci de régulariser la situation.\nCordialement, L'Administration.`;
    } else if (messageType === 'absence') {
      text = `Bonjour,\n\nNous vous informons que votre enfant est absent ce jour à ${db.school?.name}. Merci de nous contacter pour justifier cette absence.\n\nCordialement, La Direction.`;
    } else if (messageType === 'bulletin') {
      text = `Bonjour,\n\nLe bulletin de fin de trimestre de votre enfant est disponible. Vous pouvez le consulter sur le portail parent EcoScolaire ou passer le récupérer à la scolarité.\n\nCordialement, ${db.school?.name}.`;
    } else {
      text = customMessage;
    }

    const encodedText = encodeURIComponent(text);
    // Supprime le "+" ou les espaces du numéro pour le format wa.me
    const cleanPhone = recipient.replace(/[^0-9]/g, '');
    
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  };

  const handleSend = () => {
    if (!recipient) {
      alert("Veuillez entrer un numéro de téléphone valide.");
      return;
    }
    const link = generateWhatsAppLink();
    window.open(link, '_blank');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-color)', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <MessageSquare color="var(--primary-color)" /> Communication
      </h1>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <button 
            onClick={() => setActiveTab('whatsapp')}
            style={{ background: activeTab === 'whatsapp' ? '#25D366' : 'transparent', color: activeTab === 'whatsapp' ? 'white' : 'var(--text-muted)', border: 'none', padding: '0.5rem 1rem', borderRadius: '999px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <MessageSquare size={18} /> WhatsApp
          </button>
          <button 
            onClick={() => setActiveTab('sms')}
            style={{ background: activeTab === 'sms' ? 'var(--primary-color)' : 'transparent', color: activeTab === 'sms' ? 'white' : 'var(--text-muted)', border: 'none', padding: '0.5rem 1rem', borderRadius: '999px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Phone size={18} /> SMS (Bientôt)
          </button>
          <button 
            onClick={() => setActiveTab('email')}
            style={{ background: activeTab === 'email' ? 'var(--accent-color)' : 'transparent', color: activeTab === 'email' ? 'white' : 'var(--text-muted)', border: 'none', padding: '0.5rem 1rem', borderRadius: '999px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FileText size={18} /> Email
          </button>
        </div>

        {activeTab === 'whatsapp' && (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', color: '#166534', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.875rem' }}>
                <strong>Intégration WhatsApp Web/Mobile</strong><br/>
                Ce module utilise les liens <code>wa.me</code> pour ouvrir directement WhatsApp sur votre appareil. L'intégration d'APIs automatiques (Twilio, Meta Business, N8N) nécessite la configuration d'un compte développeur dans les paramètres globaux du serveur.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '1rem' }}>Type de message</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background: messageType === 'rappel' ? '#eff6ff' : 'white' }}>
                    <input type="radio" name="msgType" checked={messageType === 'rappel'} onChange={() => setMessageType('rappel')} /> Rappel de Paiement
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background: messageType === 'absence' ? '#eff6ff' : 'white' }}>
                    <input type="radio" name="msgType" checked={messageType === 'absence'} onChange={() => setMessageType('absence')} /> Avis d'Absence
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background: messageType === 'bulletin' ? '#eff6ff' : 'white' }}>
                    <input type="radio" name="msgType" checked={messageType === 'bulletin'} onChange={() => setMessageType('bulletin')} /> Disponibilité Bulletin
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background: messageType === 'custom' ? '#eff6ff' : 'white' }}>
                    <input type="radio" name="msgType" checked={messageType === 'custom'} onChange={() => setMessageType('custom')} /> Message Personnalisé
                  </label>
                </div>
              </div>

              <div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Numéro de téléphone du destinataire (avec indicatif, ex: 2376XXXXXXXX)</label>
                  <input 
                    type="text" 
                    value={recipient} 
                    onChange={e => setRecipient(e.target.value)} 
                    placeholder="Ex: 237699001122" 
                    style={{ width: '100%' }}
                  />
                </div>

                {messageType === 'custom' && (
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label>Votre message</label>
                    <textarea 
                      value={customMessage} 
                      onChange={e => setCustomMessage(e.target.value)}
                      rows={5}
                      style={{ width: '100%', resize: 'vertical' }}
                      placeholder="Tapez votre message ici..."
                    />
                  </div>
                )}

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-color)', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  <strong>Aperçu :</strong><br/>
                  <i>{
                    messageType === 'rappel' ? "Bonjour cher parent,\n\nCeci est un rappel aimable concernant le paiement..." :
                    messageType === 'absence' ? "Bonjour,\n\nNous vous informons que votre enfant est absent ce jour..." :
                    messageType === 'bulletin' ? "Bonjour,\n\nLe bulletin de fin de trimestre de votre enfant est disponible..." :
                    (customMessage || "Saisissez un message personnalisé.")
                  }</i>
                </div>

                <button 
                  onClick={handleSend}
                  style={{ background: '#25D366', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', padding: '0.75rem' }}
                >
                  <Send size={20} />
                  Ouvrir dans WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'whatsapp' && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Settings size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3>Module en cours de développement</h3>
            <p>L'intégration des passerelles SMS et Email Pro est prévue pour la prochaine version majeure.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Communication;
