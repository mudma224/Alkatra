import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginScreen } from '../LoginScreen/LoginScreen';
import { OTPScreen } from '../OTPScreen/OTPScreen';
import { useAuth } from '../../../hooks/useAuth';
import type { VerifyOtpResponse } from '../../../types/auth.types';

type AuthStep = { step: 'phone' } | { step: 'otp'; phone: string; expiresAt: string };

export function AuthPage() {
  const [state, setState] = useState<AuthStep>({ step: 'phone' });
  const { completeLogin } = useAuth();
  const navigate = useNavigate();

  const handleOtpRequested = (phone: string, expiresAt: string) => {
    setState({ step: 'otp', phone, expiresAt });
  };

  const handleVerified = (response: VerifyOtpResponse) => {
    completeLogin(response);
    navigate('/dashboard', { replace: true });
  };

  const handleBackToPhone = () => {
    setState({ step: 'phone' });
  };

  if (state.step === 'otp') {
    return (
      <OTPScreen
        phone={state.phone}
        expiresAt={state.expiresAt}
        onVerified={handleVerified}
        onBack={handleBackToPhone}
      />
    );
  }

  return <LoginScreen onOtpRequested={handleOtpRequested} />;
}