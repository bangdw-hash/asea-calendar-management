// budget-ai — 부서 입력판 AI (코드 매칭 · 코드 Q&A · 접속 점검)
// - 부서/관리자 로그인 토큰을 DB(bgt_e_ctx)로 확인한 뒤에만 AI를 호출합니다. 키는 서버(ANTHROPIC_API_KEY)에만 있습니다.
// - 코드는 기존 코드표(bgt.codes)에 있는 목(mok)만 고릅니다. 새 코드는 만들지 않으며, 맞는 것이 없어도 가장 가까운 기존 코드를 고릅니다.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const MODEL = 'claude-sonnet-5-5';
const FALLBACK: Record<string, string> = { '세출': '7.1.1', '세입': '5.3.3' };

async function ctxOf(token: string, year: number, dept: string | null) {
  const url = Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/bgt_e_ctx';
  const key = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key }, body: JSON.stringify({ p_token: token, p_year: year, p_dept: dept }) });
  if (!r.ok) return null;
  return await r.json();
}

async function claude(system: string, user: string, max = 4096) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('AI 키가 서버에 설정되어 있지 않습니다.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: max, system, messages: [{ role: 'user', content: user }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || ('AI 호출 오류 ' + r.status));
  return String(d?.content?.[0]?.text || '');
}

