import React from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { Users, UserCircle2, Bus as BusIcon, PackageCheck, TrendingUp } from 'lucide-react';
import dashboardBanner from '../assets/dashboard-banner.png';

const Dashboard: React.FC = () => {
  const { db } = useAppContext();
  const { t } = useI18n();

  return (
    <div className="page-container" style={{ padding: '0', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      
      {/* Hero Banner Section */}
      <div style={{ position: 'relative', height: '280px', width: '100%', overflow: 'hidden', borderRadius: '0 0 32px 32px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
        <img 
          src={dashboardBanner} 
          alt="Dashboard Banner" 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.4) 100%)' }}></div>
        <div style={{ position: 'absolute', bottom: '40px', left: '40px', color: 'white' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{db.school?.name}</h1>
          <p style={{ fontSize: '1.2rem', margin: '0.5rem 0 0 0', opacity: 0.9 }}>{t('dashboard')} - Année {db.school?.academicYear}</p>
        </div>
      </div>

      <div style={{ padding: '2rem 3rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={24} color="#4f46e5" />
          Vue d'ensemble
        </h2>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '1.25rem', borderRadius: '16px', color: '#4f46e5' }}>
              <Users size={32} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('total_students', 'Total Élèves')}</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{db.students.length}</p>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1.25rem', borderRadius: '16px', color: '#10b981' }}>
              <UserCircle2 size={32} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('total_staff', 'Personnel')}</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{db.staff.length}</p>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1.25rem', borderRadius: '16px', color: '#f59e0b' }}>
              <BusIcon size={32} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('total_buses', 'Bus Scolaires')}</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{db.buses.length}</p>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1.25rem', borderRadius: '16px', color: '#ef4444' }}>
              <PackageCheck size={32} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('inventory_items', 'Inventaire')}</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '2rem', fontWeight: 800, color: '#0f172a' }}>{db.inventory.length}</p>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '2rem', borderRadius: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a8a', marginTop: 0 }}>{t('quick_actions', 'Informations Système')}</h2>
          <p style={{ color: '#1e40af', lineHeight: 1.6, margin: '1rem 0' }}>Utilisez le menu de navigation à gauche pour accéder aux différentes sections (Élèves, Paiements, Notes, etc.).</p>
          <div style={{ display: 'inline-block', backgroundColor: '#dbeafe', color: '#1e40af', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 600 }}>
            Mode 100% Local Actif - Vos données sont stockées sécuritairement sur cet appareil.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
