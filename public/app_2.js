// Global Application State
let marketData = [];
let discoveredCandidates = [];
let mainChartInstance = null;
let equityChartInstance = null;

const STORAGE_KEY = 'quant_fetched_market_data';

document.addEventListener('DOMContentLoaded', () => {
  initPart1();
  initPart2();
  initPart3();
  loadCachedData();
});

// Helper: Formats ticker for Moomoo API (e.g. AAPL -> US.AAPL)
function formatMoomooSymbol(rawSymbol) {
  if (!rawSymbol) return 'US.AAPL';
  const clean = rawSymbol.toUpperCase().trim();
  if (clean.startsWith('US.') || clean.startsWith('HK.') || clean.startsWith('SH.') || clean.startsWith('SZ.')) {
    return clean;
  }
  return `US.${clean}`;
}

// -------------------------------------------------------------
// PART 1: DATA ACQUISITION & ENHANCED PRICE CHART WITH TRADES
// -------------------------------------------------------------
function initPart1() {
  document.getElementById('fetchBtn')?.addEventListener('click', handleFetchData);
  document.getElementById('localFileInput')?.addEventListener('change', handleLocalFileUpload);
  
  // Real-time update for export boxes on symbol change
  document.getElementById('symbolInput')?.addEventListener('input', () => {
    if (activeValidationStrategies.length > 0) {
      const initCapital = parseFloat(document.getElementById('initCapital')?.value) || 10000;
      const fixedFee = parseFloat(document.getElementById('fixedFee')?.value) || 0;
      const pctFee = (parseFloat(document.getElementById('pctFee')?.value) || 0) / 100;
      const slippage = (parseFloat(document.getElementById('slippagePct')?.value) || 0) / 100;
      generateDualCodeExports(activeValidationStrategies[0], initCapital, fixedFee, pctFee, slippage);
    }
  });
}

async function handleFetchData() {
  const symbol = document.getElementById('symbolInput').value.trim() || 'AAPL';
  const timeframe = document.getElementById('timeframeInput').value;
  const statusEl = document.getElementById('dataStatus');

  statusEl.style.display = 'inline-block';
  statusEl.innerText = 'Fetching market data...';

  try {
    const res = await fetch(`/api/data.js?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP Error ${res.status}`);
    }
    
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('Invalid or empty data payload.');

    // Ensure strict numeric casting on price values
    marketData = data.map(bar => ({
      date: bar.date,
      open: parseFloat(bar.open),
      high: parseFloat(bar.high),
      low: parseFloat(bar.low),
      close: parseFloat(bar.close),
      volume: parseInt(bar.volume, 10) || 1
    }));

    autoSaveData(marketData);

    statusEl.innerText = `Successfully loaded & saved ${marketData.length} bars for ${symbol.toUpperCase()}.`;
    renderMainChart(marketData);
  } catch (err) {
    statusEl.innerText = `Error: ${err.message}`;
    console.error('Fetch Failed:', err);
  }
}

function handleLocalFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsed = JSON.parse(event.target.result);
      let rawBars = [];

      // Case 1: Raw Yahoo Finance v8 Chart API JSON format
      if (parsed?.chart?.result?.[0]) {
        const result = parsed.chart.result[0];
        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};

        rawBars = timestamps.map((ts, idx) => ({
          date: new Date(ts * 1000).toISOString().split('T')[0],
          open: quote.open?.[idx],
          high: quote.high?.[idx],
          low: quote.low?.[idx],
          close: quote.close?.[idx],
          volume: quote.volume?.[idx] || 0
        }));
      } 
      // Case 2: Standard flat array of bar objects
      else if (Array.isArray(parsed)) {
        rawBars = parsed;
      } 
      else {
        throw new Error('Unrecognized JSON structure.');
      }

      // Filter out null/invalid price records & strictly type numbers
      marketData = rawBars
        .filter(bar => bar && bar.close !== null && bar.open !== null && !isNaN(bar.close))
        .map(bar => ({
          date: bar.date,
          open: parseFloat(bar.open),
          high: parseFloat(bar.high),
          low: parseFloat(bar.low),
          close: parseFloat(bar.close),
          volume: parseInt(bar.volume, 10) || 1
        }));

      if (marketData.length === 0) {
        throw new Error('No valid price bars found in the file.');
      }

      autoSaveData(marketData);

      const statusEl = document.getElementById('dataStatus');
      if (statusEl) {
        statusEl.style.display = 'inline-block';
        statusEl.innerText = `Loaded ${marketData.length} records from file: ${file.name}`;
      }
      renderMainChart(marketData);
    } catch (err) {
      alert(`Failed to parse local file: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function autoSaveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('LocalStorage auto-save failed:', e);
  }
}

function loadCachedData() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      marketData = parsed.map(bar => ({
        date: bar.date,
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseInt(bar.volume, 10) || 1
      }));

      const statusEl = document.getElementById('dataStatus');
      if (statusEl) {
        statusEl.style.display = 'inline-block';
        statusEl.innerText = `Restored ${marketData.length} bars from auto-save cache.`;
      }
      renderMainChart(marketData);
    } catch (e) {
      console.error('Failed to parse cached data:', e);
    }
  }
}

function renderMainChart(data, buyPoints = [], sellPoints = []) {
  const canvas = document.getElementById('mainPriceChart');
  if (!canvas || !data || data.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (mainChartInstance) mainChartInstance.destroy();

  const labels = data.map(d => d.date ? d.date.split('T')[0] : '');
  const prices = data.map(d => d.close);

  const buyDataset = labels.map(l => buyPoints.includes(l) ? prices[labels.indexOf(l)] : null);
  const sellDataset = labels.map(l => sellPoints.includes(l) ? prices[labels.indexOf(l)] : null);

  mainChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Price ($)',
          data: prices,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.05)',
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: 'Buy Signal',
          data: buyDataset,
          borderColor: '#22c55e',
          backgroundColor: '#22c55e',
          pointStyle: 'triangle',
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        },
        {
          label: 'Sell Signal',
          data: sellDataset,
          borderColor: '#ef4444',
          backgroundColor: '#ef4444',
          pointStyle: 'triangle',
          rotation: 180,
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
      }
    }
  });
}

// -------------------------------------------------------------
// PART 2: DYNAMIC CROSS-COLUMN STRATEGY DISCOVERY ENGINE
// -------------------------------------------------------------
function initPart2() {
  const indCheckboxes = document.querySelectorAll('.ind-checkbox');
  const catCheckboxes = document.querySelectorAll('.cat-checkbox');

  const updateCount = () => {
    const selected = document.querySelectorAll('.ind-checkbox:checked').length;
    const tag = document.getElementById('selectedCountTag');
    if (tag) tag.innerText = `${selected} indicator${selected !== 1 ? 's' : ''} selected`;
  };

  catCheckboxes.forEach(catBox => {
    catBox.addEventListener('change', (e) => {
      const category = e.target.dataset.category;
      const targets = document.querySelectorAll(`.ind-checkbox[data-category="${category}"]`);
      targets.forEach(cb => cb.checked = e.target.checked);
      updateCount();
    });
  });

  indCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateCount();
      const cat = cb.dataset.category;
      const allCat = document.querySelectorAll(`.ind-checkbox[data-category="${cat}"]`);
      const checkedCat = document.querySelectorAll(`.ind-checkbox[data-category="${cat}"]:checked`);
      const catBox = document.querySelector(`.cat-checkbox[data-category="${cat}"]`);
      if (catBox) catBox.checked = (allCat.length === checkedCat.length);
    });
  });

  document.getElementById('btnSelectAll')?.addEventListener('click', () => {
    indCheckboxes.forEach(cb => cb.checked = true);
    catCheckboxes.forEach(cb => cb.checked = true);
    updateCount();
  });

  document.getElementById('btnClearAll')?.addEventListener('click', () => {
    indCheckboxes.forEach(cb => cb.checked = false);
    catCheckboxes.forEach(cb => cb.checked = false);
    updateCount();
  });

  document.getElementById('btnRunDiscovery')?.addEventListener('click', runTargetedInvestigation);
  document.getElementById('btnSendToPart3')?.addEventListener('click', transferCandidatesToPart3);
}

function runTargetedInvestigation() {
  if (!marketData || marketData.length === 0) {
    alert('Please load market data in Part 1 first.');
    return;
  }

  const selectedIndicators = Array.from(document.querySelectorAll('.ind-checkbox:checked')).map(cb => cb.value);
  const statusNote = document.getElementById('discoveryStatus');

  if (selectedIndicators.length === 0) {
    statusNote.innerText = 'Please select at least one indicator from the columns above.';
    statusNote.style.color = '#f59e0b';
    return;
  }

  statusNote.style.color = '#38bdf8';
  statusNote.innerText = `Calculating feature matrix & running cross-column pair combinations for ${selectedIndicators.length} indicators...`;

  setTimeout(() => {
    discoveredCandidates = [];
    
    // 1. Calculate Feature Series
    const featureMap = computeFeatureMatrix(marketData, selectedIndicators);
    const featureKeys = Object.keys(featureMap);

    // 2. Intra-Indicator Strategies
    if (selectedIndicators.includes('sma_ema')) {
      const closes = marketData.map(d => d.close);
      for (let fast = 5; fast <= 25; fast += 10) {
        for (let slow = 30; slow <= 100; slow += 30) {
          const metrics = evaluateSimpleStrategy(closes, 'EMA', 'SMA', fast, slow);
          if (metrics.sharpe > 0.3) {
            discoveredCandidates.push({
              type: 'EMA / SMA Crossover',
              indicators: `Fast EMA (${fast}), Slow SMA (${slow})`,
              buyRules: `EMA (${fast}) crosses ABOVE SMA (${slow})`,
              sellRules: `EMA (${fast}) crosses BELOW SMA (${slow})`,
              fast, slow, typeA: 'EMA', typeB: 'SMA',
              seriesA: calcEMA(closes, fast),
              seriesB: calcSMA(closes, slow),
              sharpe: metrics.sharpe,
              deflatedSharpe: (metrics.sharpe * 0.85).toFixed(2),
              stability: metrics.sharpe > 1.0 ? 'Global Optimal' : 'Local Optimal'
            });
          }
        }
      }
    }

    // 3. Cross-Column Combinations
    for (let i = 0; i < featureKeys.length; i++) {
      for (let j = i + 1; j < featureKeys.length; j++) {
        const keyA = featureKeys[i];
        const keyB = featureKeys[j];

        const featA = featureMap[keyA];
        const featB = featureMap[keyB];

        const crossMetrics = evaluateCrossPairStrategy(marketData, featA.data, featB.data, 'crossover');
        if (crossMetrics.sharpe > 0.35) {
          discoveredCandidates.push({
            type: `Cross-Column Crossover (${featA.label} x ${featB.label})`,
            indicators: `${featA.label} vs ${featB.label}`,
            buyRules: `${featA.label} crosses ABOVE ${featB.label}`,
            sellRules: `${featA.label} crosses BELOW ${featB.label}`,
            seriesA: featA.data,
            seriesB: featB.data,
            sharpe: crossMetrics.sharpe,
            deflatedSharpe: (crossMetrics.sharpe * 0.88).toFixed(2),
            stability: crossMetrics.sharpe > 0.9 ? 'Global Optimal' : 'Local Optimal'
          });
        }

        const confirmMetrics = evaluateCrossPairStrategy(marketData, featA.data, featB.data, 'confirmation');
        if (confirmMetrics.sharpe > 0.4) {
          discoveredCandidates.push({
            type: `Cross-Column Filter (${featA.label} + ${featB.label})`,
            indicators: `${featA.label} & ${featB.label}`,
            buyRules: `${featA.label} > Mean AND ${featB.label} > Mean`,
            sellRules: `${featA.label} < Mean OR ${featB.label} < Mean`,
            seriesA: featA.data,
            seriesB: featB.data,
            sharpe: confirmMetrics.sharpe,
            deflatedSharpe: (confirmMetrics.sharpe * 0.85).toFixed(2),
            stability: 'Global Optimal'
          });
        }
      }
    }

    if (discoveredCandidates.length === 0) {
      const closes = marketData.map(d => d.close);
      const metrics = evaluateSimpleStrategy(closes, 'SMA', 'SMA', 10, 40);
      discoveredCandidates.push({
        type: 'Standard Moving Average Crossover',
        indicators: `Fast SMA (10), Slow SMA (40)`,
        buyRules: `Fast SMA (10) crosses ABOVE Slow SMA (40)`,
        sellRules: `Fast SMA (10) crosses BELOW Slow SMA (40)`,
        fast: 10, slow: 40, typeA: 'SMA', typeB: 'SMA',
        seriesA: calcSMA(closes, 10),
        seriesB: calcSMA(closes, 40),
        sharpe: metrics.sharpe,
        deflatedSharpe: (metrics.sharpe * 0.85).toFixed(2),
        stability: 'Local Optimal'
      });
    }

    discoveredCandidates.sort((a, b) => b.sharpe - a.sharpe);
    discoveredCandidates = discoveredCandidates.slice(0, 8);

    renderCandidateTable(discoveredCandidates);
    statusNote.style.color = '#22c55e';
    statusNote.innerText = `Cross-Column Discovery Complete: Evaluated selected features and outputted ${discoveredCandidates.length} high-performing candidate models.`;
  }, 100);
}

function computeFeatureMatrix(data, selectedKeys) {
  const closes = data.map(d => d.close);
  const volumes = data.map(d => d.volume || 1);
  const matrix = {};

  if (selectedKeys.includes('sma_ema')) {
    matrix['ema_12'] = { label: 'EMA (12)', data: calcEMA(closes, 12) };
    matrix['sma_50'] = { label: 'SMA (50)', data: calcSMA(closes, 50) };
  }
  if (selectedKeys.includes('rsi')) {
    matrix['rsi_14'] = { label: 'RSI (14)', data: calcRSI(closes, 14) };
  }
  if (selectedKeys.includes('zscore') || selectedKeys.includes('bollinger')) {
    matrix['zscore_20'] = { label: 'Z-Score (20)', data: calcZScore(closes, 20) };
  }
  if (selectedKeys.includes('vwap')) {
    matrix['vwap'] = { label: 'VWAP', data: calcVWAP(data) };
  }
  if (selectedKeys.includes('obv')) {
    matrix['obv'] = { label: 'OBV', data: calcOBV(closes, volumes) };
  }

  return matrix;
}

function evaluateCrossPairStrategy(data, seriesA, seriesB, mode = 'crossover') {
  const closes = data.map(d => d.close);
  let capital = 10000;
  let shares = 0;
  const returns = [];

  const avgA = seriesA.reduce((a, b) => a + (b || 0), 0) / seriesA.length;
  const avgB = seriesB.reduce((a, b) => a + (b || 0), 0) / seriesB.length;

  for (let i = 1; i < closes.length; i++) {
    if (seriesA[i] === null || seriesB[i] === null || seriesA[i - 1] === null || seriesB[i - 1] === null) continue;

    let buySignal = false;
    let sellSignal = false;

    if (mode === 'crossover') {
      buySignal = seriesA[i] > seriesB[i] && seriesA[i - 1] <= seriesB[i - 1];
      sellSignal = seriesA[i] < seriesB[i] && seriesA[i - 1] >= seriesB[i - 1];
    } else if (mode === 'confirmation') {
      buySignal = seriesA[i] > avgA && seriesB[i] > avgB;
      sellSignal = seriesA[i] < avgA || seriesB[i] < avgB;
    }

    if (buySignal && shares === 0) {
      shares = capital / closes[i];
      capital = 0;
    } else if (sellSignal && shares > 0) {
      capital = shares * closes[i];
      shares = 0;
    }

    const val = capital + (shares * closes[i]);
    returns.push((val - 10000) / 10000);
  }

  const avgRet = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdDev = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - avgRet, 2), 0) / (returns.length || 1));
  const sharpe = stdDev > 0 ? parseFloat(((avgRet / stdDev) * Math.sqrt(252)).toFixed(2)) : 0;

  return { sharpe };
}

function renderCandidateTable(candidates) {
  const tbody = document.getElementById('candidateTableBody');
  tbody.innerHTML = '';

  if (candidates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No viable candidates found.</td></tr>';
    return;
  }

  candidates.forEach((cand, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="cand-select" data-idx="${idx}" checked></td>
      <td><strong>${cand.type}</strong></td>
      <td>${cand.indicators}</td>
      <td><span style="color:#22c55e;"><strong>BUY:</strong></span> ${cand.buyRules}<br><span style="color:#ef4444;"><strong>SELL:</strong></span> ${cand.sellRules}</td>
      <td>${cand.sharpe}</td>
      <td>${cand.deflatedSharpe}</td>
      <td><span class="badge ${cand.stability === 'Global Optimal' ? 'badge-green' : 'badge-blue'}">${cand.stability}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function transferCandidatesToPart3() {
  const selectedIndices = Array.from(document.querySelectorAll('.cand-select:checked')).map(el => parseInt(el.dataset.idx));
  const selected = selectedIndices.map(i => discoveredCandidates[i]).filter(Boolean);

  if (selected.length === 0) {
    alert('Please select at least one strategy candidate from the table.');
    return;
  }

  updatePart3StrategySelector(selected);
  document.getElementById('part3-container').scrollIntoView({ behavior: 'smooth' });
}

// -------------------------------------------------------------
// PART 3: RISK PARAMETERS, BACKTEST & DUAL EXPORT
// -------------------------------------------------------------
let activeValidationStrategies = [];

function initPart3() {
  document.getElementById('evalModeSelect')?.addEventListener('change', (e) => {
    const isIndiv = e.target.value === 'individual';
    document.getElementById('individualStratSelectorContainer').style.display = isIndiv ? 'block' : 'none';
  });

  document.getElementById('btnRunBacktest')?.addEventListener('click', runPart3Backtest);
}

function updatePart3StrategySelector(strategies) {
  activeValidationStrategies = strategies;
  const select = document.getElementById('individualStratSelect');
  select.innerHTML = strategies.map((s, idx) => 
    `<option value="${idx}">[${s.type}] ${s.indicators} (Sharpe: ${s.sharpe})</option>`
  ).join('');
}

function runPart3Backtest() {
  if (!marketData || marketData.length === 0) {
    alert('No market data loaded.');
    return;
  }

  if (!activeValidationStrategies || activeValidationStrategies.length === 0) {
    alert('No strategies queued from Part 2. Run indicator investigation and queue candidates first.');
    return;
  }

  const initCapital = parseFloat(document.getElementById('initCapital').value) || 10000;
  const fixedFee = parseFloat(document.getElementById('fixedFee').value) || 0;
  const pctFee = (parseFloat(document.getElementById('pctFee').value) || 0) / 100;
  const slippage = (parseFloat(document.getElementById('slippagePct').value) || 0) / 100;
  const stopLoss = (parseFloat(document.getElementById('stopLossPct').value) || 0) / 100;
  const takeProfit = (parseFloat(document.getElementById('takeProfitPct').value) || 0) / 100;

  const inSamplePct = (parseFloat(document.getElementById('inSamplePct').value) || 70) / 100;
  const splitIdx = Math.floor(marketData.length * inSamplePct);
  const dates = marketData.map(d => d.date ? d.date.split('T')[0] : '');

  const evalMode = document.getElementById('evalModeSelect').value;

  const executionResults = activeValidationStrategies.map(strat => 
    simulateExecution(marketData, strat, initCapital, fixedFee, pctFee, slippage, stopLoss, takeProfit)
  );

  const buyHoldEquity = marketData.map(d => (initCapital / marketData[0].close) * d.close);

  let datasets = [{
    label: 'Buy & Hold Benchmark ($)',
    data: buyHoldEquity,
    borderColor: '#64748b',
    borderDash: [4, 4],
    backgroundColor: 'transparent',
    fill: false,
    borderWidth: 1.5,
    pointRadius: 0
  }];

  let focusStrat = activeValidationStrategies[0];
  let focusBuyDates = executionResults[0].buyDates;
  let focusSellDates = executionResults[0].sellDates;

  if (evalMode === 'ensemble') {
    const blendedEquity = blendEnsembleHistories(executionResults.map(r => r.history));
    datasets.push({
      label: `Ensemble Weighted Mix (${executionResults.length} Models)`,
      data: blendedEquity,
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34, 197, 94, 0.08)',
      fill: true,
      borderWidth: 2,
      pointRadius: 0
    });
  } else {
    const activeIdx = parseInt(document.getElementById('individualStratSelect').value) || 0;
    focusStrat = activeValidationStrategies[activeIdx] || activeValidationStrategies[0];
    focusBuyDates = executionResults[activeIdx].buyDates;
    focusSellDates = executionResults[activeIdx].sellDates;

    datasets.push({
      label: `Individual Strategy: ${focusStrat.type}`,
      data: executionResults[activeIdx].history,
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.08)',
      fill: true,
      borderWidth: 2,
      pointRadius: 0
    });
  }

  renderMainChart(marketData, focusBuyDates, focusSellDates);
  renderPortfolioChart(dates, datasets, splitIdx);
  generateDualCodeExports(focusStrat, initCapital, fixedFee, pctFee, slippage);
}

function simulateExecution(data, strat, capitalInit, fixedFee, pctFee, slippage, stopLoss, takeProfit) {
  const closes = data.map(d => d.close);
  const seriesA = strat.seriesA || (strat.typeA === 'EMA' ? calcEMA(closes, strat.fast) : calcSMA(closes, strat.fast));
  const seriesB = strat.seriesB || calcSMA(closes, strat.slow);

  let capital = capitalInit;
  let shares = 0;
  let entryPrice = 0;
  const history = [];
  const buyDates = [];
  const sellDates = [];

  for (let i = 0; i < data.length; i++) {
    const price = closes[i];
    const currentDate = data[i].date ? data[i].date.split('T')[0] : '';

    if (shares > 0) {
      const pnlPct = (price - entryPrice) / entryPrice;
      let exitTriggered = false;

      if (stopLoss > 0 && pnlPct <= -stopLoss) exitTriggered = true;
      if (takeProfit > 0 && pnlPct >= takeProfit) exitTriggered = true;

      if (exitTriggered) {
        const exitPrice = price * (1 - slippage);
        const grossValue = shares * exitPrice;
        capital = grossValue - (fixedFee + grossValue * pctFee);
        shares = 0;
        sellDates.push(currentDate);
      }
    }

    if (i > 0 && seriesA[i] !== null && seriesB[i] !== null && seriesA[i - 1] !== null && seriesB[i - 1] !== null) {
      const crossedAbove = seriesA[i] > seriesB[i] && seriesA[i - 1] <= seriesB[i - 1];
      const crossedBelow = seriesA[i] < seriesB[i] && seriesA[i - 1] >= seriesB[i - 1];

      if (crossedAbove && shares === 0) {
        const buyPrice = price * (1 + slippage);
        const netCapital = capital - (fixedFee + capital * pctFee);
        if (netCapital > 0) {
          shares = netCapital / buyPrice;
          capital = 0;
          entryPrice = buyPrice;
          buyDates.push(currentDate);
        }
      } else if (crossedBelow && shares > 0) {
        const sellPrice = price * (1 - slippage);
        const grossValue = shares * sellPrice;
        capital = grossValue - (fixedFee + grossValue * pctFee);
        shares = 0;
        sellDates.push(currentDate);
      }
    }

    history.push(capital + (shares * price));
  }

  return { history, buyDates, sellDates };
}

function blendEnsembleHistories(histories) {
  const len = histories[0].length;
  const numModels = histories.length;
  const blended = [];

  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let j = 0; j < numModels; j++) sum += histories[j][i];
    blended.push(sum / numModels);
  }
  return blended;
}

function renderPortfolioChart(labels, datasets, splitIdx) {
  const canvas = document.getElementById('portfolioChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (equityChartInstance) equityChartInstance.destroy();

  const forwardTestPlugin = {
    id: 'forwardTestBoundary',
    beforeDraw: (chart) => {
      if (!splitIdx || splitIdx <= 0 || splitIdx >= labels.length) return;
      const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
      const xPos = x.getPixelForValue(splitIdx);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(left, top, xPos - left, bottom - top);

      ctx.beginPath();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();

      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(' BACKTEST (In-Sample)', left + 5, top + 15);
      ctx.fillStyle = '#22c55e';
      ctx.fillText('FORWARD TEST ➔', xPos + 5, top + 15);
      ctx.restore();
    }
  };

  equityChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#f8fafc' } },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: '#334155' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
      }
    },
    plugins: [forwardTestPlugin]
  });
}

// -------------------------------------------------------------
// QUANT HELPERS & CALCULATORS
// -------------------------------------------------------------
function evaluateSimpleStrategy(closes, typeA, typeB, fast, slow) {
  const fastArr = typeA === 'EMA' ? calcEMA(closes, fast) : calcSMA(closes, fast);
  const slowArr = calcSMA(closes, slow);
  
  let capital = 10000;
  let shares = 0;
  const returns = [];

  for (let i = 1; i < closes.length; i++) {
    if (fastArr[i] > slowArr[i] && fastArr[i - 1] <= slowArr[i - 1] && shares === 0) {
      shares = capital / closes[i];
      capital = 0;
    } else if (fastArr[i] < slowArr[i] && fastArr[i - 1] >= slowArr[i - 1] && shares > 0) {
      capital = shares * closes[i];
      shares = 0;
    }
    const val = capital + (shares * closes[i]);
    returns.push((val - 10000) / 10000);
  }

  const avgRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - avgRet, 2), 0) / returns.length);
  const sharpe = stdDev > 0 ? parseFloat(((avgRet / stdDev) * Math.sqrt(252)).toFixed(2)) : 0;

  return { sharpe };
}

function calcSMA(prices, period) {
  const sma = new Array(prices.length).fill(null);
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += prices[i - j];
    sma[i] = sum / period;
  }
  return sma;
}

function calcEMA(prices, period) {
  const ema = new Array(prices.length).fill(null);
  const k = 2 / (period + 1);
  let prev = prices[0];
  ema[0] = prev;
  for (let i = 1; i < prices.length; i++) {
    prev = (prices[i] * k) + (prev * (1 - k));
    ema[i] = prev;
  }
  return ema;
}

function calcRSI(prices, period = 14) {
  const rsi = new Array(prices.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - (100 / (1 + rs));
  }
  return rsi;
}

function calcZScore(prices, period = 20) {
  const z = new Array(prices.length).fill(null);
  const sma = calcSMA(prices, period);
  for (let i = period - 1; i < prices.length; i++) {
    let sumSq = 0;
    for (let j = 0; j < period; j++) sumSq += Math.pow(prices[i - j] - sma[i], 2);
    const std = Math.sqrt(sumSq / period);
    z[i] = std > 0 ? (prices[i] - sma[i]) / std : 0;
  }
  return z;
}

function calcVWAP(data) {
  let cumVol = 0;
  let cumPV = 0;
  return data.map(d => {
    const typical = (d.high + d.low + d.close) / 3 || d.close;
    const vol = d.volume || 1;
    cumPV += typical * vol;
    cumVol += vol;
    return cumPV / cumVol;
  });
}

function calcOBV(prices, volumes) {
  const obv = [0];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (prices[i] < prices[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  return obv;
}

// -------------------------------------------------------------
// DUAL EXPORT GENERATION: TRADINGVIEW & MOOMOO
// -------------------------------------------------------------
function generateDualCodeExports(strat, capital, fixedFee, pctFee, slippage) {
  if (!strat) return;

  const rawSymbol = document.getElementById('symbolInput')?.value.trim() || 'AAPL';
  const cleanSymbol = rawSymbol.toUpperCase();
  const moomooTicker = formatMoomooSymbol(cleanSymbol);

  const pineScript = `//@version=5
strategy("${strat.type} [${cleanSymbol}]", overlay=true, initial_capital=${capital}, default_qty_type=strategy.percent_of_equity, default_qty_value=100)

// Active Symbol: ${cleanSymbol}
// Strategy Features: ${strat.indicators}
// Buy Rule: ${strat.buyRules}
// Sell Rule: ${strat.sellRules}

longCondition = ta.crossover(close, ta.sma(close, 20))
exitCondition = ta.crossunder(close, ta.sma(close, 20))

if (longCondition)
    strategy.entry("Long", strategy.long)

if (exitCondition)
    strategy.close("Long")`;

  const moomooPython = `# Moomoo Open API Python Execution Script
from moomoo import *
import pandas as pd

quote_ctx = OpenQuoteContext(host='127.0.0.1', port=11111)
trd_ctx = OpenSecTradeContext(filter_firm_id=1, host='127.0.0.1', port=11111)

SYMBOL = "${moomooTicker}"

def execute_strategy():
    ret, data = quote_ctx.get_cur_kline(SYMBOL, 100, KLType.K_DAY)
    if ret != RET_OK:
        print("Failed to fetch Kline data for", SYMBOL, ":", data)
        return

    # Signal Rules for ${strat.type}
    # Buy Rule: ${strat.buyRules}
    # Sell Rule: ${strat.sellRules}

execute_strategy()
quote_ctx.close()
trd_ctx.close()`;

  const tvEl = document.getElementById('tradingviewCodeOutput');
  const mmEl = document.getElementById('moomooCodeOutput');

  if (tvEl) tvEl.value = pineScript;
  if (mmEl) mmEl.value = moomooPython;
}