export default async function handler(req, res) {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  const url = `https://api.aozorahack.net/v0.1/${Array.isArray(path) ? path.join('/') : path}${req._parsedUrl.search || ''}`;
  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json, text/plain' } });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const data = await r.json();
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json(data);
    } else {
      const text = await r.text();
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(text);
    }
  } catch (e) {
    res.status(502).json({ error: 'Aozora API unreachable: ' + e.message });
  }
}
