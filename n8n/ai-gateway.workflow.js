import {
  expr,
  ifElse,
  node,
  sticky,
  switchCase,
  trigger,
  workflow,
} from "@n8n/workflow-sdk";

const T_LEADS = "048bYoe3wwNXPwmS";
const T_ACTIVITIES = "hoviNVBkQPJcv3yi";
const T_CONFIG = "GlW1ROM8sSfdO7LA";
const T_PROSPECTS = "Bt4eJ0TOkiIhH8c9";
const T_TASKS = "yf9VcYN1Ym5bV9BL";
const WF_INTAKE = "kEy4STOjkUNhQTGv";

/* Kernel aturan agen. Ditulis satu kali di sini lalu disisipkan ke setiap Code
   node yang membutuhkannya — n8n tidak punya modul bersama antar Code node,
   jadi tanpa ini salinannya pasti melenceng satu sama lain.
   Kernel ini sekarang HANYA hidup di sini — dashboard (frontend) tidak lagi
   punya salinannya, jadi tidak ada file lain yang perlu disinkronkan. */
const HELPERS = `
// ── Kernel aturan agen — satu-satunya salinan, hidup hanya di n8n ───────────
var DAY_MS = 86400000;
var STALE_DAYS = 3;
var BRAND = 'WithMi';
var PRODUK = 'perlengkapan harian';
var PROSPECT_LEAD_SOURCE = 'canvassing';

var AREA_LABELS = { lembang: 'Lembang', pangalengan: 'Pangalengan', ciwidey: 'Ciwidey', dago: 'Dago', cisarua: 'Cisarua' };
var CATEGORY_LABELS = { villa: 'Villa', glamping: 'Glamping', camping: 'Camping ground' };
var UNIT_WORDS = { villa: 'unit sewa', glamping: 'tenda glamping', camping: 'lapak tenda' };
var PRICE_BAND_LABELS = { budget: 'harga kelas ekonomi', mid: 'harga kelas menengah', premium: 'harga kelas menengah-atas' };
var STAGE_LABELS = { todo: 'To Do', in_progress: 'In Progress', won: 'Win', lost: 'Fail' };
var GOAL_LABELS = { perkenalan: 'Perkenalan', tindak_lanjut_penawaran: 'Tindak lanjut penawaran', repeat_order: 'Repeat order', reaktivasi: 'Reaktivasi' };
var TEMPLATE_IDS = { perkenalan: 'wa_perkenalan_v1', tindak_lanjut_penawaran: 'wa_tindak_lanjut_penawaran_v1', repeat_order: 'wa_repeat_order_v1', reaktivasi: 'wa_reaktivasi_v1' };
var TASK_KIND_LABELS = { prospect_batch: 'Tambah prospek ke CRM', followup: 'Kirim follow-up', stage_move: 'Pindahkan stage' };
var SCORE_WEIGHTS = { rating: 25, reviews: 20, scale: 20, price: 15, whatsapp: 10, verified: 5, freshness: 5 };
var PART_LABELS = { rating: 'Rating', reviews: 'Jumlah ulasan', scale: 'Skala usaha', price: 'Kelas harga', whatsapp: 'Kanal WhatsApp', verified: 'Listing terverifikasi', freshness: 'Kesegaran listing' };
var SCORE_TIERS = [ { min: 80, label: 'prioritas tinggi' }, { min: 60, label: 'layak dihubungi' }, { min: 40, label: 'cadangan' }, { min: 0, label: 'lewati dulu' } ];
var CLOSING_HINTS = /(transfer|dp|lunas|closing|invoice)/i;
var CONTACT_TYPES = ['call', 'wa', 'visit'];
var ACTIVITY_WORDS = { call: 'telepon', wa: 'WhatsApp', visit: 'kunjungan', note: 'catatan', stage_change: 'perpindahan stage', assign: 'pergantian sales', created: 'pembuatan lead' };

function rowsOf(name) {
  return $(name).all().map(function (i) { return i.json; }).filter(function (r) { return r && r.id !== undefined; });
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function round2(v) { return Math.round(v * 100) / 100; }
function idDecimal(v) { return String(v).replace('.', ','); }
function normalizePhone(raw) {
  var p = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  if (p.indexOf('62') === 0) return p;
  if (p.indexOf('0') === 0) return '62' + p.slice(1);
  if (p.indexOf('8') === 0) return '62' + p;
  return p;
}
function relativeDays(d) {
  if (d <= 0) return 'hari ini';
  if (d === 1) return 'kemarin';
  if (d < 30) return d + ' hari lalu';
  if (d < 365) return Math.floor(d / 30) + ' bulan lalu';
  return Math.floor(d / 365) + ' tahun lalu';
}
function daysSinceIso(iso, now) {
  var ts = Date.parse(iso);
  if (isNaN(ts)) return 0;
  return Math.max(0, Math.floor((now - ts) / DAY_MS));
}
// Jam WIB dihitung dari epoch. \`timezone\` workflow tidak memengaruhi
// new Date() di dalam Code node, dan salah di sini menghasilkan
// "Selamat pagi" pukul sembilan malam.
function wibHour(now) { return Math.floor((now / 3600000 + 7) % 24); }
function greeting(now) {
  var h = wibHour(now);
  if (h < 11) return 'pagi';
  if (h < 15) return 'siang';
  if (h < 18) return 'sore';
  return 'malam';
}
function mapLead(row) {
  return {
    id: String(row.id), name: row.name || '', type: row.type || '', phone: row.phone || '',
    phone_raw: row.phone_raw || '', address: row.address || '', source: row.source || '',
    stage: row.stage || 'todo', owner_id: row.owner_id == null ? '' : String(row.owner_id),
    owner_name: row.owner_name || '', order_count: Number(row.order_count || 0),
    notes: row.notes || '', classify_reason: row.classify_reason || '',
    is_stale: row.is_stale === true, last_activity_at: row.last_activity_at || '',
    created_at: row.created_at || '', updated_at: row.updated_at || ''
  };
}
function mapActivity(row) {
  return {
    id: String(row.id), lead_id: String(row.lead_id), type: row.type || 'note',
    content: row.content || '', actor: row.actor || '', created_at: row.created_at || ''
  };
}
function mapProspect(row) {
  return {
    id: String(row.id), name: row.name || '', category: row.category || 'villa',
    area: row.area || '', address: row.address || '', phone: row.phone || '',
    phoneRaw: row.phone_raw || '', rating: Number(row.rating || 0),
    reviewCount: Number(row.review_count || 0), unitCount: Number(row.unit_count || 0),
    priceBand: row.price_band || 'budget', priceNote: row.price_note || '',
    sourceLabel: row.source_label || '', listingUrl: row.listing_url || '',
    hasWhatsapp: row.has_whatsapp === true, verified: row.verified === true,
    lastSeenDays: Number(row.last_seen_days || 0),
    keywords: String(row.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean),
    notes: row.notes || '', status: row.status || 'new',
    convertedLeadId: row.converted_lead_id == null ? '' : String(row.converted_lead_id)
  };
}
function mapTask(row) {
  var parse = function (v) { try { return v ? JSON.parse(String(v)) : null; } catch (e) { return null; } };
  return {
    id: String(row.id), kind: row.kind || 'followup', status: row.status || 'pending',
    title: row.title || '', reason: row.reason || '', priority: Number(row.priority || 0),
    leadId: row.lead_id == null ? '' : String(row.lead_id), leadName: row.lead_name || '',
    payload: parse(row.payload_json) || {}, result: parse(row.result_json),
    dedupeKey: row.dedupe_key || '', runId: row.run_id || '', actor: row.actor || '',
    createdAt: row.created_at || '', decidedAt: row.decided_at || '', executedAt: row.executed_at || ''
  };
}
function scoreProspect(r) {
  var rating = round2(clamp((Number(r.rating) - 3.5) / 1.2, 0, 1) * 25);
  var rev = Number(r.reviewCount) || 0;
  var reviews = rev >= 200 ? 20 : rev >= 100 ? 16 : rev >= 50 ? 12 : rev >= 20 ? 8 : rev >= 5 ? 4 : 0;
  var u = Number(r.unitCount) || 0;
  var scale = u >= 15 ? 20 : u >= 8 ? 15 : u >= 4 ? 10 : u >= 2 ? 6 : u >= 1 ? 2 : 0;
  var price = r.priceBand === 'premium' ? 15 : r.priceBand === 'mid' ? 11 : r.priceBand === 'budget' ? 5 : 0;
  var wa = r.hasWhatsapp === true ? 10 : 0;
  var ver = r.verified === true ? 5 : 0;
  var d = Number(r.lastSeenDays) || 0;
  var fresh = d <= 7 ? 5 : d <= 30 ? 3 : d <= 90 ? 1 : 0;
  var raw = { rating: rating, reviews: reviews, scale: scale, price: price, whatsapp: wa, verified: ver, freshness: fresh };
  var parts = Object.keys(SCORE_WEIGHTS).map(function (k) {
    return { key: k, label: PART_LABELS[k], points: raw[k], max: SCORE_WEIGHTS[k] };
  });
  var total = parts.reduce(function (s, p) { return s + p.points; }, 0);
  return { score: clamp(Math.round(total), 0, 100), parts: parts };
}
function scoreTier(score) {
  for (var i = 0; i < SCORE_TIERS.length; i++) if (score >= SCORE_TIERS[i].min) return SCORE_TIERS[i].label;
  return SCORE_TIERS[SCORE_TIERS.length - 1].label;
}
function scoreReason(r, score, existingLeadId) {
  var c = [];
  if (existingLeadId) c.push('Sudah ada di CRM sebagai lead #' + existingLeadId);
  c.push(r.reviewCount < 5
    ? 'Rating ' + idDecimal(r.rating) + ', ulasan masih sedikit'
    : 'Rating ' + idDecimal(r.rating) + ' dari ' + r.reviewCount + ' ulasan');
  if (r.unitCount > 0) c.push(r.unitCount + ' ' + (UNIT_WORDS[r.category] || 'unit'));
  c.push(PRICE_BAND_LABELS[r.priceBand] || '');
  if (r.hasWhatsapp) c.push('nomor WhatsApp aktif');
  if (r.verified) c.push('listing terverifikasi');
  if (r.lastSeenDays <= 90) c.push('listing diperbarui ' + relativeDays(r.lastSeenDays));
  var verdict = existingLeadId ? 'duplikat' : scoreTier(score);
  return c.filter(Boolean).join(', ') + ' — skor ' + score + '/100, ' + verdict;
}
function prospectNotes(r, score) {
  return 'Prospek dari agen AI — ' + r.sourceLabel + ', rating ' + idDecimal(r.rating) +
    ' (' + r.reviewCount + ' ulasan), ' + r.unitCount + ' ' + (UNIT_WORDS[r.category] || 'unit') +
    ', skor ' + score + '/100.';
}
function toCandidate(r, now, existingLeadId, matchScore, matchedOn) {
  var s = scoreProspect(r);
  return {
    prospectId: r.id, name: r.name, category: r.category, categoryLabel: CATEGORY_LABELS[r.category] || r.category,
    area: r.area, areaLabel: AREA_LABELS[r.area] || r.area, address: r.address,
    phone: r.phone, phoneRaw: r.phoneRaw, rating: r.rating, reviewCount: r.reviewCount,
    unitCount: r.unitCount, unitLabel: r.unitCount + ' ' + (UNIT_WORDS[r.category] || 'unit'),
    priceBand: r.priceBand, priceNote: r.priceNote, sourceLabel: r.sourceLabel, listingUrl: r.listingUrl,
    hasWhatsapp: r.hasWhatsapp, verified: r.verified,
    lastSeenAt: new Date(now - r.lastSeenDays * DAY_MS).toISOString(),
    lastSeenLabel: relativeDays(r.lastSeenDays), keywords: r.keywords, notes: r.notes,
    score: s.score, scoreTier: scoreTier(s.score), scoreReason: scoreReason(r, s.score, existingLeadId),
    scoreParts: s.parts, matchScore: matchScore || 0, matchedOn: matchedOn || [],
    status: r.status, alreadyInCrm: Boolean(existingLeadId), existingLeadId: existingLeadId || '',
    leadDraft: { name: r.name, phone: r.phoneRaw, address: r.address, source: PROSPECT_LEAD_SOURCE, notes: prospectNotes(r, s.score) }
  };
}
function matchProspect(r, query) {
  var tokens = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3; });
  if (!tokens.length) return { matchScore: 0, matchedOn: [] };
  var score = 0; var on = [];
  var name = String(r.name).toLowerCase();
  var hay = (String(r.notes) + ' ' + String(r.address)).toLowerCase();
  var kws = r.keywords.map(function (k) { return String(k).toLowerCase(); });
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (name.indexOf(t) !== -1) { score += 2; on.push('nama'); continue; }
    var kw = kws.filter(function (k) { return k.indexOf(t) !== -1; })[0];
    if (kw) { score += 1; on.push('kata kunci: ' + kw); continue; }
    if (hay.indexOf(t) !== -1) { score += 1; on.push('deskripsi'); }
  }
  return { matchScore: score, matchedOn: on.filter(function (v, i2, a) { return a.indexOf(v) === i2; }) };
}
function sapaan(lead) {
  if (lead.type === 'B2B') return 'tim ' + lead.name;
  var first = String(lead.name || '').trim().split(/\\s+/)[0] || 'Kak';
  return 'Kak ' + first;
}
function relativeShort(iso, now) { return relativeDays(daysSinceIso(iso, now)); }
function pickGoal(lead, now) {
  var days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
  if (lead.stage === 'in_progress' && days >= 7) return 'reaktivasi';
  if (lead.order_count > 0) return 'repeat_order';
  if (lead.stage === 'in_progress') return 'tindak_lanjut_penawaran';
  return 'perkenalan';
}
function draftBody(goal, v) {
  // Lead tanpa sales memang ada; menambal namanya dengan frasa umum
  // menghasilkan "Saya tim sales kami dari WithMi".
  var pembuka = v.sales
    ? 'Selamat ' + v.waktu + ', ' + v.sapaan + '. Saya ' + v.sales + ' dari ' + BRAND + '.'
    : 'Selamat ' + v.waktu + ', ' + v.sapaan + '. Saya dari tim ' + BRAND + '.';
  if (goal === 'perkenalan') {
    return [pembuka,
      'Kami lihat ' + v.nama + (v.alamat ? ' di ' + v.alamat : '') + ' — kami menyediakan ' + PRODUK + ' untuk kebutuhan villa, glamping, dan camping ground.',
      'Boleh saya kirimkan katalog dan harga khusus pengelola? Kalau berkenan, saya kirim sekarang juga.'].join('\\n');
  }
  if (goal === 'tindak_lanjut_penawaran') {
    return [pembuka,
      'Penawaran yang saya kirim ' + v.lama_penawaran + ' sudah sempat dilihat? Kalau ada yang perlu disesuaikan — jumlah, warna, atau waktu kirim — saya bantu revisi hari ini juga.',
      'Balas pesan ini saja kalau ada yang mau ditanyakan.'].join('\\n');
  }
  if (goal === 'repeat_order') {
    return [pembuka,
      'Terima kasih untuk ' + v.jumlah_order + ' pesanan sebelumnya. Stok untuk restock bulan ini sudah siap, dan untuk pelanggan lama ada harga khusus.',
      'Mau saya siapkan pesanan dengan jumlah yang sama seperti terakhir?'].join('\\n');
  }
  return [pembuka,
    'Saya cek catatan kami, obrolan terakhir kita ' + v.jeda_hari + ' hari lalu dan belum sempat dilanjutkan. Masih ada rencana untuk melanjutkan penawaran kemarin?',
    'Kalau sekarang belum sempat, saya kabari lagi minggu depan — tinggal balas "nanti saja".'].join('\\n');
}
function draftReason(lead, goal, days, now) {
  var c = ['Lead ada di ' + (STAGE_LABELS[lead.stage] || lead.stage)];
  c.push(days === 0 ? 'ada aktivitas hari ini' : days + ' hari tanpa aktivitas');
  c.push(lead.order_count > 0 ? 'sudah ' + lead.order_count + 'x order' : 'belum pernah order');
  var auto = pickGoal(lead, now);
  var tail = goal === auto
    ? 'dipakai template ' + String(GOAL_LABELS[goal]).toLowerCase()
    : 'template ' + String(GOAL_LABELS[goal]).toLowerCase() + ' dipilih manual, bukan ' + String(GOAL_LABELS[auto]).toLowerCase();
  return c.join(', ') + ' — ' + tail;
}
function renderDraft(lead, goal, now) {
  var days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
  var vars = {
    waktu: greeting(now), sapaan: sapaan(lead), sales: lead.owner_name, nama: lead.name,
    alamat: lead.address, jeda_hari: days, jumlah_order: lead.order_count + 'x',
    lama_penawaran: relativeShort(lead.last_activity_at || lead.created_at, now)
  };
  var text = draftBody(goal, vars);
  if (text.length > 600) text = text.slice(0, 599) + '…';
  return { templateId: TEMPLATE_IDS[goal], goal: goal, goalLabel: GOAL_LABELS[goal], channel: 'wa', text: text, reason: draftReason(lead, goal, days, now), vars: vars };
}
function waLink(phone, text) {
  var base = 'https://wa.me/' + normalizePhone(phone);
  return text ? base + '?text=' + encodeURIComponent(text) : base;
}
function dedupeKeyFor(kind, parts) {
  if (kind === 'followup') return 'followup:' + (parts.leadId || '');
  if (kind === 'stage_move') return 'stage_move:' + (parts.leadId || '') + ':' + (parts.stage || '');
  var ids = (parts.prospectIds || []).slice().sort(function (a, b) { return Number(a) - Number(b); });
  return 'prospect_batch:' + ids.join('-');
}
function excerpt(v, max) {
  var clean = String(v || '').replace(/\\s+/g, ' ').trim();
  max = max || 48;
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}
function uniq(a) { return a.filter(function (v, i, arr) { return arr.indexOf(v) === i; }); }
function listAnd(v) {
  if (v.length <= 1) return v[0] || '';
  return v.slice(0, -1).join(', ') + ' dan ' + v[v.length - 1];
}
// Nama prospek ikut disimpan di payload tugas, bukan cuma id-nya: kartu antrian
// dibaca berhari-hari setelah hasil pencarian yang melahirkannya hilang, dan
// "Tambahkan 3 prospek pilihan" tidak memberi apa pun untuk disetujui.
function prospectBrief(rows) {
  return rows.map(function (r) {
    return { id: String(r.id), name: r.name, area: AREA_LABELS[r.area] || r.area, score: scoreProspect(r).score };
  });
}
function batchTitle(brief) {
  var names = brief.map(function (b) { return excerpt(b.name, 28); });
  if (names.length === 0) return 'Tambahkan prospek ke CRM';
  if (names.length === 1) return 'Tambahkan ' + names[0] + ' ke CRM';
  if (names.length === 2) return 'Tambahkan ' + names[0] + ' dan ' + names[1] + ' ke CRM';
  return 'Tambahkan ' + names[0] + ', ' + names[1] + ' +' + (names.length - 2) + ' lagi ke CRM';
}
function mostCommon(v) {
  var t = {};
  for (var i = 0; i < v.length; i++) t[v[i]] = (t[v[i]] || 0) + 1;
  return Object.keys(t).sort(function (a, b) { return t[b] - t[a]; })[0];
}
function tally(v) {
  var out = {};
  for (var i = 0; i < v.length; i++) out[v[i]] = (out[v[i]] || 0) + 1;
  return out;
}
function generateTasks(leads, activities, prospects, existing, kinds, now) {
  var wanted = (kinds && kinds.length) ? kinds : ['followup', 'stage_move', 'prospect_batch'];
  var byLead = {};
  for (var i = 0; i < activities.length; i++) {
    var a = activities[i];
    (byLead[a.lead_id] = byLead[a.lead_id] || []).push(a);
  }
  var tasks = [];
  if (wanted.indexOf('followup') !== -1) tasks = tasks.concat(planFollowups(leads, now));
  if (wanted.indexOf('stage_move') !== -1) tasks = tasks.concat(planStageMoves(leads, byLead, now));
  if (wanted.indexOf('prospect_batch') !== -1) tasks = tasks.concat(planProspectBatch(prospects));
  return applyDedupe(tasks, existing, now);
}
function planFollowups(leads, now) {
  var out = [];
  for (var i = 0; i < leads.length; i++) {
    var lead = leads[i];
    if (lead.stage !== 'todo' && lead.stage !== 'in_progress') continue;
    var days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
    // is_stale hanya ditulis Stale Detector pukul 08:00 WIB; hari dihitung
    // sendiri supaya antrian tidak kosong waktu demo siang hari.
    if (!lead.is_stale && days < STALE_DAYS) continue;
    var goal = pickGoal(lead, now);
    var draft = renderDraft(lead, goal, now);
    out.push({
      kind: 'followup',
      title: 'Follow up ' + lead.name + ' — ' + days + ' hari tanpa aktivitas',
      reason: draft.reason,
      priority: Math.min(100, 40 + days * 6 + (lead.order_count > 0 ? 10 : 0) + (lead.type === 'B2B' ? 10 : 0)),
      leadId: lead.id, leadName: lead.name,
      payload: { leadId: lead.id, goal: goal, templateId: draft.templateId, text: draft.text, channel: 'wa', vars: draft.vars },
      dedupeKey: dedupeKeyFor('followup', { leadId: lead.id })
    });
  }
  return out.sort(function (a, b) { return b.priority - a.priority; }).slice(0, 6);
}
function planStageMoves(leads, byLead, now) {
  var out = [];
  for (var i = 0; i < leads.length; i++) {
    var lead = leads[i];
    if (lead.stage === 'won' || lead.stage === 'lost') continue;
    var acts = (byLead[lead.id] || []).slice().sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
    var contacts = acts.filter(function (a) { return CONTACT_TYPES.indexOf(a.type) !== -1; });
    var days = daysSinceIso(lead.last_activity_at || lead.created_at, now);
    var move = pickStageMove(lead, acts, contacts, days, now);
    if (!move) continue;
    out.push({
      kind: 'stage_move',
      title: 'Pindahkan ' + lead.name + ' ke ' + STAGE_LABELS[move.to],
      reason: move.reason, priority: move.priority,
      leadId: lead.id, leadName: lead.name,
      payload: { leadId: lead.id, from: lead.stage, to: move.to, note: move.note, evidence: { contactCount: contacts.length, lastType: contacts[0] ? contacts[0].type : '', lastAt: contacts[0] ? contacts[0].created_at : '', idleDays: days } },
      dedupeKey: dedupeKeyFor('stage_move', { leadId: lead.id, stage: move.to })
    });
  }
  return out.sort(function (a, b) { return b.priority - a.priority; }).slice(0, 4);
}
function pickStageMove(lead, acts, contacts, days, now) {
  if (lead.stage === 'todo' && contacts.length >= 1) {
    var last = contacts[0];
    return {
      to: 'in_progress', priority: 70, note: 'Dipindahkan atas usulan agen',
      reason: 'Sudah ada ' + contacts.length + ' interaksi (terakhir ' + (ACTIVITY_WORDS[last.type] || last.type) + ' ' + relativeShort(last.created_at, now) + ') tapi kartu masih di To Do — disarankan pindah ke In Progress'
    };
  }
  if (lead.stage === 'in_progress') {
    var hint = acts.filter(function (a) { return CLOSING_HINTS.test(a.content); })[0];
    if (lead.order_count >= 1 && hint) {
      return {
        to: 'won', priority: 80, note: 'Ditandai Win atas usulan agen',
        reason: 'Ada catatan "' + excerpt(hint.content) + '" dan ' + lead.order_count + 'x order tercatat — disarankan ditandai Win'
      };
    }
    if (days >= 14) {
      return {
        to: 'lost', priority: 55, note: 'Ditutup atas usulan agen',
        reason: days + ' hari tanpa respons setelah ' + contacts.length + ' percobaan kontak — disarankan ditutup sebagai Fail'
      };
    }
  }
  return null;
}
function planProspectBatch(prospects) {
  var ready = prospects
    .filter(function (p) { return p.status === 'new' && scoreProspect(p).score >= 70; })
    .sort(function (a, b) { return scoreProspect(b).score - scoreProspect(a).score; })
    .slice(0, 8);
  if (ready.length < 3) return [];
  var scores = ready.map(function (p) { return scoreProspect(p).score; });
  var avgScore = Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length);
  var avgRating = ready.reduce(function (s, p) { return s + p.rating; }, 0) / ready.length;
  var areas = uniq(ready.map(function (p) { return AREA_LABELS[p.area] || p.area; }));
  var dominant = mostCommon(ready.map(function (p) { return p.category; }));
  var eligible = prospects.filter(function (p) { return p.status === 'new'; }).length;
  return [{
    kind: 'prospect_batch',
    title: 'Tambahkan ' + ready.length + ' prospek ' + String(CATEGORY_LABELS[dominant] || dominant).toLowerCase() + ' area ' + listAnd(areas) + ' ke CRM',
    reason: ready.length + ' dari ' + eligible + ' prospek berskor ≥70 dan nomornya belum ada di CRM, rata-rata rating ' + idDecimal(Math.round(avgRating * 10) / 10) + ' — siap dimasukkan sebagai lead baru',
    priority: avgScore, leadId: '', leadName: '',
    payload: { prospectIds: ready.map(function (p) { return p.id; }), prospects: prospectBrief(ready), source: 'auto', areaMix: uniq(ready.map(function (p) { return p.area; })) },
    dedupeKey: dedupeKeyFor('prospect_batch', { prospectIds: ready.map(function (p) { return p.id; }) })
  }];
}
function applyDedupe(tasks, existing, now) {
  var pending = {}; var recent = {};
  for (var i = 0; i < existing.length; i++) {
    var row = existing[i];
    if (row.status === 'pending') { pending[row.dedupeKey] = true; continue; }
    if (row.status !== 'approved') continue;
    var d = Date.parse(row.decidedAt);
    if (!isNaN(d) && now - d < DAY_MS) recent[row.dedupeKey] = true;
  }
  var kept = []; var skipped = []; var seen = {};
  for (var j = 0; j < tasks.length; j++) {
    var t = tasks[j];
    if (seen[t.dedupeKey]) continue;
    seen[t.dedupeKey] = true;
    if (pending[t.dedupeKey]) { skipped.push({ dedupeKey: t.dedupeKey, reason: 'Sudah ada tugas pending yang sama' }); continue; }
    if (recent[t.dedupeKey]) { skipped.push({ dedupeKey: t.dedupeKey, reason: 'Baru disetujui kurang dari 24 jam lalu' }); continue; }
    kept.push(t);
  }
  return { tasks: kept, skipped: skipped };
}
function loadAll() {
  return {
    leads: rowsOf('Load Leads').filter(function (l) { return !l.deleted_at; }).map(mapLead),
    activities: rowsOf('Load Activities').map(mapActivity),
    prospects: rowsOf('Load Prospects').map(mapProspect),
    tasks: rowsOf('Load AI Tasks').map(mapTask)
  };
}
function fail(code, message) { return [{ json: { error: { code: code, message: message } } }]; }
`;

