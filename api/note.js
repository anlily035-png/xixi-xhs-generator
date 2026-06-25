// Vercel Serverless Function — Upstash Redis read/write
// ENV: KV_REST_API_URL, KV_REST_API_TOKEN

const TTL = 60 * 60 * 24 * 7;

function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

async function redisSet(key, value, ttl) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // text/plain 确保 Upstash 把值当纯字符串存，不做额外 JSON 处理
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}?ex=${ttl}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`SET error ${res.status}: ${await res.text()}`);
}

async function redisGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET error ${res.status}`);
  const json = await res.json();
  return json.result ?? null;
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.statusCode = status;
  res.end(body);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }

  if (req.method === 'POST') {
    try {
      const { title, body, tags, images } = req.body || {};
      if (!title && !body) return send(res, 400, { error: '内容不能为空' });

      const id = shortId();
      await redisSet(`note:${id}`, { title, body, tags: tags || [], images: images || [] }, TTL);
      return send(res, 200, { id });
    } catch (err) {
      console.error('POST error:', err.message);
      return send(res, 500, { error: err.message });
    }
  }

  if (req.method === 'GET') {
    const id = req.query?.id;
    if (!id) return send(res, 400, { error: '缺少 id 参数' });

    try {
      let data = await redisGet(`note:${id}`);
      if (data === null) return send(res, 404, { error: '笔记不存在或已过期' });

      // 兜底：如果 Upstash 返回字符串，手动解析
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {}
      }

      return send(res, 200, data);
    } catch (err) {
      console.error('GET error:', err.message);
      return send(res, 500, { error: err.message });
    }
  }

  return send(res, 405, { error: 'Method not allowed' });
};
