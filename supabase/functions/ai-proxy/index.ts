// ============================================================================
// ai-proxy — Supabase Edge Function (Deno)
// 목적: Claude / Clova OCR / Kakao 등 비밀 키를 클라이언트에 노출하지 않고
//       서버(Edge)에서 대신 호출하는 프록시. (항목 32 — API 키 보안)
//
// 배포:
//   1) Supabase CLI 설치 후 로그인:  npx supabase login
//   2) 프로젝트 연결:               npx supabase link --project-ref zbpeyklwpotjyveipzxd
//   3) 비밀키 등록:
//        npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//        npx supabase secrets set CLOVA_OCR_SECRET=...   CLOVA_OCR_URL=https://...
//        npx supabase secrets set KAKAO_API_KEY=...
//   4) 배포:                        npx supabase functions deploy ai-proxy --no-verify-jwt
//
// 클라이언트 호출(예):
//   POST https://zbpeyklwpotjyveipzxd.supabase.co/functions/v1/ai-proxy
//   body: { "service": "claude", "payload": { ...messages API 본문... } }
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let req_body: any;
  try { req_body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // 두 가지 호출 형태 지원:
  //  (1) { service, payload }
  //  (2) 원본 Claude 본문 그대로({ model, messages, ... }) → service=claude 로 간주
  let service = String(req_body?.service || "");
  let payload = req_body?.payload ?? {};
  if (!service && (req_body?.messages || req_body?.model)) {
    service = "claude";
    payload = req_body;
  }

  try {
    if (service === "claude") {
      // Flow 모드: 클라이언트가 upstream{baseUrl,key}를 주면 그 게이트웨이로 전달(aiapiflow 등)
      const upstream = req_body?.upstream;
      if (upstream && upstream.baseUrl && upstream.key) {
        const u = String(upstream.baseUrl).replace(/\/$/, "") + "/v1/messages";
        const r = await fetch(u, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": upstream.key,
            "authorization": "Bearer " + upstream.key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(payload),
        });
        return json(await r.json(), r.status);
      }
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
      });
      return json(await r.json(), r.status);
    }

    if (service === "clova-ocr") {
      const secret = Deno.env.get("CLOVA_OCR_SECRET");
      const url = Deno.env.get("CLOVA_OCR_URL");
      if (!secret || !url) return json({ error: "CLOVA env not set" }, 500);
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "X-OCR-SECRET": secret },
        body: JSON.stringify(payload),
      });
      return json(await r.json(), r.status);
    }

    if (service === "kakao") {
      const key = Deno.env.get("KAKAO_API_KEY");
      if (!key) return json({ error: "KAKAO_API_KEY not set" }, 500);
      const r = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "Authorization": `KakaoAK ${key}`,
        },
        body: new URLSearchParams(payload),
      });
      return json(await r.json(), r.status);
    }

    // ── gcal-public: Google Calendar public iCal proxy ──────────────────
    if (service === "gcal-public") {
      const calId  = String(payload.calId  || "");
      const tMinRaw = payload.timeMin ? new Date(payload.timeMin) : null;
      const tMaxRaw = payload.timeMax ? new Date(payload.timeMax) : null;
      if (!calId) return json({ error: "calId required" }, 400);

      const icalUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calId)}/public/basic.ics`;
      const icalRes = await fetch(icalUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!icalRes.ok) return json({ error: `ical ${icalRes.status}` }, 502);

      const icalText = await icalRes.text();
      return json({ items: gcalParseIcal(icalText, tMinRaw, tMaxRaw) });
    }

    return json({ error: "unknown service: " + service }, 400);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});

// ── iCal helpers ────────────────────────────────────────────────────────────
function gcalUnfold(text: string): string {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function gcalFmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function gcalParseDate(raw: string): { date: Date; allDay: boolean } | null {
  try {
    const allDay = !raw.includes("T");
    const y = parseInt(raw.slice(0,4)), mo = parseInt(raw.slice(4,6))-1, d = parseInt(raw.slice(6,8));
    if (allDay) return { date: new Date(y, mo, d), allDay: true };
    const h = parseInt(raw.slice(9,11)), mi = parseInt(raw.slice(11,13)), s = parseInt(raw.slice(13,15));
    const date = raw.endsWith("Z")
      ? new Date(Date.UTC(y, mo, d, h, mi, s))
      : new Date(Date.UTC(y, mo, d, h-9, mi, s)); // assume KST if no Z
    return { date, allDay: false };
  } catch { return null; }
}

function gcalUnescape(s: string): string {
  return s.replace(/\\n/g,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");
}

function gcalParseIcal(icalText: string, tMin: Date|null, tMax: Date|null) {
  const lines = gcalUnfold(icalText).split(/\r?\n/);
  const events: Record<string, string>[] = [];
  let cur: Record<string,string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT")   {
      if (cur) events.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    const ci = line.indexOf(":");
    if (ci < 0) continue;
    let key = line.slice(0, ci);
    const semi = key.indexOf(";");
    if (semi >= 0) key = key.slice(0, semi);
    cur[key] = gcalUnescape(line.slice(ci+1));
  }

  const result: unknown[] = [];
  for (const ev of events) {
    const ps = ev["DTSTART"] ? gcalParseDate(ev["DTSTART"]) : null;
    const pe = ev["DTEND"]   ? gcalParseDate(ev["DTEND"])   : null;
    if (!ps) continue;
    const end = pe?.date ?? ps.date;
    if (tMin && end < tMin) continue;
    if (tMax && ps.date > tMax) continue;
    const out: Record<string,unknown> = {
      id: ev["UID"] || `ical-${result.length}`,
      summary: ev["SUMMARY"] || "",
    };
    if (ps.allDay) {
      out.start = { date: gcalFmtDate(ps.date) };
      out.end   = { date: gcalFmtDate(end) };
    } else {
      out.start = { dateTime: ps.date.toISOString() };
      out.end   = { dateTime: end.toISOString() };
    }
    if (ev["DESCRIPTION"]) out.description = ev["DESCRIPTION"];
    if (ev["LOCATION"])    out.location    = ev["LOCATION"];
    result.push(out);
  }
  return result;
}
