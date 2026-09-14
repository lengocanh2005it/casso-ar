import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onCLS, onFCP, onINP, onLCP, onTTFB } = vi.hoisted(() => ({
  onCLS: vi.fn(),
  onFCP: vi.fn(),
  onINP: vi.fn(),
  onLCP: vi.fn(),
  onTTFB: vi.fn(),
}));

vi.mock('web-vitals', () => ({ onCLS, onFCP, onINP, onLCP, onTTFB }));

import { reportWebVitals } from './report-web-vitals';

const registries = [onCLS, onFCP, onINP, onLCP, onTTFB];
const noop = () => {};

function fakeMetric(name: string) {
  return { name, value: 0.1, rating: 'good', id: 'v1' };
}

function setVitestEnv(isDev: boolean, endpoint: string) {
  const env = import.meta.env as unknown as Record<string, unknown>;
  env.DEV = isDev;
  env.VITE_WEB_VITALS_ENDPOINT = endpoint;
}

describe('reportWebVitals', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const registry of registries) registry.mockClear();
    beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      value: beacon,
      configurable: true,
      writable: true,
    });
  });

  it('registers a callback for every Core Web Vital', () => {
    reportWebVitals();
    for (const registry of registries) {
      expect(registry).toHaveBeenCalledWith(expect.any(Function));
    }
  });

  it('logs the metric to the console in dev and never sends a beacon', () => {
    setVitestEnv(true, '');
    const log = vi.spyOn(console, 'log').mockImplementation(noop);
    reportWebVitals();

    onCLS.mock.calls[0][0](fakeMetric('CLS'));

    expect(log).toHaveBeenCalledWith('[web-vitals]', 'CLS', 0.1, 'good');
    expect(beacon).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('sends the metric via sendBeacon in prod when an endpoint is configured', () => {
    setVitestEnv(false, 'https://analytics.test/vitals');
    reportWebVitals();

    onLCP.mock.calls[0][0](fakeMetric('LCP'));

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, payload] = beacon.mock.calls[0];
    expect(url).toBe('https://analytics.test/vitals');
    expect(JSON.parse(payload as string)).toMatchObject({
      name: 'LCP',
      value: 0.1,
      rating: 'good',
    });
  });

  it('stays silent in prod when no endpoint is configured', () => {
    setVitestEnv(false, '');
    reportWebVitals();

    expect(() => onINP.mock.calls[0][0](fakeMetric('INP'))).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
  });
});
