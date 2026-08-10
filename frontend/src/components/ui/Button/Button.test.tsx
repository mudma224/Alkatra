import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and responds to click when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Envoyer OTP</Button>);

    const button = screen.getByRole('button', { name: 'Envoyer OTP' });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Envoyer OTP
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer OTP' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a spinner and blocks clicks while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Envoyer OTP
      </Button>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });
});