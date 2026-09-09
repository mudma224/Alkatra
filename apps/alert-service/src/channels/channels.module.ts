import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AlertsOutboundPublisher } from './alerts-outbound.publisher';
import { FcmChannel } from './fcm.channel';

@Module({
  imports: [DevicesModule, MetricsModule],
  providers: [FcmChannel, AlertsOutboundPublisher],
  exports: [FcmChannel, AlertsOutboundPublisher],
})
export class ChannelsModule {}
