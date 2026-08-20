import { createHmac } from 'node:crypto';

const TEST_SIGNATURE_TIMESTAMP = '1734924830020';

function sortPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPayload);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortPayload(record[key])]),
  );
}

export function signCassoWebhookPayload(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const message = `${TEST_SIGNATURE_TIMESTAMP}.${JSON.stringify(sortPayload(payload))}`;
  const digest = createHmac('sha512', secret).update(message).digest('hex');
  return `t=${TEST_SIGNATURE_TIMESTAMP},v1=${digest}`;
}
