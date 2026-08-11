import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';

import { Brand } from '../../../components/auth/Brand/Brand';
import { OTPInput } from '../../../components/ui/OTPInput/OTPInput';
import { Button } from '../../../components/ui/Button/Button';
import { ErrorMessage } from '../../../components/ui/ErrorMessage/ErrorMessage';
import { authApi } from '../../../api/auth.api';

import type {
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../../../types/auth.types';
import type { ApiErrorResponse } from '../../../types/api.types';

import styles from './OTPScreen.module.css';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

type FormStatus = 'idle' | 'submitting' | 'resending';

export interface OTPScreenProps {
  /**
   * Phone number used when requesting the OTP.
   * Example: +212617503677
   */
  phone: string;

  /**
   * Expiration date returned by auth-service when the OTP was requested.
   */
  expiresAt: string;

  /**
   * Called after successful OTP verification.
   * The parent will later use this to store the authentication
   * result and navigate to the application.
   */
  onVerified?: (response: VerifyOtpResponse) => void;
}

export function OTPScreen({
  phone,
  expiresAt: initialExpiresAt,
  onVerified,
}: OTPScreenProps) {
  const [otp, setOtp] = useState('');

  const [expiresAt, setExpiresAt] = useState(initialExpiresAt);

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    getRemainingSeconds(initialExpiresAt),
  );

  const [resendCooldown, setResendCooldown] = useState(0);

  const [status, setStatus] = useState<FormStatus>('idle');

  const [error, setError] = useState<string | null>(null);

  /*
   * OTP is complete only when the component contains
   * exactly six digits.
   */
  const isOtpComplete = otp.length === OTP_LENGTH;

  /*
   * The OTP is considered expired when the countdown reaches zero.
   */
  const isExpired = remainingSeconds <= 0;

  /*
   * The verify button should only be disabled when:
   * - OTP is incomplete
   * - OTP is expired
   * - a request is currently running
   */
  const isVerifyDisabled =
    !isOtpComplete ||
    isExpired ||
    status !== 'idle';

  /*
   * Convert seconds into MM:SS.
   *
   * Example:
   * 300 → "05:00"
   * 65  → "01:05"
   * 9   → "00:09"
   */
  const formattedRemainingTime = useMemo(() => {
    return formatRemainingTime(remainingSeconds);
  }, [remainingSeconds]);

  /*
   * OTP expiration countdown.
   *
   * We calculate the remaining time from the backend-provided
   * expiresAt rather than assuming a fixed five-minute duration.
   */
  useEffect(() => {
    const updateRemainingTime = () => {
      setRemainingSeconds(getRemainingSeconds(expiresAt));
    };

    updateRemainingTime();

    const intervalId = window.setInterval(updateRemainingTime, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt]);

  /*
   * Resend cooldown countdown.
   *
   * This is deliberately separate from the OTP expiration timer.
   */
  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setResendCooldown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [resendCooldown]);

  /*
   * Verify OTP.
   */
  const verifyOtp = useCallback(async () => {
    setError(null);

    if (!isOtpComplete) {
      setError('Veuillez saisir les 6 chiffres du code OTP.');
      return;
    }

    if (isExpired) {
      setError('Code OTP expiré. Veuillez demander un nouveau code.');
      return;
    }

    setStatus('submitting');

    try {
      const response = await authApi.verifyOtp({
        phone,
        otp,
      });

      /*
       * Authentication succeeded.
       *
       * The parent is responsible for the next step:
       * authStore + navigation.
       */
      onVerified?.(response);
    } catch (caughtError) {
      setStatus('idle');

      /*
       * We do not expose the raw backend error to the user.
       * This follows the same principle used by LoginScreen.
       */
      if (isAxiosError<ApiErrorResponse>(caughtError)) {
        console.error(
          'verifyOtp failed',
          caughtError.response?.data ?? caughtError.message,
        );

        if (caughtError.response?.status === 401) {
          setError('Code OTP invalide ou expiré.');
        } else {
          setError('Impossible de vérifier le code. Réessayez.');
        }
      } else {
        console.error('verifyOtp failed', caughtError);
        setError('Impossible de vérifier le code. Réessayez.');
      }
    }
  }, [isExpired, isOtpComplete, onVerified, otp, phone]);

  /*
   * Submit handler.
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (status !== 'idle') {
      return;
    }

    void verifyOtp();
  };

  /*
   * Request a new OTP.
   */
  const resendOtp = useCallback(async () => {
    if (resendCooldown > 0 || status !== 'idle') {
      return;
    }

    setError(null);
    setStatus('resending');

    try {
      const response: RequestOtpResponse = await authApi.requestOtp({
        phone,
      });

      /*
       * The backend generates a NEW OTP and returns
       * a NEW expiration timestamp.
       */
      setExpiresAt(response.expiresAt);

      /*
       * Start the frontend cooldown preventing
       * immediate repeated resend requests.
       */
      setResendCooldown(RESEND_COOLDOWN_SECONDS);

      /*
       * The previous OTP must no longer be submitted.
       */
      setOtp('');
    } catch (caughtError) {
      setStatus('idle');

      if (isAxiosError<ApiErrorResponse>(caughtError)) {
        console.error(
          'requestOtp resend failed',
          caughtError.response?.data ?? caughtError.message,
        );
      } else {
        console.error('requestOtp resend failed', caughtError);
      }

      setError('Impossible de renvoyer le code. Réessayez.');
    } finally {
      /*
       * If the request succeeded, status is still "resending".
       * Return to idle so the user can interact with the screen again.
       */
      setStatus('idle');
    }
  }, [phone, resendCooldown, status]);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <Brand />

        <form className={styles.form} onSubmit={handleSubmit}>
          <OTPInput
            value={otp}
            onChange={(value) => {
              setOtp(value);

              /*
               * Once the user modifies the OTP again,
               * remove the previous API error.
               */
              if (error) {
                setError(null);
              }
            }}
            error={Boolean(error)}
            disabled={status !== 'idle'}
          />

          <div className={styles.otpInfo}>
            {!isExpired ? (
              <p className={styles.expiration}>
                Le code expire dans {formattedRemainingTime}
              </p>
            ) : (
              <p className={styles.expired}>
                Code OTP expiré.
              </p>
            )}

            <p className={styles.resend}>
              Code OTP non reçu ?
              <button
                type="button"
                className={styles.resendButton}
                onClick={() => void resendOtp()}
                disabled={resendCooldown > 0 || status !== 'idle'}
              >
                {resendCooldown > 0
                  ? `Renvoyer dans ${resendCooldown}s`
                  : 'Renvoyer'}
              </button>
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isVerifyDisabled}
            loading={status === 'submitting'}
          >
            Vérifier OTP
          </Button>

          {error && (
            <ErrorMessage
              message={error}
            />
          )}
        </form>
      </section>
    </main>
  );
}

/**
 * Calculates the number of seconds remaining until the
 * expiration timestamp returned by auth-service.
 */
function getRemainingSeconds(expiresAt: string): number {
  const expirationTime = new Date(expiresAt).getTime();
  const difference = expirationTime - Date.now();

  return Math.max(Math.ceil(difference / 1000), 0);
}

/**
 * Converts seconds to MM:SS.
 */
function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`;
}

