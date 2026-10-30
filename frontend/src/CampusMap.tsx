import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { availability, buildings, origin, position, type Room } from "./model";
import { Icon } from "./Icon";
export function CampusMap({
  rooms,
  day,
  time,
  selected,
  onBuilding,
  onDismiss,
}: {
  rooms: Room[];
  day: number;
  time: number;
  selected: string | null;
  onBuilding: (code: string) => void;
  onDismiss: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const moved = useRef(false);
  const dots = useMemo(
    () =>
      Object.values(buildings)
        .filter((b) => b.angle !== undefined)
        .map((b) => {
          const members = rooms.filter((r) => r.building === b.code);
          return {
            ...b,
            ...position(b.angle!, b.radius!),
            total: members.length,
            free: members.filter(
              (r) => availability(r, day, time).state === "free",
            ).length,
          };
        }),
    [rooms, day, time],
  );
  return (
    <section className="campus-map" aria-label="Schematic UCI campus map">
      <div
        className="map-interaction"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          if (!e.isPrimary || e.button !== 0) return;
          moved.current = false;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            if (
              Math.hypot(
                e.clientX - drag.current.x,
                e.clientY - drag.current.y,
              ) > 6
            )
              moved.current = true;
            setPan({
              x: drag.current.px + e.clientX - drag.current.x,
              y: drag.current.py + e.clientY - drag.current.y,
            });
          }
        }}
        onPointerUp={() => {
          if (drag.current && !moved.current) onDismiss();
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div
          className="map-stage"
          style={
            {
              "--zoom": zoom,
              "--pan-x": `${pan.x}px`,
              "--pan-y": `${pan.y}px`,
            } as React.CSSProperties
          }
        >
          <div className="outer-ring" />
          {[18, 76, 140, 198, 246, 318].map((a) => (
            <div
              className="map-spoke"
              key={a}
              style={{ transform: `rotate(${a}deg)` }}
            >
              <i />
            </div>
          ))}
          <div className="inner-ring" />
          <div className="park-dots" />
          <span className="park-name">Aldrich Park</span>
          {dots.map((b) => (
            <button
              key={b.code}
              className={`map-marker ${b.code === selected ? "focused" : ""} ${b.free > 0 ? "has-free" : ""} ${!b.total ? "unknown-marker" : ""}`}
              style={
                {
                  left: `${b.x}%`,
                  top: `${b.y}%`,
                  "--dot-size": `${b.free ? Math.min(22, 9 + 3 * Math.sqrt(b.free)) : 9}px`,
                } as React.CSSProperties
              }
              aria-label={`${b.name}: ${b.total ? `${b.free} rooms free` : "no current schedule"}`}
              title={`${b.name} · ${b.free} of ${b.total} rooms free`}
              onClick={() => onBuilding(b.code)}
            >
              <i />
              {(b.free >= 3 || b.code === selected) && (
                <span>{b.code.toUpperCase()}</span>
              )}
            </button>
          ))}
          <div
            className="origin-halo"
            style={{ left: `${origin.x}%`, top: `${origin.y}%` }}
          >
            <i />
          </div>
        </div>
      </div>
      <div className="map-legend">
        <span>
          <i className="legend-free" />
          Has free rooms; bigger means more
        </span>
        <span>
          <i className="legend-busy" />
          No rooms available
        </span>
        <span>
          <i className="legend-origin" />
          ALP starting point
        </span>
      </div>
      <div className="map-zoom">
        <button
          className="icon-button"
          aria-label="Zoom in"
          disabled={zoom >= 1.8}
          onClick={() => setZoom((v) => Math.min(1.8, v + 0.15))}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out"
          disabled={zoom <= 0.7}
          onClick={() => setZoom((v) => Math.max(0.7, v - 0.15))}
        >
          <Icon name="minus" />
        </button>
      </div>
      <button
        className="icon-button recenter"
        aria-label="Recenter on preview location"
        title="Recenter preview map"
        onClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }}
      >
        <Icon name="location" />
      </button>
      <span className="map-caption">
        <span>UCI · Approximate positions · </span>
        <button
          className="text-button"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("map", "campus");
            setParams(next);
          }}
        >
          Architectural map ↗
        </button>
      </span>
    </section>
  );
}
