/**
 * The provider answers 409 when a request it is still processing is sent
 * again. That happens when a slow generation outlives the client timeout and
 * the SDK retries it. Waiting and retrying is the provider's own instruction.
 */
export async function withRetry<T>(
  run: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || statusOf(error) !== 409) {
        throw error;
      }
      await wait(attempt * 15_000);
    }
  }

  throw lastError;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const status = Reflect.get(error, "status");
  return typeof status === "number" ? status : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
