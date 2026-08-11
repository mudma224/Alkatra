import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  describe('variante text', () => {
    it('rend un label et un champ associés', () => {
      render(<Input id="phone" label="Numéro de téléphone" />);
      expect(screen.getByLabelText('Numéro de téléphone')).toBeInTheDocument();
    });

    it('affiche le préfixe quand fourni', () => {
      render(<Input id="phone" label="Téléphone" prefix="+212" />);
      expect(screen.getByText('+212')).toBeInTheDocument();
    });

    it('applique aria-invalid quand state="error"', () => {
      render(<Input id="phone" label="Téléphone" state="error" errorMessage="Invalide" />);
      expect(screen.getByLabelText('Téléphone')).toHaveAttribute('aria-invalid', 'true');
    });

    it('branche aria-describedby vers le message d\'erreur', () => {
      render(<Input id="phone" label="Téléphone" state="error" errorMessage="Invalide" />);
      expect(screen.getByLabelText('Téléphone')).toHaveAttribute(
        'aria-describedby',
        'phone-error',
      );
    });
  });

  describe('variante search', () => {
    it('affiche l\'icône loupe (role générique svg)', () => {
      render(<Input variant="search" value="" onChange={vi.fn()} />);
      // lucide-render un <svg>; on vérifie sa présence via le rôle img implicite.
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('n\'affiche pas le bouton clear quand la valeur est vide', () => {
      render(<Input variant="search" value="" onClear={vi.fn()} onChange={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument();
    });

    it('affiche le bouton clear quand une valeur est saisie et onClear fourni', () => {
      render(<Input variant="search" value="farm" onClear={vi.fn()} onChange={vi.fn()} />);
      expect(screen.getByRole('button', { name: /effacer/i })).toBeInTheDocument();
    });

    it('déclenche onClear au clic sur le bouton clear', () => {
      const onClear = vi.fn();
      render(<Input variant="search" value="farm" onClear={onClear} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /effacer/i }));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('ne montre pas le bouton clear si onClear n\'est pas fourni (même avec valeur)', () => {
      render(<Input variant="search" value="farm" onChange={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /effacer/i })).not.toBeInTheDocument();
    });
  });

  describe('états visuels', () => {
    it('applique la classe default par défaut', () => {
      const { container } = render(<Input id="x" />);
      const field = container.querySelector(`div[class*='field']`);
      expect(field?.className).toMatch(/default/);
    });

    it('applique la classe filled quand state="filled"', () => {
      const { container } = render(<Input id="x" state="filled" />);
      const field = container.querySelector(`div[class*='field']`);
      expect(field?.className).toMatch(/filled/);
    });

    it('applique la classe error quand state="error"', () => {
      const { container } = render(<Input id="x" state="error" />);
      const field = container.querySelector(`div[class*='field']`);
      expect(field?.className).toMatch(/error/);
    });
  });
});
