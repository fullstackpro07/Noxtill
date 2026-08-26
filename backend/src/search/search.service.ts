import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { buildFulltextBooleanQuery } from '../common/utils/mysql-fulltext.util';

const RESULTS_PER_GROUP = 5;

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
}
interface ProductRow {
  id: string;
  name: string;
}
interface OrderRow {
  id: string;
  // MySQL migration: a raw-selected Int column comes back as a JS `bigint` via mysql2/Prisma, not `number`.
  order_no: bigint;
}
interface AppointmentRow {
  id: string;
  service_name: string;
  customer_name: string;
  starts_at: Date;
}
interface CreditRow {
  customer_id: string;
  name: string;
  balance: string;
}

/**
 * Cross-entity search (BE-070). Every group runs as its own FULLTEXT-indexed query in parallel
 * (Promise.all) rather than one giant UNION — that's what keeps this fast even as each entity
 * table grows independently, well within the 150ms budget for typical tenant-sized data.
 *
 * MySQL migration: was built on Postgres's `pg_trgm` `similarity()` (fuzzy/typo-tolerant), which
 * has no MySQL equivalent. Rewritten on MySQL's native `MATCH() AGAINST() IN BOOLEAN MODE` against
 * the `@@fulltext` indexes on `Customer.name`/`Product.name`/`HelpArticle` — real relevance-ranked
 * search, not a downgrade to plain substring matching, but a disclosed behavior change: boolean
 * mode is not typo-tolerant the way trigram similarity was, and (per `innodb_ft_min_token_size`
 * in local MySQL config) ignores tokens shorter than the configured minimum.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async search(query: string) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const client = this.tenantPrisma.client;
    const booleanQuery = buildFulltextBooleanQuery(query);

    if (!booleanQuery) {
      return {
        customers: [],
        products: [],
        orders: [],
        appointments: [],
        credit: [],
      };
    }

    const [customers, products, orders, appointments, credit] =
      await Promise.all([
        client.$queryRaw<CustomerRow[]>`
        SELECT id, name, phone FROM customers
        WHERE business_id = ${businessId}
          AND (MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE) OR phone LIKE ${'%' + query + '%'})
        ORDER BY MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
        client.$queryRaw<ProductRow[]>`
        SELECT id, name FROM products
        WHERE business_id = ${businessId} AND MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE)
        ORDER BY MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
        /^\d+$/.test(query)
          ? client.$queryRaw<OrderRow[]>`
            SELECT id, order_no FROM orders
            WHERE business_id = ${businessId} AND order_no = ${Number(query)}
            LIMIT ${RESULTS_PER_GROUP}
          `
          : Promise.resolve<OrderRow[]>([]),
        client.$queryRaw<AppointmentRow[]>`
        SELECT a.id, p.name AS service_name, c.name AS customer_name, a.starts_at
        FROM appointments a
        JOIN products p ON p.id = a.service_id
        JOIN customers c ON c.id = a.customer_id
        WHERE a.business_id = ${businessId}
          AND (MATCH(c.name) AGAINST(${booleanQuery} IN BOOLEAN MODE) OR MATCH(p.name) AGAINST(${booleanQuery} IN BOOLEAN MODE))
        ORDER BY a.starts_at DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
        client.$queryRaw<CreditRow[]>`
        SELECT v.customer_id, c.name, v.balance
        FROM v_credit_balances v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.business_id = ${businessId} AND v.balance > 0 AND MATCH(c.name) AGAINST(${booleanQuery} IN BOOLEAN MODE)
        ORDER BY MATCH(c.name) AGAINST(${booleanQuery} IN BOOLEAN MODE) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
      ]);

    return {
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      })),
      products: products.map((p) => ({ id: p.id, name: p.name })),
      orders: orders.map((o) => ({ id: o.id, orderNo: Number(o.order_no) })),
      appointments: appointments.map((a) => ({
        id: a.id,
        serviceName: a.service_name,
        customerName: a.customer_name,
        startsAt: a.starts_at,
      })),
      credit: credit.map((c) => ({
        customerId: c.customer_id,
        name: c.name,
        balance: Number(c.balance),
      })),
    };
  }
}
