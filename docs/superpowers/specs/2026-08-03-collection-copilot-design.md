# Collection Copilot (AI Agent) Design

> Spec con của [docs/overview.md](../../../docs/overview.md), phụ thuộc [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) và [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md) (gửi email dùng lại EmailService/EmailTemplate đã có).

## 0. Lưu ý về phạm vi so với tài liệu gốc

Tài liệu gốc (mục 8.4) khuyến nghị *không* xây "chatbot tổng quát" hay agent phức tạp trong phạm vi thực tập. Spec này **mở rộng có chủ đích** theo yêu cầu: một Copilot chat cho phép kế toán hỏi đáp tự do về công nợ, với model được gọi tool (bao gồm 1 tool hành động: gửi email nhắc) — không phải 2 action cố định như bản gốc. Để vẫn giữ đúng tinh thần guardrail của tài liệu gốc (AI không tự quyết định thao tác tài chính rủi ro), phạm vi hành động ghi dữ liệu được giới hạn nghiêm ngặt ở mục 3.

## 1. Kiến trúc Copilot chat & tool whitelist

```
CollectionCopilotAgent
  tools (read-only):
    getReceivableSummary(customerId)          → structured data đã tính sẵn (không phải raw DB)
    getCollectionActivityTimeline(customerId, limit)
    getPaymentHistory(customerId, limit)
  tools (action, cần confirmation):
    draftReminderEmail(receivableId, tone?)    → tạo draft, KHÔNG gửi
    sendReminderEmail({ draftId, receivableId }) → chỉ đề xuất; confirm endpoint mới gửi thật
```

Tất cả tool đọc chỉ trả **structured data đã được backend tính sẵn** (vd `totalOutstanding`, `maxOverdueDays`, `averageLateDays` — không phải raw SQL rows), giữ nguyên nguyên tắc từ bản gốc: AI diễn giải thành văn xuôi, không tự tính toán số tiền.

### Loop xử lý 1 lượt chat

```
1. User message → Agent (model + tool definitions ở trên)
2. Model có thể gọi 0..N tool đọc để lấy context trước khi trả lời
3. Nếu model muốn thực thi sendReminderEmail → KHÔNG tự chạy ngay,
   trả về "pending action" cho UI hiển thị dạng thẻ xác nhận (Xác nhận / Hủy)
4. User bấm "Xác nhận" → FE gọi POST /api/v1/copilot/actions/:actionId/confirm
   → backend tự tạo ReminderExecution rồi gọi EmailService (KHÔNG đi qua model nữa)
5. User bấm "Hủy" → FE gọi POST /api/v1/copilot/actions/:actionId/cancel
   → backend chuyển pending action sang CANCELLED, không tạo execution, không gửi email
```

Điểm mấu chốt: hành động ghi dữ liệu (`sendReminderEmail`) không bao giờ chạy trong cùng lượt gọi model — model chỉ đề xuất, một endpoint xác nhận riêng biệt (thuần code, không qua LLM) mới thực thi thật. Việc này giữ nguyên tắc "AI chỉ tạo draft/đề xuất, người dùng duyệt trước khi gửi" dù giao diện đã là chat tự do.

`sendReminderEmail({ draftId, receivableId })` ở trên là tool contract dành cho model. Khi user confirm, backend resolve `draftId`, dùng `receivableId` từ payload để tạo `ReminderExecution(reminderRuleId=null, status=PENDING)`, tạo `EmailTemplate`, rồi gọi EmailService bằng contract chuẩn `sendReminderEmail({ receivableId, templateId, reminderExecutionId })`; đây không phải hai signature của cùng một service.

## 1.1. HTTP contracts

Backend dùng global prefix `/api/v1`; `/health` và `/metrics` là probe process-level và nằm ngoài prefix.

```typescript
interface CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

interface CopilotPendingActionDto {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}

interface CopilotTurnResponseDto {
  message: CopilotMessageDto;
  pendingAction: CopilotPendingActionDto | null;
}

interface CopilotActionResponseDto {
  action: CopilotPendingActionDto;
  reminderExecutionId?: string;
}
```

