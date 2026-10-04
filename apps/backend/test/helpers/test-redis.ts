import { GenericContainer, type StartedTestContainer } from 'testcontainers';

/**
 * Starts a Redis container dedicated to one e2e spec and points the app's
 * REDIS_HOST/REDIS_PORT at it.
 *
 * Never point a spec at a Redis on `localhost`: that is the developer's own
 * instance, shared with a running dev backend. Its BullMQ workers compete for
 * the same queue, so a job enqueued by the test can be consumed by the dev
 * backend instead of the in-test app — the test then waits forever for a
 * side effect that ran somewhere else.
 */
export async function startTestRedis(): Promise<StartedTestContainer> {
  const redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  return redis;
}
