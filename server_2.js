const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and serve static files from the 'public' directory
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit API Endpoint to route requests to Yahoo Finance
app.get('/api/data', async (req, res) => {
  const symbol = req.query.symbol || 'AAPL';
  const timeframe = req.query.timeframe || '1d';

  // Map timeframe parameters to Yahoo Finance interval/range formats
  let interval = '1d';
  let range = '1y';

  if (timeframe === '1h') {
    interval = '1h';
    range = '1mo';
  } else if (timeframe === '15m') {
    interval = '15m';
    range = '1mo';
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;

  try {
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Yahoo Finance returned status ${response.status}` });
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp) {
      return res.status(404).json({ error: 'No price data found for the requested ticker.' });
    }

    // Format Yahoo Finance JSON into standard OHLC array format
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];

    const formattedData = timestamps.map((ts, idx) => ({
      date: new Date(ts * 1000).toISOString(),
      open: quotes.open[idx] || quotes.close[idx],
      high: quotes.high[idx] || quotes.close[idx],
      low: quotes.low[idx] || quotes.close[idx],
      close: quotes.close[idx],
      volume: quotes.volume[idx] || 0
    })).filter(bar => bar.close !== null && bar.close !== undefined);

    res.json(formattedData);
  } catch (error) {
    console.error('Yahoo Fetch Proxy Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from Yahoo Finance endpoint.' });
  }
});


// Express 5 / path-to-regexp v8 catch-all route syntax
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index_2.html'));
});

app.listen(PORT, () => {
  console.log(`Server running smoothly on http://localhost:${PORT}`);
});