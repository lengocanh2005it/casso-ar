export interface ReceivableCombinationCandidate {
  receivableId: string;
  remainingAmount: number;
}

export interface ReceivableCombinationSearchResult {
  status: 'COMPLETE' | 'INCOMPLETE';
  combinations: string[][];
}

export const MAX_RECEIVABLE_CANDIDATES = 100;
const MAX_SEARCH_STEPS = 100_000;
const MAX_COMBINATIONS = 20;

export function findReceivableCombinations(
  receivables: ReceivableCombinationCandidate[],
  transferAmount: number,
): ReceivableCombinationSearchResult {
  if (transferAmount <= 0) {
    return { status: 'COMPLETE', combinations: [] };
  }
  if (
    !Number.isSafeInteger(transferAmount) ||
    receivables.length > MAX_RECEIVABLE_CANDIDATES ||
    receivables.some(
      ({ remainingAmount }) => !Number.isSafeInteger(remainingAmount),
    )
  ) {
    return { status: 'INCOMPLETE', combinations: [] };
  }

  const eligible = receivables
    .filter(
      ({ remainingAmount }) =>
        Number.isSafeInteger(remainingAmount) &&
        remainingAmount > 0 &&
        remainingAmount <= transferAmount,
    )
    .sort(
      (a, b) =>
        a.remainingAmount - b.remainingAmount ||
        (a.receivableId < b.receivableId
          ? -1
          : a.receivableId > b.receivableId
            ? 1
            : 0),
    );

  if (eligible.length < 2) {
    return { status: 'COMPLETE', combinations: [] };
  }

  const suffixAmounts = new Array<number>(eligible.length + 1).fill(0);
  for (let index = eligible.length - 1; index >= 0; index -= 1) {
    suffixAmounts[index] = Math.min(
      transferAmount,
      suffixAmounts[index + 1] + eligible[index].remainingAmount,
    );
  }

  const combinations: string[][] = [];
  const selected: string[] = [];
  let searchSteps = 0;
  let incomplete = false;

  function search(start: number, total: number): void {
    if (total + suffixAmounts[start] < transferAmount) return;

    for (let index = start; index < eligible.length; index += 1) {
      searchSteps += 1;
      if (searchSteps > MAX_SEARCH_STEPS) {
        incomplete = true;
        return;
      }

      const candidate = eligible[index];
      const nextTotal = total + candidate.remainingAmount;
      if (nextTotal > transferAmount) continue;

      selected.push(candidate.receivableId);
      if (nextTotal === transferAmount) {
        if (selected.length >= 2) {
          if (combinations.length === MAX_COMBINATIONS) {
            incomplete = true;
            selected.pop();
            return;
          }
          combinations.push([...selected]);
        }
      } else {
        search(index + 1, nextTotal);
      }
      selected.pop();

      if (incomplete) return;
    }
  }

  search(0, 0);
  return incomplete
    ? { status: 'INCOMPLETE', combinations: [] }
    : { status: 'COMPLETE', combinations };
}
