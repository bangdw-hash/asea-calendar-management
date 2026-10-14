#!/usr/bin/env python3
"""이론 파일 검증 도구 (설문 분석용 학술 근거).

단계 1. 서지 대조 — theory/candidates.json 의 각 후보를 Crossref 에서 찾아
        제목·제1저자·연도·학술지·권·호·쪽이 일치하는지 자동 비교하고 DOI 를 확보합니다.
단계 2. 초록 확보 — Crossref → ERIC → Semantic Scholar → Europe PMC 순으로 공개 초록을 가져옵니다.
        (유료 논문 원문은 열람하지 않으며, 초록으로 확인되는 범위의 주장만 수록합니다.)
결과는 theory/verification_raw.json 에 저장됩니다. 내용 일치(주장 ↔ 초록) 판정은 사람이 읽고
theory/verdicts.json 에 기록하고, theory/theory_build.py 가 두 파일을 합쳐 최종 이론 파일을 만듭니다.

사용법:  python3 tools/theory_verify.py            (후보 전체)
         python3 tools/theory_verify.py T01 T05    (일부만)
"""
import json, re, sys, time, urllib.parse, urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'theory'
UA = {'User-Agent': 'asea-survey-theory-verify/1.0'}


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa
            if i == tries - 1:
                return {'_error': str(e)}
            time.sleep(1.5 * (i + 1))


def norm(s):
    return re.sub(r'[^a-z0-9가-힣]+', ' ', (s or '').lower()).strip()


def strip_tags(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s or '')).strip()


def crossref(c):
    q = urllib.parse.urlencode({'query.bibliographic': f"{c['title']} {c['author']} {c['year']}", 'rows': 5,
                                'select': 'DOI,title,author,issued,container-title,volume,issue,page,abstract,type'})
    r = get('https://api.crossref.org/works?' + q)
    best = None
    for it in (r.get('message', {}).get('items', []) if isinstance(r, dict) else []):
        t = (it.get('title') or [''])[0]
        sim = SequenceMatcher(None, norm(t), norm(c['title'])).ratio()
        fam = ((it.get('author') or [{}])[0].get('family') or '')
        yr = ((it.get('issued') or {}).get('date-parts') or [[None]])[0][0]
        score = sim + (0.2 if norm(c['author'].split('-')[0]) in norm(fam) or norm(fam) in norm(c['author']) else 0) + (0.1 if yr and abs(yr - c['year']) <= 1 else 0)
        if not best or score > best[0]:
            best = (score, sim, it, fam, yr)
    return best


def by_doi(c):
    r = get('https://api.crossref.org/works/' + urllib.parse.quote(c['doi']))
    it = r.get('message') if isinstance(r, dict) else None
    if not it:
        return None
    t = (it.get('title') or [''])[0]
    fam = ((it.get('author') or [{}])[0].get('family') or '')
    yr = ((it.get('issued') or {}).get('date-parts') or [[None]])[0][0] or ((it.get('published') or {}).get('date-parts') or [[None]])[0][0]
    return (1.0, SequenceMatcher(None, norm(t), norm(c['title'])).ratio(), it, fam, yr)


def eric_by_id(c):
    r = get('https://api.ies.ed.gov/eric/?' + urllib.parse.urlencode({'search': 'id:' + c['eric_id'], 'format': 'json', 'rows': 1, 'fields': 'id,title,author,source,publicationdateyear,description'}))
    d = ((r.get('response', {}) if isinstance(r, dict) else {}).get('docs') or [None])[0]
    return d


def eric(c):
    words = re.sub(r'[^A-Za-z0-9 ]+', ' ', c['title']).split()
    for n in (len(words), 8, 5):
        q = urllib.parse.urlencode({'search': 'title:"%s"' % ' '.join(words[:n]), 'fields': 'id,title,author,source,publicationdateyear,description', 'format': 'json', 'rows': 5})
        r = get('https://api.ies.ed.gov/eric/?' + q)
        for d in (r.get('response', {}).get('docs', []) if isinstance(r, dict) else []):
            t1, t2 = norm(d.get('title')), norm(c['title'])
            if (SequenceMatcher(None, t1, t2).ratio() > 0.9 or t1.startswith(t2[:40])) and d.get('description') and abs(int(d.get('publicationdateyear') or 0) - c['year']) <= 1:
                return {'src': 'ERIC ' + d['id'], 'text': d['description']}
        time.sleep(0.3)
    return None


def s2(doi):
    r = get('https://api.semanticscholar.org/graph/v1/paper/DOI:%s?fields=abstract,year' % urllib.parse.quote(doi))
    if isinstance(r, dict) and r.get('abstract'):
        return {'src': 'SemanticScholar', 'text': r['abstract']}
    return None


def epmc(doi):
    r = get('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%s&format=json&resultType=core' % urllib.parse.quote(doi))
    for d in (r.get('resultList', {}).get('result', []) if isinstance(r, dict) else []):
        if d.get('abstractText'):
            return {'src': 'EuropePMC ' + str(d.get('pmid') or d.get('id')), 'text': strip_tags(d['abstractText'])}
    return None


