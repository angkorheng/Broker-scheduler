import React, { useState, useEffect, useMemo, useRef } from 'react';
import ImportedFromBadge from './components/ImportedFromBadge';
import NotesModal from './components/NotesModal';
import { WORKER_URL, DEFAULT_BROKERS, HOURS, DAYS } from './utils/constants';
import { TODAY, dateKey, daysSince, addDays, getMondayOf, fmt, fmtFull, hourLabel } from './utils/dateUtils';
import { loadAll, upsertAppt, upsertAppts, deleteApptDB, cancelApptDB, upsertClient, upsertClients, insertMeetingNote, saveSetting, deleteClientDB } from './utils/supabase';
import { parseCSV } from './utils/csvParser';

const PASS = "Cinergy0361!@";

function LoginGate({ onAuth }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  function attempt() {
    if (pw === PASS) { onAuth(); }
    else { setErr(true); setPw(""); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F6F7FA", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ background: "#FFFFFF", border: "1px solid #DCE3EA", borderRadius: 16, padding: "48px 52px", width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(28,43,58,0.16)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 600, fontSize: 30, color: "#1C2B3A", letterSpacing: "0.2px" }}>Cinergy Financial</div>
          <div style={{ width: 48, height: 2, background: "#2F5D8A", margin: "10px auto 14px" }} />
          <div style={{ fontSize: 14, color: "#8FA0AF", letterSpacing: "0.3px" }}>Financial Advisory Services — Please sign in</div>
        </div>
        <label style={{ display: "block", color: "#6B7C8C", fontSize: 16, marginBottom: 8, fontWeight: 600 }}>Password</label>
        <input
          type="password"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()}
          autoFocus
          style={{ width: "100%", background: "#F6F7FA", border: `2px solid ${err ? "#B0463B" : "#DCE3EA"}`, borderRadius: 8, color: "#1C2B3A", padding: "13px 16px", fontSize: 17, boxSizing: "border-box", outline: "none" }}
          placeholder="Enter your password…"
        />
        {err && <div style={{ color: "#B0463B", fontSize: 15, marginTop: 10, fontWeight: 600 }}>❌ Incorrect password. Please try again.</div>}
        <button
          onClick={attempt}
          style={{ marginTop: 22, width: "100%", background: "#E7EEF5", border: "2px solid #2F5D8A", color: "#2F5D8A", borderRadius: 8, padding: "14px", cursor: "pointer", fontWeight: 700, fontSize: 17 }}>
          🔓 Unlock
        </button>
      </div>
    </div>
  );
}

