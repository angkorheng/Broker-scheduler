import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://blfvpcxnjznbvtgnmyvs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yPSfmZnsAZTh1WD7Ccm_ag_NNUig5Mu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Every write goes through this so failures are never silent again.
function check(label, { error }) {
  if (error) {
    console.error(`[Supabase error] ${label}:`, error);
    if (typeof window !== 'undefined') {
      window.__lastSupabaseError = { label, error, at: new Date().toISOString() };
      alert(`⚠️ Save failed (${label}): ${error.message || 'Unknown error'}\n\nYour change was NOT saved to the database.`);
    }
  }
  return error;
}

// ---------------------------------------------------------------------------
// Bandwidth-saving delta sync
//
// Free Supabase tier caps monthly data egress. Re-fetching the ENTIRE history
// of appointments/clients/notes on every single page load doesn't scale as
// data grows. Instead: cache everything in localStorage after the first load,
// then on subsequent loads only fetch rows that changed since last sync
// (using updated_at / created_at), and merge that delta into the cache.
//
// Trade-off: hard DELETEs of old rows won't be reflected by a delta query
// (a deleted row just stops appearing, it doesn't show up as "changed"). To
// stay correct, we force a full resync at least once every 24h, and expose
// a manual "Full Resync" the person can trigger anytime from Settings.
// ---------------------------------------------------------------------------
const CACHE_KEY = 'cinergy_scheduler_cache_v1';
const FULL_RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[cache] Could not write local cache (storage full or unavailable):', e);
  }
}

function mapAppt(a) {
  return {
    id: a.id, clientId: a.client_id, broker: a.broker, date: a.date,
    brokers: (a.brokers && a.brokers.length) ? a.brokers : (a.broker ? [a.broker] : []),
    startHour: a.start_hour, duration: a.duration,
    clientName: a.client_name, notes: a.notes,
    location: a.location || '', confirmed: a.confirmed || false,
    status: a.status || 'scheduled', cancelReason: a.cancel_reason || '',
    subject: a.subject || '', fromRedtail: a.from_redtail || false,
    isClientMeeting: a.is_client_meeting !== false,
  };
}

function mapClient(c) {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    importedFrom: c.imported_from, contactSource: c.contact_source,
    redtailId: c.redtail_id,
    assignedBroker: c.assigned_broker, manualBrokers: c.manual_brokers || [],
    dateLastAcctSummary: c.date_last_acct_summary || '',
    rmd70Half: c.rmd_70_half || false,
    availableDpps: c.available_dpps, availableIfs: c.available_ifs,
    availableNotes: c.available_notes || '',
  };
}

function assembleResult(rawAppts, rawClients, rawNotes, settingsMap) {
  const appointments = Object.values(rawAppts).map(mapAppt);
  const clients = Object.values(rawClients).map(mapClient);

  const notes = {};
  Object.values(rawNotes)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach(n => {
      if (!notes[n.client_id]) notes[n.client_id] = [];
      notes[n.client_id].push({
        id: n.id, appointmentId: n.appointment_id, broker: n.broker,
        meetingDate: n.meeting_date, text: n.notes,
        followUpAction: n.follow_up_action, nextSteps: n.next_steps,
        timestamp: n.created_at,
      });
    });

  return { appointments, clients, notes, ...settingsMap };
}

async function fetchSettingsMap() {
  const res = await supabase.from('settings').select('*');
  if (res.error) console.error('[Supabase error] load settings:', res.error);
  const map = {};
  (res.data || []).forEach(s => { map[s.key] = s.value; });
  return map;
}

