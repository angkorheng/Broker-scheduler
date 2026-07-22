import React, { useState, useRef, useEffect } from 'react';

// A proper client/prospect picker that tracks the selected person's real ID,
// instead of matching purely by typed text (which breaks when two people
// share a name). Selecting a suggestion locks in the exact record; typing
// without selecting is treated as "not yet matched to anyone."
export default function ClientPicker({ clients, value, selectedId, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef();
  const blurTimeout = useRef();

  const q = (value || "").trim().toLowerCase();
  const matches = q
    ? clients.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8)
    : [];

  const selectedClient = selectedId ? clients.find(c => c.id === selectedId) : null;
  const isUnmatched = !selectedClient && q.length > 0;

  useEffect(() => { setHighlight(0); }, [value]);

  function selectClient(c) {
    onChange(c.name, c);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); selectClient(matches[highlight]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div style={{ position: "relative" }} ref={wrapRef}>
      <input
        style={{ width: "100%", background: "#F6F7FA", border: `1px solid ${isUnmatched ? "#B8792E" : "#DCE3EA"}`, borderRadius: 8, color: "#1C2B3A", padding: "10px 14px", fontSize: 14, boxSizing: "border-box" }}
        value={value || ""}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value, null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimeout.current = setTimeout(() => setOpen(false), 150); }}
        onKeyDown={handleKeyDown}
      />
      {open && q && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#FFFFFF", border: "1px solid #DCE3EA", borderRadius: 8, boxShadow: "0 6px 20px rgba(28,43,58,0.15)", zIndex: 50, maxHeight: 240, overflowY: "auto" }}>
          {matches.length > 0 ? matches.map((c, i) => (
            <div key={c.id}
              onMouseDown={e => e.preventDefault()} // keep input focus so onBlur doesn't fire before click
              onClick={() => selectClient(c)}
              style={{ padding: "9px 14px", cursor: "pointer", background: i === highlight ? "#F1F4F7" : "transparent", borderBottom: i < matches.length - 1 ? "1px solid #EEF1F5" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ fontSize: 13.5, color: "#1C2B3A" }}>{c.name}</strong>
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 6,
                  background: c.isProspect ? "#F7F0DC" : "#E7EEF5", color: c.isProspect ? "#A67C1E" : "#2F5D8A",
                }}>
                  {c.isProspect ? "PROSPECT" : "CLIENT"}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8FA0AF", marginTop: 1 }}>
                {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact info on file"}
              </div>
            </div>
          )) : (
            <div style={{ padding: "10px 14px", fontSize: 12.5, color: "#8FA0AF", fontStyle: "italic" }}>
              No match — this will be added as a new person.
            </div>
          )}
        </div>
      )}
      {isUnmatched && !open && (
        <div style={{ fontSize: 11.5, color: "#B8792E", marginTop: 4 }}>
          ⚠ No existing record selected — "{value}" will be treated as a brand-new person.
        </div>
      )}
    </div>
  );
}
