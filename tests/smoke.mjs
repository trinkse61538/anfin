import fs from 'node:fs/promises';
import vm from 'node:vm';
import { analyzeReport, getDefaultRange } from '../assets/js/analysis.js';

const root = new URL('../', import.meta.url);
const configSource = await fs.readFile(new URL('assets/js/config.js', root), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(configSource, context);
const config = context.window.REPORT_CONFIG;

const fields = [
  'Period Start', 'Period End', 'Platform', 'Campaign ID', 'Campaign', 'Planned Budget',
  'Planned Leads', 'Target CPL', 'Target CTR', 'Target CVR', 'Target ROAS', 'Owner',
  'Status', 'Notes', 'Lead Date', 'Lead ID', 'Qualified?', 'Revenue', 'Date', 'Currency',
  'Campaign Status', 'Campaign Type', 'Impressions', 'Clicks', 'Cost', 'Conversions',
  'Conversion Value', 'All Conversions', 'Search Impression Share', 'Search Lost IS Budget',
  'Search Lost IS Rank', 'Ad Group ID', 'Ad Group', 'Ad Group Status', 'Asset Group ID',
  'Asset Group', 'Asset Group Status', 'Device', 'Ad Network Type', 'Ad Subnetwork Type',
  'Conversion Action', 'Conversion Category', 'All Conversion Value'
].sort((a, b) => b.length - a.length);

const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const canonical = value => fields.find(field => norm(value).endsWith(norm(field))) || value;

function cellValue(cell, type) {
  if (!cell) return null;
  if (type === 'date' && typeof cell.v === 'string') {
    const match = cell.v.match(/^Date\((\d+),(\d+),(\d+)\)$/);
    if (match) return `${match[1]}-${String(Number(match[2]) + 1).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  }
  return cell.v ?? cell.f ?? null;
}

async function loadDataset(dataset) {
  const params = new URLSearchParams({ sheet: dataset.sheet, tq: dataset.query, tqx: 'out:json;responseHandler:cb', _: String(Date.now()) });
  const url = `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/gviz/tq?${params}`;
  const text = await fetch(url).then(response => response.text());
  const payload = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf(');')));
  if (payload.status !== 'ok') throw new Error(`${dataset.sheet}: ${JSON.stringify(payload.errors)}`);
  const cols = payload.table.cols.map(col => ({ key: canonical(col.label || col.id), type: col.type }));
  return payload.table.rows.map(row => Object.fromEntries(cols.map((col, index) => [col.key, cellValue(row.c?.[index], col.type)])));
}

const data = {};
for (const [key, dataset] of Object.entries(config.datasets)) {
  try {
    data[key] = await loadDataset(dataset);
    console.log(`OK ${dataset.sheet}: ${data[key].length} rows`);
  } catch (error) {
    if (dataset.required) throw error;
    data[key] = [];
    console.warn(`OPTIONAL ${dataset.sheet}: ${error.message}`);
  }
}

const range = getDefaultRange(data.campaigns, data.plan, config.defaultLookbackDays);
const result = analyzeReport(data, range, config);

if (!Number.isFinite(result.health.score)) throw new Error('Health score is invalid');
if (!result.kpis.length) throw new Error('No KPI generated');
if (!result.recommendations.length) throw new Error('No recommendation generated');
if (!result.tables.campaigns.length) throw new Error('No campaign table generated');

const configuredData = {
  ...data,
  plan: [{
    ...data.plan[0],
    Notes: '',
    'Period Start': range.from,
    'Period End': range.to,
    'Planned Budget': 25000000,
    'Planned Leads': 100,
    'Target CPL': 250000,
    'Target CTR': 0.03,
    'Target CVR': 0.05
  }],
  leads: Array.from({ length: 12 }, (_, index) => ({
    'Lead Date': range.to,
    'Lead ID': `TEST-${index + 1}`,
    Platform: 'Google Ads',
    'Qualified?': index < 7 ? 'Yes' : 'No',
    Revenue: 0,
    Notes: ''
  }))
};
const configuredResult = analyzeReport(configuredData, range, config);
if (!configuredResult.plan.configured) throw new Error('Valid Plan was not recognized');
if (!configuredResult.leads.configured || configuredResult.leads.count !== 12) throw new Error('Actual Leads were not recognized');
if (configuredResult.setupAlerts.length) throw new Error('Setup alerts remained after Plan/Leads were configured');

console.log(JSON.stringify({
  range,
  score: result.health.score,
  level: result.health.level,
  spend: result.metrics.cost,
  conversions: result.metrics.conversions,
  campaigns: result.tables.campaigns.length,
  good: result.insights.good.length,
  watch: result.insights.watch.length,
  action: result.insights.action.length,
  topPriority: result.health.topPriority.title
}, null, 2));
