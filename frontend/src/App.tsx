import { useState } from 'react';

import { LoginScreen } from './screens/auth/LoginScreen/LoginScreen';
import { OTPScreen } from './screens/auth/OTPScreen/OTPScreen';

type AuthScreen = 'login' | 'otp';

function App() {
  const [screen, setScreen] = useState<AuthScreen>('login');

  const [otpData, setOtpData] = useState<{
    phone: string;
    expiresAt: string;
  } | null>(null);

  if (screen === 'otp' && otpData) {
    return (
      <OTPScreen
        phone={otpData.phone}
        expiresAt={otpData.expiresAt}
      />
    );
  }

  return (
    <LoginScreen
      onOtpRequested={(phone, expiresAt) => {
        setOtpData({
          phone,
          expiresAt,
        });

        setScreen('otp');
      }}
    />
  );
}

export default App;