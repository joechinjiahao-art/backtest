import { calculateSMA, calculateEMA, calculateRSI } from './indicators.js';

export function initHeatmapModule() {
  const controls = document.getElementById('part2-controls');
  
  controls.innerHTML = `
    <label>Fast/Trigger Indicator:
      <select id="indA">
        <option value="SMA">SMA (Simple Moving Avg)</option>
        <option value="EMA">EMA (Exponential Moving Avg)</option>
        <option value="RSI">RSI (Relative Strength Index)</option>
      </select>
    </label>
    <label>Slow/Filter Indicator:
      <select id="indB">
        <option value="SMA">SMA (Simple Moving Avg)</option>
        <option value="EMA">EMA (Exponential Moving Avg)</option>
      </select>
    </label>
    <button id="btnRunHeatmap" class="btn-primary">Generate Relationship Matrix</button>
  `;
}

export function generateHeatmap(stockData) {
  const typeA = document.getElementById('indA').value;
  const typeB = document.getElementById('indB').value;

  const fastRange = [5, 10, 14, 20, 25, 30];
  const slowRange = [35, 40, 45, 50, 55, 60];

  const zMatrix = [];
  let bestReturn = -Infinity;
  let bestParams = { fast: 10, slow: 50, typeA, typeB, returnVal: 0 };

  for (let i = 0; i < slowRange.length; i++) {
    const row = [];
    for (let j = 0; j < fastRange.length; j++) {
      const fP = fastRange[j];
      const sP = slowRange[i];

      const ret = simulatePair(stockData, fP, sP, typeA, typeB);
      row.push(ret);

      if (ret > bestReturn) {
        bestReturn = ret;
        bestParams = { fast: fP, slow: sP, typeA, typeB, returnVal: ret };
      }
    }
    zMatrix.push(row);
  }

  const plotlyData = [{
    z: zMatrix,
    x: fastRange,
    y: slowRange,
    type: 'heatmap',
    colorscale: 'Viridis'
  }];

  const layout = {
    title: `Returns Matrix: ${typeA} vs ${typeB} (%)`,
    xaxis: { title: `${typeA} Period (Fast)` },
    yaxis: { title: `${typeB} Period (Slow)` },
    margin: { t: 40, b: 50, l: 60, r: 20 }
  };

  Plotly.newPlot('heatmapPlot', plotlyData, layout);

  document.getElementById('explicit-rules-display').innerHTML = `
    <div class="rule-card">
      <h4>⚡ Optimised Strategy Parameters</h4>
      <p><strong>Buy Condition:</strong> When <code>${typeA}(${bestParams.fast})</code> crosses ABOVE <code>${typeB}(${bestParams.slow})</code></p>
      <p><strong>Sell Condition:</strong> When <code>${typeA}(${bestParams.fast})</code> crosses BELOW <code>${typeB}(${bestParams.slow})</code></p>
      <p><strong>Optimal Matrix Return:</strong> <span class="highlight">${bestParams.returnVal}%</span></p>
    </div>
  `;

  return bestParams;
}

function simulatePair(data, fP, sP, typeA, typeB) {
  const fastVal = typeA === 'RSI' ? calculateRSI(data, fP) : (typeA === 'EMA' ? calculateEMA(data, fP) : calculateSMA(data, fP));
  const slowVal = typeB === 'EMA' ? calculateEMA(data, sP) : calculateSMA(data, sP);

  let cap = 10000, shares = 0;
  for (let i = 1; i < data.length; i++) {
    if (fastVal[i] !== null && slowVal[i] !== null) {
      if (fastVal[i] > slowVal[i] && fastVal[i - 1] <= slowVal[i - 1] && cap > 0) {
        shares = cap / data[i].close; cap = 0;
      } else if (fastVal[i] < slowVal[i] && fastVal[i - 1] >= slowVal[i - 1] && shares > 0) {
        cap = shares * data[i].close; shares = 0;
      }
    }
  }
  const finalVal = cap + (shares * data[data.length - 1].close);
  return parseFloat((((finalVal - 10000) / 10000) * 100).toFixed(2));
}