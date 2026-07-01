// apps/user-service/src/user/entities/user.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_users_phone')
  @Column({ type: 'varchar', unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ name: 'preferred_language', type: 'varchar', length: 10, default: 'fr' })
  preferredLanguage: string;

  @Column({ name: 'otp_attempts', type: 'integer', default: 0 })
  otpAttempts: number;

  @Column({ name: 'otp_blocked_until', type: 'timestamp', nullable: true })
  otpBlockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ name: 'keycloak_id', type: 'varchar', length: 255, nullable: true })
  keycloakId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
