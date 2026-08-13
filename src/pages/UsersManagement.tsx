import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Users, Plus, Shield, ShieldOff, Edit2 } from 'lucide-react';
import type { User, GlobalRole } from '../types';
import Modal from '../components/Modal';
import { createSecondaryUserForPasswordSetup, db as firebaseDb, requestPasswordReset } from '../db/firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getCreatableRoles } from '../utils/authRoles';
import { getFirebaseErrorCode } from '../utils/authSecurity';
const ROLE_LABELS: Partial<Record<GlobalRole, string>> = {
  director: 'Directeur',
  secretary: 'Secrétaire',
  accountant: 'Comptable',
  teacher: 'Enseignant',
  driver: 'Chauffeur'
};

const UsersManagement: React.FC = () => {
  const { db, updateLocalState, currentUser, currentSchool, logAuditAction } = useAppContext();
  const [isModalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState<Partial<User>>({
    role: 'teacher',
    isActive: true
  });

  if (!db || !currentUser) return null;

  // Seuls les admins peuvent gérer les utilisateurs
  const canManage = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  if (!canManage) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Accès refusé.</div>;
  }

  const users = db.users || [];
  const displayUsers = currentUser.role === 'superAdmin' && !currentSchool 
    ? users 
    : users.filter(u => u.schoolId === currentSchool?.id);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (formData.id) {
        const isActive = formData.isActive !== false;
        await updateDoc(doc(firebaseDb, 'users', formData.id), {
          active: isActive,
          isActive,
          status: isActive ? 'active' : 'inactive'
        });
        updateLocalState(prev => ({
          users: prev.users.map(user => user.id === formData.id
            ? { ...user, active: isActive, isActive, status: isActive ? 'active' : 'inactive' }
            : user)
        }));
      } else {
        if (!formData.email) throw new Error("Email requis");
        if (!currentSchool) throw new Error("Sélectionnez d'abord une école");

        const role = formData.role as GlobalRole;
        if (!getCreatableRoles(currentUser.role).includes(role)) {
          throw new Error("Rôle non autorisé");
        }

        const normalizedEmail = formData.email.trim().toLowerCase();
        let fbUser: Awaited<ReturnType<typeof createSecondaryUserForPasswordSetup>>;
        try {
          fbUser = await createSecondaryUserForPasswordSetup(normalizedEmail);
        } catch (error: unknown) {
          if (getFirebaseErrorCode(error) === 'auth/email-already-in-use') {
            throw new Error("Un compte Firebase Auth existe déjà pour cet email. Aucun doublon n'a été créé. Réconciliez son profil EcoScolaire avant de réessayer.");
          }
          throw error;
        }
        
        const newUser: User = {
          id: fbUser.uid,
          email: normalizedEmail,
          role,
          schoolId: currentSchool.id,
          active: true,
          isActive: true,
          status: 'active',
          createdAt: new Date().toISOString()
        };

        try {
          await setDoc(doc(firebaseDb, 'users', newUser.id), newUser, { merge: true });
        } catch {
          throw new Error("Le compte Firebase Auth a été créé, mais son profil EcoScolaire n'a pas pu être créé. Ce compte n'a aucun accès applicatif et doit être réconcilié avant une nouvelle tentative.");
        }
        updateLocalState(prev => ({ users: [...prev.users, newUser] }));

        let setupEmailSent = true;
        try {
          await requestPasswordReset(normalizedEmail);
        } catch {
          setupEmailSent = false;
        }
        
        await logAuditAction({
          action: 'CREATE_USER',
          targetType: 'USER',
          targetId: newUser.id,
          targetName: newUser.email,
          details: { setupEmailSent }
        });

        if (!setupEmailSent) {
          alert("Le compte a été créé, mais l'email de définition du mot de passe n'a pas pu être envoyé. L'utilisateur peut utiliser « Mot de passe oublié ».");
        }
      }
      setModalOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Erreur: " + message);
    }
    setLoading(false);
  };

  const getRoleBadge = (role: string) => {
    switch(role) {
      case 'superAdmin': return <span style={{ background: '#fef2f2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>Super Admin</span>;
      case 'owner': return <span style={{ background: '#fef3c7', color: '#b45309', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>Fondateur</span>;
      case 'director': return <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>Directeur</span>;
      default: return <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>{role}</span>;
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '50%', color: '#475569' }}>
            <Users size={32} />
          </div>
          <div>
            <h1 style={{ margin: 0 }}>Gestion des Accès & Rôles</h1>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>
              Sécurisation et administration des comptes {currentSchool ? `(${currentSchool.name})` : '(Toutes les écoles)'}
            </p>
          </div>
        </div>
        <button className="primary" disabled={!currentSchool} onClick={() => { setFormData({ role: 'teacher', isActive: true }); setModalOpen(true); }}>
          <Plus size={18} /> Nouvel Utilisateur
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
            <tr>
              <th style={{ padding: '1rem' }}>Email / Identifiant</th>
              <th style={{ padding: '1rem' }}>Rôle</th>
              <th style={{ padding: '1rem' }}>Statut</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayUsers.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '1rem' }}><strong>{u.email}</strong><br/><small style={{ color: '#64748b' }}>{u.id}</small></td>
                <td style={{ padding: '1rem' }}>{getRoleBadge(u.role)}</td>
                <td style={{ padding: '1rem' }}>
                  {u.isActive ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a' }}><Shield size={14} /> Actif</span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#dc2626' }}><ShieldOff size={14} /> Suspendu</span>
                  )}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button className="secondary" onClick={() => { setFormData(u); setModalOpen(true); }} style={{ padding: '0.25rem 0.5rem' }}>
                    <Edit2 size={14} /> Gérer
                  </button>
                </td>
              </tr>
            ))}
            {displayUsers.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center' }}>Aucun utilisateur trouvé.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title={formData.id ? "Modifier l'utilisateur" : "Créer un utilisateur"}>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Email de connexion</label>
            <input type="email" required value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} disabled={!!formData.id} />
            {!!formData.id && <small style={{ color: '#dc2626' }}>L'email Firebase ne peut pas être modifié ici.</small>}
          </div>
          
          <div className="form-group">
            <label>Rôle Sécurité</label>
            <select required value={formData.role || 'teacher'} onChange={e => setFormData({...formData, role: e.target.value as GlobalRole})} disabled={!!formData.id}>
              {(formData.id ? [formData.role] : getCreatableRoles(currentUser.role)).filter(Boolean).map(role => (
                <option key={role} value={role}>{ROLE_LABELS[role as GlobalRole] || role}</option>
              ))}
            </select>
            {!formData.id && <small>Un email sécurisé permettra à l'utilisateur de définir lui-même son mot de passe.</small>}
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={formData.isActive ?? false} onChange={e => setFormData({...formData, isActive: e.target.checked})} disabled={!formData.id || formData.id === currentUser.id} />
              Compte Actif (Autoriser la connexion)
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Annuler</button>
            <button type="submit" disabled={loading}>{loading ? 'Chargement...' : 'Enregistrer'}</button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default UsersManagement;
