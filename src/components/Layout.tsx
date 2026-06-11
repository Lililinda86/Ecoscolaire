import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { useAppContext } from '../context/AppContext';
import { LayoutDashboard, UserSquare2, Bus as BusIcon, Package, CheckSquare, Settings, DollarSign, BookOpen, AlertTriangle, Shield, ShieldAlert, Users, Calendar, ClipboardList, Briefcase, CreditCard, MessageSquare } from 'lucide-react';

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
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>
            <LayoutDashboard size={20} />
            {t('dashboard')}
          </NavLink>
          
          <div className="sidebar-category">ACADÉMIQUE</div>
          <NavLink to="/students" className={({ isActive }) => isActive ? 'active' : ''}>
            <Users size={20} />
            {t('students', 'Élèves')}
          </NavLink>
          <NavLink to="/classes" className={({ isActive }) => isActive ? 'active' : ''}>
            <BookOpen size={20} />
            {t('classes', 'Classes')}
          </NavLink>
          <NavLink to="/grades" className={({ isActive }) => isActive ? 'active' : ''}>
            <ClipboardList size={20} />
            Notes & Bulletins
          </NavLink>
          <NavLink to="/attendance" className={({ isActive }) => isActive ? 'active' : ''}>
            <Calendar size={20} />
            Présences
          </NavLink>
          
          <div className="sidebar-category">ADMINISTRATION</div>
          <NavLink to="/staff" className={({ isActive }) => isActive ? 'active' : ''}>
            <Briefcase size={20} />
            {t('staff')}
          </NavLink>
          <NavLink to="/buses" className={({ isActive }) => isActive ? 'active' : ''}>
            <BusIcon size={20} />
            {t('buses')}
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => isActive ? 'active' : ''}>
            <Package size={20} />
            {t('inventory')}
          </NavLink>
          
          <div className="sidebar-category">FINANCES</div>
          <NavLink to="/payments" className={({ isActive }) => isActive ? 'active' : ''}>
            <CreditCard size={20} />
            {t('payments', 'Paiements')}
          </NavLink>
          
          <div className="sidebar-category">COMMUNICATION</div>
          <NavLink to="/communication" className={({ isActive }) => isActive ? 'active' : ''}>
            <MessageSquare size={20} />
            Messages & WhatsApp
          </NavLink>

          <div className="sidebar-category">PARAMÈTRES</div>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>
            <Settings size={20} />
            Paramètres
          </NavLink>
          
          {currentUser && ['superAdmin', 'owner', 'director'].includes(currentUser.role) && (
            <>
              <NavLink to="/validations" className={({ isActive }) => isActive ? 'active' : ''}>
                <ShieldAlert size={20} />
                Validations
              </NavLink>
              <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>
                <Shield size={20} />
                Accès & Rôles
              </NavLink>
            </>
          )}
        </nav>

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
