import { YahooFinance } from 'yahoo-finance2';

// Instantiate the YahooFinance client
const yahooFinance = new YahooFinance();

export default async function handler(req, res) {
  // CORS Headers
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

  const symbol = (req.query.symbol || 'AAPL').toUpperCase().trim();
  const timeframe = req.query.timeframe || '1d';

  try {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const queryOptions = {
      period1: startDate.toISOString().split('T')[0],
      interval: timeframe
    };

    // Call historical method on the instantiated yahooFinance object
    const result = await yahooFinance.historical(symbol, queryOptions);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: `No historical data found for symbol: ${symbol}` });
    }

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