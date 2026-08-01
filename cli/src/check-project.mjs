import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deploySkills } from "./skills/deploy.mjs";
import { runDoctor } from "./doctor/run-doctor.mjs";
import { validateOfficialSkills } from "./skills/official-validator.mjs";

const tests = spawnSync(process.execPath, ["--test"], { stdio: "inherit" });
if (tests.status !== 0) process.exit(tests.status ?? 1);
await validateOfficialSkills();
const skillsRoot = await mkdtemp(join(tmpdir(), "ulw-check-skills-"));
try {
  await deploySkills(skillsRoot);
  const doctor = await runDoctor({ workspace: process.cwd(), skillsRoot, binName: "node" });
  if (!doctor.ok) {
    process.stderr.write(`${JSON.stringify(doctor, null, 2)}\n`);
    process.exit(1);
  }
  process.stdout.write("project check passed\n");
} finally {
  await rm(skillsRoot, { recursive: true, force: true });
}
