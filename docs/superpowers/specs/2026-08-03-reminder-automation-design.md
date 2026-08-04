# Reminder Automation Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (dùng `Receivable.status`, `Receivable.isDisputed`, `Receivable.dueDate`). Định nghĩa cách cấu hình chính sách nhắc thanh toán, lên lịch quét hàng ngày, và tránh gửi nhầm khi công nợ vừa được thanh toán.

## 1. Phạm vi
