import { addDays, dateLabel, startOfWeek } from "./dates";
import { useRef } from "react";
import {
  availability,
  CLOSE,
  DAYS,
  formatTime,
  OPEN,
  percent,
  type Room,
} from "./model";
export function Timeline({
  room,
  day,
  time,
  selected = true,
}: {
  room: Room;
  day: number;
  time: number;
  selected?: boolean;
}) {
  const status = availability(room, day, time);
  return (
    <div
      className={`timeline ${room.coverage?.[day] === "unknown" || day === 0 || day === 6 ? "hatched" : ""}`}
      aria-hidden="true"
    >
      {room.schedule[day].map(([a, b], i) => (
        <i
          key={i}
          className="busy-segment"
          style={
            {
              left: `${percent(a)}%`,
              width: `${percent(b) - percent(a)}%`,
              "--vertical-start": `${percent(a)}%`,
              "--vertical-height": `${percent(b) - percent(a)}%`,
            } as React.CSSProperties
          }
        />
      ))}
      {selected && status.state === "free" && (
        <i
          className="free-segment"
          style={
            {
              left: `${percent(time)}%`,
              width: `${percent(status.until) - percent(time)}%`,
              "--vertical-start": `${percent(time)}%`,
              "--vertical-height": `${percent(status.until) - percent(time)}%`,
            } as React.CSSProperties
          }
        />
      )}
      {selected && time >= OPEN && time <= CLOSE && (
        <i
          className="needle"
          style={
            {
              left: `${percent(time)}%`,
              "--vertical-start": `${percent(time)}%`,
            } as React.CSSProperties
          }
        />
      )}
    </div>
  );
}
export function Week({
  room,
  day,
  time,
  date,
  onDate,
}: {
  room: Room;
  day: number;
  time: number;
  date: string;
  onDate: (date: string) => void;
}) {
  return (
    <div
      className="week"
      role="group"
      aria-label={`Weekly schedule for ${room.building.toUpperCase()} ${room.number}. Gray blocks show classes including a ten-minute buffer; cyan shows the selected free window.`}
    >
      <div className="week-axis">
        {[8, 10, 12, 14, 16, 18, 20].map((h) => (
          <span
            key={h}
            style={{ "--offset": `${percent(h * 60)}%` } as React.CSSProperties}
          >
            {h % 12 || 12}
            {h < 12 ? "a" : "p"}
          </span>
        ))}
      </div>
      {DAYS.map((d, i) => (
        <div className={`week-day ${day === i ? "selected-day" : ""}`} key={d}>
          <button
            className="week-label"
            aria-label={dateLabel(addDays(startOfWeek(date), i), true)}
            aria-pressed={day === i}
            onClick={() => onDate(addDays(startOfWeek(date), i))}
          >
            <span>{d}</span>
            <small>{dateLabel(addDays(startOfWeek(date), i))}</small>
          </button>
          <Timeline room={room} day={i} time={time} selected={day === i} />
        </div>
      ))}
    </div>
  );
}
export function TimeDial({
  rooms,
  day,
  time,
  onChange,
}: {
  rooms: Room[];
  day: number;
  time: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ x: number; time: number } | null>(null);
  const counts = Array.from(
    { length: 30 },
    (_, i) =>
      rooms.filter(
        (r) => availability(r, day, OPEN + i * 30 + 15).state === "free",
      ).length,
  );
  const max = Math.max(1, ...counts),
    min = Math.min(...counts);
  const set = (t: number) =>
    onChange(Math.max(OPEN, Math.min(CLOSE, Math.round(t / 15) * 15)));
  return (
    <div
      className="time-dial"
      role="slider"
      tabIndex={0}
      aria-label="Time of day"
      aria-valuemin={OPEN}
      aria-valuemax={CLOSE}
      aria-valuenow={time}
      aria-valuetext={formatTime(time)}
      onKeyDown={(e) => {
        if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          set(
            e.key === "Home"
              ? OPEN
              : e.key === "End"
                ? CLOSE
                : time + (e.key === "ArrowRight" ? 15 : -15),
          );
        }
      }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, time };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current)
          set(drag.current.time + (drag.current.x - e.clientX) * 1.5);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div
        className="dial-strip"
        style={{ left: `calc(50% - ${(time - OPEN) / 1.5}px)` }}
      >
        <div className="dial-closed before hatched">
          <span>Opens 7 am</span>
        </div>
        <div className="dial-closed after hatched">
          <span>Closes 10 pm</span>
        </div>
        {counts.map((n, i) => (
          <i
            key={i}
            className={`dial-bar ${OPEN + i * 30 + 30 <= time ? "past" : ""}`}
            style={{
              left: i * 20 + 2,
              height: 5 + ((n - min) / Math.max(1, max - min)) * 25,
            }}
          />
        ))}
        {Array.from({ length: 61 }, (_, i) => (
          <i
            className={`dial-tick ${i % 4 === 0 ? "hour" : ""}`}
            key={i}
            style={{ left: i * 10 }}
          />
        ))}
        {Array.from({ length: 16 }, (_, i) => (
          <span className="dial-hour" key={i} style={{ left: i * 40 }}>
            {(i + 7) % 12 || 12}
            {i + 7 < 12 ? "a" : "p"}
          </span>
        ))}
      </div>
      <div className="dial-fade left" />
      <div className="dial-fade right" />
      <div className="dial-indicator" />
    </div>
  );
}
