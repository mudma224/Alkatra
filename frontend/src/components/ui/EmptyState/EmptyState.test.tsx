import { render, screen } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('affiche le titre', () => {
    render(<EmptyState title="Aucune ferme" />);
    expect(screen.getByRole('heading', { name: 'Aucune ferme' })).toBeInTheDocument();
  });

  it('affiche la description quand fournie', () => {
    render(
      <EmptyState title="Aucune ferme" description="Créez votre première ferme." />,
    );
    expect(screen.getByText('Créez votre première ferme.')).toBeInTheDocument();
  });

  it('ne rend pas la description si absente', () => {
    render(<EmptyState title="Aucune ferme" />);
    expect(screen.queryByText(/créez/i)).not.toBeInTheDocument();
  });

  it('rend l\'icône quand fournie', () => {
    render(<EmptyState title="Aucune ferme" icon={Sparkles} />);
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('ne rend pas d\'icône si absente', () => {
    render(<EmptyState title="Aucune ferme" />);
    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('rend l\'action (CTA) quand fournie', () => {
    render(
      <EmptyState
        title="Aucune ferme"
        action={<button type="button">Créer</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument();
  });

  it('porte le role=status pour les lecteurs d\'écran', () => {
    render(<EmptyState title="Aucune ferme" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
