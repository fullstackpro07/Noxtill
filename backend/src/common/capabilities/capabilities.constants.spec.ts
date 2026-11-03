import { Role } from '@prisma/client';
import {
  CAPABILITIES,
  SYSTEM_ROLE_CAPABILITIES,
} from './capabilities.constants';

describe('SEO capability defaults', () => {
  it('allows owners and managers to manage SEO, but not staff', () => {
    expect(SYSTEM_ROLE_CAPABILITIES[Role.owner]).toContain(
      CAPABILITIES.SEO_MANAGE,
    );
    expect(SYSTEM_ROLE_CAPABILITIES[Role.manager]).toContain(
      CAPABILITIES.SEO_MANAGE,
    );
    expect(SYSTEM_ROLE_CAPABILITIES[Role.staff]).not.toContain(
      CAPABILITIES.SEO_MANAGE,
    );
  });
});
