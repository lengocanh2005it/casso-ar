export const AUTO_MATCH_THRESHOLD = 90;
export const AUTO_MATCH_LEAD_MARGIN = 10;

interface AutoMatchCandidate {
  totalScore: number;
  remainingAmount: number;
}

// candidates must be sorted by totalScore descending (MatchingEngineService
// guarantees it).
export function canAutoMatch(
  candidates: AutoMatchCandidate[],
  transactionAmount: number,
): boolean {
  const top = candidates[0];
  if (!top) return false;
  const runnerUp = candidates[1];
  // Same rule whether the runner-up belongs to the same or another customer.
  const hasClearLead =
    !runnerUp || top.totalScore - runnerUp.totalScore >= AUTO_MATCH_LEAD_MARGIN;
  return (
    top.totalScore >= AUTO_MATCH_THRESHOLD &&
    transactionAmount <= top.remainingAmount &&
    hasClearLead
  );
}
