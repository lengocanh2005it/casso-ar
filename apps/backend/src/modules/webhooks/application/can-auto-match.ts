export const AUTO_MATCH_THRESHOLD = 90;
export const AUTO_MATCH_LEAD_MARGIN = 10;

interface AutoMatchCandidate {
  totalScore: number;
  remainingAmount: number;
}

// A single candidate has no runner-up, hence a clear lead. Shared with the
// Exception Queue read model so both judge "ambiguous match" identically.
export function hasClearLead(
  topScore: number,
  runnerUpScore: number | null,
): boolean {
  return (
    runnerUpScore === null || topScore - runnerUpScore >= AUTO_MATCH_LEAD_MARGIN
  );
}

// candidates must be sorted by totalScore descending (MatchingEngineService
// guarantees it).
export function canAutoMatch(
  candidates: AutoMatchCandidate[],
  transactionAmount: number,
): boolean {
  const top = candidates[0];
  if (!top) return false;
  // Same rule whether the runner-up belongs to the same or another customer.
  return (
    top.totalScore >= AUTO_MATCH_THRESHOLD &&
    transactionAmount <= top.remainingAmount &&
    hasClearLead(top.totalScore, candidates[1]?.totalScore ?? null)
  );
}
