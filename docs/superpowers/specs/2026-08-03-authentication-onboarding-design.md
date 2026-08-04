# Authentication & Onboarding Design

> Spec con của [OVERVIEW.md](../../../OVERVIEW.md). Bổ sung phần nền tảng mà [2026-08-03-multi-tenancy-rbac-design.md](2026-08-03-multi-tenancy-rbac-design.md) đã giả định sẵn có ("AuthGuard xác thực JWT") nhưng chưa định nghĩa: signup, login, invite thành viên, quên mật khẩu.

## 1. Entity bổ sung (mở rộng Multi-tenancy/RBAC spec)

```
User
  id, name, email, passwordHash, emailVerifiedAt (nullable), createdAt

EmailVerificationToken
  id, userId, token (hash lưu DB), expiresAt, createdAt

PasswordResetToken
  id, userId, token (hash lưu DB), expiresAt, usedAt (nullable), createdAt

MembershipInvite
  id, organizationId, email, role, invitedByUserId, token (hash lưu DB),
  expiresAt, acceptedAt (nullable), createdAt

RefreshToken
  id, userId, tokenHash, expiresAt, revokedAt (nullable), createdAt
```

`MembershipInvite` tách riêng khỏi `Membership` (đã có ở multi-tenancy-rbac spec) — `Membership` chỉ tạo khi invite được accept, tránh có `Membership` "ma" chưa ai nhận. Mọi token (verification/reset/invite/refresh) lưu dạng hash, không lưu plaintext — nếu DB bị lộ, token không dùng lại được ngay.

## 2. Signup flow

```
POST /auth/signup { organizationName, name, email, password }
  1 transaction:
    - Tạo Organization
    - Tạo User (emailVerifiedAt=null)
    - Tạo Membership (role=OWNER, joinedAt=now)
    - Tạo Subscription (status=ACTIVE, planId=FREE) cùng transaction
    - Chạy `OrganizationBootstrap` trong cùng transaction để seed default `EmailTemplate`, `ReminderPolicy` và `ReminderRule` của organization; mọi repository nhận cùng `EntityManager`
  → gửi EmailVerificationToken qua EmailService (2026-08-03-email-notification-service-design.md)
  → trả `accessToken` + `userId` + `organizationId`; refresh token nằm trong httpOnly cookie
    (cho phép login) nhưng mọi API khác
    (trừ /auth/*, /me) bị chặn bởi EmailVerifiedGuard cho tới khi verify

GET /auth/verify-email?token=...
  → tìm EmailVerificationToken còn hạn, set User.emailVerifiedAt=now, xoá token
```

Bắt buộc verify email trước khi dùng — quan trọng với sản phẩm fintech gửi email nhắc thanh toán thật tới khách hàng, tránh tạo account bằng email rác/giả.

## 3. Login & token refresh

```
POST /auth/login { email, password }
  → so khớp passwordHash (bcrypt/argon2)
  → trả access token JWT (15 phút, payload chứa { userId, organizationId, role })
    + set refresh token (7 ngày, httpOnly cookie, lưu hash trong RefreshToken để revoke được)

POST /auth/refresh (đọc refresh token từ cookie)
  → validate còn hạn + chưa revoke → cấp access token mới, ĐỒNG THỜI rotate refresh token
    (revoke refresh token cũ, phát refresh token mới) — chống replay nếu refresh token bị đánh cắp

POST /auth/logout → revoke refresh token hiện tại
```

JWT payload nhúng sẵn `role` để `PermissionGuard` không cần query `Membership` mỗi request. Đánh đổi: nếu role của user bị đổi giữa chừng (vd downgrade từ FINANCE_MANAGER xuống VIEWER), quyền cũ vẫn còn hiệu lực cho tới khi access token hết hạn (tối đa 15 phút) — chấp nhận độ trễ này ở MVP thay vì query DB mỗi request; đổi role có hiệu lực ngay lập tức ở lần `/auth/refresh` tiếp theo vì access token mới luôn đọc `role` hiện tại từ `Membership`.

