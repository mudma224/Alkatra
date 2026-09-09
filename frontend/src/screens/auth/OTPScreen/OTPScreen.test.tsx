/**
 * OTPScreen.test.tsx
 *
 * Tests for the existing `OTPScreen` component (see `OTPScreen.tsx`).
 *
 * These tests exercise ONLY what is observable from `OTPScreen.tsx` and
 * `OTPInput.tsx` as provided — no backend logic, no business rules beyond
 * what is already implemented in the component, and no new frontend
 * behavior is introduced.
 *
 * ── Assumptions made because the corresponding files were not provided ──
 * (please confirm / correct, see accompanying message)
 *
 * 1. Test stack: Vitest + @testing-library/react + @testing-library/user-event
 *    + @testing-library/jest-dom. This matches the stack declared for the
 *    frontend in `alkatra_M1_phase1_guide.md` (Sprint 4: "vitest + testing-library").
 * 2. `Brand`, `Button`, `ErrorMessage` are rendered as real (unmocked)
 *    presentational components. `Button` is assumed to render a native
 *    `<button>` whose accessible name is its children ("Vérifier OTP"),
 *    and to forward the `disabled` prop to that `<button>`.
 *    `ErrorMessage` is assumed to render its `message` prop as visible text.
 * 3. `VerifyOtpResponse` — OTPScreen never reads any field of this type,
 *    it only forwards it to `onVerified`. Its exact shape does not affect
 *    these tests. The fixture below is filled in using the contract
 *    documented in `alkatra_M1_phase1_guide.md` §7 (Sprint 1) purely for
 *    readability, and is cast rather than structurally validated since the
 *    real type definition was not provided.
 * 4. `RequestOtpResponse` — OTPScreen only reads `.expiresAt` from it.
 *    The fixture below only relies on that field.
 * 5. File location assumed: `frontend/src/screens/auth/OTPScreen/OTPScreen.test.tsx`,
 *    next to `OTPScreen.tsx` (same relative import paths are reused for mocking).
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { AxiosError } from 'axios';
import '@testing-library/jest-dom/vitest';

import { OTPScreen } from './OTPScreen';
import type { OTPScreenProps } from './OTPScreen';
import { authApi } from '../../../api/auth.api';
import type {
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../../../types/auth.types';

vi.mock('../../../api/auth.api', () => ({
  authApi: {
    requestOtp: vi.fn(),
    verifyOtp: vi.fn(),
  },
}));

const OTP_LENGTH = 6;
const DEFAULT_PHONE = '+212612345678';
const VALID_OTP = '123456';

const EXPIRED_OTP_MESSAGE = 'Code OTP expiré.';
const INVALID_OTP_MESSAGE = 'Code OTP invalide ou expiré.';
const GENERIC_VERIFY_ERROR_MESSAGE = 'Impossible de vérifier le code. Réessayez.';
const GENERIC_RESEND_ERROR_MESSAGE = 'Impossible de renvoyer le code. Réessayez.';

/**
 * See assumption (3) above: only used as an opaque payload forwarded to
 * `onVerified`, its exact shape does not affect these tests.
 */
const mockVerifyOtpResponse = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
  tokenType: 'Bearer',
  user: {
    id: 'mock-user-id',
    phone: DEFAULT_PHONE,
    name: null,
    preferredLanguage: 'fr',
    createdAt: '2026-08-12T10:00:00.000Z',
  },
} as unknown as VerifyOtpResponse;

function buildRequestOtpResponse(expiresAt: string): RequestOtpResponse {
  return {
    success: true,
    message: 'OTP envoyé',
    expiresAt,
  } as unknown as RequestOtpResponse;
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Builds a minimal object satisfying axios's `isAxiosError` runtime check
 * (`error.isAxiosError === true`) without depending on axios internals.
 */
function createAxiosError(status: number): AxiosError {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: `Request failed with status code ${status}`,
    toJSON: () => ({}),
    response: {
      status,
      statusText: '',
      headers: {},
      config: {} as AxiosError['config'],
      data: {},
    },
  } as AxiosError;
}

interface RenderOptions {
  phone?: string;
  expiresAt?: string;
  onVerified?: OTPScreenProps['onVerified'];
}

function renderOtpScreen(options: RenderOptions = {}) {
  const phone = options.phone ?? DEFAULT_PHONE;
  const expiresAt = options.expiresAt ?? minutesFromNow(5);

  const view = render(
    <OTPScreen phone={phone} expiresAt={expiresAt} onVerified={options.onVerified} />,
  );

  return { phone, expiresAt, ...view };
}

async function fillOtp(user: ReturnType<typeof userEvent.setup>, code: string) {
  for (let index = 0; index < code.length; index += 1) {
    const input = screen.getByLabelText(`Chiffre ${index + 1} du code OTP`);
    await user.type(input, code[index]);
  }
}

