let scryptChain: Promise<void> = Promise.resolve();

export function runScryptExclusive<T>(run: () => Promise<T>): Promise<T> {
  const result = scryptChain.then(run, run);
  scryptChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
