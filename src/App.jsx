import React, { useState, useEffect, useMemo, useRef } from 'react';
import ImportedFromBadge from './components/ImportedFromBadge';
import NotesModal from './components/NotesModal';
import { WORKER_URL, DEFAULT_BROKERS, HOURS, DAYS } from './utils/constants';
import { TODAY, dateKey, daysSince, addDays, getMondayOf, fmt, fmtFull, hourLabel } from './utils/dateUtils';
import { loadAll, upsertAppt, upsertAppts, deleteApptDB, upsertClient, upsertClients, insertNote, saveSetting, deleteClientDB } from './utils/supabase';
import { parseCSV } from './utils/csvParser';

export default function App() {
  const [tab, setTab]               = useState("schedule");
  const [brokers, setBrokers]       = useState(DEFAULT_BROKERS);
  const [appointments, setAppts]    = useState([]);
  const [clients, setClients]       = useState([]);
  const [notes, setNotes]           = useState({});
  const [weekStart, setWeekStart]   = useState(getMondayOf(TODAY));
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [search, setSearch]         = useState("");
  const [nameSort, setNameSort]         = useState("asc");
  const [overdueThreshold, setODT]      = useState(90);
  const [settingsTab, setSTB]           = useState("brokers");
  const [selectedClients, setSelClients] = useState(new Set());
  const [settingsOpen, setSOp]      = useState(false);
  const [creds, setCreds]           = useState({ redtailKey: "", redtailUser: "", pipedriveToken: "" });
  const [syncStatus, setSyncStatus] = useState({ redtail: null, pipedrive: null });
  const [syncMsg, setSyncMsg]       = useState({ redtail: "", pipedrive: "" });
  const [loading, setLoading]       = useState(true);
  const [notesClient, setNotesClient] = useState(null);
  const csvRef = useRef();
  const loadedRef = useRef(false);

  useEffect(() => {
    loadAll().then(d => {
      if (d.appointments?.length)                 setAppts(d.appointments);
      if (d.clients?.length)                      setClients(d.clients);
      if (d.brokers)                              setBrokers(d.brokers);
      if (d.overdueThreshold != null)             setODT(d.overdueThreshold);
      if (d.creds)                                setCreds(d.creds);
      if (d.notes && Object.keys(d.notes).length) setNotes(d.notes);
      loadedRef.current = true;
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    saveSetting('brokers', brokers);
  }, [brokers]);

  useEffect(() => {
    if (!loadedRef.current) return;
    saveSetting('overdueThreshold', overdueThreshold);
  }, [overdueThreshold]);

  useEffect(() => {
    if (!loadedRef.current) return;
    saveSetting('creds', creds);
  }, [creds]);

  const weekDays = DAYS.map((name, i) => ({ name, date: addDays(weekStart, i) }));

  const clientStats = useMemo(() => {
    const map = {};
    [...appointments].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(appt => {
      if (!map[appt.clientName]) map[appt.clientName] = { last: null, next: null };
      if (new Date(appt.date) <= TODAY) map[appt.clientName].last = appt.date;
      else if (!map[appt.clientName].next) map[appt.clientName].next = appt.date;
    });
    return map;
  }, [appointments]);

  const overdueClients = useMemo(() =>
    clients.filter(c => { const s = clientStats[c.name] || {}; return !s.next && daysSince(s.last) >= overdueThreshold; }),
    [clients, clientStats, overdueThreshold]
  );

  function addNote(clientName, entry) {
    setNotes(prev => ({ ...prev, [clientName]: [...(prev[clientName] || []), entry] }));
    insertNote(clientName, entry);
  }

  function updateClientBrokers(clientId, newBrokers) {
    setClients(prev => {
      const updated = prev.map(cl => cl.id === clientId ? { ...cl, manualBrokers: newBrokers } : cl);
      const client = updated.find(cl => cl.id === clientId);
      if (client) upsertClient(client);
      return updated;
    });
  }

  async function syncPipedrive() {
    if (!creds.pipedriveToken) { setSyncMsg(m => ({ ...m, pipedrive: "Enter your Pipedrive API token first." })); return; }
    const token = creds.pipedriveToken.trim();
    setSyncStatus(s => ({ ...s, pipedrive: "syncing" }));
    try {
      setSyncMsg(m => ({ ...m, pipedrive: "Step 1/3: Fetching custom field definitions…" }));
      const fieldsData = JSON.parse(await (await fetch(`${WORKER_URL}?api_token=${token}&endpoint=/v1/personFields`)).text());
      const sourceField = (fieldsData.data || []).find(f => f.name && f.name.toLowerCase().includes("source") && f.field_type !== undefined);
      const sourceKey = sourceField ? sourceField.key : null;
      const sourceOptions = sourceField?.options ? Object.fromEntries(sourceField.options.map(o => [String(o.id), o.label])) : null;

      setSyncMsg(m => ({ ...m, pipedrive: "Step 2/3: Fetching contacts…" }));
      const data = JSON.parse(await (await fetch(`${WORKER_URL}?api_token=${token}&endpoint=/v1/persons`)).text());
      if (data.success === false) throw new Error(data.error || "Pipedrive API error");

      const personMap = {};
      const contacts = (data.data || []).map((p, i) => {
        let contactSource = "";
        if (sourceKey && p[sourceKey] != null) {
          const val = String(p[sourceKey]);
          contactSource = sourceOptions ? (sourceOptions[val] || val) : val;
        }
        if (p.id) personMap[p.id] = p.name || "";
        const ownerName = p.owner_name || p.owner?.name || "";
        const ownerFirst = ownerName.split(" ")[0];
        const matchedBroker = brokers.find(b => ownerName.toLowerCase().includes(b.toLowerCase()));
        const assignedBroker = matchedBroker ? matchedBroker : ownerFirst ? `${ownerFirst} / Unassigned` : "";
        return { id: "pd_" + (p.id || i), name: p.name || "", phone: p.phone?.[0]?.value || "", email: p.email?.[0]?.value || "", importedFrom: "pipedrive", contactSource, assignedBroker };
      }).filter(c => c.name);
      mergeClients(contacts, "pipedrive");

      setSyncMsg(m => ({ ...m, pipedrive: "Step 3/3: Fetching activities…" }));
      const actData = JSON.parse(await (await fetch(`${WORKER_URL}?api_token=${token}&endpoint=/v1/activities&extra=start=0`)).text());
      const newAppts = [];
      if (actData.success !== false && actData.data) {
        (actData.data || []).forEach(act => {
          if (!act.due_date || !act.person_id) return;
          const clientName = personMap[act.person_id] || act.person_name || "";
          if (!clientName) return;
          let startHour = 9;
          if (act.due_time) {
            const [hh, mm] = act.due_time.split(":").map(Number);
            startHour = hh + (mm >= 30 ? 0.5 : 0);
            if (startHour < 9) startHour = 9;
            if (startHour >= 17) return;
          }
          let duration = 1;
          if (act.duration) {
            const [dh, dm] = act.duration.split(":").map(Number);
            const hrs = dh + dm / 60;
            duration = hrs <= 1 ? 1 : hrs <= 1.5 ? 1.5 : 2;
          }
          const assignedUser = (act.owner_name || "").toLowerCase();
          const matchedBroker = brokers.find(b => assignedUser.includes(b.toLowerCase())) || brokers[0];
          newAppts.push({ id: "pd_act_" + act.id, broker: matchedBroker, date: act.due_date, startHour, duration, clientName, notes: act.subject || act.type || "", fromPipedrive: true });
        });
        setAppts(prev => {
          const manual = prev.filter(a => !a.fromPipedrive);
          const deduped = newAppts.filter(na => !manual.find(m => m.date === na.date && m.broker === na.broker && m.startHour === na.startHour));
          upsertAppts(deduped);
          return [...manual, ...deduped];
        });
      }
      setSyncStatus(s => ({ ...s, pipedrive: "ok" }));
      setSyncMsg(m => ({ ...m, pipedrive: `✓ Synced ${contacts.length} contacts + ${newAppts.length} activities.` }));
    } catch (e) {
      setSyncStatus(s => ({ ...s, pipedrive: "error" }));
      setSyncMsg(m => ({ ...m, pipedrive: `Error: ${e.message}` }));
    }
  }

  async function syncRedtail() {
    if (!creds.redtailUser || !creds.redtailKey) { setSyncMsg(m => ({ ...m, redtail: "Enter credentials first." })); return; }
    setSyncStatus(s => ({ ...s, redtail: "syncing" }));
    setSyncMsg(m => ({ ...m, redtail: "Connecting to Redtail…" }));
    try {
      const token = btoa(`${creds.redtailUser}:${creds.redtailKey}`);
      const res = await fetch("https://smf.crm3.redtailtechnology.com/api/public/v1/contacts?include=phones,emails&page_size=200", { headers: { Authorization: `Basic ${token}`, Accept: "application/json" } });
      if (!res.ok) throw new Error(`Redtail returned ${res.status}`);
      const data = await res.json();
      const contacts = (data.contacts || data.data || []).map((c, i) => ({
        id: "rt_" + (c.id || i), name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
        phone: c.phones?.[0]?.number || "", email: c.emails?.[0]?.address || "",
        importedFrom: "redtail", contactSource: c.source || c.category || "", assignedBroker: "",
      })).filter(c => c.name && c.name !== "Unknown");
      mergeClients(contacts, "redtail");
      setSyncStatus(s => ({ ...s, redtail: "ok" }));
      setSyncMsg(m => ({ ...m, redtail: `✓ Synced ${contacts.length} contacts from Redtail.` }));
    } catch (e) {
      setSyncStatus(s => ({ ...s, redtail: "error" }));
      setSyncMsg(m => ({ ...m, redtail: `Error: ${e.message}` }));
    }
  }

  function mergeClients(incoming, importedFrom) {
    setClients(prev => {
      const updated = prev.map(c => {
        const match = incoming.find(i => i.name.toLowerCase() === c.name.toLowerCase());
        if (!match) return c;
        return { ...c, importedFrom, phone: c.phone || match.phone, email: c.email || match.email, assignedBroker: match.assignedBroker || c.assignedBroker || "", contactSource: match.contactSource || c.contactSource || "" };
      });
      const existingNames = new Set(prev.map(c => c.name.toLowerCase()));
      const newOnes = incoming.filter(c => !existingNames.has(c.name.toLowerCase()));
      const all = [...updated, ...newOnes];
      upsertClients(all);
      return all;
    });
  }

  function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = parseCSV(ev.target.result);
      if (!result) { alert("Could not parse CSV."); return; }
      mergeClients(result, "csv");
      alert(`✓ Imported ${result.length} clients.`);
      if (csvRef.current) csvRef.current.value = "";
    };
    reader.readAsText(file);
  }

  function openNewAppt(broker, date, startHour) { setForm({ broker, date: dateKey(date), startHour, endHour: Math.min(startHour + 1, 20), clientName: "", notes: "" }); setModal({ type: "new" }); }
  function openEditAppt(appt) { setForm({ ...appt, endHour: appt.startHour + appt.duration }); setModal({ type: "edit" }); }

  function saveAppt() {
    if (!form.clientName.trim()) return;
    const duration = Math.round((form.endHour - form.startHour) * 2) / 2;
    if (duration <= 0) return;
    const apptData = { broker: form.broker, date: form.date, startHour: form.startHour, duration, clientName: form.clientName, notes: form.notes || "", fromPipedrive: form.fromPipedrive || false };
    if (modal.type === "new") {
      const id = Date.now().toString();
      const newAppt = { ...apptData, id };
      setAppts(prev => [...prev, newAppt]);
      upsertAppt(newAppt);
      if (!clients.find(c => c.name.toLowerCase() === form.clientName.toLowerCase())) {
        const newClient = { id: id + "c", name: form.clientName, phone: "", email: "", importedFrom: "manual", contactSource: "", assignedBroker: form.broker };
        setClients(prev => [...prev, newClient]);
        upsertClient(newClient);
      }
    } else {
      const updatedAppt = { ...apptData, id: form.id };
      setAppts(prev => prev.map(a => a.id === form.id ? updatedAppt : a));
      upsertAppt(updatedAppt);
    }
    setModal(null);
  }

  function deleteAppt(id) { setAppts(prev => prev.filter(a => a.id !== id)); deleteApptDB(id); setModal(null); }

  function deleteClient(client) {
    if (!window.confirm(`Delete "${client.name}" and all their appointments and notes? This cannot be undone.`)) return;
    setClients(prev => prev.filter(c => c.id !== client.id));
    setAppts(prev => prev.filter(a => a.clientName !== client.name));
    setNotes(prev => { const n = { ...prev }; delete n[client.name]; return n; });
    deleteClientDB(client.id, client.name);
  }

  function toggleSelectClient(id) {
    setSelClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll() {
    setSelClients(prev => prev.size === filteredClients.length ? new Set() : new Set(filteredClients.map(c => c.id)));
  }

  function bulkAssign(person) {
    if (!person) return;
    setClients(prev => prev.map(c => {
      if (!selectedClients.has(c.id)) return c;
      const updated = { ...c, manualBrokers: [...new Set([...(c.manualBrokers || []), person])] };
      upsertClient(updated);
      return updated;
    }));
  }

  function bulkClearAssignments() {
    setClients(prev => prev.map(c => {
      if (!selectedClients.has(c.id)) return c;
      const updated = { ...c, manualBrokers: [] };
      upsertClient(updated);
      return updated;
    }));
  }

  function bulkDelete() {
    if (!window.confirm(`Delete ${selectedClients.size} client${selectedClients.size > 1 ? "s" : ""} and all their appointments and notes? This cannot be undone.`)) return;
    const toDelete = clients.filter(c => selectedClients.has(c.id));
    setClients(prev => prev.filter(c => !selectedClients.has(c.id)));
    setAppts(prev => prev.filter(a => !toDelete.find(c => c.name === a.clientName)));
    setNotes(prev => { const n = { ...prev }; toDelete.forEach(c => delete n[c.name]); return n; });
    toDelete.forEach(c => deleteClientDB(c.id, c.name));
    setSelClients(new Set());
  }

  function apptAt(broker, date, hour) {
    return appointments.find(a => a.broker === broker && a.date === dateKey(date) && a.startHour === hour);
  }

  function isBlockedByPrev(broker, date, hour) {
    for (const s of HOURS) {
      if (s >= hour) break;
      const found = appointments.find(a => a.broker === broker && a.date === dateKey(date) && a.startHour === s);
      if (found && s + found.duration > hour) return found;
    }
    return null;
  }

  const S = {
    root:         { minHeight: "100vh", background: "#07131f", color: "#d0e4f7", fontFamily: "'Segoe UI',sans-serif", fontSize: 13 },
    header:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "#0a1e30", borderBottom: "1px solid #1a3a5c", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 8 },
    headerLeft:   { display: "flex", alignItems: "center", gap: 10 },
    logoText:     { fontWeight: 700, fontSize: 15, color: "#d0e4f7" },
    logoSub:      { fontSize: 10, color: "#5a7a9a" },
    nav:          { display: "flex", gap: 5, flexWrap: "wrap" },
    navBtn:       { background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 },
    navActive:    { background: "#1a3a5c", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 },
    iconBtn:      { background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12 },
    saveBtn2:     { background: "#1a3a1a", border: "1px solid #4caf73", color: "#4caf73", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 },
    loadBtn:      { background: "#1a2a1a", border: "1px solid #4caf73", color: "#4caf73", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 },
    saveMsgBar:   { background: "#0a2a1a", borderBottom: "1px solid #1a5a3a", padding: "8px 20px", color: "#4caf73", fontSize: 12, textAlign: "center" },
    page:         { padding: "16px 20px", maxWidth: "100%", overflowX: "auto" },
    weekNav:      { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" },
    weekBtn:      { background: "#0f2030", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
    weekLabel:    { fontWeight: 700, fontSize: 14, color: "#d0e4f7" },
    grid:         { borderCollapse: "collapse", minWidth: 900, width: "100%", tableLayout: "fixed" },
    timeHeader:   { width: 58, background: "#0a1e30", padding: "6px 8px", color: "#5a7a9a", fontWeight: 400, fontSize: 11, textAlign: "right", borderBottom: "1px solid #1a3a5c" },
    dayHeader:    { padding: "8px 4px", textAlign: "center", fontSize: 12, color: "#d0e4f7", borderBottom: "1px solid #1a3a5c", borderLeft: "1px solid #1a3a5c" },
    brokerRow:    { display: "flex", width: "100%" },
    brokerHeader: { flex: 1, padding: "3px 2px", fontSize: 9, color: "#5a8aaa", textAlign: "center", borderRight: "1px solid #0d2035", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#0c1f30" },
    staffHeader:  { flex: 1, padding: "3px 2px", fontSize: 9, color: "#5aaa8a", textAlign: "center", borderRight: "1px solid #0d2035", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#0c2018" },
    trFull:       { borderTop: "1px solid #1a3050" },
    trHalf:       { borderTop: "1px dotted #0f2030" },
    timeCell:     { padding: "0 6px", textAlign: "right", fontSize: 9, color: "#5a7a9a", verticalAlign: "top", whiteSpace: "nowrap", width: 58, height: 28 },
    emptyCell:    { flex: 1, height: 28, borderRight: "1px solid #0d2035" },
    blockedCell:  { flex: 1, height: 28, background: "#0f1e2a", borderRight: "1px solid #0d2035" },
    apptCell:     { flex: 1, padding: "2px 3px", overflow: "hidden", borderRight: "1px solid #0d2035", borderLeft: "2px solid #4db8ff" },
    apptName:     { fontWeight: 600, fontSize: 9, color: "#cce8ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    apptDur:      { fontSize: 8, color: "#4db8ff" },
    apptNotes:    { fontSize: 8, color: "#8ba8c0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    toolBar:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 },
    sectionTitle: { margin: 0, fontSize: 16, color: "#d0e4f7" },
    searchInput:  { background: "#0a1e30", border: "1px solid #1a3a5c", borderRadius: 6, color: "#d0e4f7", padding: "6px 12px", fontSize: 13 },
    addBtn:       { background: "#1a4a6b", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12 },
    clientTable:  { width: "100%", borderCollapse: "collapse" },
    clientTh:     { background: "#0a1e30", padding: "10px 12px", textAlign: "left", color: "#c0d8f0", fontSize: 13, fontWeight: 800, borderBottom: "2px solid #1a3a5c", letterSpacing: "0.4px" },
    clientTd:     { padding: "8px 12px", borderBottom: "1px solid #0f2030", fontSize: 12 },
    clientRow:    { background: "#07131f" },
    overdueRow:   { background: "#150c0c" },
    badge:        { padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600 },
    empty:        { textAlign: "center", padding: 48, color: "#5a7a9a" },
    overlay:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
    modalBox:     { background: "#0d1e2e", border: "1px solid #1a3a5c", borderRadius: 12, padding: 24, width: 460, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" },
    modalTitle:   { margin: "0 0 4px", color: "#d0e4f7", fontSize: 16 },
    label:        { display: "block", color: "#8b9db5", fontSize: 11, marginBottom: 4, marginTop: 12 },
    input:        { width: "100%", background: "#07131f", border: "1px solid #1a3a5c", borderRadius: 6, color: "#d0e4f7", padding: "7px 10px", fontSize: 13, boxSizing: "border-box" },
    modalActions: { display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" },
    saveBtn:      { background: "#1a4a6b", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
    cancelBtn:    { background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13 },
    deleteBtn:    { background: "#3a1010", border: "1px solid #7a2020", color: "#ff6b6b", borderRadius: 6, padding: "8px 14px", cursor: "pointer", marginRight: "auto", fontSize: 13 },
    stbBtn:       { background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
    stbActive:    { background: "#1a3a5c", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 },
    crmCard:      { display: "flex", alignItems: "center", gap: 12, background: "#0a1e30", borderRadius: 8, padding: "12px 14px", marginBottom: 4 },
  };

  const filteredClients = clients
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search) || (c.email || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => nameSort === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={{ fontSize: 22 }}>📋</span>
          <div><div style={S.logoText}>BrokerScheduler</div><div style={S.logoSub}>Financial Advisory</div></div>
        </div>
        <nav style={S.nav}>
          {[["schedule","📅 Schedule"],["clients",`👤 Clients (${clients.length})`],["overdue",`⚠️ Overdue (${overdueClients.length})`]].map(([id, label]) => (
            <button key={id} style={tab === id ? S.navActive : S.navBtn} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {loading && <span style={{ color: "#5a7a9a", fontSize: 12 }}>⏳ Connecting…</span>}
          <button style={S.iconBtn} onClick={() => setSOp(true)}>⚙️ Settings</button>
        </div>
      </header>

      {tab === "schedule" && (
        <div style={S.page}>
          <div style={{ ...S.weekNav, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button style={S.weekBtn} onClick={() => setWeekStart(w => addDays(w, -7))}>← Prev</button>
              <span style={S.weekLabel}>{fmt(weekStart)} — {fmt(addDays(weekStart, 6))}</span>
              <button style={S.weekBtn} onClick={() => setWeekStart(getMondayOf(TODAY))}>Today</button>
              <button style={S.weekBtn} onClick={() => setWeekStart(w => addDays(w, 7))}>Next →</button>
            </div>
            <button style={S.addBtn} onClick={() => { setForm({ broker: brokers[0] || "", date: dateKey(TODAY), startHour: 9, endHour: 10, clientName: "", notes: "" }); setModal({ type: "new" }); }}>
              + New Appointment
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={S.grid}>
              <thead>
                <tr>
                  <th style={S.timeHeader}>Time</th>
                  {weekDays.map(({ name, date }) => (
                    <th key={name} style={{ ...S.dayHeader, background: dateKey(date) === dateKey(TODAY) ? "#1a3a5c" : "#0f2030" }}>
                      <div style={{ fontWeight: 700 }}>{name}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{fmt(date)}</div>
                    </th>
                  ))}
                </tr>
                <tr>
                  <td style={S.timeCell} />
                  {weekDays.map(({ name }) => (
                    <td key={name} style={{ padding: 0 }}>
                      <div style={S.brokerRow}>
                        {brokers.map(b => <div key={b} style={S.brokerHeader}>{b}</div>)}
                        <div style={S.staffHeader}>Staff</div>
                      </div>
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.filter(h => h < 20).map(hour => (
                  <tr key={hour} style={hour % 1 === 0 ? S.trFull : S.trHalf}>
                    <td style={S.timeCell}>{hour % 1 === 0 ? hourLabel(hour) : ""}</td>
                    {weekDays.map(({ name, date }) => (
                      <td key={name} style={{ padding: 0, verticalAlign: "top" }}>
                        <div style={S.brokerRow}>
                          {[...brokers, "Staff"].map((person, pi) => {
                            const isStaff = pi >= brokers.length;
                            const appt = apptAt(person, date, hour);
                            const blocked = !appt && isBlockedByPrev(person, date, hour);
                            if (blocked) return <div key={person} style={{ ...S.blockedCell, background: isStaff ? "#0a1a12" : S.blockedCell.background }} />;
                            if (appt) {
                              const rows = appt.duration / 0.5;
                              const hasNotes = (notes[appt.clientName] || []).length > 0;
                              const bg = isStaff
                                ? (appt.duration === 2 ? "#1a4a30" : appt.duration === 1.5 ? "#163d28" : "#122f20")
                                : (appt.duration === 2 ? "#1a4a6b" : appt.duration === 1.5 ? "#163d5a" : "#122f48");
                              return (
                                <div key={person} style={{ ...S.apptCell, height: `${rows * 28}px`, background: bg, cursor: "pointer", borderLeft: `2px solid ${isStaff ? "#4caf73" : "#4db8ff"}` }} onClick={() => openEditAppt(appt)}>
                                  <div style={{ ...S.apptName, color: isStaff ? "#ccf0e0" : S.apptName.color }}>{appt.clientName}{hasNotes ? " 📝" : ""}</div>
                                  {appt.duration !== 1 && <div style={{ ...S.apptDur, color: isStaff ? "#4caf73" : S.apptDur.color }}>{appt.duration}h</div>}
                                  {appt.notes && <div style={S.apptNotes}>{appt.notes}</div>}
                                </div>
                              );
                            }
                            const isPast = new Date(dateKey(date)) < new Date(dateKey(TODAY));
                            return <div key={person} style={{ ...S.emptyCell, cursor: isPast ? "default" : "pointer" }} onClick={() => !isPast && openNewAppt(person, date, hour)} />;
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "clients" && (
        <div style={S.page}>
          <div style={S.toolBar}>
            <h2 style={S.sectionTitle}>Client Directory</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={S.searchInput} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
              <button style={S.addBtn} onClick={() => { setForm({ name: "", phone: "", email: "", contactSource: "" }); setModal({ type: "addClient" }); }}>+ Add Client</button>
            </div>
          </div>

          {selectedClients.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0f2540", border: "1px solid #2a5a9c", borderRadius: 8, padding: "10px 14px", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ color: "#4db8ff", fontWeight: 700, fontSize: 13, marginRight: 4 }}>{selectedClients.size} selected</span>
              <select style={{ background: "#0a1e30", border: "1px solid #1a3a5c", color: "#d0e4f7", borderRadius: 6, padding: "5px 8px", fontSize: 12, cursor: "pointer" }}
                defaultValue=""
                onChange={e => { bulkAssign(e.target.value); e.target.value = ""; }}>
                <option value="" disabled>Assign broker / staff…</option>
                {brokers.map(b => <option key={b} value={b}>{b}</option>)}
                <option value="Staff">Staff</option>
              </select>
              <button onClick={bulkClearAssignments}
                style={{ background: "#1a2a1a", border: "1px solid #4a7a4a", color: "#8bd08b", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>
                Clear Assignments
              </button>
              <button onClick={bulkDelete}
                style={{ background: "#3a1010", border: "1px solid #7a2020", color: "#ff6b6b", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>
                🗑 Delete Selected
              </button>
              <button onClick={() => setSelClients(new Set())}
                style={{ background: "none", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, marginLeft: "auto" }}>
                Deselect All
              </button>
            </div>
          )}

          <table style={S.clientTable}>
            <thead>
              <tr>
                <th style={{ ...S.clientTh, width: 36, textAlign: "center" }}>
                  <input type="checkbox" checked={filteredClients.length > 0 && selectedClients.size === filteredClients.length}
                    onChange={toggleSelectAll} style={{ cursor: "pointer", accentColor: "#4db8ff" }} />
                </th>
                <th style={{ ...S.clientTh, cursor: "pointer", userSelect: "none" }} onClick={() => setNameSort(s => s === "asc" ? "desc" : "asc")}>
                  Client {nameSort === "asc" ? "▲" : "▼"}
                </th>
                {["Phone","Email","Imported From","Broker","Last Appt","Next Appt","Status","Notes"].map(h => <th key={h} style={S.clientTh}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(c => {
                const st = clientStats[c.name] || {};
                const ds = daysSince(st.last);
                const overdue = !st.next && ds >= overdueThreshold;
                const recentAppt = [...appointments].filter(a => a.clientName === c.name).sort((a,b) => new Date(b.date)-new Date(a.date))[0];
                const autoBroker = c.assignedBroker || (recentAppt ? recentAppt.broker : "");
                const manualBrokers = c.manualBrokers || [];
                const allBrokers = manualBrokers.length > 0 ? manualBrokers : (autoBroker ? [autoBroker] : []);
                const clientNoteCount = (notes[c.name] || []).length;
                const isSelected = selectedClients.has(c.id);
                return (
                  <tr key={c.id} style={{ ...(overdue ? S.overdueRow : S.clientRow), ...(isSelected ? { background: "#0d2540", outline: "1px solid #2a5a9c" } : {}) }}>
                    <td style={{ ...S.clientTd, textAlign: "center" }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectClient(c.id)} style={{ cursor: "pointer", accentColor: "#4db8ff" }} />
                    </td>
                    <td style={S.clientTd}><strong>{c.name}</strong></td>
                    <td style={S.clientTd}>{c.phone || "—"}</td>
                    <td style={S.clientTd}>{c.email || "—"}</td>
                    <td style={S.clientTd}><ImportedFromBadge src={c.importedFrom} /></td>
                    <td style={S.clientTd}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {allBrokers.length > 0
                          ? allBrokers.map((b, i) => (
                            <span key={i} style={{ background: b.includes("Unassigned") ? "#2a1a0a" : "#0f2a1a", color: b.includes("Unassigned") ? "#ff9a3c" : "#4caf73", borderRadius: 8, padding: "1px 8px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                              {b}
                              {manualBrokers.includes(b) && <span style={{ cursor: "pointer", fontSize: 10, opacity: 0.7 }} onClick={() => updateClientBrokers(c.id, (c.manualBrokers||[]).filter(x => x !== b))}>✕</span>}
                            </span>
                          ))
                          : <span style={{ color: "#5a7a9a" }}>—</span>
                        }
                        <select style={{ background: "#0a1e30", border: "1px solid #1a3a5c", color: "#8b9db5", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer" }} value=""
                          onChange={e => { const val = e.target.value; if (!val) return; updateClientBrokers(c.id, [...new Set([...(c.manualBrokers||[]), val])]); }}>
                          <option value="">+ Add</option>
                          {brokers.filter(b => !manualBrokers.includes(b)).map(b => <option key={b} value={b}>{b}</option>)}
                          {!manualBrokers.includes("Staff") && <option value="Staff">Staff</option>}
                        </select>
                      </div>
                    </td>
                    <td style={S.clientTd}>{st.last ? fmtFull(st.last) : <span style={{ color: "#5a7a9a" }}>Never</span>}</td>
                    <td style={S.clientTd}>{st.next ? fmtFull(st.next) : <span style={{ color: "#ff9a3c" }}>None scheduled</span>}</td>
                    <td style={S.clientTd}>
                      <span style={{ ...S.badge, background: overdue ? "#7a2020" : st.next ? "#1a4a2a" : "#1a2a3a", color: overdue ? "#ff6b6b" : st.next ? "#4caf73" : "#8b9db5" }}>
                        {overdue ? "⚠️ Overdue" : st.next ? "✓ Scheduled" : st.last ? "No future appt" : "New"}
                      </span>
                    </td>
                    <td style={S.clientTd}>
                      <button onClick={() => setNotesClient(c)}
                        style={{ background: clientNoteCount > 0 ? "#1a3a1a" : "#0a1e30", border: `1px solid ${clientNoteCount > 0 ? "#4caf73" : "#1a3a5c"}`, color: clientNoteCount > 0 ? "#4caf73" : "#5a7a9a", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                        📝 {clientNoteCount > 0 ? `${clientNoteCount} Note${clientNoteCount > 1 ? "s" : ""}` : "Add Note"}
                      </button>
                      <button onClick={() => { setForm({ broker: (c.manualBrokers?.[0]) || c.assignedBroker || brokers[0] || "", date: dateKey(TODAY), startHour: 9, endHour: 10, clientName: c.name, notes: "" }); setModal({ type: "new" }); setTab("schedule"); }}
                        style={{ background: "#1a3a5c", border: "1px solid #4db8ff", color: "#4db8ff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>
                        📅 Book
                      </button>

                      <button onClick={() => deleteClient(c)}
                        style={{ background: "#3a1010", border: "1px solid #7a2020", color: "#ff6b6b", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>
                        🗑 Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clients.length === 0 && <div style={S.empty}><div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>No clients yet.</div>}
        </div>
      )}

      {tab === "overdue" && (
        <div style={S.page}>
          <div style={S.toolBar}>
            <h2 style={S.sectionTitle}>⚠️ Overdue — No appointment in {overdueThreshold}+ days</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ color: "#8b9db5", fontSize: 13 }}>Threshold:</label>
              <input type="number" style={{ ...S.searchInput, width: 70 }} value={overdueThreshold} onChange={e => setODT(Number(e.target.value))} />
              <span style={{ color: "#8b9db5", fontSize: 13 }}>days</span>
            </div>
          </div>
          {overdueClients.length === 0
            ? <div style={S.empty}><div style={{ fontSize: 32 }}>🎉</div>No overdue clients!</div>
            : <table style={S.clientTable}>
                <thead><tr>{["Client","Phone","Email","Imported From","Last Seen","Days Since","Notes"].map(h => <th key={h} style={S.clientTh}>{h}</th>)}</tr></thead>
                <tbody>
                  {overdueClients.map(c => {
                    const st = clientStats[c.name] || {};
                    const ds = daysSince(st.last);
                    const clientNoteCount = (notes[c.name] || []).length;
                    return (
                      <tr key={c.id} style={S.overdueRow}>
                        <td style={S.clientTd}><strong>{c.name}</strong></td>
                        <td style={S.clientTd}>{c.phone || "—"}</td>
                        <td style={S.clientTd}>{c.email || "—"}</td>
                        <td style={S.clientTd}><ImportedFromBadge src={c.importedFrom} /></td>
                        <td style={S.clientTd}>{st.last ? fmtFull(st.last) : <span style={{ color: "#5a7a9a" }}>Never</span>}</td>
                        <td style={{ ...S.clientTd, color: "#ff6b6b", fontWeight: 700 }}>{ds === Infinity ? "Never" : `${ds} days`}</td>
                        <td style={S.clientTd}>
                          <button onClick={() => setNotesClient(c)}
                            style={{ background: clientNoteCount > 0 ? "#1a3a1a" : "#0a1e30", border: `1px solid ${clientNoteCount > 0 ? "#4caf73" : "#1a3a5c"}`, color: clientNoteCount > 0 ? "#4caf73" : "#5a7a9a", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                            📝 {clientNoteCount > 0 ? `${clientNoteCount} Note${clientNoteCount > 1 ? "s" : ""}` : "Add Note"}
                          </button>
                          <button onClick={() => deleteClient(c)}
                            style={{ background: "#3a1010", border: "1px solid #7a2020", color: "#ff6b6b", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </div>
      )}

      {settingsOpen && (
        <div style={S.overlay} onClick={() => setSOp(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ ...S.modalTitle, margin: 0 }}>⚙️ Settings</h3>
              <button style={S.cancelBtn} onClick={() => setSOp(false)}>✕ Close</button>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1a3a5c", paddingBottom: 12, flexWrap: "wrap" }}>
              {[["brokers","👥 Brokers"],["redtail","🔴 Redtail"],["pipedrive","🟣 Pipedrive"],["csv","📄 CSV"]].map(([id, label]) => (
                <button key={id} style={settingsTab === id ? S.stbActive : S.stbBtn} onClick={() => setSTB(id)}>{label}</button>
              ))}
            </div>
            {settingsTab === "brokers" && (
              <>
                <label style={S.label}>Broker Names (one per line)</label>
                <textarea style={{ ...S.input, height: 130, resize: "vertical", marginTop: 4 }} value={brokers.join("\n")} onChange={e => setBrokers(e.target.value.split("\n").filter(Boolean))} />
                <label style={S.label}>Overdue threshold (days)</label>
                <input type="number" style={{ ...S.input, width: 100, marginTop: 4 }} value={overdueThreshold} onChange={e => setODT(Number(e.target.value))} />
              </>
            )}
            {settingsTab === "redtail" && (
              <>
                <div style={S.crmCard}><span style={{ fontSize: 24 }}>🔴</span><div><div style={{ fontWeight: 700, color: "#d0e4f7" }}>Redtail CRM</div></div></div>
                <label style={S.label}>Username</label>
                <input style={S.input} value={creds.redtailUser} onChange={e => setCreds(c => ({ ...c, redtailUser: e.target.value }))} />
                <label style={S.label}>API Key</label>
                <input style={S.input} type="password" value={creds.redtailKey} onChange={e => setCreds(c => ({ ...c, redtailKey: e.target.value }))} />
                <button style={{ ...S.saveBtn, marginTop: 14 }} onClick={syncRedtail}>🔄 Sync Redtail</button>
                {syncMsg.redtail && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, background: syncStatus.redtail === "ok" ? "#0f2a0f" : "#2a0f0f", color: syncStatus.redtail === "ok" ? "#4caf73" : "#ff6b6b" }}>{syncMsg.redtail}</div>}
              </>
            )}
            {settingsTab === "pipedrive" && (
              <>
                <div style={S.crmCard}><span style={{ fontSize: 24 }}>🟣</span><div><div style={{ fontWeight: 700, color: "#d0e4f7" }}>Pipedrive CRM</div></div></div>
                <label style={S.label}>API Token</label>
                <input style={S.input} type="password" value={creds.pipedriveToken} onChange={e => setCreds(c => ({ ...c, pipedriveToken: e.target.value }))} />
                <button style={{ ...S.saveBtn, marginTop: 14 }} onClick={syncPipedrive}>🔄 Sync Pipedrive</button>
                {syncMsg.pipedrive && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, background: syncStatus.pipedrive === "ok" ? "#0f2a0f" : "#2a0f0f", color: syncStatus.pipedrive === "ok" ? "#4caf73" : "#ff6b6b" }}>{syncMsg.pipedrive}</div>}
              </>
            )}
            {settingsTab === "csv" && (
              <>
                <div style={S.crmCard}><span style={{ fontSize: 24 }}>📄</span><div><div style={{ fontWeight: 700, color: "#d0e4f7" }}>CSV Import</div></div></div>
                <div style={{ background: "#0a1e30", border: "1px dashed #1a3a5c", borderRadius: 8, padding: 24, textAlign: "center", marginTop: 14 }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>⬆️</div>
                  <input ref={csvRef} type="file" accept=".csv" onChange={handleCSV} style={{ color: "#8b9db5", fontSize: 12 }} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modal && (modal.type === "new" || modal.type === "edit") && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{modal.type === "new" ? "📅 New Appointment" : "✏️ Edit Appointment"}</h3>
            <label style={S.label}>Broker / Staff</label>
            <select style={S.input} value={form.broker} onChange={e => setForm(f => ({ ...f, broker: e.target.value }))}>
              {brokers.map(b => <option key={b} value={b}>{b}</option>)}
              <option value="Staff">Staff</option>
            </select>
            <label style={S.label}>Date</label>
            <input type="date" style={S.input} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <label style={S.label}>Start Time</label>
            <select style={S.input} value={form.startHour} onChange={e => {
              const s = parseFloat(e.target.value);
              setForm(f => ({ ...f, startHour: s, endHour: f.endHour > s ? f.endHour : Math.min(s + 1, 20) }));
            }}>
              {HOURS.filter(h => h < 20).map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <label style={S.label}>End Time</label>
            <select style={S.input} value={form.endHour} onChange={e => setForm(f => ({ ...f, endHour: parseFloat(e.target.value) }))}>
              {HOURS.filter(h => h > (form.startHour ?? 5) && h <= 20).map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
            <label style={S.label}>Client Name</label>
            <input style={S.input} list="client-list" value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Type or select…" />
            <datalist id="client-list">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
            <label style={S.label}>Appointment Notes</label>
            <input style={S.input} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional…" />
            <div style={S.modalActions}>
              {modal.type === "edit" && (
                <>
                  <button style={S.deleteBtn} onClick={() => deleteAppt(form.id)}>🗑 Delete</button>
                  <button style={{ ...S.cancelBtn, borderColor: "#4caf73", color: "#4caf73" }}
                    onClick={() => { const c = clients.find(cl => cl.name === form.clientName); if (c) { setModal(null); setNotesClient(c); } }}>
                    📝 Meeting Notes
                  </button>
                </>
              )}
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
              <button style={S.saveBtn} onClick={saveAppt}>{modal.type === "new" ? "Book" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {modal && modal.type === "addClient" && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>👤 Add Client</h3>
            <label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <label style={S.label}>Phone</label>
            <input style={S.input} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <label style={S.label}>Email</label>
            <input style={S.input} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <div style={S.modalActions}>
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
              <button style={S.saveBtn} onClick={() => {
                if (!form.name.trim()) return;
                const newClient = { ...form, id: Date.now().toString(), importedFrom: "manual", assignedBroker: "" };
                setClients(prev => [...prev, newClient]);
                upsertClient(newClient);
                setModal(null);
              }}>Add Client</button>
            </div>
          </div>
        </div>
      )}

      {notesClient && (
        <NotesModal client={notesClient} brokers={brokers} notes={notes}
          onClose={() => setNotesClient(null)}
          onSave={(clientName, entry) => addNote(clientName, entry)} />
      )}
    </div>
  );
}
