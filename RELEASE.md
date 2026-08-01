# ULW CLI Release Process

The canonical release artifact is a locally verified tarball created from an
exact `v<package-version>` tag. Public npm publication and automated publishing
are intentionally outside the required contract.

## Local preflight

1. Ensure the package, command registry, skill metadata, changelog, and lockfile
   use one version.
2. Run `npm test`, `npm run check`, `npm run eval:fixture`, and
   `npm pack --dry-run`.
3. Commit all release inputs and confirm `git status --short` is empty.
4. Create the exact version tag.
5. Run `node scripts/package-release.mjs`.

The packager refuses dirty trees, mismatched tags, unexpected package entries,
missing bundled skills or bin files, failed verification, routing threshold
failures, checksum changes, and failed clean-prefix installation.

Successful packaging creates:

- `dist/ulw-cli-<version>.tgz`
- `dist/SHA256SUMS`
- `dist/routing-metrics.json`

Verify with `sha256sum --check dist/SHA256SUMS` before installation.

## Optional distribution

After local verification, an operator may attach the tarball, checksum file,
and routing metrics to a GitHub Release manually. The repository does not
automate tagging, publishing, or credentialed release creation.

## Rollback

Install a previously verified release tarball, verify its SHA-256, then use the
manifest-backed skill lifecycle:

```bash
ulw skill update --dry-run --json
ulw skill update --json
ulw skill rollback --version <previous-version> --json
ulw skill uninstall --dry-run --json
```

Use the same profile/config/root options as the installation being managed.
Never replace or remove user-modified owned files without resolving drift
explicitly. Plan state/root changes use `ulw plan migrate --dry-run` followed
by an explicit confirmed migration; they are not part of package installation.
