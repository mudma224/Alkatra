/* eslint-disable react-refresh/only-export-components -- router instance lives here, not a component-only file */
import { createBrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginScreen } from '../screens/auth/LoginScreen/LoginScreen';
import { OTPScreen } from '../screens/auth/OTPScreen/OTPScreen';
import { PlaceholderScreen } from '../components/ui/PlaceholderScreen/PlaceholderScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen/ProfileScreen';
import { AppLayout } from '../components/layout/Layout/Layout';
import { RequireAuth } from './RequireAuth';
import { useAuthStore } from '../store/auth.store';
import type { VerifyOtpResponse } from '../types/auth.types';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen/EditProfileScreen';

/**
 * Wrapper that reads the OTP navigation state (phone + expiresAt) passed
 * by LoginScreen and renders the OTPScreen.
 *
 * On successful verification, the auth result is stored and the user is
 * redirected to their farms. `replace` is used so that pressing Back from
 * /farms does not return to the OTP entry.
 *
 * Exported for dedicated wiring tests (verify-otp → setAuth → /farms).
 */
export function OtpRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { phone?: string; expiresAt?: string } | null;

  if (!state?.phone || !state?.expiresAt) {
    return <Navigate to="/login" replace />;
  }

  const handleVerified = (response: VerifyOtpResponse) => {
    useAuthStore.getState().setAuth(response);
    navigate('/farms', { replace: true });
  };

  return (
    <OTPScreen
      phone={state.phone}
      expiresAt={state.expiresAt}
      onVerified={handleVerified}
      onBack={() => navigate('/login', { replace: true })}
    />
  );
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
        element: <AppLayout />,
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
        element: <ProfileScreen/>,
      },
      {
        path: '/profile/edit',
        element: <EditProfileScreen/>,
      },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <DefaultRoute />,
  },
]);