/**
 * Same as `fillOtp` but synchronous and user-event-free: user-event
 * deadlocks under fake timers, so timer-based tests fill the inputs
 * with plain change events instead.
 */
function fillOtpSync(code: string) {
  for (let index = 0; index < code.length; index += 1) {
    const input = screen.getByLabelText(`Chiffre ${index + 1} du code OTP`);
    fireEvent.change(input, { target: { value: code[index] } });
  }
}

function getSubmitButton() {
  return screen.getByRole('button', { name: /vérifier otp/i });
}

function getResendButton() {
  return screen.getByRole('button', { name: /renvoyer/i });
}

describe('OTPScreen', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    // `delay: null` avoids userEvent's internal timers entirely, so the
    // same setup works whether a given test enables fake timers or not.
    user = userEvent.setup({ delay: null });

    vi.mocked(authApi.requestOtp).mockReset();
    vi.mocked(authApi.verifyOtp).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders six OTP digit inputs and the expiration countdown', () => {
      renderOtpScreen({ expiresAt: minutesFromNow(5) });

      for (let index = 1; index <= OTP_LENGTH; index += 1) {
        expect(
          screen.getByLabelText(`Chiffre ${index} du code OTP`),
        ).toBeInTheDocument();
      }

      expect(screen.getByText('Le code expire dans 05:00')).toBeInTheDocument();
    });

    it('disables the submit button while the OTP is incomplete', () => {
      renderOtpScreen();

      expect(getSubmitButton()).toBeDisabled();
    });

    it('enables the submit button once all six digits are entered', async () => {
      renderOtpScreen();

      await fillOtp(user, VALID_OTP);

      expect(getSubmitButton()).toBeEnabled();
    });
  });

  describe('expiration countdown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-12T10:00:00.000Z'));
    });

    it('counts down every second based on the provided expiresAt', () => {
      renderOtpScreen({ expiresAt: minutesFromNow(5) });

      act(() => {
        vi.advanceTimersByTime(61_000);
      });

      expect(screen.getByText('Le code expire dans 03:59')).toBeInTheDocument();
    });

    it('shows an expiration message and disables submission once the timer reaches zero', () => {
      renderOtpScreen({ expiresAt: minutesFromNow(5) });

      fillOtpSync(VALID_OTP);

      act(() => {
        vi.advanceTimersByTime(5 * 60_000);
      });

      expect(screen.getByText(EXPIRED_OTP_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByText(/le code expire dans/i)).not.toBeInTheDocument();
      expect(getSubmitButton()).toBeDisabled();
    });
  });

  describe('OTP verification', () => {
    it('submits the phone and OTP, and forwards the response to onVerified', async () => {
      const onVerified = vi.fn();
      vi.mocked(authApi.verifyOtp).mockResolvedValueOnce(mockVerifyOtpResponse);

      renderOtpScreen({ onVerified });
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());

      expect(authApi.verifyOtp).toHaveBeenCalledTimes(1);
      expect(authApi.verifyOtp).toHaveBeenCalledWith({
        phone: DEFAULT_PHONE,
        otp: VALID_OTP,
      });

      expect(await screen.findByRole('button', { name: /vérifier otp/i })).toBeEnabled();
      expect(onVerified).toHaveBeenCalledWith(mockVerifyOtpResponse);
    });

    it('does not throw when onVerified is not provided', async () => {
      vi.mocked(authApi.verifyOtp).mockResolvedValueOnce(mockVerifyOtpResponse);

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());

      await vi.waitFor(() => {
        expect(authApi.verifyOtp).toHaveBeenCalledTimes(1);
      });
    });

    it('disables the submit button while the verification request is pending', async () => {
      let resolveVerify: (value: VerifyOtpResponse) => void = () => {};
      const pending = new Promise<VerifyOtpResponse>((resolve) => {
        resolveVerify = resolve;
      });
      vi.mocked(authApi.verifyOtp).mockReturnValueOnce(pending);

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);

      const submitButton = getSubmitButton();
      await user.click(submitButton);

      expect(submitButton).toBeDisabled();

      resolveVerify(mockVerifyOtpResponse);
      await act(async () => {
        await pending;
      });
    });

    it('shows a dedicated message when the OTP is invalid or expired (HTTP 401)', async () => {
      vi.mocked(authApi.verifyOtp).mockRejectedValueOnce(createAxiosError(401));

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());

      expect(await screen.findByText(INVALID_OTP_MESSAGE)).toBeInTheDocument();
      expect(getSubmitButton()).toBeEnabled();
    });

    it('shows a generic message for other backend errors, without exposing details', async () => {
      vi.mocked(authApi.verifyOtp).mockRejectedValueOnce(createAxiosError(500));

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());

      expect(await screen.findByText(GENERIC_VERIFY_ERROR_MESSAGE)).toBeInTheDocument();
    });

    it('shows a generic message for unexpected non-Axios errors', async () => {
      vi.mocked(authApi.verifyOtp).mockRejectedValueOnce(new Error('boom'));

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());

      expect(await screen.findByText(GENERIC_VERIFY_ERROR_MESSAGE)).toBeInTheDocument();
    });

    it('clears the previous error once the user edits the OTP again', async () => {
      vi.mocked(authApi.verifyOtp).mockRejectedValueOnce(createAxiosError(401));

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());
      expect(await screen.findByText(INVALID_OTP_MESSAGE)).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Chiffre 1 du code OTP'));
      await user.type(screen.getByLabelText('Chiffre 1 du code OTP'), '9');

      expect(screen.queryByText(INVALID_OTP_MESSAGE)).not.toBeInTheDocument();
    });

    it('does not call the API and shows a local message when submitted while incomplete', () => {
      const { container } = renderOtpScreen();

      // The submit button is disabled in this state, so we dispatch the
      // form's submit event directly to exercise verifyOtp's own guard.
      const form = container.querySelector('form');
      expect(form).not.toBeNull();

      act(() => {
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(authApi.verifyOtp).not.toHaveBeenCalled();
      expect(
        screen.getByText('Veuillez saisir les 6 chiffres du code OTP.'),
      ).toBeInTheDocument();
    });
  });

  describe('resend OTP', () => {
    it('requests a new OTP, clears the input and starts the cooldown', async () => {
      const newExpiresAt = minutesFromNow(5);
      vi.mocked(authApi.requestOtp).mockResolvedValueOnce(
        buildRequestOtpResponse(newExpiresAt),
      );

      renderOtpScreen();
      await fillOtp(user, '111');
      await user.click(getResendButton());

      expect(await screen.findByText('Renvoyer dans 30s')).toBeInTheDocument();
      expect(authApi.requestOtp).toHaveBeenCalledWith({ phone: DEFAULT_PHONE });
      expect(getResendButton()).toBeDisabled();
      expect(screen.getByLabelText('Chiffre 1 du code OTP')).toHaveValue('');
    });

    it('counts the resend cooldown down and re-enables the button at zero', async () => {
      vi.mocked(authApi.requestOtp).mockResolvedValueOnce(
        buildRequestOtpResponse(minutesFromNow(5)),
      );

      // Fake timers must be active BEFORE the cooldown interval is created,
      // otherwise the interval keeps ticking on the real clock.
      vi.useFakeTimers();

      renderOtpScreen();
      fireEvent.click(getResendButton());
      // Flush the mocked request promise so the cooldown actually starts.
      await act(async () => {});

      expect(screen.getByText('Renvoyer dans 30s')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(screen.getByText('Renvoyer dans 29s')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(29_000);
      });
      expect(getResendButton()).toBeEnabled();
      expect(screen.getByText('Renvoyer')).toBeInTheDocument();
    });

    it('ignores additional clicks while the cooldown is active', async () => {
      vi.mocked(authApi.requestOtp).mockResolvedValueOnce(
        buildRequestOtpResponse(minutesFromNow(5)),
      );

      renderOtpScreen();
      await user.click(getResendButton());
      expect(await screen.findByText('Renvoyer dans 30s')).toBeInTheDocument();

      // The button is now disabled: userEvent silently no-ops on it,
      // confirming resendOtp's early-return guard is never re-triggered.
      await user.click(getResendButton());
      expect(authApi.requestOtp).toHaveBeenCalledTimes(1);
    });

    it('shows a generic error message when the resend request fails', async () => {
      vi.mocked(authApi.requestOtp).mockRejectedValueOnce(createAxiosError(500));

      renderOtpScreen();
      await user.click(getResendButton());

      expect(await screen.findByText(GENERIC_RESEND_ERROR_MESSAGE)).toBeInTheDocument();
      expect(getResendButton()).toBeEnabled();
    });
  });

  describe('accessibility', () => {
    it('exposes an accessible label for each OTP digit', () => {
      renderOtpScreen();

      for (let index = 1; index <= OTP_LENGTH; index += 1) {
        expect(
          screen.getByLabelText(`Chiffre ${index} du code OTP`),
        ).toHaveAttribute('aria-label', `Chiffre ${index} du code OTP`);
      }
    });

    it('marks OTP inputs and the resend action as disabled during submission', async () => {
      let resolveVerify: (value: VerifyOtpResponse) => void = () => {};
      const pending = new Promise<VerifyOtpResponse>((resolve) => {
        resolveVerify = resolve;
      });
      vi.mocked(authApi.verifyOtp).mockReturnValueOnce(pending);

      renderOtpScreen();
      await fillOtp(user, VALID_OTP);
      await user.click(getSubmitButton());

      expect(screen.getByLabelText('Chiffre 1 du code OTP')).toBeDisabled();
      expect(getResendButton()).toBeDisabled();

      resolveVerify(mockVerifyOtpResponse);
      await act(async () => {
        await pending;
      });
    });
  });
});