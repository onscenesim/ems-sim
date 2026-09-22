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
