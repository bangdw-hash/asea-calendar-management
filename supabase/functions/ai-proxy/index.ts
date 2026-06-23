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

    return json({ error: "unknown service: " + service }, 400);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
