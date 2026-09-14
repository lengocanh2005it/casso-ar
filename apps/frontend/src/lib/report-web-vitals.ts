import { type Metric, onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

function deliverMetric(metric: Metric): void {
  if (import.meta.env.DEV) {
    console.log('[web-vitals]', metric.name, metric.value, metric.rating);
    return;
  }
  const endpoint = import.meta.env.VITE_WEB_VITALS_ENDPOINT;
  if (!endpoint || !navigator.sendBeacon) return;
  navigator.sendBeacon(
    endpoint,
    JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      page: window.location.pathname,
    }),
  );
}

export function reportWebVitals(): void {
  onCLS(deliverMetric);
  onFCP(deliverMetric);
  onINP(deliverMetric);
  onLCP(deliverMetric);
  onTTFB(deliverMetric);
}
