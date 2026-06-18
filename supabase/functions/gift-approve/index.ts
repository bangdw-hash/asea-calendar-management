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

    const authHeader = req.headers.get("Authorization")!
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authErr || !user) throw new Error("인증이 필요합니다.")

    const { request_id, action, reject_reason, note } = await req.json()

    const { data: adminUser } = await supabase
      .from("gift_admin_users")
      .select("name, role, is_active")
      .eq("id", user.id)
      .single()

    if (!adminUser?.is_active) throw new Error("권한이 없습니다.")

    if (action === "approve") {
      const { data: updated } = await supabase
        .from("gift_requests")
        .update({ status: "approved", handled_by: user.id, handled_at: new Date().toISOString() })
        .eq("id", request_id)
        .eq("status", "pending")
        .select("*, gift_items(name, stock_qty)")
        .single()

      if (!updated) {
        return new Response(
          JSON.stringify({ success: false, error: "이미 다른 관리자가 처리한 신청입니다." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      await supabase.from("gift_items")
        .update({ stock_qty: updated.gift_items.stock_qty - updated.qty, updated_at: new Date().toISOString() })
        .eq("id", updated.item_id)

      await supabase.from("gift_dispatch_log").insert({
        request_id, dispatched_by: user.id, qty_dispatched: updated.qty, note
      })

      await sendTelegramNotify(supabase,
        `✅ [승인 완료]\n품목: ${updated.gift_items.name} × ${updated.qty}개\n처리자: ${adminUser.name}\n신청자: ${updated.requester_name} (${updated.requester_org})\n남은 재고: ${updated.gift_items.stock_qty - updated.qty}개`
      )

    } else if (action === "reject") {
      const { data: updated } = await supabase
        .from("gift_requests")
        .update({ status: "rejected", handled_by: user.id, handled_at: new Date().toISOString(), reject_reason })
        .eq("id", request_id)
        .eq("status", "pending")
        .select("*, gift_items(name)")
        .single()

      if (!updated) {
        return new Response(
          JSON.stringify({ success: false, error: "이미 다른 관리자가 처리한 신청입니다." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      await sendTelegramNotify(supabase,
        `❌ [반려 처리]\n품목: ${updated.gift_items.name} × ${updated.qty}개\n처리자: ${adminUser.name}\n사유: ${reject_reason || "미입력"}`
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

async function sendTelegramNotify(supabase: any, text: string) {
  const { data: config } = await supabase
    .from("gift_system_config")
    .select("key, value")
    .in("key", ["telegram_bot_token", "telegram_chat_id", "telegram_notify_enabled"])

  const cfg: Record<string, string> = {}
  config?.forEach(({ key, value }: any) => { cfg[key] = value })

  if (cfg.telegram_notify_enabled === "true" && cfg.telegram_bot_token && cfg.telegram_chat_id) {
    await fetch(
      `https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: cfg.telegram_chat_id, text }) }
    ).catch(() => {})
  }
}
