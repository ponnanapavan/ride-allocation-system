import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { v7 as uuidv7 } from 'uuid';

import { Driver } from './models/driver.model';
import { CreateDriverDto } from './dto/create-driver.dto';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);

  constructor(
    @InjectModel(Driver)
    private readonly driverModel: typeof Driver,
    private readonly redisService: RedisService,
  ) {}

  async getDrivers() {
    try {
      return await this.driverModel.findAll();
    } catch (error) {
      this.logger.error(`Failed to fetch drivers: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch drivers');
    }
  }

  async createDriver(driver: CreateDriverDto) {
    let newDriver: Driver;

    try {
      newDriver = await this.driverModel.create({
        driverId: uuidv7(),
        name: driver.name,
        status: driver.status,
        latitude: driver.latitude,
        longitude: driver.longitude,
      });
    } catch (error) {
      this.logger.error(`Failed to create driver: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create driver');
    }

   
    try {
      await this.redisService.addDriverLocation(
        newDriver.driverId,
        newDriver.latitude,
        newDriver.longitude,
      );
    } catch (error) {
      this.logger.error(
        `Driver ${newDriver.driverId} created but failed to index location in Redis: ${error.message}`,
        error.stack,
      );
    }

    return {
      message: 'Driver Created Successfully',
      data: newDriver,
    };
  }
}