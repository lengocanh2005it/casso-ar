# Implementation Order & Reconciliation

Đây là contract chung cho các spec/plan trong thư mục này. Khi plan cũ khác file này, sửa plan theo file này trước khi implement.

Các ADR ở `docs/adr/` là nguồn sự thật cho quyết định kiến trúc đã chấp nhận; file này chốt thứ tự triển khai và contract phối hợp giữa các plan. Không plan/spec nào được tự mở lại hoặc tạo một phiên bản song song của các quyết định đó.

> **Cập nhật 08/2026:** file chốt quyết định số dư theo [ADR 0002](../adr/0002-persisted-rollup-for-balances.md), bổ sung 3 plan FE mới và chốt read contract trong `2026-08-03-read-apis-completion.md` trước khi chạy các plan FE nghiệp vụ.

## Quyết định lõi

1. `PaymentAllocation` là source of truth về lịch sử phân bổ. `Receivable.paidAmount` và `Payment.allocatedAmount` là **persisted rollup** được cập nhật trong cùng transaction; `remainingAmount` và `unallocatedAmount` là derived field từ rollup. Không dùng `SUM(PaymentAllocation)` làm số dư runtime.
2. Allocation, undo, write-off và mọi thay đổi status liên quan chạy trong một transaction. Repository nào tham gia transaction phải nhận cùng `EntityManager`; không gọi repository mặc định bên trong callback transaction.
3. Có một shared allocation core trong Domain Core. `AllocatePaymentUseCase` và auto-match/Exception Queue đều gọi core đó, không copy logic tiền/status.
4. Mọi business query/write phải tenant-scoped. Webhook resolve tenant từ `BankConnection`; không tin `organizationId` trong request body.
5. Signup tạo `Organization`, `User`, `Membership OWNER`, `Subscription FREE`, default email templates và default reminder rules trong cùng transaction bootstrap. Auth chỉ gọi một bootstrap port; template/reminder modules cung cấp implementation trước khi bật signup production. Signup trả access token và refresh token.
6. `EmailVerifiedGuard` là global guard cho business API, có public-route bypass cho `/auth/*`, `/health` và webhook guard riêng.
7. Invite tới email đã có User yêu cầu JWT của User đó. Rate limit auth dùng key `(IP, normalized email)`, không dùng throttle mặc định chỉ theo IP.
8. Số tiền là integer đơn vị đồng, không dùng `float`. `domain/` không import NestJS/TypeORM.
9. **Quyết định FE (grill 08/2026):** FE chia 3 slice theo phụ thuộc BE (auth shell → core AR loop → còn lại). RBAC FE dùng 1 hàm `hasPermission(role, permission)` từ `shared-types` (`Permission` + `ROLE_PERMISSIONS`), **ẩn button khi thiếu quyền, không disable**; route-gate chi tiết chỉ cho `/settings`. Receivable/Customer detail là **route riêng**; BankTransaction detail là **sheet**. Copilot: model không bao giờ thực thi hành động ghi — `POST /copilot/actions/:id/confirm|cancel` là endpoint thuần code.
10. **Read contracts:** các read endpoint FE cần được implement theo đúng shape trong `2026-08-03-read-apis-completion.md`; FE không tự tạo fallback contract khác. Exception Queue dùng `/bank-transactions/unmatched` và `/bank-transactions/pending-review-count`.
11. **Canonical API contracts:** import trả `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }`; aging dùng `NOT_DUE`, `OVERDUE_1_7`, `OVERDUE_8_30`, `OVERDUE_31_60`, `OVERDUE_60_PLUS`; template dùng `bodyHtml` và preview `{ subject, bodyHtml }`; mọi frontend request dùng prefix `/api/v1`.
12. **Copilot:** read tools là `getReceivableSummary`, `getCollectionActivityTimeline`, `getPaymentHistory`; write proposals luôn tạo pending action và có cả `confirm` lẫn `cancel` endpoint. Không đưa escalation vào reminder scheduler.
13. **API prefix:** controller decorators keep module-relative paths (`auth`, `receivables`, `copilot`, ...); the final `main.ts` applies global prefix `/api/v1`, excluding only `/health` and `/metrics`. Integration tests and FE clients must call the prefixed paths.
14. **API conventions (mới, xem [project-scaffolding spec mục 5](../superpowers/specs/2026-08-03-project-scaffolding-architecture-design.md)):** mọi lỗi trả `{ statusCode, errorCode, message, details? }`; mọi `POST` tạo mới/đổi tiền-trạng thái do FE gọi trực tiếp chấp nhận header `Idempotency-Key` (không áp dụng cho webhook, đã có `providerTransactionId` riêng). Reminder cron/"today" luôn tính theo `REMINDER_TIMEZONE` cố định `Asia/Ho_Chi_Minh` ([reminder-automation spec mục 3](../superpowers/specs/2026-08-03-reminder-automation-design.md)), không dùng giờ server mặc định.
15. **FE không tự bỏ API vì BE chưa có route:** trước khi chạy FE Core lane, các route dưới đây phải được BE implement theo đúng owner; FE giữ nguyên các flow này và chỉ tiêu thụ contract đã chốt.

