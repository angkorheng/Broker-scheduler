import React from 'react';

const BADGE_MAP = {
  redtail:   ["#1a3a6b", "#4db8ff", "Redtail"],
  pipedrive: ["#2a1a4a", "#c084fc", "Pipedrive"],
  csv:       ["#1a3a1a", "#4caf73", "CSV"],
  manual:    ["#1a2a3a", "#8b9db5", "Manual"],
};

export default function ImportedFromBadge({ src }) {
  const [bg, fg, label] = BADGE_MAP[src] || BADGE_MAP.manual;
  return (
    <span style={{ background: bg, color: fg, borderRadius: 8, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>
      {label}
    </span>
  );
}
