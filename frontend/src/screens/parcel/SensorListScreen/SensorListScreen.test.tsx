import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SensorListScreen } from './SensorListScreen';
import { parcelApi, sensorApi } from '../../../api/parcel.api';
import type { Farm } from '../../../types/farm.types';
import type { Parcel, Sensor } from '../../../types/parcel.types';

vi.mock('../../../api/parcel.api', () => ({
  parcelApi: { listByFarm: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  sensorApi: { associate: vi.fn(), dissociate: vi.fn(), listByParcel: vi.fn() },
}));

const mockedGet = vi.mocked(parcelApi.get);
const mockedDissociate = vi.mocked(sensorApi.dissociate);

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

function makeSensor(id: string, overrides: Partial<Sensor> = {}): Sensor {
  return {
    id,
    parcelId: 'parcel-1',
    deviceId: `ESP32-${id}`,
    deviceType: 'esp32-wroom-32',
    isActive: true,
    lastSeenAt: '2026-08-18T10:00:00.000Z',
    batteryPct: 87,
    firmwareVersion: null,
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
    ...overrides,
  };
}

function makeParcel(sensors: Sensor[]): Parcel {
  return {
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
    farm,
    sensors,
    createdAt: '2026-08-12T12:00:00.000Z',
    updatedAt: '2026-08-12T12:00:00.000Z',
  };
}

function renderListScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1/parcels/parcel-1/sensors']}>
      <Routes>
        <Route
          path="/farms/:farmId/parcels/:parcelId/sensors"
          element={<SensorListScreen />}
        />
        <Route
          path="/farms/:farmId/parcels/:parcelId"
          element={<div>Parcel detail page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SensorListScreen', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedDissociate.mockReset();
  });

  it('renders skeletons while loading', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    const { container } = renderListScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Associer/ })).not.toBeInTheDocument();
  });

  it('shows the error state and refetches on Réessayer', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network down'));
    mockedGet.mockResolvedValueOnce(makeParcel([]));

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Oups !')).toBeInTheDocument());
    expect(screen.getByText('Impossible de charger les capteurs.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Aucun capteur')).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('lists all sensors with statuses, count subtitle and actifs-first order', async () => {
    mockedGet.mockResolvedValueOnce(
      makeParcel([
        makeSensor('ZZ-001', { isActive: false }),
        makeSensor('AB-002', { lastSeenAt: null, batteryPct: null }),
        makeSensor('MM-003'),
        makeSensor('AA-004'),
      ]),
    );

    renderListScreen();

    await waitFor(() => expect(screen.getByText('Parcelle Nord · 4 capteurs')).toBeInTheDocument());

    // Tri : actifs d'abord (ordre alphabétique AA-004 puis MM-003), puis
    // en attente (AB-002), puis inactif (ZZ-001). getAllByText respecte
    // l'ordre du document.
    expect(screen.getAllByText(/^ESP32-/).map((node) => node.textContent)).toEqual([
      'ESP32-AA-004',
      'ESP32-MM-003',
      'ESP32-AB-002',
      'ESP32-ZZ-001',
    ]);
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('filters by search query on deviceId (case-insensitive)', async () => {
    mockedGet.mockResolvedValueOnce(
      makeParcel([makeSensor('OL-001'), makeSensor('AA-002')]),
    );

    renderListScreen();
    await waitFor(() => expect(screen.getByText('Parcelle Nord · 2 capteurs')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Rechercher'), {
      target: { value: 'ol-001' },
    });

    expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument();
    expect(screen.queryByText('ESP32-AA-002')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Effacer la saisie' }));
    expect(screen.getByText('ESP32-AA-002')).toBeInTheDocument();
  });

  it('filters by status chips', async () => {
    mockedGet.mockResolvedValueOnce(
      makeParcel([
        makeSensor('OL-001'),
        makeSensor('AA-002', { lastSeenAt: null, batteryPct: null }),
      ]),
    );

    renderListScreen();
    await waitFor(() => expect(screen.getByText('Parcelle Nord · 2 capteurs')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Non actifs' }));
    expect(screen.queryByText('ESP32-OL-001')).not.toBeInTheDocument();
    expect(screen.getByText('ESP32-AA-002')).toBeInTheDocument();
    expect(screen.queryByText('Aucun capteur trouvé')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Actifs' }));
    expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument();
    expect(screen.queryByText('ESP32-AA-002')).not.toBeInTheDocument();
  });

  it('shows the empty search state when nothing matches', async () => {
    mockedGet.mockResolvedValueOnce(makeParcel([makeSensor('OL-001')]));

    renderListScreen();
    await waitFor(() => expect(screen.getByText('Parcelle Nord · 1 capteur')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Rechercher'), {
      target: { value: 'inexistant' },
    });

    expect(screen.getByText('Aucun capteur trouvé')).toBeInTheDocument();
  });

  it('dissociates a sensor after confirmation and refetches', async () => {
    mockedGet.mockResolvedValueOnce(makeParcel([makeSensor('OL-001')]));
    mockedDissociate.mockResolvedValueOnce(undefined);
    mockedGet.mockResolvedValueOnce(makeParcel([]));

    renderListScreen();
    await waitFor(() => expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dissocier' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Dissocier ce capteur ?')).toBeInTheDocument();
    expect(within(dialog).getByText('Les mesures déjà collectées sont conservées.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Dissocier' }));

    await waitFor(() => expect(mockedDissociate).toHaveBeenCalledWith('OL-001'));
    await waitFor(() => expect(screen.getByText('Aucun capteur')).toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('goes back to the parcel detail on Retour', async () => {
    mockedGet.mockResolvedValueOnce(makeParcel([makeSensor('OL-001')]));

    renderListScreen();
    await waitFor(() => expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));

    expect(screen.getByText('Parcel detail page')).toBeInTheDocument();
  });
});
