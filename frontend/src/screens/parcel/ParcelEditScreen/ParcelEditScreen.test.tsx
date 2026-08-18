import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParcelEditScreen } from './ParcelEditScreen';
import { parcelApi } from '../../../api/parcel.api';
import type { Farm } from '../../../types/farm.types';
import type { Parcel } from '../../../types/parcel.types';

vi.mock('../../../api/parcel.api', () => ({
  parcelApi: { listByFarm: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  sensorApi: { associate: vi.fn(), listByParcel: vi.fn() },
}));

const mockedGet = vi.mocked(parcelApi.get);
const mockedUpdate = vi.mocked(parcelApi.update);

const farm: Farm = {
  id: 'farm-1',
  ownerId: 'user-1',
  name: 'Ferme Aït Amira',
  totalAreaHa: '12.50',
  region: 'Marrakech',
  location: null,
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

const parcel: Parcel = {
  id: 'parcel-1',
  farmId: 'farm-1',
  name: 'Parcelle Nord',
  areaHa: '2.50',
  cropType: 'olive',
  soilType: 'clay',
  irrigationMethod: 'drip',
  cropVariety: 'Picholine marocaine',
  flowRateM3h: '3.20',
  treeAgeYears: 12,
  treeDensityPerHa: 100,
  polygon: null,
  centroid: null,
  isActive: true,
  farm,
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

function renderEditScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1/parcels/parcel-1/edit']}>
      <Routes>
        <Route
          path="/farms/:farmId/parcels/:parcelId/edit"
          element={<ParcelEditScreen />}
        />
        <Route
          path="/farms/:farmId/parcels/:parcelId"
          element={<div>Parcel detail page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ParcelEditScreen', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
  });

  it('renders skeletons while the parcel is loading', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    const { container } = renderEditScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  });

  it('shows the error state and refetches on Réessayer', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network down'));
    mockedGet.mockResolvedValueOnce(parcel);

    renderEditScreen();

    await waitFor(() => expect(screen.getByText('Oups !')).toBeInTheDocument());
    expect(screen.getByText('Impossible de charger cette parcelle.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Modifier la parcelle')).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('prefills the form including optional fields (decimals reformatted)', async () => {
    mockedGet.mockResolvedValueOnce(parcel);

    renderEditScreen();

    await waitFor(() => expect(screen.getByText('Modifier la parcelle')).toBeInTheDocument());
    expect(screen.getByLabelText('Nom de la parcelle')).toHaveValue('Parcelle Nord');
    expect(screen.getByLabelText('Surface (ha)')).toHaveValue('2.5');
    expect(screen.getByLabelText('Culture')).toHaveValue('olive');
    expect(screen.getByLabelText('Type de sol')).toHaveValue('clay');
    expect(screen.getByLabelText("Méthode d'irrigation")).toHaveValue('drip');
    expect(screen.getByLabelText(/Variété/)).toHaveValue('Picholine marocaine');
    expect(screen.getByLabelText(/Débit/)).toHaveValue('3.2');
    expect(screen.getByLabelText(/Âge/)).toHaveValue('12');
    expect(screen.getByLabelText(/Densité/)).toHaveValue('100');
  });

  it('submits the UpdateParcelPayload and navigates back to the detail', async () => {
    mockedGet.mockResolvedValueOnce(parcel);
    mockedUpdate.mockResolvedValueOnce(parcel);

    renderEditScreen();

    await waitFor(() => expect(screen.getByText('Modifier la parcelle')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Nom de la parcelle'), {
      target: { value: 'Parcelle Nord-Ouest' },
    });
    fireEvent.change(screen.getByLabelText('Surface (ha)'), { target: { value: '3,5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.getByText('Parcel detail page')).toBeInTheDocument());
    expect(mockedUpdate).toHaveBeenCalledWith('parcel-1', {
      name: 'Parcelle Nord-Ouest',
      areaHa: 3.5,
      cropType: 'olive',
      soilType: 'clay',
      irrigationMethod: 'drip',
      cropVariety: 'Picholine marocaine',
      flowRateM3h: 3.2,
      treeAgeYears: 12,
      treeDensityPerHa: 100,
    });
  });

  it('goes back to the detail on Annuler without calling the API', async () => {
    mockedGet.mockResolvedValueOnce(parcel);

    renderEditScreen();

    await waitFor(() => expect(screen.getByText('Modifier la parcelle')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByText('Parcel detail page')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
