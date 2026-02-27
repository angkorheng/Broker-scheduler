export const TODAY = new Date();

export const dateKey = d => new Date(d).toISOString().slice(0, 10);
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
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
};
export const fmt = d =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtFull = d =>
  new Date(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
export const fmtDateTime = () =>
  new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
export const hourLabel = h => {
  const hh = Math.floor(h);
  const mm = h % 1 === 0.5 ? "30" : "00";
  const ap = hh < 12 ? "AM" : "PM";
  return `${hh > 12 ? hh - 12 : hh}:${mm} ${ap}`;
};
