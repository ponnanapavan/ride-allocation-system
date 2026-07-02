import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { v7 as uuidv7 } from 'uuid';

import { Notification } from './models/notification.model';
import { Op } from 'sequelize';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
  ) {}

  async createNotification(
    rideId: string,
    driverId: string,
  ) {
    return await this.notificationModel.create({
      notificationId: uuidv7(),
      rideId,
      driverId,
      status: 'PENDING',
    });
  }

  async acceptNotification(rideId: string, driverId: string) {
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
}

async expireNotifications(rideId: string, acceptedDriverId: string) {
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
}

async expirePendingNotifications(rideId: string) {
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
}
}