import type { Alert } from '../database/entities/alert.entity';

/**
 * Résultat de distribution d'une alerte sur un canal :
 * - 'sent'               : livré à au moins un destinataire ;
 * - 'skipped_no_tokens'  : aucun device enregistré pour l'utilisateur ;
 * - 'disabled'           : canal désactivé par configuration (ex: FIREBASE_*) ;
 * - 'error'              : tentative en échec (l'alerte in-app reste créée).
 */
export type ChannelSendResult = 'sent' | 'skipped_no_tokens' | 'disabled' | 'error';

/**
 * Contrat d'un canal de distribution d'alertes. L'implémentation actuelle est
 * FCM (push) ; l'interface prépare les canaux futurs (SMS en Phase 2) sans
 * toucher au pipeline du dispatcher.
 */
export interface NotificationChannel {
  readonly name: string;

  /** Distribue une alerte — ne doit JAMAIS rejeter : tout échec vaut 'error'. */
  notify(alert: Alert): Promise<ChannelSendResult>;
}
