import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { v7 as uuidv7 } from 'uuid';

import { Ride } from './models/ride.model';
import { CreateRideDto } from './dto/create-ride.dto';
import { RedisService } from 'src/redis/redis.service';
import { Driver } from 'src/driver/models/driver.model';
import { NotificationService } from 'src/notification/notification.service';
import { AcceptRideDto } from './dto/accept-ride.dto ';
import { Op } from 'sequelize';

@Injectable()
export class RideService {
  constructor(
    @InjectModel(Ride)
    private readonly rideModel: typeof Ride,

    @InjectModel(Driver)
    private readonly driverModel: typeof Driver,

    private readonly redisService: RedisService,

    private readonly notificationService: NotificationService,
  ) {}

  async getRides() {
    return await this.rideModel.findAll();
  }

  async createRide(riderData: CreateRideDto) {
    const newRide = await this.rideModel.create({
      rideId: uuidv7(),
      riderName: riderData.riderName,
      pickupLatitude: riderData.pickupLatitude,
      pickupLongitude: riderData.pickupLongitude,
      status: 'REQUESTED',
      assignedDriverId: null,
    } as Ride);

    const nearbyDrivers = await this.redisService.findNearbyDrivers(
      riderData.pickupLatitude,
      riderData.pickupLongitude,
      5,
    );

    const driverDetails = await this.driverModel.findAll({
      where: {
        driverId: {
          [Op.in]: nearbyDrivers,
        },
        status: 'AVAILABLE',
      },
    });

    for (const driver of driverDetails) {
      await this.notificationService.createNotification(
        newRide.rideId,
        driver.driverId,
      );

      await this.redisService.addNotifiedDriver(
        newRide.rideId,
        driver.driverId,
      );
    }

    newRide.status = 'SEARCHING';
    await newRide.save();

    this.startRetryTimer(newRide.rideId, 1);

    return {
      message: 'Ride Created Successfully',
      ride: newRide,
      nearbyDrivers: driverDetails,
    };
  }

  async acceptRide(rideId: string, body: AcceptRideDto) {
    const ride = await this.rideModel.findOne({
      where: {
        rideId,
      },
    });

    if (!ride) {
      return {
        message: 'Ride not found',
      };
    }

    if (ride.status === 'ASSIGNED' && ride.assignedDriverId === body.driverId) {
      return {
        message: 'Ride already assigned to this driver.',
      };
    }

    if (ride.status !== 'SEARCHING') {
      return {
        message: `Ride cannot be accepted. Current status is ${ride.status}`,
      };
    }

    const lockAcquired = await this.redisService.acquireRideLock(
      rideId,
      body.driverId,
    );

    if (!lockAcquired) {
      return {
        message: 'Another driver has already accepted this ride.',
      };
    }

    ride.assignedDriverId = body.driverId;
    ride.status = 'ASSIGNED';

    await ride.save();

    const driver = await this.driverModel.findOne({
      where: {
        driverId: body.driverId,
      },
    });

    if (driver) {
      driver.status = 'BUSY';
      await driver.save();
    }

    await this.notificationService.acceptNotification(rideId, body.driverId);

    await this.notificationService.expireNotifications(rideId, body.driverId);

    return {
      message: 'Lock acquired successfully',
    };
  }

  async completeRide(rideId: string) {
    const ride = await this.rideModel.findOne({
      where: {
        rideId,
      },
    });

    if (!ride) {
      return {
        message: 'Ride not found',
      };
    }

    if (ride.status !== 'ASSIGNED') {
      return {
        message: `Ride cannot be completed. Current status is ${ride.status}`,
      };
    }

    ride.status = 'COMPLETED';
    await ride.save();

    if (!ride.assignedDriverId) {
      return {
        message: 'No driver assigned to this ride.',
      };
    }

    const driver = await this.driverModel.findOne({
      where: {
        driverId: ride.assignedDriverId,
      },
    });

    if (driver) {
      driver.status = 'AVAILABLE';
      await driver.save();

      await this.redisService.addDriverLocation(
        driver.driverId,
        driver.latitude,
        driver.longitude,
      );
    }

    await this.redisService.releaseRideLock(rideId);

    return {
      message: 'Ride Completed Successfully',
      ride,
      driver,
    };
  }

  private startRetryTimer(rideId: string, retryCount: number) {
    setTimeout(async () => {
      console.log(`Retry ${retryCount} started for Ride: ${rideId}`);

      const ride = await this.rideModel.findOne({
        where: {
          rideId,
        },
      });

      if (!ride) {
        console.log('Ride not found');
        return;
      }

      if (ride.status !== 'SEARCHING') {
        console.log('Ride already assigned. Retry stopped.');

        return;
      }

      if (retryCount > 3) {
        ride.status = 'TIMEOUT';
        await ride.save();

        console.log('Ride timed out.');
        return;
      }

      await this.notificationService.expirePendingNotifications(rideId);

      const radius = retryCount * 5 + 5;

      console.log(`Searching drivers within ${radius} km`);

      const nearbyDrivers = await this.redisService.findNearbyDrivers(
        ride.pickupLatitude,
        ride.pickupLongitude,
        radius,
      );

      const notifiedDrivers =
        await this.redisService.getNotifiedDrivers(rideId);

      const newDrivers = nearbyDrivers.filter(
        (driverId) => !notifiedDrivers.includes(driverId),
      );

      console.log('New Drivers:', newDrivers);

      const driverDetails = await this.driverModel.findAll({
        where: {
          driverId: {
            [Op.in]: newDrivers,
          },
          status: 'AVAILABLE',
        },
      });

      for (const driver of driverDetails) {
        await this.notificationService.createNotification(
          rideId,
          driver.driverId,
        );

        await this.redisService.addNotifiedDriver(rideId, driver.driverId);
      }

      ride.retryCount = retryCount;
      await ride.save();

      console.log(
        `Retry ${retryCount} completed. ${driverDetails.length} new drivers notified.`,
      );

      this.startRetryTimer(rideId, retryCount + 1);
    }, 30000);
  }
}
