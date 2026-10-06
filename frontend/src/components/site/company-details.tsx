import { COMPANY, COMPANY_ADDRESS_ONE_LINE } from "@/lib/marketing/company-info";

const ROWS: [string, string][] = [
  ["Legal name", COMPANY.legalName],
  ["Entity type", `${COMPANY.entityType} (${COMPANY.state}, United States)`],
  ["ACC Business ID", COMPANY.businessId],
  ["Registered", COMPANY.formedOn],
  ["Management", COMPANY.management],
  ["Duration", COMPANY.duration],
  ["Principal address", COMPANY_ADDRESS_ONE_LINE],
  ["Support", COMPANY.emails.support],
  ["Contact", COMPANY.emails.contact],
  ["General enquiries", COMPANY.emails.info],
  ["Statutory agent", COMPANY.statutoryAgent],
];

export function CompanyDetails() {
  return (
    <section aria-labelledby="company-details-heading" className="mx-auto max-w-3xl px-5 pb-16 sm:px-7">
      <h2 id="company-details-heading" className="mb-4 text-center font-display text-2xl font-bold text-fg">
        Company information
      </h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-[var(--radius-lg)] border border-border bg-white p-6 sm:grid-cols-[170px_1fr]">
        {ROWS.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[13px] font-semibold text-fg-muted">{label}</dt>
            <dd className="text-[13.5px] text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-center text-xs text-fg-faint">
        Registered with the Arizona Corporation Commission. Verification of formation issued September 4, 2026.
      </p>
    </section>
  );
}
