import { expr, ifElse, node, sticky, trigger, workflow } from "@n8n/workflow-sdk";

const T_LEADS = "048bYoe3wwNXPwmS";
const T_ACTIVITIES = "hoviNVBkQPJcv3yi";
const T_SALES = "sIZNvfyMzaUA9VFD";
const T_PROSPECTS = "Bt4eJ0TOkiIhH8c9";
const T_TASKS = "yf9VcYN1Ym5bV9BL";
const T_CONFIG = "GlW1ROM8sSfdO7LA";
/* Diisi dari Task 1: tiga tabel seed hasil tangkapan keadaan live. */
const T_SEED_SALES = "pNZch0ctkbvwHpfx";
const T_SEED_LEADS = "ZbQo7aPlufhcRdHC";
const T_SEED_ACTIVITIES = "1vQzBx0do5a3pjTw";

/* ── Preamble ─────────────────────────────────────────────────────────────── */

const webhookTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Reset Webhook",
    parameters: {
      httpMethod: "POST",
      path: "simple-crm-demo-reset",
      responseMode: "responseNode",
      options: { allowedOrigins: "*" },
    },
  },
});

/* Satu-satunya sentuhan ke crm_config di workflow ini, dan hanya baca:
   kunci API yang dipakai ketiga gateway tinggal di sana. Tidak ada node lain
   yang boleh menunjuk T_CONFIG. */
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
    name: "Auth & Parse Reset",
    parameters: {
      jsCode: `// Salinan persis "Auth & Parse" milik CRM API Gateway, hanya daftar
// ACTIONS-nya yang berbeda. Kunci API-nya pun sama — satu kunci, tiga URL.
const req = $('Reset Webhook').first().json;
const headers = req.headers || {};
const body = (req.body && typeof req.body === 'object') ? req.body : {};
const requestId = String($execution.id);

const ACTIONS = ['demo.reset'];

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

/* ── Pembaca seed ─────────────────────────────────────────────────────────── */

/* `executeOnce: true` wajib di ketiganya. Node dataTable berjalan sekali per
   item masuk, dan karena ketiga pembaca dirantai seri, tanpa ini tiap tabel
   terbaca berulang: 4 sales x 10 lead x 26 activity, persis jebakan yang
   sudah pernah melahirkan 8712 baris prospek palsu di AI Gateway. */

const loadSeedSales = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Seed Sales",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_SEED_SALES },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const loadSeedLeads = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Seed Leads",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_SEED_LEADS },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const loadSeedActivities = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Load Seed Activities",
    parameters: {
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: T_SEED_ACTIVITIES },
      returnAll: true,
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

/* ── Penjaga dan perencana ────────────────────────────────────────────────── */

const planReset = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Plan Reset",
    parameters: {
      jsCode: `
var payload = $('Auth & Parse Reset').first().json.payload || {};
if (String(payload.confirm) !== 'RESET') {
  return [{ json: { error: { code: 'VALIDATION_ERROR', message: 'confirm harus bernilai "RESET"' } } }];
}

function rowsOf(name) {
  return $(name).all().map(function (i) { return i.json; })
    .filter(function (r) { return r && r.id !== undefined; });
}

var seedSales = rowsOf('Load Seed Sales');
var seedLeads = rowsOf('Load Seed Leads');
var seedActivities = rowsOf('Load Seed Activities');

// Menghapus tanpa seed berarti demo kosong permanen. Tolak lebih dulu.
if (!seedSales.length || !seedLeads.length) {
  return [{ json: { error: { code: 'VALIDATION_ERROR', message: 'Tabel seed kosong — reset dibatalkan sebelum menghapus apa pun' } } }];
}

seedSales.sort(function (a, b) { return Number(a.seed_index) - Number(b.seed_index); });
seedLeads.sort(function (a, b) { return Number(a.seed_index) - Number(b.seed_index); });

var now = Date.now();
var iso = function (minutesAgo) {
  return new Date(now - Number(minutesAgo || 0) * 60000).toISOString();
};

return [{ json: {
  __ok: true,
  nowIso: new Date(now).toISOString(),
  sales: seedSales.map(function (s) {
    return { seed_index: Number(s.seed_index), name: s.name || '', phone: s.phone || '', active: s.active === true, lead_count: 0 };
  }),
  leads: seedLeads.map(function (l) {
    return {
      seed_index: Number(l.seed_index), owner_index: Number(l.owner_index || 0),
      name: l.name || '', type: l.type || '', phone: l.phone || '', phone_raw: l.phone_raw || '',
      address: l.address || '', source: l.source || '', stage: l.stage || 'todo',
      order_count: Number(l.order_count || 0), value_estimate: Number(l.value_estimate || 0),
      notes: l.notes || '', classify_reason: l.classify_reason || '', is_stale: l.is_stale === true,
      created_at: iso(l.created_minutes_ago), updated_at: iso(l.created_minutes_ago),
      last_activity_at: iso(l.last_activity_minutes_ago), deleted_at: ''
    };
  }),
  activities: seedActivities.map(function (a) {
    return {
      lead_index: Number(a.lead_index || 0), type: a.type || 'note',
      content: a.content || '', actor: a.actor || '', created_at: iso(a.created_minutes_ago)
    };
  })
} }];
`,
    },
  },
});

const resetValid = ifElse({
  version: 2.2,
  config: {
    name: "Reset Valid?",
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

/* ── Penghapus ────────────────────────────────────────────────────────────── */

const deleteLeads = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Delete Leads",
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "id", value: T_LEADS },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const deleteActivities = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Delete Activities",
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "id", value: T_ACTIVITIES },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const deleteSales = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Delete Sales",
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "id", value: T_SALES },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

const deleteTasks = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Delete AI Tasks",
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "id", value: T_TASKS },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

/* crm_prospects sengaja tidak dihapus: tidak ada tabel seed untuknya, dan
   menghapusnya berarti kehilangan pool prospek selamanya. Statusnya
   dikembalikan ke `new` di tempat. */
const resetProspects = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Reset Prospects",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_PROSPECTS },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "gte", keyValue: "1" }],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          status: "new",
          converted_lead_id: "",
          converted_at: "",
        },
        schema: [
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
        ],
      },
      options: {},
    },
    alwaysOutputData: true,
    executeOnce: true,
  },
});

/* ── Rantai sisip ─────────────────────────────────────────────────────────── */

const emitSeedSales = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Emit Seed Sales",
    parameters: {
      jsCode: `return $('Plan Reset').first().json.sales.map(function (s) { return { json: s }; });`,
    },
  },
});

const salesSchema = [
  {
    id: "name",
    displayName: "name",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "phone",
    displayName: "phone",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "active",
    displayName: "active",
    required: false,
    defaultMatch: false,
    display: true,
    type: "boolean",
    canBeUsedToMatch: true,
  },
  {
    id: "lead_count",
    displayName: "lead_count",
    required: false,
    defaultMatch: false,
    display: true,
    type: "number",
    canBeUsedToMatch: true,
  },
];

const insertSales = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Insert Sales",
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: T_SALES },
      columns: {
        mappingMode: "defineBelow",
        value: {
          name: expr("{{ $json.name }}"),
          phone: expr("{{ $json.phone }}"),
          active: expr("{{ $json.active }}"),
          lead_count: expr("{{ $json.lead_count }}"),
        },
        schema: salesSchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

/* Node insert hanya mengembalikan {id, createdAt, updatedAt} berurutan, jadi
   owner_index dipasangkan ke id sales baru berdasarkan posisi — trik yang
   sama dipakai Shape Task Insert di AI Gateway. */
const emitSeedLeads = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Emit Seed Leads",
    parameters: {
      jsCode: `
var plan = $('Plan Reset').first().json;
var inserted = $('Insert Sales').all().map(function (i) { return i.json; })
  .filter(function (r) { return r && r.id !== undefined; });
var idByIndex = {};
var nameByIndex = {};
for (var i = 0; i < plan.sales.length; i++) {
  if (inserted[i]) {
    idByIndex[plan.sales[i].seed_index] = String(inserted[i].id);
    nameByIndex[plan.sales[i].seed_index] = plan.sales[i].name;
  }
}
return plan.leads.map(function (l) {
  var copy = Object.assign({}, l);
  copy.owner_id = idByIndex[l.owner_index] || '';
  copy.owner_name = nameByIndex[l.owner_index] || '';
  delete copy.seed_index;
  delete copy.owner_index;
  return { json: copy };
});
`,
    },
  },
});

const leadSchema = [
  {
    id: "name",
    displayName: "name",
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
    id: "phone",
    displayName: "phone",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "phone_raw",
    displayName: "phone_raw",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "address",
    displayName: "address",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "source",
    displayName: "source",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
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
    id: "owner_id",
    displayName: "owner_id",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "owner_name",
    displayName: "owner_name",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "order_count",
    displayName: "order_count",
    required: false,
    defaultMatch: false,
    display: true,
    type: "number",
    canBeUsedToMatch: true,
  },
  {
    id: "value_estimate",
    displayName: "value_estimate",
    required: false,
    defaultMatch: false,
    display: true,
    type: "number",
    canBeUsedToMatch: true,
  },
  {
    id: "notes",
    displayName: "notes",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "classify_reason",
    displayName: "classify_reason",
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
    id: "last_activity_at",
    displayName: "last_activity_at",
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
    id: "updated_at",
    displayName: "updated_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
  {
    id: "deleted_at",
    displayName: "deleted_at",
    required: false,
    defaultMatch: false,
    display: true,
    type: "string",
    canBeUsedToMatch: true,
  },
];

const insertLeads = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Insert Leads",
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: T_LEADS },
      columns: {
        mappingMode: "defineBelow",
        value: {
          name: expr("{{ $json.name }}"),
          type: expr("{{ $json.type }}"),
          phone: expr("{{ $json.phone }}"),
          phone_raw: expr("{{ $json.phone_raw }}"),
          address: expr("{{ $json.address }}"),
          source: expr("{{ $json.source }}"),
          stage: expr("{{ $json.stage }}"),
          owner_id: expr("{{ $json.owner_id }}"),
          owner_name: expr("{{ $json.owner_name }}"),
          order_count: expr("{{ $json.order_count }}"),
          value_estimate: expr("{{ $json.value_estimate }}"),
          notes: expr("{{ $json.notes }}"),
          classify_reason: expr("{{ $json.classify_reason }}"),
          is_stale: expr("{{ $json.is_stale }}"),
          last_activity_at: expr("{{ $json.last_activity_at }}"),
          created_at: expr("{{ $json.created_at }}"),
          updated_at: expr("{{ $json.updated_at }}"),
          deleted_at: expr("{{ $json.deleted_at }}"),
        },
        schema: leadSchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

const emitSeedActivities = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Emit Seed Activities",
    parameters: {
      jsCode: `
var plan = $('Plan Reset').first().json;
var inserted = $('Insert Leads').all().map(function (i) { return i.json; })
  .filter(function (r) { return r && r.id !== undefined; });
var idByIndex = {};
for (var i = 0; i < plan.leads.length; i++) {
  if (inserted[i]) idByIndex[plan.leads[i].seed_index] = String(inserted[i].id);
}
return plan.activities.map(function (a) {
  var copy = Object.assign({}, a);
  copy.lead_id = idByIndex[a.lead_index] || '';
  delete copy.lead_index;
  return { json: copy };
});
`,
    },
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

const insertActivities = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Insert Activities",
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: T_ACTIVITIES },
      columns: {
        mappingMode: "defineBelow",
        value: {
          lead_id: expr("{{ $json.lead_id }}"),
          type: expr("{{ $json.type }}"),
          content: expr("{{ $json.content }}"),
          actor: expr("{{ $json.actor }}"),
          created_at: expr("{{ $json.created_at }}"),
        },
        schema: activitySchema,
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

/* ── Hitung ulang lead_count ──────────────────────────────────────────────── */

/* Sumbernya Emit Seed Leads, bukan Plan Reset: owner_id hasil pemetaan baru
   ada setelah pembentang berjalan. */
const countLeadPerSales = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Count Lead Per Sales",
    parameters: {
      jsCode: `
var plan = $('Plan Reset').first().json;
var insertedSales = $('Insert Sales').all().map(function (i) { return i.json; })
  .filter(function (r) { return r && r.id !== undefined; });
var emittedLeads = $('Emit Seed Leads').all().map(function (i) { return i.json; });

var tally = {};
for (var i = 0; i < emittedLeads.length; i++) {
  var oid = String(emittedLeads[i].owner_id || '');
  if (oid) tally[oid] = (tally[oid] || 0) + 1;
}

return insertedSales.map(function (row) {
  return { json: { id: Number(row.id), lead_count: tally[String(row.id)] || 0 } };
});
`,
    },
  },
});

const updateSalesCount = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Update Sales Count",
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: T_SALES },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "id", condition: "eq", keyValue: expr("{{ $json.id }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: { lead_count: expr("{{ $json.lead_count }}") },
        schema: [
          {
            id: "lead_count",
            displayName: "lead_count",
            required: false,
            defaultMatch: false,
            display: true,
            type: "number",
            canBeUsedToMatch: true,
          },
        ],
      },
      options: {},
    },
    alwaysOutputData: true,
  },
});

/* ── Balasan ──────────────────────────────────────────────────────────────── */

/* deleted.prospects selalu 0 karena prospek di-update, bukan dihapus; jumlah
   yang dikembalikan ke `new` muncul di inserted.prospects. */
const shapeResetResult = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Shape Reset Result",
    parameters: {
      jsCode: `
function countOf(name) {
  try {
    return $(name).all().map(function (i) { return i.json; })
      .filter(function (r) { return r && r.id !== undefined; }).length;
  } catch (e) { return 0; }
}
var plan = $('Plan Reset').first().json;
return [{ json: { data: {
  seededAt: plan.nowIso,
  deleted: {
    leads: countOf('Delete Leads'), activities: countOf('Delete Activities'),
    sales: countOf('Delete Sales'), prospects: 0, aiTasks: countOf('Delete AI Tasks')
  },
  inserted: {
    leads: countOf('Insert Leads'), activities: countOf('Insert Activities'),
    sales: countOf('Insert Sales'), prospects: countOf('Reset Prospects')
  }
} } }];
`,
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
  const auth = $('Auth & Parse Reset').first().json;
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

const noteWrites = sticky(
  "## Batas tulis\nWorkflow ini menghapus seluruh isi `crm_leads`, `crm_activities`, `crm_sales`, dan `crm_ai_tasks`, lalu menyisipkan ulang dari `crm_seed_sales`, `crm_seed_leads`, `crm_seed_activities`.\n\n`crm_prospects` **tidak** dihapus — statusnya dikembalikan ke `new` di tempat, karena tidak ada tabel seed untuknya.\n\n`crm_config` tidak pernah disentuh selain dibaca untuk auth. Di sanalah kunci API ketiga gateway tinggal; menghapusnya mematikan seluruh dashboard.\n\nUrutannya mengikat: seed dibaca dan divalidasi sebelum penghapusan pertama. Reset yang menghapus dulu lalu menemukan seed kosong meninggalkan demo kosong permanen.",
  [],
  { color: 3 },
);

export default workflow("crm-demo-reset", "CRM Demo Reset")
  .add(webhookTrigger)
  .to(loadConfig)
  .to(authParse)
  .to(
    requestValid
      .onTrue(
        loadSeedSales.to(
          loadSeedLeads.to(
            loadSeedActivities.to(
              planReset.to(
                resetValid
                  .onTrue(
                    deleteLeads.to(
                      deleteActivities.to(
                        deleteSales.to(
                          deleteTasks.to(
                            resetProspects.to(
                              emitSeedSales.to(
                                insertSales.to(
                                  emitSeedLeads.to(
                                    insertLeads.to(
                                      emitSeedActivities.to(
                                        insertActivities.to(
                                          countLeadPerSales.to(
                                            updateSalesCount.to(
                                              shapeResetResult,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                  .onFalse(formatResponse),
              ),
            ),
          ),
        ),
      )
      .onFalse(formatResponse),
  )
  .add(shapeResetResult)
  .to(formatResponse)
  .add(formatResponse)
  .to(respond)
  .add(noteWrites);
