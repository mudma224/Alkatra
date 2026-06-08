import { Controller, Get, Header } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { MqttService } from '../mqtt/mqtt.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly mqttService: MqttService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const stats = this.mqttService.getStats();
    const reading = stats.lastReading;
    const lines: string[] = [];

    lines.push('# HELP alkatra_iot_messages_received_total Total MQTT messages received by iot-service.');
    lines.push('# TYPE alkatra_iot_messages_received_total counter');
    lines.push(`alkatra_iot_messages_received_total ${stats.messagesReceived}`);

    lines.push('# HELP alkatra_iot_messages_forwarded_total Total sensor messages forwarded to Kafka.');
    lines.push('# TYPE alkatra_iot_messages_forwarded_total counter');
    lines.push(`alkatra_iot_messages_forwarded_total ${stats.messagesForwarded}`);

    lines.push('# HELP alkatra_iot_anomalies_detected_total Total sensor anomalies detected.');
    lines.push('# TYPE alkatra_iot_anomalies_detected_total counter');
    lines.push(`alkatra_iot_anomalies_detected_total ${stats.anomaliesDetected}`);

    lines.push('# HELP alkatra_iot_mqtt_connected MQTT connection status, 1 connected and 0 disconnected.');
    lines.push('# TYPE alkatra_iot_mqtt_connected gauge');
    lines.push(`alkatra_iot_mqtt_connected ${stats.mqttConnected ? 1 : 0}`);

    lines.push('# HELP alkatra_iot_kafka_ready Kafka producer status, 1 ready and 0 not ready.');
    lines.push('# TYPE alkatra_iot_kafka_ready gauge');
    lines.push(`alkatra_iot_kafka_ready ${this.kafkaService.isReady() ? 1 : 0}`);

    if (reading) {
      const labels = `{farm_id="${this.escapeLabel(reading.farm_id)}",parcel_id="${this.escapeLabel(reading.parcel_id)}",device_id="${this.escapeLabel(reading.device_id)}"}`;

      lines.push('# HELP alkatra_iot_last_sensor_value Latest received sensor values by field.');
      lines.push('# TYPE alkatra_iot_last_sensor_value gauge');
      lines.push(`alkatra_iot_last_sensor_value${this.withField(labels, 'temperature_min_c')} ${reading.temperature_min_c}`);
      lines.push(`alkatra_iot_last_sensor_value${this.withField(labels, 'temperature_max_c')} ${reading.temperature_max_c}`);
      lines.push(`alkatra_iot_last_sensor_value${this.withField(labels, 'wind_speed_ms')} ${reading.wind_speed_ms}`);
      lines.push(`alkatra_iot_last_sensor_value${this.withField(labels, 'solar_radiation_mj_m2_day')} ${reading.solar_radiation_mj_m2_day}`);
      lines.push(`alkatra_iot_last_sensor_value${this.withField(labels, 'soil_humidity_pct')} ${reading.soil_humidity_pct}`);
      lines.push(`alkatra_iot_last_sensor_value${this.withField(labels, 'air_humidity_pct')} ${reading.air_humidity_pct}`);

      lines.push('# HELP alkatra_iot_last_message_timestamp_seconds Timestamp of the latest valid sensor message.');
      lines.push('# TYPE alkatra_iot_last_message_timestamp_seconds gauge');
      lines.push(`alkatra_iot_last_message_timestamp_seconds${labels} ${Math.floor(Date.parse(reading.received_at) / 1000)}`);
    }

    return `${lines.join('\n')}\n`;
  }

  private withField(labels: string, field: string): string {
    return labels.replace('}', `,field="${field}"}`);
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