| FE flow | BE owner plan | Route contract |
|---|---|---|
| Customer list/timeline | Read APIs + Collection Activity | `GET /customers`, `GET /customers/:id/timeline` |
| Receivable list/detail | Read APIs + Dispute | `GET /receivables`, `GET /receivables/:id` |
| Create/write-off/cancel | Domain Core + Multi-tenancy + Testing Strategy | `POST /receivables`, `POST /receivables/:id/write-off`, `POST /receivables/:id/cancel` |
| Payment allocation/undo | Domain Core | `POST /payments/:id/allocate`, `POST /payments/allocations/:allocationId/undo` |
| Timeline/activity | Collection Activity | `POST /receivables/:id/activities`, `GET /receivables/:id/timeline` |
| Dispute | Dispute Management | `POST /receivables/:receivableId/disputes`, `POST /disputes/:id/resolve` |
| Internal tasks | Internal Task | `GET /receivables/:id/tasks`, `POST /receivables/:id/tasks`, `POST /tasks/:id/resolve`, `POST /tasks/:id/dismiss` |
| Invoice import | Invoice Import | `POST /invoices/import` |
| Matching/exception queue | Exception Queue + Audit Log | `GET /bank-transactions/unmatched`, `GET /bank-transactions/pending-review-count`, `GET /bank-transactions/:id/candidates`, `POST /bank-transactions/:id/match`, `POST /bank-transactions/:id/skip`, `POST /bank-transactions/:id/mark-prepaid` |

## Thứ tự chạy plan

Mỗi lane thực thi tuần tự; các plan khác lane có thể chạy song song miễn dependency đã xong. **X** = dependency bắt buộc.

| # | Plan | Cần trước |
|---|------|-----------|
| 1 | Project scaffolding + Domain Core | — |
| 2 | Multi-tenancy + RBAC | 1 |
| 3 | Billing + usage metering (402 gate) | 1, 2 |
| 4 | Authentication + onboarding (JWT, verify, invite, reset; bootstrap port only) | 1, 2, 3 |
| 5 | Cas ID bank connection | 2, 3, 4 |
| 6 | Email template management (seed implementation) | 2, 3, 4 |
| 7 | Email notification service (Resend + queue, rebind AUTH_EMAIL_SENDER) | 4, 6 |
| 8 | Webhook ingestion + matching engine | 1, 2, 5 |
| 9 | Dispute management | 1, 2 |
| 10 | Collection activity timeline (lắng nghe payment/dispute/reminder events) | 1, 7, 9 |
| 11 | Internal task + escalation | 1, 2 |
| 12 | Reminder automation (không gọi escalation) + default rule binding | 1, 2, 6, 7 |

