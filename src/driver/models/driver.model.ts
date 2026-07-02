import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
} from 'sequelize-typescript';

export interface DriverCreationAttributes {
  driverId: string;
  name: string;
  status: string;
  latitude: number;
  longitude: number;
}

@Table({
  tableName: 'drivers',
})
export class Driver extends Model<Driver, DriverCreationAttributes> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number;

  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
  })
  declare driverId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'AVAILABLE',
  })
  declare status: string;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true,
  })
  declare latitude: number;

  @Column({
    type: DataType.DOUBLE,
    allowNull: true,
  })
  declare longitude: number;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}