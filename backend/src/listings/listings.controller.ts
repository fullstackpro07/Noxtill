import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MasterListingService } from './master-listing.service';
import { ListingSyncService } from './listing-sync.service';
import { GmbManagementService } from './gmb-management.service';
import { UpdateMasterListingDto } from './dto/update-master-listing.dto';
import {
  AnswerGmbQnaDto,
  SelectGmbLocationDto,
  CreateGmbPhotoDto,
  CreateGmbPostDto,
} from './dto/gmb.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
export class ListingsController {
  constructor(
    private readonly masterListing: MasterListingService,
    private readonly listingSync: ListingSyncService,
    private readonly gmbManagement: GmbManagementService,
  ) {}

  @Get('listings/master')
  getMaster(@CurrentUser() user: AuthenticatedUser) {
    return this.masterListing.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Patch('listings/master')
  updateMaster(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMasterListingDto,
  ) {
    return this.masterListing.update(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/sync')
  sync(@CurrentUser() user: AuthenticatedUser) {
    return this.listingSync.sync(user.businessId);
  }

  @Get('listings/sync-log')
  syncLog(@CurrentUser() user: AuthenticatedUser) {
    return this.listingSync.listSyncLog(user.businessId);
  }

  @Get('listings/health')
  health(@CurrentUser() user: AuthenticatedUser) {
    return this.listingSync.health(user.businessId);
  }

  @Get('seo/citations')
  citations(@CurrentUser() user: AuthenticatedUser) {
    return this.listingSync.citationAudit(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Get('listings/gmb/accounts')
  listGmbAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.listAccounts(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Get('listings/gmb/locations')
  listGmbLocations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountName') accountName: string,
  ) {
    return this.gmbManagement.listLocations(user.businessId, accountName);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/gmb/location')
  selectGmbLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectGmbLocationDto,
  ) {
    return this.gmbManagement.selectLocation(user.businessId, dto.locationId);
  }

  @Get('listings/gmb/posts')
  listPosts(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.listPosts(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/gmb/posts')
  createPost(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGmbPostDto,
  ) {
    return this.gmbManagement.createPost(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/gmb/posts/:id/publish')
  publishPost(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.gmbManagement.publishPost(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Delete('listings/gmb/posts/:id')
  deletePost(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.gmbManagement.deletePost(user.businessId, id);
  }

  @Get('listings/gmb/photos')
  listPhotos(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.listPhotos(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/gmb/photos')
  addPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGmbPhotoDto,
  ) {
    return this.gmbManagement.addPhoto(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Delete('listings/gmb/photos/:id')
  removePhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.gmbManagement.removePhoto(user.businessId, id);
  }

  @Get('listings/gmb/qna')
  listQna(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.listQna(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/gmb/qna/sync')
  syncQna(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.syncQuestions(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Patch('listings/gmb/qna/:id/answer')
  answerQna(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AnswerGmbQnaDto,
  ) {
    return this.gmbManagement.answerQuestion(user.businessId, id, dto.answer);
  }

  @Get('listings/gmb/insights')
  listInsights(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.listInsights(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LISTINGS_MANAGE)
  @Post('listings/gmb/insights/pull')
  pullInsights(@CurrentUser() user: AuthenticatedUser) {
    return this.gmbManagement.pullInsights(user.businessId);
  }
}
