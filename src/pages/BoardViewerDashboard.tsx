import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Bus, CircleDollarSign, Package, ShieldCheck, Users } from 'lucide-react';
import {
  loadBoardViewerGovernanceSummary,
  type BoardViewerGovernanceSummary
} from '../services/boardViewerGovernance';

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 });

const BoardViewerDashboard = () => {
  const [summary, setSummary] = useState<BoardViewerGovernanceSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await loadBoardViewerGovernanceSummary());
    } catch {
      setError("La synthèse de gouvernance n'est pas disponible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading) return <div className="card">Chargement de la synthèse de gouvernance…</div>;
  if (error || !summary) {
    return (
      <div className="card" role="alert">
        <AlertTriangle size={24} />
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>Réessayer</button>
      </div>
    );
  }

  const cards = [
    { label: 'Élèves actifs', value: summary.students.active, icon: Users },
    { label: 'Taux de présence', value: `${summary.attendance.rate}%`, icon: ShieldCheck },
    { label: 'Encaissements', value: money.format(summary.finance.collected), icon: CircleDollarSign },
    { label: 'Solde net', value: money.format(summary.finance.netCash), icon: CircleDollarSign },
    { label: 'Bus actifs', value: summary.transport.activeBuses, icon: Bus },
    { label: 'Articles à stock faible', value: summary.inventory.lowStockItems, icon: Package },
    { label: 'Notes publiées', value: summary.academics.publishedGrades, icon: BookOpen }
  ];

  return (
    <section aria-labelledby="governance-title">
      <div className="page-header">
        <div>
          <h1 id="governance-title">Synthèse de gouvernance</h1>
          <p>{summary.school.name} · Vue agrégée strictement en lecture seule</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <article className="card" key={label}>
            <Icon size={22} aria-hidden="true" />
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{label}</div>
            <strong style={{ fontSize: '1.6rem' }}>{value}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-grid" style={{ marginTop: '1rem' }}>
        <article className="card">
          <h2>Effectifs par classe</h2>
          {summary.students.byClass.length === 0 ? <p>Aucune donnée agrégée.</p> : (
            <ul>
              {summary.students.byClass.map(row => <li key={row.className}>{row.className} : {row.count}</li>)}
            </ul>
          )}
        </article>
        <article className="card">
          <h2>Indicateurs opérationnels</h2>
          <p>Dépenses : <strong>{money.format(summary.finance.expenses)}</strong></p>
          <p>Pannes ouvertes : <strong>{summary.transport.openBreakdowns}</strong></p>
          <p>Programmes publiés : <strong>{summary.academics.publishedPrograms}</strong></p>
          <p>Moyenne publiée : <strong>{summary.academics.averageOutOf20 ?? '—'}/20</strong></p>
        </article>
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Données agrégées le {new Date(summary.generatedAt).toLocaleString('fr-FR')}. Aucun dossier individuel n’est exposé.
      </p>
    </section>
  );
};

export default BoardViewerDashboard;
