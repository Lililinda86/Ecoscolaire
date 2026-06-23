import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../db/firebase';
import type { ParentInvitation } from '../types';
import { GraduationCap, AlertCircle, CheckCircle } from 'lucide-react';

const ParentSignup: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteId = searchParams.get('inviteId');

  const [invitation, setInvitation] = useState<ParentInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      if (!inviteId) {
        setError('Lien d\'invitation manquant.');
        setLoading(false);
        return;
      }

      try {
        const invDoc = await getDoc(doc(db, 'parent_invitations', inviteId));
        if (!invDoc.exists()) {
          setError('Cette invitation n\'existe pas.');
          setLoading(false);
          return;
        }

        const data = invDoc.data() as ParentInvitation;
        
        if (data.status !== 'pending') {
          setError('Cette invitation a déjà été utilisée.');
          setLoading(false);
          return;
        }

        const expiresAtTime = typeof (data.expiresAt as any)?.toDate === 'function' 
          ? (data.expiresAt as any).toDate().getTime() 
          : new Date(data.expiresAt).getTime();
          
        if (expiresAtTime < Date.now()) {
          setError('Cette invitation a expiré.');
          setLoading(false);
          return;
        }

        setInvitation(data);
        setName(data.parentName || '');
      } catch (err: any) {
        console.error("Erreur lecture invitation:", err);
        setError('Erreur lors de la lecture de l\'invitation. Veuillez réessayer.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [inviteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    if (password !== confirmPassword) {
      alert("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
      alert("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Créer le compte Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, invitation.parentEmail, password);
      const user = userCredential.user;

      // 2. Préparer le batch pour créer le profil et marquer l'invitation utilisée
      // Puisque createUserWithEmailAndPassword est asynchrone et connecte immédiatement, 
      // le profil Auth est déjà la session active.
      // Firestore va utiliser notre nouvelle règle de sécurité.
      
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);

      const userRef = doc(db, 'users', user.uid);
      batch.set(userRef, {
        id: user.uid,
        email: invitation.parentEmail,
        displayName: name,
        role: 'parent',
        schoolId: invitation.schoolId,
        active: true,
        isActive: true,
        inviteId: invitation.id,
        createdAt: new Date().toISOString()
      });

      const invRef = doc(db, 'parent_invitations', invitation.id);
      batch.update(invRef, {
        status: 'used',
        usedAt: new Date().toISOString(),
        usedBy: user.uid
      });

      await batch.commit();

      // Rediriger vers l'accueil, AppContext gérera le routage Parent
      navigate('/');
      
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        alert("Cet email est déjà utilisé par un autre compte. Si vous avez déjà un compte, connectez-vous directement sur la page d'accueil.");
        navigate('/login');
      } else {
        alert("Erreur lors de l'inscription : " + err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-box" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Chargement de l'invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="login-container">
        <div className="login-box" style={{ textAlign: 'center', padding: '2rem' }}>
          <AlertCircle size={48} color="var(--danger)" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Invitation Invalide</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{error}</p>
          <button onClick={() => navigate('/login')} style={{ width: '100%', padding: '0.75rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Aller à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="login-logo">
            <GraduationCap size={40} color="var(--primary)" />
          </div>
          <h1>Portail Parent</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Vous avez été invité à suivre la scolarité de <strong>{invitation?.studentName}</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Adresse E-mail</label>
            <input 
              type="email" 
              value={invitation?.parentEmail} 
              disabled 
              style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}
              title="Votre email d'invitation ne peut pas être modifié"
            />
          </div>

          <div className="form-group">
            <label>Votre Nom Complet</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Jean Dupont"
            />
          </div>

          <div className="form-group">
            <label>Mot de passe</label>
            <input 
              type="password" 
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
            />
          </div>

          <div className="form-group">
            <label>Confirmer le mot de passe</label>
            <input 
              type="password" 
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="login-btn"
            disabled={submitting}
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
          >
            {submitting ? 'Création en cours...' : (
              <>
                <CheckCircle size={18} />
                Créer mon compte
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ParentSignup;