/* ── Preamble ─────────────────────────────────────────────────────────────── */

const webhookTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "AI Webhook",
    parameters: {
      httpMethod: "POST",
      path: "simple-crm-demo-ai",
      responseMode: "responseNode",
      options: { allowedOrigins: "*" },
    },
  },
});

const loadConfig = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Config",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_CONFIG },
      returnAll: true,
    },
    alwaysOutputData: true,
  },
});

const authParse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Auth & Parse AI",
    parameters: {
      jsCode: `// Salinan persis "Auth & Parse" milik CRM API Gateway, hanya daftar
// ACTIONS-nya yang berbeda. Kunci API-nya pun sama — satu kunci, dua URL.
const req = $('AI Webhook').first().json;
const headers = req.headers || {};
const body = (req.body && typeof req.body === 'object') ? req.body : {};
const requestId = String($execution.id);

const ACTIONS = ['ai.bootstrap', 'ai.prospect.search', 'ai.draft.followup', 'ai.tasks.list', 'ai.tasks.generate', 'ai.tasks.create', 'ai.tasks.decide'];

const configRows = $('Load Config').all().map((i) => i.json).filter((r) => r && r.id !== undefined);
const configMap = {};
for (const r of configRows) configMap[String(r.key)] = r.value == null ? '' : String(r.value);

let expectedKey = '';
try {
  if (typeof $vars !== 'undefined' && $vars && $vars.CRM_API_KEY) {
    expectedKey = String($vars.CRM_API_KEY);
  }
} catch (e) {
  expectedKey = '';
}
if (!expectedKey) expectedKey = configMap.api_key || '';

const provided = String(headers['x-api-key'] || headers['X-API-KEY'] || '');

const deny = (code, message) => [{ json: { ok: false, action: '__error', payload: {}, requestId: requestId, error: { code: code, message: message } } }];

if (!expectedKey) return deny('INTERNAL_ERROR', 'API key belum dikonfigurasi di server');
if (!provided || provided !== expectedKey) return deny('UNAUTHORIZED', 'x-api-key tidak valid atau tidak dikirim');

const action = String(body.action == null ? '' : body.action);
if (!action) return deny('VALIDATION_ERROR', 'action wajib diisi');
if (ACTIONS.indexOf(action) === -1) return deny('UNKNOWN_ACTION', 'Action "' + action + '" tidak dikenal');

const payload = (body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)) ? body.payload : {};

return [{ json: { ok: true, action: action, payload: payload, requestId: requestId } }];`,
    },
  },
});

