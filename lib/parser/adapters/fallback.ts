import { NO_ROUTES, type FrameworkAdapter } from "../adapter.ts";
import { toolRole } from "./conventions.ts";

// Assumes no framework. Only the tool conventions give any file a role; the
// rest stay unclassified rather than getting the nearest fit.
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  detect: () => true,
  roleOf: (file) => toolRole(file.path),
  routes: () => NO_ROUTES,
};
