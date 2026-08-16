import { Test, TestingModule } from '@nestjs/testing';
import { WidgetsController } from './widgets.controller';
import { WidgetsService } from './widgets.service';

describe('WidgetsController', () => {
  let controller: WidgetsController;
  let service: { listRegistry: jest.Mock; getWidgetData: jest.Mock };

  beforeEach(async () => {
    service = { listRegistry: jest.fn(), getWidgetData: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WidgetsController],
      providers: [{ provide: WidgetsService, useValue: service }],
    }).compile();

    controller = module.get<WidgetsController>(WidgetsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('passes no days through when the query param is absent', () => {
    void controller.data('revenue_today');
    expect(service.getWidgetData).toHaveBeenCalledWith(
      'revenue_today',
      undefined,
    );
  });

  it('parses a numeric days query param before delegating', () => {
    void controller.data('new_customers_month', '30');
    expect(service.getWidgetData).toHaveBeenCalledWith(
      'new_customers_month',
      30,
    );
  });

  it('passes garbage days values through as NaN, leaving validation to the service', () => {
    void controller.data('new_customers_month', 'not-a-number');
    const [, days] = service.getWidgetData.mock.calls[0] as [string, number];
    expect(Number.isNaN(days)).toBe(true);
  });
});
