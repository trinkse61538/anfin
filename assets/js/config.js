window.REPORT_CONFIG = {
  reportName: 'Anfin Google Ads Media Review',
  spreadsheetId: '1nL55QAtwh9G6-_yOovnmj_sdcof_Kzv0hsNIbHDO_s0',
  timezone: 'Asia/Ho_Chi_Minh',
  currency: 'VND',
  defaultLookbackDays: 30,

  // Chỉ tải các cột phục vụ đánh giá delivery và traffic efficiency.
  datasets: {
    campaigns: {
      label: 'Campaign Daily',
      sheet: '07_GAds_Campaign_Daily',
      query: 'select A,D,E,F,G,H,N,O,Q,R,S,T,U,W,X,Z,AA,AO,AP,AQ,AR,AS,AT',
      required: true
    },
    adgroups: {
      label: 'Ad Group Daily',
      sheet: '08_GAds_AdGroup_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,O,P,Q,R,S,AC,AD,AE,AF,AG,AH',
      required: false
    },
    ads: {
      label: 'Ad Daily',
      sheet: '09_GAds_Ad_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,N,O,P,R,S,T,U,V,W,X,AG',
      required: false
    },
    assetGroups: {
      label: 'PMax Asset Group',
      sheet: '13_GAds_PMax_AssetGroup_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,N,O,P,Q,R,AA',
      required: false
    },
    devices: {
      label: 'Device Daily',
      sheet: '15_GAds_Device_Daily',
      query: 'select A,E,F,G,H,I,K,L,R',
      required: false
    },
    networks: {
      label: 'Network Daily',
      sheet: '16_GAds_Network_Daily',
      query: 'select A,E,F,G,H,I,J,L,M,S',
      required: false
    },
    videos: {
      label: 'Video Daily',
      sheet: '20_GAds_Video_Daily',
      query: 'select A,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,AC',
      required: false
    }
  },

  thresholds: {
    minImpressionsForDecision: 1000,
    minClicksForDecision: 30,
    ctrGoodVsPeer: 1.15,
    ctrLowVsPeer: 0.7,
    cpcGoodVsPeer: 0.85,
    cpcHighVsPeer: 1.35,
    trendWatch: 0.2,
    trendCritical: 0.35,
    spendConcentrationWatch: 0.55,
    invalidClickRateWatch: 0.05,
    weakAdStrength: ['POOR', 'INCOMPLETE'],
    strongAdStrength: ['GOOD', 'EXCELLENT']
  },

  references: {
    ctr: 'https://support.google.com/google-ads/answer/2615875?hl=en',
    engagements: 'https://support.google.com/google-ads/answer/6156146?hl=en',
    invalidTraffic: 'https://support.google.com/google-ads/answer/11182074?hl=en',
    pmaxAssets: 'https://support.google.com/google-ads/answer/14528220?hl=en'
  }
};
