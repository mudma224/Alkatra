import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmListScreen } from './FarmListScreen';
import { farmApi } from '../../../api/farm.api';
import type { Farm } from '../../../types/farm.types';

vi.mock('../../../api/farm.api', () => ({
  farmApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const mockedList = vi.mocked(farmApi.list);

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

const farms = [
  makeFarm(),
  makeFarm({ id: 'farm-2', name: 'Ferme Tafilalet', totalAreaHa: '8.00', region: 'Errachidia' }),
];

function renderListScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms']}>
      <Routes>
        <Route path="/farms" element={<FarmListScreen />} />
        <Route path="/farms/new" element={<div>Create page</div>} />
        <Route path="/farms/:farmId" element={<div>Farm detail page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FarmListScreen', () => {
  beforeEach(() => {
    mockedList.mockReset();
  });

  it('renders skeletons while the farms are loading', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    const { container } = renderListScreen();

    expect(screen.getByText('Mes fermes')).toBeInTheDocument();
    expect(screen.queryByText('Aucune ferme')).not.toBeInTheDocument();
    // Maquette 110:33 : 4 squelettes (recherche, bouton, card, card).
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(4);
  });

  it('shows the empty state with its CTA when the user has no farms', async () => {
    mockedList.mockResolvedValueOnce([]);

    renderListScreen();

    await waitFor(() =>
      expect(screen.getByText('Aucune ferme')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        'Vous n\'avez pas encore créé de ferme. Commencez par ajouter votre première exploitation.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Créer ma première ferme' }));

    await waitFor(() => expect(screen.getByText('Create page')).toBeInTheDocument());
  });

  it('renders the farm cards on success and navigates to the detail on click', async () => {
    mockedList.mockResolvedValueOnce(farms);

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(screen.getByText('Ferme Tafilalet')).toBeInTheDocument();
    expect(screen.getByText('12.5 ha')).toBeInTheDocument();
    expect(screen.getByText('8.0 ha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer une ferme' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Ferme Aït Amira/ }));

    await waitFor(() => expect(screen.getByText('Farm detail page')).toBeInTheDocument());
  });

  it('filters farms by name as the user types in the search bar', async () => {
    mockedList.mockResolvedValueOnce(farms);

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Ferme Tafilalet')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'Tafilalet' } });

    await waitFor(() => expect(screen.queryByText('Ferme Aït Amira')).not.toBeInTheDocument());
    expect(screen.getByText('Ferme Tafilalet')).toBeInTheDocument();
  });

  it('matches search input ignoring diacritics', async () => {
    mockedList.mockResolvedValueOnce(farms);

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'ait amira' } });

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(screen.queryByText('Ferme Tafilalet')).not.toBeInTheDocument();
  });

  it('shows a no-result empty state when the query matches nothing', async () => {
    mockedList.mockResolvedValueOnce(farms);

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'zzz' } });

    await waitFor(() =>
      expect(screen.getByText('Aucune ferme trouvée')).toBeInTheDocument(),
    );
  });

  it('shows the error state and refetches when Réessayer is clicked', async () => {
    mockedList.mockRejectedValueOnce(new Error('network down'));
    mockedList.mockResolvedValueOnce(farms);

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Oups !')).toBeInTheDocument());
    expect(screen.getByText('Impossible de charger vos fermes.')).toBeInTheDocument();
    // Le message brut du serveur n'est jamais exposé à l'utilisateur.
    expect(screen.queryByText('network down')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(mockedList).toHaveBeenCalledTimes(2);
  });
});
