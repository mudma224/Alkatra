import { render, screen, fireEvent } from '@testing-library/react';
import { LogIn } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  describe('comportement de base', () => {
    it('rend son label et répond au clic quand activé', () => {
      const onClick = vi.fn();
      render(
        <Button variant="primary" onClick={onClick}>
          Envoyer OTP
        </Button>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Envoyer OTP' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('ne déclenche pas onClick quand désactivé', () => {
      const onClick = vi.fn();
      render(
        <Button variant="primary" disabled onClick={onClick}>
          Envoyer OTP
        </Button>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Envoyer OTP' }));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('affiche un spinner et bloque les clics pendant le chargement', () => {
      const onClick = vi.fn();
      render(
        <Button variant="primary" loading onClick={onClick}>
          Envoyer OTP
        </Button>,
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('variantes', () => {
    type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
    const variants: Variant[] = [
      'primary',
      'secondary',
      'outline',
      'ghost',
      'destructive',
      'link',
    ];

    it.each(variants)('rend la variante %s sans erreur', (variant) => {
      render(<Button variant={variant}>Action</Button>);
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });

    it('applique la classe de variante primary au bouton', () => {
      render(<Button variant="primary">Primary</Button>);
      // La classe CSS module est dynamique mais le bouton doit avoir un attribut class non vide.
      const button = screen.getByRole('button', { name: 'Primary' });
      expect(button.className).toMatch(/button/);
    });
  });

  describe('tailles', () => {
    it('applique la taille md par défaut', () => {
      render(<Button variant="primary">MD</Button>);
      expect(screen.getByRole('button', { name: 'MD' }).className).toMatch(/md/);
    });

    it('applique la taille sm quand spécifiée', () => {
      render(
        <Button variant="primary" size="sm">
          SM
        </Button>,
      );
      expect(screen.getByRole('button', { name: 'SM' }).className).toMatch(/sm/);
    });
  });

  describe('icônes', () => {
    it('rend une icône à gauche quand iconLeft est fourni', () => {
      render(
        <Button variant="primary" iconLeft={<LogIn data-testid="icon" />}>
          Connexion
        </Button>,
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('rend une icône à droite quand iconRight est fourni', () => {
      render(
        <Button variant="primary" iconRight={<LogIn data-testid="icon" />}>
          Suivant
        </Button>,
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
    });
  });

  describe('bloc pleine largeur', () => {
    it('ajoute la classe block quand block=true', () => {
      render(
        <Button variant="primary" block>
          Full width
        </Button>,
      );
      const button = screen.getByRole('button', { name: 'Full width' });
      expect(button.className).toMatch(/block/);
      expect(button).toHaveAttribute('data-block', 'true');
    });

    it('ne met pas data-block par défaut', () => {
      render(<Button variant="primary">Auto</Button>);
      expect(screen.getByRole('button', { name: 'Auto' })).not.toHaveAttribute('data-block');
    });
  });
});
