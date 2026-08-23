import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MqttService } from '../mqtt/mqtt.service';
import { KafkaService } from '../kafka/kafka.service';
import { SensorDataConsumer } from '../kafka-consumer/sensor-data.consumer';

@Controller()
export class HealthController {
  constructor(
    private readonly mqttService: MqttService,
    private readonly kafkaService: KafkaService,
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly sensorDataConsumer: SensorDataConsumer,
  ) {}

  @Get('health')
  check() {
    const stats = this.mqttService.getStats();
    const mongoReady = this.mongoConnection.readyState === 1; // 1 = connected

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
      mongodb: {
        connected: mongoReady,
        state: this.mongoConnection.readyState,
      },
      ml_consumer: {
        active: this.sensorDataConsumer.isConnected(),
      },
    };
  }
}
