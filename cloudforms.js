'use strict';
/**
 * cloudforms.js — 신청서류 공용 클라우드 저장(Supabase app_submissions)  window.CloudForms
 *  - 모든 신청서(사직서·입사서류·대관신청·대관료 견적·기안 등)를 로컬과 함께 클라우드에 저장
 *  - 어느 단말에서 제출해도 관리자가 어느 단말에서나 조회/복구 가능
 *  데이터: Supabase app_submissions(kind, ref, name, status, data jsonb) — 기숙사/안내도와 동일 프로젝트
 *  ※ 테이블 생성 SQL은 1회 실행 필요(app_submissions). 미생성/오류 시 조용히 실패하고 로컬은 그대로 동작.
 */
window.CloudForms = (function () {
  var DEFAULT_URL = 'https://zbpeyklwpotjyveipzxd.supabase.co';
  var DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpicGV5a2x3cG90anl2ZWlwenhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MTYxMDcsImV4cCI6MjA5NzA5MjEwN30.6JgoQ6rPRnmrbBTG68A-Y9HDQk40mnwubhXVnkZvHrQ';
  var _db = null;

  function cfg() {
    var url = DEFAULT_URL, key = DEFAULT_KEY;
    try { url = localStorage.getItem('asea_dorm_supabase_url') || DEFAULT_URL; key = localStorage.getItem('asea_dorm_supabase_key') || DEFAULT_KEY; } catch (e) {}
    return { url: url, key: key };
  }
  function db() {
    if (_db) return _db;
    if (!(window.supabase && window.supabase.createClient)) return null;
    var c = cfg();
    // persistSession:true — 로그인 세션을 만드는 페이지(예: 자가진단)가 있으면 그 세션을 유지·자동갱신한다.
    // 세션을 만들지 않는 다른 페이지들은 세션이 애초에 없으므로 기존과 동일하게 익명(anon) 요청으로 동작한다.
    _db = window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return _db;
  }
  function ready() { return !!db(); }

  // 실제 로그인 세션이 필요한 화면(예: 자가진단)에서 Google ID 토큰으로 Supabase 로그인 세션을 생성.
  // 세션이 생기면 이후 save()/list()가 자동으로 그 사용자로 인증된 요청을 보낸다(RLS가 auth.jwt()로 검증 가능).
  function signInWithIdToken(idToken) {
    var d = db();
    if (!d) return Promise.resolve({ ok: false, err: 'supabase 미로딩' });
    return d.auth.signInWithIdToken({ provider: 'google', token: idToken })
      .then(function (res) { return res.error ? { ok: false, err: res.error.message } : { ok: true, session: res.data.session, user: res.data.user }; })
      .catch(function (e) { return { ok: false, err: (e && e.message) || String(e) }; });
  }
  function signOut() {
    var d = db();
    if (!d) return Promise.resolve({ ok: false });
    return d.auth.signOut()
      .then(function () { return { ok: true }; })
      .catch(function (e) { return { ok: false, err: (e && e.message) || String(e) }; });
  }
  function getSession() {
    var d = db();
    if (!d) return Promise.resolve(null);
    return d.auth.getSession()
      .then(function (res) { return (res.data && res.data.session) || null; })
      .catch(function () { return null; });
  }
  // cb(event, session) — 'INITIAL_SESSION'(구독 직후 현재 상태) / 'SIGNED_IN' / 'SIGNED_OUT' / 'TOKEN_REFRESHED' 등
  function onAuthStateChange(cb) {
    var d = db();
    if (!d) return null;
    return d.auth.onAuthStateChange(function (event, session) { cb(event, session); });
  }

  // 단건 저장(있으면 갱신) — kind+ref 기준 upsert
  function save(kind, ref, name, status, data) {
    var d = db();
    if (!d) return Promise.resolve({ ok: false, err: 'supabase 미로딩' });
    var row = { kind: String(kind), ref: String(ref), name: name || '', status: status || 'submitted',
                data: data || {}, updated_at: new Date().toISOString() };
    return d.from('app_submissions').upsert(row, { onConflict: 'kind,ref' })
      .then(function (res) { return res.error ? { ok: false, err: res.error.message } : { ok: true }; })
      .catch(function (e) { return { ok: false, err: (e && e.message) || String(e) }; });
  }

  // 종류별 목록 조회
  function list(kind) {
    var d = db();
    if (!d) return Promise.resolve({ ok: false, err: 'supabase 미로딩', rows: [] });
    return d.from('app_submissions').select('*').eq('kind', String(kind)).order('updated_at', { ascending: false })
      .then(function (res) { return res.error ? { ok: false, err: res.error.message, rows: [] } : { ok: true, rows: res.data || [] }; })
      .catch(function (e) { return { ok: false, err: (e && e.message) || String(e), rows: [] }; });
  }

  // 감사 로그 기록(민감 액션: 동의, 타인 개인정보 열람/내보내기 등) — 실패해도 조용히 무시.
  function auditLog(actor, area, action, targetRef, detail) {
    var d = db();
    if (!d) return Promise.resolve({ ok: false, err: 'supabase 미로딩' });
    var row = { actor: actor || '', area: area || '', action: action || '',
                target_ref: targetRef == null ? '' : String(targetRef), detail: detail || {} };
    return d.from('audit_log').insert(row)
      .then(function (res) { return res.error ? { ok: false, err: res.error.message } : { ok: true }; })
      .catch(function (e) { return { ok: false, err: (e && e.message) || String(e) }; });
  }

  return {
    ready: ready, save: save, list: list, auditLog: auditLog,
    signInWithIdToken: signInWithIdToken, signOut: signOut, getSession: getSession, onAuthStateChange: onAuthStateChange
  };
})();