def verify(c):
    out = {'id': c['id'], 'cand': c, 'bib': {'status': 'not_found'}, 'abstract': None}
    if c.get('eric_id'):
        d = eric_by_id(c)
        if d:
            sim = SequenceMatcher(None, norm(d.get('title')), norm(c['title'])).ratio()
            fam = (d['author'][0].split(',')[0] if d.get('author') else '')
            diffs = []
            if sim < 0.85: diffs.append('제목 유사도 %.2f' % sim)
            if norm(c['author']) not in norm(fam): diffs.append('제1저자 불일치')
            if abs(int(d.get('publicationdateyear') or 0) - c['year']) > 1: diffs.append('연도 불일치')
            out['bib'] = {'status': 'match' if not diffs else 'mismatch', 'diffs': diffs, 'doi': None, 'url': 'https://eric.ed.gov/?id=' + c['eric_id'], 'title': d.get('title'), 'first_author': fam, 'year': d.get('publicationdateyear'),
                          'journal': c['journal'], 'volume': c['volume'], 'issue': c['issue'], 'pages': c['pages'], 'sim': round(sim, 3), 'src': 'ERIC ' + c['eric_id'] + ' ' + (d.get('source') or ''),
                          'authors': [{'family': a.split(',')[0].strip(), 'initials': ''.join(w[0] + '.' for w in a.split(',')[1].split()) if ',' in a else ''} for a in d.get('author', [])]}
            out['abstract'] = {'src': 'ERIC ' + c['eric_id'], 'text': d.get('description', '')}
        return out
    best = by_doi(c) if c.get('doi') else crossref(c)
    if best:
        score, sim, it, fam, yr = best
        pages = it.get('page') or ''
        j = (it.get('container-title') or [''])[0]
        diffs = []
        if sim < (0.7 if c.get('doi') else 0.9): diffs.append('제목 유사도 %.2f' % sim)
        if not (norm(c['author'].split('-')[0]) in norm(fam) or norm(fam) in norm(c['author'])): diffs.append('제1저자 %s ≠ %s' % (c['author'], fam))
        if yr is None or abs(yr - c['year']) > 1: diffs.append('연도 %s ≠ %s' % (c['year'], yr))
        if c['journal'] and SequenceMatcher(None, norm(j), norm(c['journal'])).ratio() < 0.75: diffs.append('학술지 %s ≠ %s' % (c['journal'], j))
        if c['volume'] and it.get('volume') and c['volume'] != str(it.get('volume')): diffs.append('권 %s ≠ %s' % (c['volume'], it.get('volume')))
        if c['pages'] and pages and c['pages'].split('-')[0] != pages.split('-')[0]: diffs.append('쪽 %s ≠ %s' % (c['pages'], pages))
        out['bib'] = {'status': 'match' if not diffs else 'mismatch', 'diffs': diffs, 'doi': it.get('DOI'), 'title': (it.get('title') or [''])[0], 'first_author': fam,
                      'year': yr, 'journal': j, 'volume': it.get('volume'), 'issue': it.get('issue'), 'pages': pages, 'sim': round(sim, 3)}
        if it.get('abstract'):
            out['abstract'] = {'src': 'Crossref', 'text': strip_tags(it['abstract'])}
    if not out['abstract']:
        out['abstract'] = eric(c)
    doi = out['bib'].get('doi')
    if not out['abstract'] and doi:
        time.sleep(1.1); out['abstract'] = s2(doi)
    if not out['abstract'] and doi:
        out['abstract'] = epmc(doi)
    return out


def fill_authors():
    """DOI 가 확인된 항목의 전체 저자 목록(성, 이름 머리글자)을 Crossref 에서 채웁니다."""
    rawp = ROOT / 'verification_raw.json'
    raw = json.loads(rawp.read_text(encoding='utf-8'))
    for k, v in raw.items():
        doi = v['bib'].get('doi')
        if not doi or v['bib'].get('authors'):
            continue
        r = get('https://api.crossref.org/works/' + urllib.parse.quote(doi))
        its = (r.get('message', {}) if isinstance(r, dict) else {}).get('author') or []
        v['bib']['authors'] = [{'family': a.get('family', ''), 'initials': ''.join(w[0] + '.' for w in re.split(r'[\s\-]+', a.get('given', '')) if w)} for a in its]
        print(k, len(its), 'authors')
        rawp.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding='utf-8')
        time.sleep(0.3)


def retry_abstracts():
    rawp = ROOT / 'verification_raw.json'
    raw = json.loads(rawp.read_text(encoding='utf-8'))
    for k, v in raw.items():
        if v.get('abstract') or v['bib'].get('status') != 'match':
            continue
        a = eric(v['cand']) or (s2(v['bib']['doi']) if v['bib'].get('doi') else None)
        if not a and v['bib'].get('doi'):
            a = epmc(v['bib']['doi'])
        v['abstract'] = a
        print(k, a['src'] if a else '없음')
        rawp.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding='utf-8')
        time.sleep(1.1)


def main():
    if '--abstracts' in sys.argv:
        return retry_abstracts()
    if '--authors' in sys.argv:
        return fill_authors()
    cands = json.loads((ROOT / 'candidates.json').read_text(encoding='utf-8'))
    only = set(a for a in sys.argv[1:] if not a.startswith('--'))
    rawp = ROOT / 'verification_raw.json'
    raw = json.loads(rawp.read_text(encoding='utf-8')) if rawp.exists() else {}
    for c in cands:
        if only and c['id'] not in only:
            continue
        if c['id'] in raw and not only:
            continue
        raw[c['id']] = verify(c)
        b = raw[c['id']]['bib']
        print(c['id'], b['status'], b.get('doi'), '초록:' + (raw[c['id']]['abstract'] or {}).get('src', '없음'), b.get('diffs') or '')
        rawp.write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding='utf-8')
        time.sleep(0.4)


if __name__ == '__main__':
    main()
