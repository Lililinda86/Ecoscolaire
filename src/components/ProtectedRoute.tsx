import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser, authLoading } = useAppContext();

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <h2 style={{ marginTop: '1.5rem', fontWeight: 600 }}>Chargement de la plateforme...</h2>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#991b1b' }}>
        <h2>Accès refusé</h2>
        <p>Vous n'avez pas les autorisations nécessaires pour voir cette page.</p>
        <button onClick={() => window.history.back()} style={{ marginTop: '1rem', padding: '0.75rem', background: '#dc2626', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
          Retour
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
