// task-auth — 업무진행 평가툴(task.html) 로그인
// - 브라우저가 보낸 Google ID 토큰을 Google(tokeninfo)에 확인하고, 발급 대상(aud)이 본 앱이고 이메일이 인증된 경우에만
//   DB 함수 tsk_login(service_role 전용)을 호출해 세션 토큰을 돌려줍니다. 비밀번호는 사용하지 않습니다.
const CLIENT_ID = '89094526186-ngj72p8cbqrvai06e2uhdiq0n5brrc2b.apps.googleusercontent.com';
const ORIGINS = ['https://bangdw-hash.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'METHOD' }, 405);
  let credential = '';
  try { credential = String((await req.json()).credential || ''); } catch { /* 아래에서 처리 */ }
  if (!credential || credential.length > 4096) return json(req, { error: 'BAD_REQUEST' }, 400);

  const g = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!g.ok) return json(req, { error: 'GOOGLE_REJECTED' }, 401);
  const t = await g.json();
  const issOk = t.iss === 'https://accounts.google.com' || t.iss === 'accounts.google.com';
  if (t.aud !== CLIENT_ID || !issOk || String(t.email_verified) !== 'true' || !t.email || Number(t.exp) * 1000 < Date.now()) {
    return json(req, { error: 'GOOGLE_INVALID' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/tsk_login';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
    body: JSON.stringify({ p_email: t.email, p_name: t.name || '' }),
  });
  if (!r.ok) {
    const e = await r.text();
    return json(req, { error: e.includes('PENDING_FULL') ? 'PENDING_FULL' : 'LOGIN_FAILED' }, 500);
  }
  const d = await r.json();
  return json(req, { ...d, email: String(t.email).toLowerCase(), name: t.name || '' });
});
