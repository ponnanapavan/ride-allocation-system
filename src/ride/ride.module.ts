import { Module } from '@nestjs/common';
import { RideController } from './ride.controller';
import { RideService } from './ride.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Ride } from './models/ride.model';
import { Driver } from 'src/driver/models/driver.model';
import { RedisModule } from 'src/redis/redis.module';

import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
 SequelizeModule.forFeature([Ride, Driver]),
 RedisModule,
 NotificationModule
],
  controllers: [RideController],
  providers: [RideService]
})
export class RideModule {}
