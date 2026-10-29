export interface AdapterFile {
  path: string;
  folder: string;
  source: string;
}

export interface FileRole {
  role: string;
}

/**
 * Framework knowledge lives behind this interface. The parser never asks what
 * framework a repository uses; it only hands each file to the adapter.
 */
export interface FrameworkAdapter {
  readonly name: string;
  classifyFile(file: AdapterFile): FileRole | null;
}

/**
 * The fallback knows nothing about any framework. It is the only adapter in
 * phase 3, so every file gets a null role.
 */
export const noFrameworkAdapter: FrameworkAdapter = {
  name: "none",
  classifyFile: () => null,
};
