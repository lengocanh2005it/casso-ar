# 3. `isDisputed` là computed field từ bảng `Dispute`, không lưu trực tiếp trên `Receivable`

Date: 2026-08-03

## Status

Accepted

Supersedes phần `isDisputed`, `disputeReason`, `disputedAt` trong bản đầu của [`domain-core-design.md`](../superpowers/specs/2026-08-03-domain-core-design.md).

## Context

Bản thiết kế Domain Core ban đầu lưu `isDisputed`, `disputeReason`, `disputedAt` trực tiếp làm field trên `Receivable`. Khi thiết kế Dispute Management, một `Receivable` hóa ra có thể có **nhiều `Dispute` theo thời gian** (mở → giải quyết → mở lại), mỗi lần là một record riêng để giữ lịch sử đầy đủ (ai xử lý, lý do, cách giải quyết) — ba field boolean/text đơn lẻ trên `Receivable` không biểu diễn được lịch sử đó.

Giữ cả hai — field trên `Receivable` *và* bảng `Dispute` riêng — nghĩa là hai nguồn sự thật cho cùng một thông tin, phải đồng bộ thủ công ở mọi nơi ghi (mở dispute, đóng dispute, mở lại) và dễ lệch nhau nếu quên một chỗ.

## Decision

Bỏ `isDisputed`, `disputeReason`, `disputedAt` khỏi bảng `Receivable`. `isDisputed` trở thành **computed field**, tính tại thời điểm query:

```
isDisputed = EXISTS(Dispute WHERE receivableId = this.id AND status = 'OPEN')
```

Response DTO có thể expose `isDisputed` cho FE, nhưng giá trị đó phải được tạo từ `EXISTS`/`hasOpenDispute` ở read path; không thêm cột `isDisputed` vào `ReceivableOrmEntity` và không copy trạng thái dispute sang `Receivable`.

`status` chính của `Receivable` (`OPEN`/`PARTIALLY_PAID`/...) giữ nguyên không đổi khi có dispute — dispute chỉ tạm dừng reminder, không chặn payment/matching.

## Consequences

- Chỉ một nguồn sự thật (`Dispute` table) cho trạng thái tranh chấp — không còn rủi ro field trên `Receivable` lệch với record `Dispute` do quên đồng bộ ở một trong hai chỗ.
- Mọi nơi cần lọc/hiển thị theo `isDisputed` (reminder cron, aging dashboard, receivable list) phải JOIN hoặc subquery vào `Dispute` thay vì đọc thẳng một cột — thêm chi phí query so với đọc field boolean, cần index trên `(receivableId, status)` của `Dispute` để không chậm ở các list lớn.
- Thay đổi này sửa ngược spec Domain Core đã viết trước đó — bất kỳ code/migration nào đã tạo theo bản field-trên-Receivable ban đầu cần được cập nhật lại theo quyết định này.
