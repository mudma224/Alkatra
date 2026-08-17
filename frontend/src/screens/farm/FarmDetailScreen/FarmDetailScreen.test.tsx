import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmDetailScreen } from './FarmDetailScreen';
import { farmApi } from '../../../api/farm.api';
import type { Farm } from '../../../types/farm.types';

vi.mock('../../../api/farm.api', () => ({
  farmApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const mockedGet = vi.mocked(farmApi.get);
const mockedRemove = vi.mocked(farmApi.remove);

const farm: Farm = {
  id: 'farm-1',
  ownerId: 'user-1',
  name: 'Ferme Aït Amira',
  totalAreaHa: '12.50',
  region: 'Marrakech',
  location: null,
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
  parcels: [],
};

function renderDetailScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1']}>
      <Routes>
        <Route path="/farms" element={<div>Farms page</div>} />
        <Route path="/farms/:farmId" element={<FarmDetailScreen />} />
        <Route path="/farms/:farmId/edit" element={<div>Edit page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Erreur Axios mimant le AllExceptionsFilter du farm-service (status 409). */
function makeConflictError(): AxiosError {
  return new AxiosError('Conflict', AxiosError.ERR_BAD_REQUEST, undefined, undefined, {
    data: {
      statusCode: 409,
      errorCode: 'CONFLICT',
      message:
        'Suppression impossible : la ferme possède 2 parcelle(s). Veuillez d\'abord les supprimer.',
      timestamp: '2026-08-17T10:00:00.000Z',
      path: '/api/v1/farms/farm-1',
      method: 'DELETE',
    },
    status: 409,
    statusText: 'Conflict',
    headers: {},
    config: {} as never,
  });
}

describe('FarmDetailScreen', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedRemove.mockReset();
  });

  it('renders skeletons while the farm is loading', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    const { container } = renderDetailScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ferme Aït Amira')).not.toBeInTheDocument();
  });

  it('shows the farm info card with region, formatted area and French date', async () => {
    mockedGet.mockResolvedValueOnce(farm);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(screen.getByText('Marrakech')).toBeInTheDocument();
    expect(screen.getByText('12.5 ha')).toBeInTheDocument();
    expect(screen.getByText('12 août 2026')).toBeInTheDocument();
  });

  it('navigates to the edit screen on Modifier and shows the parcels empty state', async () => {
    mockedGet.mockResolvedValueOnce(farm);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
    expect(screen.getByText('Parcelles')).toBeInTheDocument();
    expect(screen.getByText('Aucune parcelle')).toBeInTheDocument();
    expect(screen.getByText('Bientôt disponible (Phase 4)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));

    await waitFor(() => expect(screen.getByText('Edit page')).toBeInTheDocument());
  });

  it('opens the delete confirmation modal on Supprimer and closes it on Annuler', async () => {
    mockedGet.mockResolvedValueOnce(farm);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Supprimer cette ferme ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Cette action est irréversible.')).toBeInTheDocument();
    expect(within(dialog).getByText('Toutes les données seront perdues.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedRemove).not.toHaveBeenCalled();
  });

  it('deletes the farm and navigates back to the list on confirmation', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedRemove.mockResolvedValueOnce(undefined);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(screen.getByText('Farms page')).toBeInTheDocument());
    expect(mockedRemove).toHaveBeenCalledWith('farm-1');
  });

  it('keeps the modal open and surfaces the backend 409 message when parcels remain', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedRemove.mockRejectedValueOnce(makeConflictError());

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'la ferme possède 2 parcelle(s)',
      ),
    );
    expect(screen.queryByText('Farms page')).not.toBeInTheDocument();
  });

  it('shows the error state and refetches when Réessayer is clicked', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network down'));
    mockedGet.mockResolvedValueOnce(farm);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Oups !')).toBeInTheDocument());
    expect(screen.getByText('Impossible de charger cette ferme.')).toBeInTheDocument();
    expect(screen.queryByText('network down')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
