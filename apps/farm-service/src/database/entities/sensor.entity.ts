import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Parcel } from './parcel.entity';

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

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

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