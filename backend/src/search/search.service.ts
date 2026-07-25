import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';

const RESULTS_PER_GROUP = 5;
const TRIGRAM_SIMILARITY_THRESHOLD = 0.2;

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
  order_no: number;
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
 * Cross-entity search (BE-070). Every group runs as its own trigram-indexed
 * query in parallel (Promise.all) rather than one giant UNION — that's what
 * keeps this fast even as each entity table grows independently, well
 * within the 150ms budget for typical tenant-sized data.
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

    const [customers, products, orders, appointments, credit] =
      await Promise.all([
        client.$queryRaw<CustomerRow[]>`
        SELECT id, name, phone FROM customers
        WHERE business_id = ${businessId} AND (similarity(name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD} OR phone ILIKE ${'%' + query + '%'})
        ORDER BY similarity(name, ${query}) DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
        client.$queryRaw<ProductRow[]>`
        SELECT id, name FROM products
        WHERE business_id = ${businessId} AND similarity(name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD}
        ORDER BY similarity(name, ${query}) DESC
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
        WHERE a.business_id = ${businessId} AND (similarity(c.name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD} OR similarity(p.name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD})
        ORDER BY a.starts_at DESC
        LIMIT ${RESULTS_PER_GROUP}
      `,
        client.$queryRaw<CreditRow[]>`
        SELECT v.customer_id, c.name, v.balance
        FROM v_credit_balances v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.business_id = ${businessId} AND v.balance > 0 AND similarity(c.name, ${query}) > ${TRIGRAM_SIMILARITY_THRESHOLD}
        ORDER BY similarity(c.name, ${query}) DESC
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
      orders: orders.map((o) => ({ id: o.id, orderNo: o.order_no })),
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
