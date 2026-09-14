import { calculateSMA, calculateEMA, calculateRSI } from './indicators.js';
import { updatePerformanceOverlay } from './chartModule.js';

let portfolioChart = null;

export function renderRiskInputForm() {
  const container = document.getElementById('risk-input-container');
  if (!container) return;

  container.innerHTML = `
    <div class="form-grid">
      <label>Initial Capital ($): <input type="number" id="initCapital" value="10000"></label>
      <label>Fixed Fee ($/trade): <input type="number" step="0.5" id="fixedFee" value="1.00"></label>
      <label>Percentage Fee (%): <input type="number" step="0.01" id="pctFee" value="0.10"></label>
      <label>Slippage (%): <input type="number" step="0.01" id="slippagePct" value="0.05"></label>
      <label>Stop Loss (%): <input type="number" step="0.1" id="stopLossPct" value="0"></label>
      <label>Take Profit (%): <input type="number" step="0.1" id="takeProfitPct" value="0"></label>
      <label>Max Trades Limit: <input type="number" id="maxTrades" value="5"></label>
      <label>Limit Window (Days): <input type="number" id="tradeWindow" value="1"></label>
    </div>
    <button id="btnRunBacktest" class="btn-success" style="margin-top:12px;">Run Model Evaluation & Forward Test</button>
  `;
}

export function evaluateStrategy(stockData, params, updateMainChartCallback, shouldRenderUI = true) {
  if (!stockData || stockData.length === 0) {
    return { portfolioHistory: [], metrics: {}, signals: [] };
  }

  const capitalInit = parseFloat(document.getElementById('initCapital')?.value) || 10000;
  const fixedFee = parseFloat(document.getElementById('fixedFee')?.value) || 0;
  const pctFee = (parseFloat(document.getElementById('pctFee')?.value) || 0) / 100;
  const slippage = (parseFloat(document.getElementById('slippagePct')?.value) || 0) / 100;
  
  const stopLoss = (parseFloat(document.getElementById('stopLossPct')?.value) || 0) / 100;
  const takeProfit = (parseFloat(document.getElementById('takeProfitPct')?.value) || 0) / 100;

  const maxTrades = parseInt(document.getElementById('maxTrades')?.value) || 999;
  const tradeWindowDays = parseInt(document.getElementById('tradeWindow')?.value) || 1;

  const fastArr = params.typeA === 'RSI' ? calculateRSI(stockData, params.fast) : 
                 (params.typeA === 'EMA' ? calculateEMA(stockData, params.fast) : calculateSMA(stockData, params.fast));
  const slowArr = params.typeB === 'EMA' ? calculateEMA(stockData, params.slow) : calculateSMA(stockData, params.slow);

  let capital = capitalInit;
  let shares = 0;
  let entryPrice = 0;
  const portfolioHistory = [];
  const signals = new Array(stockData.length).fill(null);
  const trades = [];
  const recentTradeTimestamps = [];

  for (let i = 0; i < stockData.length; i++) {
    const bar = stockData[i];
    const price = bar.close;
    const dateObj = new Date(bar.date);

    while (recentTradeTimestamps.length > 0 && (dateObj - recentTradeTimestamps[0]) > tradeWindowDays * 86400000) {
      recentTradeTimestamps.shift();
    }
    const canTrade = recentTradeTimestamps.length < maxTrades;

    if (shares > 0) {
      const pnlPct = (price - entryPrice) / entryPrice;
      let exitTriggered = false;

      if (stopLoss > 0 && pnlPct <= -stopLoss) exitTriggered = true;
      if (takeProfit > 0 && pnlPct >= takeProfit) exitTriggered = true;

      if (exitTriggered) {
        const exitPrice = price * (1 - slippage);
        const grossValue = shares * exitPrice;
        const totalFee = fixedFee + (grossValue * pctFee);
        capital = grossValue - totalFee;

        trades.push({ pnl: capital - capitalInit, pnlPct: (exitPrice - entryPrice) / entryPrice });
        shares = 0;
        signals[i] = 'SELL';
        recentTradeTimestamps.push(dateObj);
      }
    }

    if (i > 0 && fastArr[i] !== null && slowArr[i] !== null) {
      const crossedAbove = fastArr[i] > slowArr[i] && fastArr[i - 1] <= slowArr[i - 1];
      const crossedBelow = fastArr[i] < slowArr[i] && fastArr[i - 1] >= slowArr[i - 1];

      if (crossedAbove && shares === 0 && canTrade) {
        const buyPrice = price * (1 + slippage);
        const totalFee = fixedFee + (capital * pctFee);
        const netCapital = capital - totalFee;
        
        if (netCapital > 0) {
          shares = netCapital / buyPrice;
          capital = 0;
          entryPrice = buyPrice;
          signals[i] = 'BUY';
          recentTradeTimestamps.push(dateObj);
        }
      } else if (crossedBelow && shares > 0 && canTrade) {
        const sellPrice = price * (1 - slippage);
        const grossValue = shares * sellPrice;
        const totalFee = fixedFee + (grossValue * pctFee);
        capital = grossValue - totalFee;

        trades.push({ pnl: (sellPrice - entryPrice) * shares - totalFee, pnlPct: (sellPrice - entryPrice) / entryPrice });
        shares = 0;
        signals[i] = 'SELL';
        recentTradeTimestamps.push(dateObj);
      }
    }

    const currentVal = capital + (shares * price);
    portfolioHistory.push(currentVal);
  }

  const metrics = calculateMetrics(portfolioHistory, trades, stockData, capitalInit);

  if (shouldRenderUI) {
    const dates = stockData.map(d => d.date.split('T')[0]);
    renderPortfolioChart(dates, [{
      label: 'Equity Curve ($)',
      data: portfolioHistory,
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22,163,74,0.1)',
      fill: true,
      tension: 0.1
    }]);
    updatePerformanceOverlay(metrics);
    if (updateMainChartCallback) updateMainChartCallback(signals);
    generateCodeExports(params, stopLoss, takeProfit);
  }

  return { portfolioHistory, metrics, signals };
}

