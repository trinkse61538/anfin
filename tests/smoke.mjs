import fs from 'node:fs/promises';
import vm from 'node:vm';
import { analyzeReport, getDefaultRange } from '../assets/js/analysis.js';

const root = new URL('../', import.meta.url);
const configSource = await fs.readFile(new URL('assets/js/config.js', root), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(configSource, context);
const config = context.window.REPORT_CONFIG;

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
  const cols = payload.table.cols.map(col => ({ key: col.label || col.id, type: col.type }));
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

const range = getDefaultRange(data.campaigns, config.defaultLookbackDays);
const result = analyzeReport(data, range, config);

if (!Number.isFinite(result.health.score)) throw new Error('Health score is invalid');
if (result.kpis.length !== 12) throw new Error(`Expected 12 KPI, got ${result.kpis.length}`);
if (!result.recommendations.length) throw new Error('No recommendation generated');
if (!result.campaignReviews.length) throw new Error('No campaign review generated');
if (!result.tables.adgroups.length) throw new Error('No Ad Group table generated');
if (!result.tables.ads.length) throw new Error('No Ads table generated');

console.log(JSON.stringify({
  range,
  previousRange: { from: result.period.previousFrom, to: result.period.previousTo },
  score: result.health.score,
  level: result.health.level,
  spend: result.metrics.cost,
  impressions: result.metrics.impressions,
  clicks: result.metrics.clicks,
  ctr: result.metrics.ctr,
  cpc: result.metrics.cpc,
  invalidClickRate: result.metrics.invalidClickRate,
  trend: result.trend,
  topPriority: result.health.topPriority.title,
  campaigns: result.campaignReviews.map(item => ({
    name: item.name,
    type: item.secondary,
    spend: Math.round(item.cost),
    ctr: Number(item.ctr.toFixed(4)),
    cpc: Math.round(item.cpc),
    invalidClickRate: Number(item.invalidClickRate.toFixed(4)),
    trendCtr: item.trend.ctr === null ? null : Number(item.trend.ctr.toFixed(3)),
    trendCpc: item.trend.cpc === null ? null : Number(item.trend.cpc.toFixed(3)),
    score: item.assessment.score,
    status: item.assessment.label,
    action: item.assessment.action
  }))
}, null, 2));
