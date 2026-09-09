import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;

export type DevicePlatformValue = (typeof DEVICE_PLATFORMS)[number];

/**
 * Token FCM enregistré par une application cliente. `revokedAt` NULL = token
 * actif ; la révocation est logique (historique conservé pour audit).
 */
@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_device_tokens_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'token', type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({
    name: 'platform',
    type: 'varchar',
    length: 20,
    default: 'android',
  })
  platform: DevicePlatformValue;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Dernier upsert du token (enregistrement ou ré-enregistrement par le
   * client). Mis à jour explicitement par le service, pas automatiquement.
   */
  @Column({
    name: 'last_seen_at',
    type: 'timestamptz',
    default: () => 'NOW()',
  })
  lastSeenAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
