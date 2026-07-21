import React from 'react';

const BADGE_MAP = {
  redtail:   ["#E7EEF5", "#2F5D8A", "Redtail"],
  pipedrive: ["#F1ECFA", "#7C3AED", "Pipedrive"],
  csv:       ["#E8F1EC", "#3F8361", "CSV"],
  manual:    ["#EEF1F5", "#6B7C8C", "Manual"],
};

export default function ImportedFromBadge({ src }) {
  const [bg, fg, label] = BADGE_MAP[src] || BADGE_MAP.manual;
  return (
    <span style={{ background: bg, color: fg, borderRadius: 8, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>
      {label}
    </span>
  );
}
