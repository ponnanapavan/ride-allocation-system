import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { v7 as uuidv7 } from 'uuid';

import { Driver } from './models/driver.model';
import { CreateDriverDto } from './dto/create-driver.dto';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class DriverService {
  constructor(
    @InjectModel(Driver)
    private readonly driverModel: typeof Driver,
    private readonly redisService: RedisService,
  ) {}

  async getDrivers() {
    return await this.driverModel.findAll();
  }

  async createDriver(driver: CreateDriverDto) {
    const newDriver = await this.driverModel.create({
      driverId: uuidv7(),
      name: driver.name,
      status: driver.status,
      latitude: driver.latitude,
      longitude: driver.longitude,
    });

    await this.redisService.addDriverLocation(
      newDriver.driverId,
      newDriver.latitude,
      newDriver.longitude,
    );

    return {
      message: 'Driver Created Successfully',
      data: newDriver,
    };
  }


  async getNearbyDrivers() {
  const drivers = await this.redisService.findNearbyDrivers(
    17.385,
    78.4867,
    5
  );

  return drivers;
}
}
