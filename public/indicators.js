export function calculateSMA(data, period) {
  return data.map((d, i, arr) => {
    if (i < period - 1) return null;
    const sum = arr.slice(i - period + 1, i + 1).reduce((acc, curr) => acc + curr.close, 0);
    return sum / period;
  });
}

export function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = null;
  return data.map((d, i) => {
    if (i < period - 1) return null;
    if (ema === null) {
      const sum = data.slice(0, period).reduce((acc, curr) => acc + curr.close, 0);
      ema = sum / period;
      return ema;
    }
    ema = (d.close * k) + (ema * (1 - k));
    return ema;
  });
}

export function calculateRSI(data, period = 14) {
  const rsi = new Array(data.length).fill(null);
  if (data.length <= period) return rsi;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 1))));
  }
  return rsi;
}

export function calculateMACD(data, fastP = 12, slowP = 26, signalP = 9) {
  const fastEMA = calculateEMA(data, fastP);
  const slowEMA = calculateEMA(data, slowP);
  const macdLine = data.map((d, i) => (fastEMA[i] !== null && slowEMA[i] !== null) ? fastEMA[i] - slowEMA[i] : null);

  // Compute Signal Line (EMA of MACD line)
  const validMacd = macdLine.filter(v => v !== null);
  const k = 2 / (signalP + 1);
  let signalEma = null;
  let validIdx = 0;

  const signalLine = macdLine.map(val => {
    if (val === null) return null;
    validIdx++;
    if (validIdx < signalP) return null;
    if (signalEma === null) {
      const sum = validMacd.slice(0, signalP).reduce((a, b) => a + b, 0);
      signalEma = sum / signalP;
      return signalEma;
    }
    signalEma = (val * k) + (signalEma * (1 - k));
    return signalEma;
  });

  return { macdLine, signalLine };
}

export function calculateBollingerBands(data, period = 20, multiplier = 2) {
  const sma = calculateSMA(data, period);
  return data.map((d, i) => {
    if (sma[i] === null) return { upper: null, lower: null, middle: null };
    const slice = data.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const variance = slice.reduce((acc, curr) => acc + Math.pow(curr.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
      middle: mean,
      upper: mean + (multiplier * stdDev),
      lower: mean - (multiplier * stdDev)
    };
  });
}