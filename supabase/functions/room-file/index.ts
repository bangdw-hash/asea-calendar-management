// room-file — 링크형 업무방(room.html) 파일 업로드·열람 주소 발급
// - 권한 판단은 모두 DB 함수(rm_file_prepare / rm_file_paths / rm_admin_purge)가 하고, 이 함수는 그 결과대로 저장소 주소만 만듭니다.
// - 저장소 버킷 room-files 는 비공개입니다. 업로드용 주소는 한 번용, 열람용 주소는 1시간 뒤 만료됩니다.
const ORIGINS = ['https://bangdw-hash.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const BUCKET = 'room-files';

function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (req: Request, b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(req), 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function rpc(name: string, body: Record<string, unknown>) {
  const r = await fetch(URL_ + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body),
  });
  const t = await r.text();
  let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* 본문 없음 */ }
  if (!r.ok) return { error: String((j && j.message) || 'RPC_FAILED') };
  return { data: j };
}
const svc = (path: string, init: RequestInit) =>
  fetch(URL_ + '/storage/v1' + path, { ...init, headers: { apikey: SVC, Authorization: 'Bearer ' + SVC, 'Content-Type': 'application/json', ...(init.headers || {}) } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'METHOD' }, 405);
  let b: any = {};
  try { b = await req.json(); } catch { return json(req, { error: 'BAD_REQUEST' }, 400); }
  const action = String(b.action || '');

  if (action === 'prepare') {
    const p = await rpc('rm_file_prepare', { p_room: b.room, p_ptok: b.ptok, p_name: b.name, p_size: Number(b.size) || 0, p_mime: b.mime || '' });
    if (p.error) return json(req, { error: p.error }, 400);
    const path = p.data.path as string;
    const r = await svc('/object/upload/sign/' + BUCKET + '/' + path, { method: 'POST', body: '{}' });
    if (!r.ok) return json(req, { error: 'SIGN_FAILED', status: r.status, detail: (await r.text()).slice(0, 200) }, 500);
    const d = await r.json();
    const token = new URL(d.url, URL_ + '/storage/v1').searchParams.get('token');
    if (!token) return json(req, { error: 'SIGN_FAILED', detail: JSON.stringify(d).slice(0, 200) }, 500);
    return json(req, { path, token, kind: p.data.kind });
  }

  if (action === 'sign') {
    const ids = Array.isArray(b.ids) ? b.ids.slice(0, 100) : [];
    const p = await rpc('rm_file_paths', { p_room: b.room, p_ids: ids });
    if (p.error) return json(req, { error: p.error }, 400);
    const list = p.data as { id: string; path: string }[];
    if (!list.length) return json(req, { urls: {} });
    const r = await svc('/object/sign/' + BUCKET, { method: 'POST', body: JSON.stringify({ expiresIn: 3600, paths: list.map((x) => x.path) }) });
    if (!r.ok) return json(req, { error: 'SIGN_FAILED', status: r.status, detail: (await r.text()).slice(0, 200) }, 500);
    const d = await r.json() as { path: string; signedURL?: string }[];
    const byPath: Record<string, string> = {};
    for (const x of d) if (x.signedURL) byPath[x.path] = URL_ + '/storage/v1' + x.signedURL;
    const urls: Record<string, string> = {};
    for (const x of list) if (byPath[x.path]) urls[x.id] = byPath[x.path];
    return json(req, { urls });
  }

  if (action === 'purge') {
    const p = await rpc('rm_admin_purge', { p_tsk: b.tsk, p_id: b.id, p_days: Number(b.days) });
    if (p.error) return json(req, { error: p.error }, 400);
    const paths = (p.data.paths || []) as string[];
    if (paths.length) {
      const r = await svc('/object/' + BUCKET, { method: 'DELETE', body: JSON.stringify({ prefixes: paths }) });
      if (!r.ok) return json(req, { error: 'REMOVE_FAILED', removed: 0 }, 500);
    }
    return json(req, { removed: paths.length });
  }

  return json(req, { error: 'BAD_ACTION' }, 400);
});
