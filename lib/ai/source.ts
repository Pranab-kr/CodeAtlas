import { createHash } from "node:crypto";

import type { Repository } from "@/lib/pipeline/github";

const TIMEOUT_MS = 15_000;

export class SourceNotFoundError extends Error {
  override name = "SourceNotFoundError";
}

export interface FetchedSource {
  source: string;
  /** sha256 of the bytes, the same hash the parser stored. */
  hash: string;
}

/**
 * The parser keeps hashes, not source. A cache miss reads the exact blob from
 * the analysed commit; the caller compares this hash before using it.
 */
export async function fetchFileAt(
  repository: Repository,
  sha: string,
  path: string,
): Promise<FetchedSource> {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${sha}/${encoded}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "codeatlas" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `Reading ${path} from GitHub took longer than ${TIMEOUT_MS / 1000} seconds.`,
      );
    }
    throw new Error(
      `Reading ${path} from GitHub failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new SourceNotFoundError(
        `${path} does not exist at commit ${sha.slice(0, 7)}.`,
      );
    }
    throw new Error(
      `GitHub answered ${response.status} when asked for ${path}.`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  return {
    source: bytes.toString("utf8"),
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
