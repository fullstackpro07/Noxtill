import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { WebsiteBuilderService } from './website-builder.service';
import { WebsiteDomainsService } from './website-domains.service';
import { WebsiteFormsService } from './website-forms.service';
import { WebsiteOverviewService } from './website-overview.service';
import { WebsiteStorefrontService } from './website-storefront.service';
import { WebsiteService } from './website.service';
import {
  BuilderDto,
  BulkVisibilityDto,
  CollectionDto,
  CreatePageDto,
  DomainDto,
  FormDto,
  ListPagesDto,
  MaintenanceDto,
  OverviewQueryDto,
  PageDto,
  ProductSettingDto,
  PublishSiteDto,
  RedirectDto,
  RestoreVersionDto,
  SchedulePageDto,
  StorefrontOptionsDto,
  TestFormDto,
} from './website.dto';

const MANAGE = CAPABILITIES.WEBSITE_MANAGE;

@Controller('website')
export class WebsiteController {
  constructor(
    private readonly website: WebsiteService,
    private readonly overviewService: WebsiteOverviewService,
    private readonly forms: WebsiteFormsService,
    private readonly domains: WebsiteDomainsService,
    private readonly storefront: WebsiteStorefrontService,
    private readonly builder: WebsiteBuilderService,
  ) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OverviewQueryDto,
  ) {
    return this.overviewService.overview(user.businessId, query.days ?? 30);
  }

  // Pages, landing pages and blog posts -------------------------------------------------------

  @Get('pages')
  listPages(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPagesDto,
  ) {
    return this.website.listPages(user.businessId, query.kind);
  }

  @Get('pages/:id')
  getPage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.website.getPage(user.businessId, id);
  }

  @RequireCapability(MANAGE)
  @Post('pages')
  createPage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePageDto,
  ) {
    const { kind, ...input } = dto;
    return this.website.createPage(user.businessId, user.sub, kind, input);
  }

  @RequireCapability(MANAGE)
  @Patch('pages/:id')
  updatePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PageDto,
  ) {
    return this.website.updatePage(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(MANAGE)
  @Post('pages/:id/duplicate')
  duplicatePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.website.duplicatePage(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Delete('pages/:id')
  deletePage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.website.deletePage(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('pages/:id/restore')
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RestoreVersionDto,
  ) {
    return this.website.restoreVersion(
      user.businessId,
      user.sub,
      id,
      dto.version,
    );
  }

  @RequireCapability(MANAGE)
  @Post('pages/:id/publish')
  publishPage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.website.publishPage(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('pages/:id/unpublish')
  unpublishPage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.website.unpublishPage(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('pages/:id/schedule')
  schedulePage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SchedulePageDto,
  ) {
    return this.website.schedulePage(
      user.businessId,
      user.sub,
      id,
      dto.publishAt ?? null,
    );
  }

  // Navigation, theme, settings, publishing --------------------------------------------------

  @Get('navigation')
  navigation(@CurrentUser() user: AuthenticatedUser) {
    return this.website.getNavigation(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Put('navigation')
  saveNavigation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.website.saveNavigation(user.businessId, user.sub, body);
  }

  @Get('theme')
  theme(@CurrentUser() user: AuthenticatedUser) {
    return this.website.getTheme(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Put('theme')
  saveTheme(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.website.saveTheme(user.businessId, user.sub, body);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.website.getSettings(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Patch('settings')
  saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.website.saveSettings(user.businessId, user.sub, body);
  }

  @RequireCapability(MANAGE)
  @Post('maintenance')
  maintenance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MaintenanceDto,
  ) {
    return this.website.setMaintenance(user.businessId, user.sub, dto.enabled);
  }

  @Get('pending-changes')
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.website.pendingChanges(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Post('publish')
  publishSite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PublishSiteDto,
  ) {
    const parts =
      dto.navigation === undefined &&
      dto.theme === undefined &&
      dto.settings === undefined
        ? { navigation: true, theme: true, settings: true }
        : dto;
    return this.website.publishSite(user.businessId, user.sub, parts);
  }

  @Get('deployments')
  deployments(@CurrentUser() user: AuthenticatedUser) {
    return this.website.listDeployments(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Post('deployments/:id/rollback')
  rollback(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.website.rollback(user.businessId, user.sub, id);
  }

  // Domains & redirects ----------------------------------------------------------------------

  @Get('domains')
  domainsOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.domains.overview(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Post('domains')
  addDomain(@CurrentUser() user: AuthenticatedUser, @Body() dto: DomainDto) {
    return this.domains.add(user.businessId, user.sub, dto.hostname);
  }

  @RequireCapability(MANAGE)
  @Post('domains/:id/verify')
  verifyDomain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.domains.verify(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('domains/:id/primary')
  primaryDomain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.domains.setPrimary(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Delete('domains/:id')
  removeDomain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.domains.remove(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('redirects')
  addRedirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RedirectDto,
  ) {
    return this.domains.addRedirect(user.businessId, user.sub, dto);
  }

  @RequireCapability(MANAGE)
  @Delete('redirects/:id')
  removeRedirect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.domains.removeRedirect(user.businessId, user.sub, id);
  }

  // Forms ------------------------------------------------------------------------------------

  @Get('forms')
  listForms(@CurrentUser() user: AuthenticatedUser) {
    return this.forms.list(user.businessId);
  }

  @Get('forms/:id/submissions')
  submissions(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.forms.submissions(user.businessId, id);
  }

  @RequireCapability(MANAGE)
  @Post('forms')
  createForm(@CurrentUser() user: AuthenticatedUser, @Body() dto: FormDto) {
    return this.forms.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(MANAGE)
  @Patch('forms/:id')
  updateForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FormDto,
  ) {
    return this.forms.update(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(MANAGE)
  @Post('forms/:id/duplicate')
  duplicateForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.forms.duplicate(user.businessId, user.sub, id);
  }

  @RequireCapability(MANAGE)
  @Post('forms/:id/test')
  testForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TestFormDto,
  ) {
    return this.forms.test(
      user.businessId,
      user.sub,
      id,
      dto.values,
      dto.marketingConsent === true,
    );
  }

  // Storefront -------------------------------------------------------------------------------

  @Get('storefront')
  storefrontOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.storefront.overview(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Patch('storefront/options')
  storefrontOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StorefrontOptionsDto,
  ) {
    return this.storefront.saveOptions(user.businessId, user.sub, dto);
  }

  @RequireCapability(MANAGE)
  @Patch('storefront/products/:productId')
  storefrontProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: ProductSettingDto,
  ) {
    return this.storefront.updateProduct(
      user.businessId,
      user.sub,
      productId,
      dto,
    );
  }

  @RequireCapability(MANAGE)
  @Post('storefront/visibility')
  bulkVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkVisibilityDto,
  ) {
    return this.storefront.bulkVisibility(
      user.businessId,
      user.sub,
      dto.productIds,
      dto.visible,
    );
  }

  @RequireCapability(MANAGE)
  @Post('storefront/collections')
  createCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CollectionDto,
  ) {
    return this.storefront.saveCollection(user.businessId, user.sub, null, dto);
  }

  @RequireCapability(MANAGE)
  @Patch('storefront/collections/:id')
  updateCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CollectionDto,
  ) {
    return this.storefront.saveCollection(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(MANAGE)
  @Delete('storefront/collections/:id')
  deleteCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.storefront.deleteCollection(user.businessId, user.sub, id);
  }

  // AI Website Builder -----------------------------------------------------------------------

  @Get('builder')
  builderStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.builder.status(user.businessId);
  }

  @RequireCapability(MANAGE)
  @Post('builder/generate')
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: BuilderDto) {
    return this.builder.generate(user.businessId, user.sub, dto);
  }
}
