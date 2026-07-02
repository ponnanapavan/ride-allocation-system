import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit {
  private client = createClient({
    url: 'redis://localhost:6379',
  });

  async onModuleInit() {
    await this.client.connect();
    console.log('✅ Connected to Redis');
  }

  getClient() {
    return this.client;
  }

  async addDriverLocation(
    driverId: string,
    latitude: number,
    longitude: number,
  ) {
    await this.client.geoAdd('drivers:locations', {
      member: driverId,
      longitude,
      latitude,
    });
  }

async findNearbyDrivers(
  latitude: number,
  longitude: number,
  radius: number,
): Promise<string[]> {
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
}

  async addNotifiedDriver(rideId: string, driverId: string) {
    await this.client.sAdd(`ride:${rideId}:notified`, driverId);
  }

  async getNotifiedDrivers(rideId: string) {
    return await this.client.sMembers(`ride:${rideId}:notified`);
  }

  async acquireRideLock(rideId: string, driverId: string) {
    const result = await this.client.set(`ride:${rideId}:lock`, driverId, {
      NX: true,
      EX: 30,
    });

    return result === 'OK';
  }

  async releaseRideLock(rideId: string) {
    await this.client.del(`ride:${rideId}:lock`);
  }
}
