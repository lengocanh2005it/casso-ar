# PayOS API/Webhook Contract — research for #152 (PayOS payment integration for plan changes)

> Note: `docs/superpowers/research/` did not previously exist in this repo. This file
> establishes the convention: `docs/superpowers/research/YYYY-MM-DD-<topic>.md`.

Date: 2026-08-13
Scope: PayOS ("payOS") payment-link creation, webhook payload, signature verification,
retry/idempotency, and payment status enum — for wiring plan-change payments (issue #152).

Primary sources used:
- Official docs: https://payos.vn/docs/api/ (and sub-pages linked below)
- Official Node.js SDK source (payOSHQ org, MIT-licensed, canonical reference implementation):
  https://github.com/payOSHQ/payos-lib-node

---

## 1. Payment-initiation endpoint (create payment link)

**Endpoint:** `POST https://api-merchant.payos.vn/v2/payment-requests`
Source: [payOS API docs](https://payos.vn/docs/api/), corroborated by
[`payos-lib-node` payment-requests.ts](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/v2/payment-requests/payment-requests.ts)
(`this._client.post(... '/v2/payment-requests' ...)`).

**Auth headers** ([payOS API docs](https://payos.vn/docs/api/)):
- `x-client-id` (required)
- `x-api-key` (required)
- `x-partner-code` (optional, partner-program participants only)

**Request body** — `CreatePaymentLinkRequest` type, straight from the SDK source
([payment-requests.ts](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/v2/payment-requests/payment-requests.ts)):

```ts
export type CreatePaymentLinkRequest = {
  orderCode: number;        // required — merchant-assigned order identifier
  amount: number;           // required — VND, integer
  description: string;      // required — max ~25 chars if the buyer's bank isn't linked via payOS
  cancelUrl: string;        // required
  returnUrl: string;        // required
  signature?: string;       // HMAC-SHA256, see §3
  items?: PaymentLinkItem[];
  buyerName?: string;
  buyerCompanyName?: string;
  buyerTaxCode?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  invoice?: InvoiceRequest;
  expiredAt?: number;       // Unix timestamp (seconds)
};
```

**Response** — `CreatePaymentLinkResponse`:

```ts
export type CreatePaymentLinkResponse = {
  bin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  description: string;
  orderCode: number;
  currency: string;
  paymentLinkId: string;
  status: PaymentLinkStatus;   // see §5
  expiredAt?: number;
  checkoutUrl: string;
  qrCode: string;
};
```

Full API envelope per [payOS API docs](https://payos.vn/docs/api/):
`{ code, desc, data: <above>, signature }`.

**Identifiers you can attach / thread through:**
- `orderCode` (number) — the only field PayOS treats as *the* merchant identifier; it is
  echoed back on the payment link, the `GET`/cancel calls, and the webhook payload. It is a
  **number**, not a free-text string, and per [payOS API docs](https://payos.vn/docs/api/) it
  is also one of the five fields hashed into the request `signature` — so it cannot silently
  carry a composite string like `orgId:plan` without also changing what gets signed.
- `description` (string, tightly length-limited — see above) — free text, but too short to
  reliably carry an org ID + target plan.
- No dedicated `metadata` field exists in `CreatePaymentLinkRequest`. **Practical implication
  for #152:** encode `organizationId` + `targetPlan` as a lookup key against an
  `orderCode` you generate and persist server-side (e.g. an internal `PlanUpgradeOrder` row
  keyed by an integer `orderCode`), rather than trying to smuggle it through a PayOS field.

Related endpoints (from [payOS API docs](https://payos.vn/docs/api/), confirmed in SDK source):
- `GET /v2/payment-requests/{id}` — retrieve by `paymentLinkId` **or** `orderCode`
  ([get() overloads in payment-requests.ts](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/v2/payment-requests/payment-requests.ts))
- `POST /v2/payment-requests/{id}/cancel`
- `POST /confirm-webhook` — registers/validates a webhook URL (see §4)

---

## 2. Webhook payload shape

PayOS POSTs one JSON body per payment event to the merchant's registered webhook URL.
Source: [payOS docs — Webhook thông tin thanh toán](https://payos.vn/docs/du-lieu-tra-ve/webhook/),
field types confirmed against the SDK's `Webhook`/`WebhookData` types in
[`webhooks/webhook.ts`](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/webhooks/webhook.ts):

```ts
export type Webhook = {
  code: string;
  desc: string;
  success: boolean;
  data: WebhookData;
  signature: string;
};

export type WebhookData = {
  orderCode: number;
  amount: number;
  description: string;
  accountNumber: string;
  reference: string;               // bank transaction reference
  transactionDateTime: string;
  currency: string;
  paymentLinkId: string;
  code: string;
  desc: string;
  counterAccountBankId?: string | null;
  counterAccountBankName?: string | null;
  counterAccountName?: string | null;
  counterAccountNumber?: string | null;
  virtualAccountName?: string | null;
  virtualAccountNumber?: string | null;
};
```

There is **no explicit "event type" field** distinct from the top-level `code`/`desc` pair —
a successful payment notification carries `code: "00"`, `desc: "success"` at both the
envelope and `data` level, per [payOS webhook docs](https://payos.vn/docs/du-lieu-tra-ve/webhook/).
The docs page did not surface a full worked JSON example of a failed/cancelled webhook body
during this pass (see Gaps, below).

---

## 3. Signature verification

**Algorithm:** HMAC-SHA256, keyed by the merchant's "Checksum Key" (generated per payment
channel on my.payos.vn, distinct from the `x-api-key`).
Source: [payOS docs — Kiểm tra dữ liệu với signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/),
confirmed in [`crypto/node-crypto.ts`](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/crypto/node-crypto.ts).

**How the base string is built** (webhook case — `createSignatureFromObj`, used by
`Webhooks.verify()` in [`webhooks/webhook.ts`](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/webhooks/webhook.ts)):
1. Take the `data` object from the webhook body.
2. Sort its keys alphabetically.
3. Join as a query string: `key1=value1&key2=value2...` (null/undefined → empty string;
   nested arrays/objects JSON-stringified).
4. `HMAC-SHA256(sortedQueryString, checksumKey)` → hex digest.

For the **payment-link creation request** specifically, the base string is a fixed 5-field
concatenation rather than the generic sorted-object algorithm (`createSignatureOfPaymentRequest`
in [node-crypto.ts](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/crypto/node-crypto.ts)):

```
amount=$amount&cancelUrl=$cancelUrl&description=$description&orderCode=$orderCode&returnUrl=$returnUrl
```

**Where the signature lives:** in the JSON body itself, as a top-level `signature` field —
**not** an HTTP header. (Confirmed by the `Webhook` type above, and by the response envelope
in §1: `{ code, desc, data, signature }`.)

**Constant-time comparison:** the prose in
[payOS docs — Kiểm tra dữ liệu với signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/)
states "Always use constant-time string comparison when comparing signatures to prevent
timing attacks" — but the **official Node SDK's own `Webhooks.verify()` does not follow that
advice**: it does a plain strict-inequality check,
`if (!signedSignature || signedSignature !== signature) throw ...`
([webhook.ts](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/webhooks/webhook.ts)).
This repo's own AGENTS.md already mandates constant-time comparison for webhook auth — do
**not** copy the SDK's `!==` pattern; use `crypto.timingSafeEqual` (Node) over the two
HMAC digests ourselves.

---

## 4. Idempotency and retries

**Webhook delivery guarantees:** the only statement found in
[payOS docs — Webhook thông tin thanh toán](https://payos.vn/docs/du-lieu-tra-ve/webhook/) /
[tich-hop-webhook](https://payos.vn/docs/tich-hop-webhook/) is that the merchant endpoint
must **"respond with a 2XX status code to confirm the webhook was received successfully"**
(`Phản hồi trạng thái mã 2XX để xác nhận webhook gửi thành công`). The docs pages reachable
in this pass did **not** state a retry count, backoff schedule, or an explicit "at-least-once"
guarantee for webhook redelivery — see Gaps.

**Webhook URL registration/validation:** `POST /confirm-webhook` with `{ webhookUrl }`
— PayOS sends a test request to the URL before registering it
([webhook.ts `confirm()`](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/webhooks/webhook.ts)).

**Idempotency key:** PayOS's `x-idempotency-key` header is documented for the **payout**
API family (`POST /v1/payouts`, `/v1/payouts/batch`) per [payOS API docs](https://payos.vn/docs/api/)
— error message quoted there: *"Idempotency key đã tồn tại"* (idempotency key already
exists) — but this is a client-supplied header for outbound payout *requests*, not a
PayOS-issued webhook event ID. **No dedicated webhook event/delivery ID field exists** in
`WebhookData` (§2) to dedupe repeated webhook deliveries on.

**Practical dedupe key for #152:** use `data.orderCode` (+ `data.reference`, the bank
transaction reference, when present) as the natural dedupe key on our side, since PayOS
gives no separate delivery ID — and treat webhook processing as idempotent regardless
(safe to process the same `orderCode`/`PAID` transition twice).

**SDK-level retries:** the Node SDK retries its own **outbound** HTTP calls to the PayOS
API (not webhook deliveries *from* PayOS) — `maxRetries` defaults to 3, exponential backoff
(`initRetryDelay = 0.5s`, `maxRetryDelay = 10s`, doubling), honoring a `Retry-After` response
header when present
([client.ts](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/client.ts),
lines implementing `retryRequest`/`shouldRetryRequest`). This is unrelated to whether PayOS
retries webhook *delivery* to us — don't conflate the two.

---

## 5. Payment status values

Authoritative enum, from the SDK's type definitions
([`payment-requests.ts`](https://raw.githubusercontent.com/payOSHQ/payos-lib-node/main/src/resources/v2/payment-requests/payment-requests.ts)),
which is more complete than what the prose docs surfaced:

```ts
export type PaymentLinkStatus =
  | 'PENDING'      // link created, awaiting payment
  | 'PROCESSING'   // a matching transaction was seen, still settling
  | 'PAID'         // fully paid
  | 'UNDERPAID'    // a transaction arrived but for less than `amount`
  | 'CANCELLED'    // merchant or buyer cancelled the link
  | 'EXPIRED'      // `expiredAt` passed without full payment
  | 'FAILED';
```

This status lives on the `CreatePaymentLinkResponse` and on `PaymentLink` (the `GET`
response), **not** as a distinct field inside the webhook `WebhookData` payload (§2) — the
webhook body's own `code`/`desc` pair (`"00"`/`"success"` for a successful payment, per
[payOS webhook docs](https://payos.vn/docs/du-lieu-tra-ve/webhook/)) is what signals the
event outcome; correlating it to a `PaymentLinkStatus` transition requires either trusting
`code === "00"` ⇒ `PAID`, or calling `GET /v2/payment-requests/{id}` to fetch the
authoritative status after receiving a webhook.

`PaymentLink` (the `GET`-by-id/orderCode response type) additionally exposes `amountPaid`
and `amountRemaining`, useful for confirming `UNDERPAID` vs `PAID` without re-deriving it
from the raw transaction list.

---

## Open questions / gaps (for the #152 grilling session)

1. **Webhook retry/backoff schedule is not documented.** The docs only say "respond 2XX to
   confirm receipt" ([payOS docs](https://payos.vn/docs/du-lieu-tra-ve/webhook/)) — no stated
   retry count, interval, or maximum redelivery window was found in the pages reached during
   this pass. Need to either find an undiscovered docs page, ask PayOS support directly, or
   design defensively (assume *at most* a few retries, no documented upper bound) before
   relying on "PayOS will keep retrying until we ack."
2. **No distinct webhook event for FAILED/EXPIRED/CANCELLED was located with an example
   payload.** The only worked example in the reachable docs was the successful-payment case
   (`code: "00"`). Whether PayOS pushes a webhook at all for `EXPIRED`/`CANCELLED`/`FAILED`
   transitions, or whether those are only observable by polling `GET /v2/payment-requests/{id}`,
   is unconfirmed — this directly affects whether we can react to a failed plan-change
   payment in real time or need a polling/expiry sweep.
3. **No webhook delivery/event ID.** Confirmed absent from `WebhookData` (§2) — dedupe must
   use `orderCode`/`reference`, and processing must be idempotent by design rather than by
   checking "have I seen this event ID before."
4. **The official SDK's `verify()` does not do constant-time comparison** despite the docs
   prose recommending it (§3) — worth flagging in code review so our own implementation
   doesn't copy the SDK's pattern.
5. **`orderCode` is a `number`**, not a UUID/string — need to confirm the numeric range PayOS
   accepts/is comfortable with, and decide the mapping scheme from our internal
   `organizationId` (UUID) + target plan to a numeric `orderCode` (likely: a sequential
   `PlanUpgradeOrder.id` in our own DB, with PayOS's `orderCode` = that internal ID).
6. **`docs.payos.money`** turned up in a search result as a second, differently-branded docs
   domain; this research treated `payos.vn/docs` as canonical (it's what's linked from
   payOS's own SDK READMEs and package registry pages) but did not cross-diff the two domains
   for drift — worth a sanity check if either domain's content looks stale later.
