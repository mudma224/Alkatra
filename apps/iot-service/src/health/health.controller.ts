import { Controller, Get } from '@nestjs/common';
import { MqttService } from '../mqtt/mqtt.service';
import { KafkaService } from '../kafka/kafka.service';

@Controller()
export class HealthController {
  constructor(
    private readonly mqttService: MqttService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Get('health')
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
      mongodb:{
        connected:true
      },
      ml_consumer:{
        active:true
      } 
    };
  }
}