> **Lưu ý thứ tự #11 trước #12:** Internal Task/Escalation không phụ thuộc Reminder Automation để build — nó chỉ đăng ký listener cho event `reminder.scan.completed` (do plan #12 emit ở cuối daily scan, xem [reminder-automation plan Task 5](../superpowers/plans/2026-08-03-reminder-automation.md#task-5-build-the-daily-scheduler-and-queue-registration)). Listener được wire trước, event nguồn có sau — không phải circular dependency vì escalation module không import ngược reminder module, chỉ subscribe qua `EventEmitter2`. Nếu tách escalation ra module riêng cần gọi thẳng API của reminder, phải đảo lại thứ tự.
| 13 | Exception queue + audit log | 1, 2, 8 |
| 14 | Invoice import | 1, 2, 3 |
| 15 | Aging dashboard + reporting | 1, 2, 8, 13 |
| 16 | Collection Copilot | 2, 6, 7, 10, 12 |
| 17 | Read-APIs completion | 1, 2, 3, 5, 8, 9, 10, 13 |
| 18 | Frontend design system (skeleton + design tokens) | 1 |
| 19 | FE Auth + App shell | 3, 18 |
| 20 | FE Core AR loop (customers, receivables, matching, exceptions) | 1, 2, 8, 9, 10, 11, 13, 14, 17, 18, 19 |
| 21 | FE Reminders, Copilot, Reports, Settings | 4, 5, 6, 7, 12, 15, 16, 17, 18, 19 |
| 22 | Testing strategy + CI (testcontainers, `turbo run verify`) | 1, 7, 8, 13 |
| 23 | Deployment/observability (compose 4 service, Dockerfiles, /health, /metrics) | 1, 7, 18 |

Checkpoint bắt buộc sau mỗi lane:
- **Lane A (1–6):** webhook auto-match ra `PaymentAllocation`, toàn bộ write path chạy qua JWT tenant-scoped; read contracts được hoàn thiện ở plan #17.
- **Lane B (7–16):** webhook failure state bền vững; timeline ghi invoice/payment/dispute/reminder events; exception queue split match với optimistic lock; copilot confirm/cancel và gửi email thật qua queue.
- **Lane C (17–21):** FE đăng nhập → tạo công nợ → khớp giao dịch → duyệt exception → xem aging, không có endpoint nào 404 do BE gap.
- **Lane D (22–23):** `turbo run verify` pass trên CI; compose up đủ postgres + redis + backend + frontend.

`app.module.ts`, `SignupUseCase`, `AllocatePaymentUseCase`, `receivables.module.ts`, `webhooks.controller.ts`, `auth.controller.ts` và `apps/frontend/src/routes/index.tsx` là shared touchpoints. Khi nhiều plan sửa cùng file, merge theo thứ tự trên; không copy nguyên file từ plan sau đè plan trước.

## Contract test bắt buộc

- Cross-tenant `BankConnection` và webhook payload organization mismatch bị từ chối.
- Allocation khác Customer, Payment chưa có `customerId`, vượt `remainingAmount` hoặc vượt `unallocatedAmount` đều bị từ chối ở use case.
- Signup rollback không để lại Organization, Membership, Subscription, template hoặc reminder rule mồ côi.
- Business JWT chưa verify email nhận `403`; public auth route vẫn hoạt động.
- Webhook worker nhận cả `webhookInboxId` và `organizationId`, hoặc resolve organization từ inbox trước khi query tiếp; không truyền chuỗi rỗng làm tenant.
- (Thêm từ FE plans) Mọi endpoint FE plan 2/3 tiêu thụ trả đúng shape contract — read APIs phải có integration test tenant isolation và response shape.
- Invoice import response đúng `{ totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }`; không dùng song song `errorCount/errors`.
- Aging response dùng đúng 5 bucket canonical; template preview trả `bodyHtml`; Copilot có cả confirm và cancel; mọi FE URL dùng `/api/v1`.
- Undo allocation là soft-delete/audit, không xóa vật lý; mọi retry/worker async khôi phục tenant context trước khi ghi activity/audit.
