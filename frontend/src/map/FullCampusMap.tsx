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
import { createCampusScene, type DetailState } from "./campusScene";
import "./map.css";

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
  const pick = useRef(onBuilding);
  pick.current = onBuilding;
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [detail, setDetail] = useState<DetailState>({ loading: 0, failed: [] }),
    [district, setDistrict] = useState("");
  const [params, setParams] = useSearchParams();
  const headerPreview = params.get("preview") === "map-header";
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
      );
    } catch (error) {
      console.warn("Campus map unavailable", error);
      setFailed(true);
    }
    return () => {
      api.current?.dispose();
      api.current = null;
    };
  }, [attempt, failed]);
  useEffect(() => api.current?.select(selected), [selected, attempt, failed]);
  useEffect(() => api.current?.redraw(), [counts, districtCounts]);
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
    if (id) api.current?.focusDistrict(id);
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
      </select>
    </div>
  );
  return (
    <section
      className={`campus-map iso-map full-campus-map${headerPreview ? " is-header-preview" : ""}`}
      aria-label="Isometric UCI campus map"
    >
      <div className={`iso-heading${headerPreview ? " map-intro-panel" : ""}`}>
        {headerPreview ? (
          <>
            <div className="map-intro-topline">
              <span className="eyebrow">University of California, Irvine</span>
              <span className="map-intro-mark">UCI</span>
            </div>
            <h2>A little room on campus</h2>
          </>
        ) : (
          <>
            <span className="eyebrow">University of California, Irvine</span>
            <h2>
              A little room on campus<span>UCI</span>
            </h2>
          </>
        )}
        <p>Explore a district. Find your next quiet corner.</p>
        {headerPreview && districtMenu}
      </div>
      {!headerPreview && districtMenu}
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
          <button onClick={() => switchMap("schematic")}>
            Lightweight map ↗
          </button>
        </div>
        <span className="map-accuracy">
          Stylized architecture · Approximate heights
        </span>
      </div>
    </section>
  );
}
