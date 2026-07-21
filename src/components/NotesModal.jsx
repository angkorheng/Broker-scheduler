import React, { useState } from 'react';

const S = {
  overlay:          { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 },
  box:              { background: "#0d1e2e", border: "1px solid #1a3a5c", borderRadius: 12, padding: 24, width: 620, maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto" },
  label:            { display: "block", color: "#8b9db5", fontSize: 11, marginBottom: 4, marginTop: 12 },
  input:            { width: "100%", background: "#07131f", border: "1px solid #1a3a5c", borderRadius: 6, color: "#d0e4f7", padding: "7px 10px", fontSize: 13, boxSizing: "border-box" },
  ta:               { width: "100%", background: "#07131f", border: "1px solid #1a3a5c", borderRadius: 6, color: "#d0e4f7", padding: "7px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical", minHeight: 70 },
  saveBtn:          { background: "#1a4a6b", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  cancelBtn:        { background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13 },
  noteCard:         { background: "#0a1e30", border: "1px solid #1a3a5c", borderRadius: 8, padding: "12px 14px", marginBottom: 10 },
  noteHeader:       { display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11, color: "#5a7a9a" },
  noteSection:      { fontSize: 12, color: "#d0e4f7", marginBottom: 6 },
  noteSectionLabel: { fontSize: 10, color: "#5a7a9a", fontWeight: 700, letterSpacing: 1, marginBottom: 2 },
  sectionTitle:     { color: "#8b9db5", fontSize: 12, fontWeight: 700, marginBottom: 10, marginTop: 22, letterSpacing: 1 },
  apptRow:          { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a1e30", border: "1px solid #1a3a5c", borderRadius: 8, padding: "9px 14px", marginBottom: 6, fontSize: 12 },
  tabBtn:           { background: "none", border: "none", borderBottom: "2px solid transparent", color: "#8b9db5", padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  tabBtnActive:     { background: "none", border: "none", borderBottom: "2px solid #4db8ff", color: "#4db8ff", padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 },
};

function fmtDateTime() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function NotesModal({ client, brokers, notes, appointments, onClose, onSave }) {
  const [view, setView] = useState("notes"); // notes | history | cancelled
  const clientNotes = (notes[client.id] || []).slice().reverse();
  const [form, setForm] = useState({ broker: brokers[0] || "", note: "", followUp: "", nextSteps: "" });

  const clientAppts = appointments.filter(a =>
    a.clientId === client.id || (a.clientName || "").toLowerCase() === client.name.toLowerCase()
  );
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const pastMeetings = clientAppts
    .filter(a => a.status !== "cancelled" && a.date <= todayStr)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const cancelledMeetings = clientAppts
    .filter(a => a.status === "cancelled")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  function submit() {
    if (!form.note.trim()) return;
    const entry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      broker: form.broker,
      text: form.note,
      followUpAction: form.followUp,
      nextSteps: form.nextSteps,
      meetingDate: todayStr,
    };
    onSave(client.id, entry);
    setForm({ broker: brokers[0] || "", note: "", followUp: "", nextSteps: "" });
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ color: "#d0e4f7", fontSize: 16, margin: 0 }}>👤 {client.name}</h3>
          <button style={S.cancelBtn} onClick={onClose}>✕ Close</button>
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #1a3a5c", marginBottom: 16 }}>
          <button style={view === "notes" ? S.tabBtnActive : S.tabBtn} onClick={() => setView("notes")}>📝 Notes ({clientNotes.length})</button>
          <button style={view === "history" ? S.tabBtnActive : S.tabBtn} onClick={() => setView("history")}>🗓 Past Meetings ({pastMeetings.length})</button>
          <button style={view === "cancelled" ? S.tabBtnActive : S.tabBtn} onClick={() => setView("cancelled")}>⚠ Cancelled ({cancelledMeetings.length})</button>
        </div>

        {view === "notes" && (
          <>
            <div style={{ background: "#071828", border: "1px solid #1a3a5c", borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ color: "#4db8ff", fontWeight: 700, fontSize: 12, marginBottom: 10 }}>+ Add New Note</div>
              <label style={S.label}>Broker</label>
              <select style={S.input} value={form.broker} onChange={e => setForm(f => ({ ...f, broker: e.target.value }))}>
                {brokers.map(b => <option key={b}>{b}</option>)}
              </select>
              <label style={S.label}>Meeting Notes *</label>
              <textarea style={S.ta} placeholder="What was discussed in the meeting…" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              <label style={S.label}>Follow-Up Action Item</label>
              <input style={S.input} placeholder="e.g. Send portfolio report by Friday…" value={form.followUp} onChange={e => setForm(f => ({ ...f, followUp: e.target.value }))} />
              <label style={S.label}>Next Steps / Next Meeting Reason</label>
              <input style={S.input} placeholder="e.g. Review Q1 performance, Rebalance portfolio…" value={form.nextSteps} onChange={e => setForm(f => ({ ...f, nextSteps: e.target.value }))} />
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button style={S.saveBtn} onClick={submit}>Save Note</button>
              </div>
            </div>
            {clientNotes.length === 0
              ? <div style={{ textAlign: "center", padding: 24, color: "#3a5a7a" }}>No notes yet for this client.</div>
              : clientNotes.map(n => (
                <div key={n.id} style={S.noteCard}>
                  <div style={S.noteHeader}>
                    <span>🗓 {n.timestamp ? new Date(n.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
                    {n.broker && <span style={{ background: "#0f2030", color: "#4db8ff", borderRadius: 8, padding: "1px 8px", fontWeight: 600 }}>{n.broker}</span>}
                  </div>
                  <div style={S.noteSectionLabel}>NOTES</div>
                  <div style={S.noteSection}>{n.text}</div>
                  {n.followUpAction && (
                    <>
                      <div style={S.noteSectionLabel}>FOLLOW-UP</div>
                      <div style={{ ...S.noteSection, color: "#ff9a3c" }}>→ {n.followUpAction}</div>
                    </>
                  )}
                  {n.nextSteps && (
                    <>
                      <div style={S.noteSectionLabel}>NEXT STEPS</div>
                      <div style={{ ...S.noteSection, color: "#4caf73" }}>↗ {n.nextSteps}</div>
                    </>
                  )}
                </div>
              ))
            }
          </>
        )}

        {view === "history" && (
          pastMeetings.length === 0
            ? <div style={{ textAlign: "center", padding: 24, color: "#3a5a7a" }}>No past meetings on record.</div>
            : pastMeetings.map(a => (
              <div key={a.id} style={S.apptRow}>
                <div>
                  <div style={{ color: "#d0e4f7", fontWeight: 600 }}>{a.date} · {a.broker}</div>
                  {a.subject && <div style={{ color: "#8b9db5", marginTop: 2 }}>{a.subject}</div>}
                </div>
                <span style={{ background: a.status === "completed" ? "#0f2a0f" : "#0f2030", color: a.status === "completed" ? "#4caf73" : "#4db8ff", borderRadius: 8, padding: "2px 10px", fontWeight: 600, fontSize: 11 }}>
                  {a.status === "completed" ? "Completed" : "Scheduled"}
                </span>
              </div>
            ))
        )}

        {view === "cancelled" && (
          cancelledMeetings.length === 0
            ? <div style={{ textAlign: "center", padding: 24, color: "#3a5a7a" }}>No cancelled meetings.</div>
            : cancelledMeetings.map(a => (
              <div key={a.id} style={S.apptRow}>
                <div>
                  <div style={{ color: "#d0e4f7", fontWeight: 600 }}>{a.date} · {a.broker}</div>
                  {a.cancelReason && <div style={{ color: "#ff9a3c", marginTop: 2 }}>Reason: {a.cancelReason}</div>}
                </div>
                <span style={{ background: "#2a0f0f", color: "#ff6b6b", borderRadius: 8, padding: "2px 10px", fontWeight: 600, fontSize: 11 }}>Cancelled</span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
