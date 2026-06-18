import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const body = await req.json()
    const { item_id, requester_name, requester_org, requester_phone, purpose, qty } = body

    const { data: item, error: itemErr } = await supabase
      .from("gift_items")
      .select("name, stock_qty, is_active, max_per_request")
      .eq("id", item_id)
      .single()

    if (itemErr || !item) throw new Error("품목을 찾을 수 없습니다.")
    if (!item.is_active) throw new Error("현재 신청 불가능한 품목입니다.")
    if (item.stock_qty < qty) throw new Error(`재고가 부족합니다. (현재 ${item.stock_qty}개)`)
    if (item.max_per_request && qty > item.max_per_request) throw new Error(`최대 ${item.max_per_request}개까지 신청 가능합니다.`)

    const { data: request, error: reqErr } = await supabase
      .from("gift_requests")
      .insert({ item_id, requester_name, requester_org, requester_phone, purpose, qty, status: "pending" })
      .select()
      .single()

    if (reqErr) throw reqErr

    const { data: config } = await supabase
      .from("gift_system_config")
      .select("key, value")
      .in("key", ["telegram_bot_token", "telegram_chat_id", "telegram_notify_enabled"])

    const cfg: Record<string, string> = {}
    config?.forEach(({ key, value }: any) => { cfg[key] = value })

    if (cfg.telegram_notify_enabled === "true" && cfg.telegram_bot_token && cfg.telegram_chat_id) {
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      const remaining = item.stock_qty - qty
      const msg = [
        "📦 [기념품 신청 접수]",
        "━━━━━━━━━━━━━━━━━━━━━",
        `품목: ${item.name} × ${qty}개`,
        `신청자: ${requester_name} (${requester_org})`,
        requester_phone ? `연락처: ${requester_phone}` : null,
        `목적: ${purpose}`,
        `시각: ${now}`,
        `현재 재고: ${item.stock_qty}개 → 승인 시 ${remaining}개`,
        "━━━━━━━━━━━━━━━━━━━━━",
        "👉 관리자 패널에서 처리하세요"
      ].filter(Boolean).join("\n")

      await fetch(
        `https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cfg.telegram_chat_id, text: msg }) }
      ).catch(() => {})

      const { data: alertCfg } = await supabase.from("gift_system_config").select("value").eq("key", "min_stock_global_alert").single()
      const alertThreshold = parseInt(alertCfg?.value || "5")
      if (remaining <= alertThreshold) {
        const alertMsg = `⚠️ [재고 임박 경보]\n품목: ${item.name}\n남은 재고: ${remaining}개\n입고 처리가 필요합니다.`
        await fetch(
          `https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cfg.telegram_chat_id, text: alertMsg }) }
        ).catch(() => {})
      }
    }

    return new Response(
      JSON.stringify({ success: true, request_id: request.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