export function renderPortfolioChart(labels, datasets, splitIndex = null) {
  const canvasElem = document.getElementById('portfolioChart');
  if (!canvasElem) return;

  const ctx = canvasElem.getContext('2d');
  if (portfolioChart) portfolioChart.destroy();

  // Custom Chart.js Plugin to render Forward Test boundary divider & zone labels
  const forwardTestPlugin = {
    id: 'forwardTestBoundary',
    beforeDraw: (chart) => {
      if (splitIndex === null || splitIndex <= 0 || splitIndex >= labels.length) return;

      const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
      const xPos = x.getPixelForValue(splitIndex);

      ctx.save();

      // 1. Highlight In-Sample (Backtest) Area
      ctx.fillStyle = 'rgba(226, 232, 240, 0.3)';
      ctx.fillRect(left, top, xPos - left, bottom - top);

      // 2. Highlight Out-of-Sample (Forward Test) Area
      ctx.fillStyle = 'rgba(220, 252, 231, 0.35)';
      ctx.fillRect(xPos, top, right - xPos, bottom - top);

      // 3. Draw Vertical Dividing Line
      ctx.beginPath();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();

      // 4. Draw Section Labels
      ctx.font = 'bold 12px sans-serif';
      
      // In-Sample Label
      ctx.fillStyle = '#64748b';
      ctx.fillText('⬅ BACKTEST (In-Sample)', left + 10, top + 20);

      // Out-of-Sample Label
      ctx.fillStyle = '#15803d';
      ctx.fillText('FORWARD TEST (Out-of-Sample) ➔', xPos + 10, top + 20);

      ctx.restore();
    }
  };

  portfolioChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      }
    },
    plugins: [forwardTestPlugin]
  });
}

function calculateMetrics(portfolioHistory, trades, stockData, capitalInit) {
  const finalVal = portfolioHistory[portfolioHistory.length - 1] || capitalInit;
  const totalReturn = (((finalVal - capitalInit) / capitalInit) * 100).toFixed(2);
  const buyHoldReturn = stockData.length > 0 
    ? (((stockData[stockData.length - 1].close - stockData[0].close) / stockData[0].close) * 100).toFixed(2)
    : '0.00';

  const returns = [];
  for (let i = 1; i < portfolioHistory.length; i++) {
    returns.push((portfolioHistory[i] - portfolioHistory[i - 1]) / portfolioHistory[i - 1]);
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const stdDev = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / (returns.length || 1));
  const sharpeRatio = stdDev > 0 ? ((avgReturn / stdDev) * Math.sqrt(252)).toFixed(2) : '0.00';

  let peak = portfolioHistory[0] || capitalInit;
  let maxDrawdown = 0;
  for (const val of portfolioHistory) {
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    totalReturn,
    buyHoldReturn,
    sharpeRatio,
    maxDrawdown: (maxDrawdown * 100).toFixed(2),
    totalTrades: trades.length
  };
}

function generateCodeExports(params, stopLoss, takeProfit) {
  const exportBox = document.getElementById('code-export-container');
  if (!exportBox) return;

  const pineScript = `//@version=5\nstrategy("Optimised Strategy", overlay=true)\nfastMA = ta.${params.typeA.toLowerCase()}(close, ${params.fast})\nslowMA = ta.${params.typeB.toLowerCase()}(close, ${params.slow})\nif (ta.crossover(fastMA, slowMA))\n    strategy.entry("Buy", strategy.long)\nif (ta.crossunder(fastMA, slowMA))\n    strategy.close("Buy")`;
  const pythonScript = `# Quant Execution Script\nimport pandas as pd\ndef generate_signals(df):\n    df['fast_ma'] = df['close'].rolling(${params.fast}).mean()\n    df['slow_ma'] = df['close'].rolling(${params.slow}).mean()\n    return df`;

  exportBox.innerHTML = `
    <h3>🚀 Strategy Code Exporters</h3>
    <div class="export-grid">
      <div><h4>TradingView (Pine Script v5)</h4><textarea readonly>${pineScript}</textarea></div>
      <div><h4>Python Quant API</h4><textarea readonly>${pythonScript}</textarea></div>
    </div>
  `;
}