# Dispute Management Design

> Spec con của [docs/overview.md](../../../docs/overview.md), sửa đổi [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) — thay `Receivable.isDisputed` (field lưu trực tiếp) bằng entity `Dispute` riêng + computed field, và ảnh hưởng tới [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (điều kiện bỏ qua reminder).

## 1. Entity Dispute

```
Dispute
  id, organizationId, receivableId,
  reason, status (OPEN/RESOLVED),
  openedByUserId, createdAt, resolvedAt, resolvedByUserId

Receivable.isDisputed (computed, không lưu trong DB) =
  EXISTS(Dispute WHERE receivableId = Receivable.id AND status = 'OPEN')
```

MVP không model `assignedToUserId` và `resolutionNote`; nếu cần assignment hoặc ghi chú khi resolve sẽ bổ sung nullable fields và migration ở phase sau.

Một `Receivable` có thể có nhiều `Dispute` theo thời gian (mở → giải quyết → mở lại nếu phát sinh tranh chấp mới) — mỗi lần là một record riêng, giữ lịch sử (ai mở/xử lý và lý do) thay vì ghi đè lên một flag boolean duy nhất. Tại mọi thời điểm chỉ được có tối đa một `Dispute.status = OPEN`; use case kiểm tra trước khi insert và database partial unique index `(receivableId) WHERE status = 'OPEN'` chặn race condition.

## 2. Lifecycle

```
Tạo Dispute (status=OPEN, reason, openedByUserId)
  → Reminder Automation (dùng isDisputed computed) tự động bỏ qua receivable này ở lần quét tiếp theo

Giải quyết Dispute (status=RESOLVED, resolvedAt=now, resolvedByUserId)
  → nếu không còn Dispute nào khác của receivable đó ở status OPEN → isDisputed tự động về false
  → Reminder Automation lại tính rule bình thường ở lần quét tiếp theo, không cần thao tác thủ công nào khác
```

## 3. Cập nhật ngược Domain Core spec

`Receivable` trong [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) không còn lưu `isDisputed`, `disputeReason`, `disputedAt` trực tiếp — ba field này được thay bằng computed field `isDisputed` tham chiếu bảng `Dispute` như mô tả ở mục 1. Lý do: tránh hai nguồn sự thật (Receivable field vs Dispute record) có thể lệch nhau nếu quên đồng bộ thủ công ở một trong hai chỗ.

## 4. Ngoài phạm vi

- UI chi tiết trang xử lý dispute (đã mô tả ở tài liệu gốc mục 7.12, 18).
- Assignment và resolution note trong entity (deferred khỏi MVP).
- Escalation tự động theo thời hạn giải quyết dispute (Internal Task/Escalation — tài liệu gốc mục 7.14, spec riêng nếu cần).

## 5. Câu hỏi mở (không chặn implementation)

- Nếu cần assignment/resolution note sau MVP, permission và field contract sẽ được chốt trong ADR/plan riêng.
- `Dispute` có cần theo dõi "thời hạn giải quyết" (deadline) để cảnh báo khi quá hạn xử lý không, hay chỉ cần trạng thái OPEN/RESOLVED đơn giản ở MVP?
