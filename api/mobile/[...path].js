const BACKEND_BASE = 'https://whitesmoke-jay-438498.hostingersite.com/api/v1';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path || '';
  const query = { ...req.query };
  delete query.path;
  const search = new URLSearchParams(query).toString();
  const target = `${BACKEND_BASE}/${path}${search ? `?${search}` : ''}`;

  try {
    const headers = {};
    for (const [key, value] of Object.entries(req.headers || {})) {
      const lower = key.toLowerCase();
      if (['host', 'connection', 'content-length'].includes(lower)) continue;
      headers[key] = Array.isArray(value) ? value.join(',') : value;
    }
    const body = ['GET', 'HEAD'].includes(req.method || 'GET')
      ? undefined
      : typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body
        : JSON.stringify(req.body || {});
    const response = await fetch(target, { method: req.method, headers, body });
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ message: 'Backend proxy failed', detail: error instanceof Error ? error.message : String(error) });
  }
};
