const DAY_MS = 86400000;

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  let raw = String(value).trim().replace(/\s/g, '');
  const isPercent = raw.includes('%');
  raw = raw.replace(/%/g, '');
  if (raw.includes(',') && raw.includes('.')) {
    raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (raw.includes(',')) {
    const parts = raw.split(',');
    raw = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0].replace(/\./g, '')}.${parts[1]}`
      : raw.replace(/,/g, '');
  }
  const parsed = Number(raw.replace(/[^0-9.+-Ee]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return isPercent ? parsed / 100 : parsed;
}

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function dateToKey(date) {
  if (!date) return '';
  if (typeof date === 'string') {
    const exact = date.match(/\d{4}-\d{2}-\d{2}/);
    if (exact) return exact[0];
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function parseDateKey(key) {
  const parts = String(key).split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addDays(key, days) {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInclusive(from, to) {
  if (!from || !to || from > to) return 0;
  return Math.floor((parseDateKey(to) - parseDateKey(from)) / DAY_MS) + 1;
}

function inRange(row, from, to, field = 'Date') {
  const key = dateToKey(row[field]);
  return key && key >= from && key <= to;
}

function isSampleRow(row) {
  return normalize(row.Notes).includes('dong mau') || normalize(row['Lead ID']).startsWith('sample');
}

function aggregateMetrics(rows) {
  const metrics = {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
    allConversions: 0
  };
  rows.forEach(row => {
    metrics.impressions += toNumber(row.Impressions);
    metrics.clicks += toNumber(row.Clicks);
    metrics.cost += toNumber(row.Cost);
    metrics.conversions += toNumber(row.Conversions);
    metrics.conversionValue += toNumber(row['Conversion Value']);
    metrics.allConversions += toNumber(row['All Conversions']);
  });
  metrics.ctr = safeDivide(metrics.clicks, metrics.impressions);
  metrics.cpc = safeDivide(metrics.cost, metrics.clicks);
  metrics.cvr = safeDivide(metrics.conversions, metrics.clicks);
  metrics.cpl = safeDivide(metrics.cost, metrics.conversions);
  metrics.roas = safeDivide(metrics.conversionValue, metrics.cost);
  return metrics;
}

function getWeightedValue(rows, field, weightField = 'Impressions') {
  let total = 0;
  let weight = 0;
  rows.forEach(row => {
    const value = toNumber(row[field]);
    const currentWeight = Math.max(1, toNumber(row[weightField]));
    if (value || value === 0) {
      total += value * currentWeight;
      weight += currentWeight;
    }
  });
  return weight ? total / weight : 0;
}

function aggregateBy(rows, options) {
  const groups = new Map();
  const {
    idField,
    nameField,
    secondaryField,
    statusField,
    targetCpl,
    accountCpl,
    thresholds
  } = options;

  rows.forEach(row => {
    const id = String(row[idField] ?? row[nameField] ?? 'unknown');
    const name = String(row[nameField] ?? id);
    const key = `${id}::${name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.values()].map(groupRows => {
    const first = groupRows[0];
    const metrics = aggregateMetrics(groupRows);
    const entity = {
      id: String(first[idField] ?? ''),
      name: String(first[nameField] ?? first[idField] ?? 'Không xác định'),
      secondary: String(first[secondaryField] ?? ''),
      sourceStatus: String(first[statusField] ?? ''),
      ...metrics,
      searchImpressionShare: getWeightedValue(groupRows, 'Search Impression Share'),
      lostBudgetShare: getWeightedValue(groupRows, 'Search Lost IS Budget'),
      lostRankShare: getWeightedValue(groupRows, 'Search Lost IS Rank')
    };
    entity.assessment = assessEntity(entity, targetCpl, accountCpl, thresholds);
    return entity;
  }).sort((a, b) => b.cost - a.cost);
}

function assessEntity(entity, targetCpl, accountCpl, thresholds) {
  const referenceCpl = targetCpl || accountCpl;
  const hasDecisionVolume = entity.clicks >= thresholds.minClicksForDecision;
  const enoughConversions = entity.conversions >= thresholds.minConversionsForCplDecision;

  if (referenceCpl && entity.conversions === 0 && entity.cost >= referenceCpl * thresholds.minSpendVsTargetCpl) {
    return { level: 'action', label: 'Không có kết quả', reason: `Đã chi vượt ngưỡng tham chiếu nhưng chưa có conversion.` };
  }
  if (targetCpl && enoughConversions && entity.cpl > targetCpl * thresholds.cplCriticalMultiplier) {
    return { level: 'action', label: 'CPL rất cao', reason: `CPL cao hơn ${Math.round(thresholds.cplCriticalMultiplier * 100)}% ngưỡng mục tiêu.` };
  }
  if (targetCpl && enoughConversions && entity.cpl > targetCpl * thresholds.cplWatchMultiplier) {
    return { level: 'watch', label: 'CPL cao', reason: 'CPL cao hơn mục tiêu và đã có đủ dữ liệu tối thiểu.' };
  }
  if (targetCpl && enoughConversions && entity.cpl <= targetCpl * thresholds.cplGoodMultiplier) {
    return { level: 'good', label: 'Đạt CPL', reason: 'CPL đang đạt hoặc tốt hơn mục tiêu.' };
  }
  if (!targetCpl && accountCpl && enoughConversions && entity.cpl <= accountCpl * 0.8) {
    return { level: 'good', label: 'Hiệu quả tương đối', reason: 'CPL tốt hơn ít nhất 20% so với trung bình tài khoản.' };
  }
  if (!targetCpl && accountCpl && enoughConversions && entity.cpl > accountCpl * 1.5) {
    return { level: 'watch', label: 'Kém trung bình', reason: 'CPL cao hơn 50% so với trung bình tài khoản.' };
  }
  if (!hasDecisionVolume) {
    return { level: 'neutral', label: 'Chưa đủ dữ liệu', reason: 'Chưa đạt ngưỡng click để kết luận chắc chắn.' };
  }
  return { level: 'neutral', label: 'Ổn định', reason: 'Chưa có chênh lệch đủ lớn để thay đổi mạnh.' };
}

