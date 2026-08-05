# Skill: update-feature-map

Update feature-map.md when a plan/ticket is completed.

## When to use

User says: "cập nhật feature-map", "update feature map", "hoàn thành plan"

## Steps

1. Identify the plan number and PR number
2. Open `docs/wayfinder/feature-map.md`
3. Find the plan section (e.g., "#### Plan #18 — Frontend Design System")
4. Update fields:
   - `**Status**: open` → `**Status**: done ✅`
   - Add `**Shipped**: YYYY-MM-DD — PR #<number> merged, <N> commits`
5. Update ticket count:
   - `🟢 done (N):` increment count
   - `🔴 open/not started (M):` decrement count
6. Update Frontier section:
   - Remove completed plan from "Next available tickets"
   - Add newly unblocked plans
7. Use `verification-before-completion` and confirm the plan/PR reference and counts are correct.
8. Commit on the current ticket branch: `docs: update feature-map — Plan #<N> done (<name>)`
9. Push the ticket branch and open/update its PR; never push directly to `main`.
