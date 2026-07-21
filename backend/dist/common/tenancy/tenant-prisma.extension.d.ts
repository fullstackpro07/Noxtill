import { ClsService } from 'nestjs-cls';
export declare function tenantScopingExtension(cls: ClsService): (client: any) => {
    $extends: {
        extArgs: import("generated/prisma/runtime/library").InternalArgs<unknown, unknown, {}, unknown>;
    };
};
