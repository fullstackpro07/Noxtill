import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { RoutingService, RouteStop } from './routing.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RoutingService (UPD-BE-066)', () => {
  afterEach(() => {
    mockedAxios.get.mockReset();
  });

  describe('haversineKm()', () => {
    it('computes a real, known great-circle distance (NYC to LA, ~3936km)', () => {
      const service = new RoutingService(new ConfigService({}));
      const nyc = { lat: 40.7128, lng: -74.006 };
      const la = { lat: 34.0522, lng: -118.2437 };
      const km = service.haversineKm(nyc, la);
      expect(km).toBeGreaterThan(3900);
      expect(km).toBeLessThan(4000);
    });

    it('is 0 for the same point', () => {
      const service = new RoutingService(new ConfigService({}));
      const point = { lat: 10, lng: 20 };
      expect(service.haversineKm(point, point)).toBe(0);
    });
  });

  describe('optimiseOrder() without a maps provider configured', () => {
    it('greedily orders real stops nearest-neighbour by straight-line distance', async () => {
      const service = new RoutingService(new ConfigService({}));
      const origin = { lat: 0, lng: 0 };
      // Stops placed at increasing distance from origin along the same line — far, near, mid.
      const far: RouteStop = { deliveryId: 'far', lat: 0, lng: 3 };
      const near: RouteStop = { deliveryId: 'near', lat: 0, lng: 1 };
      const mid: RouteStop = { deliveryId: 'mid', lat: 0, lng: 2 };

      const ordered = await service.optimiseOrder(origin, [far, near, mid]);
      expect(ordered.map((s) => s.deliveryId)).toEqual(['near', 'mid', 'far']);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('returns an empty array for no stops', async () => {
      const service = new RoutingService(new ConfigService({}));
      const ordered = await service.optimiseOrder({ lat: 0, lng: 0 }, []);
      expect(ordered).toEqual([]);
    });
  });

  describe('optimiseOrder() with a real maps provider configured', () => {
    it('uses real road-distance from the Distance Matrix API to choose order', async () => {
      const service = new RoutingService(
        new ConfigService({ MAPS_PROVIDER_API_KEY: 'test-key' }),
      );
      // Road distance inverts the straight-line intuition: "near" is actually farther by road.
      mockedAxios.get.mockResolvedValue({
        data: {
          rows: [
            {
              elements: [
                { status: 'OK', distance: { value: 9000 } }, // near -> 9km by road
                { status: 'OK', distance: { value: 1000 } }, // far -> 1km by road
              ],
            },
          ],
        },
      });

      const near: RouteStop = { deliveryId: 'near', lat: 0, lng: 1 };
      const far: RouteStop = { deliveryId: 'far', lat: 0, lng: 3 };
      const ordered = await service.optimiseOrder({ lat: 0, lng: 0 }, [
        near,
        far,
      ]);

      expect(ordered[0].deliveryId).toBe('far'); // shorter real road distance wins
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const [url, config] = mockedAxios.get.mock.calls[0];
      expect(url).toBe(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
      );
      expect((config?.params as { key: string }).key).toBe('test-key');
    });

    it('falls back to straight-line distance if the provider call fails', async () => {
      const service = new RoutingService(
        new ConfigService({ MAPS_PROVIDER_API_KEY: 'test-key' }),
      );
      mockedAxios.get.mockRejectedValue(new Error('provider unreachable'));

      const near: RouteStop = { deliveryId: 'near', lat: 0, lng: 1 };
      const far: RouteStop = { deliveryId: 'far', lat: 0, lng: 3 };
      const ordered = await service.optimiseOrder({ lat: 0, lng: 0 }, [
        near,
        far,
      ]);

      expect(ordered[0].deliveryId).toBe('near'); // real haversine fallback
    });
  });
});
