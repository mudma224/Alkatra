import { createBrowserRouter, Navigate, useLocation } from 'react-router-dom';
import { LoginScreen } from '../screens/auth/LoginScreen/LoginScreen';
import { OTPScreen } from '../screens/auth/OTPScreen/OTPScreen';
import { PlaceholderScreen } from '../components/ui/PlaceholderScreen/PlaceholderScreen';
import { RequireAuth } from './RequireAuth';
import { useAuthStore } from '../store/auth.store';

/**
 * Wrapper that reads the OTP navigation state (phone + expiresAt) passed
 * by LoginScreen and renders the existing OTPScreen.
 *
 * TODO Phase 2: branch `onVerified` to the auth store + navigate to /farms.
 */
function OtpRoute() {
  const location = useLocation();
  const state = location.state as { phone?: string; expiresAt?: string } | null;

  if (!state?.phone || !state?.expiresAt) {
    return <Navigate to="/login" replace />;
  }

  return <OTPScreen phone={state.phone} expiresAt={state.expiresAt} />;
}

/**
 * Default route: redirect to /login if not authenticated, /farms if authenticated.
 */
function DefaultRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return <Navigate to={isAuthenticated() ? '/farms' : '/login'} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginScreen />,
  },
  {
    path: '/otp',
    element: <OtpRoute />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/farms',
        element: (
          <PlaceholderScreen
            title="Fermes"
            description="Liste des fermes de l'utilisateur."
            phase="Phase 3"
          />
        ),
      },
      {
        path: '/farms/:farmId',
        element: (
          <PlaceholderScreen
            title="Détail de la ferme"
            description="Détail d'une ferme et ses parcelles."
            phase="Phase 3"
          />
        ),
      },
      {
        path: '/farms/:farmId/parcels/:parcelId',
        element: (
          <PlaceholderScreen
            title="Détail de la parcelle"
            description="Détail d'une parcelle et sa recommandation du jour."
            phase="Phase 4"
          />
        ),
      },
      {
        path: '/recommendations',
        element: (
          <PlaceholderScreen
            title="Recommandations"
            description="Recommandations d'irrigation du jour et historique."
            phase="Phase 5"
          />
        ),
      },
      {
        path: '/profile',
        element: (
          <PlaceholderScreen
            title="Profil"
            description="Gestion du profil et déconnexion."
            phase="Phase 6"
          />
        ),
      },
    ],
  },
  {
    path: '*',
    element: <DefaultRoute />,
  },
]);