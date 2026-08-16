import { SetMetadata } from '@nestjs/common';
import { Capability } from '../capabilities/capabilities.constants';

export const CAPABILITY_KEY = 'capability';

/** Restricts a route to callers whose resolved capability set includes this one (UPD-BE-035). Owner always has every capability — see `SYSTEM_ROLE_CAPABILITIES`. */
export const RequireCapability = (capability: Capability) =>
  SetMetadata(CAPABILITY_KEY, capability);
