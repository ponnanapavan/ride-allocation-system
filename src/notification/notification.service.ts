import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { v7 as uuidv7 } from 'uuid';

import { Notification } from './models/notification.model';
import { Op } from 'sequelize';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
  ) {}

  async createNotification(rideId: string, driverId: string) {
    try {
      return await this.notificationModel.create({
        notificationId: uuidv7(),
        rideId,
        driverId,
        status: 'PENDING',
      });
    } catch (error) {
      this.logger.error(
        `Failed to create notification for ride ${rideId}, driver ${driverId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to create notification');
    }
  }

  async acceptNotification(rideId: string, driverId: string) {
    try {
      await this.notificationModel.update(
        {
          status: 'ACCEPTED',
        },
        {
          where: {
            rideId,
            driverId,
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to accept notification for ride ${rideId}, driver ${driverId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to accept notification');
    }
  }

  async expireNotifications(rideId: string, acceptedDriverId: string) {
    try {
      await this.notificationModel.update(
        {
          status: 'EXPIRED',
        },
        {
          where: {
            rideId,
            driverId: {
              [Op.ne]: acceptedDriverId,
            },
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to expire notifications for ride ${rideId} (excluding driver ${acceptedDriverId}): ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to expire notifications');
    }
  }

  async expirePendingNotifications(rideId: string) {
    try {
      await this.notificationModel.update(
        {
          status: 'EXPIRED',
        },
        {
          where: {
            rideId,
            status: 'PENDING',
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to expire pending notifications for ride ${rideId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to expire pending notifications');
    }
  }
}