import { cp, lstat, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseOptions, requirePositional } from "../args.mjs";
import { resolveRuntimeContext, displayArtifactPath } from "../config/runtime-context.mjs";
import { CliError } from "../errors.mjs";
import { atomicWriteJson } from "../io/atomic-write.mjs";
import { resolveArtifactTarget } from "../io/path-policy.mjs";
import { renderArtifacts } from "../plan/render-artifacts.mjs";
import { migrateStateToCurrent } from "../state/migrations/index.mjs";
import { loadState, statePaths, writeState } from "../state/store.mjs";
import { output } from "./command-io.mjs";

async function exists(path) { return Boolean(await lstat(path).catch(() => null)); }

async function copyIfExists(source, target) {
  if (!await exists(source)) return false;
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: (await lstat(source)).isDirectory(), force: true });
  return true;
}

async function handler(argv, io, sourceContext) {
  const { positionals, options } = parseOptions(argv, { "dry-run": "boolean", yes: "boolean", "to-profile": "value", "to-artifact-root": "value", json: "boolean" });
  const slug = requirePositional(positionals, 0, "slug");
  const source = await loadState(sourceContext, slug);
  const destinationContext = await resolveRuntimeContext({
    workspace: sourceContext.workspace,
    profile: options["to-profile"] ?? sourceContext.profile,
    artifactRoot: options["to-artifact-root"],
    skillsRoot: sourceContext.skillsRoot,
  });
  const migrated = migrateStateToCurrent(source, destinationContext);
  const sourcePaths = await statePaths(sourceContext, slug);
  const destinationPaths = await statePaths(destinationContext, slug);
  const sameStatePath = sourcePaths.state === destinationPaths.state;
  if (!sameStatePath && migrated.state.schemaVersion === 2) {
    const previousArtifactRoot = migrated.state.provenance.artifactRoot;
    migrated.state.provenance.profile = destinationContext.profile;
    migrated.state.provenance.artifactRoot = destinationContext.artifactRootSetting;
    migrated.state.provenance.migratedByCliVersion = (await import("../command-registry.mjs")).CLI_VERSION;
    if (migrated.state.verification?.evidenceRoot?.startsWith(`${previousArtifactRoot}/evidence/`)) {
      migrated.state.verification.evidenceRoot = `${destinationContext.artifactRootSetting}/evidence/${migrated.state.verification.evidenceRoot.slice(`${previousArtifactRoot}/evidence/`.length)}`;
    }
    if (migrated.state.approval || migrated.state.review?.rounds?.length || migrated.state.review?.final) {
      migrated.reviewInvalidated = true;
      migrated.state.approval = null;
      migrated.state.review = { maxRounds: migrated.state.review.maxRounds, currentRound: 0, rounds: [], final: null };
      migrated.state.status = "awaiting-approval";
    }
    migrated.state.generated = { sourceStateSha256: null, draftSha256: null, planSha256: null };
    migrated.steps.push("relocate-artifact-root");
  }
  const actionPlan = {
    slug,
    fromSchemaVersion: source.schemaVersion,
    toSchemaVersion: migrated.state.schemaVersion,
    steps: migrated.steps,
    fromProfile: sourceContext.profile,
    toProfile: destinationContext.profile,
    fromArtifactRoot: sourceContext.artifactRoot,
    toArtifactRoot: destinationContext.artifactRoot,
    reviewInvalidated: migrated.reviewInvalidated,
    moveArtifacts: !sameStatePath,
    sourceStatePath: sourcePaths.state,
    destinationStatePath: destinationPaths.state,
  };
  if (migrated.steps.length === 0 && sameStatePath) {
    output(io, { ok: true, dryRun: Boolean(options["dry-run"]), changed: false, actionPlan }, options.json);
    return 0;
  }
  if (options["dry-run"]) {
    output(io, { ok: true, dryRun: true, changed: true, actionPlan }, options.json);
    return 0;
  }
  if (!options.yes) throw new CliError("plan migration requires explicit --yes confirmation", { code: "STATE_MIGRATION_CONFIRMATION_REQUIRED" });
  if (!sameStatePath && await exists(destinationPaths.state)) throw new CliError(`destination plan already exists: ${destinationPaths.state}`, { code: "STATE_MIGRATION_DESTINATION_EXISTS" });

  const migrationId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${source.schemaVersion}-to-${migrated.state.schemaVersion}`;
  const backupRoot = await resolveArtifactTarget(sourceContext, join("ulw", "migration-backups", slug, migrationId));
  const sourceDraft = await resolveArtifactTarget(sourceContext, join("drafts", `${slug}.md`));
  const sourcePlan = await resolveArtifactTarget(sourceContext, join("plans", `${slug}.md`));
  await copyIfExists(sourcePaths.root, join(backupRoot, "state-root"));
  await copyIfExists(sourceDraft, join(backupRoot, "draft.md"));
  await copyIfExists(sourcePlan, join(backupRoot, "plan.md"));
  await atomicWriteJson(join(backupRoot, "migration.json"), { schemaVersion: 1, migrationId, createdAt: new Date().toISOString(), actionPlan });

  let destinationCreated = false;
  try {
    let written;
    if (sameStatePath) written = await writeState(destinationContext, migrated.state, { previous: source, checkpoint: "schema-migration" });
    else {
      written = await writeState(destinationContext, migrated.state, { incrementRevision: false });
      destinationCreated = true;
    }
    await renderArtifacts(destinationContext, written);
    if (!sameStatePath) {
      await rm(sourcePaths.root, { recursive: true, force: true });
      await rm(sourceDraft, { force: true });
      await rm(sourcePlan, { force: true });
    }
    output(io, { ok: true, dryRun: false, changed: true, actionPlan, backupRoot, statePath: displayArtifactPath(destinationContext, "ulw", slug, "state.json") }, options.json);
    return 0;
  } catch (error) {
    if (destinationCreated) {
      await rm(destinationPaths.root, { recursive: true, force: true }).catch(() => {});
      await rm(await resolveArtifactTarget(destinationContext, join("drafts", `${slug}.md`)), { force: true }).catch(() => {});
      await rm(await resolveArtifactTarget(destinationContext, join("plans", `${slug}.md`)), { force: true }).catch(() => {});
    } else {
      await rm(sourcePaths.root, { recursive: true, force: true }).catch(() => {});
      await cp(join(backupRoot, "state-root"), sourcePaths.root, { recursive: true, force: true }).catch(() => {});
      await copyIfExists(join(backupRoot, "draft.md"), sourceDraft);
      await copyIfExists(join(backupRoot, "plan.md"), sourcePlan);
    }
    throw error;
  }
}
export function register(registerCommand) { registerCommand("plan", "migrate", handler); }
