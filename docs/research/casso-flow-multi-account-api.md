# Casso Flow: multiple bank accounts under one API key/business

Research question: can one Casso API key (`GET /v2/userInfo`) legitimately return
more than one entry in `bankAccs`, and what does that imply for a
"select/import multiple bank accounts" feature in casso-ar's bank
connection flow. Investigated against `developer.casso.vn` and `docs.casso.vn`
(Casso's own help center, which developer.casso.vn's getting-started material
links out to for the dashboard-side bank-linking flow).

## 1. Can one API key/authorization code have more than one entry in `bankAccs`?

**Answer: Yes, documented as possible.** The official `/v2/userInfo` reference
page's own example response shows the `bankAccs` array holding one entry
followed by an explicit comment indicating more entries can follow:

> Source: https://developer.casso.vn/casso-api/api/lay-thong-tin-user
>
> ```json
> {
>   "error": 0,
>   "message": "success",
>   "data": {
>     "user": { "id": 1, "email": "demo@casso.vn" },
>     "business": { "id": 1009, "name": "VinDemo" },
>     "bankAccs": [
>       {
>         "id": 87,
>         "bank": { "bin": 970436, "codeName": "vietcombank" },
>         "bankAccountName": null,
>         "bankSubAccId": "123456789",
>         "balance": 64875755,
>         "memo": "VCB NGUYEN VAN A23",
>         "connectStatus": 1,
>         "planStatus": 2
>       }
>       //... các tài khác tiếp theo
>     ]
>   }
> }
> ```

The trailing comment `//... các tài khác tiếp theo` translates to "...the
following accounts continue" — i.e. the docs explicitly model `bankAccs` as a
variable-length array, not a fixed single-element shape. The page does not
state a maximum count.

## 2. Mechanism for linking an additional bank account to the same business

**Answer: Yes — documented as a normal "add account" flow in the Casso
dashboard**, reachable from the same "Kết nối" (Connections) menu used for the
first bank account:

> Source: https://docs.casso.vn/huong-dan/bat-dau-su-dung-casso
>
> "Để có thể sử dụng các dịch vụ từ Casso, bạn phải liên kết ngân hàng" (To use
> Casso's services, you must link a bank). The interface exposes a **"Kết nối"**
> menu with a **"Thêm tài khoản"** (Add account) option. The documented steps
> to add an additional bank account to an existing business are:
> 1. Go to the "Kết nối" menu, select "Thêm tài khoản".
> 2. Choose the account type and the bank to link.
> 3. Accept Casso's notices, select "Tiếp tục" (Continue).
> 4. Scan a QR via the Cas ID app, or manually enter internet-banking
>    connection info (for banks without an official API).
> 5. For eligible banks, toggle account selection, choose the old-transaction
>    sync window, and select "Hoàn thành" (Complete).

> Source: https://docs.casso.vn/huong-dan/ket-noi-tai-khoan-ngan-hang-thong-qua-cas-id
>
> This page (bank connection via Cas ID QR scan) describes the same
> per-bank connection flow and refers to completing it as "hoàn tất luồng
> thêm ngân hàng" ("completing the flow of adding a bank"), phrased generically
> per-bank rather than as a one-time, whole-business setup step.

Neither page states whether this is common practice for Vietnamese SMEs
specifically (frequency/typicality is **not documented** — the docs describe
the mechanism exists and how to use it, not how often businesses do it in
practice). Treat "is this a normal/common thing for an SME to do" as
undocumented; do not infer a usage rate from these pages.

## 3. Does `bankAccs` represent the complete, current list (not paginated/partial)?

**Answer: Not explicitly documented either way.** The `/v2/userInfo` reference
page (https://developer.casso.vn/casso-api/api/lay-thong-tin-user) shows no
pagination parameters (no `page`/`limit`/`cursor` in the request spec) and no
`total`/`hasMore`/pagination metadata in the response envelope alongside
`bankAccs`. The absence of any pagination controls is suggestive that the full
list is returned, but the page never makes a positive claim such as "this
returns all linked accounts" or "this list is not paginated." Given the
project's rule to not guess when a page doesn't explicitly answer a question,
this is recorded as **ambiguous / not explicitly documented** — the endpoint
shape is consistent with "always complete," but no source text asserts it.

## 4. Does key rotation preserve `business.id` and the `bankAccs` list?

**Answer: Not documented.** Neither the manual API-key creation page nor any
other page found under `developer.casso.vn` or `docs.casso.vn` describes what
happens to `business.id` or the linked `bankAccs` set when a new API key is
generated (or an old one deleted/rotated) for the same business:

> Source: https://developer.casso.vn/casso-api/chung-thuc/tao-api-key-thu-cong
>
> Documents only the creation flow: "Thiết lập" > "Api Keys" > "Tạo API Key" >
> "Tạo và xem API Key" (Settings > API Keys > Create API Key > Create and view
> API Key), and that keys created after 31 Aug 2021 cannot be used against v1
> APIs. It says nothing about what a new key does or does not carry over from
> an existing one.

> Source: https://developer.casso.vn/v1/auth-code/tao-authorization-code-thu-cong
>
> Documents the equivalent v1 manual authorization-code creation flow
> (Settings > Api Keys > Create API Key > name it > view/copy/save the key).
> Also silent on rotation semantics, `business.id` stability, or whether
> `bankAccs` persists across key regeneration.

No page found states that generating a new key creates "a new business" or
"a new session," nor confirms the opposite (that `business.id` and
`bankAccs` are stable across rotation). This must be treated as an open
question for casso-ar's design — do not assume either behavior without
directly testing against the Casso sandbox/API or getting written
confirmation from Casso support.

## Summary for design purposes

| # | Question | Answer |
|---|----------|--------|
| 1 | Can `bankAccs` have >1 entry? | **Yes**, per the official example + inline comment showing further entries |
| 2 | Mechanism to add another account to a business | **Yes**, documented "Kết nối" > "Thêm tài khoản" flow; frequency/typicality for Vietnamese SMEs not documented |
| 3 | Is `bankAccs` complete/non-paginated? | **Not explicitly documented** — no pagination params/metadata seen, but no explicit claim of completeness either |
| 4 | Does key rotation preserve `business.id`/`bankAccs`? | **Not documented** — no source addresses this |
