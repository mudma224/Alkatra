import { LoginScreen } from './screens/auth/LoginScreen/LoginScreen';

function App() {
  return (
    <LoginScreen
      onOtpRequested={(phone, expiresAt) => {
        // TODO (next iteration): once the OTP screen exists, navigate to it
        // here (e.g. with react-router: navigate('/otp', { state: { phone, expiresAt } })).
        // Intentionally left as a no-op placeholder for this task's scope.
        console.info('OTP requested', { phone, expiresAt });
      }}
    />
  );
}

export default App;