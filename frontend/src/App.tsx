import { DayPicker, WeekNavigation } from "./DateNavigation";
import {
  addDays,
  campusClock,
  dateLabel,
  parseTime,
  startOfWeek,
  urlTime,
  validDate,
  weekday,
} from "./dates";
import { dataNotice, projectWeek, roomTerm } from "./schedule";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router";
import { CampusMap } from "./CampusMap";
import { MapPreviewBoundary } from "./MapPreviewBoundary";
const IsoCampusMap = lazy(() => import("./map/IsoCampusMap"));
const FullCampusMap = lazy(() => import("./map/FullCampusMap"));
import {
  locationForCode,
  locationOfRoom,
  locationStatus,
  roomAtLocation,
} from "./locations";
import { Icon } from "./Icon";
import { TimeDial, Timeline, Week } from "./Timeline";
import {
  availability,
  buildingOf,
  buildings,
  campusNow,
  codeOf,
  DAYS,
  duration,
  formatTime,
  FULL_DAYS,
  loadSnapshot,
  matches,
  orderRooms,
  walkMinutes,
  websocLink,
  type Room,
  type Snapshot,
} from "./model";

function readSaved(): string[] {
  try {
    const value = JSON.parse(
      localStorage.getItem("antscoper.saved.v1") || "[]",
    );
    return Array.isArray(value)
      ? value.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
function Freshness({ data }: { data: Snapshot }) {
  const date = new Date(data.metadata.fetchedAt);
  return (
    <span>
      {
        {
          "03": "Winter",
          "14": "Spring",
          "25": "Summer I",
          "39": "Summer",
          "76": "Summer II",
          "92": "Fall",
        }[data.metadata.term.slice(5)]
      }{" "}
      {data.metadata.term.slice(0, 4)} · WebSOC snapshot,{" "}
      {date.toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
      })}
      ,{" "}
      {date.toLocaleTimeString("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        minute: "2-digit",
      })}{" "}
      PT
    </span>
  );
}
function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const token = tokens.find((t) => part.toLowerCase().startsWith(t));
        return token ? (
          <span key={i}>
            <mark>{part.slice(0, token.length)}</mark>
            {part.slice(token.length)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}
function RoomRow({
  room,
  day,
  time,
  saved,
  selected,
  onSelect,
  onSave,
}: {
  room: Room;
  day: number;
  time: number;
  saved: boolean;
  selected: boolean;
  onSelect: () => void;
  onSave: () => void;
}) {
  const building = buildingOf(room),
    status = availability(room, day, time),
    walk = walkMinutes(building);
  const statusText =
    status.state === "free"
      ? `until ${formatTime(status.until)}`
      : status.state === "busy"
        ? `free at ${formatTime(status.until)}`
        : status.state === "closed"
          ? "Usually locked"
          : "Schedule unknown";
  return (
    <div className={`room-row ${selected ? "is-selected" : ""}`}>
      <button
        className="room-select"
        onClick={onSelect}
        id={`room-${room.id}`}
        aria-label={`${codeOf(room)}, ${status.state === "free" ? "free " : ""}${statusText}`}
        aria-pressed={selected}
      >
        <span className="room-line">
          <strong>
            <span className="room-code-full">{codeOf(room)}</span>
            <span className="room-code-number">{room.number}</span>
          </strong>
          <span
            className={`room-status ${status.state === "free" ? "free-text" : ""}`}
          >
            {statusText}
          </span>
        </span>
        <span className="room-subtitle">
          {building.name}
          {walk !== null ? (
            <> · ~{walk} min from ALP</>
          ) : (
            <> · {locationStatus(locationOfRoom(room))}</>
          )}
        </span>
        <Timeline room={room} day={day} time={time} />
      </button>
      <button
        className={`save-button icon-button ${saved ? "saved" : ""}`}
        aria-label={`${saved ? "Unsave" : "Save"} ${codeOf(room)}`}
        aria-pressed={saved}
        onClick={onSave}
      >
        <Icon name="star" filled={saved} size={19} />
      </button>
    </div>
  );
}
function RoomDetail({
  room,
  data,
  day,
  time,
  saved,
  onSave,
  onClose,
  selectedDate,
  onDate,
  onNow,
}: {
  room: Room;
  data: Snapshot;
  selectedDate: string;
  onDate: (date: string) => void;
  onNow: () => void;
  day: number;
  time: number;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const status = availability(room, day, time),
    building = buildingOf(room),
    walk = walkMinutes(building);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (window.innerWidth < 1024) detailTitle.current?.focus();
  }, [room.id]);
  const [shareStatus, setShareStatus] = useState("");
  const [shareURL, setShareURL] = useState("");
  const next = room.schedule[day].find(([start]) => start >= status.until);
  useEffect(() => {
    setShareStatus("");
    setShareURL("");
  }, [room.id]);
  async function share() {
    const url = new URL(location.href);
    url.searchParams.set("room", room.id);
    url.searchParams.set("date", selectedDate);
    url.searchParams.set("time", urlTime(time));
    try {
      if (navigator.share)
        await navigator.share({
          title: `${codeOf(room)} · Antscoper`,
          url: url.href,
        });
      else {
        await navigator.clipboard.writeText(url.href);
        setShareStatus("Room link copied");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setShareURL(url.href);
        setShareStatus("Copy this room link");
      }
    }
  }
  return (
    <section className="room-detail" aria-label={`${codeOf(room)} details`}>
      <div className="detail-mobile-nav">
        <button className="text-button" onClick={onClose}>
          <Icon name="back" size={18} />
          Free rooms
        </button>
        <button className="icon-button" aria-label="Share room" onClick={share}>
          <Icon name="share" />
        </button>
        <button
          className={`icon-button ${saved ? "saved" : ""}`}
          onClick={onSave}
          aria-label={saved ? "Unsave room" : "Save room"}
          aria-pressed={saved}
        >
          <Icon name="star" filled={saved} />
        </button>
      </div>
      <div className="detail-heading">
        <div>
          <p>
            {building.name}
            {walk !== null ? (
              <> · ~{walk} min from ALP</>
            ) : (
              <> · {locationStatus(locationOfRoom(room))}</>
            )}
          </p>
          <h1 ref={detailTitle} tabIndex={-1}>
            {codeOf(room)}
          </h1>
        </div>
        <div className="detail-desktop-actions">
          <button
            className="icon-button"
            aria-label="Share room"
            onClick={share}
          >
            <Icon name="share" size={19} />
          </button>
          <button
            className={`icon-button ${saved ? "saved" : ""}`}
            onClick={onSave}
            aria-label={saved ? "Unsave room" : "Save room"}
            aria-pressed={saved}
          >
            <Icon name="star" filled={saved} />
          </button>
          <button
            className="icon-button"
            aria-label="Close room details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      {dataNotice(data, selectedDate) && (
        <p className="schedule-notice" role="status">
          {dataNotice(data, selectedDate)}
        </p>
      )}
      <div className="detail-status">
        <p>
          {status.state === "free" ? (
            <>
              <strong className="free-text">Free at {formatTime(time)}</strong>{" "}
              until {formatTime(status.until)}
            </>
          ) : status.state === "busy" ? (
            <>
              <strong>In use</strong> · free at {formatTime(status.until)}
            </>
          ) : (
            <strong>
              {status.state === "closed"
                ? "Building usually locked"
                : "Schedule unavailable"}
            </strong>
          )}
        </p>
        <span>
          {status.state === "free"
            ? `${duration(status.until - time)} available.${next ? ` Then scheduled use ${formatTime(next[0], false)}–${formatTime(next[1] - 10)}.` : " No more classes before closing."}`
            : status.state === "busy"
              ? "Includes a ten-minute buffer after the class."
              : "Check building access before making a trip."}
        </span>
      </div>
      <a
        className="websoc-link mobile-websoc"
        href={websocLink(room, roomTerm(room, data, selectedDate))}
        target="_blank"
        rel="noreferrer"
      >
        This room on WebSOC
        <Icon name="external" size={14} />
      </a>
      <WeekNavigation
        data={data}
        date={selectedDate}
        onDate={onDate}
        onNow={onNow}
      />
      <div className="weekly-heading">
        <span className="eyebrow">Weekly schedule</span>
        <span>Times shown in Pacific time</span>
      </div>
      <Week
        room={room}
        day={day}
        time={time}
        date={selectedDate}
        onDate={onDate}
      />
      <a
        className="websoc-link desktop-websoc"
        href={websocLink(room, roomTerm(room, data, selectedDate))}
        target="_blank"
        rel="noreferrer"
      >
        This room on WebSOC
        <Icon name="external" size={14} />
      </a>
      <p className="detail-note">
        Hatched days: building usually locked. Gray blocks include a 10-minute
        buffer. Dated finals are included where published. Unresolved schedules
        remain unknown; room access and reservations may differ.{" "}
        <Freshness data={data} />.
      </p>
      {shareStatus && (
        <div className="share-message" role="status">
          {shareStatus}
          {shareURL && (
            <input
              aria-label="Room link"
              readOnly
              value={shareURL}
              onFocus={(e) => e.target.select()}
            />
          )}
        </div>
      )}
    </section>
  );
}
function About({ data, onClose }: { data: Snapshot; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="about-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="about-title"
    >
      <button
        className="icon-button dialog-close"
        onClick={onClose}
        aria-label="Close about"
      >
        <Icon name="close" />
      </button>
      <span className="eyebrow">A little room to think</span>
      <h2 id="about-title">Find your space.</h2>
      <p>
        Antscoper helps you find classrooms at UC Irvine with a little time
        between classes. Pick a day, turn the time dial, and make yourself at
        home.
      </p>
      <h3>About these schedules</h3>
      <p>
        <Freshness data={data} />. This is a saved snapshot, not a live
        occupancy feed. Availability includes a ten-minute buffer after each
        class. A free schedule doesn’t guarantee an unlocked room; reservations,
        holidays, and finals may differ.
      </p>
      <p>
        Schedule data from{" "}
        <a
          href="https://icssc.link/about-anteaterapi"
          target="_blank"
          rel="noreferrer"
        >
          Anteater API
        </a>
        . Exam locations may use the regular lecture room when no separate room
        is published.
      </p>
      <h3>A familiar campus, in miniature</h3>
      <p>
        The architectural map follows real campus footprints, with stylized
        façades and estimated heights. Walking times start at ALP: geographic
        distance × 1.3, at 80 meters per minute. These are approximate
        estimates, not routed directions or your device’s location. Unverified
        and off-map locations remain searchable without a walking estimate.
      </p>
      <p>
        Saved rooms stay in this browser. Browse published weeks, or choose Now
        to return to the current Pacific date and time.
      </p>
      <a
        href="https://www.reg.uci.edu/perl/WebSoc"
        target="_blank"
        rel="noreferrer"
      >
        Check UCI WebSOC <Icon name="external" size={14} />
      </a>
    </dialog>
  );
}
export function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const refresh = () =>
      loadSnapshot(controller.signal)
        .then((next) => {
          setData(next);
          setError("");
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        });
    void refresh();
    const timer = window.setInterval(refresh, 300000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [attempt]);
  if (!data)
    return (
      <main className="loading">
        <span className="eyebrow">University of California, Irvine</span>
        <h1>Antscoper</h1>
        <p role="status">{error || "Finding a little room to think…"}</p>
        {error && (
          <button className="filter" onClick={() => setAttempt((v) => v + 1)}>
            Try again
          </button>
        )}
      </main>
    );
  return <Workspace source={data} refreshError={error} />;
}
function Workspace({
  source,
  refreshError,
}: {
  source: Snapshot;
  refreshError: string;
}) {
  const [params, setParams] = useSearchParams();
  const MapView =
    params.get("map") === "alp"
      ? IsoCampusMap
      : params.get("map") === "schematic"
        ? CampusMap
        : FullCampusMap;
  const roomId = params.get("room"),
    buildingCode = params.get("building"),
    query = params.get("q") || "",
    dateParam = params.get("date"),
    timeParam = params.get("time"),
    liveParam = params.get("live");
  const demo = source.metadata.mode !== "live";
  const demoPreview = demo && liveParam !== "1";
  const [clock, setClock] = useState(campusClock);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const preview =
    scrubTime !== null ||
    validDate(dateParam) ||
    parseTime(timeParam) !== null ||
    demoPreview;
  const selectedDate = validDate(dateParam)
    ? dateParam
    : demoPreview
      ? source.metadata.demoDate || "2026-10-29"
      : clock.date;
  const day = weekday(selectedDate),
    time =
      scrubTime ?? parseTime(timeParam) ?? (demoPreview ? 855 : clock.time);
  const data = useMemo(
    () => projectWeek(source, selectedDate),
    [source, selectedDate, clock],
  );
  const notice =
    dataNotice(source, selectedDate) ||
    (refreshError
      ? "Could not check for newer schedules. Showing the last successful publication."
      : "");
  const [saved, setSaved] = useState(readSaved),
    [savedOnly, setSavedOnly] = useState(false),
    [oneHour, setOneHour] = useState(false),
    [nearest, setNearest] = useState(true);
  const [about, setAbout] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [snap, setSnap] = useState<"half" | "full" | "collapsed">("half");
  const [storageMessage, setStorageMessage] = useState("");
  const beforeBuilding = useRef<{
    query: string;
    savedOnly: boolean;
    oneHour: boolean;
    searchOpen: boolean;
    snap: typeof snap;
    scrollTop: number;
  } | null>(null);
  const panelContent = useRef<HTMLDivElement>(null);
  const resultsScroll = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef<number | null>(null);
  const shownBuilding = useRef(buildingCode);
  useLayoutEffect(() => {
    if (shownBuilding.current === buildingCode) return;
    shownBuilding.current = buildingCode;
    if (resultsScroll.current)
      resultsScroll.current.scrollTop = restoreScroll.current ?? 0;
    restoreScroll.current = null;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = panelContent.current?.animate?.(
      [
        { transform: `translateY(${buildingCode ? 18 : -18}px)`, opacity: 0.5 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 240, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [buildingCode]);
  const search = useRef<HTMLInputElement>(null),
    sheetGesture = useRef<{
      id: number;
      x: number;
      y: number;
      tap: "toggle" | "expand" | null;
    } | null>(null),
    dragged = useRef(false),
    sheetClickHandled = useRef(false),
    initial = useRef(false);
  const updateParams = (
    values: Record<string, string | null>,
    replace = false,
  ) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace },
    );
  };
  const selectedRoom = data.rooms.find((r) => r.id === roomId);
  const activeBuilding = buildingCode
    ? (buildings[buildingCode] ?? {
        code: buildingCode,
        name: buildingCode.toUpperCase(),
      })
    : null;
  const freeRooms = useMemo(
    () =>
      data.rooms.filter((r) => {
        const s = availability(r, day, time);
        return s.state === "free" && (!oneHour || s.until - time >= 60);
      }),
    [data, day, time, oneHour],
  );
  const results = useMemo(
    () =>
      orderRooms(
        data.rooms.filter((r) => {
          if (buildingCode && !roomAtLocation(r, buildingCode)) return false;
          if (query && !matches(query, `${codeOf(r)} ${buildingOf(r).name}`))
            return false;
          if (savedOnly && !saved.includes(r.id)) return false;
          if (oneHour && !freeRooms.includes(r)) return false;
          return (
            buildingCode ||
            savedOnly ||
            query ||
            freeRooms.includes(r) ||
            availability(r, day, time).state === "unknown"
          );
        }),
        nearest,
      ),
    [
      data,
      day,
      time,
      oneHour,
      freeRooms,
      saved,
      savedOnly,
      nearest,
      buildingCode,
      query,
    ],
  );
  const matchingBuildings = useMemo(
    () =>
      query
        ? [
            ...new Set(
              data.rooms.map((r) => locationOfRoom(r)?.id ?? r.building),
            ),
          ]
            .map(
              (code) => buildings[code] ?? { code, name: code.toUpperCase() },
            )
            .filter((b) => matches(query, `${b.code} ${b.name}`))
            .sort((a, b) => (walkMinutes(a) ?? 999) - (walkMinutes(b) ?? 999))
        : [],
    [query, data],
  );
  const setBuilding = (code: string) => {
    if (!buildingCode)
      beforeBuilding.current = {
        query,
        savedOnly,
        oneHour,
        searchOpen,
        snap,
        scrollTop: resultsScroll.current?.scrollTop ?? 0,
      };
    updateParams({ building: code, room: null, q: null });
    search.current?.blur();
    setSearchOpen(false);
    setSavedOnly(false);
    setOneHour(false);
  };
  const dismissBuilding = () => {
    if (!buildingCode && !roomId) return;
    const previous = beforeBuilding.current;
    beforeBuilding.current = null;
    restoreScroll.current = previous?.scrollTop ?? 0;
    updateParams({ building: null, room: null, q: previous?.query || null });
    setSavedOnly(previous?.savedOnly ?? savedOnly);
    setOneHour(previous?.oneHour ?? oneHour);
    setSearchOpen(previous?.searchOpen ?? false);
    setSnap(previous?.snap ?? "half");
  };
  useEffect(() => {
    if (!buildingCode) beforeBuilding.current = null;
  }, [buildingCode]);
  const selectRoom = (id: string) => {
    updateParams({ room: id });
    search.current?.blur();
  };
  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      try {
        localStorage.setItem("antscoper.saved.v1", JSON.stringify(next));
      } catch {
        setStorageMessage(
          "Saved for this visit. Browser storage is unavailable.",
        );
      }
      return next;
    });
  }
  function chooseDate(date: string) {
    updateParams({ date, time: urlTime(time), live: null });
  }
  function chooseTime(value: number) {
    // Keep the released value visible until the router commits the new URL.
    setScrubTime(value);
    updateParams(
      { date: selectedDate, time: urlTime(value), live: null },
      true,
    );
  }
  function now() {
    setScrubTime(null);
    setClock(campusClock());
    updateParams({ date: null, time: null, live: demo ? "1" : null });
  }
  useEffect(() => {
    const timer = setInterval(() => setClock(campusClock()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // Room-only navigation must not discard an in-progress dial drag.
    setScrubTime(null);
  }, [dateParam, timeParam, liveParam]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        setSearchOpen(true);
        search.current?.focus();
      }
      if (e.key === "Escape") {
        if (!document.querySelector("dialog[open]")) dismissBuilding();
        setSearchOpen(false);
        search.current?.blur();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [buildingCode, roomId, savedOnly, oneHour]);
  useEffect(() => {
    if (initial.current) return;
    initial.current = true;
    if (
      !roomId &&
      !query &&
      !buildingCode &&
      params.get("map") === "schematic" &&
      window.innerWidth >= 1024
    ) {
      const room = orderRooms(freeRooms, true)[0];
      if (room) updateParams({ room: room.id }, true);
    }
  }, []);
  const showSaved = () => {
    setSavedOnly((v) => !v);
    updateParams({ building: null, room: null, q: null });
    setSearchOpen(false);
    setSnap("half");
  };
  const reset = () => {
    updateParams({ building: null, room: null, q: null });
    setSearchOpen(false);
    setSnap("half");
  };
  const unknownCount = data.rooms.filter(
    (r) => availability(r, day, time).state === "unknown",
  ).length;
  const allUnknown = unknownCount === data.rooms.length;
  const unavailable = day === 0 || day === 6 || time < 420 || time >= 1320;
  const freeHere = results.filter(
    (r) => availability(r, day, time).state === "free",
  );
  const restHere = results.filter(
    (r) => availability(r, day, time).state !== "free",
  );
  const row = (r: Room) => (
    <RoomRow
      key={r.id}
      room={r}
      day={day}
      time={time}
      selected={roomId === r.id}
      saved={saved.includes(r.id)}
      onSelect={() => selectRoom(r.id)}
      onSave={() => toggleSaved(r.id)}
    />
  );
  // Derive the selection sheet position from the committed URL. Changing snap
  // before navigation commits can resize the map before it saves its camera.
  const visibleSnap = activeBuilding ? "half" : snap;
  return (
    <main
      className={`app ${selectedRoom ? "has-room" : ""} ${activeBuilding || searchOpen || query ? "focused-panel" : ""} sheet-${visibleSnap} ${activeBuilding ? "is-building" : searchOpen || query ? "is-search" : ""}`}
    >
      <a className="skip-link" href="#results">
        Skip to rooms
      </a>
      <header className="topbar">
        <button className="brand" onClick={reset}>
          Antscoper
        </button>
        <button
          className="mobile-back icon-button"
          aria-label="Back to map"
          onClick={activeBuilding ? dismissBuilding : reset}
        >
          <Icon name="back" />
        </button>
        <div className="search-box">
          <Icon name="search" size={18} />
          <input
            ref={search}
            aria-label="Search rooms or buildings"
            placeholder="Search rooms, buildings or codes"
            value={query || activeBuilding?.name || ""}
            onFocus={() => {
              setSearchOpen(true);
              setSnap("full");
            }}
            onChange={(e) =>
              updateParams(
                { q: e.target.value, building: null, room: null },
                true,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                search.current?.blur();
                setSearchOpen(false);
              }
            }}
          />
          {query || activeBuilding ? (
            <button
              className="icon-button search-clear"
              aria-label="Clear search"
              onClick={() =>
                activeBuilding
                  ? dismissBuilding()
                  : updateParams({ q: null, building: null })
              }
            >
              <Icon name="close" size={16} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <nav aria-label="Main">
          <button
            aria-label={`Saved rooms (${saved.length})`}
            className={savedOnly ? "saved" : ""}
            onClick={showSaved}
          >
            <span className="desktop-label">Saved ({saved.length})</span>
            <span className="mobile-star">
              <Icon name="star" filled={savedOnly} />
            </span>
          </button>
          <button className="about-button" onClick={() => setAbout(true)}>
            About
          </button>
        </nav>
      </header>
      <div className="workspace">
        <MapPreviewBoundary key={params.get("map") || "campus"}>
          <Suspense
            fallback={
              <section
                className="campus-map"
                aria-label="Loading architectural map"
              />
            }
          >
            <MapView
              rooms={data.rooms}
              day={day}
              time={time}
              selected={
                params.get("map") === "alp" || params.get("map") === "schematic"
                  ? (selectedRoom?.building ?? buildingCode)
                  : selectedRoom
                    ? (locationOfRoom(selectedRoom)?.id ??
                      selectedRoom.building)
                    : (locationForCode(buildingCode)?.id ?? buildingCode)
              }
              onBuilding={setBuilding}
              onDismiss={dismissBuilding}
            />
          </Suspense>
        </MapPreviewBoundary>
        <section
          className="results-panel"
          aria-label="Find a room"
          onClickCapture={(e) => {
            // A touch tap can synthesize a click after the sheet has moved,
            // landing on a room underneath the former summary position.
            if (sheetClickHandled.current && e.detail > 0) {
              sheetClickHandled.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onPointerDown={(e) => {
            sheetClickHandled.current = false;
            if (
              !e.isPrimary ||
              e.button !== 0 ||
              window.innerWidth >= 1024 ||
              selectedRoom ||
              activeBuilding ||
              searchOpen ||
              query
            )
              return;
            const target = e.target as Element;
            const surface = target.closest<HTMLElement>(
              "[data-sheet-drag], .week-navigation",
            );
            if (
              !surface ||
              (target.closest("button, a, input, select, textarea") &&
                surface.dataset.sheetDrag !== "toggle")
            )
              return;
            sheetGesture.current = {
              id: e.pointerId,
              x: e.clientX,
              y: e.clientY,
              tap:
                surface.dataset.sheetDrag === "toggle"
                  ? "toggle"
                  : surface.dataset.sheetDrag === "expand"
                    ? "expand"
                    : null,
            };
            sheetClickHandled.current = true;
            dragged.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = sheetGesture.current;
            if (start?.id !== e.pointerId) return;
            if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8)
              dragged.current = true;
          }}
          onPointerUp={(e) => {
            const start = sheetGesture.current;
            if (start?.id !== e.pointerId) return;
            sheetGesture.current = null;
            const dx = e.clientX - start.x,
              dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) > 8) dragged.current = true;
            if (Math.abs(dy) > 25 && Math.abs(dy) > Math.abs(dx)) {
              dragged.current = true;
              // Every swipe moves one stop; the split view is never skipped.
              setSnap((current) =>
                dy > 0
                  ? current === "full"
                    ? "half"
                    : "collapsed"
                  : current === "collapsed"
                    ? "half"
                    : "full",
              );
            } else if (!dragged.current) {
              if (start.tap === "toggle")
                setSnap((current) =>
                  current === "half" ? "collapsed" : "half",
                );
              else if (start.tap === "expand") setSnap("half");
            }
          }}
          onPointerCancel={(e) => {
            if (sheetGesture.current?.id !== e.pointerId) return;
            sheetGesture.current = null;
            dragged.current = true;
          }}
          onLostPointerCapture={(e) => {
            if (sheetGesture.current?.id !== e.pointerId) return;
            sheetGesture.current = null;
            dragged.current = true;
          }}
        >
          <button
            className="sheet-handle"
            data-sheet-drag="toggle"
            aria-label={
              visibleSnap === "collapsed"
                ? "Expand room list"
                : visibleSnap === "full"
                  ? "Show map and room list"
                  : "Collapse room list"
            }
            aria-expanded={visibleSnap !== "collapsed"}
            onClick={(e) => {
              // Pointer taps are handled on release: browsers can suppress the
              // synthesized click after a swipe. Keep click for keyboard/AT use.
              if (e.detail === 0)
                setSnap((current) =>
                  current === "half" ? "collapsed" : "half",
                );
            }}
          >
            <i />
          </button>
          <div
            className="collapsed-summary"
            data-sheet-drag="expand"
            aria-hidden={visibleSnap !== "collapsed"}
            onClick={(e) => {
              if (e.detail === 0) setSnap("half");
            }}
          >
            <h2>
              {allUnknown
                ? "Availability unknown"
                : `${freeRooms.length} rooms free`}
            </h2>
            <span>
              {dateLabel(selectedDate)} {formatTime(time)}
            </span>
            <span className="tag">{preview ? "Preview" : "Now"}</span>
          </div>
          <div className="panel-content" ref={panelContent}>
            <button
              className="data-stamp eyebrow"
              onClick={() => setAbout(true)}
              aria-label="About the schedule snapshot"
            >
              <Freshness data={data} />
            </button>
            {activeBuilding && (
              <div className="building-heading">
                <button className="text-button" onClick={dismissBuilding}>
                  <Icon name="back" size={16} />
                  All rooms
                </button>
                <span className="building-eyebrow eyebrow">
                  Building
                  {walkMinutes(activeBuilding) !== null
                    ? ` · ~${walkMinutes(activeBuilding)} min from ALP`
                    : ""}
                </span>
                <h2>
                  {activeBuilding.code.toUpperCase()}{" "}
                  <span>{activeBuilding.name}</span>
                </h2>
                <p>
                  <strong className="free-text">
                    {allUnknown
                      ? "Availability unknown"
                      : `${freeHere.length} of ${results.length} rooms free`}
                  </strong>
                  <span className="building-time">
                    {" "}
                    · {dateLabel(selectedDate)}, {formatTime(time)}
                  </span>
                  <span className="building-distance">
                    {walkMinutes(activeBuilding) !== null
                      ? ` · ~${walkMinutes(activeBuilding)} min from ALP`
                      : ` · ${locationStatus(locationForCode(activeBuilding.code))}`}
                  </span>
                </p>
              </div>
            )}
            <div className="time-heading" data-sheet-drag="swipe">
              <h2>
                {dateLabel(selectedDate)}, {formatTime(time)}
              </h2>
              <button
                className={`tag ${preview ? "" : "is-now"}`}
                onClick={now}
                title={
                  preview
                    ? "Switch to current campus time"
                    : "Using current campus time"
                }
              >
                {preview ? "Preview" : "Now"}
              </button>
              <button
                className="mobile-snapshot"
                onClick={() => setAbout(true)}
                aria-label="About the schedule snapshot"
              >
                {new Date(data.metadata.fetchedAt).toLocaleDateString("en-US", {
                  timeZone: "America/Los_Angeles",
                  month: "short",
                  day: "numeric",
                })}{" "}
                snapshot
              </button>
            </div>
            <div className="schedule-navigation">
              <WeekNavigation
                data={data}
                date={selectedDate}
                onDate={chooseDate}
                onNow={now}
              />
              <DayPicker date={selectedDate} onDate={chooseDate} />
            </div>
            {notice && (
              <p className="schedule-notice" role="status">
                {notice}
              </p>
            )}
            {data.metadata.source?.includes("anteaterapi") ? (
              <a
                className="schedule-attribution"
                href="https://icssc.link/about-anteaterapi"
                target="_blank"
                rel="noreferrer"
              >
                Data from Anteater API
              </a>
            ) : (
              <span className="schedule-attribution">
                Demo: saved WebSOC schedule
              </span>
            )}
            <TimeDial
              rooms={data.rooms}
              day={day}
              time={time}
              onChange={setScrubTime}
              onCommit={chooseTime}
            />
            <div className="filters">
              <button
                className={`filter ${nearest ? "active" : ""}`}
                aria-pressed={nearest}
                onClick={() => setNearest((v) => !v)}
              >
                {nearest ? "Nearest to ALP" : "Building A–Z"}
              </button>
              <button
                className={`filter ${oneHour ? "active" : ""}`}
                aria-pressed={oneHour}
                onClick={() => setOneHour((v) => !v)}
              >
                Free 1 hr+
              </button>
              <button
                className={`filter ${savedOnly ? "active" : ""}`}
                aria-pressed={savedOnly}
                onClick={() => setSavedOnly((v) => !v)}
              >
                Saved
              </button>
            </div>
            <div
              className="results-scroll"
              id="results"
              tabIndex={-1}
              ref={resultsScroll}
            >
              {query && matchingBuildings.length > 0 && (
                <div className="building-results">
                  <span className="eyebrow">
                    {matchingBuildings.length} buildings
                  </span>
                  {matchingBuildings.map((b) => (
                    <button
                      className="building-result"
                      aria-label={`Open ${b.code.toUpperCase()}: ${b.name}`}
                      key={b.code}
                      onClick={() => setBuilding(b.code)}
                    >
                      <strong>{b.code.toUpperCase()}</strong>
                      <span>
                        <Highlight text={b.name} query={query} />
                        <small>
                          {
                            freeRooms.filter((r) => roomAtLocation(r, b.code))
                              .length
                          }{" "}
                          of{" "}
                          {
                            data.rooms.filter((r) => roomAtLocation(r, b.code))
                              .length
                          }{" "}
                          free
                          {walkMinutes(b) !== null
                            ? ` · ~${walkMinutes(b)} min from ALP`
                            : ""}
                        </small>
                      </span>
                      <span className="chevron">
                        <Icon name="back" size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="results-title">
                <h2>
                  {savedOnly
                    ? "Your saved rooms"
                    : query
                      ? `${results.length} matching rooms`
                      : activeBuilding
                        ? allUnknown
                          ? "Schedule unknown"
                          : "Free at selected time"
                        : allUnknown
                          ? "Availability unknown"
                          : `${freeRooms.length} ${freeRooms.length === 1 ? "room" : "rooms"} free${oneHour ? " for an hour or more" : preview ? "" : " now"}`}
                </h2>
                {!activeBuilding && !savedOnly && !query && (
                  <span>
                    in {new Set(results.map((r) => r.building)).size} buildings
                  </span>
                )}
              </div>
              {unavailable && (
                <p className="notice">
                  {day === 0 || day === 6
                    ? "It’s the weekend. Buildings are usually locked."
                    : "Outside usual building hours, 7 am–10 pm."}{" "}
                  Choose a weekday and time to find rooms.
                </p>
              )}
              {!results.length && (
                <div className="empty-state">
                  <Icon name={savedOnly ? "star" : "search"} size={26} />
                  <h3>
                    {savedOnly
                      ? "Keep a few favorites."
                      : query
                        ? "No rooms found."
                        : "A different time, a little more room."}
                  </h3>
                  <p>
                    {savedOnly
                      ? "Tap the star beside a room to find it here next time."
                      : query
                        ? "Try a building code, room number, or a few words from its name."
                        : "Move the time dial or loosen your filters to see more options."}
                  </p>
                  {(oneHour || query || savedOnly) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setOneHour(false);
                        setSavedOnly(false);
                        updateParams({ q: null });
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
              {activeBuilding ? (
                <>
                  {freeHere.map(row)}
                  {restHere.length > 0 && (
                    <>
                      <h3 className="eyebrow in-use-title">
                        {restHere.every(
                          (r) => availability(r, day, time).state === "unknown",
                        )
                          ? "Schedule unknown"
                          : unavailable
                            ? "Usually locked"
                            : "In use"}
                      </h3>
                      {restHere.map(row)}
                    </>
                  )}
                </>
              ) : (
                results.map(row)
              )}
              {query && (
                <p className="search-help">
                  Matches codes (SSL 290), full names, and word starts. Try “soc
                  sci” for Social Science.
                </p>
              )}
              {results.length > 0 && (
                <p className="list-footnote">
                  A free schedule isn’t a guarantee of access.{" "}
                  <button onClick={() => setAbout(true)}>About the data</button>
                </p>
              )}
            </div>
          </div>
        </section>
        {selectedRoom && (
          <RoomDetail
            room={selectedRoom}
            data={data}
            selectedDate={selectedDate}
            onDate={chooseDate}
            onNow={now}
            day={day}
            time={time}
            saved={saved.includes(selectedRoom.id)}
            onSave={() => toggleSaved(selectedRoom.id)}
            onClose={() => {
              updateParams({ room: null });
              requestAnimationFrame(() =>
                document.getElementById(`room-${selectedRoom.id}`)?.focus(),
              );
            }}
          />
        )}
        {roomId && !selectedRoom && (
          <div className="missing-room" role="status">
            This room has no schedule in the current snapshot.{" "}
            <button
              className="text-button"
              onClick={() => updateParams({ room: null })}
            >
              Browse rooms
            </button>
          </div>
        )}
      </div>
      {storageMessage && (
        <div className="toast" role="status">
          {storageMessage}
          <button
            className="icon-button"
            aria-label="Dismiss"
            onClick={() => setStorageMessage("")}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {about && <About data={data} onClose={() => setAbout(false)} />}
    </main>
  );
}
