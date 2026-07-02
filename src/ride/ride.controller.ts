import { Controller, Post, Body, Param } from '@nestjs/common';
import { RideService } from './ride.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { AcceptRideDto } from './dto/accept-ride.dto ';

@Controller('rides')
export class RideController {
  constructor(private readonly rideService: RideService) {}

  @Post()
  createRide(@Body() rideData: CreateRideDto) {
    return this.rideService.createRide(rideData);
  }

  @Post(':rideId/accept')
  acceptRide(
    @Param('rideId') rideId: string,
    @Body() body: AcceptRideDto,
  ) {
    return this.rideService.acceptRide(rideId, body);
  }

  @Post(':rideId/complete')
completeRide(@Param('rideId') rideId: string) {
  return this.rideService.completeRide(rideId);
}
}