const requestValid = ifElse({
  version: 2.2,
  config: {
    name: "Request Valid?",
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "loose",
          version: 1,
        },
        conditions: [
          {
            leftValue: expr("{{ $json.ok }}"),
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  },
});

/* SDK n8n adalah DSL deklaratif: `function`, arrow function, dan karenanya
   `.map()`/`.reduce()` semuanya ditolak parser. Keempat pembaca dan seluruh
   schema di bawah karena itu ditulis literal, bukan lewat pabrik.

   `executeOnce: true` wajib di keempatnya. Node dataTable berjalan sekali per
   item masuk, dan karena keempat pembaca dirantai seri, tanpa ini tiap tabel
   terbaca berulang: 11 lead x 33 activity x 24 prospek = 8712 baris prospek
   palsu, dedupe nomor ikut melar, dan skor rata-rata jadi tidak berarti. */

const loadLeads = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Leads",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_LEADS },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const loadActivities = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Activities",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_ACTIVITIES },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const loadProspects = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Prospects",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_PROSPECTS },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const loadTasks = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load AI Tasks",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_TASKS },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const prepareRouting = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Prepare Routing",
    parameters: {
      jsCode: `return [{ json: $('Auth & Parse AI').first().json }];`,
    },
  },
});

/* Urutan tujuh rule ini mengikat: .onCase(n) di bawah memakai indeks 0-6,
   dan cabang fallback "unknown" menjadi indeks 7. */