async function fullLoad() {
  const [appts, clientsRes, notesRes, settingsMap] = await Promise.all([
    supabase.from('appointments').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('meeting_notes').select('*'),
    fetchSettingsMap(),
  ]);
  if (appts.error) console.error('[Supabase error] load appointments:', appts.error);
  if (clientsRes.error) console.error('[Supabase error] load clients:', clientsRes.error);
  if (notesRes.error) console.error('[Supabase error] load meeting_notes:', notesRes.error);

  const rawAppts = {}; (appts.data || []).forEach(a => { rawAppts[a.id] = a; });
  const rawClients = {}; (clientsRes.data || []).forEach(c => { rawClients[c.id] = c; });
  const rawNotes = {}; (notesRes.data || []).forEach(n => { rawNotes[n.id] = n; });

  const now = new Date().toISOString();
  writeCache({ rawAppts, rawClients, rawNotes, lastSyncAt: now, lastFullSyncAt: now });
  return assembleResult(rawAppts, rawClients, rawNotes, settingsMap);
}

async function deltaLoad(cache) {
  const since = cache.lastSyncAt;
  const [apptsDelta, clientsDelta, notesDelta, settingsMap] = await Promise.all([
    supabase.from('appointments').select('*').gte('updated_at', since),
    supabase.from('clients').select('*').gte('updated_at', since),
    supabase.from('meeting_notes').select('*').gte('created_at', since), // notes are insert-only
    fetchSettingsMap(),
  ]);
  if (apptsDelta.error) console.error('[Supabase error] delta appointments:', apptsDelta.error);
  if (clientsDelta.error) console.error('[Supabase error] delta clients:', clientsDelta.error);
  if (notesDelta.error) console.error('[Supabase error] delta meeting_notes:', notesDelta.error);

  const rawAppts = { ...cache.rawAppts };
  (apptsDelta.data || []).forEach(a => { rawAppts[a.id] = a; });
  const rawClients = { ...cache.rawClients };
  (clientsDelta.data || []).forEach(c => { rawClients[c.id] = c; });
  const rawNotes = { ...cache.rawNotes };
  (notesDelta.data || []).forEach(n => { rawNotes[n.id] = n; });

  const now = new Date().toISOString();
  writeCache({ rawAppts, rawClients, rawNotes, lastSyncAt: now, lastFullSyncAt: cache.lastFullSyncAt });
  return assembleResult(rawAppts, rawClients, rawNotes, settingsMap);
}

// Main entry point — call this instead of a raw full select.
// Automatically decides full vs delta load, and forces a full resync
// at least once a day to reconcile any deletions.
export async function syncData() {
  const cache = readCache();
  const needsFullResync =
    !cache || !cache.lastFullSyncAt ||
    (Date.now() - new Date(cache.lastFullSyncAt).getTime() > FULL_RESYNC_INTERVAL_MS);

  if (needsFullResync) return fullLoad();
  try {
    return await deltaLoad(cache);
  } catch (e) {
    console.warn('[sync] Delta load failed, falling back to full load:', e);
    return fullLoad();
  }
}

// Force a complete resync from scratch — exposed for a manual "Full Resync"
// button, useful right after bulk deletes to reconcile the local cache.
export async function fullResync() {
  return fullLoad();
}

// Kept for anything that still wants the old name / behavior.
export const loadAll = syncData;

export async function upsertAppt(appt) {
  const brokersArr = appt.brokers && appt.brokers.length ? appt.brokers : (appt.broker ? [appt.broker] : []);
  const res = await supabase.from('appointments').upsert({
    id: appt.id, client_id: appt.clientId || null, broker: brokersArr[0] || appt.broker || '', brokers: brokersArr, date: appt.date,
    start_hour: appt.startHour, duration: appt.duration,
    client_name: appt.clientName, notes: appt.notes || '',
    location: appt.location || '', confirmed: appt.confirmed || false,
    status: appt.status || 'scheduled', cancel_reason: appt.cancelReason || '',
    subject: appt.subject || '', from_redtail: appt.fromRedtail || false,
    is_client_meeting: appt.isClientMeeting !== false,
    updated_at: new Date().toISOString(),
  });
  check('upsertAppt', res);
}

