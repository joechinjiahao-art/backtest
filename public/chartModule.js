import { calculateSMA, calculateEMA, calculateRSI } from './indicators.js';

let currentChartData = [];

export function initPart1(onDataLoadedCallback) {
  const controls = document.getElementById('part1-controls');
  if (!controls) return;

  controls.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
      <label><strong>Ticker:</strong> 
        <input type="text" id="tickerInput" value="AAPL" style="width:70px; padding:4px;">
      </label>
      <label><strong>Timeframe:</strong> 
        <select id="timeframeSelect" style="padding:4px;">
          <option value="1d">Daily (1D)</option>
          <option value="1h">Hourly (1H)</option>
          <option value="15m">15 Min (15M)</option>
        </select>
      </label>
      <button id="btnFetchMarketData" class="btn-primary">Fetch Data</button>
      <button id="btnSaveLocalStorage" style="background:#64748b; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;">Save to Local Storage</button>
      
      <div style="margin-left:15px; display:flex; gap:8px; font-size:0.85rem;">
        <label><input type="checkbox" id="chkSMA" checked> Overlay SMA (20)</label>
        <label><input type="checkbox" id="chkEMA" checked> Overlay EMA (50)</label>
      </div>
    </div>
  `;

  const banner = document.getElementById('data-status-banner');
  if (banner) {
    banner.className = 'status-banner success';
    banner.innerText = 'Part 1 Initialized: Ready to fetch live market data.';
  }

  document.getElementById('btnFetchMarketData').addEventListener('click', async () => {
    const ticker = document.getElementById('tickerInput').value.toUpperCase();
    const timeframe = document.getElementById('timeframeSelect').value;
    if (banner) {
      banner.className = 'status-banner warning';
      banner.innerText = `Fetching ${ticker} (${timeframe}) market data...`;
    }

    try {
      const response = await fetch(`/api/data?symbol=${ticker}&timeframe=${timeframe}`);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: Failed to reach server endpoint.`);
      }
      const data = await response.json();
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('Received empty or invalid market data payload.');
      }

      currentChartData = data;
      renderMainPlot(currentChartData);
      if (banner) {
        banner.className = 'status-banner success';
        banner.innerText = `Successfully loaded ${data.length} bars for ${ticker}.`;
      }
      if (onDataLoadedCallback) onDataLoadedCallback({ symbol: ticker, data: currentChartData });
    } catch (err) {
      console.error('Data Fetch Error:', err);
      if (banner) {
        banner.className = 'status-banner error';
        banner.innerText = `🚨 Fetch Failed: Unable to reach Yahoo Finance (${err.message}). Check CORS / origin headers or backend proxy endpoint.`;
      }
    }
  });

  document.getElementById('btnSaveLocalStorage').addEventListener('click', () => {
    if (!currentChartData || currentChartData.length === 0) {
      alert('No data available to save.');
      return;
    }
    const ticker = document.getElementById('tickerInput').value.toUpperCase();
    localStorage.setItem(`quant_data_${ticker}`, JSON.stringify(currentChartData));
    alert(`Saved ${currentChartData.length} data points for ${ticker} to LocalStorage!`);
  });

  document.getElementById('chkSMA').addEventListener('change', () => renderMainPlot(currentChartData));
  document.getElementById('chkEMA').addEventListener('change', () => renderMainPlot(currentChartData));
}

export function loadLocal(key, callback) {
  const ticker = key.split('_')[0] || 'AAPL';
  const banner = document.getElementById('data-status-banner');

  const saved = localStorage.getItem(`quant_data_${ticker}`);
  if (saved) {
    currentChartData = JSON.parse(saved);
    if (banner) {
      banner.className = 'status-banner success';
      banner.innerText = `Loaded ${currentChartData.length} bars from LocalStorage (${ticker}).`;
    }
    renderMainPlot(currentChartData);
    if (callback) callback({ symbol: ticker, data: currentChartData });
  } else {
    if (banner) {
      banner.className = 'status-banner warning';
      banner.innerText = `No cached LocalStorage data found for ${ticker}. Please click 'Fetch Data'.`;
    }
  }
}