function parse(text: string) {
  const t = text.replace(/```json|```/g, '');
  const a = t.search(/[\[{]/);
  if (a < 0) throw new Error('AI 응답을 해석하지 못했습니다.');
  const open = t[a], close = open === '[' ? ']' : '}';
  const b = t.lastIndexOf(close);
  return JSON.parse(t.slice(a, b + 1));
}

function codeList(codes: any[], type: string) {
  const g: Record<string, string> = {};
  codes.filter((c) => c.type === type && c.level !== 'mok').forEach((c) => { g[c.code] = c.name; });
  return codes.filter((c) => c.type === type && c.level === 'mok').map((c) => {
    const p = String(c.code).split('.');
    return `${c.code} ${c.name} [${g[p[0]] || ''} > ${g[p[0] + '.' + p[1]] || ''}]` + (c.descr ? ' — ' + c.descr : '') + (c.example ? ' (예: ' + c.example + ')' : '');
  }).join('\n');
}

const RULES = `규칙:
1. 반드시 아래 코드표에 있는 코드(목)만 고릅니다. 새 코드를 만들거나 코드표에 없는 번호를 쓰지 않습니다.
2. 맞는 항목이 없어도 가장 가까운 기존 코드를 고릅니다. 정말 무엇에도 맞지 않을 때만 세출은 7.1.1(공공·잡비), 세입은 5.3.3(잡수입)을 고르고 conf를 낮게 줍니다.
3. 세출 7.2.1(예비비)은 적요에 '예비비'가 명시된 경우가 아니면 고르지 않습니다.
4. 인건비·강사료·여비·임차료처럼 성격이 분명한 것은 거래처 이름이 아니라 지출 성격으로 판단합니다.
5. conf는 0~100 정수입니다(확신이 낮을수록 낮게). why는 40자 이내 한국어로 근거를 적습니다.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const token = String(b.token || ''), year = Number(b.year) || 0, mode = String(b.mode || '');
  if (!token || !year) return json({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  const ctx = await ctxOf(token, year, b.dept ? String(b.dept) : null);
  if (!ctx || ctx.error || !ctx.codes) return json({ ok: false, error: 'AUTH_REQUIRED' }, 401);
  try {
    if (mode === 'ping') {   // 접속 점검: 서버 키·모델·네트워크까지 아주 짧게 실제 호출해 확인합니다.
      const t0 = Date.now();
      if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ ok: false, error: 'AI 키가 서버에 설정되어 있지 않습니다.' }, 503);
      await claude('Reply with OK only.', 'ping', 8);
      return json({ ok: true, ms: Date.now() - t0, model: MODEL });
    }
    if (mode === 'match') {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((x: any) => ({
        id: String(x.id), type: x.type === '세입' ? '세입' : '세출', phase: x.phase === 'plan' ? 'plan' : 'actual',
        memo: String(x.memo || '').slice(0, 200), vendor: String(x.vendor || '').slice(0, 80), amount: Number(x.amount) || 0, calc: String(x.calc || '').slice(0, 120),
      }));
      if (!items.length) return json({ ok: true, results: [] });
      const types = Array.from(new Set(items.map((i: any) => i.type)));
      const table = types.map((t) => `### ${t} 코드표 (코드 이름 [관 > 항] — 설명)\n${codeList(ctx.codes, t as string)}`).join('\n\n');
      const lines = (ctx.lines || []).map((l: any) => `${l.type} ${l.mok} ${l.name}`).slice(0, 150).join('\n');
      const hist = (ctx.hist || []).map((h: any) => `${h.type} | ${h.memo} | ${h.vendor} → ${h.mok}`).slice(0, 40).join('\n');
      const system = `당신은 학교 법인 예산 회계 분류 전문가입니다. 부서가 적은 지출·계획 한 줄마다 예산 코드(목)를 정합니다.\n${RULES}\n6. 내년 계획(phase=plan)이 이 부서의 기존 항목 명칭과 같은 사업이면 line에 그 기존 명칭을 그대로 적고, 아니면 빈 문자열로 둡니다.\n\n${table}\n\n## 이 부서의 기존 항목(구분 코드 명칭)\n${lines || '(없음)'}\n\n## 이 부서가 이전에 확정한 사례(구분 | 적요 | 거래처 → 코드)\n${hist || '(없음)'}\n\n출력: JSON 배열만. 각 원소 {"id":"입력 id 그대로","mok":"코드","conf":정수,"why":"근거","alt":["대안코드","대안코드"],"line":"기존 항목 명칭 또는 빈 문자열"}. 설명·마크다운 금지.`;
      const out = parse(await claude(system, JSON.stringify(items), 4096));
      const valid = new Set((ctx.codes as any[]).filter((c) => c.level === 'mok').map((c) => c.type + '|' + c.code));
      const byId: Record<string, any> = {}; (Array.isArray(out) ? out : []).forEach((o: any) => { if (o && o.id) byId[String(o.id)] = o; });
      const results = items.map((it: any) => {
        const o = byId[it.id] || {};
        let mok = String(o.mok || ''), conf = Math.max(0, Math.min(100, Math.round(Number(o.conf) || 0))), why = String(o.why || '').slice(0, 80);
        if (!valid.has(it.type + '|' + mok)) {
          const alt = (Array.isArray(o.alt) ? o.alt : []).map(String).find((m: string) => valid.has(it.type + '|' + m));
          mok = alt || FALLBACK[it.type]; conf = Math.min(conf, 30) || 20; why = why || '가장 가까운 기존 코드로 임시 지정';
        }
        const alts = (Array.isArray(o.alt) ? o.alt : []).map(String).filter((m: string) => m !== mok && valid.has(it.type + '|' + m)).slice(0, 3);
        return { id: it.id, mok, conf, why, alt: alts, line: String(o.line || '').slice(0, 120) };
      });
      return json({ ok: true, results });
    }
    if (mode === 'qa') {
      const q = String(b.question || '').trim().slice(0, 500);
      if (!q) return json({ ok: false, error: '질문을 입력해 주십시오.' }, 400);
      const table = ['세출', '세입'].map((t) => `### ${t} 코드표\n${codeList(ctx.codes, t)}`).join('\n\n');
      const system = `당신은 학교 법인 예산 코드 안내자입니다. 담당자가 "이런 목적으로 쓰려는데 어떤 코드인가요?"라고 물으면 코드표에서 가장 알맞은 코드(목)를 알려 줍니다.\n${RULES}\n\n${table}\n\n출력: JSON 객체만. {"answer":"2~3문장 안내(공식 문어체, 합니다 체)","suggestions":[{"type":"세출|세입","mok":"코드","name":"코드 이름","why":"근거","example":{"phase":"actual|plan","memo":"입력 예시 적요 또는 세부명칭","vendor":"","amount":0,"calc":""}}]}. suggestions는 1~3개, 가장 알맞은 것을 먼저. 예시의 금액은 질문에 있으면 쓰고 없으면 0.`;
      const out = parse(await claude(system, q, 2048));
      const valid = new Set((ctx.codes as any[]).filter((c) => c.level === 'mok').map((c) => c.type + '|' + c.code));
      const sug = (Array.isArray(out?.suggestions) ? out.suggestions : []).filter((s: any) => valid.has(String(s.type) + '|' + String(s.mok))).slice(0, 3);
      return json({ ok: true, answer: String(out?.answer || ''), suggestions: sug });
    }
    return json({ ok: false, error: 'unknown mode' }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 502);
  }
});
