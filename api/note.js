// Vercel Serverless Function — Upstash Redis read/write
// ENV: KV_REST_API_URL, KV_REST_API_TOKEN

const TTL = 60 * 60 * 24 * 7; // 7 days in seconds

function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

async function redisSet(key, value, ttl) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // POST /set/key?ex=seconds  body = value string
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}?ex=${ttl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value), // Upstash accepts any JSON as value
  });
  if (!res.ok) throw new Error(`Upstash SET error ${res.status}`);
  return res.json();
}

async function redisGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  // GET /get/key  → { result: <value> }
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Upstash GET error ${res.status}`);
  const json = await res.json();
  return json.result; // null if key doesn't exist
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST /api/note — save note, return short id
  if (req.method === 'POST') {
    try {
      const { title, body, tags, images } = req.body || {};
      if (!title && !body) return res.status(400).json({ error: '内容不能为空' });

      const id = shortId();
      const data = { title, body, tags: tags || [], images: images || [] };

      await redisSet(`note:${id}`, data, TTL);
      return res.status(200).json({ id });
    } catch (err) {
      console.error('POST error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // GET /api/note?id=xxx — retrieve note
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: '缺少 id 参数' });

    try {
      const raw = await redisGet(`note:${id}`);
      if (raw === null || raw === undefined) {
        return res.status(404).json({ error: '笔记不存在或已过期' });
      }

      // debug: reveal exactly what Upstash returned
      if (req.query.debug === '1') {
        return res.status(200).json({ rawType: typeof raw, raw });
      }

      // Upstash /get returns the value as-is (already parsed JSON object)
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return res.status(200).json(data);
    } catch (err) {
      console.error('GET error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
