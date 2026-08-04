# Cas ID Integration + Bank Connection Design

> Spec con của [OVERVIEW.md](../../../OVERVIEW.md), liên kết với [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (mỗi `BankTransaction` thuộc về một `BankConnection`). Định nghĩa luồng kết nối tài khoản ngân hàng qua Cas ID, entity quản lý consent/token, và cách phát hiện mất quyền truy cập.

## 0. Nguồn tham khảo & giới hạn thông tin

Từ [cas.so/quickstart](https://cas.so/quickstart) (truy cập 08/2026), luồng kỹ thuật thật của Cas ID là **redirect-based flow kiểu OAuth**, không phải polling hay webhook như brainstorm ban đầu giả định:

```
1. POST /grant/token  (scopes vd "identity,transaction", redirectUri) → grantToken (hết hạn 30 phút)
2. Mở Cas Link với grantToken → user xác thực/quét QR trong Cas Link
3. Cas Link redirect về redirectUri kèm publicToken trong query param
4. POST /grant/exchange (publicToken) → accessToken (không hết hạn)
5. accessToken có thể bị vô hiệu qua POST /grant/invalidate
```

Xác thực API dùng header `x-client-id` + `x-secret-key` + API version, có sandbox và production riêng biệt.

**Giới hạn**: docs công khai không có endpoint/response schema đầy đủ, không nói rõ webhook báo thu hồi quyền phía Cas ID. Chi tiết field, error code, và cơ chế thông báo revoke cần xác nhận lại với CASSO Developer Portal/Console trước khi triển khai production. Vì vậy spec này thiết kế qua một **adapter interface** để cô lập phần chưa chắc chắn.

## 1. Adapter interface & luồng kết nối

```
CasIdIntegrationAdapter (interface)
  createGrantToken(scopes, redirectUri): Promise<{ grantToken, expiresAt }>
  exchangeToken(publicToken): Promise<{ accessToken }>
  invalidateToken(accessToken): Promise<void>
  getAccountIdentity(accessToken): Promise<AccountIdentity>
  getTransactions(accessToken, ...): Promise<Transaction[]>   // dự phòng nếu cần pull ngoài Balance Hook

MockCasIdAdapter implements CasIdIntegrationAdapter   // giả lập toàn bộ flow, dùng cho demo/test
CasIdAdapter implements CasIdIntegrationAdapter       // gọi API thật, hoàn thiện khi có Developer Portal access
```

`CasIdIntegrationAdapter` cô lập domain Accounts Receivable khỏi API cụ thể của Cas ID — nếu API/flow thật đổi khác giả định (ví dụ có webhook chính thức), chỉ cần đổi implementation của `CasIdAdapter`, không đổi domain logic.

### Luồng kết nối

```
1. Owner bấm "Kết nối ngân hàng" → BankConnectionService.initiate()
2. Gọi adapter.createGrantToken(scopes=["identity","transaction"], redirectUri=".../cas-id/callback")
3. Lưu CasIdConnectionSession (status PENDING_AUTHORIZATION), mở Cas Link ở popup/tab mới với grantToken
4. User quét QR / đăng nhập trong Cas Link
5. Cas Link redirect popup về redirectUri kèm publicToken
6. Trang callback (route riêng của AR Automation, vd /bank-connections/cas-id/callback) nhận publicToken,
   gọi backend POST /bank-connections/cas-id/sessions/:id/exchange
7. Backend: adapter.exchangeToken(publicToken) → accessToken
8. Lưu BankConnection (status ACTIVE), accessToken được mã hóa at-rest,
   đóng popup, cập nhật UI trang quản lý kết nối chính
```

Chọn popup/new-tab (không phải iframe) vì không có xác nhận Cas Link hỗ trợ embed iframe — popup + redirect URI riêng là mô hình OAuth-style chuẩn, chắc chắn hoạt động.

## 2. Entities

```
CasIdConnectionSession
  id, organizationId, initiatedByUserId, grantToken, scopes,
  bankConnectionId (nullable — set when re-authenticating an existing connection),
  redirectUri, status (PENDING_AUTHORIZATION/COMPLETED/EXPIRED),
  expiresAt (createdAt + 30 phút), createdAt

BankConnection
  id, organizationId, casIdConnectionSessionId,
  accessToken (mã hóa at-rest), accountIdentity (jsonb — số tài khoản, ngân hàng...),
  status (PENDING_AUTHORIZATION/ACTIVE/REQUIRES_REAUTHORIZATION/REVOKED/DISCONNECTED/ERROR),
  scopes, connectedAt, lastSyncAt, revokedAt,
  createdAt

ConnectionAuditEvent
  id, bankConnectionId, eventType (SESSION_CREATED/TOKEN_EXCHANGED/
    API_CALL_FAILED_401/MARKED_REQUIRES_REAUTH/RECONNECTED/DISCONNECTED),
  metadata (jsonb), createdAt
```

`accessToken` không hết hạn theo Cas ID nhưng vẫn là credential nhạy cảm nhất trong hệ thống (cho phép đọc giao dịch, dù không phải Internet Banking credential) — bắt buộc mã hóa at-rest, không log ra plaintext ở bất kỳ đâu (kể cả `ConnectionAuditEvent.metadata`).

Liên kết với Webhook/Matching spec: mỗi `BankTransaction` có `bankConnectionId` tham chiếu tới đây (xem [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) mục 2).

## 3. Trạng thái kết nối & lazy revocation detection

### Transitions

```
PENDING_AUTHORIZATION → ACTIVE                    khi exchange token thành công
ACTIVE → REQUIRES_REAUTHORIZATION                 khi bất kỳ API call nào dùng accessToken trả về 401/403
ACTIVE → ERROR                                    khi lỗi khác (5xx, network) — không phải revoke, có thể retry
REQUIRES_REAUTHORIZATION → ACTIVE                 khi user hoàn tất lại flow kết nối; cập nhật chính
                                                   BankConnection cũ (không tạo connection song song)
ACTIVE/REQUIRES_REAUTHORIZATION → DISCONNECTED    khi Owner chủ động ngắt kết nối (gọi invalidateToken)
```

Vì Cas ID không công bố webhook báo thu hồi quyền, việc phát hiện `REQUIRES_REAUTHORIZATION` dùng **lazy detection**: bất kỳ lệnh gọi API nào (nhận Balance Hook, gọi `getTransactions`...) dùng `accessToken` mà trả về 401/403 sẽ đánh dấu connection ngay lập tức — không cần scheduled job riêng kiểm tra định kỳ. Chấp nhận độ trễ phát hiện bằng khoảng cách tới lệnh gọi API tiếp theo.

Mọi caller gọi adapter phải đi qua đường xử lý chung: bắt `CasIdUnauthorizedError` (401/403), gọi `MarkRequiresReauthorizationUseCase` cho đúng `bankConnectionId`, ghi `ConnectionAuditEvent`, rồi ném lỗi để caller/queue retry theo chính sách của nó. Không gọi trực tiếp adapter từ use case nghiệp vụ mà bỏ qua guard này.

### Quy tắc khi mất ACTIVE

- Không xóa `BankTransaction`/`PaymentAllocation` lịch sử đã có khi connection không còn ACTIVE.
- Khi `REQUIRES_REAUTHORIZATION` hoặc `DISCONNECTED`: Webhook Controller kiểm tra status của `BankConnection` trước khi enqueue xử lý Balance Hook mới cho connection đó — nếu không ACTIVE, dừng nhận giao dịch mới.
- Cảnh báo Organization Owner qua notification khi status đổi khỏi ACTIVE.
- Không tự động dùng tài khoản khác thay thế khi một connection mất quyền.
- Mọi thay đổi status ghi vào `ConnectionAuditEvent`.

## 4. Ngoài phạm vi

- Chi tiết endpoint/response schema thật của Cas ID API — cần xác nhận với Developer Portal trước khi thay `MockCasIdAdapter` bằng `CasIdAdapter` thật.
- Trường hợp một tài khoản Cas ID cấp quyền cho nhiều tenant/app cùng lúc.
- RBAC/UI của việc giám đốc ủy quyền cho kế toán trong chính app Cas ID (nằm ngoài AR Automation, chỉ nhận kết quả `accountIdentity` sau khi ủy quyền xong).

## 5. Câu hỏi mở (không chặn implementation)

- API thật có cung cấp webhook/event báo revoke không, hay lazy detection là cách duy nhất production cũng phải dùng?
- `scopes` thực tế của Cas ID gồm những giá trị nào ngoài "identity" và "transaction" được nhắc ở quickstart?
- Có giới hạn số session `PENDING_AUTHORIZATION` đồng thời cho một organization không (chống spam tạo session)?
