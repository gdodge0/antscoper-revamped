# ALP architectural map preview

Run `npm run dev` and open <http://127.0.0.1:5173/?map=alp>. This preserves the original reviewed ALP composition. The regular URL now opens the [full campus map](campus-map.md); the schematic remains at `?map=schematic`. The preview starts with room details closed so the architecture is visible; building badges and building surfaces open the existing room list. Room links, search, and saved rooms retain `map=alp`.

## What is modeled

The ALP neighborhood contains six georeferenced buildings: ALP, Humanities Hall, Humanities Gateway, Humanities Instructional Building, Krieger Hall, and Steinhaus Hall. ALP has an authored three-story wing, two-story elliptical pavilion with a raised roof, galleries, glazing bays, sunshades, columns, stairs, connection, and outdoor benches. Context buildings use their real footprints and a simplified façade treatment. Paths come from the geographic extract. Planting and benches are illustrative.

The fixed orthographic camera looks northeast from southwest, at a 35.26-degree elevation. Drag to pan, wheel or pinch to zoom, and use the reset button to restore the composition. Keyboard users can focus the map and use arrows, +/−, and Home, or select its HTML building badges. Selection uses the existing building/room URL state. Locations outside the modeled neighborhood show an explicit coverage message.

## Source and accuracy

- Geographic source: a small [OpenStreetMap API extract](https://api.openstreetmap.org/api/0.6/map?bbox=-117.8460,33.6458,-117.8428,33.6487), retrieved October 29, 2026. Each building retains its OSM way URL. Coordinates are preserved in longitude/latitude, converted into local meters with east as X, up as Y, and south as Z. Origin: 33.647179, −117.844421.
- ALP architecture: [LMN Architects exterior photographs](https://lmnarchitects.com/project/anteater-learning-pavilion-university-of-california-irvine) and [UCI's description of the two-story pavilion and three-story wing](https://news.uci.edu/2016/12/08/student-population-growth-at-uci-spurs-construction-of-high-tech-classroom-facility/). Photos are references, not textures bundled into the app.
- The old `static/geo_backup.json` is a cross-check, not the footprint source. Its older ALP outline differs from the current OSM outline. OSM's ALP `building:levels=4` is not used; the authored volumes follow UCI's description.
- Heights from OSM are retained for context buildings when present. HIB height, ALP component heights, façade spacing, stairs, roof equipment, and furnishing dimensions are visual estimates. This is an exterior architectural illustration, not a surveyed or construction model. Indoor layouts, terrain survey and routing remain outside this study. The shared room UI now uses the campus expansion’s coordinate-based walking estimates from ALP.
- Geographic data is © OpenStreetMap contributors, available under [ODbL 1.0](https://www.openstreetmap.org/copyright). The downloadable derived geographic database is `frontend/public/data/alp-neighborhood.json`, with source and license metadata; deployed copies are downloadable at `/data/alp-neighborhood.json`. Original architectural model code is separate from that database.

## Implementation and maintenance

`frontend/src/map/architecture.ts` contains the editable model geometry and dimension parameters. `alp-neighborhood.json` contains the saved geographic features. `scene.ts` owns Three.js, the orthographic camera, picking, label projection, and cleanup. `IsoCampusMap.tsx` connects the scene to the existing availability model and accessible controls.

Geometry is batched by material and building. Trees are instanced, fine glazing/trim is hidden at distant zoom, pixel ratio is capped at 1.5 on mobile and 2 on desktop, and rendering stops when the view is idle. Shadow maps are stationary. ResizeObserver follows the mobile sheet and desktop map dimensions. Rendering resources and controls are disposed on unmount, including React StrictMode remounts.

WebGL failure/context loss uses a local static render and retry; module-loading errors are contained by a map-only error boundary. The normal room interface remains usable. The map chunk, data, fonts, and fallback image are served locally with the existing Docker image; there are no runtime map requests or API keys.

Refresh geographic data deliberately: download the same bounded OSM extract, join named building ways to the six existing codes, preserve Polygon rings and pedestrian/service LineStrings, and review changes to geometry and paths before replacing the committed snapshot. Do not infer a newly scheduled room's location from its abbreviation alone. The approved study has now been expanded through the separate [campus import workflow](campus-map.md).

## Verification

The Playwright suite covers all six existing viewport sizes, idle render behavior, triangle/draw-call budgets, keyboard controls, dragging/pinching, schedule badge changes, building selection, out-of-coverage rooms, unavailable WebGL, and context-loss recovery. Screenshots are emitted under `test-results/browser`.

The headless browser uses SwiftShader. It verifies rendering and interaction, but its timings do not establish physical-phone GPU performance. The scene budget is 150,000 visible triangles and 150 draw calls; the initial implementation is approximately 37,000 triangles and 37 draw calls after the first shadow pass. A selected building adds a depth-tested silhouette mask and a constant-width cyan screen-space stroke (about 75,000 triangles and 75 draw calls total). The stroke is derived from visible model geometry, excludes paving and furniture, and respects foreground occlusion; geographic footprints are no longer drawn through the model as selection lines. The original `scene.ts` composition is mounted for `?map=alp`; the default campus view uses `campusScene.ts`.
