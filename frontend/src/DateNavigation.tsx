import {
  addDays,
  campusClock,
  dateLabel,
  startOfWeek,
  weekday,
  weekLabel,
} from "./dates";
import { DAYS, type Snapshot } from "./model";
import { Icon } from "./Icon";

export function WeekNavigation({
  data,
  date,
  onDate,
  onNow,
}: {
  data: Snapshot;
  date: string;
  onDate: (date: string) => void;
  onNow: () => void;
}) {
  const start = startOfWeek(date),
    range = data.metadata.dateRange;
  return (
    <div className="week-navigation" aria-label="Week navigation">
      <button
        className="icon-button"
        aria-label="Previous week"
        disabled={!!range && start <= startOfWeek(range.start)}
        onClick={() => onDate(addDays(date, -7))}
      >
        <Icon name="back" size={17} />
      </button>
      <span className="week-range" aria-live="polite">
        {weekLabel(start)}
      </span>
      <button className="week-today" onClick={onNow}>
        Now
      </button>
      <button
        className="icon-button next-week"
        aria-label="Next week"
        disabled={!!range && start >= startOfWeek(range.end)}
        onClick={() => onDate(addDays(date, 7))}
      >
        <Icon name="back" size={17} />
      </button>
    </div>
  );
}
export function DayPicker({
  date,
  onDate,
}: {
  date: string;
  onDate: (date: string) => void;
}) {
  const start = startOfWeek(date),
    today = campusClock().date;
  return (
    <div className="day-picker" aria-label="Date">
      {DAYS.map((day, i) => {
        const value = addDays(start, i);
        return (
          <button
            key={value}
            className={`${weekday(date) === i ? "active" : ""} ${i === 0 || i === 6 ? "weekend" : ""} ${today === value ? "is-today" : ""}`}
            aria-label={dateLabel(value, true)}
            aria-pressed={date === value}
            aria-current={today === value ? "date" : undefined}
            onClick={() => onDate(value)}
          >
            <span>{day}</span>
            <small>{dateLabel(value)}</small>
          </button>
        );
      })}
    </div>
  );
}
