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

describe('specialist agent capability defaults', () => {
  it('allows owners and managers to run specialist reviews but not staff', () => {
    const capabilities = [
      CAPABILITIES.CUSTOMER_AGENT_RUN,
      CAPABILITIES.SEO_AGENT_RUN,
      CAPABILITIES.COMMERCE_AGENT_RUN,
      CAPABILITIES.INVENTORY_AGENT_RUN,
      CAPABILITIES.FINANCE_AGENT_RUN,
    ];
    for (const capability of capabilities) {
      expect(SYSTEM_ROLE_CAPABILITIES[Role.owner]).toContain(capability);
      expect(SYSTEM_ROLE_CAPABILITIES[Role.manager]).toContain(capability);
      expect(SYSTEM_ROLE_CAPABILITIES[Role.staff]).not.toContain(capability);
    }
  });
});
