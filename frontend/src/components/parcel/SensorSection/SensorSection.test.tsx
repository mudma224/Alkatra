import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SensorSection } from './SensorSection';
import { sensorApi } from '../../../api/parcel.api';
import type { Sensor } from '../../../types/parcel.types';

vi.mock('../../../api/parcel.api', () => ({
  parcelApi: { listByFarm: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  sensorApi: { associate: vi.fn(), dissociate: vi.fn(), listByParcel: vi.fn() },
}));

const mockedAssociate = vi.mocked(sensorApi.associate);
const mockedDissociate = vi.mocked(sensorApi.dissociate);

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

function renderSection(sensors: Sensor[] | undefined, onSensorsChanged = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1/parcels/parcel-1']}>
      <Routes>
        <Route
          path="/farms/:farmId/parcels/:parcelId"
          element={
            <SensorSection
              farmId="farm-1"
              parcelId="parcel-1"
              sensors={sensors}
              onSensorsChanged={onSensorsChanged}
            />
          }
        />
        <Route
          path="/farms/:farmId/parcels/:parcelId/sensors"
          element={<div>Sensors page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** Erreur Axios mimant le 403 anti-vol de capteur du farm-service. */
function makeAntiTheftError(): AxiosError {
  return new AxiosError('Forbidden', AxiosError.ERR_BAD_REQUEST, undefined, undefined, {
    data: {
      statusCode: 403,
      errorCode: 'FORBIDDEN',
      message: "Action interdite : le capteur appartient à une parcelle d'un autre utilisateur.",
      timestamp: '2026-08-18T10:00:00.000Z',
      path: '/api/v1/sensors/associate',
      method: 'POST',
    },
    status: 403,
    statusText: 'Forbidden',
    headers: {},
    config: {} as never,
  });
}

describe('SensorSection', () => {
  beforeEach(() => {
    mockedAssociate.mockReset();
    mockedDissociate.mockReset();
  });

  it('shows the empty state when the parcel has no sensors', () => {
    renderSection([]);

    expect(screen.getByText('Aucun capteur associé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Associer un capteur/ })).toBeInTheDocument();
  });

  it('lists up to 3 sensors inline with Dissocier on each row', () => {
    renderSection([
      makeSensor('OL-001'),
      makeSensor('OL-002', { lastSeenAt: null, batteryPct: null }),
      makeSensor('OL-003', { isActive: false, batteryPct: null }),
    ]);

    expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument();
    expect(screen.getByText('Batterie 87 %')).toBeInTheDocument();
    // OL-001 (actif) et OL-003 (inactif) ont un lastSeen → deux « Vu il y a… ».
    expect(screen.getAllByText(/Vu il y a/)).toHaveLength(2);
    expect(screen.getByText('ESP32-OL-002')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Dissocier' })).toHaveLength(3);
    expect(screen.queryByText(/Voir tous les capteurs/)).not.toBeInTheDocument();
  });

  it('switches to compact mode with a link when more than 3 sensors', () => {
    renderSection([
      makeSensor('OL-001'),
      makeSensor('OL-002'),
      makeSensor('OL-003'),
      makeSensor('OL-004'),
      makeSensor('OL-005'),
    ]);

    // Card compacte : 3 capteurs max, pas de Dissocier inline.
    expect(screen.getByText('ESP32-OL-001')).toBeInTheDocument();
    expect(screen.getByText('ESP32-OL-003')).toBeInTheDocument();
    expect(screen.queryByText('ESP32-OL-004')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dissocier' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Voir tous les capteurs \(5\)/ }));

    expect(screen.getByText('Sensors page')).toBeInTheDocument();
  });

  it('dissociates a sensor after confirmation and notifies the parent', async () => {
    const onSensorsChanged = vi.fn();
    mockedDissociate.mockResolvedValueOnce(undefined);

    renderSection([makeSensor('OL-001')], onSensorsChanged);

    fireEvent.click(screen.getByRole('button', { name: 'Dissocier' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Dissocier ce capteur ?')).toBeInTheDocument();
    expect(within(dialog).getByText('ESP32-OL-001 sera retiré de cette parcelle.')).toBeInTheDocument();
    expect(within(dialog).getByText('Les mesures déjà collectées sont conservées.')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Dissocier' }));

    await waitFor(() => expect(mockedDissociate).toHaveBeenCalledWith('OL-001'));
    await waitFor(() => expect(onSensorsChanged).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the dissociation modal on Annuler without calling the API', () => {
    renderSection([makeSensor('OL-001')]);

    fireEvent.click(screen.getByRole('button', { name: 'Dissocier' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedDissociate).not.toHaveBeenCalled();
  });

  it('associates a sensor through the modal and refreshes', async () => {
    const onSensorsChanged = vi.fn();
    mockedAssociate.mockResolvedValueOnce(makeSensor('OL-009'));

    renderSection([], onSensorsChanged);

    fireEvent.click(screen.getByRole('button', { name: /Associer un capteur/ }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Identifiant du capteur');
    expect(within(dialog).getByRole('button', { name: 'Associer' })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'ESP32-OL-009' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Associer' }));

    await waitFor(() =>
      expect(mockedAssociate).toHaveBeenCalledWith({
        deviceId: 'ESP32-OL-009',
        parcelId: 'parcel-1',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSensorsChanged).toHaveBeenCalledTimes(1);
  });

  it('keeps the association modal open and surfaces the backend 403 on failure', async () => {
    mockedAssociate.mockRejectedValueOnce(makeAntiTheftError());

    renderSection([]);

    fireEvent.click(screen.getByRole('button', { name: /Associer un capteur/ }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Identifiant du capteur'), {
      target: { value: 'ESP32-STOLEN' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Associer' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        "le capteur appartient à une parcelle d'un autre utilisateur",
      ),
    );
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
  });
});
