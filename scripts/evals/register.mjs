// Scripts outside the app run through Node, not Next. Two differences matter:
// Next loads .env.local for us, and TypeScript imports use the "@/" alias and
// leave extensions off. This preload supplies both, so an eval can import the
// same client, prompt and database code the application uses.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const environment = process.env.NODE_ENV ?? "development";

// Next loads these from lowest to highest precedence. process.loadEnvFile does
// not overwrite a variable that is already set, so a value from the shell still
// wins, exactly as it does under Next.
for (const name of [
  ".env",
  `.env.${environment}`,
  ".env.local",
  `.env.${environment}.local`,
]) {
  const envFile = path.join(root, name);
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFile(candidate) {
  if (isFile(candidate)) {
    return candidate;
  }
  for (const extension of EXTENSIONS) {
    if (isFile(candidate + extension)) {
      return candidate + extension;
    }
  }
  for (const extension of EXTENSIONS) {
    const index = path.join(candidate, `index${extension}`);
    if (isFile(index)) {
      return index;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;

    if (specifier.startsWith("@/")) {
      candidate = path.join(root, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      candidate = path.resolve(
        path.dirname(fileURLToPath(context.parentURL)),
        specifier,
      );
    }

    if (candidate !== null) {
      const file = resolveFile(candidate);
      if (file !== null) {
        return { url: pathToFileURL(file).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
