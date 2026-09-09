import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Parcel } from './parcel.entity';

export const SENSOR_HEALTH_STATUSES = ['pending', 'active', 'inactive', 'failing'] as const;

export type SensorHealthStatusValue = (typeof SENSOR_HEALTH_STATUSES)[number];

@Entity('sensors')
export class Sensor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'parcel_id' })
  parcelId: string;

  @Column({ type: 'varchar', length: 100, name: 'device_id', unique: true })
  deviceId: string;

  @Column({ type: 'varchar', length: 50, name: 'device_type', default: 'esp32-wroom-32' })
  deviceType: string;

  /**
   * Santé du capteur (machine à états pilotée par SensorActivityService) :
   * - pending  : associé mais jamais vu (aucun heartbeat) ;
   * - active   : envoie des données (heartbeat récent) ;
   * - inactive : silencieux depuis plus de SENSOR_INACTIVE_HOURS (2 h par défaut) ;
   * - failing  : silencieux depuis plus de SENSOR_FAILING_HOURS (24 h par défaut).
   * Tout heartbeat ramène le capteur à active.
   */
  @Index()
  @Column({
    type: 'enum',
    enum: SENSOR_HEALTH_STATUSES,
    enumName: 'sensor_health_status_enum',
    name: 'health_status',
    default: 'pending',
  })
  healthStatus: SensorHealthStatusValue;

  @Column({ type: 'timestamptz', name: 'last_seen_at', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'int', name: 'battery_pct', nullable: true })
  batteryPct: number | null;

  @Column({ type: 'varchar', length: 20, name: 'firmware_version', nullable: true })
  firmwareVersion: string | null;

  @ManyToOne(() => Parcel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parcel_id' })
  parcel: Parcel | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}