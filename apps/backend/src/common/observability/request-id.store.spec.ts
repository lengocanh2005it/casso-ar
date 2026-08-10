import { RequestIdStore } from './request-id.store';

describe('RequestIdStore', () => {
  it('returns undefined outside of a run() scope', () => {
    const store = new RequestIdStore();
    expect(store.getRequestId()).toBeUndefined();
  });

  it('returns the requestId inside a run() scope', () => {
    const store = new RequestIdStore();
    store.run('req-123', () => {
      expect(store.getRequestId()).toBe('req-123');
    });
  });

  it('isolates concurrent scopes from each other', async () => {
    const store = new RequestIdStore();
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) =>
        store.run('req-a', () => {
          setTimeout(() => {
            results.push(store.getRequestId()!);
            resolve();
          }, 10);
        }),
      ),
      new Promise<void>((resolve) =>
        store.run('req-b', () => {
          setTimeout(() => {
            results.push(store.getRequestId()!);
            resolve();
          }, 5);
        }),
      ),
    ]);

    expect(results.sort()).toEqual(['req-a', 'req-b']);
  });
});
