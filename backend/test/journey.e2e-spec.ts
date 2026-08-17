import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MESSAGES_QUEUE } from '../src/messaging/messaging.constants';
import { closeApp } from './close-app.util';

/**
 * INT-015 — the real core journey the project plan's final acceptance criterion names:
 * signup -> onboarding (business type / product setup) -> first sale -> nightly close ->
 * review-request. Runs against a real Nest app + real Postgres.
 *
 * `MESSAGES_QUEUE.add` is spied on (not `.overrideProvider`-replaced) so it never actually
 * touches Redis — replacing the whole Queue provider before `compile()` was tried first and
 * broke `app.init()` with "Worker requires a connection": `@nestjs/bullmq`'s auto-discovered
 * Worker for `message-worker.processor.ts` reads its connection config off the real Queue
 * instance's own `.opts`, which a bare `{add: jest.fn()}}` replacement doesn't have. Letting the
 * real Queue construct (lazy, non-blocking ioredis connection, same as every other queue this
 * whole session) and spying on `.add` afterwards keeps that metadata intact.
 */
describe('Core journey (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let messagesQueueAddSpy: jest.SpiedFunction<Queue['add']>;

  const email = `journey-e2e-${Date.now()}@example.com`;
  const password = 'TestPass123!';
  let accessToken: string;
  let businessId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);

    const messagesQueue = app.get<Queue>(getQueueToken(MESSAGES_QUEUE));
    messagesQueueAddSpy = jest
      .spyOn(messagesQueue, 'add')
      .mockResolvedValue({ id: 'fake-job' } as never);
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.order
        .findMany({ where: { businessId }, select: { id: true } })
        .then((orders) =>
          Promise.all([
            prisma.orderItem.deleteMany({
              where: { orderId: { in: orders.map((o) => o.id) } },
            }),
            prisma.payment.deleteMany({
              where: { orderId: { in: orders.map((o) => o.id) } },
            }),
          ]),
        );
      await prisma.reviewRequest.deleteMany({ where: { businessId } });
      await prisma.order.deleteMany({ where: { businessId } });
      await prisma.stockMovement.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({ where: { businessId } });
      await prisma.businessUser.deleteMany({ where: { businessId } });
      await prisma.business
        .delete({ where: { id: businessId } })
        .catch(() => undefined);
    }
    await closeApp(app);
  }, 10_000);

  it('signup: creates a real business + owner + tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        businessName: `Journey E2E Biz ${Date.now()}`,
        name: 'Journey Owner',
        email,
        password,
      })
      .expect(201);

    const signup = res.body as {
      accessToken: string;
      business: { id: string };
    };
    expect(signup.accessToken).toBeDefined();
    expect(signup.business.id).toBeDefined();
    accessToken = signup.accessToken;
    businessId = signup.business.id;
  });

  let productId: string;

  it('onboarding: creates a real sellable product', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        kind: 'product',
        name: 'Journey Test Widget',
        sellingPrice: 25,
        costPrice: 10,
        stockQty: 10,
      })
      .expect(201);

    const product = res.body as { id: string };
    expect(product.id).toBeDefined();
    productId = product.id;
  });

  let orderId: string;

  it('first sale: completes a real sale, creating an order and a review request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        customerName: 'Journey Test Customer',
        customerPhone: '+14155550188',
        items: [{ productId, qty: 1 }],
        payment: { method: 'cash' },
      })
      .expect(201);

    const sale = res.body as { id: string; status: string };
    expect(sale.id).toBeDefined();
    expect(sale.status).toBe('completed');
    orderId = sale.id;

    // The queue call is best-effort/non-transactional in the real code path — give it a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(messagesQueueAddSpy).toHaveBeenCalled();
  });

  it("nightly close: today's real sale appears in the day aggregate", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/day/${today}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const day = res.body as { ordersCount: number; revenue: number };
    expect(day.ordersCount).toBeGreaterThanOrEqual(1);
    expect(day.revenue).toBeGreaterThanOrEqual(25);
  });

  it('review request: a real ReviewRequest row was created for the completed sale', async () => {
    const reviewRequest = await prisma.reviewRequest.findFirst({
      where: { businessId, sourceId: orderId, source: 'order' },
    });
    expect(reviewRequest).not.toBeNull();
    expect(reviewRequest?.token).toHaveLength(32);
  });
});
