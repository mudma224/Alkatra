/**
 * Al Katra Bel Qatra — MQTT Subscriber Service
 * Écoute les capteurs ESP32 → valide → envoie vers Kafka
 * Requis CdC Section 6.3 étapes 1-2
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { KafkaService } from '../kafka/kafka.service';

// Topic MQTT à écouter — le + est un wildcard (n'importe quelle valeur)
const MQTT_TOPIC = 'alkatra/farm/+/parcel/+/sensor/+/data';
const KAFKA_RAW_TOPIC = 'raw-sensor-data';

// Seuils pour détection d'anomalies
const ANOMALY_THRESHOLDS = {
  soil_moisture_min: 5,    // % — En dessous : capteur défaillant ou sol très sec
  soil_moisture_max: 100,  // % — Au dessus : capteur défaillant
  air_temp_min: -5,        // °C — En dessous : lecture aberrante (Maroc)
  air_temp_max: 55,        // °C — Au dessus : lecture aberrante
  battery_low: 20,         // % — Batterie faible → alerte
};

export interface SensorReading {
  ts: number;
  device_id: string;
  farm_id: string;
  parcel_id: string;
  soil_moisture_1: number;
  soil_moisture_2: number;
  soil_temp: number;
  air_temp: number;
  air_humidity: number;
  rain_mm: number;
  ec: number;
  battery_pct: number;
  // Champs enrichis par l'iot-service
  received_at: string;
  is_anomaly: boolean;
  anomaly_reasons: string[];
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private messagesReceived = 0;
  private messagesForwarded = 0;
  private anomaliesDetected = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {}

  async onModuleInit() {
    const brokerUrl = this.configService.get<string>('MQTT_BROKER_URL') || 'mqtt://localhost:1883';
    const username = this.configService.get<string>('MQTT_USERNAME') || undefined;
    const password = this.configService.get<string>('MQTT_PASSWORD') || undefined;

    this.logger.log(`Connexion MQTT → ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId: `alkatra-iot-service-${Date.now()}`,
      username,
      password,
      reconnectPeriod: 3000,   // Réessayer toutes les 3 secondes si déconnecté
      connectTimeout: 10000,
      clean: true,
    });

    this.setupEventHandlers();
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.logger.log('Client MQTT fermé');
    }
  }

  private setupEventHandlers() {
    this.client.on('connect', () => {
      this.logger.log('✅ MQTT connecté à Mosquitto');
      // S'abonner au topic après la connexion
      this.client.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`Erreur subscription MQTT: ${err.message}`);
        } else {
          this.logger.log(`📡 Abonné au topic: ${MQTT_TOPIC}`);
        }
      });
    });

    this.client.on('message', async (topic: string, payload: Buffer) => {
      await this.handleMessage(topic, payload);
    });

    this.client.on('error', (err) => {
      this.logger.error(`Erreur MQTT: ${err.message}`);
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT hors ligne — tentative reconnexion...');
    });

    this.client.on('reconnect', () => {
      this.logger.log('MQTT reconnexion en cours...');
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    this.messagesReceived++;

    let rawData: any;

    // 1. Parser le JSON
    try {
      rawData = JSON.parse(payload.toString());
    } catch (err) {
      this.logger.warn(`Message JSON invalide sur topic ${topic}: ${payload.toString().substring(0, 100)}`);
      return;
    }

    // 2. Extraire farm_id, parcel_id, device_id depuis le topic MQTT
    // Format: alkatra/farm/{farm_id}/parcel/{parcel_id}/sensor/{device_id}/data
    const topicParts = topic.split('/');
    const farmId = topicParts[2] || rawData.farm_id || 'unknown';
    const parcelId = topicParts[4] || rawData.parcel_id || 'unknown';
    const deviceId = topicParts[6] || rawData.device_id || 'unknown';

    // 3. Valider les champs obligatoires
    if (!this.isValidPayload(rawData)) {
      this.logger.warn(`Payload invalide depuis ${deviceId}: champs manquants`);
      return;
    }

    // 4. Détecter les anomalies
    const { isAnomaly, anomalyReasons } = this.detectAnomalies(rawData);
    if (isAnomaly) {
      this.anomaliesDetected++;
      this.logger.warn(`⚠️ Anomalie détectée [${deviceId}]: ${anomalyReasons.join(', ')}`);
    }

    // 5. Construire le message enrichi
    const enrichedReading: SensorReading = {
      ts: rawData.ts || Math.floor(Date.now() / 1000),
      device_id: deviceId,
      farm_id: farmId,
      parcel_id: parcelId,
      soil_moisture_1: Number(rawData.soil_moisture_1 ?? rawData.soil_moisture_1_pct ?? 0),
      soil_moisture_2: Number(rawData.soil_moisture_2 ?? rawData.soil_moisture_2_pct ?? 0),
      soil_temp: Number(rawData.soil_temp ?? 0),
      air_temp: Number(rawData.air_temp ?? 0),
      air_humidity: Number(rawData.air_humidity ?? 0),
      rain_mm: Number(rawData.rain_mm ?? 0),
      ec: Number(rawData.ec ?? 0),
      battery_pct: Number(rawData.battery_pct ?? 100),
      // Enrichissement
      received_at: new Date().toISOString(),
      is_anomaly: isAnomaly,
      anomaly_reasons: anomalyReasons,
    };

    // 6. Envoyer vers Kafka
    await this.kafkaService.send(
      KAFKA_RAW_TOPIC,
      `${farmId}:${parcelId}`,  // Clé = ferme:parcelle pour le partitionnement
      enrichedReading,
    );

    this.messagesForwarded++;

    // Log périodique (1 sur 10 messages pour ne pas spammer)
    if (this.messagesReceived % 10 === 0) {
      this.logger.log(
        `📊 Stats: ${this.messagesReceived} reçus | ${this.messagesForwarded} Kafka | ${this.anomaliesDetected} anomalies`
      );
    }
  }

  private isValidPayload(data: any): boolean {
    // Vérifier que les champs essentiels sont présents
    const hasId = data.device_id || data.ts;
    const hasMoisture = data.soil_moisture_1 !== undefined || data.soil_moisture_1_pct !== undefined;
    return hasId && hasMoisture;
  }

  private detectAnomalies(data: any): { isAnomaly: boolean; anomalyReasons: string[] } {
    const reasons: string[] = [];

    const moisture1 = Number(data.soil_moisture_1 ?? data.soil_moisture_1_pct ?? 50);
    const moisture2 = Number(data.soil_moisture_2 ?? data.soil_moisture_2_pct ?? 50);
    const airTemp = Number(data.air_temp ?? 20);
    const battery = Number(data.battery_pct ?? 100);

    // Humidité hors limites
    if (moisture1 < ANOMALY_THRESHOLDS.soil_moisture_min || moisture1 > ANOMALY_THRESHOLDS.soil_moisture_max) {
      reasons.push(`soil_moisture_1 hors limites: ${moisture1}%`);
    }
    if (moisture2 < ANOMALY_THRESHOLDS.soil_moisture_min || moisture2 > ANOMALY_THRESHOLDS.soil_moisture_max) {
      reasons.push(`soil_moisture_2 hors limites: ${moisture2}%`);
    }

    // Température aberrante
    if (airTemp < ANOMALY_THRESHOLDS.air_temp_min || airTemp > ANOMALY_THRESHOLDS.air_temp_max) {
      reasons.push(`air_temp aberrant: ${airTemp}°C`);
    }

    // Batterie faible
    if (battery < ANOMALY_THRESHOLDS.battery_low) {
      reasons.push(`batterie faible: ${battery}%`);
    }

    return { isAnomaly: reasons.length > 0, anomalyReasons: reasons };
  }

  // Méthodes pour le health check et les métriques
  getStats() {
    return {
      messagesReceived: this.messagesReceived,
      messagesForwarded: this.messagesForwarded,
      anomaliesDetected: this.anomaliesDetected,
      mqttConnected: this.client?.connected ?? false,
    };
  }
}