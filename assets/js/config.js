window.REPORT_CONFIG = {
  reportName: 'Google Ads Intelligence Report',
  spreadsheetId: '1nL55QAtwh9G6-_yOovnmj_sdcof_Kzv0hsNIbHDO_s0',
  timezone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  defaultLookbackDays: 30,

  // Chỉ tải các cột report thật sự dùng để trang nhẹ hơn.
  // Google Visualization JSONP giúp GitHub Pages đọc Sheet mà không cần API key.
  datasets: {
    plan: {
      label: 'Plan',
      sheet: '04_Plan',
      query: 'select *',
      required: false
    },
    leads: {
      label: 'Actual Leads',
      sheet: '05_Actual_Leads',
      query: 'select *',
      required: false
    },
    campaigns: {
      label: 'Campaign Daily',
      sheet: '07_GAds_Campaign_Daily',
      query: 'select A,D,E,F,G,H,N,O,Q,AB,AC,AE,AG,AH,AO,AP,AQ,AR,AS,AT',
      required: true
    },
    adgroups: {
      label: 'Ad Group Daily',
      sheet: '08_GAds_AdGroup_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,O,T,U,W,Y,Z,AC,AF,AG,AH',
      required: false
    },
    ads: {
      label: 'Ad Daily',
      sheet: '09_GAds_Ad_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,O,P,Q,S,Y,Z,AB,AD,AG',
      required: false
    },
    conversions: {
      label: 'Conversion Daily',
      sheet: '10_GAds_Conversion_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,N,O,P,R',
      required: false
    },
    assetGroups: {
      label: 'PMax Asset Group',
      sheet: '13_GAds_PMax_AssetGroup_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,O,S,T,V,X,Y,Z,AA',
      required: false
    },
    devices: {
      label: 'Device Daily',
      sheet: '15_GAds_Device_Daily',
      query: 'select A,E,F,G,H,I,K,N,O,Q,R',
      required: false
    },
    networks: {
      label: 'Network Daily',
      sheet: '16_GAds_Network_Daily',
      query: 'select A,E,F,G,H,I,K,N,O,Q,R,S',
      required: false
    },
    videos: {
      label: 'Video Daily',
      sheet: '20_GAds_Video_Daily',
      query: 'select A,E,F,G,H,I,J,K,M,O,P,T,U,V,W,Y,Z,AB,AC',
      required: false
    }
  },

  thresholds: {
    minClicksForDecision: 30,
    minConversionsForCplDecision: 3,
    minSpendVsTargetCpl: 1,
    cplGoodMultiplier: 1,
    cplWatchMultiplier: 1.2,
    cplCriticalMultiplier: 1.5,
    targetAttainmentGood: 0.95,
    targetAttainmentWatch: 0.8,
    budgetPacingLow: 0.8,
    budgetPacingHigh: 1.15,
    leadMismatchPct: 0.2,
    lostBudgetShareWatch: 0.2,
    lostRankShareWatch: 0.3,
    lowIntentConversionShare: 0.6,
    conversionValueCoverageLow: 0.1,
    trendChangeWatch: 0.2
  },

  references: {
    conversionGoals: 'https://support.google.com/google-ads/answer/11461796?hl=en',
    impressionShare: 'https://support.google.com/google-ads/answer/7103314?hl=en',
    pmaxAssets: 'https://support.google.com/google-ads/answer/14528220?hl=en',
    targetCpa: 'https://support.google.com/google-ads/answer/6268632?hl=en'
  }
};
