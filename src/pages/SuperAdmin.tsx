import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import Modal from '../components/Modal';
import { Building2, Plus, Edit2, Play, AlertCircle, CreditCard, LogOut, Building } from 'lucide-react';
import type { School, SubscriptionPlan, SubscriptionStatus } from '../types';

const SuperAdmin: React.FC = () => {
  const { db, saveDB, currentUser, logout, enterSupervision, logAuditAction } = useAppContext();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentSchool, setCurrentSchool] = useState<Partial<School>>({});

  if (!currentUser || currentUser.role !== 'superAdmin') {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Accès refusé. Réservé au Super Admin.</div>;
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Erreur : Le fichier est trop lourd (max 2 Mo).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          const base64String = canvas.toDataURL('image/jpeg', 0.8);
          
          if (base64String.length > 200000) {
            alert("Erreur : L'image reste trop lourde après compression. Veuillez choisir un logo plus simple.");
            return;
          }

          setCurrentSchool({ 
            ...currentSchool, 
            logoUrl: base64String, 
            logoFileName: file.name,
            logoUpdatedAt: new Date().toISOString()
          });
          
          logAuditAction({
            action: 'UPLOAD_LOGO',
            targetType: 'SCHOOL',
            targetId: currentSchool.id || 'NEW_SCHOOL',
            targetName: `Upload de logo: ${file.name}`
          });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newDb = { ...db };
    
    try {
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc, getDoc, collection, getDocs } = await import('firebase/firestore');

      if (currentSchool.id) {
        const updatedSchool = { ...currentSchool } as School;
        await setDoc(doc(firestoreDb, 'schools', updatedSchool.id), updatedSchool);
        console.log("🟢 [SuperAdmin] setDoc exécuté avec succès pour mise à jour :", updatedSchool.id);
        
        // --- Vérification obligatoire ---
        const checkDoc = await getDoc(doc(firestoreDb, 'schools', updatedSchool.id));
        if (!checkDoc.exists()) {
          alert("École non sauvegardée dans Firestore");
        } else {
          alert("École sauvegardée dans Firestore");
        }
        
        newDb.schools = (newDb.schools || []).map(s => s.id === updatedSchool.id ? updatedSchool : s);
      } else {
        const newSchool = { ...currentSchool, id: crypto.randomUUID(), createdAt: new Date().toISOString() } as School;
        console.log("🟢 [SuperAdmin] Création d'une nouvelle école dans l'état local :", newSchool);
        
        await setDoc(doc(firestoreDb, 'schools', newSchool.id), newSchool);
        console.log("🟢 [SuperAdmin] setDoc exécuté avec succès pour création :", newSchool.id);
        
        // --- Vérification obligatoire ---
        const checkDoc = await getDoc(doc(firestoreDb, 'schools', newSchool.id));
        if (!checkDoc.exists()) {
          alert("École non sauvegardée dans Firestore");
        } else {
          alert("École sauvegardée dans Firestore");
        }
        
        newDb.schools = [...(newDb.schools || []), newSchool];

        logAuditAction({
          action: 'CREATE_SCHOOL',
          targetType: 'SCHOOL',
          targetId: newSchool.id,
          targetName: newSchool.name
        });
      }
      
      saveDB(newDb);
      setModalOpen(false);

      const snap = await getDocs(collection(firestoreDb, 'schools'));
      console.log(`🟢 [SuperAdmin] Nombre d'écoles dans Firestore après création/update : ${snap.docs.length}`);

    } catch (err) {
      console.error("❌ Erreur lors de la sauvegarde de l'école :", err);
      alert("Erreur critique lors de la sauvegarde de l'école.");
    }
  };

  const schools = db.schools || [];
  
  // Stats
  const activeSchools = schools.filter(s => s.subscriptionStatus === 'active').length;
  const trialSchools = schools.filter(s => s.subscriptionStatus === 'trial').length;
  const suspendedSchools = schools.filter(s => s.subscriptionStatus === 'suspended' || s.subscriptionStatus === 'expired').length;
  const totalRevenus = schools.reduce((sum, s) => sum + (s.amountPaid || 0), 0);

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Building2 /> Espace Super Admin SaaS</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Gestion globale des écoles clientes</p>
        </div>
        <button className="danger" onClick={logout} data-testid="logout-button"><LogOut size={18} /> Déconnexion</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}><Building2 size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Total Écoles</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{schools.length}</p></div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><Play size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Actives / Essai</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{activeSchools} / {trialSchools}</p></div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--danger)' }}><AlertCircle size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Suspendues</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{suspendedSchools}</p></div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--warning)' }}><CreditCard size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Revenus Totaux</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{totalRevenus.toLocaleString()} FCFA</p></div>
        </div>
      </div>

      {/* Liste des Écoles */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Liste des Clients</h2>
          <button onClick={() => { setCurrentSchool({ subscriptionStatus: 'trial', subscriptionPlan: 'starter' }); setModalOpen(true); }}><Plus size={18} /> Nouvelle École</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Code / Nom</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Abonnement / Statut</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Dates & Revenus</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schools.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {s.logoUrl ? (
                    <img src={s.logoUrl} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
                  ) : (
                    <div style={{ width: '40px', height: '40px', background: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building size={20} color="#94a3b8" />
                    </div>
                  )}
                  <div>
                    <strong>{s.schoolCode}</strong><br/>
                    <small style={{ color: 'var(--text-muted)' }}>{s.name}</small>
                  </div>
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                    <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                      {s.subscriptionPlan?.toUpperCase()}
                    </span>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                      color: s.subscriptionStatus === 'active' ? '#10b981' : s.subscriptionStatus === 'trial' ? '#3b82f6' : '#ef4444',
                      background: s.subscriptionStatus === 'active' ? 'rgba(16, 185, 129, 0.1)' : s.subscriptionStatus === 'trial' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                    }}>
                      {s.subscriptionStatus?.toUpperCase()}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span><strong>Exp:</strong> {s.subscriptionEndDate || '---'}</span>
                    <span><strong>Paiement:</strong> {s.nextPaymentDate || '---'}</span>
                    <span><strong>Revenus:</strong> {s.amountPaid ? `${s.amountPaid} FCFA` : '0 FCFA'}</span>
                  </div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button 
                      className="primary" 
                      onClick={() => {
                        console.log("--- Redirection Super Admin ---");
                        console.log("École sélectionnée :", s.name);
                        console.log("schoolId :", s.id);
                        console.log("Fonction appelée : enterSupervision");
                        console.log("Route de destination : /school-dashboard");
                        enterSupervision(s.id);
                        window.location.hash = '#/school-dashboard';
                      }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      <Play size={14} style={{ marginRight: '0.25rem' }} /> Accéder
                    </button>
                    <button 
                      className="secondary" 
                      onClick={() => { setCurrentSchool(s); setModalOpen(true); }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                      <Edit2 size={14} style={{ marginRight: '0.25rem' }} /> Gérer
                    </button>
                    <button 
                      className="danger" 
                      onClick={() => {
                        const newStatus: SubscriptionStatus = s.subscriptionStatus === 'active' ? 'suspended' : 'active';
                        if (window.confirm(`Voulez-vous ${newStatus === 'suspended' ? 'suspendre' : 'réactiver'} cette école ?`)) {
                          const newDb = { ...db, schools: db.schools.map(school => school.id === s.id ? { ...school, subscriptionStatus: newStatus } : school) };
                          saveDB(newDb);
                        }
                      }}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: s.subscriptionStatus === 'active' ? '#fee2e2' : '#dcfce7', color: s.subscriptionStatus === 'active' ? '#ef4444' : '#10b981', border: 'none' }}
                    >
                      <AlertCircle size={14} style={{ marginRight: '0.25rem' }} /> {s.subscriptionStatus === 'active' ? 'Suspendre' : 'Réactiver'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {schools.length === 0 && <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center' }}>Aucune école cliente.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal Création/Édition École */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Gestion École (Client)">
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Nom de l'école</label><input required value={currentSchool.name || ''} onChange={e => setCurrentSchool({...currentSchool, name: e.target.value})} /></div>
            <div className="form-group"><label>Code École (Unique)</label><input required value={currentSchool.schoolCode || ''} onChange={e => setCurrentSchool({...currentSchool, schoolCode: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Année Académique</label><input required value={currentSchool.academicYear || ''} onChange={e => setCurrentSchool({...currentSchool, academicYear: e.target.value})} placeholder="Ex: 2023-2024" /></div>
          
          <div className="form-group" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            <label>Logo de l'école (PNG, JPG, WEBP - Max 2Mo)</label>
            <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleLogoUpload} style={{ marginBottom: '1rem' }} />
            
            {currentSchool.logoUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '80px', height: '80px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <img src={currentSchool.logoUrl} alt="Aperçu logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  Aperçu du logo (Optimisé en Base64 JPEG)
                  {currentSchool.logoUpdatedAt && <div>Mis à jour : {new Date(currentSchool.logoUpdatedAt).toLocaleString()}</div>}
                </div>
                <button type="button" className="danger" onClick={() => setCurrentSchool({ ...currentSchool, logoUrl: undefined, logoFileName: undefined, logoUpdatedAt: undefined })} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                  Retirer
                </button>
              </div>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Formule d'abonnement</label>
              <select required value={currentSchool.subscriptionPlan || 'starter'} onChange={e => setCurrentSchool({...currentSchool, subscriptionPlan: e.target.value as SubscriptionPlan})}>
                <option value="starter">Starter (Max 200 élèves)</option>
                <option value="standard">Standard (Max 1000 élèves + Parents)</option>
                <option value="premium">Premium (Illimité + Automatisations)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Statut Abonnement</label>
              <select required value={currentSchool.subscriptionStatus || 'trial'} onChange={e => setCurrentSchool({...currentSchool, subscriptionStatus: e.target.value as SubscriptionStatus})}>
                <option value="trial">Essai (Trial)</option>
                <option value="active">Actif</option>
                <option value="suspended">Suspendu</option>
                <option value="expired">Expiré</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Date de Début</label><input type="date" value={currentSchool.subscriptionStartDate || ''} onChange={e => setCurrentSchool({...currentSchool, subscriptionStartDate: e.target.value})} /></div>
            <div className="form-group"><label>Date d'Expiration</label><input type="date" value={currentSchool.subscriptionEndDate || ''} onChange={e => setCurrentSchool({...currentSchool, subscriptionEndDate: e.target.value})} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Montant Payé (Revenus)</label><input type="number" value={currentSchool.amountPaid || ''} onChange={e => setCurrentSchool({...currentSchool, amountPaid: parseInt(e.target.value)})} /></div>
            <div className="form-group"><label>Prochain Paiement</label><input type="date" value={currentSchool.nextPaymentDate || ''} onChange={e => setCurrentSchool({...currentSchool, nextPaymentDate: e.target.value})} /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Annuler</button>
            <button type="submit">Sauvegarder Client</button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default SuperAdmin;
