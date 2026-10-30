# Antscoper

Find classrooms with time between classes at UC Irvine. React, TypeScript and Vite power the approved Broadsheet UI, with an architectural campus map, mobile pull-up sheet, desktop room list, and dated schedules. A Python worker publishes schedules to an unprivileged Nginx container through a persistent volume.

Production: **[antscoper.gdodge.dev](https://antscoper.gdodge.dev)**.

## Run locally

Use Node 24 (see `.node-version`), npm and Python 3.11+.

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Run commands from this repository, the inner `antscoper-revamped` directory. The development preview uses the saved Fall 2026 fixture, starts Thursday, October 29 at 2:15 pm, and needs no credentials. The fixture is never bundled as a production schedule.

Select **Now** for the current campus date/time in `America/Los_Angeles`. Previous/next arrows move by week; each weekday includes its date. Drag the time dial or use arrow keys (15 minutes), Home and End. The mobile sheet supports map, split and room-list positions. Pinch the map or use its zoom buttons. Press `/` to search. Shared links retain the room, date and time; saved rooms persist in this browser.

To develop against actual schedules instead:

```bash
npm run data:refresh
SCHEDULE_ROOT="$PWD/.runtime" npm run dev
```

Run `npm run worker` in another terminal for automatic updates. `.runtime/` is ignored by Git.

## Schedule data

All production schedule and calendar data comes from **[Anteater API](https://anteaterapi.com)**, the provider behind AntAlmanac. The worker uses `/v2/rest/calendar/all` and `/v2/rest/websoc`. There is no direct-UCI scraping fallback. The default policy includes the current term and every published upcoming term, including overlapping summer sessions.

Regular meetings apply within instructional dates. Finals are dated events in their published rooms and never repeat into other weeks. TBA or unlocated finals, academic breaks, unpublished dates and data more than 48 hours old show unknown availability. Known conflicts remain visible. End times include one ten-minute turnover buffer. Weekends and hours outside 7 am–10 pm are usually locked. Schedules describe classes, not physical occupancy, reservations or guaranteed access; holidays and special closures are not modeled.

The worker bootstraps an empty volume, catches up after downtime, and refreshes daily at **6:00 am America/Los_Angeles**, including daylight-saving changes. It validates a complete generation before replacing the public snapshot. Failed updates retain the last successful publication and retry after 5 and 20 minutes. Compressed backups and raw provider responses stay on the deployment volume for 30 days; they are not committed or publicly served.

`frontend/fixtures/demo.json` preserves the approved development schedule. `frontend/fixtures/dated.json` provides deterministic browser tests for finals, unknown schedules and term transitions. Neither is a production fallback. The legacy Flask/Datastore app is preserved on `version-3`; [historical documentation](docs/legacy.md) describes it.

## Campus map

The academic campus contains 464 real building footprints, eight districts, architectural profiles, Aldrich Park, Ring Mall, and schedule-backed badges. Drag to pan, pinch/wheel to zoom, or use the district menu and keyboard. Window panes remain visible at all zoom levels. Cyan selections follow building geometry. The 67 fixture building codes are audited: 352 rooms are mapped and two UCI locations are explicitly outside this map.

Walking estimates use real coordinates from ALP: distance × 1.3 at 80 meters/minute. Off-map or unverified locations remain searchable without a walking estimate. Map settings offer a locally bundled USGS bare-earth heightmap, on by default, with initial relief of 1.5× and a 0.5×–3× slider. Terrain shadows default off; building shadows default on. The shadow controls are independent, and all preferences are saved in this browser. Ten pedestrian bridges are modeled, including the flat Humanities–Student Center crossing, third-floor Mesa Parking connection, elevated Student Center terrace, and Watson spiral ramp. Their reference views are available in the desktop Explore menu. Building heights and structural details are visual approximations.

Use `?map=schematic` for the original drawing or `?map=alp` for the approved ALP composition. See [sources and maintenance](docs/campus-map.md), the [building audit](docs/campus-building-audit.md), and [ALP model notes](docs/alp-map.md).

## Validation

```bash
npm test
npm run build
npm run map:check
npx playwright install --with-deps chromium
npm run test:browser
```

Headless Chromium checks cover six viewports from 320×740 to 1280×800, including dates, history, finals, shared links, every campus district, map gestures, room navigation, mobile sheet positions, keyboard controls, rendering budgets and WebGL recovery. Browser artifacts go to `test-results/browser/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to reuse an installed Chromium executable.

Container checks use temporary containers and volumes without upstream requests:

```bash
docker build -f deploy/frontend.Dockerfile -t antscoper-test-web .
docker build -f deploy/worker.Dockerfile -t antscoper-test-worker .
python3 -B -m tests.container_smoke
```

GitHub Actions runs four required checks: **Frontend**, **Worker**, **Browser**, and **Containers**. `main` is production; `version-3` retains the pre-revamp application. See [deployment and operations](docs/deployment.md) for GitHub settings, Coolify, updates and restores.

Reviewed live views: [desktop](docs/preview/live-desktop.png), [mobile](docs/preview/live-phone.png), and [dated finals](docs/preview/live-finals.png).

## Docker / Coolify

```bash
docker compose -f compose.yaml -f compose.local.yaml up --build -d
# http://127.0.0.1:8080
```

Production uses `compose.yaml` behind your proxy; it publishes no host ports. Route HTTPS to `web:8080`. Coolify builds the same Compose application from `main`, using the existing GitHub App for automatic deployment on push. Schedules update independently of frontend builds. `/health` checks web liveness, `/data/status.json` reports refresh state, and `/version.json` identifies the build commit.
