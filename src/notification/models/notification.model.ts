import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from 'sequelize-typescript';

export interface NotificationCreationAttributes {
  notificationId: string;
  rideId: string;
  driverId: string;
  status: string;
}

@Table({
  tableName: 'notifications',
})
export class Notification extends Model<
  Notification,
  NotificationCreationAttributes
> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
  })
  declare notificationId: string;

  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare rideId: string;

  @Column({
    type: DataType.UUID,
    allowNull: false,
  })
  declare driverId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'PENDING',
  })
  declare status: string;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}