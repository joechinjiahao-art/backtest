export default function handler(req, res) {
  const { symbol, timeframe } = req.query;

  // Add your logic here to fetch or mock the market data
  const sampleData = [
    { date: '2026-01-01', close: 150.0, volume: 1000 },
    { date: '2026-01-02', close: 152.5, volume: 1200 },
    { date: '2026-01-03', close: 151.0, volume: 1100 }
  ];

  res.status(200).json(sampleData);
}