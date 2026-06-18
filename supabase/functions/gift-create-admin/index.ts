import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const authHeader = req.headers.get("Authorization")!
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""))
    if (!user) throw new Error("인증 필요")

    const { data: caller } = await supabaseAdmin
      .from("gift_admin_users")
      .select("role, is_active")
      .eq("id", user.id)
      .single()

    if (caller?.role !== "master" || !caller.is_active) {
      throw new Error("마스터 관리자 권한이 필요합니다.")
    }

    const { name, email, password, role, department } = await req.json()

    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true
    })
    if (createErr) throw createErr

    const { error: profileErr } = await supabaseAdmin
      .from("gift_admin_users")
      .insert({ id: newUser.user.id, name, role, department, created_by: user.id })
    if (profileErr) throw profileErr

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
