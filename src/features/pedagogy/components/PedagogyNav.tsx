import { NavLink } from 'react-router-dom';
import '../pedagogy.css';

const links = [
  ['/pedagogy', 'Vue d’ensemble'],
  ['/pedagogy/program', 'Programme'],
  ['/pedagogy/planning', 'Planification'],
  ['/pedagogy/history', 'Historique']
] as const;

export const PedagogyNav = () => (
  <nav className="pedagogy-tabs" aria-label="Navigation Pédagogie">
    {links.map(([to, label]) => <NavLink key={to} end={to === '/pedagogy'} to={to}>{label}</NavLink>)}
  </nav>
);

export const PedagogyHeader = ({ title, description }: { title: string; description: string }) => (
  <header className="pedagogy-header">
    <div><span className="pedagogy-eyebrow">Module Pédagogie · Lot A</span><h1>{title}</h1><p>{description}</p></div>
    <span className="pedagogy-scope">Planifier · Ajuster · Faire valider</span>
  </header>
);
