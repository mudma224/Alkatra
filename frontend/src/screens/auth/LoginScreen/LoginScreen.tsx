import { FormEvent, useCallback, useState } from 'react';
import { isAxiosError } from 'axios';
import { Brand } from '../../../components/auth/Brand/Brand';
import { Input } from '../../../components/ui/Input/Input';
import { Button } from '../../../components/ui/Button/Button';
import { ErrorMessage } from '../../../components/ui/ErrorMessage/ErrorMessage';
import { usePhoneNumber } from '../../../hooks/usePhoneNumber';
import { authApi } from '../../../api/auth.api';
import type { ApiErrorResponse } from '../../../types/api.types';
import styles from './LoginScreen.module.css';

type FormStatus = 'idle' | 'submitting' | 'success';

type FormError = {
  type: 'validation' | 'api';
  message: string;
  actionLabel?: string;
} | null;

export interface LoginScreenProps {
  /**
   * Fires once auth-service has confirmed the OTP was requested. The OTP
   * screen itself is out of scope here — the caller decides what happens
   * next (e.g. navigating to it once it exists). See guide §16.
   */
  onOtpRequested?: (phone: string, expiresAt: string) => void;
}

export function LoginScreen({ onOtpRequested }: LoginScreenProps) {
  const phone = usePhoneNumber();
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState<FormError>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const inputState = error?.type === 'validation' ? 'error' : phone.isEmpty ? 'default' : 'filled';

  const submit = useCallback(async () => {
    setError(null);
    setSuccessNotice(null);

    if (!phone.isValid) {
      setError({ type: 'validation', message: 'Numéro de téléphone invalid.' });
      return;
    }

    setStatus('submitting');
    try {
      const response = await authApi.requestOtp({ phone: phone.fullPhone });
      setStatus('success');
      setSuccessNotice(
        `Code envoyé. Il expire à ${new Date(response.expiresAt).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })}.`,
      );
      onOtpRequested?.(phone.fullPhone, response.expiresAt);
    } catch (caughtError) {
      setStatus('idle');
      // Captured for future logging/observability, deliberately not shown to
      // the user — the design defines fixed copy for this failure (§14).
      if (isAxiosError<ApiErrorResponse>(caughtError)) {
        console.error('requestOtp failed', caughtError.response?.data ?? caughtError.message);
      } else {
        console.error('requestOtp failed', caughtError);
      }
      setError({
        type: 'api',
        message: "Impossible d'envoyer le code. ",
        actionLabel: 'Réessayez.',
      });
    }
  }, [phone, onOtpRequested]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phone.isEmpty || status === 'submitting') {
      return;
    }
    void submit();
  };

  const handlePhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    phone.setFromInput(event.target.value);
    if (error) setError(null);
    if (successNotice) setSuccessNotice(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.hero} role="presentation" />

      <main className={styles.card}>
        <Brand />

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            label="Numéro de téléphone"
            prefix={phone.countryCode}
            placeholder="6XX XX XX XX"
            value={phone.formattedValue}
            onChange={handlePhoneChange}
            state={inputState}
            disabled={status === 'submitting'}
            errorMessage={error?.message}
          />

          <Button
            variant="primary"
            type="submit"
            block
            disabled={phone.isEmpty}
            loading={status === 'submitting'}
          >
            Envoyer OTP
          </Button>

          {error && (
            <ErrorMessage
              id="phone-error"
              message={error.message}
              actionLabel={error.actionLabel}
              onAction={error.type === 'api' ? () => void submit() : undefined}
            />
          )}

          {successNotice && (
            <p className={styles.success} role="status">
              {successNotice}
            </p>
          )}
        </form>
      </main>

      <footer className={styles.footer}>
        <p className={styles.footerText}>
          Don&apos;t have an account ?{' '}
          <button
            type="button"
            className={styles.signUp}
            onClick={() => {
              // TODO: navigate to the Register screen — out of scope for this task.
            }}
          >
            Sign up
          </button>
        </p>
      </footer>
    </div>
  );
}