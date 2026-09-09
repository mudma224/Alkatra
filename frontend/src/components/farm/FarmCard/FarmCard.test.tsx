import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FarmCard } from './FarmCard';
import type { Farm } from '../../../types/farm.types';

function makeFarm(overrides: Partial<Farm> = {}): Farm {
  return {
    id: 'farm-1',
    ownerId: 'user-1',
    name: 'Ferme Aït Amira',
    totalAreaHa: '12.50',
    region: 'Marrakech',
    location: null,
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

describe('FarmCard', () => {
  it('renders the farm name, region label and formatted area badge', () => {
    render(<FarmCard farm={makeFarm()} />);

    expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument();
    expect(screen.getByText('Région de Marrakech')).toBeInTheDocument();
    expect(screen.getByText('12.5 ha')).toBeInTheDocument();
  });

  it('uses French elision for regions starting with a vowel', () => {
    render(<FarmCard farm={makeFarm({ region: 'Errachidia' })} />);

    expect(screen.getByText("Région d'Errachidia")).toBeInTheDocument();
  });

  it('falls back to a neutral label when the region is missing', () => {
    render(<FarmCard farm={makeFarm({ region: null })} />);

    expect(screen.getByText('Région non renseignée')).toBeInTheDocument();
  });

  it('formats an integer area with a single decimal (TypeORM decimal serialization)', () => {
    render(<FarmCard farm={makeFarm({ totalAreaHa: '8.00' })} />);

    expect(screen.getByText('8.0 ha')).toBeInTheDocument();
  });

  it('calls onClick with the farm when clicked', () => {
    const onClick = vi.fn();
    render(<FarmCard farm={makeFarm()} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Ferme Aït Amira/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'farm-1' }));
  });
});
