---
status: proposed
---

# Organization has exactly one OWNER (single-owner strict)

Prior to this decision, `invite-member` and `change-member-role` let any actor
holding `USER_MANAGE`/`ORGANIZATION_MANAGE` grant `OWNER` to an arbitrary
member, with no ceiling — only a floor (`assertNotLastOwner`) stopped the
*last* `OWNER` from being removed. An organization could casually end up with
several co-equal `OWNER`s and no single account holding final authority over
billing, org deletion, or ownership transfer, unlike GitHub/Slack/Notion
(issue #314).

We adopt a single-owner strict model: an `Organization` has exactly one
`OWNER` `Membership` at all times. `OWNER` is removed from the role values
`invite-member` and `change-member-role` accept (a DTO-level type exclusion,
not a runtime check). The only way to grant `OWNER` is a new `OwnershipTransferRequest`
flow — current-password+OTP from the existing `OWNER`, separate acceptance by
the target, then an atomic swap that demotes the prior `OWNER` to
`FINANCE_MANAGER`. Organizations already holding more than one `OWNER` are
backfilled by a migration that keeps the earliest-joined `OWNER` `Membership`
and demotes the rest.

## Considered Options

Keep multi-owner but add a separate "primary owner" flag for ultimate-authority
actions (billing, org deletion), leaving several co-equal `OWNER`s otherwise
allowed. Rejected: it doesn't remove the actual bug (any `OWNER` can still
mint peer `OWNER`s casually) and adds a second concept (`primary` vs `OWNER`)
that every ultimate-authority check would have to thread through, for no
clearer benefit than simply capping `OWNER` at one.

## Consequences

`invite-member`/`change-member-role` need no new `ErrorCode` for this —
excluding `OWNER` from their accepted role type turns a bad request into an
ordinary 400 `VALIDATION_ERROR`. Any future "ultimate authority" check (billing,
org deletion) can just mean "the org's `OWNER`" — no separate primary-owner
concept required.
