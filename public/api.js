import { initPart1, loadStock, renderMainChart } from './chartModule.js';
import { initHeatmapModule, generateHeatmap } from './heatmapModule.js';
import { runBacktest } from './backtestModule.js';

let currentStockData = null;
let bestOptimizedParams = null;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize dynamic controls
  initPart1((payload) => {
    currentStockData = payload.data;
  });

  initHeatmapModule();

  // Load default stock on entry
  loadStock('AAPL', (payload) => {
    currentStockData = payload.data;
  });

  // Event Listeners for Part 2 Analysis & Backtesting
  document.getElementById('part2-controls').addEventListener('click', (e) => {
    if (e.target.id === 'btnRunHeatmap' && currentStockData) {
      bestOptimizedParams = generateHeatmap(currentStockData);
    }
    
    if (e.target.id === 'btnApplyBest' && bestOptimizedParams && currentStockData) {
      runBacktest(currentStockData, bestOptimizedParams, (buySellSignals) => {
        // Callback overlays Buy/Sell indicators back onto Part 1 Chart
        renderMainChart(currentStockData, 'AAPL', buySellSignals);
      });
    }
  });
});