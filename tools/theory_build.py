#!/usr/bin/env python3
"""이론 파일 생성기.

입력  theory/candidates.json      후보 목록(서지 정보)
      theory/verification_raw.json tools/theory_verify.py 의 서지 대조·초록 확보 결과
      theory/verdicts.json         사람이 초록을 읽고 기록한 판정
                                    {"T01": {"verdict": "match|partial|reject", "finding": "...", "evidence": "초록 원문 일부",
                                             "use": "...", "caution": "...", "triggers": ["signal", ...], "note": "..."}}
출력  theory/aseasurvey-theory.json  관리자 화면(AI 분석)이 읽는 이론 파일 — 「서지 일치 + 초록 내용 일치」 항목만 수록
      theory/VERIFICATION.md         수록·제외 항목 전체와 사유
"""
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'theory'
FIELD = {'edu': '교육학', 'psy': '심리학', 'stat': '통계학'}


def load(n, d):
    p = ROOT / n
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else d


def names(b, c):
    a = b.get('authors') or []
    if not a:
        return c['author'] + ' 외', c['author'] + ' (' + str(c['year']) + ')'
    fm = [x['family'] + ', ' + x['initials'] for x in a]
    if len(a) == 1:
        full, short = fm[0], a[0]['family']
    elif len(a) <= 20:
        full, short = ', '.join(fm[:-1]) + ', & ' + fm[-1], (a[0]['family'] + ' & ' + a[1]['family'] if len(a) == 2 else a[0]['family'] + ' et al.')
    else:
        full, short = ', '.join(fm[:19]) + ', ... ' + fm[-1], a[0]['family'] + ' et al.'
    return full, short + ' (' + str(c['year']) + ')'


def main():
    cands, raw, ver = load('candidates.json', []), load('verification_raw.json', {}), load('verdicts.json', {})
    inc, rows = [], []
    for c in cands:
        r, v = raw.get(c['id'], {}), ver.get(c['id'], {})
        b = r.get('bib', {})
        reason = ''
        if b.get('status') != 'match':
            reason = '서지 불일치 또는 미확인: ' + (', '.join(b.get('diffs', [])) or b.get('status', '미실행'))
        elif not r.get('abstract'):
            reason = '공개 초록을 확보하지 못해 내용 대조 불가'
        elif v.get('verdict') == 'match' and ' '.join((v.get('evidence') or '').lower().split()) not in ' '.join((r['abstract'].get('text') or '').lower().split()):
            reason = '증거 문장이 초록에서 확인되지 않음'
        elif v.get('verdict') != 'match':
            reason = '내용 대조 결과 ' + (v.get('verdict') or '미판정') + (': ' + v['note'] if v.get('note') else '')
        if reason:
            rows.append((c, b, r, 'excluded', reason)); continue
        full, short = names(b, c)
        vol = (b.get('volume') or '') + ('(' + b['issue'] + ')' if b.get('issue') else '')
        link = ('https://doi.org/' + b['doi']) if b.get('doi') else b.get('url', '')
        text = '%s (%s). %s. %s%s%s. %s' % (full, c['year'], b['title'].rstrip('.'), b['journal'], ', ' + vol if vol else '', ', ' + b['pages'] if b.get('pages') else '', link)
        inc.append({'id': c['id'], 'field': c['field'], 'topics': c['topics'], 'triggers': v['triggers'], 'short': short, 'cite': text,
                    'finding': v['finding'], 'evidence': v['evidence'], 'use': v['use'], 'caution': v.get('caution', ''),
                    'verify': {'bib': ('Crossref 서지 일치 (DOI ' + b['doi'] + ')') if b.get('doi') else ('ERIC 서지 일치 (' + (b.get('src') or '') + ')'), 'abstract': r['abstract']['src'], 'content': '초록 대조 일치', 'checked': str(date.today())}})
        rows.append((c, b, r, 'included', ''))
    out = {'version': 1, 'generated': str(date.today()), 'count': len(inc),
           'note': '서지(저자·연도·제목·학술지·권호·쪽·DOI)는 Crossref 와 자동 대조했고, 주장(finding)은 공개 초록에 근거가 있는 것만 수록했습니다. 원문 전체를 읽은 것이 아니며 use(적용 해석)는 이 설문 맥락에 맞춘 해석입니다.',
           'entries': inc}
    (ROOT / 'aseasurvey-theory.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    md = ['# 이론 파일 검증 기록', '', '생성일: %s · 후보 %d건 중 수록 %d건 · 제외 %d건' % (date.today(), len(cands), len(inc), len(cands) - len(inc)), '',
          '검증 방식: ① Crossref 서지 자동 대조(제목·제1저자·연도·학술지·권·쪽) ② 공개 초록 확보(Crossref/ERIC/Semantic Scholar/Europe PMC) ③ 사람이 초록을 읽고 주장과 대조. 유료 원문은 열람하지 않았습니다.', '',
          '| ID | 분야 | 문헌 | 상태 | 초록 출처 | 비고 |', '|---|---|---|---|---|---|']
    for c, b, r, st, why in rows:
        md.append('| %s | %s | %s (%s) %s | %s | %s | %s |' % (c['id'], FIELD[c['field']], c['author'], c['year'], c['title'][:70].replace('|', '/'), '수록' if st == 'included' else '제외', (r.get('abstract') or {}).get('src', '-'), why.replace('|', '/')))
    (ROOT / 'VERIFICATION.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
    print('수록', len(inc), '제외', len(cands) - len(inc))


if __name__ == '__main__':
    main()
