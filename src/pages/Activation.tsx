import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ShieldAlert, KeyRound } from 'lucide-react';

const Activation: React.FC = () => {
  const { db, saveDB } = useAppContext();
  const [key, setKey] = useState('');
  const [error, setError] = useState(false);

  // Algorithme de vérification (Hors-Ligne)
  // Format attendu : ECO-XXXXX-YYYYY
  const verifyKey = (input: string) => {
    const parts = input.toUpperCase().split('-');
    if (parts.length !== 3 || parts[0] !== 'ECO') return false;
    
    const part1 = parts[1];
    const part2 = parts[2];
    if (part1.length !== 5 || part2.length !== 5) return false;

    // Checksum simple: somme des caractères ASCII de la partie 1 = clé de validation dans la partie 2
    let sum = 0;
    for(let i = 0; i < part1.length; i++) {
        sum += part1.charCodeAt(i);
    }
    
    // Le checksum est multiplié par 3 et converti en base 36 (lettres/chiffres)
    const expectedPart2 = (sum * 3).toString(36).toUpperCase().padStart(5, '0');
    
    return part2 === expectedPart2;
  };

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyKey(key.trim())) {
      setError(false);
      saveDB({ ...db, isActivated: true });
      window.location.reload();
    } else {
      setError(true);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))' }}>
      <div className="card" style={{ maxWidth: '500px', width: '90%', padding: '3rem', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
        <div style={{ background: '#eef2ff', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem auto' }}>
          <ShieldAlert size={40} color="var(--primary-color)" />
        </div>
        <h1 style={{ marginBottom: '1rem', color: '#1f2937' }}>Activation du Produit</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.5 }}>
          Cette copie de <strong>EcoScolaire Pro</strong> nécessite une clé de licence pour fonctionner. Veuillez entrer le code d'activation fourni par le vendeur.
        </p>

        <form onSubmit={handleActivate}>
          <div className="form-group" style={{ textAlign: 'left' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <KeyRound size={16} /> Clé d'Activation
            </label>
            <input 
              type="text" 
              placeholder="ex: ECO-PRO-..." 
              value={key} 
              onChange={e => setKey(e.target.value)}
              style={{ padding: '1rem', fontSize: '1.2rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', borderColor: error ? 'var(--danger)' : '' }}
              required 
              autoFocus
            />
            {error && <span style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.5rem', display: 'block' }}>Clé d'activation invalide. Veuillez réessayer.</span>}
          </div>
          
          <button type="submit" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '1rem' }}>
            Activer le Logiciel
          </button>
        </form>

        <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#9ca3af' }}>
          Contactez l'administrateur système pour obtenir une licence multi-écoles.
        </p>
      </div>
    </div>
  );
};

export default Activation;