const ACTION_RULE_OPTIONS = {
  caseSensitive: true,
  leftValue: "",
  typeValidation: "loose",
  version: 1,
};

const routeAction = switchCase({
  version: 3.4,
  config: {
    name: "Route AI Action",
    parameters: {
      rules: {
        values: [
          {
            outputKey: "ai.bootstrap",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.bootstrap",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "ai.prospect.search",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.prospect.search",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "ai.draft.followup",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.draft.followup",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "ai.tasks.list",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.tasks.list",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "ai.tasks.generate",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.tasks.generate",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "ai.tasks.create",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.tasks.create",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "ai.tasks.decide",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.action }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "ai.tasks.decide",
                },
              ],
              combinator: "and",
            },
          },
        ],
      },
      options: { fallbackOutput: "extra", renameFallbackOutput: "unknown" },
    },
  },
});

/* ── Cabang baca ──────────────────────────────────────────────────────────── */

const actionBootstrap = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Action ai.bootstrap",
    parameters: {
      jsCode: `${HELPERS}
const all = loadAll();
const poolCounts = tally(all.prospects.map(function (p) { return p.status; }));
const taskCounts = tally(all.tasks.map(function (t) { return t.status; }));

const areas = Object.keys(AREA_LABELS).map(function (key) {
  return { key: key, label: AREA_LABELS[key], count: all.prospects.filter(function (p) { return p.area === key; }).length };
});
const categories = Object.keys(CATEGORY_LABELS).map(function (key) {
  return { key: key, label: CATEGORY_LABELS[key], count: all.prospects.filter(function (p) { return p.category === key; }).length };
});

return [{ json: { data: {
  areas: areas,
  categories: categories,
  goals: Object.keys(GOAL_LABELS).map(function (k) { return { key: k, label: GOAL_LABELS[k] }; }),
  taskKinds: Object.keys(TASK_KIND_LABELS).map(function (k) { return { key: k, label: TASK_KIND_LABELS[k] }; }),
  templates: Object.keys(TEMPLATE_IDS).map(function (g) { return { id: TEMPLATE_IDS[g], goal: g, label: GOAL_LABELS[g] }; }),
  pool: Object.assign({ total: all.prospects.length }, poolCounts),
  tasks: Object.assign({ total: all.tasks.length }, taskCounts),
  scoring: { weights: SCORE_WEIGHTS, tiers: SCORE_TIERS }
} } }];`,
    },
  },
});

