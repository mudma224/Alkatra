/* eslint-disable react-refresh/only-export-components -- router instance lives here, not a component-only file */
import { createBrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LoginScreen } from '../screens/auth/LoginScreen/LoginScreen';
import { OTPScreen } from '../screens/auth/OTPScreen/OTPScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen/ProfileScreen';
import { FarmListScreen } from '../screens/farm/FarmListScreen/FarmListScreen';
import { FarmCreateScreen } from '../screens/farm/FarmCreateScreen/FarmCreateScreen';
import { FarmDetailScreen } from '../screens/farm/FarmDetailScreen/FarmDetailScreen';
import { FarmEditScreen } from '../screens/farm/FarmEditScreen/FarmEditScreen';
import { ParcelCreateScreen } from '../screens/parcel/ParcelCreateScreen/ParcelCreateScreen';
import { ParcelDetailScreen } from '../screens/parcel/ParcelDetailScreen/ParcelDetailScreen';
import { ParcelEditScreen } from '../screens/parcel/ParcelEditScreen/ParcelEditScreen';
import { SensorListScreen } from '../screens/parcel/SensorListScreen/SensorListScreen';
import { AppLayout } from '../components/layout/Layout/Layout';
import { RequireAuth } from './RequireAuth';
import { useAuthStore } from '../store/auth.store';
import type { VerifyOtpResponse } from '../types/auth.types';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen/EditProfileScreen';
import { FeedbackScreen } from '../screens/recommendations/FeedbackScreen/FeedbackScreen';
import { RecommendationOverviewScreen } from '../screens/recommendations/RecommendationOverviewScreen/RecommendationOverviewScreen';
import { RecommendationScreen } from '../screens/recommendations/RecommendationScreen/RecommendationScreen';

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
        element: <FarmListScreen />,
      },
      {
        path: '/farms/new',
        element: <FarmCreateScreen />,
      },
      {
        path: '/farms/:farmId',
        element: <FarmDetailScreen />,
      },
      {
        path: '/farms/:farmId/edit',
        element: <FarmEditScreen />,
      },
      {
        path: '/farms/:farmId/parcels/new',
        element: <ParcelCreateScreen />,
      },
      {
        path: '/farms/:farmId/parcels/:parcelId',
        element: <ParcelDetailScreen />,
      },
      {
        path: '/farms/:farmId/parcels/:parcelId/edit',
        element: <ParcelEditScreen />,
      },
      {
        path: '/farms/:farmId/parcels/:parcelId/sensors',
        element: <SensorListScreen />,
      },
      {
            // Replace the Phase 5 placeholder with the real parcel recommendation flow.
            path: '/farms/:farmId/parcels/:parcelId/recommendation',
            element: <RecommendationScreen />,
          },
          {
            // Feedback keeps every parent id in the URL for deterministic navigation.
            path: '/farms/:farmId/parcels/:parcelId/recommendation/:recommendationId/feedback',
            element: <FeedbackScreen />,
          },
          {
            // The global navigation first lets the user choose an existing parcel.
            path: '/recommendations',
            element: <RecommendationOverviewScreen />,
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