export function renderMainPlot(data, signals = null) {
  const chartTarget = document.getElementById('mainPriceChart');
  if (!data || data.length === 0 || !chartTarget) return;

  const dates = data.map(d => d.date);
  const opens = data.map(d => d.open);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const closes = data.map(d => d.close);

  const candlestickTrace = {
    x: dates, open: opens, high: highs, low: lows, close: closes,
    type: 'candlestick', name: 'OHLC'
  };

  const traces = [candlestickTrace];

  const showSMA = document.getElementById('chkSMA')?.checked;
  const showEMA = document.getElementById('chkEMA')?.checked;

  if (showSMA) {
    traces.push({
      x: dates, y: calculateSMA(data, 20), type: 'scatter', mode: 'lines', name: 'SMA (20)',
      line: { color: '#2563eb', width: 1.5 }
    });
  }

  if (showEMA) {
    traces.push({
      x: dates, y: calculateEMA(data, 50), type: 'scatter', mode: 'lines', name: 'EMA (50)',
      line: { color: '#dc2626', width: 1.5 }
    });
  }

  if (signals) {
    const buyX = [], buyY = [];
    const sellX = [], sellY = [];

    signals.forEach((sig, idx) => {
      if (sig === 'BUY') {
        buyX.push(dates[idx]);
        buyY.push(lows[idx] * 0.98);
      } else if (sig === 'SELL') {
        sellX.push(dates[idx]);
        sellY.push(highs[idx] * 1.02);
      }
    });

    if (buyX.length > 0) {
      traces.push({
        x: buyX, y: buyY, mode: 'markers', name: 'Buy Signal',
        marker: { symbol: 'triangle-up', size: 12, color: '#16a34a' }
      });
    }

    if (sellX.length > 0) {
      traces.push({
        x: sellX, y: sellY, mode: 'markers', name: 'Sell Signal',
        marker: { symbol: 'triangle-down', size: 12, color: '#dc2626' }
      });
    }
  }

  const layout = {
    title: 'Market Price Action & Technical Overlays',
    dragmode: 'zoom',
    showlegend: true,
    autosize: true,
    xaxis: { rangeslider: { visible: false } },
    yaxis: { title: 'Price ($)' },
    margin: { t: 40, b: 30, l: 50, r: 20 }
  };

  setTimeout(() => {
    Plotly.newPlot('mainPriceChart', traces, layout, { responsive: true }).then(() => {
      Plotly.Plots.resize('mainPriceChart');
    });
  }, 50);

  updateSideDashboard(data);
}

function updateSideDashboard(data) {
  const sidePanel = document.getElementById('indicator-dashboard');
  if (!sidePanel) return;

  const latest = data[data.length - 1];
  const prev = data[data.length - 2] || latest;
  const change = (((latest.close - prev.close) / prev.close) * 100).toFixed(2);

  sidePanel.innerHTML = `
    <h3>Asset Metrics</h3>
    <div style="font-size:0.9rem; line-height:1.6;">
      <div><strong>Last Close:</strong> $${latest.close.toFixed(2)}</div>
      <div><strong>24h Change:</strong> <span style="color:${change >= 0 ? '#16a34a':'#dc2626'}">${change}%</span></div>
      <div><strong>High:</strong> $${latest.high.toFixed(2)}</div>
      <div><strong>Low:</strong> $${latest.low.toFixed(2)}</div>
      <div><strong>Volume:</strong> ${latest.volume || 150000}</div>
    </div>
  `;
}

export function updatePerformanceOverlay(metrics) {
  const sidePanel = document.getElementById('indicator-dashboard');
  if (!sidePanel) return;

  sidePanel.innerHTML += `
    <hr style="margin:12px 0; border:none; border-top:1px solid #e2e8f0;">
    <h3>Backtest Performance</h3>
    <div style="font-size:0.85rem; line-height:1.6;">
      <div><strong>Total Return:</strong> ${metrics.totalReturn}%</div>
      <div><strong>Buy & Hold:</strong> ${metrics.buyHoldReturn}%</div>
      <div><strong>Sharpe Ratio:</strong> ${metrics.sharpeRatio}</div>
      <div><strong>Max Drawdown:</strong> ${metrics.maxDrawdown}%</div>
      <div><strong>Total Trades:</strong> ${metrics.totalTrades}</div>
    </div>
  `;
}