const actionSearch = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Action ai.prospect.search",
    parameters: {
      jsCode: `${HELPERS}
const p = $json.payload || {};
const all = loadAll();
const now = Date.now();

const query = String(p.query == null ? '' : p.query).trim();
const area = String(p.area == null ? '' : p.area);
const category = String(p.category == null ? '' : p.category);
const includeUsed = p.includeUsed === true;
const minScore = Number(p.minScore || 0);
const limit = Math.min(24, Math.max(1, Number(p.limit || 12)));

if (area && !AREA_LABELS[area]) return fail('VALIDATION_ERROR', 'Area "' + area + '" tidak dikenal. Pilihan: ' + Object.keys(AREA_LABELS).join(', '));
if (category && !CATEGORY_LABELS[category]) return fail('VALIDATION_ERROR', 'Kategori "' + category + '" tidak dikenal. Pilihan: ' + Object.keys(CATEGORY_LABELS).join(', '));

// Durasi tiap langkah diukur, bukan dikarang: kalau log eksekusi n8n ikut
// ditunjukkan ke klien, angka di layar dan di log harus bercerita sama.
const steps = [];
let last = Date.now();
function mark(key, label, detail, count) {
  const t = Date.now();
  steps.push({ key: key, label: label, detail: detail, count: count === undefined ? null : count, ms: t - last });
  last = t;
}

const tokens = query ? query.split(/\\s+/).filter(Boolean) : [];
mark('parse', 'Membaca permintaan', [
  tokens.length ? 'kata kunci: ' + tokens.join(', ') : 'tanpa kata kunci',
  area ? 'area ' + AREA_LABELS[area] : null,
  category ? 'kategori ' + CATEGORY_LABELS[category] : null
].filter(Boolean).join(' · '), null);

mark('pool', 'Membuka pool prospek', all.prospects.length + ' baris di crm_prospects', all.prospects.length);

const rows = all.prospects.filter(function (r) {
  if (area && r.area !== area) return false;
  if (category && r.category !== category) return false;
  if (!includeUsed && r.status === 'converted') return false;
  return true;
});
mark('filter', 'Menyaring area & kategori', rows.length + ' kandidat lolos filter', rows.length);

const matched = rows.map(function (r) { const m = matchProspect(r, query); return { row: r, matchScore: m.matchScore, matchedOn: m.matchedOn }; });
const hits = tokens.length ? matched.filter(function (m) { return m.matchScore > 0; }).length : rows.length;
mark('match', 'Mencocokkan kata kunci', tokens.length ? hits + ' kandidat cocok dengan "' + query + '"' : 'tidak ada kata kunci, semua kandidat dipertahankan', hits);

const byPhone = {};
for (let i = 0; i < all.leads.length; i++) byPhone[all.leads[i].phone] = all.leads[i];
const dupes = matched.filter(function (m) { return byPhone[m.row.phone]; }).length;
mark('dedupe', 'Mencocokkan dengan CRM', dupes ? dupes + ' nomor sudah terdaftar' : 'tidak ada nomor yang bentrok', dupes);

let candidates = matched.map(function (m) {
  const existing = byPhone[m.row.phone];
  return toCandidate(m.row, now, existing ? existing.id : '', m.matchScore, m.matchedOn);
});
if (minScore > 0) candidates = candidates.filter(function (c) { return c.score >= minScore; });
const avg = candidates.length ? Math.round(candidates.reduce(function (s, c) { return s + c.score; }, 0) / candidates.length) : 0;
mark('score', 'Menilai kualitas listing', candidates.length ? 'skor rata-rata ' + avg : 'tidak ada yang dinilai', candidates.length);

candidates.sort(function (a, b) {
  return (b.matchScore - a.matchScore) || (b.score - a.score) || (b.reviewCount - a.reviewCount) || a.name.localeCompare(b.name);
});
const total = candidates.length;
const top = candidates.slice(0, limit);
mark('rank', 'Mengurutkan hasil', top.length + ' teratas ditampilkan', top.length);

const sourceTally = tally(top.map(function (c) { return c.sourceLabel; }));

return [{ json: { data: {
  runId: 'run_' + String($execution.id),
  query: query,
  filters: { area: area, category: category, minScore: minScore },
  total: total,
  returned: top.length,
  tookMs: steps.reduce(function (s, x) { return s + x.ms; }, 0),
  sources: Object.keys(sourceTally).map(function (k) { return { label: k, count: sourceTally[k] }; }),
  steps: steps,
  candidates: top
} } }];`,
    },
  },
});

const actionDraft = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Action ai.draft.followup",
    parameters: {
      jsCode: `${HELPERS}
const p = $json.payload || {};
const all = loadAll();
const now = Date.now();

const leadId = String(p.leadId == null ? '' : p.leadId);
if (!leadId) return fail('VALIDATION_ERROR', 'leadId wajib diisi');

const lead = all.leads.filter(function (l) { return l.id === leadId; })[0];
if (!lead) return fail('NOT_FOUND', 'Lead ' + leadId + ' tidak ditemukan');

let goal = String(p.goal == null ? '' : p.goal);
if (goal && !GOAL_LABELS[goal]) return fail('VALIDATION_ERROR', 'Goal "' + goal + '" tidak dikenal. Pilihan: ' + Object.keys(GOAL_LABELS).join(', '));
if (!goal) goal = pickGoal(lead, now);

if (normalizePhone(lead.phone).length < 9) return fail('VALIDATION_ERROR', 'Nomor WhatsApp lead tidak valid, draf tidak bisa dikirim');

const draft = renderDraft(lead, goal, now);
draft.waUrl = waLink(lead.phone, draft.text);

return [{ json: { data: {
  lead: lead,
  draft: draft,
  alternatives: Object.keys(GOAL_LABELS).filter(function (k) { return k !== goal; }).map(function (k) { return { goal: k, goalLabel: GOAL_LABELS[k] }; })
} } }];`,
    },
  },
});

const actionList = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Action ai.tasks.list",
    parameters: {
      jsCode: `${HELPERS}
const p = $json.payload || {};
const all = loadAll();

const status = String(p.status == null ? '' : p.status);
const kind = String(p.kind == null ? '' : p.kind);
const leadId = String(p.leadId == null ? '' : p.leadId);
const limit = Math.max(1, Number(p.limit || 50));

const items = all.tasks
  .filter(function (t) { return !status || t.status === status; })
  .filter(function (t) { return !kind || t.kind === kind; })
  .filter(function (t) { return !leadId || t.leadId === leadId; })
  .sort(function (a, b) { return (b.priority - a.priority) || (Date.parse(b.createdAt) - Date.parse(a.createdAt)); })
  .slice(0, limit);

return [{ json: { data: { items: items, total: items.length, counts: tally(all.tasks.map(function (t) { return t.status; })) } } }];`,
    },
  },
});

const unknownAction = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Unknown AI Action",
    parameters: {
      jsCode: `const action = $json.action || '';
return [{ json: { error: { code: 'UNKNOWN_ACTION', message: 'Action "' + action + '" tidak dikenal' } } }];`,
    },
  },
});

/* ── Cabang tulis: antrian ────────────────────────────────────────────────── */

const planGenerate = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Plan Tasks Generate",
    parameters: {
      jsCode: `${HELPERS}
const p = $json.payload || {};
const all = loadAll();
const now = Date.now();
const runId = 'gen_' + String($execution.id);

const kinds = Array.isArray(p.kinds) ? p.kinds.map(String) : null;
if (kinds) {
  for (let i = 0; i < kinds.length; i++) {
    if (!TASK_KIND_LABELS[kinds[i]]) return fail('VALIDATION_ERROR', 'Jenis tugas "' + kinds[i] + '" tidak dikenal');
  }
}

const planned = generateTasks(all.leads, all.activities, all.prospects, all.tasks, kinds, now);
const nowIso = new Date().toISOString();
const summary = {
  runId: runId,
  scanned: { leads: all.leads.length, activities: all.activities.length, prospects: all.prospects.length, pendingTasks: all.tasks.filter(function (t) { return t.status === 'pending'; }).length },
  skipped: planned.skipped
};

if (!planned.tasks.length) return [{ json: { __op: 'noop', __summary: summary } }];

return planned.tasks.map(function (t) {
  return { json: {
    __op: 'insert', __summary: summary,
    kind: t.kind, status: 'pending', title: t.title, reason: t.reason, priority: t.priority,
    lead_id: t.leadId, lead_name: t.leadName,
    payload_json: JSON.stringify(t.payload), result_json: '',
    dedupe_key: t.dedupeKey, run_id: runId, actor: '',
    created_at: nowIso, decided_at: '', executed_at: ''
  } };
});`,
    },
  },
});

