# Invoice/Receivable Import (Excel/CSV) Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (`Invoice`, `Receivable`, `Customer`).

## 1. Import flow & row-level error handling

```
POST /invoices/import
  1. Parse file (xlsx/csv), validate cấu trúc cột bắt buộc:
     customerName, customerTaxCode (optional), customerEmail (optional),
     invoiceNumber, issueDate, dueDate, totalAmount
  2. Với mỗi dòng (xử lý độc lập, lỗi 1 dòng không chặn dòng khác):
     a. Validate field: invoiceNumber không rỗng, dueDate >= issueDate,
        totalAmount là số dương, format ngày hợp lệ
        → lỗi → thêm vào failedRows, bỏ qua dòng này
     b. Resolve Customer: khớp theo customerTaxCode trước (unique hơn email),
        nếu dòng không có taxCode thì khớp theo customerEmail;
        không tìm thấy → tự động tạo Customer mới
        (organizationId, name, taxCode, email lấy từ dòng import)
     c. Kiểm tra trùng invoiceNumber trong cùng organization
        → đã tồn tại → thêm vào failedRows với lý do DUPLICATE_INVOICE_NUMBER, bỏ qua
     d. Tạo Invoice (sourceType=IMPORT) + Receivable tương ứng
        (mặc định 1 Invoice = 1 Receivable theo Domain Core spec)
  3. Trả kết quả canonical: { totalRows, successCount, failedRows: [{ rowNumber, data, errors }] }
```

**Partial import**: dòng hợp lệ được tạo, dòng lỗi bị bỏ qua và báo cáo chi tiết — không rollback toàn bộ file vì 1-2 dòng sai. Mỗi dòng xử lý trong transaction riêng của nó (tạo Customer nếu cần + Invoice + Receivable cùng một transaction/dòng), lỗi ở một dòng không ảnh hưởng các dòng khác. Callback truyền `EntityManager` phải được chuyển qua mọi repository/use case ghi dữ liệu, đặc biệt `CreateReceivableUseCase.execute(input, manager)`, để quota check và insert dùng cùng transaction.

## 2. Ngoài phạm vi

- Import từ API/ERP/CRM connector thực tế (tài liệu gốc mục 9.4 loại khỏi phạm vi thực tập).
- Mapping configuration tùy chỉnh cột (cố định tên cột như trên cho MVP).
- Import receivable tách nhiều từ 1 invoice ngay trong lúc import (chỉ hỗ trợ 1-1 lúc import; tách thủ công sau nếu cần, theo quan hệ 1-N đã thiết kế ở Domain Core).

## 3. Câu hỏi mở (không chặn implementation)

- Giới hạn kích thước file/số dòng tối đa cho một lần import là bao nhiêu (ảnh hưởng có cần xử lý bất đồng bộ qua queue thay vì đồng bộ trong 1 request)?
- Khi tự động tạo Customer mới trong lúc import, có cần đánh dấu riêng (vd `createdVia: IMPORT`) để phân biệt với Customer tạo thủ công không?
