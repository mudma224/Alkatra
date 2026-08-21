import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const ALERT_TYPES = [
  'hydric_stress_critical',
  'daily_recommendation',
  'sensor_offline',
  'low_battery',
  'rain_detected',
  'frost_risk',
  'sensor_anomaly',
  'subscription_expiring',
] as const;

export const ALERT_STATUSES = ['unread', 'read', 'resolved'] as const;

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export type AlertTypeValue = (typeof ALERT_TYPES)[number];
export type AlertStatusValue = (typeof ALERT_STATUSES)[number];
export type AlertSeverityValue = (typeof ALERT_SEVERITIES)[number];

/** Contexte structuré d'une alerte (deviceId, seuils, mesures…). */
export interface AlertData {
  [key: string]: string | number | boolean | null;
}

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_alerts_user_created')
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Index('idx_alerts_parcel_id')
  @Column({ name: 'parcel_id', type: 'uuid', nullable: true })
  parcelId: string | null;

  @Column({
    name: 'alert_type',
    type: 'enum',
    enum: ALERT_TYPES,
    enumName: 'alert_type_enum',
  })
  alertType: AlertTypeValue;

  @Column({
    name: 'severity',
    type: 'enum',
    enum: ALERT_SEVERITIES,
    enumName: 'alert_severity_enum',
    default: 'info',
  })
  severity: AlertSeverityValue;

  @Index('idx_alerts_user_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: ALERT_STATUSES,
    enumName: 'alert_status_enum',
    default: 'unread',
  })
  status: AlertStatusValue;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'data', type: 'jsonb', default: '{}' })
  data: AlertData;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
