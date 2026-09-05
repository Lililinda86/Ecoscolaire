import { NavLink } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import '../pedagogy.css';

const links = [
  ['/pedagogy', 'Vue d’ensemble'],
  ['/pedagogy/program', 'Programme'],
  ['/pedagogy/planning', 'Planification'],
  ['/pedagogy/preparations', 'Préparations'],
  ['/pedagogy/preparations/missing', 'Manquantes'],
  ['/pedagogy/history', 'Historique']
] as const;

export const PedagogyNav = () => {
  const { currentUser } = useAppContext();
  return <nav className="pedagogy-tabs" aria-label="Navigation Pédagogie">
    {links.filter(([to]) => currentUser?.role !== 'boardViewer' || !to.includes('/preparations')).map(([to, label]) =>
      <NavLink key={to} end={to === '/pedagogy'} to={to}>{label}</NavLink>)}
  </nav>;
};

export const PedagogyHeader = ({ title, description }: { title: string; description: string }) => (
  <header className="pedagogy-header">
    <div><span className="pedagogy-eyebrow">Module Pédagogie · Lots A + B</span><h1>{title}</h1><p>{description}</p></div>
    <span className="pedagogy-scope">Planifier · Préparer · Faire valider</span>
  </header>
);
