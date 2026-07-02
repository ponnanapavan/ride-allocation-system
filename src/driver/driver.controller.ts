import { Controller, Get,Post,Body } from '@nestjs/common';
import { DriverService } from './driver.service';
import { CreateDriverDto } from './dto/create-driver.dto';
@Controller('drivers')
export class DriverController {
  constructor(private driverService: DriverService) {}

  @Get()
  getDrivers() {
    return this.driverService.getDrivers();
  }

  @Post()
  createDriver(@Body() driverData: CreateDriverDto) {
    return this.driverService.createDriver(driverData);
  }

 

}