export async function upsertAppts(appts) {
  if (!appts.length) return;
  const res = await supabase.from('appointments').upsert(appts.map(a => {
    const brokersArr = a.brokers && a.brokers.length ? a.brokers : (a.broker ? [a.broker] : []);
    return {
      id: a.id, client_id: a.clientId || null, broker: brokersArr[0] || a.broker || '', brokers: brokersArr, date: a.date,
      start_hour: a.startHour, duration: a.duration,
      client_name: a.clientName, notes: a.notes || '',
      location: a.location || '', confirmed: a.confirmed || false,
      status: a.status || 'scheduled', cancel_reason: a.cancelReason || '',
      subject: a.subject || '', from_redtail: a.fromRedtail || false,
      is_client_meeting: a.isClientMeeting !== false,
      updated_at: new Date().toISOString(),
    };
  }));
  check('upsertAppts', res);
}

// Cancel (not delete) — preserves history for the cancelled-meetings section
export async function cancelApptDB(id, reason) {
  const res = await supabase.from('appointments').update({
    status: 'cancelled', cancel_reason: reason || '', updated_at: new Date().toISOString(),
  }).eq('id', id);
  check('cancelApptDB', res);
}

export async function deleteApptDB(id) {
  const res = await supabase.from('appointments').delete().eq('id', id);
  check('deleteApptDB', res);
}

export async function upsertClient(client) {
  const res = await supabase.from('clients').upsert({
    id: client.id, name: client.name,
    phone: client.phone || '', email: client.email || '',
    imported_from: client.importedFrom || '',
    contact_source: client.contactSource || '',
    redtail_id: client.redtailId || null,
    assigned_broker: client.assignedBroker || '',
    manual_brokers: client.manualBrokers || [],
    date_last_acct_summary: client.dateLastAcctSummary || null,
    rmd_70_half: client.rmd70Half || false,
    available_dpps: client.availableDpps ?? null,
    available_ifs: client.availableIfs ?? null,
    available_notes: client.availableNotes || '',
    updated_at: new Date().toISOString(),
  });
  check('upsertClient', res);
}

export async function upsertClients(clients) {
  if (!clients.length) return;
  const res = await supabase.from('clients').upsert(clients.map(c => ({
    id: c.id, name: c.name,
    phone: c.phone || '', email: c.email || '',
    imported_from: c.importedFrom || '',
    contact_source: c.contactSource || '',
    redtail_id: c.redtailId || null,
    assigned_broker: c.assignedBroker || '',
    manual_brokers: c.manualBrokers || [],
    date_last_acct_summary: c.dateLastAcctSummary || null,
    rmd_70_half: c.rmd70Half || false,
    available_dpps: c.availableDpps ?? null,
    available_ifs: c.availableIfs ?? null,
    available_notes: c.availableNotes || '',
    updated_at: new Date().toISOString(),
  })));
  check('upsertClients', res);
}

// Meeting notes are tied to a client (and optionally a specific appointment)
export async function insertMeetingNote(clientId, entry) {
  const res = await supabase.from('meeting_notes').insert({
    client_id: clientId,
    appointment_id: entry.appointmentId || null,
    broker: entry.broker || null,
    meeting_date: entry.meetingDate || null,
    notes: entry.text || '',
    follow_up_action: entry.followUpAction || '',
    next_steps: entry.nextSteps || '',
  });
  check('insertMeetingNote', res);
}

export async function saveSetting(key, value) {
  const res = await supabase.from('settings').upsert({ key, value });
  check('saveSetting', res);
}

export async function deleteClientDB(clientId, clientName) {
  const results = await Promise.all([
    supabase.from('clients').delete().eq('id', clientId),
    supabase.from('appointments').delete().eq('client_name', clientName),
    supabase.from('meeting_notes').delete().eq('client_id', clientId),
  ]);
  results.forEach(r => check('deleteClientDB', r));
}
