# Campus architectural map

The full isometric map is the default at <http://127.0.0.1:5173/>. `?map=campus` is an explicit equivalent. The original lightweight drawing is available at `?map=schematic`, and the reviewed ALP composition remains at `?map=alp`. All three preserve room and building URLs.

## Coverage and architectural treatment

The local geographic snapshot contains **464 building footprints**, **2,049 path/road segments**, and **360 landscape/plaza surfaces**, covering the academic core and the Health Sciences teaching area. Surrounding housing, parking and service buildings provide simplified context. The campus overview includes Aldrich Park and the real Ring Mall paths.

All **67 scheduled building codes** are audited. **352 of 354 room records** resolve to mapped locations. `uci-barn` (eastern campus) and `uci-mc` (Medical Center) remain searchable with independent, explicit off-map statuses. They receive neither a fictitious shared pin nor a walking estimate. The ambiguous historical `?building=uci` link still lists both records, while their individual room links remain unchanged.

Eight districts cover the campus landmarks, Humanities/Biology, Physical Sciences, Engineering/ICS, Social Sciences, Business/Law/Education, Arts, and Health Sciences. Detailed district models use per-building height, story, bay-spacing and façade profiles: vertical concrete frames, arcades, curved footprint edges, horizontal glazing, balconies, glass entrances, canopies and roof treatments. Aldrich Hall has a raised administrative block and low podium; Langson retains its vertical façade and arcade; the approved ALP wing/pavilion model is reused directly. Libraries retain their courtyard geometry. Repeated elements are shared code rather than duplicated assets.

These are **stylized exterior models**, not measured architectural reconstructions. Windows, floor heights, entry treatments, stairs, rooftop equipment and planting remain estimates. Many references are the exterior photographs preserved by the original UCI map backup. UEA's low volume is approximate; linked UCI records verify its current identity. Interiors, accessible entrance verification, device location and routed walking remain outside this version. Terrain is measured bare earth with 1.5× visual relief; bridge details and foundations remain stylized exterior approximations.

See the [building-by-building reference audit](campus-building-audit.md) and editable [reviewed configuration](../scripts/campus-overrides.json). The configurations retain source links and explanations of corrected heights. OSM values that contradict story counts are not blindly applied. Important identity cases include ACT, UEA/UNEXA, HHCR/HRH, HICF, and the connected Arts complexes. Music & Media/AITR/WSH and Theatre/Drama share exterior geometry while retaining distinct schedules and label anchors.

## Terrain and road bridges

The campus now uses the public-domain USGS 3DEP **USGS 1 Meter 11 x42y373 CA_CaliforniaGaps_B23** bare-earth DEM, published August 20, 2025. The [source GeoTIFF](https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_CaliforniaGaps_B23/TIFF/USGS_1M_11_x42y373_CA_CaliforniaGaps_B23.tif) covers the complete map. Its SHA-256, native CRS (EPSG:26911), vertical datum, retrieval date and attribution accompany the committed `/data/campus-terrain.json` grid. The importer resamples to 5-meter local grid nodes and quantizes elevations to decimeters; 117,730 samples cover the campus plus a 90-meter margin. Normal builds and production never request elevation or map services.

The heightmap is **on by default**, with initial relief of **1.5×**, relative to ALP's 25.2-meter source elevation. The **Map settings** control is available on desktop and mobile. Enable the heightmap to adjust relief from **0.5× to 3×**, in 0.1× steps. Preferences persist under `antscoper.map-settings.v1` in browser storage; missing, invalid or unavailable storage uses the defaults. Turning the heightmap off removes the DEM's broad elevation changes while retaining the local bridge road cuts and architectural landing grades.

The independent **Terrain shadows** switch defaults **off**, controlling directional slope shading and baked hill shading. The ground continues to receive structure shadows while terrain shading is off. **Building shadows** defaults **on**, controlling cast shadows from buildings, their foundations, and bridges. Vegetation keeps its existing shadows. Older saved preferences gain these defaults while retaining the chosen heightmap and relief values.

**Reset to default** at the bottom of Map settings restores heightmap on, relief 1.5×, terrain shadows off, and building shadows on. The reset is saved in this browser and retains the current map view, zoom, and selection.

The reset and revised defaults were checked locally at desktop, 402-pixel phone, and 320-pixel phone widths, including persistence after reloading. The production build, 45 frontend tests, 20 Python tests, and six desktop/phone settings and terrain browser checks pass.

Shadow changes retain the existing scene, camera, building meshes, and canvas. Terrain shading updates the existing normal buffers and repaints the ground texture, disposing the replaced texture; building shadows update only the original solid-volume caster flags. Thin glazing and trim remain non-casters when shadows are re-enabled. Both settings persist in browser storage, and the panel scrolls when its contents exceed a short viewport.

