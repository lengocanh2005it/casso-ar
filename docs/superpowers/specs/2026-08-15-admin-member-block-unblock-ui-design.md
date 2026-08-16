# Admin Platform member block/unblock — issue #186

## Summary

Issue #186 delivers the second surface of #181: an authenticated Admin
Platform Operator can inspect an organization and block or unblock any of its
members, including the organization `OWNER`. The existing operator endpoints
for block/unblock are reused; this ticket adds the missing organization detail
and member-list reads plus the Admin console UI.

## Resolved decisions

1. **Navigation**: add a `Thành viên` link to each row on
   `/admin/organizations`, opening `/admin/organizations/:orgId/members`.
   The members page has a back link to the organizations list.
2. **Organization detail**: add `GET /api/v1/admin/organizations/:id`, returning
   `id`, `name`, `status`, and `createdAt`. The members page loads this endpoint
   for its header and uses the existing standard 404/error handling.
3. **Member list**: add
   `GET /api/v1/admin/organizations/:orgId/members?page&limit&status&search`.
   The response contains two independently counted collections, `members` and
   `pendingInvites`, sharing the requested page and limit. The response does
   not duplicate organization detail data.
4. **Filtering and search**: `status` accepts `ALL`, `ACTIVE`, `BLOCKED`, or
   `PENDING`. `ALL` shows both collections; `ACTIVE`/`BLOCKED` filter members;
   `PENDING` shows unaccepted invites, including expired invites. `search` is
   trimmed, case-insensitive, and partial: member rows match name or email;
   pending invites match email.
5. **Pending invites**: render a separate read-only `Lời mời đang chờ`
   section with email, role, invited date, expiry date, and an `Đã hết hạn`
   badge when appropriate. Resend/revoke is tracked separately in issue #189.
6. **Block/unblock UX**: member rows show status badges and use the existing
   `BreakerSwitch` + `AlertDialog` pattern. The block dialog explicitly warns
   when the target is an `OWNER`; no type-to-confirm flow is added. Pending
   invite rows have no block/unblock action.
7. **Mutation behavior**: after block/unblock succeeds, invalidate/refetch the
   member query. Errors stay inline, matching the current organizations page;
   no new toast system is introduced. An organization in `LOCKED` status can
   still be inspected and managed by an Operator.

## Architecture

The Admin controller remains presentation-only. A new admin organization-detail
use case reads through `IOrganizationRepository`, and a new admin members use
case reads through the existing membership, invite, and user repository ports.
The repository read methods gain optional status/search filters so filtering,
pagination, and counts happen in PostgreSQL rather than by loading an entire
organization into memory. The existing block/unblock use cases and
`AdminAuthGuard` are unchanged.

The frontend keeps the existing Admin console layout and design tokens. The
members page is a compact operator workspace: a context header and back link,
one search/filter control row, then two quiet data registers (members and
pending invites) sharing one pager. The signature element is the access-state
column: active/blocked badges and a clear switch affordance make the risk of
the action visible without adding a new visual system.

## Frontend design pass

**Subject and audience:** this is an internal operator access desk. Its one
job is to answer “who can enter this organization right now?” and make a
deliberate access change when needed. The design should feel inspectable and
operational, not like a consumer settings page.

**Tokens and type:** inherit the existing `Be Vietnam Pro` family and the
current oklch token set: green `primary` for active/available states, red
`destructive` only for blocked/dangerous actions, and muted foreground/border
tokens for metadata. Organization IDs remain the only monospaced data. No new
font, color, shadow, or radius token is justified for this page.

**Layout:** use the existing Admin page rhythm rather than adding cards or a
hero. The header gives context first, controls second, data third:

```text
← Organizations                                      ADMIN CONSOLE
Organization name
<organization id> · Created <date> · <ACTIVE/LOCKED badge>

[ Search name or email                         ] [Status ▾]

Members                                            <count>
┌ Name ───────────── Email ───── Role ─ Status ─ Action ┐
│ ...                                                   │
└───────────────────────────────────────────────────────┘

Pending invites                                     <count>
┌ Email ───────────── Role ─ Invited ─ Expires ────────┐
│ ...                                      Đã hết hạn  │
└──────────────────────────────────────────────────────┘

Trang n / m                              Trước  Sau
```

**Signature and restraint:** the access-state column is the page's one
memorable device. A blocked badge and the switch affordance sit together so
the operator sees state and consequence in one scan. Avoid decorative status
cards, gradients, avatars, or a new dashboard shell; those would compete with
the decision the page exists to support.

**Interaction quality:** all actions remain keyboard reachable with visible
focus rings; switch labels name the target member; dialogs use explicit
Vietnamese consequences; tables collapse horizontally without hiding the
action column; loading, empty, error, and reduced-motion states use the
existing primitives and conventions.

## Response shapes

```ts
type AdminMembersResponse = {
  members: {
    items: Array<{
      id: string;
      userId: string;
      name: string;
      email: string;
      role: Role;
      joinedAt: string | null;
      status: MembershipStatus;
      blockedAt: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  };
  pendingInvites: {
    items: Array<{
      id: string;
      email: string;
      role: Role;
      invitedAt: string;
      expiresAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
  };
};
```

## Testing and scope

Backend unit coverage will cover detail/list use cases, status/search
filtering, pagination, pending/expired invite inclusion, and controller
contracts. Frontend tests will cover the new route, organization/member API
queries, search/filter URL state, both tables, owner warning, mutation
refetch, and error/empty/loading states. Existing admin organization tests and
the full repository verification suite must remain green.

Out of scope: resend/revoke pending invite actions (issue #189), audit/history
UI, changes to membership domain behavior, and changes to the existing
operator block/unblock endpoints.
