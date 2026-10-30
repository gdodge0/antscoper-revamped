import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { availability, type Room } from "../model";
import {
  campusLocations,
  districts,
  locationForCode,
  locationOfRoom,
  locationStatus,
  roomAtLocation,
} from "../locations";
import { Icon } from "../Icon";
import {
  createCampusScene,
  type DetailState,
  type CampusViewSnapshot,
} from "./campusScene";
import "./map.css";
import { bridgeProfiles } from "./bridgeProfiles";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { readMapSettings, saveMapSettings } from "./mapSettings";

const mapped = campusLocations.filter((l) => l.status === "verified");
export default function FullCampusMap({
  rooms,
  day,
  time,
  selected,
  onBuilding,
}: {
  rooms: Room[];
  day: number;
  time: number;
  selected: string | null;
  onBuilding: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    labels = useRef(new Map<string, HTMLElement>()),
    api = useRef<ReturnType<typeof createCampusScene> | null>(null);
  const savedView = useRef<CampusViewSnapshot | undefined>(undefined);
  const [settings, setSettings] = useState(readMapSettings);
  const [terrainSettings, setTerrainSettings] = useState(settings);
  const pick = useRef(onBuilding);
  pick.current = onBuilding;
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [detail, setDetail] = useState<DetailState>({ loading: 0, failed: [] }),
    [district, setDistrict] = useState("");
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    saveMapSettings(settings);
    // Coalesce slider input so a drag builds geometry only after a short pause.
    const timer = window.setTimeout(
      () =>
        setTerrainSettings((current) =>
          current.heightmap === settings.heightmap &&
          current.relief === settings.relief
            ? current
            : settings,
        ),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [settings]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        mapped.map((l) => {
          const members = rooms.filter((r) => roomAtLocation(r, l.id));
          return [
            l.id,
            {
              total: members.length,
              unknown:
                members.length > 0 &&
                members.every(
                  (r) => availability(r, day, time).state === "unknown",
                ),
              free: members.filter(
                (r) => availability(r, day, time).state === "free",
              ).length,
            },
          ];
        }),
      ),
    [rooms, day, time],
  );
  const districtCounts = useMemo(
    () =>
      Object.fromEntries(
        districts.map((d) => [
          d.id,
          rooms.filter(
            (r) =>
              locationOfRoom(r)?.district === d.id &&
              availability(r, day, time).state === "free",
          ).length,
        ]),
      ),
    [rooms, day, time],
  );
  const unknownDistricts = new Set(
    districts
      .filter((d) => {
        const members = rooms.filter(
          (r) => locationOfRoom(r)?.district === d.id,
        );
        return (
          members.length > 0 &&
          members.every((r) => availability(r, day, time).state === "unknown")
        );
      })
      .map((d) => d.id),
  );
  useEffect(() => {
    if (!host.current || failed) return;
    try {
      api.current = createCampusScene(
        host.current,
        labels.current,
        (id) => pick.current(id),
        () => setFailed(true),
        setDetail,
        terrainSettings,
        savedView.current,
      );
    } catch (error) {
      console.warn("Campus map unavailable", error);
      setFailed(true);
    }
    return () => {
      savedView.current = api.current?.snapshot();
      api.current?.dispose();
      api.current = null;
    };
  }, [attempt, failed, terrainSettings]);
  useEffect(
    () => api.current?.select(selected),
    [selected, attempt, failed, terrainSettings],
  );
  useEffect(() => api.current?.redraw(), [counts, districtCounts]);
  useEffect(
    () => api.current?.setShadows(settings),
    [
      settings.terrainShadows,
      settings.buildingShadows,
      terrainSettings,
      attempt,
      failed,
    ],
  );
  const selectedLocation = locationForCode(selected),
    outside = !!selected && selectedLocation?.status !== "verified";
  function switchMap(mode: string) {
    const next = new URLSearchParams(params);
    next.set("map", mode);
    setParams(next);
  }
  function ref(id: string) {
    return (el: HTMLElement | null) => {
      if (el) labels.current.set(id, el);
      else labels.current.delete(id);
    };
  }
  function goDistrict(id: string) {
    setDistrict(id);
    if (id.startsWith("bridge:")) api.current?.focusBridge(id.slice(7));
    else if (id) api.current?.focusDistrict(id);
    else api.current?.reset();
  }
  const districtMenu = (
    <div className="campus-district-menu">
      <label htmlFor="campus-district">Explore</label>
      <select
        id="campus-district"
        aria-label="Explore a campus district"
        value={district}
        disabled={failed}
        onChange={(e) => goDistrict(e.target.value)}
      >
        <option value="">All campus</option>
        {districts.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        <optgroup label="Pedestrian bridges">
          {[
            "w171169264",
            "w624135494",
            "w171169276",
            "w155705065",
            "w171194239",
            "w171169265",
            "w1196280279",
          ].map((id) => (
            <option key={id} value={`bridge:${id}`}>
              {bridgeProfiles[id].name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
  return (
    <section
      className="campus-map iso-map full-campus-map"
      aria-label="Isometric UCI campus map"
    >
      <div className="iso-heading map-intro-panel">
        <span className="eyebrow">University of California, Irvine</span>
        {districtMenu}
      </div>
      <div
        className="iso-stage"
        ref={host}
        tabIndex={0}
        role="group"
        aria-label="Map navigation. Arrow keys pan; plus and minus zoom; Home resets."
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
              "Home",
            ].includes(e.key)
          )
            e.preventDefault();
          if (e.key === "Home") goDistrict("");
          if (e.key === "+" || e.key === "=") api.current?.zoom(1.35);
          if (e.key === "-") api.current?.zoom(1 / 1.35);
          if (e.key === "ArrowLeft") api.current?.pan(-8, -8);
          if (e.key === "ArrowRight") api.current?.pan(8, 8);
          if (e.key === "ArrowUp") api.current?.pan(8, -8);
          if (e.key === "ArrowDown") api.current?.pan(-8, 8);
        }}
      >
        {failed ? (
          <div className="iso-fallback">
            <img
              src="/images/campus-fallback.png"
              alt="Architectural overview of UC Irvine's academic campus"
            />
            <div role="status">
              3D view unavailable. Room search is still available.
              <button
                onClick={() => {
                  setFailed(false);
                  setAttempt((v) => v + 1);
                }}
              >
                Retry map
              </button>
              <button onClick={() => switchMap("schematic")}>
                Use lightweight map
              </button>
            </div>
          </div>
        ) : (
          <>
            {mapped.map((l) => (
              <button
                hidden
                ref={ref(l.id)}
                key={l.id}
                className={`iso-label ${selected === l.id ? "is-selected" : ""} ${counts[l.id].free ? "has-free" : ""} ${counts[l.id].total ? "" : "is-landmark"}`}
                aria-label={`${l.name}: ${counts[l.id].total ? (counts[l.id].unknown ? "schedule unknown" : `${counts[l.id].free} rooms free`) : "campus landmark"}`}
                aria-pressed={selected === l.id}
                onClick={() =>
                  counts[l.id].total
                    ? onBuilding(l.id)
                    : goDistrict(l.district!)
                }
              >
                <span>
                  {counts[l.id].total
                    ? l.id.toUpperCase()
                    : {
                        alh: "Aldrich Hall",
                        llib: "Langson Library",
                        slib: "Science Library",
                        sc: "Student Center",
                      }[l.id] || l.name}
                </span>
                {counts[l.id].total > 0 && (
                  <b>{counts[l.id].unknown ? "?" : counts[l.id].free}</b>
                )}
              </button>
            ))}
            {districts.map((d) => (
              <button
                hidden
                key={d.id}
                ref={ref(`district:${d.id}`)}
                className={`iso-label district-label ${districtCounts[d.id] ? "has-free" : ""}`}
                aria-label={`Explore ${d.name}: ${unknownDistricts.has(d.id) ? "schedule unknown" : `${districtCounts[d.id]} rooms free`}`}
                onClick={() => goDistrict(d.id)}
              >
                <span>{d.shortName}</span>
                {d.id !== "landmarks" && (
                  <b>
                    {unknownDistricts.has(d.id) ? "?" : districtCounts[d.id]}
                  </b>
                )}
              </button>
            ))}
            <span hidden className="park-label" ref={ref("park")}>
              Aldrich Park
            </span>
          </>
        )}
      </div>
      <div className="iso-controls" aria-label="Map controls">
        <button
          className="icon-button"
          aria-label="Zoom in"
          disabled={failed}
          onClick={() => api.current?.zoom(1.35)}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out"
          disabled={failed}
          onClick={() => api.current?.zoom(1 / 1.35)}
        >
          <Icon name="minus" />
        </button>
        <button
          className="icon-button"
          aria-label="Reset campus view"
          disabled={failed}
          onClick={() => goDistrict("")}
        >
          <Icon name="location" />
        </button>
        <MapSettingsPanel
          settings={settings}
          onChange={setSettings}
          disabled={failed}
        />
      </div>
      <div
        className="iso-north"
        aria-label="North points toward the upper left"
      >
        <span>↖</span>N
      </div>
      <div className="iso-footer">
        <div>
          <i /> Free rooms <span>·</span>{" "}
          {outside
            ? locationStatus(selectedLocation)
            : "Walking estimates from ALP"}
        </div>
        {!!detail.failed.length && (
          <div role="status">
            Simplified buildings in{" "}
            {detail.failed
              .map((id) => districts.find((d) => d.id === id)?.shortName)
              .join(", ")}
            .
            <button onClick={() => api.current?.retryDetails()}>
              Retry details
            </button>
          </div>
        )}
        <div>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
          {" · "}
          <a
            href="https://www.usgs.gov/3d-elevation-program"
            target="_blank"
            rel="noreferrer"
          >
            USGS 3DEP terrain
          </a>
          <button onClick={() => switchMap("schematic")}>
            Lightweight map ↗
          </button>
        </div>
        <span className="map-accuracy">
          Stylized architecture ·{" "}
          {terrainSettings.heightmap
            ? `Terrain relief ×${terrainSettings.relief.toFixed(1)}`
            : "Heightmap off"}
        </span>
      </div>
    </section>
  );
}
