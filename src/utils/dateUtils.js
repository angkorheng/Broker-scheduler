const TZ = "America/Los_Angeles";

export const TODAY = new Date();

// For Date objects → convert to PST calendar date (YYYY-MM-DD).
// For date strings already in YYYY-MM-DD form → return as-is (they are PST calendar dates).
export const dateKey = d => {
  if (typeof d === "string" && d.length >= 10) return d.slice(0, 10);
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
};

export const daysSince = s =>
  s === null || s === undefined
    ? Infinity
    : Math.floor((TODAY - new Date(s)) / 86400000);

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const getMondayOf = d => {
  // Determine the calendar date in PST, then find its Monday.
  const pstStr = new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
  // Parse as noon local to avoid DST / UTC-midnight issues when doing arithmetic.
  const x = new Date(pstStr + "T12:00:00");
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
};

// Date strings like "2026-02-27" parse as UTC midnight which in PST is the prior afternoon.
// Appending T12:00:00 keeps the date on the correct calendar day in all US timezones.
const parseDate = d =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(d + "T12:00:00")
    : new Date(d);

export const fmt = d =>
  parseDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });

export const fmtFull = d =>
  parseDate(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: TZ,
  });

export const fmtDateTime = () =>
  new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: TZ,
  });

export const hourLabel = h => {
  const hh = Math.floor(h);
  const mm = h % 1 === 0.5 ? "30" : "00";
  const ap = hh < 12 ? "AM" : "PM";
  return `${hh > 12 ? hh - 12 : hh}:${mm} ${ap}`;
};
