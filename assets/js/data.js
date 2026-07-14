const KNOWN_FIELDS = [
  'Period Start', 'Period End', 'Platform', 'Campaign ID', 'Campaign',
  'Planned Budget', 'Planned Leads', 'Target CPL', 'Target CTR', 'Target CVR',
  'Target ROAS', 'Owner', 'Status', 'Notes', 'Lead Date', 'Lead ID',
  'Ad Group / Asset Group', 'Source / Medium', 'Lead Status', 'Qualified?',
  'Revenue', 'Country', 'Date', 'Currency', 'Campaign Status', 'Campaign Type',
  'Campaign Subtype', 'Daily Budget', 'Impressions', 'Clicks', 'CTR', 'Cost',
  'Average CPC', 'Average CPM', 'Conversions', 'Conversion Value',
  'Cost per Conversion', 'Conversion Rate', 'ROAS', 'All Conversions',
  'Search Impression Share', 'Search Top Impression Share',
  'Search Absolute Top Impression Share', 'Search Lost IS Budget',
  'Search Lost IS Rank', 'Data Updated At', 'Ad Group ID', 'Ad Group',
  'Ad Group Status', 'Ad Group Type', 'Ad ID', 'Ad Name', 'Ad Type',
  'Ad Status', 'Final URL', 'Conversion Action ID', 'Conversion Action',
  'Conversion Category', 'External Conversion Source', 'All Conversion Value',
  'Asset Group ID', 'Asset Group', 'Asset Group Status', 'Ad Strength',
  'Device', 'Ad Network Type', 'Ad Subnetwork Type', 'TrueView Views',
  'View Rate', '25% View Rate', '50% View Rate', '75% View Rate',
  '100% View Rate', 'Watch Time Millis'
].sort((a, b) => b.length - a.length);

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalLabel(label, id) {
  const raw = String(label || id || '').trim();
  const normalized = normalizeText(raw);
  const matched = KNOWN_FIELDS.find(field => normalized.endsWith(normalizeText(field)));
  return matched || raw || id;
}

function parseGoogleDate(value, formatted) {
  if (typeof value === 'string') {
    const match = value.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) + 1;
      const day = Number(match[3]);
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  if (formatted && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  return value ?? formatted ?? null;
}

function tableToRecords(table) {
  const columns = (table?.cols || []).map(col => ({
    key: canonicalLabel(col.label, col.id),
    type: col.type,
    id: col.id
  }));

  return (table?.rows || []).map(row => {
    const record = {};
    columns.forEach((column, index) => {
      const cell = row.c?.[index];
      if (!cell) {
        record[column.key] = null;
        return;
      }
      record[column.key] = column.type === 'date'
        ? parseGoogleDate(cell.v, cell.f)
        : (cell.v ?? cell.f ?? null);
    });
    return record;
  }).filter(record => Object.values(record).some(value => value !== null && value !== ''));
}

function buildUrl(spreadsheetId, dataset, callbackName, cacheKey) {
  const params = new URLSearchParams({
    sheet: dataset.sheet,
    tq: dataset.query || 'select *',
    tqx: `out:json;responseHandler:${callbackName}`,
    _: cacheKey
  });
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?${params}`;
}

function loadDataset(spreadsheetId, key, dataset, cacheKey) {
  return new Promise((resolve, reject) => {
    const callbackName = `__gadsReport_${key}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${dataset.sheet}: quá thời gian phản hồi`));
    }, 45000);

    window[callbackName] = response => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();

      if (!response || response.status !== 'ok') {
        const detail = response?.errors?.map(item => item.detailed_message || item.message).join('; ');
        reject(new Error(`${dataset.sheet}: ${detail || 'Google Sheets trả lỗi'}`));
        return;
      }

      const rows = tableToRecords(response.table);
      resolve({ key, dataset, rows, columns: response.table?.cols || [] });
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error(`${dataset.sheet}: không thể tải. Hãy kiểm tra quyền “Bất kỳ ai có đường liên kết — Người xem”.`));
    };

    script.src = buildUrl(spreadsheetId, dataset, callbackName, cacheKey);
    script.async = true;
    document.head.appendChild(script);
  });
}

async function runPool(tasks, concurrency = 4) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

export async function loadReportData(config, forceRefresh = false) {
  const entries = Object.entries(config.datasets);
  const cacheKey = forceRefresh ? `${Date.now()}` : `${Math.floor(Date.now() / 300000)}`;
  const tasks = entries.map(([key, dataset]) => () =>
    loadDataset(config.spreadsheetId, key, dataset, cacheKey)
  );

  const settled = await runPool(tasks, 4);
  const data = {};
  const sources = {};
  const errors = [];

  settled.forEach((result, index) => {
    const [key, dataset] = entries[index];
    if (result.status === 'fulfilled') {
      data[key] = result.value.rows;
      sources[key] = {
        key,
        label: dataset.label,
        sheet: dataset.sheet,
        ok: true,
        rows: result.value.rows.length
      };
    } else {
      data[key] = [];
      const message = result.reason?.message || String(result.reason);
      sources[key] = {
        key,
        label: dataset.label,
        sheet: dataset.sheet,
        ok: false,
        rows: 0,
        message
      };
      errors.push({ key, dataset, required: Boolean(dataset.required), message });
    }
  });

  const requiredErrors = errors.filter(error => error.required);
  if (requiredErrors.length) {
    throw new Error(requiredErrors.map(error => error.message).join(' · '));
  }

  return { data, sources, errors, loadedAt: new Date().toISOString() };
}
