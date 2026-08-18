import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParcelDetailScreen } from './ParcelDetailScreen';
import { parcelApi } from '../../../api/parcel.api';
import type { Farm } from '../../../types/farm.types';
import type { Parcel, Sensor } from '../../../types/parcel.types';

vi.mock('../../../api/parcel.api', () => ({
  parcelApi: { listByFarm: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  sensorApi: { associate: vi.fn(), listByParcel: vi.fn() },
}));

const mockedGet = vi.mocked(parcelApi.get);
const mockedRemove = vi.mocked(parcelApi.remove);

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

const sensor: Sensor = {
  id: 'sensor-1',
  parcelId: 'parcel-1',
  deviceId: 'ESP32-OL-001',
  deviceType: 'esp32-wroom-32',
  isActive: true,
  lastSeenAt: '2026-08-18T10:00:00.000Z',
  batteryPct: null,
  firmwareVersion: null,
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
  cropVariety: null,
  flowRateM3h: '3.20',
  treeAgeYears: 12,
  treeDensityPerHa: 100,
  polygon: null,
  centroid: null,
  isActive: true,
  farm,
  sensors: [sensor],
  createdAt: '2026-08-12T12:00:00.000Z',
  updatedAt: '2026-08-12T12:00:00.000Z',
};

function renderDetailScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1/parcels/parcel-1']}>
      <Routes>
        <Route path="/farms/:farmId" element={<div>Farm page</div>} />
        <Route
          path="/farms/:farmId/parcels/:parcelId"
          element={<ParcelDetailScreen />}
        />
        <Route
          path="/farms/:farmId/parcels/:parcelId/edit"
          element={<div>Edit parcel page</div>}
        />
        <Route
          path="/farms/:farmId/parcels/:parcelId/recommendation"
          element={<div>Recommendation page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ParcelDetailScreen', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedRemove.mockReset();
  });

  it('renders skeletons while the parcel is loading', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    const { container } = renderDetailScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Parcelle Nord')).not.toBeInTheDocument();
  });

  it('shows the info card with French enum labels, sensor and farm subtitle', async () => {
    mockedGet.mockResolvedValueOnce(parcel);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Parcelle Nord')).toBeInTheDocument());
    expect(screen.getByText('Ferme Aït Amira')).toBeInTheDocument();
    expect(screen.getByText('Oliviers')).toBeInTheDocument();
    expect(screen.getByText('2.5 ha')).toBeInTheDocument();
    expect(screen.getByText('Argileux')).toBeInTheDocument();
    expect(screen.getByText('Goutte à goutte')).toBeInTheDocument();
    expect(screen.getByText('12 août 2026')).toBeInTheDocument();
    expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
  });

  it('navigates to the recommendation screen from the CTA', async () => {
    mockedGet.mockResolvedValueOnce(parcel);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Parcelle Nord')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Voir la recommandation du jour' }));

    await waitFor(() => expect(screen.getByText('Recommendation page')).toBeInTheDocument());
  });

  it('navigates to the edit screen on Modifier', async () => {
    mockedGet.mockResolvedValueOnce(parcel);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Parcelle Nord')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));

    await waitFor(() => expect(screen.getByText('Edit parcel page')).toBeInTheDocument());
  });

  it('deletes the parcel and navigates back to the farm on confirmation', async () => {
    mockedGet.mockResolvedValueOnce(parcel);
    mockedRemove.mockResolvedValueOnce(undefined);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Parcelle Nord')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Supprimer cette parcelle ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Les capteurs associés seront supprimés.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(screen.getByText('Farm page')).toBeInTheDocument());
    expect(mockedRemove).toHaveBeenCalledWith('parcel-1');
  });

  it('shows the error state and refetches when Réessayer is clicked', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network down'));
    mockedGet.mockResolvedValueOnce(parcel);

    renderDetailScreen();

    await waitFor(() => expect(screen.getByText('Oups !')).toBeInTheDocument());
    expect(screen.getByText('Impossible de charger cette parcelle.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Parcelle Nord')).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
