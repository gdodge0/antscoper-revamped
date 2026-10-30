# Deployment and operations

## GitHub

Repository: `gdodge0/antscoper-revamped`; SSH remote: `git@github.com:gdodge0/antscoper-revamped.git`.

- Default branch: **main**.
- Protect main: require a pull request, required status checks **Frontend**, **Worker**, **Browser**, **Containers**, and branches up to date before merging. Required approvals may be zero for solo maintenance.
- Keep force pushes and branch deletion disabled. Administrators retain the bypass chosen by the repository owner.
- Enable Actions with read-only default workflow permissions. The workflow declares `contents: read` and uses pinned official actions. No deployment secret is needed in GitHub.

The configured Coolify GitHub App receives main pushes and deploys the merged commit. Branch protection gates normal merges on CI. Administrator bypass can also bypass those checks; inspect CI before using it. No private Coolify API endpoint needs to be reachable from a GitHub runner.

`version-3` remains at `5387281612d6036b2182b6c3a1a07caaf044c3ef`, before the revamp. It is a historical reference, not a compatible container rollback target. New changes should use feature branches and pull requests into main.

## Coolify

Production target: **https://antscoper.gdodge.dev** on **lab0-apps**, project **Antscoper**, environment **production**.

Use the existing GitHub App with access to this repository. Choose **Docker Compose**, branch `main`, base directory `/`, Compose file `/compose.yaml`, and assign `https://antscoper.gdodge.dev:8080` to service `web`. Enable **Include Source Commit in Build** and automatic deployment. Nginx and worker image health checks are included. The one-shot `data-init` service exits successfully after setting volume permissions.

The optional provisioning helper uses the parent-directory key without committing it:

```bash
python3 deploy/coolify.py configure --key-file ../coolify_api_key.txt
python3 deploy/coolify.py deploy
python3 deploy/coolify.py status
python3 deploy/coolify.py enable-auto
```

`configure` deliberately disables automatic deployment until the first release is validated. Resource handles are saved in ignored `.secrets/coolify.json`; credentials are never saved there. Defaults target this installation; `--base`, `--server`, and `--github-app` allow reuse elsewhere.

No API key is currently required for Anteater API public endpoints. If needed, set `ANTEATER_API_KEY` as a runtime secret for `worker`, never a frontend build variable. Optional `SCHEDULE_TERMS=2026-92,2027-03` overrides automatic term selection; each term must have a valid calendar entry. Leave this unset for normal operation.

## Any Docker host

Install Docker with Compose v2, clone over SSH and run:

```bash
docker compose -f compose.yaml -f compose.local.yaml up --build -d
docker compose -f compose.yaml -f compose.local.yaml ps
```

The local override binds `127.0.0.1:8080`. For a public server, use `compose.yaml` alone and connect your reverse proxy to `web:8080` on the Compose network. Set `SOURCE_COMMIT` at build time to populate `/version.json`.

`schedule-data` is a named, deployment-local volume at `/var/lib/antscoper`. The worker runs as UID/GID 10001 with read/write access; Nginx runs as UID 101 with a read-only mount. Only `public/snapshot.json` and `public/status.json` are served. `private/` and `backups/` have mode 0700 and HTTP access returns 404. Builds contain campus assets and code, not runtime schedule backups.

The app shows an unavailable state until the first successful worker refresh. A subsequent frontend rebuild or redeploy retains the volume and existing publication. Do **not** use `docker compose down -v` on production; that removes schedule history and backups.

## Daily refresh and monitoring

The worker runs at 6:00 am Pacific, with an immediate first publication and catch-up after downtime. An advisory filesystem lock prevents overlapping refreshes. It fetches the academic calendar and complete schedules for all selected terms, normalizes regular meetings and dated finals, stages a generation, writes a compressed backup, then atomically publishes the self-contained JSON snapshot. A malformed, empty or failed provider response preserves the last successful publication. Retries run after 5 and 20 minutes, then wait for the next daily slot. Calendar fetch failures may use the last validated calendar.

Check:

```bash
curl -fsS https://antscoper.gdodge.dev/health
curl -fsS https://antscoper.gdodge.dev/version.json
curl -fsS https://antscoper.gdodge.dev/data/status.json
docker compose logs --tail 50 worker
```

`status.json` includes `lastAttempt`, `lastSuccess`, `nextRun`, a sanitized error category, term IDs and publication ID. Check last success as well as container health: heartbeat health proves the scheduler is running, not that its provider succeeded. The UI revalidates every five minutes and on returning to the tab. It warns after 26 hours, and treats availability as unknown after 48 hours.

Force a refresh without rebuilding:

```bash
docker compose exec worker python -m worker refresh
```

In Coolify, use the worker terminal or the application's generated Compose project on lab0-apps for the same commands. Keep API keys out of terminal output and logs.

## Backups, restore and rollback

Each successful publication creates `backups/TIMESTAMP-PUBLICATION_ID.json.gz`, containing the normalized snapshot and raw provider responses. Backups older than 30 days are pruned after successful publication. These are local recovery copies; for host-loss recovery, separately back up the persistent volume using your usual server backup system.

List and restore in the worker container:

```bash
docker compose exec worker sh -c 'ls -1 /var/lib/antscoper/backups'
docker compose exec worker python -m worker restore --backup /var/lib/antscoper/backups/SELECTED.json.gz
```

Restore uses the same lock and atomic publication. It marks status `restored_backup`; the next scheduled refresh resumes normal updates. Old backups retain their original fetched date, so stale data remains visibly unknown. Copy archives out with `docker compose cp worker:/var/lib/antscoper/backups/SELECTED.json.gz ./` if needed, keeping them outside Git.

Roll back code by redeploying a previously verified **schema-version-2-compatible** main commit in Coolify. Keep the same volume. If a later release changes schema, restore a compatible backup together with that release's code; do not point the legacy version-3 app at this volume.
