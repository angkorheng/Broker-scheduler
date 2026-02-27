import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zejqbewtofmjpwtvjywl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplanFiZXd0b2ZtanB3dHZqeXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTkzMjAsImV4cCI6MjA4Nzc5NTMyMH0.DkEKUfZ6QxGt4MxgnFNCXGZkAYSJJIA63NZr6X4BIvE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function loadAll() {
  const [appts, clientsRes, notesRes, settingsRes] = await Promise.all([
    supabase.from('appointments').select('*'),
    supabase.from('clients').select('*'),
    supabase.from('notes').select('*'),
    supabase.from('settings').select('*'),
  ]);

  const appointments = (appts.data || []).map(a => ({
    id: a.id, broker: a.broker, date: a.date,
    startHour: a.start_hour, duration: a.duration,
    clientName: a.client_name, notes: a.notes,
    fromPipedrive: a.from_pipedrive,
  }));

  const clients = (clientsRes.data || []).map(c => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    importedFrom: c.imported_from, contactSource: c.contact_source,
    assignedBroker: c.assigned_broker, manualBrokers: c.manual_brokers || [],
  }));

  const notes = {};
  (notesRes.data || []).forEach(n => {
    if (!notes[n.client_name]) notes[n.client_name] = [];
    notes[n.client_name].push({ text: n.text, timestamp: n.timestamp });
  });

  const settingsMap = {};
  (settingsRes.data || []).forEach(s => { settingsMap[s.key] = s.value; });

  return { appointments, clients, notes, ...settingsMap };
}

export async function upsertAppt(appt) {
  await supabase.from('appointments').upsert({
    id: appt.id, broker: appt.broker, date: appt.date,
    start_hour: appt.startHour, duration: appt.duration,
    client_name: appt.clientName, notes: appt.notes || '',
    from_pipedrive: appt.fromPipedrive || false,
  });
}

export async function upsertAppts(appts) {
  if (!appts.length) return;
  await supabase.from('appointments').upsert(appts.map(a => ({
    id: a.id, broker: a.broker, date: a.date,
    start_hour: a.startHour, duration: a.duration,
    client_name: a.clientName, notes: a.notes || '',
    from_pipedrive: a.fromPipedrive || false,
  })));
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
    assigned_broker: client.assignedBroker || '',
    manual_brokers: client.manualBrokers || [],
  });
}

export async function upsertClients(clients) {
  if (!clients.length) return;
  await supabase.from('clients').upsert(clients.map(c => ({
    id: c.id, name: c.name,
    phone: c.phone || '', email: c.email || '',
    imported_from: c.importedFrom || '',
    contact_source: c.contactSource || '',
    assigned_broker: c.assignedBroker || '',
    manual_brokers: c.manualBrokers || [],
  })));
}

export async function insertNote(clientName, entry) {
  await supabase.from('notes').insert({
    client_name: clientName, text: entry.text, timestamp: entry.timestamp,
  });
}

export async function saveSetting(key, value) {
  await supabase.from('settings').upsert({ key, value });
}
