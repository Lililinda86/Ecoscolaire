import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { useAppContext } from '../context/AppContext';
import { LayoutDashboard, UserSquare2, Bus as BusIcon, Package, CheckSquare, Settings, DollarSign, BookOpen, AlertTriangle, Shield, ShieldAlert } from 'lucide-react';

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { t, lang, setLang } = useI18n();
  const { currentUser, isSupervising, currentSchool, exitSupervision } = useAppContext();

  const toggleLang = () => {
    setLang(lang === 'fr' ? 'en' : 'fr');
  };

  return (
    <div className="app-layout" style={{ position: 'relative' }}>
      {isSupervising && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, background: '#ef4444', color: 'white', padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} />
            MODE SUPERVISION — École : {currentSchool?.name}
          </div>
          <button 
            onClick={exitSupervision}
            style={{ background: 'white', color: '#ef4444', border: 'none', padding: '0.25rem 0.75rem', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Retour Super Admin
          </button>
        </div>
      )}
      <aside className="sidebar" style={{ paddingTop: isSupervising ? '3rem' : undefined }}>
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
          
          {currentUser && ['superAdmin', 'owner', 'director'].includes(currentUser.role) && (
            <>
              <NavLink to="/validations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <ShieldAlert size={20} />
                Validations
              </NavLink>
              <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Shield size={20} />
                Accès & Rôles
              </NavLink>
            </>
          )}
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
