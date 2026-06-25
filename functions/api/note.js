// Cloudflare Pages Function — /api/note
// ENV: KV_REST_API_URL, KV_REST_API_TOKEN (set in Cloudflare Pages dashboard)

const TTL = 60 * 60 * 24 * 7;

function shortId() {
  return Math.random().toString(36).slice(2, 9);
}

async function redisSet(key, value, ttl, env) {
  const res = await fetch(`${env.KV_REST_API_URL}/set/${encodeURIComponent(key)}?ex=${ttl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.KV_REST_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`SET error ${res.status}: ${await res.text()}`);
}

async function redisGet(key, env) {
  const res = await fetch(`${env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`GET error ${res.status}`);
  const json = await res.json();
  return json.result ?? null;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  if (request.method === 'POST') {
    try {
      const { title, body, tags, images } = await request.json();
      if (!title && !body) return json({ error: '内容不能为空' }, 400);

      const id = shortId();
      await redisSet(`note:${id}`, { title, body, tags: tags || [], images: images || [] }, TTL, env);
      return json({ id });
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  if (request.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: '缺少 id 参数' }, 400);

    try {
      let data = await redisGet(`note:${id}`, env);
      if (data === null) return json({ error: '笔记不存在或已过期' }, 404);

      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {}
      }

      return json(data);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}
