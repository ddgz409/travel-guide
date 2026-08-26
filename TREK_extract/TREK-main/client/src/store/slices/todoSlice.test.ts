// FE-STORE-TODO-001 to FE-STORE-TODO-002 (reorder, #969)
import { http, HttpResponse } from 'msw';
import { server } from '../../../tests/helpers/msw/server';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { buildTodoItem } from '../../../tests/helpers/factories';
import { useTripStore } from '../tripStore';

beforeEach(() => {
  resetAllStores();
  server.resetHandlers();
});

describe('todoSlice', () => {
  it('FE-STORE-TODO-001: reorderTodoItems reorders optimistically and reindexes sort_order', async () => {
    const a = buildTodoItem({ id: 1, trip_id: 1, sort_order: 0 });
    const b = buildTodoItem({ id: 2, trip_id: 1, sort_order: 1 });
    seedStore(useTripStore, { todoItems: [a, b] });

    server.use(
      http.put('/api/trips/1/todo/reorder', () =>
        HttpResponse.json({ success: true })
      )
    );
    await useTripStore.getState().reorderTodoItems(1, [2, 1]);
    const items = useTripStore.getState().todoItems;
    expect(items[0].id).toBe(2);
    expect(items[0].sort_order).toBe(0);
    expect(items[1].id).toBe(1);
    expect(items[1].sort_order).toBe(1);
  });

  it('FE-STORE-TODO-002: reorderTodoItems rolls back to previous order on API error', async () => {
    const a = buildTodoItem({ id: 1, trip_id: 1, sort_order: 0 });
    const b = buildTodoItem({ id: 2, trip_id: 1, sort_order: 1 });
    seedStore(useTripStore, { todoItems: [a, b] });

    server.use(
      http.put('/api/trips/1/todo/reorder', () =>
        HttpResponse.json({ error: 'error' }, { status: 500 })
      )
    );
    await useTripStore.getState().reorderTodoItems(1, [2, 1]);
    // After failure the original order is restored
    const items = useTripStore.getState().todoItems;
    expect(items[0].id).toBe(1);
    expect(items[1].id).toBe(2);
  });
});
