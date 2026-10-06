export function createTwoPartyStartGate(): () => Promise<void> {
  let readyCount = 0;
  let releaseStart!: () => void;
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });

  return async (): Promise<void> => {
    readyCount += 1;
    if (readyCount === 2) releaseStart();
    await startGate;
  };
}