const planCreate = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Plan Task Create",
    parameters: {
      jsCode: `${HELPERS}
const p = $json.payload || {};
const all = loadAll();
const now = Date.now();
const nowIso = new Date().toISOString();
const runId = 'man_' + String($execution.id);

const kind = String(p.kind == null ? '' : p.kind);
if (!TASK_KIND_LABELS[kind]) return fail('VALIDATION_ERROR', 'Jenis tugas "' + kind + '" tidak dikenal');
const actor = String(p.actor == null ? 'Operator' : p.actor) || 'Operator';

function pendingWith(key) {
  return all.tasks.filter(function (t) { return t.dedupeKey === key && t.status === 'pending'; })[0];
}
// Duplikat bukan error, sama seperti leads.create: tugas yang sudah mengantri
// dikembalikan apa adanya supaya klik kedua tidak menggandakan.
function duplicate(task) { return [{ json: { __op: 'duplicate', data: { task: task, duplicate: true } } }]; }

const summary = { runId: runId };

if (kind === 'prospect_batch') {
  const ids = Array.isArray(p.prospectIds) ? p.prospectIds.map(String) : [];
  if (!ids.length) return fail('VALIDATION_ERROR', 'prospectIds tidak boleh kosong');
  const rows = [];
  for (let i = 0; i < ids.length; i++) {
    const row = all.prospects.filter(function (r) { return r.id === ids[i]; })[0];
    if (!row) return fail('NOT_FOUND', 'Prospek ' + ids[i] + ' tidak ditemukan');
    rows.push(row);
  }
  const key = dedupeKeyFor('prospect_batch', { prospectIds: ids });
  const existing = pendingWith(key);
  if (existing) return duplicate(existing);

  const brief = prospectBrief(rows);
  const scores = brief.map(function (b) { return b.score; });
  const avg = Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length);
  return [{ json: {
    __op: 'insert', __summary: summary,
    kind: kind, status: 'pending',
    title: batchTitle(brief),
    reason: 'Dipilih manual dari hasil pencarian, skor rata-rata ' + avg + '/100 — menunggu persetujuan sebelum ditulis ke crm_leads',
    priority: avg, lead_id: '', lead_name: '',
    payload_json: JSON.stringify({ prospectIds: ids, prospects: brief, source: 'manual', areaMix: uniq(rows.map(function (r) { return r.area; })) }),
    result_json: '', dedupe_key: key, run_id: runId, actor: actor,
    created_at: nowIso, decided_at: '', executed_at: ''
  } }];
}

const leadId = String(p.leadId == null ? '' : p.leadId);
if (!leadId) return fail('VALIDATION_ERROR', 'leadId wajib diisi');
const lead = all.leads.filter(function (l) { return l.id === leadId; })[0];
if (!lead) return fail('NOT_FOUND', 'Lead ' + leadId + ' tidak ditemukan');

if (kind === 'followup') {
  let goal = String(p.goal == null ? '' : p.goal);
  if (goal && !GOAL_LABELS[goal]) return fail('VALIDATION_ERROR', 'Goal "' + goal + '" tidak dikenal');
  if (!goal) goal = pickGoal(lead, now);
  const draft = renderDraft(lead, goal, now);
  const text = String(p.text == null ? '' : p.text).trim() || draft.text;
  const key = dedupeKeyFor('followup', { leadId: lead.id });
  const existing = pendingWith(key);
  if (existing) return duplicate(existing);

  return [{ json: {
    __op: 'insert', __summary: summary,
    kind: kind, status: 'pending', title: 'Follow up ' + lead.name, reason: draft.reason,
    priority: 60, lead_id: lead.id, lead_name: lead.name,
    payload_json: JSON.stringify({ leadId: lead.id, goal: goal, templateId: draft.templateId, text: text, channel: 'wa', vars: draft.vars }),
    result_json: '', dedupe_key: key, run_id: runId, actor: actor,
    created_at: nowIso, decided_at: '', executed_at: ''
  } }];
}

const stage = String(p.stage == null ? '' : p.stage);
if (!STAGE_LABELS[stage]) return fail('VALIDATION_ERROR', 'Stage "' + stage + '" tidak dikenal');
const key2 = dedupeKeyFor('stage_move', { leadId: lead.id, stage: stage });
const existing2 = pendingWith(key2);
if (existing2) return duplicate(existing2);

return [{ json: {
  __op: 'insert', __summary: summary,
  kind: kind, status: 'pending',
  title: 'Pindahkan ' + lead.name + ' ke ' + STAGE_LABELS[stage],
  reason: 'Diusulkan manual dari ' + STAGE_LABELS[lead.stage] + ' ke ' + STAGE_LABELS[stage],
  priority: 60, lead_id: lead.id, lead_name: lead.name,
  payload_json: JSON.stringify({ leadId: lead.id, from: lead.stage, to: stage, note: String(p.note == null ? 'Dipindahkan atas usulan agen' : p.note) }),
  result_json: '', dedupe_key: key2, run_id: runId, actor: actor,
  created_at: nowIso, decided_at: '', executed_at: ''
} }];`,
    },
  },
});

const hasNewTask = ifElse({
  version: 2.2,
  config: {
    name: "Ada Tugas Baru?",
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "loose",
          version: 1,
        },
        conditions: [
          {
            leftValue: expr("{{ $json.__op }}"),
            operator: { type: "string", operation: "equals" },
            rightValue: "insert",
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  },
});

/* `priority` satu-satunya kolom angka di crm_ai_tasks; sisanya string. */
const taskSchema = [
  {
    id: "kind",
    displayName: "kind",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "status",
    displayName: "status",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "title",
    displayName: "title",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "reason",
    displayName: "reason",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "priority",
    displayName: "priority",
    required: false,
    defaultMatch: false,
    display: true,
    type: "number",
    canBeUsedToMatch: true,
  },
  {
    id: "lead_id",
    displayName: "lead_id",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "lead_name",
    displayName: "lead_name",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "payload_json",
    displayName: "payload_json",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "result_json",
    displayName: "result_json",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "dedupe_key",
    displayName: "dedupe_key",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "run_id",
    displayName: "run_id",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "actor",
    displayName: "actor",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "created_at",
    displayName: "created_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "decided_at",
    displayName: "decided_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "executed_at",
    displayName: "executed_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
];

const insertTasks = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Insert AI Tasks",
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: T_TASKS },
      columns: {
        mappingMode: "defineBelow",
        value: {
          kind: expr("{{ $json.kind }}"),
          status: expr("{{ $json.status }}"),
          title: expr("{{ $json.title }}"),
          reason: expr("{{ $json.reason }}"),
          priority: expr("{{ $json.priority }}"),
          lead_id: expr("{{ $json.lead_id }}"),
          lead_name: expr("{{ $json.lead_name }}"),
          payload_json: expr("{{ $json.payload_json }}"),
          result_json: expr("{{ $json.result_json }}"),
          dedupe_key: expr("{{ $json.dedupe_key }}"),
          run_id: expr("{{ $json.run_id }}"),
          actor: expr("{{ $json.actor }}"),
          created_at: expr("{{ $json.created_at }}"),
          decided_at: expr("{{ $json.decided_at }}"),
          executed_at: expr("{{ $json.executed_at }}"),
        },
        schema: taskSchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

const shapeTaskInsert = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Shape Task Insert",
    parameters: {
      jsCode: `${HELPERS}
// Node insert hanya mengembalikan {id, createdAt, updatedAt}, jadi id-nya
// dipasangkan kembali ke baris yang direncanakan berdasarkan urutan —
// trik yang sama dipakai CRM Lead Intake.
let planned = [];
let source = '';
try { planned = $('Plan Tasks Generate').all().map((i) => i.json); source = 'generate'; } catch (e) { planned = []; }
if (!planned.length) {
  try { planned = $('Plan Task Create').all().map((i) => i.json); source = 'create'; } catch (e) { planned = []; }
}

const first = planned[0] || {};
if (first.__op === 'duplicate') return [{ json: { data: first.data } }];

const summary = first.__summary || {};
const toInsert = planned.filter(function (r) { return r.__op === 'insert'; });

let inserted = [];
try { inserted = $('Insert AI Tasks').all().map((i) => i.json).filter(function (r) { return r && r.id !== undefined; }); } catch (e) { inserted = []; }

const items = inserted.map(function (row, idx) {
  return mapTask(Object.assign({}, toInsert[idx] || {}, { id: row.id }));
});

if (source === 'create') {
  return [{ json: { data: { task: items[0] || null, duplicate: false } } }];
}

return [{ json: { data: {
  runId: summary.runId || '',
  scanned: summary.scanned || {},
  created: items.length,
  skipped: (summary.skipped || []).length,
  items: items,
  skippedReasons: summary.skipped || []
} } }];`,
    },
  },
});

/* ── Cabang tulis: keputusan ──────────────────────────────────────────────── */

