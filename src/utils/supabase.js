import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://blfvpcxnjznbvtgnmyvs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yPSfmZnsAZTh1WD7Ccm_ag_NNUig5Mu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function loadAll() {
  const [appts, clientsRes, meetingNotesRes, settingsRes] = await Promise.all([
    supabase.from('appointments').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('meeting_notes').select('*'),
    supabase.from('settings').select('*'),
  ]);

  const appointments = (appts.data || []).map(a => ({
    id: a.id, clientId: a.client_id, broker: a.broker, date: a.date,
    startHour: a.start_hour, duration: a.duration,
    clientName: a.client_name, notes: a.notes,
    location: a.location || '', confirmed: a.confirmed || false,
    status: a.status || 'scheduled', cancelReason: a.cancel_reason || '',
    subject: a.subject || '', fromRedtail: a.from_redtail || false,
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
  await supabase.from('appointments').upsert({
    id: appt.id, client_id: appt.clientId || null, broker: appt.broker, date: appt.date,
    start_hour: appt.startHour, duration: appt.duration,
    client_name: appt.clientName, notes: appt.notes || '',
    location: appt.location || '', confirmed: appt.confirmed || false,
    status: appt.status || 'scheduled', cancel_reason: appt.cancelReason || '',
    subject: appt.subject || '', from_redtail: appt.fromRedtail || false,
    updated_at: new Date().toISOString(),
  });
}

export async function upsertAppts(appts) {
  if (!appts.length) return;
  await supabase.from('appointments').upsert(appts.map(a => ({
    id: a.id, client_id: a.clientId || null, broker: a.broker, date: a.date,
    start_hour: a.startHour, duration: a.duration,
    client_name: a.clientName, notes: a.notes || '',
    location: a.location || '', confirmed: a.confirmed || false,
    status: a.status || 'scheduled', cancel_reason: a.cancelReason || '',
    subject: a.subject || '', from_redtail: a.fromRedtail || false,
    updated_at: new Date().toISOString(),
  })));
}

// Cancel (not delete) — preserves history for the cancelled-meetings section
export async function cancelApptDB(id, reason) {
  await supabase.from('appointments').update({
    status: 'cancelled', cancel_reason: reason || '', updated_at: new Date().toISOString(),
  }).eq('id', id);
}

export async function deleteApptDB(id) {
  await supabase.from('appointments').delete().eq('id', id);
}

export async function upsertClient(client) {
  await supabase.from('clients').upsert({
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
}

export async function upsertClients(clients) {
  if (!clients.length) return;
  await supabase.from('clients').upsert(clients.map(c => ({
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
}

// Meeting notes are tied to a client (and optionally a specific appointment)
export async function insertMeetingNote(clientId, entry) {
  await supabase.from('meeting_notes').insert({
    client_id: clientId,
    appointment_id: entry.appointmentId || null,
    broker: entry.broker || null,
    meeting_date: entry.meetingDate || null,
    notes: entry.text || '',
    follow_up_action: entry.followUpAction || '',
    next_steps: entry.nextSteps || '',
  });
}

export async function saveSetting(key, value) {
  await supabase.from('settings').upsert({ key, value });
}

export async function deleteClientDB(clientId, clientName) {
  await Promise.all([
    supabase.from('clients').delete().eq('id', clientId),
    supabase.from('appointments').delete().eq('client_name', clientName),
    supabase.from('meeting_notes').delete().eq('client_id', clientId),
  ]);
}
