import { evaluateStrategy, renderPortfolioChart } from './backtestModule_2.js';

let cachedStockData = [];
let cachedSelectedStrategies = [];

export function initPart3ValidationPanel() {
  const container = document.getElementById('part3-controls');
  if (!container) return;

  container.innerHTML = `
    <div class="form-grid">
      <label>In-Sample Split (%): <input type="number" id="inSamplePct" value="70"></label>
      <label>Walk-Forward Windows: <input type="number" id="wfWindows" value="4"></label>
      <label>Execution Mode: 
        <select id="evalModeSelect">
          <option value="ensemble">Ensemble Weighted Mix</option>
          <option value="individual">Individual Strategy Display</option>
        </select>
      </label>
      <label>Ensemble Weighting: 
        <select id="ensembleType">
          <option value="equal">Equal Weight (1/N)</option>
          <option value="sharpe">Sharpe-Weighted</option>
        </select>
      </label>
    </div>
    <div id="individualStratSelectorContainer" style="margin-top:10px; display:none;">
      <label><strong>Active Strategy Focus:</strong> 
        <select id="individualStratSelect" style="padding:4px; margin-left:6px;"></select>
      </label>
    </div>
  `;

  document.getElementById('evalModeSelect').addEventListener('change', (e) => {
    const isIndiv = e.target.value === 'individual';
    document.getElementById('individualStratSelectorContainer').style.display = isIndiv ? 'block' : 'none';
    if (cachedStockData.length > 0 && cachedSelectedStrategies.length > 0) {
      executePart3Validation(cachedStockData, cachedSelectedStrategies);
    }
  });

  document.getElementById('individualStratSelect')?.addEventListener('change', () => {
    if (cachedStockData.length > 0 && cachedSelectedStrategies.length > 0) {
      executePart3Validation(cachedStockData, cachedSelectedStrategies);
    }
  });
}

export function executePart3Validation(stockData, selectedStrategies) {
  if (!selectedStrategies || selectedStrategies.length === 0) {
    alert('No strategies selected from Part 2.');
    return;
  }

  cachedStockData = stockData;
  cachedSelectedStrategies = selectedStrategies;

  // Update Individual Selector Options if needed
  const stratSelect = document.getElementById('individualStratSelect');
  if (stratSelect) {
    stratSelect.innerHTML = selectedStrategies.map((s, idx) => 
      `<option value="${idx}">[${s.type}] Params: ${s.params} (Sharpe: ${s.deflatedSharpe})</option>`
    ).join('');
  }

  const isPct = (parseFloat(document.getElementById('inSamplePct').value) || 70) / 100;
  const splitIdx = Math.floor(stockData.length * isPct);

  const inSampleData = stockData.slice(0, splitIdx);
  const outOfSampleData = stockData.slice(splitIdx);

  const evalMode = document.getElementById('evalModeSelect')?.value || 'ensemble';
  const dates = stockData.map(d => d.date.split('T')[0]);

  // Evaluate full dataset for complete equity curve overlay
  const allHistories = [];
  selectedStrategies.forEach(strat => {
    const params = {
      fast: strat.fast,
      slow: strat.slow,
      typeA: strat.type.split('/')[0],
      typeB: strat.type.split('/')[1] || 'SMA'
    };
    const res = evaluateStrategy(stockData, params, null, false);
    allHistories.push(res.portfolioHistory);
  });

  let datasetsToRender = [];

  if (evalMode === 'ensemble') {
    const ensembleEquity = blendEnsemble(allHistories);
    datasetsToRender.push({
      label: 'Ensemble Portfolio Equity ($)',
      data: ensembleEquity,
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22, 163, 74, 0.08)',
      fill: true,
      tension: 0.1
    });
  } else {
    const activeIdx = parseInt(document.getElementById('individualStratSelect')?.value) || 0;
    const activeStrat = selectedStrategies[activeIdx] || selectedStrategies[0];
    datasetsToRender.push({
      label: `Individual: ${activeStrat.type} (${activeStrat.params})`,
      data: allHistories[activeIdx],
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37, 99, 235, 0.08)',
      fill: true,
      tension: 0.1
    });
  }

  // Render Chart with Explicit In-Sample vs. Out-of-Sample Boundary
  renderPortfolioChart(dates, datasetsToRender, splitIdx);

  // Calculate Walk-Forward Efficiency on Primary Candidate
  const wfEfficiency = calculateWalkForwardEfficiency(inSampleData, outOfSampleData, selectedStrategies[0]);

  document.getElementById('walkForwardMetrics').innerHTML = `
    <div><strong>In-Sample (Backtesting):</strong> ${inSampleData.length} bars (${dates[0]} to ${dates[splitIdx - 1]})</div>
    <div><strong>Out-of-Sample (Forward Testing):</strong> ${outOfSampleData.length} bars (${dates[splitIdx]} to ${dates[dates.length - 1]})</div>
    <div><strong>Walk-Forward Efficiency (WFE):</strong> <span class="highlight">${wfEfficiency}%</span></div>
    <div><strong>Active Evaluation Mode:</strong> ${evalMode === 'ensemble' ? `Ensemble (${selectedStrategies.length} Models)` : 'Individual Model Focus'}</div>
  `;
}

function blendEnsemble(histories) {
  if (!histories || histories.length === 0) return [];
  const length = histories[0].length;
  const numModels = histories.length;
  const ensemble = [];

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < numModels; j++) {
      sum += histories[j][i];
    }
    ensemble.push(sum / numModels);
  }
  return ensemble;
}

function calculateWalkForwardEfficiency(isData, oosData, strategy) {
  if (!isData.length || !oosData.length) return 0;

  const params = {
    fast: strategy.fast,
    slow: strategy.slow,
    typeA: strategy.type.split('/')[0],
    typeB: strategy.type.split('/')[1] || 'SMA'
  };

  const isRes = evaluateStrategy(isData, params, null, false);
  const oosRes = evaluateStrategy(oosData, params, null, false);

  const isReturn = parseFloat(isRes.metrics.totalReturn);
  const oosReturn = parseFloat(oosRes.metrics.totalReturn);

  if (isReturn <= 0) return 0;
  return Math.min(100, Math.max(0, ((oosReturn / isReturn) * 100).toFixed(1)));
}