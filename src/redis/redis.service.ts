import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  InternalServerErrorException,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private client: RedisClientType = createClient({
    url: 'redis://localhost:6379',
  });

  async onModuleInit() {
   
    this.client.on('error', (error) => {
      this.logger.error(`Redis client error: ${error.message}`, error.stack);
    });

    try {
      await this.client.connect();
      this.logger.log('Connected to Redis');
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to connect to Redis');
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
      this.logger.log('Disconnected from Redis');
    } catch (error) {
      this.logger.error(`Failed to disconnect from Redis cleanly: ${error.message}`, error.stack);
    }
  }

  getClient() {
    return this.client;
  }

  async addDriverLocation(driverId: string, latitude: number, longitude: number) {
    try {
      await this.client.geoAdd('drivers:locations', {
        member: driverId,
        longitude,
        latitude,
      });
    } catch (error) {
      this.logger.error(
        `Failed to add location for driver ${driverId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update driver location');
    }
  }

  async findNearbyDrivers(
    latitude: number,
    longitude: number,
    radius: number,
  ): Promise<string[]> {
    try {
      const result = await this.client.sendCommand([
        'GEOSEARCH',
        'drivers:locations',
        'FROMLONLAT',
        longitude.toString(),
        latitude.toString(),
        'BYRADIUS',
        radius.toString(),
        'km',
      ]);

      return result as unknown as string[];
    } catch (error) {
      this.logger.error(
        `Failed to search nearby drivers at (${latitude}, ${longitude}) within ${radius}km: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to search for nearby drivers');
    }
  }

  async addNotifiedDriver(rideId: string, driverId: string) {
    try {
      await this.client.sAdd(`ride:${rideId}:notified`, driverId);
    } catch (error) {
      this.logger.error(
        `Failed to record notified driver ${driverId} for ride ${rideId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to record notified driver');
    }
  }

  async getNotifiedDrivers(rideId: string) {
    try {
      return await this.client.sMembers(`ride:${rideId}:notified`);
    } catch (error) {
      this.logger.error(
        `Failed to fetch notified drivers for ride ${rideId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch notified drivers');
    }
  }

  async acquireRideLock(rideId: string, driverId: string) {
    try {
      const result = await this.client.set(`ride:${rideId}:lock`, driverId, {
        NX: true,
        EX: 30,
      });

      return result === 'OK';
    } catch (error) {
      this.logger.error(
        `Failed to acquire lock for ride ${rideId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to acquire ride lock');
    }
  }

  async releaseRideLock(rideId: string) {
    try {
      await this.client.del(`ride:${rideId}:lock`);
    } catch (error) {
      this.logger.error(
        `Failed to release lock for ride ${rideId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to release ride lock');
    }
  }
}