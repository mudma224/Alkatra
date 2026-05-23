import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { MqttService } from '../mqtt/mqtt.service';
import { KafkaService } from '../kafka/kafka.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mqttService: MqttService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const stats = this.mqttService.getStats();
    return {
      status: 'ok',
      service: 'alkatra-iot-service',
      timestamp: new Date().toISOString(),
      mqtt: {
        connected: stats.mqttConnected,
        messagesReceived: stats.messagesReceived,
        messagesForwarded: stats.messagesForwarded,
        anomaliesDetected: stats.anomaliesDetected,
      },
      kafka: {
        ready: this.kafkaService.isReady(),
      },
    };
  }
}
