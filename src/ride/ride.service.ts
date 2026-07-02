import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
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
  private readonly logger = new Logger(RideService.name);

  constructor(
    @InjectModel(Ride)
    private readonly rideModel: typeof Ride,

    @InjectModel(Driver)
    private readonly driverModel: typeof Driver,

    private readonly redisService: RedisService,

    private readonly notificationService: NotificationService,
  ) {}

  async getRides() {
    try {
      return await this.rideModel.findAll();
    } catch (error) {
      this.logger.error(`Failed to fetch rides: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch rides');
    }
  }

  async createRide(riderData: CreateRideDto) {
    let newRide: Ride;

   
    try {
      newRide = await this.rideModel.create({
        rideId: uuidv7(),
        riderName: riderData.riderName,
        pickupLatitude: riderData.pickupLatitude,
        pickupLongitude: riderData.pickupLongitude,
        status: 'REQUESTED',
        assignedDriverId: null,
      } as Ride);
    } catch (error) {
      this.logger.error(`Failed to create ride: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create ride');
    }


    let nearbyDrivers: string[] = [];
    try {
      nearbyDrivers = await this.redisService.findNearbyDrivers(
        riderData.pickupLatitude,
        riderData.pickupLongitude,
        5,
      );
    } catch (error) {
      this.logger.warn(
        `Redis lookup failed for ride ${newRide.rideId}, proceeding with 0 nearby drivers: ${error.message}`,
      );
    }

    let driverDetails: Driver[] = [];
    try {
      if (nearbyDrivers.length > 0) {
        driverDetails = await this.driverModel.findAll({
          where: {
            driverId: {
              [Op.in]: nearbyDrivers,
            },
            status: 'AVAILABLE',
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch driver details for ride ${newRide.rideId}: ${error.message}`,
      );
    }

    // 3. Notify drivers. Each notification is independent — one failure
    // shouldn't stop the others from going out.
    for (const driver of driverDetails) {
      try {
        await this.notificationService.createNotification(
          newRide.rideId,
          driver.driverId,
        );
        await this.redisService.addNotifiedDriver(
          newRide.rideId,
          driver.driverId,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to notify driver ${driver.driverId} for ride ${newRide.rideId}: ${error.message}`,
        );
      }
    }


    try {
      newRide.status = 'SEARCHING';
      await newRide.save();
    } catch (error) {
      this.logger.error(
        `Failed to update ride ${newRide.rideId} to SEARCHING: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Ride created but failed to start driver search',
      );
    }

    this.startRetryTimer(newRide.rideId, 1);

    return {
      message: 'Ride Created Successfully',
      ride: newRide,
      nearbyDrivers: driverDetails,
    };
  }

  async acceptRide(rideId: string, body: AcceptRideDto) {
    let ride: Ride | null;
    try {
      ride = await this.rideModel.findOne({ where: { rideId } });
    } catch (error) {
      this.logger.error(`Failed to look up ride ${rideId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to look up ride');
    }

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status === 'ASSIGNED' && ride.assignedDriverId === body.driverId) {
      return {
        message: 'Ride already assigned to this driver.',
      };
    }

    if (ride.status !== 'SEARCHING') {
      throw new ConflictException(
        `Ride cannot be accepted. Current status is ${ride.status}`,
      );
    }

    let lockAcquired: boolean;
    try {
      lockAcquired = await this.redisService.acquireRideLock(rideId, body.driverId);
    } catch (error) {
      this.logger.error(
        `Failed to acquire lock for ride ${rideId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to acquire ride lock');
    }

    if (!lockAcquired) {
      throw new ConflictException('Another driver has already accepted this ride.');
    }

  
    try {
      ride.assignedDriverId = body.driverId;
      ride.status = 'ASSIGNED';
      await ride.save();

      const driver = await this.driverModel.findOne({
        where: { driverId: body.driverId },
      });

      if (!driver) {
        throw new NotFoundException('Driver not found');
      }

      driver.status = 'BUSY';
      await driver.save();

      await this.notificationService.acceptNotification(rideId, body.driverId);
      await this.notificationService.expireNotifications(rideId, body.driverId);

      return {
        message: 'Lock acquired successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed while assigning ride ${rideId} to driver ${body.driverId}: ${error.message}`,
        error.stack,
      );

     
      try {
        ride.assignedDriverId = null;
        ride.status = 'SEARCHING';
        await ride.save();
      } catch (rollbackError) {
        this.logger.error(
          `Rollback of ride ${rideId} status failed: ${rollbackError.message}`,
          rollbackError.stack,
        );
      }

      try {
        await this.redisService.releaseRideLock(rideId);
      } catch (rollbackError) {
        this.logger.error(
          `Failed to release lock for ride ${rideId} during rollback: ${rollbackError.message}`,
          rollbackError.stack,
        );
      }

      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to accept ride');
    }
  }

  async completeRide(rideId: string) {
    let ride: Ride | null;
    try {
      ride = await this.rideModel.findOne({ where: { rideId } });
    } catch (error) {
      this.logger.error(`Failed to look up ride ${rideId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to look up ride');
    }

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status !== 'ASSIGNED') {
      throw new ConflictException(
        `Ride cannot be completed. Current status is ${ride.status}`,
      );
    }

    try {
      ride.status = 'COMPLETED';
      await ride.save();
    } catch (error) {
      this.logger.error(
        `Failed to mark ride ${rideId} as COMPLETED: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to complete ride');
    }

    if (!ride.assignedDriverId) {
      this.logger.warn(`Ride ${rideId} completed with no assigned driver.`);
      return {
        message: 'No driver assigned to this ride.',
        ride,
      };
    }

    let driver: Driver | null = null;
    try {
      driver = await this.driverModel.findOne({
        where: { driverId: ride.assignedDriverId },
      });

      if (driver) {
        driver.status = 'AVAILABLE';
        await driver.save();

        await this.redisService.addDriverLocation(
          driver.driverId,
          driver.latitude,
          driver.longitude,
        );
      } else {
        this.logger.warn(
          `Assigned driver ${ride.assignedDriverId} not found while completing ride ${rideId}`,
        );
      }
    } catch (error) {
      // The ride is already marked COMPLETED at this point — don't fail the
      // whole request, but make sure this is loud in the logs since the
      // driver may be stuck as BUSY / missing from the location index.
      this.logger.error(
        `Ride ${rideId} completed, but failed to free up driver ${ride.assignedDriverId}: ${error.message}`,
        error.stack,
      );
    }

    try {
      await this.redisService.releaseRideLock(rideId);
    } catch (error) {
      this.logger.error(
        `Failed to release ride lock for ${rideId}: ${error.message}`,
        error.stack,
      );
    }

    return {
      message: 'Ride Completed Successfully',
      ride,
      driver,
    };
  }

  private startRetryTimer(rideId: string, retryCount: number) {
    setTimeout(async () => {
      try {
        this.logger.log(`Retry ${retryCount} started for Ride: ${rideId}`);

        const ride = await this.rideModel.findOne({ where: { rideId } });

        if (!ride) {
          this.logger.warn(`Ride ${rideId} not found, stopping retries.`);
          return;
        }

        if (ride.status !== 'SEARCHING') {
          this.logger.log(`Ride ${rideId} already assigned. Retry stopped.`);
          return;
        }

        if (retryCount > 3) {
          try {
            ride.status = 'TIMEOUT';
            await ride.save();
            this.logger.log(`Ride ${rideId} timed out.`);
          } catch (error) {
            this.logger.error(
              `Failed to mark ride ${rideId} as TIMEOUT: ${error.message}`,
              error.stack,
            );
          }
          return;
        }

        try {
          await this.notificationService.expirePendingNotifications(rideId);
        } catch (error) {
          this.logger.warn(
            `Failed to expire pending notifications for ride ${rideId}: ${error.message}`,
          );
        }

        const radius = retryCount * 5 + 5;
        this.logger.log(`Searching drivers within ${radius} km for ride ${rideId}`);

        let nearbyDrivers: string[] = [];
        try {
          nearbyDrivers = await this.redisService.findNearbyDrivers(
            ride.pickupLatitude,
            ride.pickupLongitude,
            radius,
          );
        } catch (error) {
          this.logger.warn(
            `Redis lookup failed on retry ${retryCount} for ride ${rideId}: ${error.message}`,
          );
        }

        let notifiedDrivers: string[] = [];
        try {
          notifiedDrivers = await this.redisService.getNotifiedDrivers(rideId);
        } catch (error) {
          this.logger.warn(
            `Failed to fetch notified drivers for ride ${rideId}: ${error.message}`,
          );
        }

        const newDrivers = nearbyDrivers.filter(
          (driverId) => !notifiedDrivers.includes(driverId),
        );

        this.logger.log(`New drivers for ride ${rideId}: ${newDrivers.join(', ') || 'none'}`);

        let driverDetails: Driver[] = [];
        try {
          if (newDrivers.length > 0) {
            driverDetails = await this.driverModel.findAll({
              where: {
                driverId: {
                  [Op.in]: newDrivers,
                },
                status: 'AVAILABLE',
              },
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch driver details on retry ${retryCount} for ride ${rideId}: ${error.message}`,
          );
        }

        for (const driver of driverDetails) {
          try {
            await this.notificationService.createNotification(rideId, driver.driverId);
            await this.redisService.addNotifiedDriver(rideId, driver.driverId);
          } catch (error) {
            this.logger.warn(
              `Failed to notify driver ${driver.driverId} on retry ${retryCount} for ride ${rideId}: ${error.message}`,
            );
          }
        }

        try {
          ride.retryCount = retryCount;
          await ride.save();
        } catch (error) {
          this.logger.error(
            `Failed to persist retryCount for ride ${rideId}: ${error.message}`,
            error.stack,
          );
        }

        this.logger.log(
          `Retry ${retryCount} completed for ride ${rideId}. ${driverDetails.length} new drivers notified.`,
        );

        this.startRetryTimer(rideId, retryCount + 1);
      } catch (error) {
        // Safety net: this callback runs outside of Nest's request context,
        // so an uncaught error here would become an unhandled rejection and
        // could crash the process. Log and stop this ride's retry chain.
        this.logger.error(
          `Unexpected error in retry timer for ride ${rideId} (retry ${retryCount}): ${error.message}`,
          error.stack,
        );
      }
    }, 30000);
  }
}