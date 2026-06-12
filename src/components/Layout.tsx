import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { useAppContext } from '../context/AppContext';
import { LayoutDashboard, Bus as BusIcon, Package, Settings, BookOpen, AlertTriangle, Shield, ShieldAlert, Users, Calendar, ClipboardList, Briefcase, CreditCard, MessageSquare, Bot } from 'lucide-react';

const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { t, lang, setLang } = useI18n();
  const { currentUser, isSupervising, currentSchool, exitSupervision, logout } = useAppContext();

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
      <aside className="sidebar" data-testid="sidebar" style={{ paddingTop: isSupervising ? '3rem' : undefined }}>
        <h2>EcoScolaire</h2>
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-dashboard">
            <LayoutDashboard size={20} />
            {t('dashboard')}
          </NavLink>
          
          {currentUser && ['superAdmin', 'owner', 'director', 'teacher', 'secretary', 'accountant'].includes(currentUser.role) && (
            <>
              <div className="sidebar-category">ACADÉMIQUE</div>
              {['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role) && (
                <>
                  <NavLink to="/students" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-students">
                    <Users size={20} />
                    {t('students', 'Élèves')}
                  </NavLink>
                  <NavLink to="/classes" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-classes">
                    <BookOpen size={20} />
                    {t('classes', 'Classes')}
                  </NavLink>
                </>
              )}
              {['superAdmin', 'owner', 'director', 'teacher', 'secretary'].includes(currentUser.role) && (
                <>
                  <NavLink to="/grades" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-grades">
                    <ClipboardList size={20} />
                    Notes & Bulletins
                  </NavLink>
                  <NavLink to="/attendance" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-attendance">
                    <Calendar size={20} />
                    Présences
                  </NavLink>
                </>
              )}
            </>
          )}
          
          {currentUser && ['superAdmin', 'owner', 'director', 'secretary', 'accountant', 'driver'].includes(currentUser.role) && (
            <>
              <div className="sidebar-category">ADMINISTRATION</div>
              {['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role) && (
                <NavLink to="/staff" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-staff">
                  <Briefcase size={20} />
                  {t('staff')}
                </NavLink>
              )}
              {['superAdmin', 'owner', 'director', 'secretary', 'driver'].includes(currentUser.role) && (
                <NavLink to="/buses" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-bus">
                  <BusIcon size={20} />
                  {t('buses')}
                </NavLink>
              )}
              {['superAdmin', 'owner', 'director', 'accountant', 'secretary'].includes(currentUser.role) && (
                <NavLink to="/inventory" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-inventory">
                  <Package size={20} />
                  {t('inventory')}
                </NavLink>
              )}
            </>
          )}
          
          {currentUser && ['superAdmin', 'owner', 'director', 'accountant'].includes(currentUser.role) && (
            <>
              <div className="sidebar-category">FINANCES</div>
              <NavLink to="/payments" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-payments">
                <CreditCard size={20} />
                {t('payments', 'Paiements')}
              </NavLink>
            </>
          )}
          
          {currentUser && ['superAdmin', 'owner', 'director', 'teacher'].includes(currentUser.role) && (
            <>
              <div className="sidebar-category">COMMUNICATION & IA</div>
              <NavLink to="/communication" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-communication">
                <MessageSquare size={20} />
                Messages & WhatsApp
              </NavLink>
              {['superAdmin', 'owner', 'director'].includes(currentUser.role) && (
                <NavLink to="/ai-director" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-ai-director">
                  <Bot size={20} />
                  Assistant IA Directeur
                </NavLink>
              )}
              {['teacher'].includes(currentUser.role) && (
                <NavLink to="/ai-teacher" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-ai-teacher">
                  <Bot size={20} />
                  Assistant IA Enseignant
                </NavLink>
              )}
            </>
          )}

          {currentUser && ['superAdmin', 'owner', 'director'].includes(currentUser.role) && (
            <>
              <div className="sidebar-category">PARAMÈTRES</div>
              <NavLink to="/audit" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-audit">
                <ShieldAlert size={20} />
                Audit Logs
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-settings">
                <Settings size={20} />
                Paramètres
              </NavLink>
            </>
          )}
          
          {currentUser && ['superAdmin', 'owner', 'director'].includes(currentUser.role) && (
            <>
              <NavLink to="/validations" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-validations">
                <ShieldAlert size={20} />
                Validations
              </NavLink>
              <NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''} data-testid="nav-users">
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
          <button 
            className="secondary" 
            onClick={() => {
              if (window.confirm('Voulez-vous vraiment vous déconnecter ?')) {
                logout();
              }
            }} 
            data-testid="logout-button" 
            style={{ width: '100%', color: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
             Déconnexion
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
