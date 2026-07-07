import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'fr',
    name: 'preferred_language',
  })
  preferredLanguage: 'fr' | 'ar' | 'darija';

  @Column({ type: 'int', default: 0, name: 'otp_attempts' })
  otpAttempts: number;

  @Column({ type: 'timestamp', nullable: true, name: 'otp_blocked_until' })
  otpBlockedUntil: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'last_login_at' })
  lastLoginAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'keycloak_id' })
  keycloakId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}