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

function normalized(value) {
  return String(value ?? '').trim().toUpperCase();
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

function inRange(row, from, to) {
  const key = dateToKey(row.Date);
  return key && key >= from && key <= to;
}

function pctChange(current, previous) {
  if (!previous) return current ? null : 0;
  return (current - previous) / Math.abs(previous);
}

function aggregateMetrics(rows) {
  const metrics = {
    impressions: 0,
    clicks: 0,
    cost: 0,
    interactions: 0,
    engagements: 0,
    invalidClicks: 0
  };
  rows.forEach(row => {
    metrics.impressions += toNumber(row.Impressions);
    metrics.clicks += toNumber(row.Clicks);
    metrics.cost += toNumber(row.Cost);
    metrics.interactions += toNumber(row.Interactions);
    metrics.engagements += toNumber(row.Engagements);
    metrics.invalidClicks += toNumber(row['Invalid Clicks']);
  });
  metrics.ctr = safeDivide(metrics.clicks, metrics.impressions);
  metrics.cpc = safeDivide(metrics.cost, metrics.clicks);
  metrics.cpm = safeDivide(metrics.cost * 1000, metrics.impressions);
  metrics.interactionRate = safeDivide(metrics.interactions, metrics.impressions);
  metrics.engagementRate = safeDivide(metrics.engagements, metrics.impressions);
  metrics.invalidClickRate = safeDivide(metrics.invalidClicks, metrics.clicks);
  return metrics;
}

function getWeightedValue(rows, field, weightField = 'Impressions') {
  let total = 0;
  let weight = 0;
  rows.forEach(row => {
    const raw = row[field];
    if (raw === null || raw === undefined || raw === '') return;
    const value = toNumber(raw);
    const currentWeight = Math.max(1, toNumber(row[weightField]));
    total += value * currentWeight;
    weight += currentWeight;
  });
  return weight ? total / weight : 0;
}

function getLatestText(rows, field) {
  const values = rows
    .map(row => ({ date: dateToKey(row.Date), value: String(row[field] ?? '') }))
    .filter(item => item.value)
    .sort((a, b) => b.date.localeCompare(a.date));
  return values[0]?.value || '';
}

function groupRows(rows, idField, nameField) {
  const groups = new Map();
  rows.forEach(row => {
    const id = String(row[idField] ?? row[nameField] ?? 'unknown');
    const name = String(row[nameField] ?? id);
    const key = `${id}::${name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function buildTrend(current, previous) {
  return {
    spend: pctChange(current.cost, previous.cost),
    impressions: pctChange(current.impressions, previous.impressions),
    clicks: pctChange(current.clicks, previous.clicks),
    ctr: pctChange(current.ctr, previous.ctr),
    cpc: pctChange(current.cpc, previous.cpc),
    cpm: pctChange(current.cpm, previous.cpm),
    interactions: pctChange(current.interactions, previous.interactions),
    engagementRate: pctChange(current.engagementRate, previous.engagementRate)
  };
}

function typeAction(type, issues) {
  const key = normalized(type);
  const parts = [];
  if (issues.includes('ctr')) {
    if (key.includes('PERFORMANCE_MAX')) parts.push('làm mới thông điệp và độ đa dạng asset trong từng Asset Group');
    else if (key.includes('DEMAND_GEN')) parts.push('đổi creative hook, thumbnail và audience segment');
    else if (key.includes('APP')) parts.push('test thêm video/image/text asset theo từng concept');
    else if (key.includes('SEARCH')) parts.push('siết search intent, thông điệp quảng cáo và mức liên quan landing page');
    else parts.push('làm mới creative, thông điệp và audience');
  }
  if (issues.includes('cpc')) parts.push('rà targeting, network/device mix và mức cạnh tranh của traffic');
  if (issues.includes('trend')) parts.push('giữ ngân sách ổn định trong khi kiểm tra nhóm kéo hiệu suất đi xuống');
  if (issues.includes('invalid')) parts.push('đối chiếu Invalid Activity Report và theo dõi spike; không đổi spend chỉ từ metric đã được Google lọc');
  if (issues.includes('asset')) parts.push('bổ sung đủ text, image và video để đưa Ad Strength lên Good/Excellent');
  return parts.length ? `${parts.join('; ')}.` : 'Giữ cấu hình hiện tại và tiếp tục test một thay đổi mỗi lần.';
}

function assessMedia(entity, benchmark, thresholds) {
  const enoughVolume = entity.impressions >= thresholds.minImpressionsForDecision && entity.clicks >= thresholds.minClicksForDecision;
  if (!enoughVolume) {
    return {
      score: 50,
      level: 'neutral',
      label: 'Chưa đủ volume',
      reason: `Mới có ${Math.round(entity.impressions).toLocaleString('vi-VN')} impressions và ${Math.round(entity.clicks).toLocaleString('vi-VN')} clicks.`,
      action: 'Chờ thêm dữ liệu trước khi thay đổi mạnh.'
    };
  }

  let score = 65;
  const reasons = [];
  const issues = [];
  const ctrRatio = safeDivide(entity.ctr, benchmark.ctr);
  const cpcRatio = safeDivide(entity.cpc, benchmark.cpc);

  if (ctrRatio >= thresholds.ctrGoodVsPeer) {
    score += 10;
    reasons.push(`CTR cao hơn benchmark ${Math.round((ctrRatio - 1) * 100)}%`);
  } else if (ctrRatio < thresholds.ctrLowVsPeer) {
    score -= 16;
    reasons.push(`CTR thấp hơn benchmark ${Math.round((1 - ctrRatio) * 100)}%`);
    issues.push('ctr');
  } else if (ctrRatio < 0.9) {
    score -= 7;
    reasons.push('CTR hơi thấp hơn benchmark');
    issues.push('ctr');
  } else {
    score += 3;
    reasons.push('CTR gần benchmark');
  }

  if (cpcRatio && cpcRatio <= thresholds.cpcGoodVsPeer) {
    score += 10;
    reasons.push(`CPC thấp hơn benchmark ${Math.round((1 - cpcRatio) * 100)}%`);
  } else if (cpcRatio >= thresholds.cpcHighVsPeer) {
    score -= 14;
    reasons.push(`CPC cao hơn benchmark ${Math.round((cpcRatio - 1) * 100)}%`);
    issues.push('cpc');
  } else if (cpcRatio > 1.15) {
    score -= 6;
    reasons.push('CPC hơi cao hơn benchmark');
    issues.push('cpc');
  } else {
    score += 3;
    reasons.push('CPC nằm trong vùng ổn định');
  }

  if (entity.trend.ctr !== null && entity.trend.ctr <= -thresholds.trendWatch) {
    score -= entity.trend.ctr <= -thresholds.trendCritical ? 13 : 8;
    reasons.push(`CTR giảm ${Math.round(Math.abs(entity.trend.ctr) * 100)}% so với kỳ trước`);
    issues.push('trend');
  } else if (entity.trend.ctr !== null && entity.trend.ctr >= thresholds.trendWatch) {
    score += 6;
    reasons.push(`CTR tăng ${Math.round(entity.trend.ctr * 100)}% so với kỳ trước`);
  }

  if (entity.trend.cpc !== null && entity.trend.cpc >= thresholds.trendWatch) {
    score -= entity.trend.cpc >= thresholds.trendCritical ? 13 : 8;
    reasons.push(`CPC tăng ${Math.round(entity.trend.cpc * 100)}% so với kỳ trước`);
    issues.push('cpc');
  } else if (entity.trend.cpc !== null && entity.trend.cpc <= -thresholds.trendWatch) {
    score += 6;
    reasons.push(`CPC giảm ${Math.round(Math.abs(entity.trend.cpc) * 100)}% so với kỳ trước`);
  }

  if (entity.trend.spend !== null && entity.trend.clicks !== null && entity.trend.spend > thresholds.trendWatch && entity.trend.clicks < 0) {
    score -= 12;
    reasons.push('Spend tăng nhưng clicks giảm');
    issues.push('trend');
  }

  if (entity.invalidClickRate >= thresholds.invalidClickRateWatch) {
    score -= 4;
    reasons.push(`Invalid Click Rate ${Math.round(entity.invalidClickRate * 1000) / 10}%`);
    issues.push('invalid');
  }

  if (thresholds.weakAdStrength.includes(normalized(entity.adStrength))) {
    score -= 12;
    reasons.push(`Ad Strength ${entity.adStrength}`);
    issues.push('asset');
  } else if (thresholds.strongAdStrength.includes(normalized(entity.adStrength))) {
    score += 5;
    reasons.push(`Ad Strength ${entity.adStrength}`);
  }

  score = clamp(Math.round(score), 0, 100);
  const level = score >= 78 ? 'good' : score >= 58 ? 'neutral' : score >= 42 ? 'watch' : 'action';
  const label = level === 'good' ? 'Media tốt' : level === 'neutral' ? 'Ổn định' : level === 'watch' ? 'Cần chỉnh' : 'Ưu tiên xử lý';
  return {
    score,
    level,
    label,
    reason: `${reasons.slice(0, 4).join('; ')}.`,
    action: typeAction(entity.secondary, [...new Set(issues)])
  };
}

function aggregateEntities(currentRows, previousRows, options, thresholds) {
  const currentGroups = groupRows(currentRows, options.idField, options.nameField);
  const previousGroups = groupRows(previousRows, options.idField, options.nameField);
  const entities = [];

  currentGroups.forEach((rows, key) => {
    const first = rows[0];
    const current = aggregateMetrics(rows);
    const previous = aggregateMetrics(previousGroups.get(key) || []);
    const entity = {
      id: String(first[options.idField] ?? ''),
      name: String(first[options.nameField] ?? first[options.idField] ?? 'Không xác định'),
      secondary: options.secondaryField ? String(first[options.secondaryField] ?? '') : '',
      sourceStatus: options.statusField ? String(first[options.statusField] ?? '') : '',
      adStrength: options.adStrengthField ? getLatestText(rows, options.adStrengthField) : '',
      ...current,
      previous,
      trend: buildTrend(current, previous),
      searchImpressionShare: getWeightedValue(rows, 'Search Impression Share'),
      lostBudgetShare: getWeightedValue(rows, 'Search Lost IS Budget'),
      lostRankShare: getWeightedValue(rows, 'Search Lost IS Rank')
    };
    entities.push(entity);
  });

  const globalBenchmark = aggregateMetrics(currentRows);
  const typeRows = new Map();
  entities.forEach(entity => {
    const type = entity.secondary || '__ALL__';
    if (!typeRows.has(type)) typeRows.set(type, []);
    typeRows.get(type).push(entity);
  });

  entities.forEach(entity => {
    const peers = typeRows.get(entity.secondary || '__ALL__') || [];
    const hasHistoricalBenchmark = entity.previous.impressions >= thresholds.minImpressionsForDecision
      && entity.previous.clicks >= thresholds.minClicksForDecision;
    let benchmark;
    let benchmarkLabel;
    if (peers.length >= 2) {
      benchmark = {
        ctr: safeDivide(peers.reduce((sum, item) => sum + item.clicks, 0), peers.reduce((sum, item) => sum + item.impressions, 0)),
        cpc: safeDivide(peers.reduce((sum, item) => sum + item.cost, 0), peers.reduce((sum, item) => sum + item.clicks, 0))
      };
      benchmarkLabel = 'so với nhóm cùng loại';
    } else if (hasHistoricalBenchmark) {
      benchmark = entity.previous;
      benchmarkLabel = 'so với lịch sử chính campaign';
    } else if (entities.length > 1 && !entity.secondary) {
      benchmark = globalBenchmark;
      benchmarkLabel = 'so với media mix toàn tài khoản';
    } else {
      benchmark = { ctr: entity.ctr, cpc: entity.cpc };
      benchmarkLabel = 'benchmark tạm thời do chưa có peer/lịch sử';
    }
    entity.benchmark = benchmark;
    entity.benchmarkLabel = benchmarkLabel;
    entity.assessment = assessMedia(entity, benchmark, thresholds);
    entity.assessment.reason = `${benchmarkLabel}: ${entity.assessment.reason}`;
  });

  return entities.sort((a, b) => b.cost - a.cost);
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

function createInsight(level, id, title, value, why, next) {
  return { level, id, title, value, why, next };
}

function createRecommendation(id, level, title, evidence, why, action, score) {
  return { id, level, title, evidence, why, action, score };
}

function addUnique(list, item) {
  if (!list.some(existing => existing.id === item.id)) list.push(item);
}

function trendStatus(change, direction = 'higher', thresholds) {
  if (change === null || change === undefined) return { level: 'neutral', label: 'Không có kỳ trước' };
  const signed = direction === 'lower' ? -change : change;
  if (signed >= thresholds.trendWatch) return { level: 'good', label: 'Tốt hơn' };
  if (signed <= -thresholds.trendCritical) return { level: 'action', label: 'Giảm mạnh' };
  if (signed <= -thresholds.trendWatch) return { level: 'watch', label: 'Cần theo dõi' };
  return { level: 'neutral', label: 'Ổn định' };
}

export function getDataBounds(campaignRows) {
  const dates = campaignRows.map(row => dateToKey(row.Date)).filter(Boolean).sort();
  return { min: dates[0] || '', max: dates[dates.length - 1] || '' };
}

export function getDefaultRange(campaignRows, lookbackDays = 30) {
  const bounds = getDataBounds(campaignRows);
  if (!bounds.max) return { from: '', to: '' };
  const from = addDays(bounds.max, -(lookbackDays - 1));
  return { from: from < bounds.min ? bounds.min : from, to: bounds.max };
}

export function analyzeReport(data, range, config) {
  const { from, to } = range;
  const thresholds = config.thresholds;
  const periodDays = daysInclusive(from, to);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(periodDays - 1));
  const campaignCurrentRows = (data.campaigns || []).filter(row => inRange(row, from, to));
  const campaignPreviousRows = (data.campaigns || []).filter(row => inRange(row, previousFrom, previousTo));
  const metrics = aggregateMetrics(campaignCurrentRows);
  const previousMetrics = aggregateMetrics(campaignPreviousRows);
  const trend = buildTrend(metrics, previousMetrics);
  const bounds = getDataBounds(data.campaigns || []);
  const expectedLatest = getYesterdayInTimezone(config.timezone);
  const todayKey = addDays(expectedLatest, 1);
  const isPartialToday = bounds.max === todayKey;
  const daysBehind = bounds.max && expectedLatest > bounds.max ? daysInclusive(addDays(bounds.max, 1), expectedLatest) : 0;

  const definitions = {
    campaigns: { idField: 'Campaign ID', nameField: 'Campaign', secondaryField: 'Campaign Type', statusField: 'Campaign Status' },
    adgroups: { idField: 'Ad Group ID', nameField: 'Ad Group', secondaryField: 'Campaign', statusField: 'Ad Group Status' },
    ads: { idField: 'Ad ID', nameField: 'Ad Name', secondaryField: 'Campaign', statusField: 'Ad Status' },
    assetGroups: { idField: 'Asset Group ID', nameField: 'Asset Group', secondaryField: 'Campaign', statusField: 'Asset Group Status', adStrengthField: 'Ad Strength' },
    devices: { idField: 'Device', nameField: 'Device', secondaryField: null, statusField: null },
    networks: { idField: 'Ad Network Type', nameField: 'Ad Network Type', secondaryField: 'Ad Subnetwork Type', statusField: null }
  };

  const tables = {};
  Object.entries(definitions).forEach(([key, definition]) => {
    const currentRows = (data[key] || []).filter(row => inRange(row, from, to));
    const previousRows = (data[key] || []).filter(row => inRange(row, previousFrom, previousTo));
    tables[key] = aggregateEntities(currentRows, previousRows, definition, thresholds);
  });

  const campaigns = tables.campaigns;
  campaigns.forEach(item => { item.spendShare = safeDivide(item.cost, metrics.cost); });
  const assetStrengthByCampaign = new Map();
  tables.assetGroups.forEach(group => {
    if (!assetStrengthByCampaign.has(group.secondary)) assetStrengthByCampaign.set(group.secondary, []);
    assetStrengthByCampaign.get(group.secondary).push(group.adStrength);
  });
  campaigns.forEach(campaign => {
    const strengths = assetStrengthByCampaign.get(campaign.name) || [];
    const weak = strengths.find(value => thresholds.weakAdStrength.includes(normalized(value)));
    const strong = strengths.find(value => thresholds.strongAdStrength.includes(normalized(value)));
    campaign.adStrength = weak || strong || '';
    if (weak && campaign.assessment.level !== 'action') {
      campaign.assessment.score = clamp(campaign.assessment.score - 10, 0, 100);
      campaign.assessment.level = campaign.assessment.score < 42 ? 'action' : 'watch';
      campaign.assessment.label = campaign.assessment.level === 'action' ? 'Ưu tiên xử lý' : 'Cần chỉnh';
      campaign.assessment.reason = `${campaign.assessment.reason} Có Asset Group Ad Strength ${weak}.`;
      campaign.assessment.action = typeAction(campaign.secondary, ['asset']);
    }
  });

  const daily = getDaily(data.campaigns || [], from, to);
  const insights = { good: [], watch: [], action: [] };
  const recommendations = [];

  if (isPartialToday) {
    insights.good.push(createInsight('good', 'freshness', 'Dữ liệu hôm nay đang cập nhật', `Ngày mới nhất ${bounds.max}`, 'Clicks, impressions và cost trong ngày được làm mới theo giờ nhưng vẫn có thể trễ và chưa phải số cuối ngày.', 'Dùng dữ liệu hôm nay để theo dõi delivery; ưu tiên khoảng ngày đã hoàn tất khi ra quyết định lớn.'));
  } else if (daysBehind === 0) {
    insights.good.push(createInsight('good', 'freshness', 'Dữ liệu đang đúng nhịp', `Ngày mới nhất ${bounds.max}`, 'Campaign Daily đã có dữ liệu đến ngày hoàn tất gần nhất.', 'Duy trì lịch Google Ads Script hàng ngày.'));
  } else if (daysBehind === 1) {
    insights.watch.push(createInsight('watch', 'freshness', 'Dữ liệu chậm 1 ngày', `Ngày mới nhất ${bounds.max}`, 'Có thể tài khoản không phát sinh delivery hoặc lần chạy gần nhất chưa cập nhật Campaign Daily.', 'Kiểm tra log script và xác nhận sheet 07 có ngày mới.'));
    addUnique(recommendations, createRecommendation('check-sync', 'watch', 'Kiểm tra đồng bộ ngày gần nhất', `Campaign Daily chậm ${daysBehind} ngày.`, 'Đánh giá xu hướng sẽ thiếu một ngày mới nhất.', 'Mở Google Ads → Tập lệnh → Nhật ký và xác nhận Errors: 0.', 74));
  } else {
    insights.action.push(createInsight('action', 'freshness', 'Dữ liệu không còn mới', `Chậm ${daysBehind} ngày`, 'Một hoặc nhiều lần chạy tự động có thể đã lỗi.', 'Khôi phục lịch script trước khi chỉnh campaign.'));
    addUnique(recommendations, createRecommendation('fix-sync', 'action', 'Khôi phục đồng bộ hàng ngày', `Campaign Daily chậm ${daysBehind} ngày.`, 'Số liệu cũ có thể dẫn đến điều chỉnh sai hướng.', 'Kiểm tra lịch, quyền workbook và mọi dòng ERROR trong log.', 98));
  }

  if (trend.ctr !== null && trend.ctr >= thresholds.trendWatch) {
    insights.good.push(createInsight('good', 'ctr-trend', 'CTR toàn tài khoản cải thiện', `+${Math.round(trend.ctr * 100)}% so với kỳ trước`, 'Ads đang tạo được nhiều click hơn trên mỗi impression.', 'Giữ các thông điệp/asset đang kéo CTR tăng và test biến thể kế tiếp.'));
  } else if (trend.ctr !== null && trend.ctr <= -thresholds.trendWatch) {
    const level = trend.ctr <= -thresholds.trendCritical ? 'action' : 'watch';
    insights[level].push(createInsight(level, 'ctr-trend', 'CTR toàn tài khoản giảm', `-${Math.round(Math.abs(trend.ctr) * 100)}% so với kỳ trước`, 'Mức hấp dẫn hoặc độ liên quan của ads/traffic mix đang yếu đi.', 'Tìm campaign chi nhiều nhưng CTR giảm mạnh; refresh creative trước khi tăng spend.'));
    addUnique(recommendations, createRecommendation('restore-ctr', level, 'Khôi phục CTR ở nhóm chi tiêu lớn', `CTR kỳ này ${Math.round(metrics.ctr * 10000) / 100}% (${Math.round(trend.ctr * 100)}% so với kỳ trước).`, 'CTR giảm làm cùng một lượng impression tạo ra ít traffic hơn.', 'Sắp xếp Campaign/Ads theo Spend và CTR trend; thay một creative/message ở nhóm giảm mạnh nhất.', level === 'action' ? 93 : 76));
  }

  if (trend.cpc !== null && trend.cpc <= -thresholds.trendWatch) {
    insights.good.push(createInsight('good', 'cpc-trend', 'CPC đang giảm', `-${Math.round(Math.abs(trend.cpc) * 100)}% so với kỳ trước`, 'Cùng một mức spend đang mua được click rẻ hơn.', 'Duy trì cấu hình và theo dõi traffic volume thêm một chu kỳ.'));
  } else if (trend.cpc !== null && trend.cpc >= thresholds.trendWatch) {
    const level = trend.cpc >= thresholds.trendCritical ? 'action' : 'watch';
    insights[level].push(createInsight(level, 'cpc-trend', 'CPC tăng đáng kể', `+${Math.round(trend.cpc * 100)}% so với kỳ trước`, 'Traffic đang đắt hơn; có thể do CTR giảm, cạnh tranh hoặc network/device mix thay đổi.', 'Tách theo campaign, device và network để tìm nơi CPC tăng mạnh nhất.'));
    addUnique(recommendations, createRecommendation('reduce-cpc', level, 'Giảm áp lực CPC', `Average CPC ${Math.round(metrics.cpc).toLocaleString('vi-VN')} ${config.currency}, tăng ${Math.round(trend.cpc * 100)}%.`, 'CPC tăng mà click volume không tăng tương ứng làm traffic efficiency xấu đi.', 'Rà campaign có CPC cao nhất; kiểm tra creative, audience, device/network mix và chỉ thay một biến mỗi lần.', level === 'action' ? 92 : 75));
  }

  if (trend.spend !== null && trend.clicks !== null && trend.spend > thresholds.trendWatch && trend.clicks < 0) {
    insights.action.push(createInsight('action', 'spend-click-divergence', 'Spend tăng nhưng clicks giảm', `Spend +${Math.round(trend.spend * 100)}% · Clicks ${Math.round(trend.clicks * 100)}%`, 'Tài khoản đang trả nhiều hơn nhưng nhận ít traffic hơn kỳ trước.', 'Không tăng thêm spend; xử lý campaign có CPC tăng và CTR giảm trước.'));
    addUnique(recommendations, createRecommendation('spend-click-divergence', 'action', 'Dừng mở rộng spend cho đến khi traffic ổn định', `Spend tăng ${Math.round(trend.spend * 100)}% trong khi clicks giảm ${Math.round(Math.abs(trend.clicks) * 100)}%.`, 'Xu hướng này cho thấy hiệu suất mua traffic đang giảm.', 'Giữ tổng spend, chuyển test nhỏ từ campaign yếu sang campaign có CTR/CPC tốt hơn và đo lại sau 5–7 ngày.', 97));
  } else if (trend.spend !== null && trend.clicks !== null && trend.clicks > trend.spend + 0.1) {
    insights.good.push(createInsight('good', 'click-efficiency', 'Clicks tăng nhanh hơn Spend', `Clicks ${Math.round(trend.clicks * 100)}% · Spend ${Math.round(trend.spend * 100)}%`, 'Traffic volume đang cải thiện nhanh hơn chi phí.', 'Duy trì nhóm đóng góp chính và tiếp tục test có kiểm soát.'));
  }

  const topSpend = campaigns[0];
  if (topSpend && topSpend.spendShare >= thresholds.spendConcentrationWatch) {
    insights.watch.push(createInsight('watch', 'spend-concentration', 'Spend tập trung cao vào một campaign', `${Math.round(topSpend.spendShare * 100)}% ở ${topSpend.name}`, 'Tài khoản phụ thuộc lớn vào một nguồn delivery; biến động campaign này sẽ tác động mạnh tổng traffic.', 'Giữ theo dõi riêng campaign này và tránh thay nhiều yếu tố cùng lúc.'));
  }

  if (metrics.invalidClickRate >= thresholds.invalidClickRateWatch) {
    insights.watch.push(createInsight('watch', 'invalid-clicks', 'Invalid Click Rate cao', `${Math.round(metrics.invalidClickRate * 1000) / 10}%`, 'Google đã nhận diện và lọc các click này; đây là tín hiệu cần theo dõi, không mặc định là phần spend bị mất.', 'Đối chiếu Invalid Activity Report, theo dõi spike theo ngày và không chỉnh campaign chỉ từ metric này.'));
    addUnique(recommendations, createRecommendation('invalid-clicks', 'watch', 'Theo dõi invalid traffic', `${Math.round(metrics.invalidClicks).toLocaleString('vi-VN')} invalid clicks trong kỳ.`, 'Tỷ lệ cao có thể làm cách đọc raw click volume khó hơn, nhưng Google cho biết click đã xác định không hợp lệ sẽ được lọc khỏi phần tính phí.', 'So sánh spike theo Campaign/Network/Device và kiểm tra Invalid Activity Report; chỉ hành động khi có pattern lặp lại.', 72));
  }

  const ranked = [...campaigns].sort((a, b) => b.assessment.score - a.assessment.score);
  const strongest = ranked.find(item => item.assessment.level === 'good');
  const weakest = [...ranked].reverse().find(item => ['action', 'watch'].includes(item.assessment.level));
  if (strongest) {
    insights.good.push(createInsight('good', 'strongest-campaign', `Media tốt: ${strongest.name}`, `Score ${strongest.assessment.score}/100 · CTR ${Math.round(strongest.ctr * 10000) / 100}%`, strongest.assessment.reason, 'Giữ cấu hình ổn định; dùng creative/audience insight của campaign này làm hướng test cho nhóm yếu.'));
  }
  if (weakest) {
    const level = weakest.assessment.level;
    insights[level].push(createInsight(level, 'weakest-campaign', `Cần chỉnh: ${weakest.name}`, `Score ${weakest.assessment.score}/100 · CPC ${Math.round(weakest.cpc).toLocaleString('vi-VN')} ${config.currency}`, weakest.assessment.reason, weakest.assessment.action));
    addUnique(recommendations, createRecommendation(`campaign-${weakest.id}`, level, `Chỉnh “${weakest.name}”`, weakest.assessment.reason, 'Đây là campaign có media score thấp nhất trong kỳ đã chọn.', weakest.assessment.action, level === 'action' ? 95 : 82));
  }

  campaigns.filter(item => ['action', 'watch'].includes(item.assessment.level)).forEach((campaign, index) => {
    addUnique(recommendations, createRecommendation(
      `campaign-action-${campaign.id}`,
      campaign.assessment.level,
      `${campaign.assessment.label}: ${campaign.name}`,
      campaign.assessment.reason,
      `Campaign chiếm ${Math.round(campaign.spendShare * 100)}% spend và có score ${campaign.assessment.score}/100.`,
      campaign.assessment.action,
      86 - index
    ));
  });

  const weakAssets = tables.assetGroups.filter(group => thresholds.weakAdStrength.includes(normalized(group.adStrength)));
  if (weakAssets.length) {
    const group = weakAssets[0];
    insights.watch.push(createInsight('watch', 'weak-assets', 'PMax Asset Group chưa đủ mạnh', `${group.name}: ${group.adStrength}`, 'Ad Strength yếu thường phản ánh thiếu độ đa dạng hoặc độ phủ asset.', 'Bổ sung text, image và video; hướng tới Good/Excellent rồi chờ dữ liệu ổn định trước khi thay tiếp.'));
    addUnique(recommendations, createRecommendation('pmax-assets', 'watch', `Cải thiện Asset Group “${group.name}”`, `Ad Strength hiện là ${group.adStrength}.`, 'Asset breadth và variety chưa đủ để khai thác đầy đủ inventory.', 'Bổ sung headline, description, image đa tỷ lệ và video riêng; tránh thay toàn bộ asset cùng lúc.', 79));
  }

  const deviceOutlier = tables.devices.find(item => item.clicks >= thresholds.minClicksForDecision && item.cpc >= metrics.cpc * thresholds.cpcHighVsPeer);
  if (deviceOutlier) {
    insights.watch.push(createInsight('watch', 'device-outlier', `CPC cao ở ${deviceOutlier.name}`, `${Math.round(deviceOutlier.cpc).toLocaleString('vi-VN')} ${config.currency}`, 'Thiết bị này mua click đắt hơn đáng kể so với trung bình tài khoản.', 'Kiểm tra lại tỷ trọng spend và trải nghiệm ads/landing trên thiết bị này trước khi điều chỉnh.'));
  }

  if (!insights.good.length) {
    insights.watch.push(createInsight('watch', 'no-strong-signal', 'Chưa có tín hiệu media nổi bật', 'Các metric đang gần benchmark hoặc thiếu volume', 'Report tránh gắn nhãn tốt khi chênh lệch chưa đủ lớn.', 'Giữ ổn định và đánh giá lại sau khi có thêm dữ liệu.'));
  }

  recommendations.sort((a, b) => b.score - a.score);
  let healthScore = 86;
  healthScore -= Math.min(18, daysBehind * 6);
  if (trend.ctr !== null && trend.ctr <= -thresholds.trendWatch) healthScore -= trend.ctr <= -thresholds.trendCritical ? 14 : 8;
  if (trend.cpc !== null && trend.cpc >= thresholds.trendWatch) healthScore -= trend.cpc >= thresholds.trendCritical ? 14 : 8;
  if (trend.spend !== null && trend.clicks !== null && trend.spend > thresholds.trendWatch && trend.clicks < 0) healthScore -= 14;
  if (topSpend?.spendShare >= thresholds.spendConcentrationWatch) healthScore -= 5;
  if (metrics.invalidClickRate >= thresholds.invalidClickRateWatch) healthScore -= 5;
  const actionSpendShare = safeDivide(
    campaigns.filter(item => item.assessment.level === 'action').reduce((sum, item) => sum + item.cost, 0),
    metrics.cost
  );
  healthScore -= Math.min(18, Math.round(actionSpendShare * 25));
  healthScore -= Math.min(10, weakAssets.length * 4);
  healthScore = clamp(Math.round(healthScore), 0, 100);
  const healthLevel = healthScore >= 78 ? 'good' : healthScore >= 58 ? 'watch' : 'action';
  const healthTitle = healthLevel === 'good' ? 'Media delivery đang khỏe' : healthLevel === 'watch' ? 'Có điểm cần tối ưu' : 'Traffic efficiency cần xử lý';
  const topPriority = recommendations[0] || createRecommendation('observe', 'neutral', 'Tiếp tục theo dõi', 'Không có cảnh báo lớn trong kỳ.', 'Các chỉ số đang ổn định so với benchmark.', 'Giữ cấu hình và đánh giá lại sau một chu kỳ dữ liệu.', 10);

  const kpis = [
    { key: 'spend', label: 'Spend', value: metrics.cost, format: 'currency', status: { level: 'neutral', label: 'Biến động' }, sub: trend.spend === null ? 'Không có kỳ trước' : `${trend.spend >= 0 ? '+' : ''}${Math.round(trend.spend * 100)}% vs kỳ trước` },
    { key: 'impressions', label: 'Impressions', value: metrics.impressions, format: 'integer', status: trendStatus(trend.impressions, 'higher', thresholds), sub: trend.impressions === null ? 'Không có kỳ trước' : `${trend.impressions >= 0 ? '+' : ''}${Math.round(trend.impressions * 100)}% vs kỳ trước` },
    { key: 'clicks', label: 'Clicks', value: metrics.clicks, format: 'integer', status: trendStatus(trend.clicks, 'higher', thresholds), sub: trend.clicks === null ? 'Không có kỳ trước' : `${trend.clicks >= 0 ? '+' : ''}${Math.round(trend.clicks * 100)}% vs kỳ trước` },
    { key: 'ctr', label: 'CTR', value: metrics.ctr, format: 'percent', status: trendStatus(trend.ctr, 'higher', thresholds), sub: trend.ctr === null ? 'Clicks / Impressions' : `${trend.ctr >= 0 ? '+' : ''}${Math.round(trend.ctr * 100)}% vs kỳ trước` },
    { key: 'cpc', label: 'Average CPC', value: metrics.cpc, format: 'currency', status: trendStatus(trend.cpc, 'lower', thresholds), sub: trend.cpc === null ? 'Spend / Clicks' : `${trend.cpc >= 0 ? '+' : ''}${Math.round(trend.cpc * 100)}% vs kỳ trước` },
    { key: 'cpm', label: 'Average CPM', value: metrics.cpm, format: 'currency', status: trendStatus(trend.cpm, 'lower', thresholds), sub: trend.cpm === null ? 'Spend / 1.000 impressions' : `${trend.cpm >= 0 ? '+' : ''}${Math.round(trend.cpm * 100)}% vs kỳ trước` },
    { key: 'interactions', label: 'Interactions', value: metrics.interactions, format: 'integer', status: trendStatus(trend.interactions, 'higher', thresholds), sub: 'Main action theo ad format' },
    { key: 'interaction-rate', label: 'Interaction Rate', value: metrics.interactionRate, format: 'percent', status: { level: 'neutral', label: 'Media signal' }, sub: 'Interactions / Impressions' },
    { key: 'engagements', label: 'Engagements', value: metrics.engagements, format: 'integer', status: { level: 'neutral', label: 'Engagement' }, sub: 'Chỉ có ở format hỗ trợ' },
    { key: 'engagement-rate', label: 'Engagement Rate', value: metrics.engagementRate, format: 'percent', status: trendStatus(trend.engagementRate, 'higher', thresholds), sub: 'Engagements / Impressions' },
    { key: 'invalid-clicks', label: 'Invalid Clicks', value: metrics.invalidClicks, format: 'integer', status: metrics.invalidClickRate >= thresholds.invalidClickRateWatch ? { level: 'action', label: 'Cần kiểm tra' } : { level: 'neutral', label: 'Đã lọc' }, sub: 'Google xác định không hợp lệ' },
    { key: 'invalid-rate', label: 'Invalid Click Rate', value: metrics.invalidClickRate, format: 'percent', status: metrics.invalidClickRate >= thresholds.invalidClickRateWatch ? { level: 'action', label: 'Cao' } : { level: 'good', label: 'Trong ngưỡng' }, sub: `Ngưỡng theo dõi ${(thresholds.invalidClickRateWatch * 100).toFixed(0)}%` }
  ];

  return {
    period: { from, to, days: periodDays, previousFrom, previousTo, dataMin: bounds.min, dataMax: bounds.max, expectedLatest, todayKey, isPartialToday, daysBehind },
    metrics,
    previousMetrics,
    trend,
    daily,
    kpis,
    insights,
    recommendations: recommendations.slice(0, 10),
    health: {
      score: healthScore,
      level: healthLevel,
      title: healthTitle,
      summary: `${insights.good.length} tín hiệu tốt, ${insights.watch.length} điểm cần theo dõi và ${insights.action.length} vấn đề cần hành động.`,
      topPriority
    },
    campaignReviews: [...campaigns].sort((a, b) => b.cost - a.cost),
    tables,
    tableNotes: {
      campaigns: 'Media score kết hợp CTR/CPC so với benchmark, xu hướng kỳ trước, chất lượng click và mức đủ volume.',
      adgroups: 'Ad Group được đánh giá bằng traffic efficiency; so sánh trong đúng campaign và cùng kỳ.',
      ads: 'Ads có volume nhỏ được giữ trạng thái Chưa đủ volume để tránh kết luận sớm.',
      assetGroups: 'Với Performance Max, Ad Strength phản ánh độ đầy đủ và đa dạng asset; hãy hướng tới Good/Excellent.',
      devices: 'Chênh lệch CPC theo thiết bị là tín hiệu để điều tra, không phải lý do tự động loại thiết bị.',
      networks: 'Network mix có bản chất traffic khác nhau; đọc CTR/CPC cùng campaign type và xu hướng.'
    }
  };
}
