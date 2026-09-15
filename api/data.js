import yahooFinance from 'yahoo-finance2';

// Silence internal Node deprecation warnings if needed
process.noDeprecation = true;

// Disable global strict schema validation to prevent crashing on partial nulls
yahooFinance.setGlobalConfig({
  validation: {
    logErrors: false,
  },
});

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { symbol = 'AAPL', timeframe = '1d' } = req.query;

  try {
    // Standard 2-year lookback period for backtesting
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 2);

    const queryOptions = {
      period1: startDate.toISOString().split('T')[0],
      period2: endDate.toISOString().split('T')[0],
      interval: timeframe === '1d' ? '1d' : timeframe === '1w' ? '1wk' : '1d',
    };

    // Pass { validateResult: false } as the 3rd argument to suppress partial-null throws
    const rawData = await yahooFinance.historical(
      symbol.trim().toUpperCase(),
      queryOptions,
      { validateResult: false }
    );

    if (!Array.isArray(rawData) || rawData.length === 0) {
      return res.status(400).json({ error: `No historical market data found for symbol: ${symbol}` });
    }

    // Filter out corrupted/null records and map into strictly-typed numbers
    const cleanData = rawData
      .filter(
        (bar) =>
          bar &&
          bar.date &&
          bar.close !== null &&
          bar.open !== null &&
          bar.high !== null &&
          bar.low !== null
      )
      .map((bar) => ({
        date: bar.date instanceof Date ? bar.date.toISOString() : bar.date,
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseInt(bar.volume, 10) || 0,
      }));

    return res.status(200).json(cleanData);
  } catch (error) {
    console.error(`Yahoo Finance Fetch Error [Symbol: ${symbol}]:`, error);
    return res.status(500).json({ error: error.message || 'Failed to fetch market data.' });
  }
}