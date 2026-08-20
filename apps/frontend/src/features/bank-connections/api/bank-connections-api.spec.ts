import { describe, expect, it, vi } from 'vitest';
import { connectCassoFlow } from './bank-connections-api';

const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

describe('connectCassoFlow', () => {
  it('posts to the bank-connections casso-flow connect endpoint', async () => {
    postWithIdempotency.mockResolvedValue({ id: 'connection-1' });

    await expect(connectCassoFlow({ apiKey: 'test-key' })).resolves.toEqual({
      id: 'connection-1',
    });

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/bank-connections/casso-flow/connect',
      { apiKey: 'test-key' },
    );
  });
});
