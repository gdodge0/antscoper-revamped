# Campus architectural map

The full isometric map is the default at <http://127.0.0.1:5173/>. `?map=campus` is an explicit equivalent. The original lightweight drawing is available at `?map=schematic`, and the reviewed ALP composition remains at `?map=alp`. All three preserve room and building URLs.

## Coverage and architectural treatment

The local geographic snapshot contains **464 building footprints**, **2,049 path/road segments**, and **360 landscape/plaza surfaces**, covering the academic core and the Health Sciences teaching area. Surrounding housing, parking and service buildings provide simplified context. The campus overview includes Aldrich Park and the real Ring Mall paths.

All **67 scheduled building codes** are audited. **352 of 354 room records** resolve to mapped locations. `uci-barn` (eastern campus) and `uci-mc` (Medical Center) remain searchable with independent, explicit off-map statuses. They receive neither a fictitious shared pin nor a walking estimate. The ambiguous historical `?building=uci` link still lists both records, while their individual room links remain unchanged.

Eight districts cover the campus landmarks, Humanities/Biology, Physical Sciences, Engineering/ICS, Social Sciences, Business/Law/Education, Arts, and Health Sciences. Detailed district models use per-building height, story, bay-spacing and façade profiles: vertical concrete frames, arcades, curved footprint edges, horizontal glazing, balconies, glass entrances, canopies and roof treatments. Aldrich Hall has a raised administrative block and low podium; Langson retains its vertical façade and arcade; the approved ALP wing/pavilion model is reused directly. Libraries retain their courtyard geometry. Repeated elements are shared code rather than duplicated assets.

These are **stylized exterior models**, not measured architectural reconstructions. Windows, floor heights, entry treatments, stairs, rooftop equipment and planting remain estimates. Many references are the exterior photographs preserved by the original UCI map backup. UEA's low volume is approximate; linked UCI records verify its current identity. Exact terrain, interiors, accessible entrance verification, device location and routed walking remain outside this version.

See the [building-by-building reference audit](campus-building-audit.md) and editable [reviewed configuration](../scripts/campus-overrides.json). The configurations retain source links and explanations of corrected heights. OSM values that contradict story counts are not blindly applied. Important identity cases include ACT, UEA/UNEXA, HHCR/HRH, HICF, and the connected Arts complexes. Music & Media/AITR/WSH and Theatre/Drama share exterior geometry while retaining distinct schedules and label anchors.

## Interaction

- Drag to pan, wheel/pinch to zoom. The camera keeps the approved southwest-to-northeast isometric angle.
- On mobile, swipe the room-sheet handle up or down one stop at a time: expanded map ↔ split view ↔ expanded room list. Tapping the handle from either expanded view restores the split view; tapping it in split view expands the map. Tiny movements and cancelled drags leave the current position unchanged.
- Use district badges to move around without changing room filters. Desktop also offers the Explore dropdown and UCI heading; mobile hides that heading and dropdown to leave the map clear. Building labels and canvas picking open the existing room lists. Non-teaching landmarks have name-only labels.
- Campus-scale labels aggregate availability by district. Closer views prioritize the selected building, the current district, and prominent teaching buildings; labels avoid each other and the controls.
- Selecting a room/building frames it in the remaining space around the desktop room panel. Phone room details retain their existing full-screen layout. The mobile overview starts closer to the academic core; the whole modeled area is reachable by pan or the district menu.
- Focus the map for arrow-key panning, +/− zoom, and Home reset. The district menu and building badges are normal HTML controls.
- Walking estimates use real coordinates from a fixed **ALP** starting point: straight-line meters × 1.3 / 80 meters per minute, rounded with a one-minute minimum. The UI labels their origin. These are not routed directions.

## Data and renderer

`frontend/src/data/campus-manifest.json` is the small location/alias/district index used by room search and walking estimates. The schedule snapshot schema, room IDs and saved-room key are unchanged. Both the manifest and the derived geographic database are downloadable under `/data/`.

`campusGeography.ts` converts longitude/latitude into local meters: east X, up Y, south Z, using the original ALP origin. Polygon inner rings stay holes; multipolygon relation members are stitched by node ID and omitted from standalone ways. The coincident Langson outlines are explicitly deduplicated.

`campusScene.ts` displays lightweight volumes while importing all eight district modules once at startup, yielding between builds so the browser can paint and accept input. Window panes, mullions and architectural detail then remain visible at every zoom level. Navigation never swaps in plain volumes or evicts/rebuilds district geometry. Only the HTML label density changes with zoom. Failed district loads retain their fallback volumes with a retry control. Retry reloads the page because browsers cache failed ES module requests. The original ALP study also keeps its panes visible at every zoom level.