function getPlan(rows, from, to) {
  const sampleRows = rows.filter(isSampleRow);
  const validRows = rows.filter(row => {
    if (isSampleRow(row)) return false;
    const platform = normalize(row.Platform);
    const status = normalize(row.Status);
    return (!platform || platform.includes('google')) && (!status || status === 'active' || status === 'dang chay');
  });

  let budget = 0;
  let leads = 0;
  let targetCplWeighted = 0;
  let targetCtrWeighted = 0;
  let targetCvrWeighted = 0;
  let targetRoasWeighted = 0;
  let weight = 0;
  let matchedRows = 0;

  validRows.forEach(row => {
    const start = dateToKey(row['Period Start']);
    const end = dateToKey(row['Period End']);
    if (!start || !end) return;
    const overlapStart = start > from ? start : from;
    const overlapEnd = end < to ? end : to;
    const overlapDays = daysInclusive(overlapStart, overlapEnd);
    if (!overlapDays) return;
    const totalDays = Math.max(1, daysInclusive(start, end));
    const ratio = overlapDays / totalDays;
    const rowBudget = toNumber(row['Planned Budget']);
    const rowLeads = toNumber(row['Planned Leads']);
    const rowWeight = rowBudget * ratio || rowLeads * ratio || ratio;
    budget += rowBudget * ratio;
    leads += rowLeads * ratio;
    targetCplWeighted += toNumber(row['Target CPL']) * rowWeight;
    targetCtrWeighted += toNumber(row['Target CTR']) * rowWeight;
    targetCvrWeighted += toNumber(row['Target CVR']) * rowWeight;
    targetRoasWeighted += toNumber(row['Target ROAS']) * rowWeight;
    weight += rowWeight;
    matchedRows++;
  });

  const targetCpl = weight ? targetCplWeighted / weight : safeDivide(budget, leads);
  return {
    configured: validRows.length > 0,
    sampleRows: sampleRows.length,
    validRows: validRows.length,
    matchedRows,
    budget,
    leads,
    targetCpl,
    targetCtr: weight ? targetCtrWeighted / weight : 0,
    targetCvr: weight ? targetCvrWeighted / weight : 0,
    targetRoas: weight ? targetRoasWeighted / weight : 0
  };
}

function getActualLeads(rows, from, to) {
  const sampleRows = rows.filter(isSampleRow);
  const validRows = rows.filter(row => !isSampleRow(row) && dateToKey(row['Lead Date']));
  const selected = validRows.filter(row => inRange(row, from, to, 'Lead Date'));
  const qualified = selected.filter(row => ['yes', 'true', 'co', 'qualified'].includes(normalize(row['Qualified?']))).length;
  const revenue = selected.reduce((sum, row) => sum + toNumber(row.Revenue), 0);
  return {
    configured: validRows.length > 0,
    sampleRows: sampleRows.length,
    totalRows: validRows.length,
    count: selected.length,
    qualified,
    revenue,
    rows: selected
  };
}

