import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmDetailScreen } from './FarmDetailScreen';
import { farmApi } from '../../../api/farm.api';
import { parcelApi } from '../../../api/parcel.api';
import type { Farm } from '../../../types/farm.types';
import type { Parcel, Sensor } from '../../../types/parcel.types';

vi.mock('../../../api/farm.api', () => ({
  farmApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

vi.mock('../../../api/parcel.api', () => ({
  parcelApi: { listByFarm: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  sensorApi: { associate: vi.fn(), listByParcel: vi.fn() },
}));

const mockedGet = vi.mocked(farmApi.get);
const mockedRemove = vi.mocked(farmApi.remove);
const mockedListByFarm = vi.mocked(parcelApi.listByFarm);

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

const sensor: Sensor = {
  id: 'sensor-1',
  parcelId: 'parcel-1',
  deviceId: 'ESP32-OL-001',
  deviceType: 'esp32-wroom-32',
  healthStatus: 'pending',
  lastSeenAt: null,
  batteryPct: null,
  firmwareVersion: null,
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

const baseParcel: Omit<Parcel, 'sensors'> = {
  id: 'parcel-1',
  farmId: 'farm-1',
  name: 'Parcelle Nord',
  areaHa: '2.50',
  cropType: 'olive',
  soilType: 'clay',
  irrigationMethod: 'drip',
  cropVariety: null,
  flowRateM3h: null,
  treeAgeYears: null,
  treeDensityPerHa: null,
  polygon: null,
  centroid: null,
  isActive: true,
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

function renderDetailScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1']}>
      <Routes>
        <Route path="/farms" element={<div>Farms page</div>} />
        <Route path="/farms/:farmId" element={<FarmDetailScreen />} />
        <Route path="/farms/:farmId/edit" element={<div>Edit page</div>} />
        <Route path="/farms/:farmId/parcels/new" element={<div>New parcel page</div>} />
        <Route path="/farms/:farmId/parcels/:parcelId" element={<div>Parcel page</div>} />
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
    mockedListByFarm.mockReset();
    mockedListByFarm.mockResolvedValue([]);
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
    mockedListByFarm.mockResolvedValueOnce([]);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
    expect(screen.getByText('Parcelles')).toBeInTheDocument();
    expect(screen.getByText('Aucune parcelle')).toBeInTheDocument();
    expect(
      screen.getByText('Créez votre première parcelle pour suivre l\'irrigation.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));

    await waitFor(() => expect(screen.getByText('Edit page')).toBeInTheDocument());
  });

  it('navigates to parcel creation from the empty state CTA', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedListByFarm.mockResolvedValueOnce([]);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Aucune parcelle')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une parcelle' }));

    await waitFor(() => expect(screen.getByText('New parcel page')).toBeInTheDocument());
  });

  it('lists the parcels with their sensor indicator and navigates on card click', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedListByFarm.mockResolvedValueOnce([
      { ...baseParcel, sensors: [sensor] },
      {
        ...baseParcel,
        id: 'parcel-2',
        name: 'Parcelle Sud',
        areaHa: '4.00',
        cropType: 'citrus',
        irrigationMethod: 'sprinkler',
        sensors: [],
      },
    ]);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Parcelle Nord')).toBeInTheDocument());
    expect(screen.getByText('Oliviers · Goutte à goutte')).toBeInTheDocument();
    expect(screen.getByText('2.5 ha')).toBeInTheDocument();
    expect(screen.getByText('Capteur')).toBeInTheDocument();
    expect(screen.getByText('Parcelle Sud')).toBeInTheDocument();
    expect(screen.getByText('Agrumes · Aspersion')).toBeInTheDocument();
    expect(screen.getByText('Sans capteur')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Ajouter une parcelle/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Parcelle Nord/ }));

    await waitFor(() => expect(screen.getByText('Parcel page')).toBeInTheDocument());
  });

  it('shows the parcels error state with Réessayer and refetches', async () => {
    mockedGet.mockResolvedValueOnce(farm);
    mockedListByFarm.mockRejectedValueOnce(new Error('network down'));
    mockedListByFarm.mockResolvedValueOnce([]);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Impossible de charger les parcelles.')).toBeInTheDocument());
    expect(screen.queryByText('network down')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Aucune parcelle')).toBeInTheDocument());
    expect(mockedListByFarm).toHaveBeenCalledTimes(2);
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
