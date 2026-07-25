import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { WidgetCategory } from './widgets.constants';
export interface WidgetContext {
    businessId: string;
    tenantPrisma: TenantPrismaService;
}
export interface WidgetDefinition {
    key: string;
    title: string;
    category: WidgetCategory;
    resolve(ctx: WidgetContext): Promise<unknown>;
}
export declare const WIDGET_REGISTRY: WidgetDefinition[];
export declare function findWidget(key: string): WidgetDefinition | undefined;
