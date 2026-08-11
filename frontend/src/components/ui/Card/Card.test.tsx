import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('rend ses enfants', () => {
    render(
      <Card>
        <p>Contenu</p>
      </Card>,
    );
    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });

  it('applique la classe block par défaut (block=true)', () => {
    const { container } = render(<Card>Test</Card>);
    const card = container.firstElementChild;
    expect(card?.className).toMatch(/block/);
  });

  it('désactive le bloc quand block=false', () => {
    const { container } = render(<Card block={false}>Test</Card>);
    const card = container.firstElementChild;
    expect(card?.className).not.toMatch(/block/);
  });

  it('ajoute la classe elevated quand elevated=true', () => {
    const { container } = render(<Card elevated>Test</Card>);
    const card = container.firstElementChild;
    expect(card?.className).toMatch(/elevated/);
  });

  it('ne met pas elevated par défaut', () => {
    const { container } = render(<Card>Test</Card>);
    const card = container.firstElementChild;
    expect(card?.className).not.toMatch(/elevated/);
  });

  it('transmet les props HTML natives (id, onClick, data-*)', () => {
    const { container } = render(
      <Card id="my-card" data-testid="card">
        Test
      </Card>,
    );
    const card = container.firstElementChild;
    expect(card).toHaveAttribute('id', 'my-card');
  });
});
