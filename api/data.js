import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  // CORS Headers (Allows your frontend to call this endpoint without cross-origin issues)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Parse query parameters from frontend request
  const symbol = (req.query.symbol || 'AAPL').toUpperCase().trim();
  const timeframe = req.query.timeframe || '1d'; // '1d', '1wk', or '1mo'

  try {
    // Calculate start date (1 year back by default)
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const queryOptions = {
      period1: startDate.toISOString().split('T')[0],
      interval: timeframe
    };

    // Fetch historical data from Yahoo Finance API
    const result = await yahooFinance.historical(symbol, queryOptions);

    if (!result || result.length === 0) {
      return res.status(444).json({ error: `No historical data found for symbol: ${symbol}` });
    }

    // Format bars to match the structure expected by app_2.js
    const formattedData = result
      .filter(bar => bar.close !== null && bar.close !== undefined)
      .map(bar => ({
        date: bar.date.toISOString().split('T')[0],
        open: parseFloat(bar.open.toFixed(2)),
        high: parseFloat(bar.high.toFixed(2)),
        low: parseFloat(bar.low.toFixed(2)),
        close: parseFloat(bar.close.toFixed(2)),
        volume: bar.volume || 0
      }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error('Yahoo Finance Fetch Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch market data from provider',
      details: error.message
    });
  }
}