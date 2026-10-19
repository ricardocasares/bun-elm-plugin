/** Serialises `elm make` invocations: concurrent compiles sharing one `elm-stuff` corrupt each other. */
let tail: Promise<void> = Promise.resolve();

export const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};
