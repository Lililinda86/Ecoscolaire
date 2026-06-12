import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Users, Plus, Shield, ShieldOff, Edit2, Key } from 'lucide-react';
import type { User, GlobalRole } from '../types';
import Modal from '../components/Modal';
import { createSecondaryUser } from '../db/firebase';

const UsersManagement: React.FC = () => {
  const { db, saveDB, currentUser, currentSchool, logAuditAction } = useAppContext();
  const [isModalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState<Partial<User>>({
    role: 'teacher',
    isActive: true
  });
  const [password, setPassword] = useState('123456');

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
      const newDb = { ...db };
      
      if (formData.id) {
        // Mise à jour (pas de changement de mot de passe ici, juste des rôles/status)
        newDb.users = newDb.users.map(u => u.id === formData.id ? { ...u, ...formData } as User : u);
        await saveDB(newDb);
      } else {
        // Création d'un NOUVEL utilisateur Firebase Auth
        if (!formData.email) throw new Error("Email requis");
        
        console.log("Création auth Firebase silencieuse...");
        const fbUser = await createSecondaryUser(formData.email, password);
        
        const newUser: User = {
          id: fbUser.uid,
          email: formData.email,
          role: formData.role as GlobalRole,
          schoolId: currentSchool?.id,
          isActive: formData.isActive || true,
          createdAt: new Date().toISOString(),
          mustChangePin: true // Force password change later if we implement it
        };
        
        newDb.users.push(newUser);
        await saveDB(newDb);
        
        await logAuditAction({
          action: 'CREATE_USER',
          targetType: 'USER',
          targetId: newUser.id,
          targetName: newUser.email
        });
      }
      setModalOpen(false);
    } catch (err: any) {
      alert("Erreur: " + err.message);
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
        <button className="primary" onClick={() => { setFormData({ role: 'teacher', isActive: true }); setPassword('123456'); setModalOpen(true); }}>
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
          
          {!formData.id && (
            <div className="form-group">
              <label>Mot de passe initial (Min. 6 caractères)</label>
              <div style={{ position: 'relative' }}>
                <Key size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input type="text" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} style={{ paddingLeft: '2.5rem' }} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Rôle Sécurité</label>
            <select required value={formData.role || 'teacher'} onChange={e => setFormData({...formData, role: e.target.value as GlobalRole})} disabled={formData.id === currentUser.id}>
              {currentUser.role === 'superAdmin' && <option value="superAdmin">Super Admin (Accès total absolu)</option>}
              {['superAdmin', 'owner'].includes(currentUser.role) && <option value="owner">Fondateur / Propriétaire</option>}
              <option value="director">Directeur</option>
              <option value="accountant">Comptable</option>
              <option value="secretary">Secrétaire</option>
              <option value="teacher">Enseignant</option>
              <option value="driver">Chauffeur</option>
              <option value="parent">Parent</option>
              <option value="student">Élève</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={formData.isActive || false} onChange={e => setFormData({...formData, isActive: e.target.checked})} disabled={formData.id === currentUser.id} />
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
