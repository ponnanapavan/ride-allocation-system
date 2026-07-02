import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { Driver } from './models/driver.model';
import { RedisModule } from 'src/redis/redis.module';

@Module({
   imports: [SequelizeModule.forFeature([Driver]),RedisModule],
  controllers: [DriverController],
  providers: [DriverService]
})
export class DriverModule {}
