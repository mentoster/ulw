export const BUILTIN_PROFILES = Object.freeze({
  legacy: Object.freeze({
    artifactRoot: ".hermes",
    skillsRoot: "~/.hermes/skills",
    handoffTemplate: "/ulw-execute execute {planPath}",
    reviewCapability: "sub review",
  }),
  "project-local": Object.freeze({
    artifactRoot: ".ulw",
    skillsRoot: ".agents/skills",
    handoffTemplate: "/ulw-execute execute {planPath}",
    reviewCapability: "sub review",
  }),
});

export function builtinProfile(name) {
  return BUILTIN_PROFILES[name] ?? null;
}
