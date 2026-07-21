import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://blfvpcxnjznbvtgnmyvs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yPSfmZnsAZTh1WD7Ccm_ag_NNUig5Mu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Every write goes through this so failures are never silent again.
// Logs to console always; also alerts in the UI so it's impossible to miss during testing.
function check(label, { error }) {
  if (error) {
    console.error(`[Supabase error] ${label}:`, error);
    if (typeof window !== 'undefined') {
      window.__lastSupabaseError = { label, error, at: new Date().toISOString() };
      // Visible but non-blocking — a small red toast instead of a hard alert() would be nicer
      // long-term, but for now this guarantees a failed save is never invisible.
      alert(`⚠️ Save failed (${label}): ${error.message || 'Unknown error'}\n\nYour change was NOT saved to the database.`);
    }
  }
  return error;
}

export async function loadAll() {
  const [appts, clientsRes, meetingNotesRes, settingsRes] = await Promise.all([
    supabase.from('appointments').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('meeting_notes').select('*'),
    supabase.from('settings').select('*'),
  ]);

  if (appts.error) console.error('[Supabase error] load appointments:', appts.error);
  if (clientsRes.error) console.error('[Supabase error] load clients:', clientsRes.error);
  if (meetingNotesRes.error) console.error('[Supabase error] load meeting_notes:', meetingNotesRes.error);
  if (settingsRes.error) console.error('[Supabase error] load settings:', settingsRes.error);

  const appointments = (appts.data || []).map(a => ({
    id: a.id, clientId: a.client_id, broker: a.broker, date: a.date,
    startHour: a.start_hour, duration: a.duration,
    clientName: a.client_name, notes: a.notes,
    location: a.location || '', confirmed: a.confirmed || false,
    status: a.status || 'scheduled', cancelReason: a.cancel_reason || '',
    subject: a.subject || '', fromRedtail: a.from_redtail || false,
    isClientMeeting: a.is_client_meeting !== false,
  }));

  const clients = (clientsRes.data || []).map(c => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    importedFrom: c.imported_from, contactSource: c.contact_source,
    redtailId: c.redtail_id,
    assignedBroker: c.assigned_broker, manualBrokers: c.manual_brokers || [],
    dateLastAcctSummary: c.date_last_acct_summary || '',
    rmd70Half: c.rmd_70_half || false,
    availableDpps: c.available_dpps, availableIfs: c.available_ifs,
    availableNotes: c.available_notes || '',
  }));

  // meeting notes keyed by client_id, newest first
  const notes = {};
  (meetingNotesRes.data || [])
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

  const settingsMap = {};
  (settingsRes.data || []).forEach(s => { settingsMap[s.key] = s.value; });

  return { appointments, clients, notes, ...settingsMap };
}

export async function upsertAppt(appt) {
  const res = await supabase.from('appointments').upsert({
    id: appt.id, client_id: appt.clientId || null, broker: appt.broker, date: appt.date,
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
  const res = await supabase.from('appointments').upsert(appts.map(a => ({
    id: a.id, client_id: a.clientId || null, broker: a.broker, date: a.date,
    start_hour: a.startHour, duration: a.duration,
    client_name: a.clientName, notes: a.notes || '',
    location: a.location || '', confirmed: a.confirmed || false,
    status: a.status || 'scheduled', cancel_reason: a.cancelReason || '',
    subject: a.subject || '', from_redtail: a.fromRedtail || false,
    is_client_meeting: a.isClientMeeting !== false,
    updated_at: new Date().toISOString(),
  })));
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
