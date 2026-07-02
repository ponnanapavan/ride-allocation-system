import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from 'sequelize-typescript';

export interface RideCreationAttributes {
  rideId: string;
  riderName: string;
  status: string;
  pickupLatitude: number;
  pickupLongitude: number;
  assignedDriverId?: string | null;
  retryCount?: number;
}

@Table({
  tableName: 'rides',
})
export class Ride extends Model<Ride, RideCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.UUID,
    unique: true,
    allowNull: false,
  })
  declare rideId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare riderName: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'REQUESTED',
  })
  declare status: string;

  @Column({
    type: DataType.DOUBLE,
    allowNull: false,
  })
  declare pickupLatitude: number;

  @Column({
    type: DataType.DOUBLE,
    allowNull: false,
  })
  declare pickupLongitude: number;

  @Column({
  type: DataType.INTEGER,
  allowNull: false,
  defaultValue: 0,
})
declare retryCount: number;

  @Column({
    type: DataType.UUID,
    allowNull: true,
  })
  declare assignedDriverId: string | null;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}