function getDaily(rows, from, to) {
  const map = new Map();
  rows.filter(row => inRange(row, from, to)).forEach(row => {
    const date = dateToKey(row.Date);
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(row);
  });
  return [...map.entries()]
    .map(([date, dateRows]) => ({ date, ...aggregateMetrics(dateRows) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getConversionActions(rows, from, to) {
  const groups = new Map();
  rows.filter(row => inRange(row, from, to)).forEach(row => {
    const action = String(row['Conversion Action'] || 'Không xác định');
    const category = String(row['Conversion Category'] || 'UNKNOWN');
    const key = `${action}::${category}`;
    if (!groups.has(key)) groups.set(key, { name: action, category, conversions: 0, allConversions: 0, value: 0 });
    const item = groups.get(key);
    item.conversions += toNumber(row.Conversions);
    item.allConversions += toNumber(row['All Conversions']);
    item.value += toNumber(row['Conversion Value']);
  });

  const lowIntent = new Set(['DOWNLOAD', 'ENGAGEMENT', 'PAGE_VIEW', 'DEFAULT', 'OTHER']);
  const items = [...groups.values()].map(item => ({
    ...item,
    lowIntent: lowIntent.has(normalize(item.category).toUpperCase()),
    assessment: lowIntent.has(normalize(item.category).toUpperCase())
      ? { level: 'watch', label: 'Tín hiệu mềm', reason: 'Loại conversion này có thể không tương đương lead kinh doanh.' }
      : { level: 'good', label: 'Tín hiệu sâu', reason: 'Conversion có xu hướng gần mục tiêu kinh doanh hơn.' }
  })).sort((a, b) => b.conversions - a.conversions);

  const total = items.reduce((sum, item) => sum + item.conversions, 0);
  const lowIntentTotal = items.filter(item => item.lowIntent).reduce((sum, item) => sum + item.conversions, 0);
  return { items, total, lowIntentTotal, lowIntentShare: safeDivide(lowIntentTotal, total) };
}

function metricStatus(value, target, direction = 'higher') {
  if (!target) return { level: 'neutral', label: 'Tham chiếu' };
  const ratio = safeDivide(value, target);
  if (direction === 'lower') {
    if (ratio <= 1) return { level: 'good', label: 'Đạt' };
    if (ratio <= 1.2) return { level: 'watch', label: 'Theo dõi' };
    return { level: 'action', label: 'Cần xử lý' };
  }
  if (ratio >= 1) return { level: 'good', label: 'Đạt' };
  if (ratio >= 0.8) return { level: 'watch', label: 'Theo dõi' };
  return { level: 'action', label: 'Cần xử lý' };
}

function addUnique(list, item) {
  if (!list.some(existing => existing.id === item.id)) list.push(item);
}

function createInsight(level, id, title, value, why, next) {
  return { level, id, title, value, why, next };
}

function createRecommendation(id, level, title, evidence, why, action, score) {
  return { id, level, title, evidence, why, action, score };
}

function getYesterdayInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return addDays(`${map.year}-${map.month}-${map.day}`, -1);
}

export function getDataBounds(campaignRows) {
  const dates = campaignRows.map(row => dateToKey(row.Date)).filter(Boolean).sort();
  return {
    min: dates[0] || '',
    max: dates[dates.length - 1] || ''
  };
}

export function getDefaultRange(campaignRows, planRows, lookbackDays = 30) {
  const bounds = getDataBounds(campaignRows);
  if (!bounds.max) return { from: '', to: '' };
  const activePlans = planRows.filter(row => !isSampleRow(row));
  const matchingPlan = activePlans.find(row => {
    const start = dateToKey(row['Period Start']);
    const end = dateToKey(row['Period End']);
    return start && end && bounds.max >= start && bounds.max <= end;
  });
  const planStart = matchingPlan ? dateToKey(matchingPlan['Period Start']) : '';
  const from = planStart || addDays(bounds.max, -(lookbackDays - 1));
  return { from: from < bounds.min ? bounds.min : from, to: bounds.max };
}

export function analyzeReport(data, range, config) {
  const { from, to } = range;
  const thresholds = config.thresholds;
  const campaignRows = (data.campaigns || []).filter(row => inRange(row, from, to));
  const metrics = aggregateMetrics(campaignRows);
  const plan = getPlan(data.plan || [], from, to);
  const leads = getActualLeads(data.leads || [], from, to);
  const daily = getDaily(data.campaigns || [], from, to);
  const conversionActions = getConversionActions(data.conversions || [], from, to);
  const bounds = getDataBounds(data.campaigns || []);

  const actualCpl = leads.configured ? safeDivide(metrics.cost, leads.count) : metrics.cpl;
  const actualLeadProgress = plan.leads && leads.configured ? safeDivide(leads.count, plan.leads) : 0;
  const budgetPacing = plan.budget ? safeDivide(metrics.cost, plan.budget) : 0;
  const referenceCpl = plan.targetCpl || metrics.cpl;

  const campaigns = aggregateBy(campaignRows, {
    idField: 'Campaign ID', nameField: 'Campaign', secondaryField: 'Campaign Type', statusField: 'Campaign Status',
    targetCpl: plan.targetCpl, accountCpl: metrics.cpl, thresholds
  });
  const adgroups = aggregateBy((data.adgroups || []).filter(row => inRange(row, from, to)), {
    idField: 'Ad Group ID', nameField: 'Ad Group', secondaryField: 'Campaign', statusField: 'Ad Group Status',
    targetCpl: plan.targetCpl, accountCpl: metrics.cpl, thresholds
  });
  const assetGroups = aggregateBy((data.assetGroups || []).filter(row => inRange(row, from, to)), {
    idField: 'Asset Group ID', nameField: 'Asset Group', secondaryField: 'Campaign', statusField: 'Asset Group Status',
    targetCpl: plan.targetCpl, accountCpl: metrics.cpl, thresholds
  });
  const devices = aggregateBy((data.devices || []).filter(row => inRange(row, from, to)), {
    idField: 'Device', nameField: 'Device', secondaryField: 'Campaign', statusField: 'Status',
    targetCpl: plan.targetCpl, accountCpl: metrics.cpl, thresholds
  });
  const networks = aggregateBy((data.networks || []).filter(row => inRange(row, from, to)), {
    idField: 'Ad Network Type', nameField: 'Ad Network Type', secondaryField: 'Ad Subnetwork Type', statusField: 'Status',
    targetCpl: plan.targetCpl, accountCpl: metrics.cpl, thresholds
  });

  const insights = { good: [], watch: [], action: [] };
  const recommendations = [];
  const setupAlerts = [];
  const expectedLatest = getYesterdayInTimezone(config.timezone);
  const daysBehind = bounds.max && expectedLatest > bounds.max ? daysInclusive(addDays(bounds.max, 1), expectedLatest) : 0;

  if (!plan.configured) {
    setupAlerts.push({ level: 'action', title: '04_Plan vẫn là dữ liệu mẫu', text: 'Hãy xóa hoặc thay dòng “Dòng mẫu”. Khi có Plan thật, report mới đánh giá được pacing, CPL, CTR, CVR và ROAS theo mục tiêu kinh doanh.' });
    insights.action.push(createInsight('action', 'missing-plan', 'Chưa có mục tiêu để đối chiếu', '04_Plan chưa được cấu hình', 'Không có target thì “tốt” hay “xấu” chỉ là nhận định tương đối, không phản ánh kế hoạch.', 'Nhập budget, planned leads, Target CPL/CTR/CVR và chỉ điền Target ROAS khi đã có conversion value đáng tin cậy.'));
    addUnique(recommendations, createRecommendation('setup-plan', 'action', 'Thay dòng mẫu trong 04_Plan', 'Report chưa tìm thấy một Plan hợp lệ trong kỳ.', 'Mọi quyết định phân bổ ngân sách cần một chuẩn so sánh theo đúng kỳ báo cáo.', 'Nhập Period Start/End, Planned Budget, Planned Leads, Target CPL, Target CTR và Target CVR; bỏ chữ “Dòng mẫu” ở Notes.', 100));
  } else if (!plan.matchedRows) {
    insights.watch.push(createInsight('watch', 'plan-outside-period', 'Plan không phủ kỳ đang xem', 'Không có dòng Plan giao với bộ lọc ngày', 'Target có tồn tại nhưng không áp dụng cho giai đoạn đang chọn.', 'Đổi bộ lọc hoặc bổ sung Plan cho đúng giai đoạn.'));
  }

  if (!leads.configured) {
    setupAlerts.push({ level: 'action', title: '05_Actual_Leads chưa có lead thật', text: 'Dòng SAMPLE-001 bị loại trừ. Report đang hiển thị Google Ads conversions nhưng không coi đó là lead kinh doanh.' });
    insights.action.push(createInsight('action', 'missing-leads', 'Chưa xác minh được chất lượng đầu ra', 'Actual Leads chưa được nhập', 'Google Ads conversions có thể là cài app, engagement hoặc hành động mềm — không đồng nghĩa lead đủ chất lượng.', 'Mỗi lead thật thêm một dòng vào 05_Actual_Leads và giữ Lead ID duy nhất.'));
    addUnique(recommendations, createRecommendation('setup-leads', 'action', 'Bắt đầu ghi Actual Leads', '05_Actual_Leads hiện chỉ có dòng mẫu.', 'CPL từ Ads chỉ có ý nghĩa khi conversion khớp với lead thực tế hoặc mục tiêu kinh doanh.', 'Thay SAMPLE-001 bằng lead thật; tối thiểu nhập Lead Date, Lead ID, Platform, Campaign và Qualified?.', 98));
  }

  if (daysBehind === 0) {
    insights.good.push(createInsight('good', 'fresh-data', 'Dữ liệu đang cập nhật đúng nhịp', `Ngày mới nhất: ${bounds.max}`, 'Report đã có dữ liệu đến ngày hoàn tất gần nhất theo lịch đồng bộ.', 'Duy trì lịch Google Ads Script chạy hàng ngày.'));
  } else if (daysBehind === 1) {
    insights.watch.push(createInsight('watch', 'stale-data', 'Dữ liệu chậm 1 ngày', `Ngày mới nhất: ${bounds.max}`, 'Có thể tài khoản không phát sinh dữ liệu hoặc lần chạy gần nhất chưa cập nhật Campaign Daily.', 'Kiểm tra log lịch chạy ngày gần nhất trước khi kết luận hiệu suất.'));
    addUnique(recommendations, createRecommendation('check-sync', 'watch', 'Kiểm tra lần đồng bộ gần nhất', `Campaign Daily đang chậm ${daysBehind} ngày so với ngày hoàn tất dự kiến.`, 'Quyết định trên dữ liệu chưa đủ ngày có thể làm sai pacing.', 'Mở Google Ads → Tập lệnh → Nhật ký; xác nhận Errors: 0 và sheet 07 có ngày mới.', 73));
  } else {
    insights.action.push(createInsight('action', 'stale-data', 'Dữ liệu không còn mới', `Chậm ${daysBehind} ngày`, 'Một hoặc nhiều lần chạy hàng ngày có thể đã lỗi hoặc bị tắt.', 'Kiểm tra lịch script, quyền Sheet và log ngay.'));
    addUnique(recommendations, createRecommendation('fix-sync', 'action', 'Khôi phục đồng bộ hàng ngày', `Campaign Daily đang chậm ${daysBehind} ngày.`, 'Report sẽ đưa ra khuyến nghị sai nếu thiếu các ngày mới nhất.', 'Kiểm tra lịch Google Ads Script, chạy Preview một lần và xử lý mọi dòng ERROR trước khi tối ưu chiến dịch.', 96));
  }

  if (plan.budget) {
    if (budgetPacing >= thresholds.budgetPacingLow && budgetPacing <= thresholds.budgetPacingHigh) {
      insights.good.push(createInsight('good', 'budget-pacing', 'Chi tiêu bám kế hoạch', `${Math.round(budgetPacing * 100)}% ngân sách kỳ`, 'Mức chi nằm trong khoảng kiểm soát so với ngân sách đã phân bổ cho số ngày đang xem.', 'Tiếp tục theo dõi CPL/Actual Leads trước khi mở rộng ngân sách.'));
    } else if (budgetPacing < thresholds.budgetPacingLow) {
      insights.watch.push(createInsight('watch', 'under-pacing', 'Chi tiêu thấp hơn kế hoạch', `${Math.round(budgetPacing * 100)}% ngân sách kỳ`, 'Có thể ngân sách, target bid, phạm vi target hoặc Ad Rank đang hạn chế phân phối.', 'Chỉ nới ngân sách/target sau khi chất lượng conversion và CPL đạt yêu cầu.'));
      addUnique(recommendations, createRecommendation('under-pacing', 'watch', 'Tìm nguyên nhân phân phối thấp', `Đã chi ${Math.round(budgetPacing * 100)}% phần ngân sách tương ứng.`, 'Under-pacing có thể làm hụt lead plan nhưng tăng budget khi tracking sai sẽ khuếch đại lãng phí.', 'Xem campaign có Lost IS Budget/Rank cao, trạng thái asset và target CPA; ưu tiên nhóm có CPL tốt.', 62));
    } else {
      insights.action.push(createInsight('action', 'over-pacing', 'Chi tiêu vượt nhịp kế hoạch', `${Math.round(budgetPacing * 100)}% ngân sách kỳ`, 'Nếu giữ tốc độ này, ngân sách có thể hết sớm hoặc vượt kế hoạch.', 'Giảm các nhóm không có kết quả trước, không cắt đồng loạt nhóm hiệu quả.'));
      addUnique(recommendations, createRecommendation('over-pacing', 'action', 'Hạ tốc độ chi ở nhóm kém hiệu quả', `Pacing đạt ${Math.round(budgetPacing * 100)}% so với plan kỳ.`, 'Cắt đều mọi campaign có thể làm mất volume tốt; cần xử lý theo hiệu quả.', 'Giảm 10–20% ngân sách ở campaign không conversion/CPL cao, rồi theo dõi ít nhất 3–7 ngày.', 90));
    }
  }

  if (plan.targetCtr) {
    const status = metricStatus(metrics.ctr, plan.targetCtr, 'higher');
    insights[status.level === 'neutral' ? 'watch' : status.level].push(createInsight(
      status.level === 'neutral' ? 'watch' : status.level,
      'ctr-vs-target',
      status.level === 'good' ? 'CTR đạt mục tiêu' : 'CTR chưa đạt mục tiêu',
      `${(metrics.ctr * 100).toFixed(2)}% vs ${(plan.targetCtr * 100).toFixed(2)}%`,
      status.level === 'good' ? 'Thông điệp/định dạng đang tạo được tương tác theo mục tiêu.' : 'CTR thấp thường cho thấy creative, thông điệp hoặc mức liên quan chưa đủ mạnh.',
      status.level === 'good' ? 'Giữ creative thắng và tiếp tục test biến thể.' : 'Tách theo Campaign/Ad Group để tìm nhóm kéo CTR xuống; thay creative trước khi tăng bid.'
    ));
  }

  if (plan.targetCvr) {
    const status = metricStatus(metrics.cvr, plan.targetCvr, 'higher');
    insights[status.level === 'neutral' ? 'watch' : status.level].push(createInsight(
      status.level === 'neutral' ? 'watch' : status.level,
      'cvr-vs-target',
      status.level === 'good' ? 'CVR đạt mục tiêu nền tảng' : 'CVR dưới mục tiêu',
      `${(metrics.cvr * 100).toFixed(2)}% vs ${(plan.targetCvr * 100).toFixed(2)}%`,
      status.level === 'good' ? 'Lưu lượng nhấp đang chuyển thành Google Ads conversion với tỷ lệ đạt yêu cầu.' : 'Traffic có thể chưa đúng intent, landing/app flow có ma sát hoặc conversion goal chưa chuẩn.',
      status.level === 'good' ? 'Đối chiếu tiếp với Actual Leads trước khi scale.' : 'Kiểm tra Conversion Action, landing/app funnel và nhóm có nhiều click nhưng ít conversion.'
    ));
  }

  if (plan.targetCpl) {
    const cplStatus = metricStatus(actualCpl, plan.targetCpl, 'lower');
    const sourceLabel = leads.configured ? 'Actual Leads' : 'Google Ads conversions';
    insights[cplStatus.level === 'neutral' ? 'watch' : cplStatus.level].push(createInsight(
      cplStatus.level === 'neutral' ? 'watch' : cplStatus.level,
      'cpl-vs-target',
      cplStatus.level === 'good' ? 'CPL đạt mục tiêu' : 'CPL cao hơn mục tiêu',
      `${Math.round(actualCpl).toLocaleString('vi-VN')} vs ${Math.round(plan.targetCpl).toLocaleString('vi-VN')} ${config.currency}`,
      `CPL đang tính theo ${sourceLabel}. ${leads.configured ? 'Đây là chuẩn gần kết quả kinh doanh hơn.' : 'Kết luận chỉ là tạm thời đến khi có Actual Leads.'}`,
      cplStatus.level === 'good' ? 'Duy trì và chỉ scale nhóm có đủ volume.' : 'Ưu tiên dừng lãng phí ở nhóm đã chi ≥ 1 Target CPL mà chưa tạo kết quả.'
    ));
  }

  if (plan.leads && leads.configured) {
    if (actualLeadProgress >= thresholds.targetAttainmentGood) {
      insights.good.push(createInsight('good', 'lead-plan', 'Actual Leads bám mục tiêu', `${leads.count}/${Math.round(plan.leads)} leads`, 'Sản lượng lead thực đang đạt tối thiểu 95% plan tương ứng với kỳ.', 'Tập trung Qualified rate và CPL trước khi scale.'));
    } else if (actualLeadProgress >= thresholds.targetAttainmentWatch) {
      insights.watch.push(createInsight('watch', 'lead-plan', 'Actual Leads hơi dưới mục tiêu', `${Math.round(actualLeadProgress * 100)}% plan`, 'Khoảng hụt còn nhỏ nhưng cần theo dõi pacing những ngày tiếp theo.', 'Ưu tiên nhóm CPL tốt, tránh tăng toàn tài khoản.'));
    } else {
      insights.action.push(createInsight('action', 'lead-plan', 'Actual Leads hụt kế hoạch', `${Math.round(actualLeadProgress * 100)}% plan`, 'Kết quả kinh doanh đang thấp hơn đáng kể so với sản lượng dự kiến trong kỳ.', 'Tìm campaign/ad group vừa chi nhiều vừa không tạo lead; sửa tracking/funnel trước khi tăng budget.'));
      addUnique(recommendations, createRecommendation('lead-gap', 'action', 'Thu hẹp khoảng hụt Actual Leads', `Actual Leads đạt ${Math.round(actualLeadProgress * 100)}% plan kỳ.`, 'Tăng chi tiêu không giải quyết được vấn đề nếu traffic hoặc funnel không tạo lead.', 'Giữ ngân sách cho nhóm có CPL Actual tốt; xử lý 3 nhóm chi nhiều nhất nhưng không tạo lead/qualified lead.', 88));
    }
  }

  if (leads.configured && metrics.conversions) {
    const mismatch = Math.abs(metrics.conversions - leads.count) / Math.max(1, leads.count);
    if (mismatch > thresholds.leadMismatchPct) {
      insights.action.push(createInsight('action', 'lead-mismatch', 'Ads conversions không khớp Actual Leads', `${Math.round(metrics.conversions)} vs ${leads.count}`, 'Chênh lệch lớn cho thấy Google Ads đang đếm hành động khác lead, thiếu import CRM hoặc có trùng lặp.', 'Audit conversion goals và map Campaign/Lead ID trước khi dùng CPL từ Ads để tối ưu.'));
      addUnique(recommendations, createRecommendation('audit-conversions', 'action', 'Audit conversion tracking', `Google Ads ghi ${Math.round(metrics.conversions)} conversions nhưng có ${leads.count} Actual Leads.`, 'Smart Bidding có thể tối ưu sai hành động nếu conversion chính không phản ánh lead thật.', 'Trong Goals → Conversions, giữ lead/signup quan trọng làm Primary; chuyển download/engagement quan sát sang Secondary nếu không phải mục tiêu bidding.', 97));
    }
  }

  if (conversionActions.total >= 5 && conversionActions.lowIntentShare >= thresholds.lowIntentConversionShare) {
    insights.action.push(createInsight('action', 'soft-conversions', 'Conversion chủ yếu là tín hiệu mềm', `${Math.round(conversionActions.lowIntentShare * 100)}% thuộc Download/Engagement/Page view`, 'Các hành động này có thể tạo số conversion cao nhưng chưa chứng minh lead hoặc doanh thu.', 'Đặt lead/signup chất lượng làm Primary; dùng hành động mềm để quan sát nếu không phải mục tiêu bidding.'));
    addUnique(recommendations, createRecommendation('soft-conversions', 'action', 'Chuẩn hóa Primary/Secondary conversions', `${Math.round(conversionActions.lowIntentShare * 100)}% conversion action có nhóm tín hiệu mềm.`, 'Primary conversions được dùng trong cột Conversions và có thể ảnh hưởng Smart Bidding.', 'Rà từng Conversion Action; giữ lead/signup/purchase có giá trị làm Primary, chuyển download/engagement không phải KPI sang Secondary.', 99));
  }

  const valueCoverage = safeDivide(metrics.conversionValue, metrics.cost);
  if (metrics.cost > 0 && (plan.targetRoas || metrics.conversions > 0) && valueCoverage < thresholds.conversionValueCoverageLow) {
    insights.watch.push(createInsight('watch', 'missing-values', 'ROAS chưa đáng tin cậy', `Conversion Value ${Math.round(metrics.conversionValue).toLocaleString('vi-VN')} ${config.currency}`, 'Phần lớn conversions không có giá trị tiền tệ; ROAS gần 0 không đồng nghĩa chiến dịch chắc chắn lỗ.', 'Gán conversion value hoặc offline revenue trước khi dùng ROAS để tăng/giảm ngân sách.'));
    addUnique(recommendations, createRecommendation('conversion-values', 'watch', 'Bổ sung conversion value', 'Conversion Value đang rất thấp so với chi tiêu.', 'Không có value thì Target ROAS và phân tích doanh thu không phản ánh giá trị thật của từng lead.', 'Nếu chưa có doanh thu ngay, gán value theo qualified lead hoặc import offline conversion/revenue từ CRM.', 82));
  } else if (plan.targetRoas && metrics.roas >= plan.targetRoas) {
    insights.good.push(createInsight('good', 'roas', 'ROAS đạt mục tiêu', `${metrics.roas.toFixed(2)}x`, 'Conversion value đủ lớn và tỷ lệ value/spend đang đạt target.', 'Duy trì nhóm đạt ROAS và kiểm tra volume trước khi tăng ngân sách.'));
  }

  const wasteCampaigns = campaigns.filter(item => item.assessment.level === 'action' && item.conversions === 0);
  if (wasteCampaigns.length) {
    const wasteSpend = wasteCampaigns.reduce((sum, item) => sum + item.cost, 0);
    const topWaste = wasteCampaigns[0];
    insights.action.push(createInsight('action', 'waste-campaigns', `${wasteCampaigns.length} campaign chi nhưng không tạo conversion`, `${Math.round(wasteSpend).toLocaleString('vi-VN')} ${config.currency}`, 'Các campaign này đã vượt ngưỡng chi tiêu tối thiểu nhưng chưa tạo kết quả nền tảng.', `Bắt đầu với “${topWaste.name}”: kiểm tra goal, intent và creative/landing trước khi tiếp tục chi.`));
    addUnique(recommendations, createRecommendation('stop-waste', 'action', `Xử lý “${topWaste.name}”`, `Đã chi ${Math.round(topWaste.cost).toLocaleString('vi-VN')} ${config.currency} nhưng 0 conversion trong kỳ.`, 'Tiếp tục giữ nguyên sẽ tăng chi phí cơ hội; nhưng cần xác minh tracking trước khi pause.', 'Kiểm tra conversion goal của campaign. Nếu tracking đúng, giảm 15–30% hoặc tạm dừng nhóm/ad có nhiều click nhất mà không tạo kết quả.', 94));
  }

  const efficientCampaigns = campaigns.filter(item => item.assessment.level === 'good' && item.conversions >= thresholds.minConversionsForCplDecision);
  if (efficientCampaigns.length) {
    const best = efficientCampaigns[0];
    insights.good.push(createInsight('good', 'efficient-campaign', `Campaign hiệu quả nổi bật: ${best.name}`, `${Math.round(best.conversions)} conversions · CPL ${Math.round(best.cpl).toLocaleString('vi-VN')} ${config.currency}`, 'Nhóm có đủ conversion tối thiểu và CPL đang đạt chuẩn so sánh.', 'Nếu Actual Leads xác nhận chất lượng, tăng ngân sách từng bước 10–15%, không tăng đột ngột.'));
    if (leads.configured || conversionActions.lowIntentShare < thresholds.lowIntentConversionShare) {
      addUnique(recommendations, createRecommendation('scale-winner', 'good', `Mở rộng có kiểm soát “${best.name}”`, `${Math.round(best.conversions)} conversions với CPL ${Math.round(best.cpl).toLocaleString('vi-VN')} ${config.currency}.`, 'Nhóm đã có volume và chi phí tốt hơn mục tiêu/trung bình; đây là nơi tăng ngân sách ít rủi ro hơn.', 'Xác nhận quality/Actual Leads, sau đó tăng 10–15%; giữ nguyên target trong 3–7 ngày để quan sát.', 61));
    }
  }

  const rankLimited = campaigns.filter(item => item.lostRankShare >= thresholds.lostRankShareWatch);
  const budgetLimited = campaigns.filter(item => item.lostBudgetShare >= thresholds.lostBudgetShareWatch);
  if (rankLimited.length) {
    const item = rankLimited[0];
    insights.watch.push(createInsight('watch', 'lost-rank', 'Mất impression share do Ad Rank', `${(item.lostRankShare * 100).toFixed(1)}% ở ${item.name}`, 'Quảng cáo mất cơ hội hiển thị vì xếp hạng, thường liên quan bid, chất lượng và mức liên quan.', 'Ưu tiên cải thiện asset/ad/landing và chỉ tăng bid khi CPL còn đạt mục tiêu.'));
  }
  if (budgetLimited.length) {
    const item = budgetLimited[0];
    insights.watch.push(createInsight('watch', 'lost-budget', 'Có campaign bị giới hạn bởi ngân sách', `${(item.lostBudgetShare * 100).toFixed(1)}% Lost IS Budget`, 'Campaign bỏ lỡ lượt hiển thị vì ngân sách không đủ trong một phần đấu giá.', 'Chỉ bổ sung ngân sách nếu CPL/Actual Leads của campaign đang tốt.'));
  }

  if (!insights.good.length) {
    insights.watch.push(createInsight('watch', 'no-confirmed-wins', 'Chưa có tín hiệu tốt được xác nhận', 'Cần thêm Plan/Actual Leads hoặc volume', 'Report tránh gắn nhãn “tốt” khi chưa có chuẩn mục tiêu hay dữ liệu đủ lớn.', 'Hoàn thiện Plan và Actual Leads, sau đó đánh giá lại cùng kỳ.'));
  }

  recommendations.sort((a, b) => b.score - a.score);

  let healthScore = 100;
  if (!plan.configured) healthScore -= 18;
  if (!leads.configured) healthScore -= 18;
  healthScore -= Math.min(18, daysBehind * 6);
  if (conversionActions.total >= 5 && conversionActions.lowIntentShare >= thresholds.lowIntentConversionShare) healthScore -= 18;
  if (metrics.cost && valueCoverage < thresholds.conversionValueCoverageLow) healthScore -= 8;
  if (metrics.cost) {
    const wasteShare = wasteCampaigns.reduce((sum, item) => sum + item.cost, 0) / metrics.cost;
    healthScore -= Math.min(22, Math.round(wasteShare * 28));
  }
  if (plan.budget && (budgetPacing < thresholds.budgetPacingLow || budgetPacing > thresholds.budgetPacingHigh)) healthScore -= 8;
  if (plan.leads && leads.configured && actualLeadProgress < thresholds.targetAttainmentWatch) healthScore -= 12;
  healthScore = clamp(Math.round(healthScore), 0, 100);

  const healthLevel = healthScore >= 80 ? 'good' : healthScore >= 60 ? 'watch' : 'action';
  const healthTitle = healthLevel === 'good' ? 'Nền tảng đang khỏe' : healthLevel === 'watch' ? 'Có điểm cần theo dõi' : 'Cần xử lý trước khi scale';
  const topPriority = recommendations[0] || createRecommendation('observe', 'watch', 'Tiếp tục thu thập dữ liệu', 'Chưa có hành động khẩn cấp.', 'Một số nhóm chưa đủ volume để kết luận.', 'Giữ cấu hình ổn định và đánh giá lại sau khi có thêm dữ liệu.', 10);

  const kpis = [
    { key: 'spend', label: 'Chi tiêu', value: metrics.cost, format: 'currency', status: plan.budget ? metricStatus(metrics.cost, plan.budget, 'lower') : { level: 'neutral', label: 'Thực tế' }, sub: plan.budget ? `${Math.round(budgetPacing * 100)}% plan kỳ` : 'Chưa có budget plan' },
    { key: 'impressions', label: 'Impressions', value: metrics.impressions, format: 'integer', status: { level: 'neutral', label: 'Volume' }, sub: `${campaigns.length} campaign có dữ liệu` },
    { key: 'clicks', label: 'Clicks', value: metrics.clicks, format: 'integer', status: { level: 'neutral', label: 'Traffic' }, sub: `CPC ${Math.round(metrics.cpc).toLocaleString('vi-VN')} ${config.currency}` },
    { key: 'ctr', label: 'CTR', value: metrics.ctr, format: 'percent', status: metricStatus(metrics.ctr, plan.targetCtr, 'higher'), sub: plan.targetCtr ? `Target ${(plan.targetCtr * 100).toFixed(2)}%` : 'Chưa có Target CTR' },
    { key: 'conversions', label: 'Ads Conversions', value: metrics.conversions, format: 'decimal', status: { level: conversionActions.lowIntentShare >= thresholds.lowIntentConversionShare ? 'watch' : 'neutral', label: 'Nền tảng' }, sub: 'Không mặc định bằng Actual Leads' },
    { key: 'leads', label: 'Actual Leads', value: leads.configured ? leads.count : null, format: 'integer', status: leads.configured ? metricStatus(leads.count, plan.leads, 'higher') : { level: 'action', label: 'Chưa nhập' }, sub: leads.configured ? `${leads.qualified} qualified` : '05_Actual_Leads còn dòng mẫu' },
    { key: 'cvr', label: 'CVR', value: metrics.cvr, format: 'percent', status: metricStatus(metrics.cvr, plan.targetCvr, 'higher'), sub: plan.targetCvr ? `Target ${(plan.targetCvr * 100).toFixed(2)}%` : 'Ads conversions / clicks' },
    { key: 'cpl', label: leads.configured ? 'CPL Actual' : 'CPA nền tảng', value: actualCpl, format: 'currency', status: metricStatus(actualCpl, plan.targetCpl, 'lower'), sub: leads.configured ? 'Spend / Actual Leads' : 'Spend / Ads conversions' },
    { key: 'value', label: 'Conversion Value', value: metrics.conversionValue, format: 'currency', status: valueCoverage < thresholds.conversionValueCoverageLow ? { level: 'watch', label: 'Thiếu value' } : { level: 'neutral', label: 'Giá trị' }, sub: 'Cần import revenue/value đúng' },
    { key: 'roas', label: 'ROAS', value: metrics.roas, format: 'multiple', status: metricStatus(metrics.roas, plan.targetRoas, 'higher'), sub: plan.targetRoas ? `Target ${plan.targetRoas.toFixed(2)}x` : 'Chỉ đáng tin khi có value' },
    { key: 'cpc', label: 'Average CPC', value: metrics.cpc, format: 'currency', status: { level: 'neutral', label: 'Chi phí click' }, sub: `${metrics.clicks.toLocaleString('vi-VN')} clicks` },
    { key: 'qualified', label: 'Qualified Leads', value: leads.configured ? leads.qualified : null, format: 'integer', status: { level: leads.configured ? 'neutral' : 'action', label: leads.configured ? 'CRM' : 'Chưa nhập' }, sub: leads.configured && leads.count ? `${Math.round(leads.qualified / leads.count * 100)}% Actual Leads` : 'Cần đánh dấu Qualified?' }
  ];

  return {
    period: { from, to, days: daysInclusive(from, to), dataMin: bounds.min, dataMax: bounds.max, expectedLatest, daysBehind },
    metrics,
    plan,
    leads,
    daily,
    conversionActions,
    kpis,
    insights,
    recommendations: recommendations.slice(0, 8),
    setupAlerts,
    health: {
      score: healthScore,
      level: healthLevel,
      title: healthTitle,
      summary: `${insights.good.length} tín hiệu tốt, ${insights.watch.length} điểm cần theo dõi và ${insights.action.length} vấn đề cần hành động trong kỳ.`,
      topPriority
    },
    tables: { campaigns, adgroups, assetGroups, devices, networks, conversionActions: conversionActions.items },
    tableNotes: {
      campaigns: 'Đánh giá dựa trên CPL mục tiêu nếu có; nếu chưa có Plan, dùng CPL trung bình tài khoản làm tham chiếu tương đối.',
      adgroups: 'Ad Group là cấp gần tương đương Ad Set; chỉ kết luận mạnh khi đủ click/conversions.',
      assetGroups: 'Asset Group dùng cho Performance Max. Ad Strength là tín hiệu về độ đầy đủ/chất lượng asset, không phải KPI kinh doanh độc lập.',
      devices: 'So sánh theo device giúp phát hiện nơi có CPL chênh lệch; không nên loại thiết bị chỉ từ volume nhỏ.',
      networks: 'Network của Performance Max có thể khác bản chất traffic; luôn đối chiếu Actual Leads trước khi điều chỉnh.',
      conversionActions: 'Download/Engagement/Page view được đánh dấu là tín hiệu mềm; hãy kiểm tra Primary/Secondary trong Google Ads.'
    }
  };
}
