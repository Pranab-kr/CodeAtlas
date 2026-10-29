import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x as extract } from "tar";

/** A failure whose message is written for the person watching the run. */
export class PipelineError extends Error {
  override name = "PipelineError";
}

export interface Repository {
  owner: string;
  name: string;
  /** The same label for every spelling of the URL. */
  label: string;
  /** The canonical URL stored on the project. */
  url: string;
}

const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+$/;
const API_TIMEOUT_MS = 15_000;
const ARCHIVE_TIMEOUT_MS = 5 * 60_000;
/** Past this the archive isn't downloaded at all. */
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

/**
 * Accepts what people paste: owner/name, github.com/owner/name, a full URL, a
 * URL with /tree/... on the end. Anything that isn't a GitHub repository is
 * refused here, before a row is created.
 */
export function parseRepositoryUrl(input: string): Repository {
  const trimmed = input.trim();
  const bare = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  let owner: string | undefined;
  let name: string | undefined;

  if (bare && !bare[1].includes(".")) {
    owner = bare[1];
    name = bare[2];
  } else {
    let url: URL;
    try {
      url = new URL(
        /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
      );
    } catch {
      throw new PipelineError(`"${trimmed}" isn't a GitHub repository URL`);
    }

    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      throw new PipelineError(
        `Only github.com repositories can be analysed, not ${url.hostname}`,
      );
    }

    [owner, name] = url.pathname.split("/").filter(Boolean);
  }

  name = name?.replace(/\.git$/i, "");

  if (
    !owner ||
    !name ||
    !REPOSITORY_NAME.test(owner) ||
    !REPOSITORY_NAME.test(name)
  ) {
    throw new PipelineError(
      `"${trimmed}" doesn't name a repository; expected github.com/owner/name`,
    );
  }

  const lowerOwner = owner.toLowerCase();
  const lowerName = name.toLowerCase();

  return {
    owner: lowerOwner,
    name: lowerName,
    label: `${lowerOwner}/${lowerName}`,
    url: `https://github.com/${lowerOwner}/${lowerName}`,
  };
}

/**
 * The commit is resolved first and the archive fetched at exactly that commit,
 * so the recorded sha is the code that was parsed, not whatever HEAD became
 * while the download ran. Unauthenticated on purpose: no token is stored.
 */
export async function resolveHeadCommit(
  repository: Repository,
): Promise<string> {
  const what = `Asking GitHub for ${repository.label}'s latest commit`;
  const response = await withTimeout(what, API_TIMEOUT_MS, () =>
    fetch(
      `https://api.github.com/repos/${repository.owner}/${repository.name}/commits/HEAD`,
      {
        headers: {
          Accept: "application/vnd.github.sha",
          "User-Agent": "codeatlas",
        },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      },
    ),
  );

  if (response.ok) {
    const sha = (
      await withTimeout(what, API_TIMEOUT_MS, () => response.text())
    ).trim();
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      throw new PipelineError(
        `GitHub returned an unexpected commit for ${repository.label}`,
      );
    }
    return sha;
  }

  if (response.status === 404) {
    throw new PipelineError(
      `${repository.label} doesn't exist on GitHub, or it isn't public`,
    );
  }

  if (response.status === 409 || response.status === 422) {
    throw new PipelineError(
      `${repository.label} has no commits to analyse`,
    );
  }

  if (
    (response.status === 403 || response.status === 429) &&
    response.headers.get("x-ratelimit-remaining") === "0"
  ) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const when = Number.isFinite(reset)
      ? ` until ${new Date(reset * 1000).toISOString()}`
      : "";
    throw new PipelineError(
      `GitHub's unauthenticated rate limit is used up${when}`,
    );
  }

  throw new PipelineError(
    `GitHub answered ${response.status} when asked for ${repository.label}'s latest commit`,
  );
}

/** Streams the archive through tar, never buffering the whole download. */
export async function downloadArchive(
  repository: Repository,
  sha: string,
  directory: string,
): Promise<number> {
  const what = `Downloading the archive for ${repository.label}`;
  const signal = AbortSignal.timeout(ARCHIVE_TIMEOUT_MS);
  const response = await withTimeout(what, ARCHIVE_TIMEOUT_MS, () =>
    fetch(
      `https://codeload.github.com/${repository.owner}/${repository.name}/tar.gz/${sha}`,
      { headers: { "User-Agent": "codeatlas" }, signal },
    ),
  );

  const body = response.body;
  if (!response.ok || body === null) {
    throw new PipelineError(
      `${what} failed: GitHub answered ${response.status}`,
    );
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ARCHIVE_BYTES) {
    throw tooLarge(repository);
  }

  // content-length isn't always sent, so the limit is enforced on the bytes
  // too. One signal covers the request and the body.
  let received = 0;
  const limit = new Transform({
    transform(
      chunk: Buffer,
      _encoding: BufferEncoding,
      done: TransformCallback,
    ) {
      received += chunk.byteLength;
      done(received > MAX_ARCHIVE_BYTES ? tooLarge(repository) : null, chunk);
    },
  });

  await withTimeout(what, ARCHIVE_TIMEOUT_MS, () =>
    pipeline(
      Readable.from(chunks(body)),
      limit,
      extract({ cwd: directory, strip: 1 }),
    ),
  );

  return received;
}

function tooLarge(repository: Repository): PipelineError {
  return new PipelineError(
    `${repository.label}'s archive is larger than ${
      MAX_ARCHIVE_BYTES / (1024 * 1024)
    } MB, so it wasn't analysed`,
  );
}

// An aborted fetch throws a bare "TimeoutError"; the failed row should say
// what timed out.
async function withTimeout<T>(
  what: string,
  ms: number,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new PipelineError(
        `${what} took longer than ${ms / 1000} seconds, so it was stopped`,
        { cause: error },
      );
    }
    throw error;
  }
}

// Read through the reader rather than Readable.fromWeb: the app's DOM types
// and Node's stream types disagree about the body, and this needs no cast.
async function* chunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