const planDecide = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Plan Task Decide",
    parameters: {
      jsCode: `${HELPERS}
const p = $json.payload || {};
const all = loadAll();
const now = Date.now();
const nowIso = new Date().toISOString();

const id = String(p.id == null ? '' : p.id);
const task = all.tasks.filter(function (t) { return t.id === id; })[0];
if (!task) return fail('NOT_FOUND', 'Tugas tidak ditemukan');

const decision = String(p.decision == null ? '' : p.decision);
if (decision !== 'approve' && decision !== 'reject') return fail('VALIDATION_ERROR', 'decision harus "approve" atau "reject"');
if (task.status !== 'pending') return fail('VALIDATION_ERROR', 'Tugas sudah diputuskan');

const actor = String(p.actor == null ? 'Operator' : p.actor) || 'Operator';
const overrides = (p.overrides && typeof p.overrides === 'object') ? p.overrides : {};
const base = { __ok: true, taskId: task.id, kind: task.kind, actor: actor, decidedAt: nowIso, task: task };

if (decision === 'reject') {
  return [{ json: Object.assign({}, base, { __effect: 'none', status: 'rejected', result: { kind: task.kind, rejected: true } }) }];
}

if (task.kind === 'followup') {
  const text = String(overrides.text != null ? overrides.text : (task.payload.text || '')).trim();
  if (!text) return fail('VALIDATION_ERROR', 'Teks pesan tidak boleh kosong');
  const lead = all.leads.filter(function (l) { return l.id === String(task.payload.leadId); })[0];
  if (!lead) return fail('NOT_FOUND', 'Lead tidak ditemukan atau sudah dihapus');

  const flat = text.replace(/\\s+/g, ' ').trim();
  const prefix = 'Follow-up WA (draft agen AI, disetujui ' + actor + '): ';
  const room = 400 - prefix.length;
  return [{ json: Object.assign({}, base, {
    __effect: 'lead_patch', status: 'approved',
    lead_id: lead.id, lead_stage: lead.stage,
    activity_type: 'wa',
    activity_content: prefix + (flat.length > room ? flat.slice(0, room - 1) + '…' : flat),
    text: text, waUrl: waLink(lead.phone, text),
    lead: lead, from: lead.stage, to: lead.stage, nowIso: nowIso
  }) }];
}

if (task.kind === 'stage_move') {
  const to = String(overrides.stage || task.payload.to || '');
  if (!STAGE_LABELS[to]) return fail('VALIDATION_ERROR', 'Stage "' + to + '" tidak dikenal');
  const lead = all.leads.filter(function (l) { return l.id === String(task.payload.leadId); })[0];
  if (!lead) return fail('NOT_FOUND', 'Lead tidak ditemukan atau sudah dihapus');
  const note = String(task.payload.note || 'Dipindahkan atas usulan agen');
  return [{ json: Object.assign({}, base, {
    __effect: 'lead_patch', status: 'approved',
    lead_id: lead.id, lead_stage: to,
    activity_type: 'stage_change',
    activity_content: STAGE_LABELS[lead.stage] + ' -> ' + STAGE_LABELS[to] + (note ? ' - ' + note : ''),
    lead: lead, from: lead.stage, to: to, nowIso: nowIso
  }) }];
}

const ids = Array.isArray(overrides.prospectIds) ? overrides.prospectIds.map(String)
  : (Array.isArray(task.payload.prospectIds) ? task.payload.prospectIds.map(String) : []);
const rows = [];
for (let i = 0; i < ids.length; i++) {
  const row = all.prospects.filter(function (r) { return r.id === ids[i]; })[0];
  if (row && row.status !== 'converted') rows.push(row);
}
if (!rows.length) return fail('VALIDATION_ERROR', 'Tidak ada prospek yang bisa dimasukkan');

return [{ json: Object.assign({}, base, {
  __effect: 'intake', status: 'approved',
  prospectIds: ids,
  items: rows.map(function (r) { return toCandidate(r, now, '', 0, []).leadDraft; }),
  rows: rows, nowIso: nowIso
}) }];`,
    },
  },
});

const decideValid = ifElse({
  version: 2.2,
  config: {
    name: "Decide Valid?",
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: "",
          typeValidation: "loose",
          version: 1,
        },
        conditions: [
          {
            leftValue: expr("{{ $json.__ok }}"),
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
  },
});

const routeEffect = switchCase({
  version: 3.4,
  config: {
    name: "Route Effect",
    parameters: {
      rules: {
        values: [
          {
            outputKey: "none",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.__effect }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "none",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "lead_patch",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.__effect }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "lead_patch",
                },
              ],
              combinator: "and",
            },
          },
          {
            outputKey: "intake",
            renameOutput: true,
            conditions: {
              options: ACTION_RULE_OPTIONS,
              conditions: [
                {
                  leftValue: expr("{{ $json.__effect }}"),
                  operator: { type: "string", operation: "equals" },
                  rightValue: "intake",
                },
              ],
              combinator: "and",
            },
          },
        ],
      },
      options: { fallbackOutput: "none" },
    },
  },
});

const buildIntakeItems = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Build Intake Items",
    parameters: {
      jsCode: `// Sengaja TIDAK mengirim \`type\`: dengan begitu klasifikator B2B/B2C milik
// CRM Lead Intake benar-benar berjalan dan alasannya bisa ditunjukkan.
const items = $json.items || [];
return items.map(function (it) { return { json: it }; });`,
    },
  },
});

const callIntake = node({
  type: "n8n-nodes-base.executeWorkflow",
  version: 1.3,
  config: {
    name: "Call Lead Intake",
    parameters: {
      mode: "once",
      workflowId: { __rl: true, mode: "id", value: WF_INTAKE },
      workflowInputs: {
        mappingMode: "defineBelow",
        value: {},
        matchingColumns: [],
        schema: [],
        attemptToConvertTypes: false,
        convertFieldsToString: true,
      },
      options: { waitForSubWorkflow: true },
    },
  },
});

const planProspectUpdates = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Plan Prospect Updates",
    parameters: {
      jsCode: `${HELPERS}
const plan = $('Plan Task Decide').first().json;
const rows = plan.rows || [];
const nowIso = plan.nowIso || new Date().toISOString();

let intake = {};
try { intake = $('Call Lead Intake').first().json || {}; } catch (e) { intake = {}; }
const leads = intake.leads || [];

const byPhone = {};
for (let i = 0; i < leads.length; i++) byPhone[normalizePhone(leads[i].phone)] = leads[i];

const updates = [];
for (let j = 0; j < rows.length; j++) {
  const lead = byPhone[normalizePhone(rows[j].phone)];
  if (!lead) continue;
  updates.push({ id: Number(rows[j].id), status: 'converted', converted_lead_id: String(lead.id), converted_at: nowIso });
}

// Rantai tidak boleh putus kalau tidak ada yang dikonversi: node update
// berikutnya tetap butuh minimal satu item.
if (!updates.length) return [{ json: { id: -1, status: 'new', converted_lead_id: '', converted_at: '', __noop: true } }];
return updates.map(function (u) { return { json: u }; });`,
    },
  },
});

