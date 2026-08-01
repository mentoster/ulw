import { CliError } from "../../errors.mjs";
import { CURRENT_STATE_SCHEMA_VERSION } from "../schema.mjs";
import { migrateV1ToV2 } from "./v1-to-v2.mjs";

export function migrateStateToCurrent(state, destinationContext) {
  let current = structuredClone(state);
  let reviewInvalidated = false;
  const steps = [];
  while (current.schemaVersion < CURRENT_STATE_SCHEMA_VERSION) {
    if (current.schemaVersion === 1) {
      const migrated = migrateV1ToV2(current, destinationContext);
      current = migrated.state;
      reviewInvalidated ||= migrated.reviewInvalidated;
      steps.push("1-to-2");
      continue;
    }
    throw new CliError(`no migration exists from schemaVersion ${current.schemaVersion}`, { code: "STATE_MIGRATION_UNSUPPORTED" });
  }
  if (current.schemaVersion > CURRENT_STATE_SCHEMA_VERSION) throw new CliError(`state schemaVersion ${current.schemaVersion} is newer than this CLI`, { code: "STATE_SCHEMA_FUTURE" });
  return { state: current, steps, reviewInvalidated };
}
