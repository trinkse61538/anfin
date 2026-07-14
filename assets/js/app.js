import { loadReportData } from './data.js';
import { analyzeReport, getDataBounds, getDefaultRange } from './analysis.js';

const config = window.REPORT_CONFIG;
const state = {
  bundle: null,
  analysis: null,
  activeTable: 'campaigns',
  search: ''
};

const el = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatInteger(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
}

function formatCurrency(value, compact = false) {
  if (value === null || value === undefined) return '—';
  const options = compact && Math.abs(value) >= 1000000
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { maximumFractionDigits: 0 };
  return `${new Intl.NumberFormat('vi-VN', options).format(value)} ${config.currency}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value);
}

function formatMultiple(value) {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
}

function formatDate(key) {
  if (!key) return '—';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function formatKpi(kpi) {
  if (kpi.value === null || kpi.value === undefined) return '—';
  if (kpi.format === 'currency') return formatCurrency(kpi.value, true);
  if (kpi.format === 'percent') return formatPercent(kpi.value);
  if (kpi.format === 'multiple') return formatMultiple(kpi.value);
  if (kpi.format === 'decimal') return formatDecimal(kpi.value);
  return formatInteger(kpi.value);
}

function levelLabel(level) {
  return ({ good: 'Đang tốt', watch: 'Cần theo dõi', action: 'Cần hành động', neutral: 'Tham chiếu' })[level] || 'Tham chiếu';
}

function setConnection(level, text) {
  const node = el('connection-pill');
  node.className = `status-pill status-${level}`;
  node.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
}

function setLoading(isLoading) {
  el('loading-state').classList.toggle('hidden', !isLoading);
  el('refresh-data').disabled = isLoading;
  el('apply-filter').disabled = isLoading;
  if (isLoading) setConnection('loading', 'Đang kết nối dữ liệu');
}

function showError(message) {
  el('loading-state').classList.add('hidden');
  el('report-content').classList.add('hidden');
  el('error-state').classList.remove('hidden');
  el('error-message').textContent = message;
  setConnection('error', 'Lỗi kết nối Sheet');
}

function renderSetupAlerts(alerts) {
  const container = el('setup-alerts');
  container.innerHTML = alerts.map(alert => `
    <article class="setup-alert ${escapeHtml(alert.level)}">
      <span class="setup-alert-icon">!</span>
      <div><strong>${escapeHtml(alert.title)}</strong><p>${escapeHtml(alert.text)}</p></div>
    </article>
  `).join('');
}

function renderExecutive(analysis) {
  const { health } = analysis;
  const ring = el('score-ring');
  ring.style.setProperty('--score', health.score);
  ring.style.setProperty('--score-color', health.level === 'good' ? 'var(--green)' : health.level === 'watch' ? 'var(--amber)' : 'var(--red)');
  el('health-score').textContent = health.score;
  el('health-badge').className = `level-badge level-${health.level}`;
  el('health-badge').textContent = levelLabel(health.level);
  el('health-title').textContent = health.title;
  el('health-summary').textContent = health.summary;
  el('signal-counts').innerHTML = `
    <span><b>${analysis.insights.good.length}</b> tín hiệu tốt</span>
    <span><b>${analysis.insights.watch.length}</b> cần theo dõi</span>
    <span><b>${analysis.insights.action.length}</b> cần hành động</span>
  `;

  const priority = health.topPriority;
  el('top-priority-level').className = `level-badge level-${priority.level}`;
  el('top-priority-level').textContent = levelLabel(priority.level);
  el('top-priority-title').textContent = priority.title;
  el('top-priority-why').textContent = `${priority.evidence} ${priority.why}`;
  el('top-priority-action').textContent = priority.action;
}

function renderKpis(kpis) {
  el('kpi-grid').innerHTML = kpis.map(kpi => `
    <article class="kpi-card">
      <div class="kpi-top">
        <span class="kpi-label">${escapeHtml(kpi.label)}</span>
        <span class="mini-status level-${escapeHtml(kpi.status.level)}">${escapeHtml(kpi.status.label)}</span>
      </div>
      <strong class="kpi-value" title="${escapeHtml(formatKpi(kpi))}">${escapeHtml(formatKpi(kpi))}</strong>
      <small class="kpi-sub">${escapeHtml(kpi.sub)}</small>
    </article>
  `).join('');
}

function chartPath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function renderTrend(daily) {
  const container = el('trend-chart');
  if (!daily.length) {
    container.innerHTML = '<div class="empty-visual">Không có dữ liệu trong kỳ đã chọn.</div>';
    return;
  }

  const width = 920;
  const height = 290;
  const pad = { left: 54, right: 28, top: 18, bottom: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxCost = Math.max(...daily.map(item => item.cost), 1);
  const maxConv = Math.max(...daily.map(item => item.conversions), 1);
  const xAt = index => pad.left + (daily.length === 1 ? innerW / 2 : index / (daily.length - 1) * innerW);
  const spendPoints = daily.map((item, index) => ({ x: xAt(index), y: pad.top + innerH - item.cost / maxCost * innerH }));
  const convPoints = daily.map((item, index) => ({ x: xAt(index), y: pad.top + innerH - item.conversions / maxConv * innerH }));
  const areaPath = `${chartPath(spendPoints)} L ${spendPoints[spendPoints.length - 1].x} ${pad.top + innerH} L ${spendPoints[0].x} ${pad.top + innerH} Z`;
  const grid = [0, .25, .5, .75, 1].map(ratio => {
    const y = pad.top + innerH - ratio * innerH;
    return `<line class="grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line><text class="axis-label" x="${pad.left - 8}" y="${y + 3}" text-anchor="end">${escapeHtml(formatCurrency(maxCost * ratio, true))}</text>`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(daily.length / 6));
  const labels = daily.map((item, index) => index % labelEvery === 0 || index === daily.length - 1
    ? `<text class="axis-label" x="${xAt(index)}" y="${height - 9}" text-anchor="middle">${escapeHtml(formatDate(item.date).slice(0, 5))}</text>`
    : '').join('');
  const spendDots = spendPoints.map((point, index) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="3.5" fill="var(--blue)"><title>${escapeHtml(formatDate(daily[index].date))}: ${escapeHtml(formatCurrency(daily[index].cost))}</title></circle>`).join('');
  const convDots = convPoints.map((point, index) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="3" fill="var(--green)"><title>${escapeHtml(formatDate(daily[index].date))}: ${escapeHtml(formatDecimal(daily[index].conversions))} conversions</title></circle>`).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Xu hướng chi tiêu và conversions">
      <defs><linearGradient id="spendGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6aa7ff" stop-opacity=".28"/><stop offset="1" stop-color="#6aa7ff" stop-opacity="0"/></linearGradient></defs>
      ${grid}
      <path class="spend-area" d="${areaPath}"></path>
      <path class="spend-line" d="${chartPath(spendPoints)}"></path>
      <path class="conv-line" d="${chartPath(convPoints)}"></path>
      ${spendDots}${convDots}${labels}
    </svg>
  `;
}

function renderFunnel(analysis) {
  const { metrics, leads } = analysis;
  const stages = [
    { label: 'Impressions', value: metrics.impressions },
    { label: 'Clicks', value: metrics.clicks },
    { label: 'Ads Conv.', value: metrics.conversions }
  ];
  if (leads.configured) stages.push({ label: 'Actual Leads', value: leads.count });
  const max = Math.max(...stages.map(stage => stage.value), 1);
  el('funnel-visual').innerHTML = stages.map(stage => {
    const width = stage.value ? 5 + 95 * Math.log10(1 + stage.value) / Math.log10(1 + max) : 0;
    return `
      <div class="funnel-row">
        <span class="funnel-label">${escapeHtml(stage.label)}</span>
        <div class="funnel-track"><div class="funnel-bar" style="width:${width.toFixed(1)}%"></div></div>
        <strong class="funnel-value">${escapeHtml(formatDecimal(stage.value))}</strong>
      </div>
    `;
  }).join('');
  el('funnel-note').textContent = leads.configured
    ? 'Thanh dùng thang log để các tầng có quy mô rất khác nhau vẫn nhìn thấy được. Actual Leads lấy từ 05_Actual_Leads.'
    : 'Ads Conversions là kết quả nền tảng. Actual Leads chưa hiển thị vì 05_Actual_Leads vẫn chưa có dữ liệu thật.';
}

function renderInsightList(level, items) {
  const target = el(`${level}-insights`);
  if (!items.length) {
    target.innerHTML = '<div class="insight-empty">Chưa có nhận định ở nhóm này.</div>';
    return;
  }
  target.innerHTML = items.slice(0, 7).map(item => `
    <article class="insight-item">
      <h3>${escapeHtml(item.title)}</h3>
      <span class="insight-value">${escapeHtml(item.value)}</span>
      <p>${escapeHtml(item.why)}</p>
      <details><summary>Next step đề xuất</summary><p>${escapeHtml(item.next)}</p></details>
    </article>
  `).join('');
}

function renderRecommendations(items) {
  el('recommendations').innerHTML = items.map(item => `
    <article class="recommendation">
      <span class="recommendation-number"></span>
      <div>
        <span class="level-badge level-${escapeHtml(item.level)}">${escapeHtml(levelLabel(item.level))}</span>
        <h3>${escapeHtml(item.title)}</h3>
      </div>
      <div class="recommendation-block"><strong>Bằng chứng & lý do</strong><p>${escapeHtml(item.evidence)} ${escapeHtml(item.why)}</p></div>
      <div class="recommendation-block"><strong>Thực hiện</strong><p>${escapeHtml(item.action)}</p></div>
    </article>
  `).join('');
}

function tableStatus(assessment) {
  const level = assessment?.level || 'neutral';
  const label = assessment?.label || 'Tham chiếu';
  return `<span class="table-status level-${escapeHtml(level)}" title="${escapeHtml(assessment?.reason || '')}">${escapeHtml(label)}</span>`;
}

function renderPerformanceTable() {
  if (!state.analysis) return;
  const key = state.activeTable;
  const search = state.search.trim().toLowerCase();
  let rows = state.analysis.tables[key] || [];

  rows = rows.filter(row => {
    if (!search) return true;
    return `${row.name || ''} ${row.secondary || ''} ${row.category || ''}`.toLowerCase().includes(search);
  }).slice(0, 100);

  if (key === 'conversionActions') {
    el('performance-head').innerHTML = '<tr><th>Conversion Action</th><th>Category</th><th>Conversions</th><th>All Conv.</th><th>Value</th><th>Đánh giá</th></tr>';
    el('performance-body').innerHTML = rows.length ? rows.map(row => `
      <tr>
        <td class="entity-cell"><strong>${escapeHtml(row.name)}</strong></td>
        <td>${escapeHtml(row.category)}</td>
        <td>${escapeHtml(formatDecimal(row.conversions))}</td>
        <td>${escapeHtml(formatDecimal(row.allConversions))}</td>
        <td>${escapeHtml(formatCurrency(row.value))}</td>
        <td>${tableStatus(row.assessment)}</td>
      </tr>
    `).join('') : '<tr><td class="no-rows" colspan="6">Không có dữ liệu phù hợp.</td></tr>';
  } else {
    el('performance-head').innerHTML = '<tr><th>Nhóm</th><th>Loại / Campaign</th><th>Cost</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Conversions</th><th>CVR</th><th>CPL</th><th>Đánh giá</th></tr>';
    el('performance-body').innerHTML = rows.length ? rows.map(row => `
      <tr>
        <td class="entity-cell"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.sourceStatus || row.id)}</small></td>
        <td>${escapeHtml(row.secondary || '—')}</td>
        <td>${escapeHtml(formatCurrency(row.cost))}</td>
        <td>${escapeHtml(formatInteger(row.impressions))}</td>
        <td>${escapeHtml(formatInteger(row.clicks))}</td>
        <td>${escapeHtml(formatPercent(row.ctr))}</td>
        <td>${escapeHtml(formatDecimal(row.conversions))}</td>
        <td>${escapeHtml(formatPercent(row.cvr))}</td>
        <td>${row.conversions ? escapeHtml(formatCurrency(row.cpl)) : '—'}</td>
        <td>${tableStatus(row.assessment)}</td>
      </tr>
    `).join('') : '<tr><td class="no-rows" colspan="10">Không có dữ liệu phù hợp.</td></tr>';
  }

  el('table-note').textContent = state.analysis.tableNotes[key] || '';
}

function renderSources(bundle) {
  el('source-status').innerHTML = Object.values(bundle.sources).map(source => `
    <div class="source-item ${source.ok ? 'ok' : 'fail'}" title="${escapeHtml(source.message || source.sheet)}">
      <span>${escapeHtml(source.sheet)}</span>
      <span>${source.ok ? `${formatInteger(source.rows)} dòng` : 'Không tải được'}</span>
    </div>
  `).join('');
}

function renderMethod() {
  const t = config.thresholds;
  el('method-thresholds').innerHTML = [
    `Tối thiểu ${t.minClicksForDecision} clicks để kết luận`,
    `Tối thiểu ${t.minConversionsForCplDecision} conversions để đánh giá CPL`,
    `CPL watch > ${Math.round(t.cplWatchMultiplier * 100)}% target`,
    `Budget pacing an toàn ${Math.round(t.budgetPacingLow * 100)}–${Math.round(t.budgetPacingHigh * 100)}%`,
    `Lead mismatch cảnh báo > ${Math.round(t.leadMismatchPct * 100)}%`,
    `Lost IS Budget watch ≥ ${Math.round(t.lostBudgetShareWatch * 100)}%`
  ].map(item => `<span>${escapeHtml(item)}</span>`).join('');
}

function renderReport() {
  const from = el('date-from').value;
  const to = el('date-to').value;
  if (!from || !to || from > to) {
    window.alert('Vui lòng chọn khoảng ngày hợp lệ.');
    return;
  }

  state.analysis = analyzeReport(state.bundle.data, { from, to }, config);
  const analysis = state.analysis;
  el('period-caption').textContent = `${formatDate(from)} – ${formatDate(to)} · ${analysis.period.days} ngày`;
  el('freshness-text').textContent = `Dữ liệu Campaign mới nhất: ${formatDate(analysis.period.dataMax)}${analysis.period.daysBehind ? ` · chậm ${analysis.period.daysBehind} ngày` : ' · đúng nhịp'}`;
  renderSetupAlerts(analysis.setupAlerts);
  renderExecutive(analysis);
  renderKpis(analysis.kpis);
  renderTrend(analysis.daily);
  renderFunnel(analysis);
  renderInsightList('good', analysis.insights.good);
  renderInsightList('watch', analysis.insights.watch);
  renderInsightList('action', analysis.insights.action);
  renderRecommendations(analysis.recommendations);
  renderPerformanceTable();
  renderSources(state.bundle);
  el('report-content').classList.remove('hidden');
}

async function load(forceRefresh = false) {
  setLoading(true);
  el('error-state').classList.add('hidden');
  try {
    if (!config?.spreadsheetId) throw new Error('Chưa cấu hình spreadsheetId trong assets/js/config.js.');
    state.bundle = await loadReportData(config, forceRefresh);
    const bounds = getDataBounds(state.bundle.data.campaigns || []);
    if (!bounds.max) throw new Error('07_GAds_Campaign_Daily chưa có dòng dữ liệu hợp lệ.');
    const defaultRange = getDefaultRange(state.bundle.data.campaigns || [], state.bundle.data.plan || [], config.defaultLookbackDays);
    el('date-from').min = bounds.min;
    el('date-from').max = bounds.max;
    el('date-to').min = bounds.min;
    el('date-to').max = bounds.max;
    el('date-from').value = defaultRange.from;
    el('date-to').value = defaultRange.to;
    const optionalErrors = state.bundle.errors.length;
    setConnection('connected', optionalErrors ? `Đã kết nối · ${optionalErrors} nguồn phụ lỗi` : 'Google Sheets đã kết nối');
    renderReport();
  } catch (error) {
    showError(error.message || String(error));
  } finally {
    setLoading(false);
  }
}

function init() {
  document.title = config.reportName;
  el('report-name').textContent = config.reportName;
  el('footer-report-name').textContent = config.reportName;
  renderMethod();

  el('apply-filter').addEventListener('click', renderReport);
  el('refresh-data').addEventListener('click', () => load(true));
  el('method-button').addEventListener('click', () => el('method-dialog').showModal());
  el('method-dialog').addEventListener('click', event => {
    if (event.target === el('method-dialog')) el('method-dialog').close();
  });
  el('table-tabs').addEventListener('click', event => {
    const button = event.target.closest('button[data-table]');
    if (!button) return;
    state.activeTable = button.dataset.table;
    document.querySelectorAll('#table-tabs button').forEach(item => item.classList.toggle('active', item === button));
    renderPerformanceTable();
  });
  el('table-search').addEventListener('input', event => {
    state.search = event.target.value;
    renderPerformanceTable();
  });
  load(false);
}

init();