Geometry is batched by district and 400-meter spatial cell; vertex colors preserve the palette with two material batches per cell. Thin wall-mounted panes, sills and mullions use front surfaces instead of six-sided boxes. Background roofs omit their hidden undersides and tiny slab edges. Solid building volumes cast shadows; glazing and trim receive them without their own shadow pass. Repeated trees are instanced. Every batched vertex retains a physical building ID. Picking and the outline mask use that same identity, so selecting one building never outlines its entire batch. The cyan outline is derived from actual visible model surfaces and respects foreground occlusion. ALP's existing selection behavior is retained.

The renderer caps pixel ratio, culls off-screen batches, retains the eight built districts for the map's lifetime, releases replaced fallback geometry and all resources on unmount, and renders only on changes. Shadow coverage follows the viewed area; shadows update only when needed. Hidden mobile maps do not draw frames. Map fonts, geometry, modules and fallback images are local—no API key or third-party map request is needed in production.

## Refreshing and validating geography

```bash
# Reproduce the reviewed import from an archived extract:
npm run map:import -- --osm /path/to/campus.osm --retrieved-at 2026-10-29

# Deliberately fetch a new public OSM extract, then review the generated diff:
npm run map:import -- --download /tmp/uci-campus.osm

# Offline validation of committed geometry and every scheduled room:
npm run map:check
```

Edit identities, aliases, source references, height corrections and façade profiles in `scripts/campus-overrides.json`. The importer writes the manifest, public geographic database, district profile modules and reference audit. The reusable architectural components remain hand-authored TypeScript. Normal `npm run build` and container builds never fetch map data. A new schedule location must be audited before `map:check` will pass.

Geographic source: [OpenStreetMap API extract](https://api.openstreetmap.org/api/0.6/map?bbox=-117.854,33.64,-117.8345,33.653), retrieved October 29, 2026. The derived database retains its extract hash, source bounds, source feature URLs and [ODbL attribution](https://www.openstreetmap.org/copyright). UCI's [campus map](https://ce.uci.edu/uci/media/Documents/campus-map.pdf), [Registrar abbreviation list](https://www.reg.uci.edu/addl/campus/index.old), original geographic backup and linked building references are identity cross-checks. Reference photographs are not redistributed as textures.

## Verification and deployment

Vitest and Python tests cover coverage, alias/room overrides, walking order, preserved courtyards, duplicate outlines, height overrides, reversed multipolygon segments and incomplete-ring rejection. Playwright tests run at the six existing screen sizes and capture every district. They exercise default routing, badges and counts, room framing, keyboard/drag/pinch controls, WebGL recovery, failed district imports, map switching, overflow, external-request absence and idle rendering. The original ALP and schematic UI suites remain regression checks.

The initial campus verification included 29 unit/import tests, the production build and offline geography audit. Browser checks cover all six screen sizes, with four deliberate skips for desktop-only framing on mobile layouts. The persistent-window regression revisits all eight districts, resets and zooms the map, and checks that no GPU buffers are re-uploaded and no district geometry is rebuilt.

Frame budgets include main, shadow and selection passes: **350,000 triangles / 200 draw calls on mobile; 500,000 / 300 on desktop**. The mobile triangle allowance increased from 250,000 to keep all panes visible. At 402×874, the expanded overview measures approximately 297,000 triangles and 104 draw calls with a shadow refresh, versus the earlier plain-volume overview's 164,000 / 159. This trades additional triangles and one-time startup work for fewer draw calls and no geometry churn during navigation. Initial map code/data is approximately **400 KB gzip**, plus the shared application bundle. Nginx serves compressed JavaScript, CSS and JSON. Chromium's software GPU verifies geometry and interactions; physical-device frame-time profiling still requires actual phone hardware.

Use the existing Dockerfile/Compose configuration or Coolify Dockerfile deployment on port **8080**, health endpoint **/health**. All geometry, detail chunks, attribution data and fallback images are bundled. Rebuilding after data changes is sufficient; no live map service is required.

The production image was built and smoke-tested with Podman using the same Dockerfile. It runs as UID 101; health, SPA routing, geographic data and fallback assets return HTTP 200, and gzip is enabled. Visiting all districts and selecting ALP, DBH, COHS and SST produced no external requests or page errors. This verifies the portable container; no public Coolify deployment was performed.

Reviewed screenshots are under `docs/preview/campus-*.png`, including the desktop/phone overview and every district.
