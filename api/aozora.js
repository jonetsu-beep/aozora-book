export default async function handler(req, res) {
  // パスとクエリパラメータを正しく分離する
  const { path, ...queryParams } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : (path || 'books');

  // クエリ文字列を再構築（title= など）
  const qs = new URLSearchParams(queryParams).toString();
  const url = `https://api.aozorahack.net/v0.1/${pathStr}${qs ? '?' + qs : ''}`;

  try {
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json, text/plain, */*' }
    });

    if (!r.ok) {
      res.status(r.status).json({ error: `Aozora API returned ${r.status}` });
      return;
    }

    const ct = r.headers.get('content-type') || '';
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (ct.includes('json')) {
      const data = await r.json();
      res.json(data);
    } else {
      const text = await r.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(text);
    }
  } catch (e) {
    res.status(502).json({ error: 'Aozora API unreachable: ' + e.message });
  }
}
