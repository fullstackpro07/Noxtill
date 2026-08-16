import { Capability } from '../capabilities/capabilities.constants';
export declare const CAPABILITY_KEY = "capability";
export declare const RequireCapability: (capability: Capability) => import("@nestjs/common").CustomDecorator<string>;
