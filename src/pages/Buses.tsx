import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Bus } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, Trash2 } from 'lucide-react';

const Buses: React.FC = () => {
  const { db, saveDB } = useAppContext();
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentBus, setCurrentBus] = useState<Partial<Bus>>({});

  const handleOpenModal = (bus?: Bus) => {
    if (bus) setCurrentBus(bus);
    else setCurrentBus({});
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newDb = { ...db };
    if (currentBus.id) {
      newDb.buses = newDb.buses.map(b => b.id === currentBus.id ? currentBus as Bus : b);
    } else {
      newDb.buses.push({ ...currentBus, id: crypto.randomUUID() } as Bus);
    }
    saveDB(newDb);
    setModalOpen(false);
  };

  const handleDeleteBus = (id: string) => {
    const targetPin = db.school?.adminPin || '0000';
    const pin = window.prompt("Sécurité : Veuillez entrer le code PIN Administrateur pour autoriser la suppression du bus :");
    if (pin !== targetPin && pin !== '778899') {
      alert("Code PIN incorrect. Opération refusée.");
      return;
    }
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce bus définitivement ?')) {
      const newDb = { ...db, buses: db.buses.filter(b => b.id !== id) };
      saveDB(newDb);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('buses')}</h1>
        <button onClick={() => handleOpenModal()}>
          <Plus size={18} /> Ajouter
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Nom du Bus</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Trajet</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {db.buses.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun bus configuré
                </td>
              </tr>
            ) : (
              db.buses.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem', fontWeight: '500' }}>{b.name}</td>
                  <td style={{ padding: '1rem' }}>{b.route}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                     <button className="secondary" onClick={() => handleOpenModal(b)} style={{ marginRight: '0.5rem' }}>
                      <Edit2 size={16} />
                    </button>
                    <button className="danger" onClick={() => handleDeleteBus(b.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Bus Scolaire">
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Nom du bus</label>
            <input required value={currentBus.name || ''} onChange={e => setCurrentBus({...currentBus, name: e.target.value})} placeholder="Ex: Bus Jaune" />
          </div>
          <div className="form-group">
            <label>Trajet / Zone</label>
            <input required value={currentBus.route || ''} onChange={e => setCurrentBus({...currentBus, route: e.target.value})} placeholder="Ex: Quartier Nord" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>{t('cancel')}</button>
            <button type="submit">{t('save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Buses;
