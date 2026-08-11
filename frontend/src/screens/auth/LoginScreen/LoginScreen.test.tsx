import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LoginScreen } from './LoginScreen';
import { authApi } from '../../../api/auth.api';

vi.mock('../../../api/auth.api', () => ({
  authApi: { requestOtp: vi.fn() },
}));

const mockedRequestOtp = vi.mocked(authApi.requestOtp);

function fillPhone(value: string) {
  fireEvent.change(screen.getByLabelText('Numéro de téléphone'), { target: { value } });
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockedRequestOtp.mockReset();
  });

  it('disables the submit button while the phone field is empty', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: 'Envoyer OTP' })).toBeDisabled();
  });

  it('enables the submit button as soon as any digit is entered', () => {
    render(<LoginScreen />);
    fillPhone('6');
    expect(screen.getByRole('button', { name: 'Envoyer OTP' })).toBeEnabled();
  });

  it('shows a validation error for an incomplete number and does not call the API', () => {
    render(<LoginScreen />);
    fillPhone('617');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer OTP' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Numéro de téléphone invalid.');
    expect(mockedRequestOtp).not.toHaveBeenCalled();
  });

  it('calls authApi.requestOtp with the full E.164-ish phone number on valid input', async () => {
    mockedRequestOtp.mockResolvedValueOnce({
      success: true,
      message: 'OTP envoyé',
      expiresAt: new Date().toISOString(),
    });

    render(<LoginScreen />);
    fillPhone('617503677');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer OTP' }));

    await waitFor(() =>
      expect(mockedRequestOtp).toHaveBeenCalledWith({ phone: '+212617503677' }),
    );
  });

  it('shows a retryable error message on API failure without leaking the raw error', async () => {
    mockedRequestOtp.mockRejectedValueOnce(new Error('network down'));

    render(<LoginScreen />);
    fillPhone('617503677');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer OTP' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Impossible d'envoyer le code."),
    );
    expect(screen.getByText('Réessayez.')).toBeInTheDocument();
    expect(screen.queryByText('network down')).not.toBeInTheDocument();
  });
});