`POST /api/v1/copilot/conversations/:id/messages` trả `CopilotTurnResponseDto`; hai endpoint confirm/cancel trả `CopilotActionResponseDto`. FE dùng đúng các DTO này, không nhận `message` dạng string hoặc payload thiếu `receivableId`.

## 2. Action whitelist

Chỉ **gửi email nhắc** được phép thực thi qua chat (sau xác nhận):
- Rủi ro thấp, không ảnh hưởng số liệu tài chính (`Receivable`/`Payment`/`PaymentAllocation` state).
- Các hành động nhạy cảm hơn — write-off, payment allocation, dispute — **luôn bắt buộc thực hiện qua UI thông thường**, không có tool nào cho phép Copilot gọi các hành động này, kể cả sau xác nhận. Đây là ranh giới cứng, không mở rộng thêm nếu không có quyết định riêng.

## 3. Entities

```
CopilotConversation
  id, organizationId, userId, customerId (nullable — có thể hỏi chung),
  createdAt

CopilotMessage
  id, conversationId, role (USER/ASSISTANT/TOOL), content,
  toolCalls (jsonb, nullable), createdAt

CopilotPendingAction
  id, conversationId, actionType (SEND_REMINDER_EMAIL),
  payload (jsonb — vd { draftId, receivableId }),
  status (PENDING/CONFIRMED/CANCELLED/EXPIRED),
  createdAt, resolvedAt, resolvedByUserId

AIUsageLog
  id, organizationId, conversationId, model, promptVersion,
  inputTokens, outputTokens, latencyMs, toolCallsCount, createdAt
```

## 4. Guardrail bắt buộc

```
- Timeout: mỗi lượt gọi model có timeout cứng (vd 15s), quá hạn → trả lỗi cho UI,
  tối đa 1 retry tự động, không retry vô hạn.
- Structured output: tool trả JSON đã validate schema, không trả raw SQL result thẳng vào model.
- CopilotPendingAction hết hạn sau N phút (vd 10 phút) nếu chưa resolve
  → status=EXPIRED, confirm/cancel trễ đều bị từ chối và không tạo execution.
- Mọi request tới model đều ghi AIUsageLog (model, prompt version, token, latency) để audit chi phí
  — không có ngoại lệ, kể cả lỗi/timeout cũng ghi log.
- Không đưa BankConnection accessToken hay bất kỳ credential nhạy cảm nào vào prompt hoặc tool response.
- Mọi tool đọc dữ liệu chỉ trả kết quả trong phạm vi organizationId của user hiện tại
  (áp dụng BaseRepository/tenant context từ spec Multi-tenancy — xem
  [2026-08-03-multi-tenancy-rbac-design.md](2026-08-03-multi-tenancy-rbac-design.md)).
- Chỉ user có Permission.REMINDER_SEND_MANUAL mới thấy/kích hoạt được action sendReminderEmail trong chat.
```

## 5. Ngoài phạm vi

- Bất kỳ tool ghi dữ liệu nào ngoài gửi email nhắc (write-off, allocate, dispute) — cố định là ranh giới cứng, không mở rộng nếu không có quyết định riêng từ người dùng.
- Đa lượt hội thoại dài lưu trữ vô thời hạn / tóm tắt hội thoại cũ — chưa cần ở MVP.
- Dự báo dòng tiền phức tạp bằng ML — ngoài phạm vi (tài liệu gốc mục 8.4).

## 6. Câu hỏi mở (không chặn implementation)

- Model provider cụ thể nào (và structured output/tool-calling API tương ứng) sẽ dùng cho `AIProviderAdapter`?
- `CopilotPendingAction` hết hạn (`EXPIRED`) có cần thông báo lại cho user hay chỉ âm thầm biến mất khỏi UI?
- Có giới hạn số lượt chat/ngày theo Usage Metering (spec Billing) hay để free trong MVP?
