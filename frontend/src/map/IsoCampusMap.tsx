import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { availability, type Room } from "../model";
import { Icon } from "../Icon";
import { features } from "./geography";
import { createScene } from "./scene";
import "./map.css";

export default function IsoCampusMap({
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
  const host = useRef<HTMLDivElement>(null),
    labels = useRef(new Map<string, HTMLButtonElement>()),
    api = useRef<ReturnType<typeof createScene> | null>(null);
  const pick = useRef(onBuilding);
  pick.current = onBuilding;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  const counts = useMemo(
    () =>
      Object.fromEntries(
        features.map((f) => {
          const members = rooms.filter((r) => r.building === f.code);
          return [
            f.code,
            {
              total: members.length,
              free: members.filter(
                (r) => availability(r, day, time).state === "free",
              ).length,
            },
          ];
        }),
      ),
    [rooms, day, time],
  );
  useEffect(() => {
    if (!host.current || failed) return;
    try {
      api.current = createScene(
        host.current,
        labels.current,
        (code) => pick.current(code),
        () => setFailed(true),
        () => dismiss.current(),
      );
      api.current.select(selected);
    } catch (error) {
      console.warn("Isometric map unavailable", error);
      setFailed(true);
    }
    return () => {
      api.current?.dispose();
      api.current = null;
    };
  }, [attempt, failed]);
  useLayoutEffect(
    () => api.current?.select(selected),
    [selected, attempt, failed],
  );
  const outside = !!selected && !features.some((f) => f.code === selected);
  return (
    <section
      className="campus-map iso-map"
      aria-label="Isometric ALP neighborhood map"
    >
      <div className="iso-heading">
        <span className="eyebrow">A closer look at campus</span>
        <h2>
          The ALP neighborhood<span>01</span>
        </h2>
        <p>Anteater Learning Pavilion & surroundings</p>
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
          if (e.key === "Home") api.current?.reset();
          if (e.key === "+" || e.key === "=") api.current?.zoom(1.25);
          if (e.key === "-") api.current?.zoom(0.8);
          if (e.key === "ArrowLeft") api.current?.pan(-8, -8);
          if (e.key === "ArrowRight") api.current?.pan(8, 8);
          if (e.key === "ArrowUp") api.current?.pan(8, -8);
          if (e.key === "ArrowDown") api.current?.pan(-8, 8);
        }}
      >
        {failed ? (
          <div className="iso-fallback">
            <img
              src="/images/alp-fallback.png"
              alt="Architectural illustration of ALP and its neighboring buildings"
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
            </div>
          </div>
        ) : (
          features.map((f) => (
            <button
              hidden
              key={f.code}
              ref={(el) => {
                if (el) labels.current.set(f.code, el);
                else labels.current.delete(f.code);
              }}
              className={`iso-label ${selected === f.code ? "is-selected" : ""} ${counts[f.code].free ? "has-free" : ""}`}
              aria-label={`${f.name}: ${counts[f.code].total ? `${counts[f.code].free} rooms free` : "no current schedule"}`}
              aria-pressed={selected === f.code}
              onClick={() => onBuilding(f.code)}
            >
              <span>{f.code.toUpperCase()}</span>
              <b>{counts[f.code].total ? counts[f.code].free : "—"}</b>
            </button>
          ))
        )}
      </div>
      <div className="iso-controls" aria-label="Map controls">
        <button
          className="icon-button"
          aria-label="Zoom in"
          disabled={failed}
          onClick={() => api.current?.zoom(1.25)}
        >
          <Icon name="plus" />
        </button>
        <button
          className="icon-button"
          aria-label="Zoom out"
          disabled={failed}
          onClick={() => api.current?.zoom(0.8)}
        >
          <Icon name="minus" />
        </button>
        <button
          className="icon-button"
          aria-label="Reset ALP view"
          disabled={failed}
          onClick={() => api.current?.reset()}
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
            ? "Outside ALP preview"
            : "ALP study · Architecture & heights approximate"}
        </div>
        <div>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
          <button
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("map");
              setParams(next);
            }}
          >
            Campus overview ↗
          </button>
        </div>
      </div>
    </section>
  );
}
