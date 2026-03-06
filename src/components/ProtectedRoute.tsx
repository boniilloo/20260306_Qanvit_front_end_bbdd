import React from 'react';
import { Navigate } from 'react-router-dom';
import { useIsDeveloper } from '@/hooks/useIsDeveloper';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isDeveloper, loading } = useIsDeveloper();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isDeveloper) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};