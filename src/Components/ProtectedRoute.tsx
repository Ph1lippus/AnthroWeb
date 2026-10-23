import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthSession } from '../hooks/useAuthSession';
import LoadingBar from './LoadingBar';

/**
 * Guards a route behind an authenticated session.
 *
 * RLS and the service-level `getCurrentUserId()` checks are the real security
 * boundary; this component only keeps unauthenticated visitors from rendering
 * the page shell and firing its queries.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, resolved } = useAuthSession();
    if (!resolved) return <LoadingBar show blocking label="Loading" />;
    if (!user) return <Navigate to="/" replace />;
    return <>{children}</>;
};

export default ProtectedRoute;