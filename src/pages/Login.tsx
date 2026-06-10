import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Lock, Mail, Building, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';
import Modal from '../components/Modal';

const Login: React.FC = () => {
  const { login } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Recovery State
  const [isRecoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const success = await login(email, password);
    if (!success) {
      setError("Identifiants incorrects ou accès refusé.");
    }
    
    setLoading(false);
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverySent(true);
    setTimeout(() => {
      setRecoveryModalOpen(false);
      setRecoverySent(false);
      setRecoveryEmail('');
    }, 4000);
  };

  const { isFirestoreConnected, firestoreError } = useAppContext();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #4f46e5 0%, #10b981 100%)', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '2.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary)', color: 'white', marginBottom: '1rem' }}>
            <Building size={32} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-color)' }}>EcoScolaire SaaS</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>Connectez-vous à votre espace</p>
        </div>

        {isFirestoreConnected === false && (
          <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid #f87171' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertTriangle size={18} /> <strong>Erreur de Base de Données</strong>
            </div>
            {firestoreError}
            <div style={{ marginTop: '0.5rem' }}>
              <a href="#/diagnostic" style={{ color: '#991b1b', textDecoration: 'underline', fontWeight: 600 }}>Voir le Diagnostic complet</a>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid #f87171' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Email de connexion</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                required 
                placeholder="Ex: kyrialove@gmail.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Mot de passe (Min. 6 caractères)</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type={showPassword ? "text" : "password"} 
                required 
                placeholder="••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: '0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            <button 
              type="button" 
              onClick={() => setRecoveryModalOpen(true)}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontWeight: 500 }}
            >
              Mot de passe oublié ?
            </button>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            style={{ width: '100%', padding: '0.875rem', borderRadius: '8px', fontWeight: 600, fontSize: '1rem' }}
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>
      </div>

      {/* Modal de récupération */}
      <Modal isOpen={isRecoveryModalOpen} onClose={() => setRecoveryModalOpen(false)} title="Récupération du mot de passe">
        {recoverySent ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Demande envoyée !</h3>
            <p style={{ color: 'var(--text-muted)' }}>Si cet identifiant correspond à un compte, vous recevrez un email contenant un lien pour réinitialiser votre mot de passe.</p>
          </div>
        ) : (
          <form onSubmit={handleRecoverySubmit}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#1e40af', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                Entrez l'email ou le numéro de téléphone associé à votre compte. Un lien de réinitialisation vous sera envoyé.
              </p>
            </div>
            <div className="form-group">
              <label>Identifiant (Email / Téléphone)</label>
              <input 
                type="text" 
                required 
                value={recoveryEmail}
                onChange={e => setRecoveryEmail(e.target.value)}
                placeholder="Ex: kyrialove@gmail.com"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
              <button type="button" className="secondary" onClick={() => setRecoveryModalOpen(false)}>Annuler</button>
              <button type="submit">Envoyer la demande</button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
};

export default Login;
