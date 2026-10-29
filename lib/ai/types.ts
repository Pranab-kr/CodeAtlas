/**
 * The explanation contract shared by the browser and the server action.
 * Nothing here imports Node, a database client or the AI SDK.
 */

export type ExplainTargetInput =
  | { kind: "file"; path: string }
  | { kind: "folder"; id: string };

/** Why an explanation may no longer describe the repository. */
export type StaleInfo =
  | {
      kind: "file-changed";
      analysedSha: string;
      headSha: string;
    }
  | {
      kind: "repository-moved";
      analysedSha: string;
      headSha: string;
    }
  | {
      kind: "unknown";
      message: string;
    };

export type ExplainActionResult =
  | {
      ok: true;
      body: string;
      /** True when the body came from the database without a model call. */
      cached: boolean;
      /** A cache write that failed. The answer still renders. */
      warning: string | null;
    }
  | {
      ok: false;
      error: string;
    };
