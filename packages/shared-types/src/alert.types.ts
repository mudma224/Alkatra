/**
 * Types partagés du domaine notification (alert-service, Sprint 5).
 * Les valeurs de AlertType / AlertStatus / AlertSeverity reflètent exactement
 * les enums PostgreSQL de infra/postgres/schemas/notification-db.sql.
 */

export type AlertType =
  | 'hydric_stress_critical'
  | 'daily_recommendation'
  | 'sensor_offline'
  | 'low_battery'
  | 'rain_detected'
  | 'frost_risk'
  | 'sensor_anomaly'
  | 'subscription_expiring';

export type AlertStatus = 'unread' | 'read' | 'resolved';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type DevicePlatform = 'android' | 'ios' | 'web';

/** Contexte structuré d'une alerte (deviceId, seuils, mesures…). */
export interface AlertData {
  [key: string]: string | number | boolean | null;
}

/** Alerte telle que renvoyée par l'API REST d'alert-service. */
export interface Alert {
  id: string;
  userId: string;
  parcelId: string | null;
  alertType: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  data: AlertData;
  createdAt: string;
  readAt: string | null;
}

/**
 * Contrat de l'endpoint interne POST /internal/alerts d'alert-service.
 * Les services émetteurs (ex: farm-service) résolvent eux-mêmes le destinataire
 * (`userId`) — ils sont propriétaires de la chaîne d'ownership.
 */
export interface CreateAlertEvent {
  alertType: AlertType;
  userId: string;
  parcelId?: string | null;
  severity?: AlertSeverity;
  title?: string;
  message: string;
  data?: AlertData;
}

/** Enregistrement d'un token FCM pour l'utilisateur connecté. */
export interface RegisterDevicePayload {
  token: string;
  platform: DevicePlatform;
}
