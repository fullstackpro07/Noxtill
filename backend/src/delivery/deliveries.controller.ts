import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { SubmitProofDto } from './dto/submit-proof.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { DeliveryStatus } from '@prisma/client';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  list(@Query('status') status?: DeliveryStatus) {
    return this.deliveries.list(status);
  }

  @Sse('live')
  live(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.deliveries.stream(user.businessId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deliveries.findOne(id);
  }

  @Get(':id/proof')
  getProof(@Param('id') id: string) {
    return this.deliveries.getProof(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.deliveries.create(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Patch(':id/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignDeliveryDto,
  ) {
    return this.deliveries.assign(user.businessId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveries.updateStatus(user.businessId, id, dto);
  }

  @Post(':id/proof')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'signature', maxCount: 1 },
      { name: 'photo', maxCount: 1 },
    ]),
  )
  submitProof(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitProofDto,
    @UploadedFiles()
    files: {
      signature?: Express.Multer.File[];
      photo?: Express.Multer.File[];
    },
  ) {
    const signature = files.signature?.[0];
    if (!signature) throw new BadRequestException('signature file is required');
    return this.deliveries.submitProof(
      user.businessId,
      id,
      signature,
      files.photo?.[0],
      dto.lat,
      dto.lng,
    );
  }
}
