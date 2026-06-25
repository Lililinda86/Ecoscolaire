import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { InventoryItem, InventoryTransaction } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, AlertTriangle, ArrowRightLeft, Package, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

const Inventory: React.FC = () => {
  const { db, saveDB, currentUser } = useAppContext();
  const { t } = useI18n();

  const allowedRoles = ['owner', 'director', 'secretary', 'accountant', 'superAdmin'];
  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    return (
      <div className="page-container" style={{ padding: '2rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--danger)' }}>
          <AlertTriangle size={48} style={{ marginBottom: '1rem' }} />
          <h2>Accès refusé</h2>
          <p>Vous n'avez pas les autorisations nécessaires pour accéder à l'inventaire.</p>
          <button onClick={() => window.history.back()} style={{ marginTop: '1rem' }}>Retour</button>
        </div>
      </div>
    );
  }
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [isTxModalOpen, setTxModalOpen] = useState(false);
  
  const [currentItem, setCurrentItem] = useState<Partial<InventoryItem>>({ quantity: 0, alertThreshold: 10 });
  const [currentTx, setCurrentTx] = useState<Partial<InventoryTransaction>>({ type: 'IN', quantity: 1, date: new Date().toISOString().split('T')[0] });

  const handleOpenItemModal = (item?: InventoryItem) => {
    if (item) setCurrentItem(item);
    else setCurrentItem({ quantity: 0, alertThreshold: 10 });
    setItemModalOpen(true);
  };

  const handleOpenTxModal = () => {
    setCurrentTx({ type: 'IN', quantity: 1, date: new Date().toISOString().split('T')[0], personName: '', itemId: '' });
    setTxModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    const newDb = { ...db };
    if (currentItem.id) {
      newDb.inventory = newDb.inventory.map(i => i.id === currentItem.id ? currentItem as InventoryItem : i);
    } else {
      newDb.inventory.push({ ...currentItem, id: crypto.randomUUID() } as InventoryItem);
    }
    saveDB(newDb);
    setItemModalOpen(false);
  };

  const handleSaveTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTx.itemId || !currentTx.quantity || !currentTx.personName) return;
    
    const newDb = { ...db };
    if (!newDb.inventoryTransactions) newDb.inventoryTransactions = [];
    
    newDb.inventoryTransactions.push({ ...currentTx, id: crypto.randomUUID() } as InventoryTransaction);
    
    const itemIndex = newDb.inventory.findIndex(i => i.id === currentTx.itemId);
    if (itemIndex >= 0) {
      if (currentTx.type === 'IN') {
        newDb.inventory[itemIndex].quantity += currentTx.quantity;
      } else {
        newDb.inventory[itemIndex].quantity -= currentTx.quantity;
        if (newDb.inventory[itemIndex].quantity < 0) newDb.inventory[itemIndex].quantity = 0;
      }
    }
    saveDB(newDb);
    setTxModalOpen(false);
  };

  const totalTypes = db.inventory.length;
  const articlesRupture = db.inventory.filter(i => i.quantity <= i.alertThreshold).length;
  const totalEntrees = db.inventoryTransactions?.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0) || 0;
  const totalSorties = db.inventoryTransactions?.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0) || 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('inventory', 'Inventaire & Logistique')}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="secondary" onClick={() => handleOpenItemModal()}>
            <Plus size={18} /> Ajouter du Matériel
          </button>
          <button onClick={() => handleOpenTxModal()}>
            <ArrowRightLeft size={18} /> Mouvement de stock (Apport/Retrait)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}><Package size={24} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Types d'articles</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{totalTypes}</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--danger)' }}><AlertTriangle size={24} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Articles en Rupture</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{articlesRupture}</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><ArrowDownCircle size={24} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Volume Entrées</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{totalEntrees}</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--warning)' }}><ArrowUpCircle size={24} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Volume Sorties</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{totalSorties}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '2rem' }}>
        <h2 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid var(--border-color)', background: '#f8f9fa' }}>État Actuel du Matériel</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Article</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Quantité Dispo.</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {db.inventory.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>L'inventaire est vide. Créez des articles.</td></tr>
            ) : (
              db.inventory.map(i => {
                const isLow = i.quantity <= i.alertThreshold;
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isLow && <AlertTriangle size={16} color="var(--warning)" />}
                        {i.name}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ background: isLow ? 'var(--warning)' : 'rgba(79, 70, 229, 0.1)', color: isLow ? '#fff' : 'var(--primary)', padding: '0.25rem 0.75rem', borderRadius: '1rem', fontWeight: 'bold' }}>
                        {i.quantity}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                       <button className="secondary" onClick={() => handleOpenItemModal(i)}>
                        <Edit2 size={16} /> Modifier le Matériel
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <h2 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid var(--border-color)', background: '#f8f9fa' }}>Comptabilité & Historique des Mouvements</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Article</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Quantité</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Motif / Fait par</th>
            </tr>
          </thead>
          <tbody>
            {!db.inventoryTransactions || db.inventoryTransactions.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun mouvement enregistré</td></tr>
            ) : (
              db.inventoryTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(tx => {
                const item = db.inventory.find(i => i.id === tx.itemId);
                return (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>{new Date(tx.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '1rem', fontWeight: 'bold', color: tx.type === 'IN' ? 'var(--success)' : 'var(--danger)' }}>
                      {tx.type === 'IN' ? 'APPORT (+)' : 'RETRAIT (-)'}
                    </td>
                    <td style={{ padding: '1rem' }}>{item?.name || 'Inconnu'}</td>
                    <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 'bold' }}>{tx.quantity}</td>
                    <td style={{ padding: '1rem' }}>{tx.personName}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isItemModalOpen} onClose={() => setItemModalOpen(false)} title="Configurer l'article">
        <form onSubmit={handleSaveItem}>
          <div className="form-group">
            <label>Nom de l'article (ex: Craie, Tenues)</label>
            <input required value={currentItem.name || ''} onChange={e => setCurrentItem({...currentItem, name: e.target.value})} />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Quantité initiale (ou corrigée)</label>
              <input type="number" min="0" required value={currentItem.quantity} onChange={e => setCurrentItem({...currentItem, quantity: parseInt(e.target.value)})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Seuil d'alerte</label>
              <input type="number" min="0" required value={currentItem.alertThreshold} onChange={e => setCurrentItem({...currentItem, alertThreshold: parseInt(e.target.value)})} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setItemModalOpen(false)}>{t('cancel')}</button>
            <button type="submit">{t('save')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isTxModalOpen} onClose={() => setTxModalOpen(false)} title="Nouveau Mouvement de Stock">
        <form onSubmit={handleSaveTx}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px', flex: 1, background: currentTx.type === 'IN' ? 'var(--primary-color)' : '', color: currentTx.type === 'IN' ? '#fff' : '' }}>
              <input type="radio" name="txType" checked={currentTx.type === 'IN'} onChange={() => setCurrentTx({...currentTx, type: 'IN'})} style={{ display: 'none' }} />
              <ArrowRightLeft size={16} /> APPORT (Ajouter)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px', flex: 1, background: currentTx.type === 'OUT' ? 'var(--danger)' : '', color: currentTx.type === 'OUT' ? '#fff' : '' }}>
              <input type="radio" name="txType" checked={currentTx.type === 'OUT'} onChange={() => setCurrentTx({...currentTx, type: 'OUT'})} style={{ display: 'none' }} />
              <ArrowRightLeft size={16} /> RETRAIT (Enlever)
            </label>
          </div>

          <div className="form-group">
            <label>Article</label>
            <select required value={currentTx.itemId || ''} onChange={e => setCurrentTx({...currentTx, itemId: e.target.value})}>
              <option value="">-- Choisir un article --</option>
              {db.inventory.map(i => <option key={i.id} value={i.id}>{i.name} (Dispo: {i.quantity})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Quantité</label>
              <input type="number" min="1" step="1" required value={currentTx.quantity ?? ''} onChange={e => setCurrentTx({...currentTx, quantity: parseInt(e.target.value)})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" required value={currentTx.date || ''} onChange={e => setCurrentTx({...currentTx, date: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label>Motif / Personne Responsable</label>
            <input required placeholder="Nom de la personne et le but du retrait/apport" value={currentTx.personName || ''} onChange={e => setCurrentTx({...currentTx, personName: e.target.value})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setTxModalOpen(false)}>Annuler</button>
            <button type="submit">Enregistrer Mouvement</button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Inventory;
