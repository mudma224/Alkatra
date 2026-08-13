import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { OTPScreen } from './OTPScreen';
import { OtpRoute } from '../../../router';
import { authApi } from '../../../api/auth.api';
import { useAuthStore } from '../../../store/auth.store';
import type { VerifyOtpResponse } from '../../../types/auth.types';

vi.mock('../../../api/auth.api', () => ({
  authApi: { requestOtp: vi.fn(), verifyOtp: vi.fn(), refresh: vi.fn() },
}));

const mockedVerifyOtp = vi.mocked(authApi.verifyOtp);
const mockedRequestOtp = vi.mocked(authApi.requestOtp);

const PHONE = '+212617503677';

/**
 * `expiresAt` far enough in the future to keep the countdown active
 * during the test run.
 */
function futureExpiresAt(secondsFromNow = 600): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function pastExpiresAt(): string {
  return new Date(Date.now() - 1000).toISOString();
}

function makeVerifyOtpResponse(): VerifyOtpResponse {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    user: {
      id: 'user-1',
      phone: PHONE,
      name: null,
      preferredLanguage: 'french',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

/**
 * Builds an axios-shaped 401 error, matching how the production
 * code inspects failures (`isAxiosError` + `response.status`).
 */
function buildAxios401(): AxiosError {
  return new AxiosError('Unauthorized', '401', undefined, null, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message: 'Invalid OTP' },
  });
}

/**
 * Fills the OTP cells with the given digits by pasting the full code
 * into the first cell, mirroring how the OTPInput component consumes
 * paste events (it sanitises and joins the value in one shot).
 *
 * Cell-by-cell `change` events cannot be used here because each change
 * rebuilds the OTP string from the current state — feeding the digits
 * one at a time would keep overwriting the first cell.
 */
function pasteOtp(code: string) {
  const inputs = screen.getAllByLabelText(/Chiffre \d du code OTP/);
  fireEvent.paste(inputs[0], {
    clipboardData: { getData: () => code },
  });
}

/**
 * Fills only the first `count` digits by pasting the truncated code,
 * so we can assert the disabled state before all six are entered.
 */
function pastePartialOtp(code: string) {
  pasteOtp(code);
}

describe('OTPScreen', () => {
  beforeEach(() => {
    mockedVerifyOtp.mockReset();
    mockedRequestOtp.mockReset();
  });

  function renderOtpScreen(expiresAt: string = futureExpiresAt()) {
    const handleVerified = vi.fn();

    const utils = render(
      <MemoryRouter initialEntries={['/otp']}>
        <Routes>
          <Route
            path="/otp"
            element={
              <OTPScreen
                phone={PHONE}
                expiresAt={expiresAt}
                onVerified={handleVerified}
              />
            }
          />
          <Route path="/farms" element={<div>Farms page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    return { ...utils, handleVerified };
  }

  it('disables the verify button until six digits have been entered', () => {
    renderOtpScreen();

    const button = screen.getByRole('button', { name: 'Vérifier OTP' });
    expect(button).toBeDisabled();

    pastePartialOtp('12345');
    expect(button).toBeDisabled();

    pastePartialOtp('123456');
    expect(button).toBeEnabled();
  });

  it('shows an error message and does not navigate when the code is invalid (401)', async () => {
    mockedVerifyOtp.mockRejectedValueOnce(buildAxios401());

    const { handleVerified } = renderOtpScreen();

    pasteOtp('000000');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier OTP' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Code OTP invalide ou expiré.',
      ),
    );
    expect(handleVerified).not.toHaveBeenCalled();
    expect(screen.queryByText('Farms page')).not.toBeInTheDocument();
  });

  it('calls onVerified with the response after a successful verification', async () => {
    const response = makeVerifyOtpResponse();
    mockedVerifyOtp.mockResolvedValueOnce(response);

    const { handleVerified } = renderOtpScreen();

    pasteOtp('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier OTP' }));

    await waitFor(() => expect(handleVerified).toHaveBeenCalledWith(response));
  });

  it('shows an expiration message and keeps the verify button disabled once the code has expired', () => {
    renderOtpScreen(pastExpiresAt());

    pasteOtp('123456');

    expect(screen.getByText(/Code OTP expiré/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Vérifier OTP' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Renvoyer' }),
    ).toBeInTheDocument();
  });

  it('requests a new OTP with the phone number when the resend link is clicked', async () => {
    const newExpiresAt = futureExpiresAt(900);
    mockedRequestOtp.mockResolvedValueOnce({
      success: true,
      message: 'OTP envoyé',
      expiresAt: newExpiresAt,
    });

    renderOtpScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer' }));

    await waitFor(() =>
      expect(mockedRequestOtp).toHaveBeenCalledWith({ phone: PHONE }),
    );
  });
});

/**
 * End-to-end wiring test: verifies that the router's OtpRoute stores
 * the authentication result and redirects to /farms on success.
 * This is the Phase 2 "branch onVerified to the store" contract.
 */
describe('OtpRoute wiring', () => {
  beforeEach(() => {
    mockedVerifyOtp.mockReset();
    localStorage.clear();
    useAuthStore.getState().clearAuth();
  });

  function renderOtpRoute() {
    return render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/otp',
            state: { phone: PHONE, expiresAt: futureExpiresAt() },
          },
        ]}
      >
        <Routes>
          <Route path="/otp" element={<OtpRoute />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/farms" element={<div>Farms page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('stores the auth result and navigates to /farms on a successful verification', async () => {
    const response = makeVerifyOtpResponse();
    mockedVerifyOtp.mockResolvedValueOnce(response);

    renderOtpRoute();

    pasteOtp('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier OTP' }));

    await waitFor(() =>
      expect(screen.getByText('Farms page')).toBeInTheDocument(),
    );
    expect(useAuthStore.getState().accessToken).toBe('access-token');
    expect(useAuthStore.getState().phone).toBe(PHONE);
  });
});
