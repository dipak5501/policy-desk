import { defaultPolicyConfig } from "./config";
import type { PolicyConfig } from "./types";

/** Single source of truth for live policy (env-backed defaults). */
export function getActivePolicy(): PolicyConfig {
  return defaultPolicyConfig();
}
