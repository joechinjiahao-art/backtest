import yahooFinance from 'yahoo-finance2';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Enable Vercel Edge Caching (1 hour) to avoid hitting Yahoo rate limits
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const symbol = (req.query.symbol || 'AAPL').toUpperCase().trim();
  const timeframe = req.query.timeframe || '1d';

  try {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const queryOptions = {
      period1: startDate,
      interval: timeframe
    };

    // Pass custom fetch headers directly in moduleOptions to prevent global config merge crashes
    const moduleOptions = {
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    };

    const result = await yahooFinance.historical(symbol, queryOptions, moduleOptions);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: `No historical data found for symbol: ${symbol}` });
    }

    const formattedData = result
      .filter(bar => bar.close !== null && bar.close !== undefined)
      .map(bar => ({
        date: new Date(bar.date).toISOString().split('T')[0],
        open: parseFloat(bar.open.toFixed(2)),
        high: parseFloat(bar.high.toFixed(2)),
        low: parseFloat(bar.low.toFixed(2)),
        close: parseFloat(bar.close.toFixed(2)),
        volume: bar.volume || 0
      }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error('Yahoo Finance Fetch Error:', error);

    if (error.message && error.message.includes('Too Many Requests')) {
      return res.status(429).json({
        error: 'Rate limit hit on Yahoo Finance. Please wait a moment and try again.',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch market data from provider',
      details: error.message
    });
  }
}