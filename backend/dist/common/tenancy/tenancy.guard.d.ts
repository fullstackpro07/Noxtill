import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
export declare class TenancyGuard implements CanActivate {
    private readonly cls;
    constructor(cls: ClsService);
    canActivate(context: ExecutionContext): boolean;
}
