import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmEditScreen } from './FarmEditScreen';
import { farmApi } from '../../../api/farm.api';
import type { Farm } from '../../../types/farm.types';

vi.mock('../../../api/farm.api', () => ({
  farmApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const mockedGet = vi.mocked(farmApi.get);
const mockedUpdate = vi.mocked(farmApi.update);

const farm: Farm = {
  id: 'farm-1',
  ownerId: 'user-1',
  name: 'Ferme Test Mudma',
  totalAreaHa: '20.56',
  region: 'BM',
  location: null,
  createdAt: '2026-08-16T12:00:00.000Z',
  updatedAt: '2026-08-16T12:00:00.000Z',
  parcels: [],
};

function renderEditScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1/edit']}>
      <Routes>
        <Route path="/farms/:farmId" element={<div>Detail page</div>} />
        <Route path="/farms/:farmId/edit" element={<FarmEditScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('FarmEditScreen', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
  });

  it('renders skeletons while the farm is loading', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    renderEditScreen();

    expect(screen.getByText('Modifier la ferme')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom de la ferme')).not.toBeInTheDocument();
  });

  it('shows the error state and refetches when Réessayer is clicked', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network down'));
    mockedGet.mockResolvedValueOnce(farm);

    renderEditScreen();

    await waitFor(() => expect(screen.getByText('Oups !')).toBeInTheDocument());
    expect(screen.getByText('Impossible de charger cette ferme.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Nom de la ferme')).toBeInTheDocument(),
    );
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('pre-fills the form with the existing farm values', async () => {
    mockedGet.mockResolvedValueOnce(farm);

    renderEditScreen();

    await waitFor(() => expect(screen.getByLabelText('Nom de la ferme')).toBeInTheDocument());
    expect(screen.getByLabelText('Nom de la ferme')).toHaveValue('Ferme Test Mudma');
    expect(screen.getByLabelText('Surface totale (ha)')).toHaveValue('20.56');
    expect(screen.getByLabelText('Région (optionnel)')).toHaveValue('BM');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('submits the UpdateFarmDto payload and navigates back to the detail', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedUpdate.mockResolvedValueOnce({ ...farm, name: 'Ferme Renommée' });

    renderEditScreen();

    await waitFor(() => expect(screen.getByLabelText('Nom de la ferme')).toBeInTheDocument());

    fillField('Nom de la ferme', 'Ferme Renommée');
    fillField('Surface totale (ha)', '20,5');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('farm-1', {
        name: 'Ferme Renommée',
        totalAreaHa: 20.5,
        region: 'BM',
      }),
    );
    await waitFor(() => expect(screen.getByText('Detail page')).toBeInTheDocument());
  });

  it('blocks submission and shows validation errors on an invalid form', async () => {
    mockedGet.mockResolvedValueOnce(farm);

    renderEditScreen();

    await waitFor(() => expect(screen.getByLabelText('Nom de la ferme')).toBeInTheDocument());

    fillField('Nom de la ferme', '');
    fireEvent.blur(screen.getByLabelText('Nom de la ferme'));

    expect(screen.getByText('Le nom de la ferme est obligatoire.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('stays on the form and shows an error when the update fails', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedUpdate.mockRejectedValueOnce(new Error('boom'));

    renderEditScreen();

    await waitFor(() => expect(screen.getByLabelText('Nom de la ferme')).toBeInTheDocument());

    fillField('Nom de la ferme', 'Ferme Renommée');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(screen.getByText('Impossible de modifier la ferme. Réessayez.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Detail page')).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('returns to the detail on Annuler without calling the API', async () => {
    mockedGet.mockResolvedValueOnce(farm);

    renderEditScreen();

    await waitFor(() => expect(screen.getByLabelText('Nom de la ferme')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByText('Detail page')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
