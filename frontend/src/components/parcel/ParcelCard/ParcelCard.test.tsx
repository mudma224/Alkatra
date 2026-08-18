import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ParcelCard } from './ParcelCard';
import type { Parcel, Sensor } from '../../../types/parcel.types';

const baseParcel: Parcel = {
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

/** Fabrique un capteur vu récemment (actif). */
function makeSensor(id: string): Sensor {
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
  };
}

describe('ParcelCard', () => {
  it('renders the parcel name, culture · irrigation subtitle and formatted area', () => {
    render(<ParcelCard parcel={baseParcel} />);

    expect(screen.getByText('Parcelle Nord')).toBeInTheDocument();
    expect(screen.getByText('Oliviers · Goutte à goutte')).toBeInTheDocument();
    expect(screen.getByText('2.5 ha')).toBeInTheDocument();
  });

  it('shows the Sans capteur pill when the parcel has no sensors', () => {
    render(<ParcelCard parcel={{ ...baseParcel, sensors: [] }} />);

    expect(screen.getByText('Sans capteur')).toBeInTheDocument();
    expect(screen.queryByText('Capteur')).not.toBeInTheDocument();
  });

  it('shows a singular Capteur pill when the parcel has one sensor', () => {
    render(<ParcelCard parcel={{ ...baseParcel, sensors: [makeSensor('sensor-1')] }} />);

    expect(screen.getByText('Capteur')).toBeInTheDocument();
    expect(screen.queryByText('Sans capteur')).not.toBeInTheDocument();
  });

  it('shows a counter pill when the parcel has several sensors', () => {
    render(
      <ParcelCard
        parcel={{
          ...baseParcel,
          sensors: [makeSensor('sensor-1'), makeSensor('sensor-2'), makeSensor('sensor-3')],
        }}
      />,
    );

    expect(screen.getByText('3 capteurs')).toBeInTheDocument();
  });

  it('calls onClick with the parcel when clicked', () => {
    const onClick = vi.fn();
    render(<ParcelCard parcel={baseParcel} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Parcelle Nord/ }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(baseParcel);
  });
});
