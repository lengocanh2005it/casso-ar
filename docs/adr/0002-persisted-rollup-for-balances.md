# 2. Persisted rollup cho `paidAmount`/`allocatedAmount` thay vì tính runtime từ `PaymentAllocation`

Date: 2026-08-03

## Status

Accepted

## Context

`PaymentAllocation` là bảng ghi lịch sử phân bổ thanh toán (source of truth), N-N giữa `Payment` và `Receivable`. Để biết số dư hiện tại của một `Receivable` (`paidAmount`) hay phần đã phân bổ của một `Payment` (`allocatedAmount`), có hai cách:

- **Tính runtime**: `SUM(PaymentAllocation.allocatedAmount)` mỗi lần cần đọc số dư — luôn nhất quán với source of truth vì không có bản sao dữ liệu nào khác, nhưng mọi read path (list receivable, aging dashboard, reporting) phải aggregate một bảng có thể rất lớn.
- **Persisted rollup**: lưu `paidAmount`/`allocatedAmount` trực tiếp trên `Receivable`/`Payment`, cập nhật trong cùng transaction với mỗi allocation/undo.

Domain Core spec ban đầu có mâu thuẫn giữa hai cách này ở các phiên bản plan khác nhau — đây là lý do quyết định này cần chốt tường minh và tài liệu hóa, tránh các plan sau tiếp tục lệch nhau.

## Decision

`paidAmount` (trên `Receivable`) và `allocatedAmount` (trên `Payment`) là **persisted rollup**, được cập nhật trong cùng transaction có row lock với mọi allocation/undo. `remainingAmount` và `unallocatedAmount` là derived field (trừ đơn giản, không lưu). `PaymentAllocation` vẫn là source of truth về lịch sử — rollup không được sửa bằng đường dẫn nào khác ngoài transaction allocation/undo, và có DB check constraint bảo vệ invariant (`0 <= paidAmount <= originalAmount`, `0 <= allocatedAmount <= totalAmount`).

Không dùng `SUM(PaymentAllocation)` làm số dư runtime ở bất kỳ read path nào.

## Consequences

- Read path (list, aging dashboard, reporting) chỉ đọc một cột int trên `Receivable`/`Payment`, không cần JOIN + aggregate `PaymentAllocation` — quan trọng vì đây là các query chạy thường xuyên nhất trong ứng dụng.
- Đổi lại, mọi write path làm thay đổi allocation (allocate, undo, write-off) bắt buộc cập nhật đúng rollup trong cùng transaction có lock; bỏ sót một chỗ ghi allocation ngoài use case chuẩn sẽ làm rollup lệch khỏi `PaymentAllocation` — một lớp bug khó phát hiện (số liệu sai nhưng không lỗi rõ ràng) nếu không có test/invariant check chặt.
- Vì đây là cấu trúc dữ liệu (cột lưu trữ), đảo ngược sau này (bỏ rollup, chuyển hẳn sang tính runtime) đòi hỏi backfill/migration và sửa lại mọi read path đang phụ thuộc — không phải thay đổi rẻ.
- `AllocatePaymentUseCase` và auto-match/Exception Queue đều phải đi qua cùng một shared allocation core trong Domain Core để đảm bảo không có nơi nào tự ý cập nhật rollup theo cách khác.
