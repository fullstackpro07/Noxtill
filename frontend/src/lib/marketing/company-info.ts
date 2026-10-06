/**
 * Official business details — source: Arizona Corporation Commission, Articles of
 * Organization / Verification of Formation filed 09/04/2026 (d:\Noxtil\docs\Articles of Organization.pdf).
 */
export const COMPANY = {
  legalName: "Noxtill LLC",
  brand: "Noxtill",
  entityType: "Domestic Limited Liability Company",
  state: "Arizona",
  businessId: "25117457",
  filingNumber: "09042603350545",
  formedOn: "September 4, 2026",
  management: "Member Managed",
  duration: "Perpetual",
  address: {
    line1: "4539 N 22nd St Ste R",
    city: "Phoenix",
    region: "AZ",
    postalCode: "85016",
    county: "Maricopa",
    country: "United States",
  },
  emails: { support: "support@noxtill.com", contact: "contact@noxtill.com", info: "info@noxtill.com" },
  statutoryAgent: "Registered Agents Inc",
} as const;

export const COMPANY_ADDRESS_ONE_LINE = `${COMPANY.address.line1}, ${COMPANY.address.city}, ${COMPANY.address.region} ${COMPANY.address.postalCode}, ${COMPANY.address.country}`;