const CAL_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CAL_DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function CalendarPicker({ value, onChange }) {
  const todayStr = TODAY.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const [viewYear,  setViewYear]  = useState(() => value ? parseInt(value.slice(0,4))    : parseInt(todayStr.slice(0,4)));
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.slice(5,7)) - 1 : parseInt(todayStr.slice(5,7)) - 1);

  useEffect(() => {
    if (value) { setViewYear(parseInt(value.slice(0,4))); setViewMonth(parseInt(value.slice(5,7)) - 1); }
  }, []); // sync to initial value only on mount

  function prev() { viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y-1)) : setViewMonth(m => m-1); }
  function next() { viewMonth === 11 ? (setViewMonth(0),  setViewYear(y => y+1)) : setViewMonth(m => m+1); }

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i+1)];

  return (
    <div style={{ background: "#F6F7FA", border: "2px solid #DCE3EA", borderRadius: 10, padding: "14px 16px", marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={prev} style={{ background: "none", border: "none", color: "#2F5D8A", cursor: "pointer", fontSize: 22, padding: "0 8px", lineHeight: 1 }}>‹</button>
        <span style={{ fontWeight: 700, color: "#1C2B3A", fontSize: 15 }}>{CAL_MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={next} style={{ background: "none", border: "none", color: "#2F5D8A", cursor: "pointer", fontSize: 22, padding: "0 8px", lineHeight: 1 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {CAL_DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: "#8FA0AF", fontWeight: 600, padding: "2px 0" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const m   = String(viewMonth + 1).padStart(2, "0");
          const day = String(d).padStart(2, "0");
          const ds  = `${viewYear}-${m}-${day}`;
          const sel = ds === value, tod = ds === todayStr;
          return (
            <div key={ds} onClick={() => onChange(ds)} style={{
              textAlign: "center", padding: "7px 0", borderRadius: 6, cursor: "pointer", fontSize: 13,
              background: sel ? "#E7EEF5" : tod ? "#EDF2F7" : "transparent",
              color:      sel ? "#2F5D8A" : tod ? "#5B85AC" : "#1C2B3A",
              border:     `2px solid ${sel ? "#2F5D8A" : tod ? "#6E8FAE" : "transparent"}`,
              fontWeight: sel || tod ? 700 : 400,
            }}>{d}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
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
  const [notesClientView, setNotesClientView] = useState("notes");
  const [reportDate, setReportDate] = useState(dateKey(TODAY));
  const [scheduleView, setScheduleView] = useState("day"); // day | week
  const [selectedDay, setSelectedDay] = useState(TODAY);
  const [clientStatuses, setClientStatuses] = useState({});
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
      if (d.clientStatuses) setClientStatuses(d.clientStatuses);
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
    const todayStr = TODAY.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    [...appointments].filter(a => a.status !== "cancelled").sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(appt => {
      if (!map[appt.clientName]) map[appt.clientName] = { last: null, next: null };
      if (appt.date < todayStr) map[appt.clientName].last = appt.date;
      else if (!map[appt.clientName].next) map[appt.clientName].next = appt.date;
    });
    return map;
  }, [appointments]);

  const overdueClients = useMemo(() =>
    clients.filter(c => { const s = clientStats[c.name] || {}; return !s.next && daysSince(s.last) >= overdueThreshold; }),
    [clients, clientStats, overdueThreshold]
  );

  function addNote(clientId, entry) {
    setNotes(prev => ({ ...prev, [clientId]: [...(prev[clientId] || []), entry] }));
    insertMeetingNote(clientId, entry);
  }

  function cancelAppt(id, reason) {
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status: "cancelled", cancelReason: reason || "" } : a));
    cancelApptDB(id, reason);
    setModal(null);
  }

  function setClientStatus(clientId, status) {
    setClientStatuses(prev => {
      const updated = { ...prev };
      if (!status) delete updated[clientId];
      else updated[clientId] = status;
      saveSetting('clientStatuses', updated);
      return updated;
    });
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

  function openNewAppt(broker, date, startHour) { setForm({ broker, date: dateKey(date), startHour, endHour: Math.min(startHour + 1, 20), clientName: "", notes: "", subject: "", location: "", confirmed: false, status: "scheduled", dateLastAcctSummary: "", rmd70Half: false, availableDpps: "", availableIfs: "", availableNotes: "" }); setModal({ type: "new" }); }
  function openEditAppt(appt) {
    const c = clients.find(cl => cl.id === appt.clientId) || clients.find(cl => cl.name.toLowerCase() === appt.clientName.toLowerCase());
    setForm({
      ...appt, endHour: appt.startHour + appt.duration,
      dateLastAcctSummary: c?.dateLastAcctSummary || "", rmd70Half: c?.rmd70Half || false,
      availableDpps: c?.availableDpps ?? "", availableIfs: c?.availableIfs ?? "", availableNotes: c?.availableNotes || "",
    });
    setModal({ type: "edit" });
  }

  function saveAppt() {
    if (!form.clientName.trim()) return;
    const duration = Math.round((form.endHour - form.startHour) * 2) / 2;
    if (duration <= 0) return;
    const matchedClient = clients.find(c => c.name.toLowerCase() === form.clientName.toLowerCase());
    const apptData = {
      broker: form.broker, date: form.date, startHour: form.startHour, duration,
      clientName: form.clientName, clientId: matchedClient ? matchedClient.id : null,
      notes: form.notes || "", subject: form.subject || "", location: form.location || "",
      confirmed: form.confirmed || false, status: form.status || "scheduled",
      fromRedtail: form.fromRedtail || false,
    };
    const financialFields = {
      dateLastAcctSummary: form.dateLastAcctSummary || null,
      rmd70Half: form.rmd70Half || false,
      availableDpps: form.availableDpps === "" || form.availableDpps == null ? null : Number(form.availableDpps),
      availableIfs: form.availableIfs === "" || form.availableIfs == null ? null : Number(form.availableIfs),
      availableNotes: form.availableNotes || "",
    };
    if (modal.type === "new") {
      const id = crypto.randomUUID();
      const newAppt = { ...apptData, id };
      setAppts(prev => [...prev, newAppt]);
      upsertAppt(newAppt);
      if (!matchedClient) {
        const newClientId = crypto.randomUUID();
        const newClient = { id: newClientId, name: form.clientName, phone: "", email: "", importedFrom: "manual", contactSource: "", assignedBroker: form.broker, ...financialFields };
        newAppt.clientId = newClientId;
        setClients(prev => [...prev, newClient]);
        upsertClient(newClient);
        upsertAppt(newAppt); // re-save with the linked clientId now that we have it
      } else {
        const updatedClient = { ...matchedClient, ...financialFields };
        setClients(prev => prev.map(c => c.id === matchedClient.id ? updatedClient : c));
        upsertClient(updatedClient);
      }
    } else {
      const updatedAppt = { ...apptData, id: form.id };
      setAppts(prev => prev.map(a => a.id === form.id ? updatedAppt : a));
      upsertAppt(updatedAppt);
      if (matchedClient) {
        const updatedClient = { ...matchedClient, ...financialFields };
        setClients(prev => prev.map(c => c.id === matchedClient.id ? updatedClient : c));
        upsertClient(updatedClient);
      }
    }
    setModal(null);
  }

  function deleteAppt(id) { setAppts(prev => prev.filter(a => a.id !== id)); deleteApptDB(id); setModal(null); }

  function deleteClient(client) {
    if (!window.confirm(`Delete "${client.name}" and all their appointments and notes? This cannot be undone.`)) return;
    setClients(prev => prev.filter(c => c.id !== client.id));
    setAppts(prev => prev.filter(a => a.clientName !== client.name));
    setNotes(prev => { const n = { ...prev }; delete n[client.id]; return n; });
    deleteClientDB(client.id, client.name);
  }

  function generateReport(dateStr) {
    const dayAppts = appointments
      .filter(a => a.date === dateStr && a.status !== "cancelled")
      .sort((a, b) => a.startHour - b.startHour);

    if (dayAppts.length === 0) {
      if (!window.confirm("No appointments scheduled for this day. Generate an empty report anyway?")) return;
    }

    const dateObj = new Date(dateStr + "T00:00:00");
    const dateLabel = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const now = new Date();
    const generatedOn = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const generatedAt = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    function clientFor(appt) {
      return clients.find(c => c.id === appt.clientId) || clients.find(c => c.name.toLowerCase() === appt.clientName.toLowerCase());
    }

    function fmtMoney(n) {
      if (n === null || n === undefined || n === "") return "";
      return "$" + Number(n).toLocaleString("en-US");
    }

    let totalAppts = 0;

    const brokerBlocksHtml = brokers.map(broker => {
      const rows = dayAppts.filter(a => a.broker === broker);
      totalAppts += rows.length;

      const rowsHtml = rows.map(a => {
        const c = clientFor(a);
        const durLabel = a.duration === 0.5 ? "30 min" : a.duration === 1 ? "1 hr" : a.duration + " hrs";
        return "<tr>"
          + "<td class='time'>" + hourLabel(a.startHour) + "</td>"
          + "<td class='name'><div class='client-name'>" + a.clientName + "</div>" + (a.subject ? "<div class='subject'>" + a.subject + "</div>" : "") + "</td>"
          + "<td class='center'>" + (c?.dateLastAcctSummary ? c.dateLastAcctSummary : "—") + "</td>"
          + "<td class='center'>" + (c?.rmd70Half ? "✓" : "") + "</td>"
          + "<td>" + [a.clientName && c?.phone, c?.email].filter(Boolean).join("<br>") + "</td>"
          + "<td class='center'>" + (a.location || "—") + "</td>"
          + "<td class='center'>" + (a.confirmed ? "✓" : "") + "</td>"
          + "<td class='center money'>" + (c?.availableDpps != null ? fmtMoney(c.availableDpps) : "") + "</td>"
          + "<td class='center money'>" + (c?.availableIfs != null ? fmtMoney(c.availableIfs) : "") + "</td>"
          + "<td class='notes-col'>" + (c?.availableNotes || "—") + "</td>"
          + "</tr>";
      }).join("");

      return "<div class='broker-block'>"
        + "<div class='broker-header'>" + dateLabel + "<br><span class='broker-name'>" + broker + "</span></div>"
        + "<table><thead><tr>"
        + "<th>Time</th><th>Name</th><th>Date of Last<br>Acct. Summary</th><th>RMD<br>70½</th><th>Phone/Email</th>"
        + "<th>Location</th><th>Confir.</th><th>Available<br>for DPPs</th><th>Available<br>for IFs</th><th>Available<br>for NOTES</th>"
        + "</tr></thead><tbody>" + (rowsHtml || "<tr><td colspan='10' class='empty-row'>No appointments scheduled</td></tr>") + "</tbody></table>"
        + "</div>";
    }).join("");

    const css = [
      "* { margin:0; padding:0; box-sizing:border-box; }",
      "body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#1C2B3A; background:#fff; padding:40px 46px; }",
      ".hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #DCE3EA; padding-bottom:20px; margin-bottom:28px; }",
      ".company { font-size:24px; font-weight:800; color:#1C2B3A; letter-spacing:-0.5px; }",
      ".tagline { font-size:12px; color:#8FA0AF; margin-top:3px; }",
      ".hdr-right { text-align:right; }",
      ".rpt-title { font-size:17px; font-weight:700; color:#2F5D8A; }",
      ".meta { margin-top:6px; font-size:11px; color:#8FA0AF; line-height:1.8; }",
      ".meta strong { color:#1C2B3A; }",
      ".broker-block { margin-bottom:26px; break-inside:avoid; }",
      ".broker-header { background:#2F5D8A; color:#fff; font-size:12px; font-weight:600; padding:8px 14px; border-radius:4px 4px 0 0; text-align:center; line-height:1.5; }",
      ".broker-name { font-size:15px; font-weight:800; letter-spacing:0.3px; }",
      "table { width:100%; border-collapse:collapse; }",
      "thead tr { background:#F1F4F7; }",
      "th { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; color:#8FA0AF; padding:7px 8px; text-align:center; border-bottom:2px solid #DDE6EE; line-height:1.3; }",
      "th:nth-child(2) { text-align:left; }",
      "td { padding:7px 8px; border-bottom:1px solid #EEF2F6; vertical-align:top; font-size:11.5px; }",
      "tr:last-child td { border-bottom:none; }",
      "tr:nth-child(even) td { background:#FAFBFC; }",
      "td.time { white-space:nowrap; font-weight:600; color:#2F5D8A; }",
      "td.name { font-weight:600; }",
      ".client-name { font-weight:700; }",
      ".subject { color:#8FA0AF; font-style:italic; font-weight:400; font-size:11px; margin-top:1px; }",
      "td.center { text-align:center; }",
      "td.money { font-weight:600; color:#3F8361; }",
      "td.notes-col { color:#8FA0AF; font-style:italic; font-size:11px; }",
      ".empty-row { text-align:center; color:#A9B4BF; font-style:italic; padding:14px; }",
      ".summary { display:flex; gap:36px; align-items:flex-start; background:#F1F4F7; border:1px solid #DCE3EA; border-radius:6px; padding:18px 26px; margin-top:28px; break-inside:avoid; }",
      ".sum-block h3 { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#8FA0AF; margin-bottom:8px; }",
      ".big-num { font-size:34px; font-weight:800; color:#1C2B3A; line-height:1; }",
      ".big-label { font-size:11px; color:#8FA0AF; margin-top:4px; }",
      ".divider { width:1px; background:#DCE3EA; align-self:stretch; }",
      ".footer { margin-top:32px; padding-top:12px; border-top:1px solid #DCE3EA; display:flex; justify-content:space-between; font-size:10.5px; color:#A9B4BF; }",
      "@media print { body { padding:18px 24px; } .broker-block { break-inside:avoid; } }",
    ].join(" ");

    const html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>"
      + "<title>Cinergy Financial \u2014 Daily Appointment Confirmation " + dateLabel + "</title>"
      + "<style>" + css + "</style></head><body>"
      + "<div class='hdr'>"
      +   "<div><div class='company'>Cinergy Financial</div><div class='tagline'>Financial Advisory Services</div></div>"
      +   "<div class='hdr-right'><div class='rpt-title'>Daily Appointment Confirmation</div>"
      +   "<div class='meta'><strong>Date:</strong> " + dateLabel + "<br><strong>Generated:</strong> " + generatedOn + " at " + generatedAt + "</div></div>"
      + "</div>"
      + brokerBlocksHtml
      + "<div class='footer'><span>Cinergy Financial Scheduler &mdash; Confidential &amp; Internal Use Only</span><span>Generated " + generatedOn + "</span></div>"
      + "<script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script>"
      + "</body></html>";

    const win = window.open("", "_blank", "width=1100,height=780");
    if (!win) { alert("Please allow pop-ups to generate the report."); return; }
    win.document.write(html);
    win.document.close();
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
    return appointments.find(a => a.broker === broker && a.date === dateKey(date) && a.startHour === hour && a.status !== "cancelled");
  }

  function isBlockedByPrev(broker, date, hour) {
    for (const s of HOURS) {
      if (s >= hour) break;
      const found = appointments.find(a => a.broker === broker && a.date === dateKey(date) && a.startHour === s && a.status !== "cancelled");
      if (found && s + found.duration > hour) return found;
    }
    return null;
  }

  const S = {
    root:         { minHeight: "100vh", background: "#F6F7FA", color: "#1C2B3A", fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 15 },
    header:       { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px", background: "#FFFFFF", borderBottom: "1px solid #DCE3EA", boxShadow: "0 1px 2px rgba(28,43,58,0.04)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 10 },
    headerLeft:   { display: "flex", alignItems: "center", gap: 14 },
    logoText:     { fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 600, fontSize: 22, color: "#1C2B3A", letterSpacing: "0.2px" },
    logoSub:      { fontSize: 12.5, color: "#8FA0AF", letterSpacing: "0.3px" },
    nav:          { display: "flex", gap: 6, flexWrap: "wrap" },
    navBtn:       { background: "none", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 500 },
    navActive:    { background: "#E7EEF5", border: "1px solid #2F5D8A", color: "#2F5D8A", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 700 },
    iconBtn:      { background: "none", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 13 },
    lockBtn:      { background: "none", border: "1px solid #E3C9A0", color: "#B8792E", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 13 },
    saveBtn2:     { background: "#E8F1EC", border: "1px solid #3F8361", color: "#3F8361", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600 },
    loadBtn:      { background: "#E8F1EC", border: "1px solid #3F8361", color: "#3F8361", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13 },
    saveMsgBar:   { background: "#E8F1EC", borderBottom: "1px solid #E3F0E8", padding: "10px 28px", color: "#3F8361", fontSize: 14, textAlign: "center" },
    page:         { padding: "24px 28px", maxWidth: "100%", overflowX: "auto" },
    weekNav:      { display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" },
    weekBtn:      { background: "#FFFFFF", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 14 },
    weekLabel:    { fontFamily: "'Source Serif 4',Georgia,serif", fontWeight: 600, fontSize: 19, color: "#1C2B3A" },
    grid:         { borderCollapse: "collapse", minWidth: 900, width: "100%", tableLayout: "fixed" },
    timeHeader:   { width: 68, background: "#FFFFFF", padding: "8px 10px", color: "#8FA0AF", fontWeight: 400, fontSize: 12, textAlign: "right", borderBottom: "1px solid #DCE3EA" },
    dayHeader:    { padding: "10px 4px", textAlign: "center", fontSize: 13.5, fontWeight: 600, color: "#1C2B3A", borderBottom: "1px solid #DCE3EA", borderLeft: "1px solid #DCE3EA" },
    brokerRow:    { display: "flex", width: "100%" },
    brokerHeader: { flex: 1, padding: "5px 2px", fontSize: 10.5, fontWeight: 600, color: "#8FA0AF", textAlign: "center", borderRight: "1px solid #E3E8EE", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#F1F4F7", textTransform: "uppercase", letterSpacing: "0.4px" },
    staffHeader:  { flex: 1, padding: "5px 2px", fontSize: 10.5, fontWeight: 600, color: "#4F8F68", textAlign: "center", borderRight: "1px solid #E3E8EE", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#EEF4EF", textTransform: "uppercase", letterSpacing: "0.4px" },
    trFull:       { borderTop: "1px solid #E3E8EE" },
    trHalf:       { borderTop: "1px dotted #EEF1F5" },
    timeCell:     { padding: "0 8px", textAlign: "right", fontSize: 11, color: "#8FA0AF", verticalAlign: "top", whiteSpace: "nowrap", width: 68, height: 34 },
    emptyCell:    { flex: 1, height: 34, borderRight: "1px solid #E3E8EE" },
    blockedCell:  { flex: 1, height: 34, background: "#F1F4F7", borderRight: "1px solid #E3E8EE" },
    apptCell:     { flex: 1, margin: "1px 2px", padding: "3px 5px", overflow: "hidden", background: "#FFFFFF", borderRadius: 5, boxShadow: "0 1px 2px rgba(28,43,58,0.08)", borderLeft: "3px solid #2F5D8A" },
    apptName:     { fontWeight: 700, fontSize: 11, color: "#1C2B3A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    apptDur:      { fontSize: 10, color: "#2F5D8A" },
    apptNotes:    { fontSize: 10, color: "#7C8DA0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    toolBar:      { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 },
    sectionTitle: { margin: 0, fontFamily: "'Source Serif 4',Georgia,serif", fontSize: 23, color: "#1C2B3A", fontWeight: 600 },
    searchInput:  { background: "#FFFFFF", border: "1px solid #DCE3EA", borderRadius: 8, color: "#1C2B3A", padding: "10px 16px", fontSize: 14 },
    addBtn:       { background: "#2F5D8A", border: "1px solid #2F5D8A", color: "#FFFFFF", borderRadius: 8, padding: "11px 22px", cursor: "pointer", fontSize: 14, fontWeight: 700 },
    reportBtn:    { background: "#E8F1EC", border: "1px solid #3F8361", color: "#3F8361", borderRadius: 8, padding: "11px 20px", cursor: "pointer", fontSize: 14, fontWeight: 600 },
    clientTable:  { width: "100%", borderCollapse: "collapse" },
    clientTh:     { background: "#F1F4F7", padding: "13px 16px", textAlign: "left", color: "#6B7C8C", fontSize: 12, fontWeight: 700, borderBottom: "1px solid #DCE3EA", letterSpacing: "0.5px", textTransform: "uppercase" },
    clientTd:     { padding: "13px 16px", borderBottom: "1px solid #EEF1F5", fontSize: 14 },
    clientRow:    { background: "#FFFFFF" },
    overdueRow:   { background: "#FBEEEC" },
    badge:        { padding: "5px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600 },
    empty:        { textAlign: "center", padding: 64, color: "#8FA0AF", fontSize: 17 },
    overlay:      { position: "fixed", inset: 0, background: "rgba(28,43,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
    modalBox:     { background: "#FFFFFF", border: "1px solid #DCE3EA", borderRadius: 14, padding: 32, width: 500, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(28,43,58,0.16)" },
    modalTitle:   { margin: "0 0 6px", fontFamily: "'Source Serif 4',Georgia,serif", color: "#1C2B3A", fontSize: 21, fontWeight: 600 },
    label:        { display: "block", color: "#6B7C8C", fontSize: 13, marginBottom: 6, marginTop: 18, fontWeight: 600 },
    input:        { width: "100%", background: "#F6F7FA", border: "1px solid #DCE3EA", borderRadius: 8, color: "#1C2B3A", padding: "10px 14px", fontSize: 14, boxSizing: "border-box" },
    modalActions: { display: "flex", gap: 10, marginTop: 28, justifyContent: "flex-end" },
    saveBtn:      { background: "#2F5D8A", border: "1px solid #2F5D8A", color: "#FFFFFF", borderRadius: 8, padding: "12px 24px", cursor: "pointer", fontWeight: 700, fontSize: 14 },
    cancelBtn:    { background: "none", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 8, padding: "12px 22px", cursor: "pointer", fontSize: 14 },
    deleteBtn:    { background: "#F5E7E4", border: "1px solid #B0463B", color: "#B0463B", borderRadius: 8, padding: "12px 18px", cursor: "pointer", marginRight: "auto", fontSize: 14 },
    stbBtn:       { background: "none", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13 },
    stbActive:    { background: "#E7EEF5", border: "1px solid #2F5D8A", color: "#2F5D8A", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700 },
    crmCard:      { display: "flex", alignItems: "center", gap: 14, background: "#F6F7FA", borderRadius: 10, padding: "14px 18px", marginBottom: 6 },
  };

  const filteredClients = clients
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search) || (c.email || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => nameSort === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  if (!authed) {
    return <LoginGate onAuth={() => setAuthed(true)} />;
  }

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.headerLeft}>
          <div style={{ width: 4, height: 34, background: "#2F5D8A", borderRadius: 2 }} />
          <div><div style={S.logoText}>Cinergy Financial</div><div style={S.logoSub}>Scheduler — Financial Advisory Services</div></div>
        </div>
        <nav style={S.nav}>
          {[["schedule","📅 Schedule"],["clients",`👤 All Clients (${clients.length})`],["overdue",`⚠️ Needs Attention (${overdueClients.length})`],["cancelled",`🚫 Cancelled (${appointments.filter(a => a.status === "cancelled").length})`]].map(([id, label]) => (
            <button key={id} style={tab === id ? S.navActive : S.navBtn} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {loading && <span style={{ color: "#8FA0AF", fontSize: 14 }}>⏳ Connecting…</span>}
          <button style={S.iconBtn} onClick={() => setSOp(true)}>⚙️ Settings</button>
          <button style={S.lockBtn} onClick={() => setAuthed(false)}>🔒 Lock</button>
        </div>
      </header>

      {tab === "schedule" && (
        <div style={S.page}>
          <div style={{ ...S.weekNav, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", background: "#EEF1F5", borderRadius: 8, padding: 3, gap: 2 }}>
                <button onClick={() => setScheduleView("day")} style={{ background: scheduleView === "day" ? "#FFFFFF" : "none", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: scheduleView === "day" ? "#2F5D8A" : "#6B7C8C", boxShadow: scheduleView === "day" ? "0 1px 2px rgba(28,43,58,0.1)" : "none" }}>Day</button>
                <button onClick={() => setScheduleView("week")} style={{ background: scheduleView === "week" ? "#FFFFFF" : "none", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: scheduleView === "week" ? "#2F5D8A" : "#6B7C8C", boxShadow: scheduleView === "week" ? "0 1px 2px rgba(28,43,58,0.1)" : "none" }}>Week</button>
              </div>
              {scheduleView === "day" ? (
                <>
                  <button style={S.weekBtn} onClick={() => setSelectedDay(d => addDays(d, -1))}>← Prev</button>
                  <span style={S.weekLabel}>{fmtFull(dateKey(selectedDay))}</span>
                  <button style={S.weekBtn} onClick={() => setSelectedDay(TODAY)}>Today</button>
                  <button style={S.weekBtn} onClick={() => setSelectedDay(d => addDays(d, 1))}>Next →</button>
                </>
              ) : (
                <>
                  <button style={S.weekBtn} onClick={() => setWeekStart(w => addDays(w, -7))}>← Prev</button>
                  <span style={S.weekLabel}>{fmt(weekStart)} — {fmt(addDays(weekStart, 6))}</span>
                  <button style={S.weekBtn} onClick={() => setWeekStart(getMondayOf(TODAY))}>Today</button>
                  <button style={S.weekBtn} onClick={() => setWeekStart(w => addDays(w, 7))}>Next →</button>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {scheduleView === "week" && (
                <select style={{ ...S.weekBtn, cursor: "pointer" }} value={reportDate} onChange={e => setReportDate(e.target.value)}>
                  {weekDays.map(({ name, date }) => <option key={name} value={dateKey(date)}>{name} {fmt(date)}</option>)}
                </select>
              )}
              <button style={S.reportBtn} onClick={() => generateReport(scheduleView === "day" ? dateKey(selectedDay) : reportDate)}>📊 Generate Report</button>
              <button style={S.addBtn} onClick={() => { setForm({ broker: brokers[0] || "", date: dateKey(scheduleView === "day" ? selectedDay : TODAY), startHour: 9, endHour: 10, clientName: "", notes: "", subject: "", location: "", confirmed: false, status: "scheduled", dateLastAcctSummary: "", rmd70Half: false, availableDpps: "", availableIfs: "", availableNotes: "" }); setModal({ type: "new" }); }}>
                ➕ Book New Appointment
              </button>
            </div>
          </div>

          {scheduleView === "day" ? (
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", minWidth: (brokers.length + 1) * 240 + 68 }}>
                <div style={{ width: 68, flexShrink: 0 }}>
                  <div style={{ height: 54 }} />
                  {HOURS.filter(h => h < 20).map(hour => (
                    <div key={hour} style={{ height: 44, textAlign: "right", paddingRight: 10, fontSize: 11.5, color: "#8FA0AF", borderTop: hour % 1 === 0 ? "1px solid #E3E8EE" : "1px dotted #EEF1F5" }}>
                      {hour % 1 === 0 ? hourLabel(hour) : ""}
                    </div>
                  ))}
                </div>
                {[...brokers, "Staff"].map(person => {
                  const isStaff = person === "Staff";
                  return (
                    <div key={person} style={{ flex: 1, minWidth: 220, borderLeft: "1px solid #DCE3EA" }}>
                      <div style={{ height: 54, display: "flex", alignItems: "center", justifyContent: "center", background: isStaff ? "#EEF4EF" : "#F1F4F7", fontWeight: 700, fontSize: 13.5, color: isStaff ? "#4F8F68" : "#1C2B3A", borderBottom: "1px solid #DCE3EA" }}>
                        {person}
                      </div>
                      {(() => {
                        const cells = [];
                        const hoursList = HOURS.filter(h => h < 20);
                        for (const hour of hoursList) {
                          const appt = apptAt(person, selectedDay, hour);
                          const blocked = !appt && isBlockedByPrev(person, selectedDay, hour);
                          if (blocked) { cells.push(<div key={hour} style={{ height: 44, background: isStaff ? "#EAF3EE" : "#F1F4F7", borderTop: hour % 1 === 0 ? "1px solid #E3E8EE" : "1px dotted #EEF1F5" }} />); continue; }
                          if (appt) {
                            const rows = appt.duration / 0.5;
                            const hasNotes = (notes[appt.clientId] || []).length > 0;
                            const isCancelled = appt.status === "cancelled";
                            const apptClient = clients.find(cl => cl.id === appt.clientId) || clients.find(cl => cl.name.toLowerCase() === appt.clientName.toLowerCase());
                            const dpps = apptClient?.availableDpps;
                            const ifs = apptClient?.availableIfs;
                            const fmtMoney = n => "$" + Number(n).toLocaleString("en-US");
                            cells.push(
                              <div key={hour} onClick={() => openEditAppt(appt)} style={{
                                height: `${rows * 44 - 4}px`, margin: "2px 6px", padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                                background: isCancelled ? "#FBEEEC" : "#FFFFFF", boxShadow: isCancelled ? "none" : "0 1px 3px rgba(28,43,58,0.1)",
                                border: isCancelled ? "1px dashed #B0463B" : "none",
                                borderLeft: `3px solid ${isCancelled ? "#B0463B" : isStaff ? "#3F8361" : "#2F5D8A"}`,
                                opacity: isCancelled ? 0.7 : 1,
                              }}>
                                <div style={{ fontSize: 11.5, color: "#8FA0AF", fontWeight: 600 }}>{hourLabel(hour)}</div>
                                <div style={{ fontWeight: 700, fontSize: 13.5, color: "#1C2B3A", textDecoration: isCancelled ? "line-through" : "none" }}>{appt.clientName}{hasNotes ? " 📝" : ""}</div>
                                {(dpps != null || ifs != null) && (
                                  <div style={{ fontSize: 11, fontWeight: 600, color: "#3F8361", marginTop: 1 }}>
                                    {dpps != null && `DPP ${fmtMoney(dpps)}`}{dpps != null && ifs != null && "  ·  "}{ifs != null && `IF ${fmtMoney(ifs)}`}
                                  </div>
                                )}
                                {appt.subject && <div style={{ fontSize: 11.5, color: "#6B7C8C", fontStyle: "italic" }}>{appt.subject}</div>}
                                {appt.location && <div style={{ fontSize: 11, color: "#8FA0AF", marginTop: 2 }}>{appt.location}{appt.confirmed ? " · ✓ Confirmed" : ""}</div>}
                              </div>
                            );
                          } else {
                            const isPast = new Date(dateKey(selectedDay)) < new Date(dateKey(TODAY));
                            cells.push(<div key={hour} onClick={() => !isPast && openNewAppt(person, selectedDay, hour)} style={{ height: 44, cursor: isPast ? "default" : "pointer", borderTop: hour % 1 === 0 ? "1px solid #E3E8EE" : "1px dotted #EEF1F5" }} />);
                          }
                        }
                        return cells;
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.grid}>
                <thead>
                  <tr>
                    <th style={S.timeHeader}>Time</th>
                    {weekDays.map(({ name, date }) => (
                      <th key={name} style={{ ...S.dayHeader, background: dateKey(date) === dateKey(TODAY) ? "#DCE3EA" : "#EEF1F5", cursor: "pointer" }} onClick={() => { setSelectedDay(date); setScheduleView("day"); }}>
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
                              if (blocked) return <div key={person} style={{ ...S.blockedCell, background: isStaff ? "#EAF3EE" : S.blockedCell.background }} />;
                              if (appt) {
                                const rows = appt.duration / 0.5;
                                return (
                                  <div key={person} style={{ ...S.apptCell, height: `${rows * 34}px`, cursor: "pointer", borderLeft: `3px solid ${isStaff ? "#3F8361" : "#2F5D8A"}` }} onClick={() => openEditAppt(appt)}>
                                    <div style={{ ...S.apptName, color: isStaff ? "#1F4A34" : S.apptName.color }}>{appt.clientName}</div>
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
              <div style={{ marginTop: 10, fontSize: 12.5, color: "#8FA0AF" }}>Tip: click any day header to jump into the readable Day view for that date.</div>
            </div>
          )}
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#EDF2F7", border: "1px solid #2F5D8A", borderRadius: 8, padding: "10px 14px", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ color: "#2F5D8A", fontWeight: 700, fontSize: 13, marginRight: 4 }}>{selectedClients.size} selected</span>
              <select style={{ background: "#FFFFFF", border: "1px solid #DCE3EA", color: "#1C2B3A", borderRadius: 6, padding: "5px 8px", fontSize: 12, cursor: "pointer" }}
                defaultValue=""
                onChange={e => { bulkAssign(e.target.value); e.target.value = ""; }}>
                <option value="" disabled>Assign broker / staff…</option>
                {brokers.map(b => <option key={b} value={b}>{b}</option>)}
                <option value="Staff">Staff</option>
              </select>
              <button onClick={bulkClearAssignments}
                style={{ background: "#E8F1EC", border: "1px solid #7FAE93", color: "#2F6E4C", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>
                Clear Assignments
              </button>
              <button onClick={bulkDelete}
                style={{ background: "#F5E7E4", border: "1px solid #B0463B", color: "#B0463B", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>
                🗑 Delete Selected
              </button>
              <button onClick={() => setSelClients(new Set())}
                style={{ background: "none", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, marginLeft: "auto" }}>
                Deselect All
              </button>
            </div>
          )}

          <table style={S.clientTable}>
            <thead>
              <tr>
                <th style={{ ...S.clientTh, width: 36, textAlign: "center" }}>
                  <input type="checkbox" checked={filteredClients.length > 0 && selectedClients.size === filteredClients.length}
                    onChange={toggleSelectAll} style={{ cursor: "pointer", accentColor: "#2F5D8A" }} />
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
                const clientNoteCount = (notes[c.id] || []).length;
                const isSelected = selectedClients.has(c.id);
                return (
                  <tr key={c.id} style={{ ...(overdue ? S.overdueRow : S.clientRow), ...(isSelected ? { background: "#EDF2F7", outline: "1px solid #2F5D8A" } : {}) }}>
                    <td style={{ ...S.clientTd, textAlign: "center" }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectClient(c.id)} style={{ cursor: "pointer", accentColor: "#2F5D8A" }} />
                    </td>
                    <td style={S.clientTd}><strong>{c.name}</strong></td>
                    <td style={S.clientTd}>{c.phone || "—"}</td>
                    <td style={S.clientTd}>{c.email || "—"}</td>
                    <td style={S.clientTd}><ImportedFromBadge src={c.importedFrom} /></td>
                    <td style={S.clientTd}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {allBrokers.length > 0
                          ? allBrokers.map((b, i) => (
                            <span key={i} style={{ background: b.includes("Unassigned") ? "#F7EFE3" : "#E8F1EC", color: b.includes("Unassigned") ? "#B8792E" : "#3F8361", borderRadius: 8, padding: "1px 8px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                              {b}
                              {manualBrokers.includes(b) && <span style={{ cursor: "pointer", fontSize: 10, opacity: 0.7 }} onClick={() => updateClientBrokers(c.id, (c.manualBrokers||[]).filter(x => x !== b))}>✕</span>}
                            </span>
                          ))
                          : <span style={{ color: "#8FA0AF" }}>—</span>
                        }
                        <select style={{ background: "#FFFFFF", border: "1px solid #DCE3EA", color: "#6B7C8C", borderRadius: 6, padding: "2px 6px", fontSize: 11, cursor: "pointer" }} value=""
                          onChange={e => { const val = e.target.value; if (!val) return; updateClientBrokers(c.id, [...new Set([...(c.manualBrokers||[]), val])]); }}>
                          <option value="">+ Add</option>
                          {brokers.filter(b => !manualBrokers.includes(b)).map(b => <option key={b} value={b}>{b}</option>)}
                          {!manualBrokers.includes("Staff") && <option value="Staff">Staff</option>}
                        </select>
                      </div>
                    </td>
                    <td style={S.clientTd}>{st.last ? fmtFull(st.last) : <span style={{ color: "#8FA0AF" }}>Never</span>}</td>
                    <td style={S.clientTd}>{st.next ? fmtFull(st.next) : <span style={{ color: "#B8792E" }}>None scheduled</span>}</td>
                    <td style={S.clientTd}>
                      {(() => {
                        const autoStatus = overdue ? "overdue" : st.next ? "scheduled" : st.last ? "no_future" : "new";
                        const autoLabel = overdue ? "Auto: Overdue" : st.next ? "Auto: Scheduled" : st.last ? "Auto: No appt" : "Auto: New";
                        const manual = clientStatuses[c.id] || "";
                        const effectiveStatus = manual || autoStatus;
                        const sc = { overdue: { bg: "#F5E7E4", col: "#B0463B" }, scheduled: { bg: "#E3F0E8", col: "#3F8361" }, active: { bg: "#E8F1EC", col: "#3F8361" }, vip: { bg: "#F7F0DC", col: "#A67C1E" }, follow_up: { bg: "#EDF2F8", col: "#2F5D8A" }, inactive: { bg: "#F0EEF5", col: "#9AA7B5" }, do_not_contact: { bg: "#F5E7E4", col: "#B0463B" }, no_future: { bg: "#EEF1F5", col: "#6B7C8C" }, new: { bg: "#EEF1F5", col: "#6B7C8C" } }[effectiveStatus] || { bg: "#EEF1F5", col: "#6B7C8C" };
                        return (
                          <select value={manual} onChange={e => setClientStatus(c.id, e.target.value)}
                            style={{ background: sc.bg, color: sc.col, border: `2px solid ${sc.col}66`, borderRadius: 8, cursor: "pointer", padding: "5px 10px", fontSize: 13, fontWeight: 600 }}>
                            <option value="">{autoLabel}</option>
                            <option value="active">Active</option>
                            <option value="scheduled">✓ Scheduled</option>
                            <option value="vip">⭐ VIP</option>
                            <option value="follow_up">📞 Follow Up</option>
                            <option value="overdue">⚠️ Overdue</option>
                            <option value="inactive">Inactive</option>
                            <option value="do_not_contact">🚫 Do Not Contact</option>
                          </select>
                        );
                      })()}
                    </td>
                    <td style={S.clientTd}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => { setNotesClientView("notes"); setNotesClient(c); }}
                          style={{ background: clientNoteCount > 0 ? "#E8F1EC" : "#FFFFFF", border: `2px solid ${clientNoteCount > 0 ? "#3F8361" : "#DCE3EA"}`, color: clientNoteCount > 0 ? "#3F8361" : "#8FA0AF", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                          📝 {clientNoteCount > 0 ? `${clientNoteCount} Note${clientNoteCount > 1 ? "s" : ""}` : "Add Note"}
                        </button>
                        <button onClick={() => { setForm({ broker: (c.manualBrokers?.[0]) || c.assignedBroker || brokers[0] || "", date: dateKey(TODAY), startHour: 9, endHour: 10, clientName: c.name, notes: "" }); setModal({ type: "new" }); setTab("schedule"); }}
                          style={{ background: "#DCE3EA", border: "2px solid #2F5D8A", color: "#2F5D8A", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                          📅 Book Appt
                        </button>
                        <button onClick={() => deleteClient(c)}
                          style={{ background: "#F5E7E4", border: "2px solid #B0463B", color: "#B0463B", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                          🗑 Delete
                        </button>
                      </div>
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
            <h2 style={S.sectionTitle}>⚠️ Clients Needing Attention — No appointment in {overdueThreshold}+ days</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ color: "#6B7C8C", fontSize: 13 }}>Threshold:</label>
              <input type="number" style={{ ...S.searchInput, width: 70 }} value={overdueThreshold} onChange={e => setODT(Number(e.target.value))} />
              <span style={{ color: "#6B7C8C", fontSize: 13 }}>days</span>
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
                    const clientNoteCount = (notes[c.id] || []).length;
                    return (
                      <tr key={c.id} style={S.overdueRow}>
                        <td style={S.clientTd}><strong>{c.name}</strong></td>
                        <td style={S.clientTd}>{c.phone || "—"}</td>
                        <td style={S.clientTd}>{c.email || "—"}</td>
                        <td style={S.clientTd}><ImportedFromBadge src={c.importedFrom} /></td>
                        <td style={S.clientTd}>{st.last ? fmtFull(st.last) : <span style={{ color: "#8FA0AF" }}>Never</span>}</td>
                        <td style={{ ...S.clientTd, color: "#B0463B", fontWeight: 700 }}>{ds === Infinity ? "Never" : `${ds} days`}</td>
                        <td style={S.clientTd}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => { setNotesClientView("notes"); setNotesClient(c); }}
                              style={{ background: clientNoteCount > 0 ? "#E8F1EC" : "#FFFFFF", border: `2px solid ${clientNoteCount > 0 ? "#3F8361" : "#DCE3EA"}`, color: clientNoteCount > 0 ? "#3F8361" : "#8FA0AF", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                              📝 {clientNoteCount > 0 ? `${clientNoteCount} Note${clientNoteCount > 1 ? "s" : ""}` : "Add Note"}
                            </button>
                            <button onClick={() => deleteClient(c)}
                              style={{ background: "#F5E7E4", border: "2px solid #B0463B", color: "#B0463B", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                              🗑 Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </div>
      )}

      {tab === "cancelled" && (
        <div style={S.page}>
          <div style={S.toolBar}>
            <h2 style={S.sectionTitle}>🚫 Cancelled & Rescheduled Appointments</h2>
          </div>
          {(() => {
            const cancelledAppts = appointments
              .filter(a => a.status === "cancelled")
              .sort((a, b) => new Date(b.date) - new Date(a.date));
            return cancelledAppts.length === 0
              ? <div style={S.empty}><div style={{ fontSize: 32 }}>✅</div>No cancelled appointments.</div>
              : <table style={S.clientTable}>
                  <thead><tr>{["Date","Time","Client","Broker","Reason","Actions"].map(h => <th key={h} style={S.clientTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {cancelledAppts.map(a => (
                      <tr key={a.id} style={S.overdueRow}>
                        <td style={S.clientTd}>{fmtFull(a.date)}</td>
                        <td style={S.clientTd}>{hourLabel(a.startHour)}</td>
                        <td style={S.clientTd}><strong>{a.clientName}</strong></td>
                        <td style={S.clientTd}>{a.broker}</td>
                        <td style={{ ...S.clientTd, color: "#B8792E" }}>{a.cancelReason || "—"}</td>
                        <td style={S.clientTd}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => { setForm({ broker: a.broker, date: dateKey(TODAY), startHour: 9, endHour: 10, clientName: a.clientName, notes: a.notes || "", subject: a.subject || "", location: a.location || "", confirmed: false, status: "scheduled" }); setModal({ type: "new" }); }}
                              style={{ background: "#FFFFFF", border: "2px solid #2F5D8A", color: "#2F5D8A", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                              🔁 Reschedule
                            </button>
                            <button onClick={() => deleteAppt(a.id)}
                              style={{ background: "#F5E7E4", border: "2px solid #B0463B", color: "#B0463B", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                              🗑 Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>;
          })()}
        </div>
      )}

      {settingsOpen && (
        <div style={S.overlay} onClick={() => setSOp(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ ...S.modalTitle, margin: 0 }}>⚙️ Settings</h3>
              <button style={S.cancelBtn} onClick={() => setSOp(false)}>✕ Close</button>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #DCE3EA", paddingBottom: 12, flexWrap: "wrap" }}>
              {[["brokers","👥 Brokers"],["redtail","🔴 Redtail"],["csv","📄 CSV"]].map(([id, label]) => (
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
                <div style={S.crmCard}><span style={{ fontSize: 24 }}>🔴</span><div><div style={{ fontWeight: 700, color: "#1C2B3A" }}>Redtail CRM</div></div></div>
                <label style={S.label}>Username</label>
                <input style={S.input} value={creds.redtailUser} onChange={e => setCreds(c => ({ ...c, redtailUser: e.target.value }))} />
                <label style={S.label}>API Key</label>
                <input style={S.input} type="password" value={creds.redtailKey} onChange={e => setCreds(c => ({ ...c, redtailKey: e.target.value }))} />
                <button style={{ ...S.saveBtn, marginTop: 14 }} onClick={syncRedtail}>🔄 Sync Redtail</button>
                {syncMsg.redtail && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12, background: syncStatus.redtail === "ok" ? "#E8F1EC" : "#F5E7E4", color: syncStatus.redtail === "ok" ? "#3F8361" : "#B0463B" }}>{syncMsg.redtail}</div>}
              </>
            )}
            {settingsTab === "csv" && (
              <>
                <div style={S.crmCard}><span style={{ fontSize: 24 }}>📄</span><div><div style={{ fontWeight: 700, color: "#1C2B3A" }}>CSV Import</div></div></div>
                <div style={{ background: "#FFFFFF", border: "1px dashed #DCE3EA", borderRadius: 8, padding: 24, textAlign: "center", marginTop: 14 }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>⬆️</div>
                  <input ref={csvRef} type="file" accept=".csv" onChange={handleCSV} style={{ color: "#6B7C8C", fontSize: 12 }} />
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
            <CalendarPicker value={form.date} onChange={date => setForm(f => ({ ...f, date }))} />
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
            <input style={S.input} list="client-list" value={form.clientName} onChange={e => {
              const name = e.target.value;
              const matched = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
              setForm(f => ({
                ...f, clientName: name,
                ...(matched ? {
                  dateLastAcctSummary: matched.dateLastAcctSummary || "",
                  rmd70Half: matched.rmd70Half || false,
                  availableDpps: matched.availableDpps ?? "",
                  availableIfs: matched.availableIfs ?? "",
                  availableNotes: matched.availableNotes || "",
                } : {}),
              }));
            }} placeholder="Type or select…" />
            <datalist id="client-list">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>
            <label style={S.label}>Subject / Topic</label>
            <input style={S.input} value={form.subject || ""} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Oil and Gas, Delivery Meeting…" />
            <label style={S.label}>Location</label>
            <select style={S.input} value={form.location || ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
              <option value="">— Select —</option>
              <option value="PH">Phone (PH)</option>
              <option value="OFC">Office (OFC)</option>
              <option value="ZOOM">Zoom</option>
              <option value="House">Client's House</option>
            </select>
            <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.confirmed || false} onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))} />
              Confirmed
            </label>
            <label style={S.label}>Appointment Notes</label>
            <input style={S.input} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional…" />

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #DCE3EA" }}>
              <div style={{ color: "#2F5D8A", fontWeight: 700, fontSize: 12, marginBottom: 4 }}>💰 Report Fields</div>
              <label style={S.label}>Date of Last Acct. Summary</label>
              <input type="date" style={S.input} value={form.dateLastAcctSummary || ""} onChange={e => setForm(f => ({ ...f, dateLastAcctSummary: e.target.value }))} />
              <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.rmd70Half || false} onChange={e => setForm(f => ({ ...f, rmd70Half: e.target.checked }))} />
                RMD 70½ applies
              </label>
              <label style={S.label}>Available for DPPs ($)</label>
              <input type="number" style={S.input} value={form.availableDpps ?? ""} onChange={e => setForm(f => ({ ...f, availableDpps: e.target.value }))} placeholder="e.g. 50000" />
              <label style={S.label}>Available for IFs ($)</label>
              <input type="number" style={S.input} value={form.availableIfs ?? ""} onChange={e => setForm(f => ({ ...f, availableIfs: e.target.value }))} placeholder="e.g. 25000" />
              <label style={S.label}>Available for NOTES</label>
              <input style={S.input} value={form.availableNotes || ""} onChange={e => setForm(f => ({ ...f, availableNotes: e.target.value }))} placeholder="Notes for the report…" />
            </div>

            <div style={S.modalActions}>
              {modal.type === "edit" && (
                <>
                  <button style={S.deleteBtn} onClick={() => deleteAppt(form.id)}>🗑 Delete</button>
                  {form.status !== "cancelled" && (
                    <button style={{ ...S.cancelBtn, borderColor: "#B8792E", color: "#B8792E" }}
                      onClick={() => { const reason = window.prompt("Reason for cancelling (optional):") || ""; cancelAppt(form.id, reason); }}>
                      ⚠ Cancel Meeting
                    </button>
                  )}
                  <button style={{ ...S.cancelBtn, borderColor: "#3F8361", color: "#3F8361" }}
                    onClick={() => { const c = clients.find(cl => cl.name === form.clientName); if (c) { setModal(null); setNotesClientView("notes"); setNotesClient(c); } }}>
                    📝 Meeting Notes
                  </button>
                </>
              )}
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Close</button>
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
                const newClient = { ...form, id: crypto.randomUUID(), importedFrom: "manual", assignedBroker: "" };
                setClients(prev => [...prev, newClient]);
                upsertClient(newClient);
                setModal(null);
              }}>Add Client</button>
            </div>
          </div>
        </div>
      )}

      {notesClient && (
        <NotesModal client={notesClient} brokers={brokers} notes={notes} appointments={appointments} initialView={notesClientView}
          onClose={() => setNotesClient(null)}
          onSave={(clientId, entry) => addNote(clientId, entry)}
          onSaveClient={(updatedClient) => {
            setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
            setNotesClient(updatedClient);
            upsertClient(updatedClient);
          }} />
      )}
    </div>
  );
}