Relief changes rebuild the terrain, shading, bridge alignments, and building datums together, retaining the current view, zoom, and selection. Slider input is coalesced over 200 milliseconds, and replaced scene resources are disposed. Buildings retain their original dimensions and level roofs, with retaining foundations reaching the ground. Trees, labels, camera framing, picking and selection outlines account for elevation. The terrain mesh uses 15-meter cells, 5-meter subdivisions around road cuts, and 2.5-meter detail at the two priority crossings. Fine neighbors share their edge samples; transitions to coarser cells interpolate only the shared coarse edge. A 10-meter-radius spatial filter removes small DEM interpolation artifacts around footprints. Smooth normals and baked monochrome hill shading make the broader slopes legible at the chosen relief. Both lighting passes differentiate the continuous elevation field rather than the triangulated placement surface; this prevents the visible checkerboard pattern caused by sampling coarse triangle slopes. Existing lawn, plaza and road boundaries are painted into a local canvas texture (4096 pixels on desktop, 2048 on mobile) on that same mesh, preserving their geographic shapes without overlapping landscape meshes. The ALP plaza remains level with its building.

Ten reviewed pedestrian crossings have modeled decks, barriers, supports and approaches. Bridge/layer/tunnel metadata is retained from the exact archived OSM extract. Ground paths stop at bridge spans; roads continue underneath. Supports avoid roadway corridors. Published [UCI underside clearances](https://parking.uci.edu/traffic/access-clearance/) constrain the road grades, including both roads crossed by the Mesa Court bridge. Every walking deck has a straight vertical profile. The Arts–Humanities, Student Center–Mesa Court, Humanities–Student Center, and Mesa Parking–Arts decks are horizontal. Only the upper structural members of the two truss bridges arch. Watson has a slight straight rise and modeled pedestrian access at both ends. Each profile declares its landing behavior. Local grading reconstructs recessed roads at the truss crossings; Mesa Road below the parking bridge and Campus Drive below Watson retain their existing terrain grades. Elevated connections attach to building floors or supported structures, without raising ground to fill the lower plazas. Clearance fitting changes road grades only on profiles that permit it and never bows a deck. Structural dimensions and engineering grades remain illustrative; these models are not surveyed structures or accessibility guidance.

The seven reference views are available in the desktop Explore menu:

- **Arts–Humanities** (`w171169264`): paired arched beams, vertical hangers, fine railings, a paved deck, entrance towers with masonry courses, and open lattice entrance canopies. Reference: [UCI Arts bridge photograph](https://www.physics.uci.edu/~silverma/build/artsbridge.jpg). Published clearance: 20 feet.
- **Student Center–Mesa Court** (`w624135494`): a steel truss with diagonal bracing, picket infill, deck structure, concrete supports, and the mapped bend at the Student Center end. It meets the full second-floor terrace footprint (`w1213661221`), with a 0.95-meter structural slab, masonry arcade, and broad 9-meter staircase following `w1213661222` to the lower plaza. These dimensions are visual estimates. The connected Student Center volumes share the lower plaza as their first-floor datum. Reference: [UCI construction photograph and project description](https://news.uci.edu/2016/06/20/walk-this-way-new-pedestrian-bridge-to-connect-campus-community/). Published clearance: 18 feet.

- **Humanities–Student Center** (`w171169276`): the flat Ring Mall crossing above the lower cycle/pedestrian tunnel (`w1195385844`). Its source is tagged as an embankment rather than a bridge, so the reviewed profile explicitly supplies the grade separation.
- **Mesa Parking–Arts** (`w155705065`): the deck connects to the third floor of Mesa Parking Structure (`w171169301`), with a matching opening in its open-bay facade. [UCI Arts directions](https://www.arts.uci.edu/spaces/arts-plaza) verify the third-floor connection. The reviewed parking model uses five levels with estimated 3-meter story spacing; the geographic importer preserves this context override. Mesa Road is not excavated.
- **Watson** (`w171194239`): a gently rising concrete span, median support, spiral ramp, and separate stair flights. The ramp follows the actual spiral way (`w171194224`) and upper approach (`w171194269`), including their changing radius and exact ground-path connection. The spiral's source way lacks a bridge tag; it is explicitly modeled and excluded from ground paint to avoid a duplicate loop. Both stairways preserve the turns in their mapped routes, with solid risers, supporting slabs and concrete parapets. Supports sit inside the spiral's open core, clear of the lower ramp turn. The road retains its natural grade. Dimensions remain illustrative.
- **Palo Verde** (`w171169265`) and **Continuing Education** (`w1196280279`): raised, level concrete decks with broad supported platforms at both ends. Stair approaches follow the connected mapped paths. The roads retain their existing terrain grades; these spans gain clearance by raising the structure. Platform dimensions and exterior detailing are estimates.

Engineering, Science Library and Athletics retain simpler concrete models. All bridge materials reuse the building palette: paper-colored stone, paving, gray steel and gray trim. Photographs are modeling references, not redistributed textures. The separate ALP study and schematic map retain their existing terrain.

Reproduce or validate the height grid:

```bash
python3 -m venv /tmp/antscoper-terrain-venv
/tmp/antscoper-terrain-venv/bin/pip install -r scripts/requirements-terrain.txt
/tmp/antscoper-terrain-venv/bin/python scripts/import_terrain.py --dem /path/to/USGS_1M_11_x42y373_CA_CaliforniaGaps_B23.tif
npm run map:check
```

Only deliberate imports need Rasterio. Offline validation uses the Python standard library. Invalid or incomplete DEM coverage is rejected rather than filled with synthetic elevations.

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

Frame budgets include main, shadow and selection passes: **350,000 triangles / 200 draw calls on mobile; 500,000 / 300 on desktop**. The mobile triangle allowance increased from 250,000 to keep all panes visible. With terrain and all ten bridges at 402×874, the expanded overview measures approximately **347,000 triangles and 190 draw calls**, including a shadow refresh. The preceding flat campus with persistent windows measured 297,000 / 104. Landscape paint shares the terrain mesh, hidden foundation caps are omitted, and thin railings receive shadows without a separate shadow pass. Navigation retains the built geometry. Initial map code/data is approximately **500 KB gzip**, plus the shared application bundle. Nginx serves compressed JavaScript, CSS and JSON. Chromium's software GPU verifies geometry and interactions; physical-device frame-time profiling still requires actual phone hardware.

Use the existing Dockerfile/Compose configuration or Coolify Dockerfile deployment on port **8080**, health endpoint **/health**. All geometry, detail chunks, attribution data and fallback images are bundled. Rebuilding after data changes is sufficient; no live map service is required.

The production image was built and smoke-tested with Podman using the same Dockerfile. It runs as UID 101; health, SPA routing, geographic data and fallback assets return HTTP 200, and gzip is enabled. Visiting all districts and selecting ALP, DBH, COHS and SST produced no external requests or page errors. This verifies the portable container; no public Coolify deployment was performed.

Reviewed screenshots are under `docs/preview/campus-*.png`, including the desktop/phone overview and every district.

Terrain review screenshots: [campus overview](preview/terrain-overview.png), [Arts–Humanities](preview/terrain-arts.png), [Student Center–Mesa Court](preview/terrain-mesa.png), [phone overview](preview/terrain-phone.png), [phone Arts bridge](preview/terrain-arts-phone.png), and [phone Mesa Court bridge](preview/terrain-mesa-phone.png). Local verification covers height-grid orientation/interpolation, coarse/fine seams, footprint terrain peaks, bridge clearances across road and deck widths, finite/unselectable geometry, and bridge framing at every existing viewport size.

The terrain and access revision passes 40 frontend tests, 20 Python tests, the production build, and the offline geography checks. The full campus/terrain browser suite passes 48 tests with six layout-specific skips. After the final ramp smoothing and stair opening changes, all 12 geometry-retention and terrain-view checks pass again across six viewport sizes, including all seven bridge reference views.

Additional reference previews: [Humanities–Student Center](preview/terrain-humanities.png), [third-floor parking bridge](preview/terrain-parking.png), [Watson spiral and stairs](preview/terrain-watson.png), [Palo Verde platforms](preview/terrain-palo-verde.png), [Continuing Education platforms](preview/terrain-continuing-education.png), and [terrain cleanup](preview/terrain-health.png).

Access close-ups: [Student Center terrace and staircase](preview/terrain-mesa-detail.png), [Watson spiral and turned stairs](preview/terrain-watson-detail.png).

Settings previews: [desktop defaults](preview/map-settings-desktop.png), [heightmap enabled](preview/map-settings-terrain.png), [3× relief](preview/map-settings-relief.png), and [phone defaults](preview/map-settings-phone.png). The earlier terrain previews show the enabled heightmap at 1.5×. Settings tests cover default values, storage validation, elevation/cache updates, floor attachments, keyboard input, dismiss/focus behavior, retained map view and selection, and reload persistence.

The settings revision passes 44 frontend tests, 20 Python tests, the production build, and offline map validation. The campus/terrain/settings browser suite passes 54 tests with six layout-specific skips. All six settings tests also pass after the final high-relief building-placement check, which prevents terrain from piercing roofs without scaling building dimensions.

Shadow comparisons at the same terrain relief and camera: [building shadows only](preview/shadows-buildings.png), [terrain shadows only](preview/shadows-terrain.png), [both](preview/shadows-both.png), and [both off](preview/shadows-none.png). Browser checks compare rendered pixels, verify the actual structure-caster count, retain the same canvas and district geometry through shadow changes, and reload both saved preferences.

The shadow revision passes 45 frontend tests, 20 Python tests, the production build, offline map validation, and all 30 targeted browser checks across six viewport sizes. Those checks cover defaults, older saved settings, every shadow combination, persistence, idle rendering, district retention, bridge views, and the existing rendering budgets.
