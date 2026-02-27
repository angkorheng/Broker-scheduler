import React, { useState } from 'react';
import { fmtDateTime } from '../utils/dateUtils';

const S = {
  overlay:          { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 },
  box:              { background: "#0d1e2e", border: "1px solid #1a3a5c", borderRadius: 12, padding: 24, width: 560, maxWidth: "95vw", maxHeight: "88vh", overflowY: "auto" },
  label:            { display: "block", color: "#8b9db5", fontSize: 11, marginBottom: 4, marginTop: 12 },
  input:            { width: "100%", background: "#07131f", border: "1px solid #1a3a5c", borderRadius: 6, color: "#d0e4f7", padding: "7px 10px", fontSize: 13, boxSizing: "border-box" },
  ta:               { width: "100%", background: "#07131f", border: "1px solid #1a3a5c", borderRadius: 6, color: "#d0e4f7", padding: "7px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical", minHeight: 70 },
  saveBtn:          { background: "#1a4a6b", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  cancelBtn:        { background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13 },
  noteCard:         { background: "#0a1e30", border: "1px solid #1a3a5c", borderRadius: 8, padding: "12px 14px", marginBottom: 10 },
  noteHeader:       { display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11, color: "#5a7a9a" },
  noteSection:      { fontSize: 12, color: "#d0e4f7", marginBottom: 6 },
  noteSectionLabel: { fontSize: 10, color: "#5a7a9a", fontWeight: 700, letterSpacing: 1, marginBottom: 2 },
};

export default function NotesModal({ client, brokers, notes, onClose, onSave }) {
  const clientNotes = (notes[client.name] || []).slice().reverse();
  const [form, setForm] = useState({ broker: brokers[0] || "", note: "", followUp: "", nextSteps: "" });

  function submit() {
    if (!form.note.trim()) return;
    const entry = {
      id: Date.now().toString(),
      datetime: fmtDateTime(),
      broker: form.broker,
      note: form.note,
      followUp: form.followUp,
      nextSteps: form.nextSteps,
    };
    onSave(client.name, entry);
    setForm({ broker: brokers[0] || "", note: "", followUp: "", nextSteps: "" });
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.box} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ color: "#d0e4f7", fontSize: 16, margin: 0 }}>📝 Meeting Notes — {client.name}</h3>
          <button style={S.cancelBtn} onClick={onClose}>✕ Close</button>
        </div>

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

        <div style={{ color: "#8b9db5", fontSize: 12, fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>
          NOTES HISTORY ({clientNotes.length})
        </div>
        {clientNotes.length === 0
          ? <div style={{ textAlign: "center", padding: 24, color: "#3a5a7a" }}>No notes yet for this client.</div>
          : clientNotes.map(n => (
            <div key={n.id} style={S.noteCard}>
              <div style={S.noteHeader}>
                <span>🗓 {n.datetime}</span>
                <span style={{ background: "#0f2030", color: "#4db8ff", borderRadius: 8, padding: "1px 8px", fontWeight: 600 }}>{n.broker}</span>
              </div>
              <div style={S.noteSectionLabel}>NOTES</div>
              <div style={S.noteSection}>{n.note}</div>
              {n.followUp && (
                <>
                  <div style={S.noteSectionLabel}>FOLLOW-UP</div>
                  <div style={{ ...S.noteSection, color: "#ff9a3c" }}>→ {n.followUp}</div>
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
      </div>
    </div>
  );
}
