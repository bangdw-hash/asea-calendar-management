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
    _db = window.supabase.createClient(c.url, c.key, { auth: { persistSession: false } });
    return _db;
  }
  function ready() { return !!db(); }

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

  return { ready: ready, save: save, list: list, auditLog: auditLog };
})();