const prospectUpdateSchema = [
  {
    id: "status",
    displayName: "status",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "converted_lead_id",
    displayName: "converted_lead_id",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "converted_at",
    displayName: "converted_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
];

const updateProspects = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Update Prospects",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_PROSPECTS },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "id", condition: "eq", keyValue: expr("{{ $json.id }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          status: expr("{{ $json.status }}"),
          converted_lead_id: expr("{{ $json.converted_lead_id }}"),
          converted_at: expr("{{ $json.converted_at }}"),
        },
        schema: prospectUpdateSchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

const leadPatchSchema = [
  {
    id: "stage",
    displayName: "stage",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "last_activity_at",
    displayName: "last_activity_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "is_stale",
    displayName: "is_stale",
    required: false,
    defaultMatch: false,
    display: true,
    type: "boolean",
    canBeUsedToMatch: true,
  },
  {
    id: "updated_at",
    displayName: "updated_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
];

const updateLead = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Update Lead",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_LEADS },
      matchType: "allConditions",
      filters: {
        conditions: [
          {
            keyName: "id",
            condition: "eq",
            keyValue: expr("{{ $json.lead_id }}"),
          },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          stage: expr("{{ $json.lead_stage }}"),
          last_activity_at: expr("{{ $json.nowIso }}"),
          is_stale: expr("{{ false }}"),
          updated_at: expr("{{ $json.nowIso }}"),
        },
        schema: leadPatchSchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

const activitySchema = [
  {
    id: "lead_id",
    displayName: "lead_id",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "type",
    displayName: "type",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "content",
    displayName: "content",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "actor",
    displayName: "actor",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "created_at",
    displayName: "created_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
];

const insertActivity = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Insert AI Activity",
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: T_ACTIVITIES },
      columns: {
        mappingMode: "defineBelow",
        value: {
          lead_id: expr("{{ $('Plan Task Decide').first().json.lead_id }}"),
          type: expr("{{ $('Plan Task Decide').first().json.activity_type }}"),
          content: expr(
            "{{ $('Plan Task Decide').first().json.activity_content }}",
          ),
          // Actor selalu dikirim eksplisit, tidak mengandalkan default node,
          // supaya timeline tidak menampilkan nilai yang tidak konsisten.
          actor: expr("{{ $('Plan Task Decide').first().json.actor }}"),
          created_at: expr("{{ $('Plan Task Decide').first().json.nowIso }}"),
        },
        schema: activitySchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

const buildTaskPatch = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Build Task Patch",
    parameters: {
      jsCode: `${HELPERS}
const plan = $('Plan Task Decide').first().json;
const nowIso = plan.nowIso || new Date().toISOString();
let result = plan.result || null;

if (plan.__effect === 'lead_patch') {
  let activity = null;
  try {
    const row = $('Insert AI Activity').first().json;
    if (row && row.id !== undefined) {
      activity = { id: String(row.id), lead_id: String(plan.lead_id), type: plan.activity_type, content: plan.activity_content, actor: plan.actor, created_at: nowIso };
    }
  } catch (e) { activity = null; }

  const lead = Object.assign({}, plan.lead, { stage: plan.lead_stage, is_stale: false, last_activity_at: nowIso, updated_at: nowIso });

  result = plan.kind === 'followup'
    ? { kind: 'followup', activity: activity, lead: lead, waUrl: plan.waUrl, text: plan.text }
    : { kind: 'stage_move', lead: lead, activity: activity, from: plan.from, to: plan.to };
}

if (plan.__effect === 'intake') {
  let intake = {};
  try { intake = $('Call Lead Intake').first().json || {}; } catch (e) { intake = {}; }
  const invalidItems = Array.isArray(intake.invalid) ? intake.invalid : [];
  let converted = 0;
  try {
    converted = $('Plan Prospect Updates').all().map((i) => i.json).filter(function (r) { return !r.__noop; }).length;
  } catch (e) { converted = 0; }

  result = {
    kind: 'prospect_batch',
    created: Number(intake.created || 0),
    duplicates: Number(intake.duplicates || 0),
    // Gateway lama mengirim \`invalid\` sebagai array padahal kontraknya angka,
    // jadi selalu terbaca 0. Di sini angkanya dan daftarnya dipisah.
    invalid: invalidItems.length,
    invalidItems: invalidItems,
    leads: intake.leads || [],
    duplicateLeads: intake.duplicateLeads || [],
    categorizations: intake.categorizations || [],
    assignments: intake.assignments || [],
    prospectIds: plan.prospectIds || [],
    convertedProspects: converted
  };

  if (!result.created && !result.duplicates) {
    return [{ json: { id: Number(plan.taskId), status: 'failed', result_json: JSON.stringify({ kind: 'prospect_batch', error: { code: 'INTERNAL_ERROR', message: 'Intake tidak membuat lead apa pun' } }), decided_at: nowIso, executed_at: '', actor: plan.actor } }];
  }
}

return [{ json: {
  id: Number(plan.taskId),
  status: plan.status,
  result_json: JSON.stringify(result || {}),
  decided_at: nowIso,
  executed_at: plan.status === 'approved' ? nowIso : '',
  actor: plan.actor
} }];`,
    },
  },
});

const taskPatchSchema = [
  {
    id: "status",
    displayName: "status",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "result_json",
    displayName: "result_json",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "decided_at",
    displayName: "decided_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "executed_at",
    displayName: "executed_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "actor",
    displayName: "actor",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
];

const updateTask = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Update AI Task",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_TASKS },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "id", condition: "eq", keyValue: expr("{{ $json.id }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          status: expr("{{ $json.status }}"),
          result_json: expr("{{ $json.result_json }}"),
          decided_at: expr("{{ $json.decided_at }}"),
          executed_at: expr("{{ $json.executed_at }}"),
          actor: expr("{{ $json.actor }}"),
        },
        schema: taskPatchSchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

const shapeDecide = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Shape Decide Result",
    parameters: {
      jsCode: `${HELPERS}
const plan = $('Plan Task Decide').first().json;
const patch = $('Build Task Patch').first().json;
const result = patch.result_json ? JSON.parse(patch.result_json) : null;

const task = Object.assign({}, plan.task, {
  status: patch.status,
  result: result,
  actor: patch.actor,
  decidedAt: patch.decided_at,
  executedAt: patch.executed_at
});

return [{ json: { data: { task: task, result: result } } }];`,
    },
  },
});

const formatResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Format Response",
    parameters: {
      jsCode: `// Salinan "Format Response" milik CRM API Gateway. Satu-satunya perubahan
// adalah nama node auth yang dirujuk — kalau baris itu terlewat, requestId
// diam-diam berubah jadi id eksekusi dan tidak ada yang error.
const STATUS = { UNAUTHORIZED: 401, UNKNOWN_ACTION: 400, VALIDATION_ERROR: 400, NOT_FOUND: 404, INTERNAL_ERROR: 500 };

let requestId = String($execution.id);
try {
  const auth = $('Auth & Parse AI').first().json;
  if (auth && auth.requestId) requestId = String(auth.requestId);
} catch (e) {
  requestId = String($execution.id);
}

const meta = { requestId: requestId, ts: new Date().toISOString() };
const item = $input.first().json || {};

if (item.error) {
  const code = item.error.code || 'INTERNAL_ERROR';
  return [{
    json: {
      statusCode: STATUS[code] || 500,
      body: { ok: false, error: { code: code, message: item.error.message || '' }, meta: meta }
    }
  }];
}

return [{
  json: {
    statusCode: 200,
    body: { ok: true, data: item.data === undefined ? {} : item.data, meta: meta }
  }
}];`,
    },
  },
});

const respond = node({
  type: "n8n-nodes-base.respondToWebhook",
  version: 1.5,
  config: {
    name: "Respond to Dashboard",
    parameters: {
      respondWith: "json",
      responseBody: expr("{{ JSON.stringify($json.body) }}"),
      options: {
        responseCode: expr("{{ $json.statusCode }}"),
        responseHeaders: {
          entries: [{ name: "Access-Control-Allow-Origin", value: "*" }],
        },
      },
    },
  },
});

const noteAuth = sticky(
  "## Gateway kedua, sengaja terpisah\nAuth dan envelope adalah salinan persis CRM API Gateway — ubah keduanya atau jangan sama sekali. Kunci API sama (crm_config.api_key), URL beda.\n\nDipisah supaya bug di sini tidak menjatuhkan papan kanban.",
  [],
  { color: 4 },
);

const noteRules = sticky(
  "## Aturan hanya hidup di sini\nSeluruh skoring, template pesan, dan heuristik usulan ada satu-satunya di workflow ini — dashboard tidak lagi punya salinannya (`lib/ai-rules.ts` sudah dihapus dari frontend). Tidak ada file lain yang perlu disinkronkan lagi.\n\nTidak ada LLM di workflow ini. Semuanya deterministik.",
  [],
  { color: 3 },
);

const noteWrites = sticky(
  "## Batas tulis\nWorkflow ini memiliki `crm_prospects` dan `crm_ai_tasks`.\n\nLead baru **hanya** dibuat lewat CRM Lead Intake (dedupe, kategorisasi, round-robin sudah matang di sana). `crm_leads` cuma boleh ditambal pada stage, last_activity_at, is_stale, updated_at.",
  [],
  { color: 5 },
);

export default workflow("crm-ai-gateway", "CRM AI Gateway")
  .add(webhookTrigger)
  .to(loadConfig)
  .to(authParse)
  .to(
    requestValid
      .onTrue(
        loadLeads.to(
          loadActivities.to(
            loadProspects.to(
              loadTasks.to(
                prepareRouting.to(
                  routeAction
                    .onCase(0, actionBootstrap.to(formatResponse))
                    .onCase(1, actionSearch.to(formatResponse))
                    .onCase(2, actionDraft.to(formatResponse))
                    .onCase(3, actionList.to(formatResponse))
                    .onCase(
                      4,
                      planGenerate.to(
                        hasNewTask
                          .onTrue(insertTasks.to(shapeTaskInsert))
                          .onFalse(shapeTaskInsert),
                      ),
                    )
                    .onCase(
                      5,
                      planCreate.to(
                        hasNewTask
                          .onTrue(insertTasks.to(shapeTaskInsert))
                          .onFalse(shapeTaskInsert),
                      ),
                    )
                    .onCase(
                      6,
                      planDecide.to(
                        decideValid
                          .onTrue(
                            routeEffect
                              .onCase(0, buildTaskPatch)
                              .onCase(
                                1,
                                updateLead.to(
                                  insertActivity.to(buildTaskPatch),
                                ),
                              )
                              .onCase(
                                2,
                                buildIntakeItems.to(
                                  callIntake.to(
                                    planProspectUpdates.to(
                                      updateProspects.to(buildTaskPatch),
                                    ),
                                  ),
                                ),
                              ),
                          )
                          .onFalse(formatResponse),
                      ),
                    )
                    .onCase(7, unknownAction.to(formatResponse)),
                ),
              ),
            ),
          ),
        ),
      )
      .onFalse(formatResponse),
  )
  .add(shapeTaskInsert)
  .to(formatResponse)
  .add(buildTaskPatch)
  .to(updateTask)
  .to(shapeDecide)
  .to(formatResponse)
  .add(formatResponse)
  .to(respond)
  .add(noteAuth)
  .add(noteRules)
  .add(noteWrites);
