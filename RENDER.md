# Render persistence

Player profiles, scenario history, saved sessions, and completed run logs are
files under the directory configured by `EMS_DATA_DIR`.

For the production Render service:

1. Open the service in the Render Dashboard and select **Disks**.
2. Attach a persistent disk with the mount path `/var/data` (1 GB is ample).
3. Under **Environment**, set `EMS_DATA_DIR` to `/var/data`.
4. Redeploy the service.

Only files written beneath the disk's mount path survive a deploy. Merely
having a `disk:` entry in `render.yaml` does not change a manually-created
service unless that service is managed by and synced from the Blueprint.

Production startup intentionally fails if `EMS_DATA_DIR` is missing or its
directory does not exist. This prevents the app from appearing healthy while
quietly writing profiles to Render's disposable filesystem.

The persistent files are:

- `players.json` — player names, PIN hashes, login sessions, and progress
- `user_history.json` — per-player scenario variety history
- `completed_runs.json` — the most recent completed run logs
- `<session-id>.json` — resumable scenario snapshots (pruned after 30 days)

## Node runtime and dependency updates

Use Node.js **24.22.1** for development and deployment, as pinned in
`.node-version` and the Blueprint's `NODE_VERSION`. This is the Node 24
[October 21 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
including the Brotli, TLS/DNS, and eMudhra certificate-trust fixes. The
`package.json` engine range permits subsequent Node 24 patches but excludes
older vulnerable releases and untested major versions.

Install with `npm ci --include=dev --ignore-scripts`. Direct dependencies are
pinned to exact versions, and `package-lock.json` fixes the complete tree and
package integrity hashes. The October 27 refresh includes `body-parser` 2.4.0
([advisory](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828))
and `ip-address` 10.7.5
([advisory](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-rxp7-6hxx-x8q5)).
Package lifecycle scripts are disabled during installation; the current
dependencies do not require them to run the simulator.

For an existing manually managed Render service, set `NODE_VERSION=24.22.1`
and the build command above in the Dashboard, then redeploy. An existing
`NODE_VERSION` setting takes precedence over `.node-version`
([Render documentation](https://render.com/docs/node-version)). For a
Blueprint-managed service, sync the updated Blueprint and redeploy. Confirm
the new runtime in the deployment logs and check `/health` after startup.
Repository changes alone do not update a running service or the system Node
installation on a developer's computer.
