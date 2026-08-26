// FE-STORE-PACKING-001 to FE-STORE-PACKING-002 (reorder, #969)
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildPackingItem } from '../../../tests/helpers/factories';
import { useTripStore } from '../tripStore';

beforeEach(() => {
  resetAllStores();
  server.resetHandlers();
});

describe('packingSlice', () => {
  it('FE-STORE-PACKING-001: reorderPackingItems reorders optimistically and reindexes sort_order', async () => {
    const a = buildPackingItem({ id: 1, trip_id: 1, sort_order: 0 });
    const b = buildPackingItem({ id: 2, trip_id: 1, sort_order: 1 });
    seedStore(useTripStore, { packingItems: [a, b] });

    server.use(
      http.put('/api/trips/1/packing/reorder', () =>
        HttpResponse.json({ success: true })
      )
    );
    await useTripStore.getState().reorderPackingItems(1, [2, 1]);
    const items = useTripStore.getState().packingItems;
    expect(items[0].id).toBe(2);
    expect(items[0].sort_order).toBe(0);
    expect(items[1].id).toBe(1);
    expect(items[1].sort_order).toBe(1);
  });

  it('FE-STORE-PACKING-002: reorderPackingItems rolls back to previous order on API error', async () => {
    const a = buildPackingItem({ id: 1, trip_id: 1, sort_order: 0 });
    const b = buildPackingItem({ id: 2, trip_id: 1, sort_order: 1 });
    seedStore(useTripStore, { packingItems: [a, b] });

    server.use(
      http.put('/api/trips/1/packing/reorder', () =>
        HttpResponse.json({ error: 'error' }, { status: 500 })
      )
    );
    await useTripStore.getState().reorderPackingItems(1, [2, 1]);
    // After failure the original order is restored
    const items = useTripStore.getState().packingItems;
    expect(items[0].id).toBe(1);
    expect(items[1].id).toBe(2);
  });
});
