import { Injectable, OnModuleInit } from '@nestjs/common';
import * as promClient from 'prom-client';
import { MetricsRegistryService } from '@alkatra/observability';

/**
 * Métriques métier d'auth-service, déclarées sur le registre partagé
 * (`@alkatra/observability`) et exposées sur `GET /metrics`.
 *
 * Les compteurs sont incrémentés par `AuthService` aux points réels du flux
 * (demande OTP, vérification, connexion, inscription).
 */
@Injectable()
export class AuthMetricsService implements OnModuleInit {
  private otpRequests!: promClient.Counter<string>;
  private otpVerified!: promClient.Counter<string>;
  private otpFailed!: promClient.Counter<string>;
  private logins!: promClient.Counter<string>;
  private usersTotal!: promClient.Gauge<string>;

  constructor(private readonly metricsRegistry: MetricsRegistryService) {}

  onModuleInit(): void {
    const register = this.metricsRegistry.registry;

    this.otpRequests = new promClient.Counter({
      name: 'auth_otp_requests_total',
      help: "Nombre total de demandes d'OTP (inscription / connexion)",
      registers: [register],
    });

    this.otpVerified = new promClient.Counter({
      name: 'auth_otp_verified_total',
      help: "Nombre total d'OTP vérifiés avec succès",
      registers: [register],
    });

    this.otpFailed = new promClient.Counter({
      name: 'auth_otp_failed_total',
      help: "Nombre total d'échecs de vérification OTP (invalide, expiré, bloqué)",
      registers: [register],
    });

    this.logins = new promClient.Counter({
      name: 'auth_login_total',
      help: 'Nombre total de connexions réussies (verify-otp ou refresh)',
      registers: [register],
    });

    this.usersTotal = new promClient.Gauge({
      name: 'auth_users_total',
      help: "Nombre total d'utilisateurs en base",
      registers: [register],
    });
  }

  /** Une demande d'OTP a été générée (POST /api/v1/auth/register). */
  recordOtpRequest(): void {
    this.otpRequests.inc();
  }

  /** Vérification OTP réussie. */
  recordOtpVerified(): void {
    this.otpVerified.inc();
  }

  /** Échec de vérification OTP (code invalide/expiré ou téléphone bloqué). */
  recordOtpFailed(): void {
    this.otpFailed.inc();
  }

  /** Connexion réussie (session JWT délivrée). */
  recordLogin(): void {
    this.logins.inc();
  }

  /** Valorise la gauge du nombre total d'utilisateurs. */
  setUsersTotal(total: number): void {
    this.usersTotal.set(total);
  }
}
