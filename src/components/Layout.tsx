import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { LayoutDashboard, UserSquare2, Bus as BusIcon, Package, CheckSquare, Settings, DollarSign, BookOpen } from 'lucide-react';

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { t, lang, setLang } = useI18n();

  const toggleLang = () => {
    setLang(lang === 'fr' ? 'en' : 'fr');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h2>EcoScolaire</h2>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            {t('dashboard')}
          </NavLink>
          <NavLink to="/students" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <UserSquare2 size={20} />
            {t('students', 'Élèves')}
          </NavLink>
          <NavLink to="/classes" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BookOpen size={20} />
            {t('classes', 'Classes')}
          </NavLink>
          <NavLink to="/grades" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <CheckSquare size={20} />
            Notes & Bulletins
          </NavLink>
          <NavLink to="/attendance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <CheckSquare size={20} />
            Présences
          </NavLink>
          <NavLink to="/staff" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <UserSquare2 size={20} />
            {t('staff')}
          </NavLink>
          <NavLink to="/buses" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BusIcon size={20} />
            {t('buses')}
          </NavLink>
          <NavLink to="/payments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <DollarSign size={20} />
            {t('payments', 'Paiements')}
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Package size={20} />
            {t('inventory')}
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            Paramètres
          </NavLink>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="secondary" onClick={toggleLang} style={{ width: '100%' }}>
             {lang === 'fr' ? 'Switch to English' : 'Passer en Français'}
          </button>
        </div>
      </aside>
      <main className="main-content">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default Layout;
