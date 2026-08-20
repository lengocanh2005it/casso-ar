import { createHmac } from 'node:crypto';
import { equalsConstantTime } from '../../../common/security/constant-time-compare';

interface VerifyCassoWebhookSignatureInput {
  payload: Record<string, unknown>;
  signatureHeader: string;
  secret: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortByKey(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortByKey);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortByKey(value[key])]),
  );
}

export function verifyCassoWebhookSignature({
  payload,
  signatureHeader,
  secret,
}: VerifyCassoWebhookSignatureInput): boolean {
  const match = /^t=(\d+),v1=([a-f0-9]+)$/.exec(signatureHeader);
  if (!match) return false;

  const timestamp = match[1];
  const receivedSignature = match[2];
  const serializedPayload = JSON.stringify(sortByKey(payload));
  const message = `${timestamp}.${serializedPayload}`;
  const expectedSignature = createHmac('sha512', secret)
    .update(message)
    .digest('hex');

  return equalsConstantTime(receivedSignature, expectedSignature);
}