User thuộc nhiều Organization: access token mặc định gắn org đầu tiên/gần nhất dùng; `POST /auth/switch-organization` cấp access token mới với `organizationId`/`role` khác, chỉ cho phép org mà user có `Membership` đang active (`joinedAt != null`). JWT không được tự xem là bằng chứng membership; `JwtStrategy` phải re-validate `(userId, organizationId)` qua Membership và lấy role hiện tại.

## 4. Invite member

```
POST /organizations/:id/invites { email, role }
  Quyền: USER_MANAGE permission (OWNER, FINANCE_MANAGER — theo RBAC spec)
  → tạo MembershipInvite, gửi email chứa link + token (hết hạn 7 ngày)

POST /invites/accept { token, password (chỉ cần nếu email chưa có User) }
  - Email đã có User (có thể thuộc org khác) → bắt buộc JWT của chính User đó,
    accept chỉ tạo Membership mới, không tạo User trùng
  - Email chưa có User → tạo User (password nhập ở form accept), emailVerifiedAt=now luôn
    (invite-accept qua email coi như đã xác thực quyền sở hữu email)
  → set Membership.joinedAt=now, MembershipInvite.acceptedAt=now
```

## 5. Forgot / reset password

```
POST /auth/forgot-password { email } → luôn trả 200 dù email tồn tại hay không
  (tránh lộ thông tin email nào đã đăng ký); nếu tồn tại thì tạo PasswordResetToken + gửi email

POST /auth/reset-password { token, newPassword }
  → validate token còn hạn (30-60 phút) và chưa dùng (usedAt=null)
  → set passwordHash mới, usedAt=now, REVOKE toàn bộ RefreshToken hiện có của user
    (đăng xuất mọi thiết bị — lý do đổi password thường là nghi lộ)
```

`POST /auth/forgot-password` trả HTTP 200 và body thành công chung cho cả email tồn tại và không tồn tại; không trả 201/404 và không tiết lộ trạng thái tài khoản.

## 6. Rate limiting `/auth/*`

Dùng NestJS `ThrottlerModule` (đã là dependency phổ biến, không thêm thư viện mới):

```
/auth/login, /auth/forgot-password, /auth/signup:
  giới hạn 5 request / phút, theo cặp (IP, normalized email trong body)
  → vượt giới hạn trả 429, không tiết lộ thêm thông tin (thông báo chung "Quá nhiều yêu cầu, thử lại sau")

Implementation note: không dùng `@Throttle` mặc định nếu tracker chỉ theo IP; phải có custom tracker/key gồm IP + email cho ba endpoint trên.
```

Áp dụng riêng cho nhóm `/auth/*` vì đây là bề mặt tấn công brute-force/credential-stuffing rõ ràng nhất; không áp rate limit chung cho toàn bộ API ở spec này (nếu cần, thuộc phạm vi middleware/API-gateway chung, spec riêng sau).

## 7. Ngoài phạm vi

- SSO/OAuth social login (Google/Microsoft) — đã loại khỏi phạm vi ở multi-tenancy-rbac spec (Enterprise sau).
- 2FA/MFA — không có trong tài liệu gốc, thêm sau nếu yêu cầu compliance cao hơn.
- Rate limiting cho toàn bộ API (ngoài `/auth/*`) — thuộc phạm vi middleware chung, chưa có spec riêng.

## 8. Câu hỏi mở (không chặn implementation)

- `RefreshToken` có cần giới hạn số lượng thiết bị đăng nhập đồng thời (vd tối đa 5 refresh token active/user) hay không giới hạn ở MVP?
- Email invite hết hạn (7 ngày) — có cần API cho phép OWNER "gửi lại invite" (tạo token mới cùng `MembershipInvite` hay tạo bản ghi mới) không?
