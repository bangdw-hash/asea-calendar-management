#!/usr/bin/env python3
"""korean.html 음성 파일 생성기 (남성 신경망 음성, 느린 속도).

사용법:
  pip install edge-tts
  python3 tools/korean_audio_gen.py            # 없는 파일만 생성
  python3 tools/korean_audio_gen.py --force    # 전체 재생성

출력: audio/korean/<sha1 앞 10자>.mp3 와 audio/korean/manifest.json (문구 -> 파일명)
참고: 프록시 환경에서는 HTTPS_PROXY / SSL_CERT_FILE 환경변수를 사용합니다.
"""
import asyncio, hashlib, json, os, subprocess, sys

import edge_tts

VOICE = 'ko-KR-InJoonNeural'
RATE = '-25%'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'audio', 'korean')
FORCE = '--force' in sys.argv


def texts():
    js = "require('./korean-data.js');console.log(JSON.stringify(globalThis.KOR.audioTexts()))"
    out = subprocess.check_output(['node', '-e', js], cwd=ROOT)
    return json.loads(out)


def fname(t):
    return hashlib.sha1(t.encode('utf-8')).hexdigest()[:10] + '.mp3'


async def one(sem, t, proxy):
    path = os.path.join(OUT, fname(t))
    if os.path.exists(path) and os.path.getsize(path) > 500 and not FORCE:
        return True
    async with sem:
        for _ in range(4):
            try:
                tmp = path + '.tmp.mp3'
                await edge_tts.Communicate(t, VOICE, rate=RATE, proxy=proxy).save(tmp)
                # 용량 절감: 모노 22.05kHz 32kbps 로 재인코딩
                subprocess.check_call(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-ac', '1', '-ar', '22050', '-b:a', '32k', path])
                os.remove(tmp)
                if os.path.getsize(path) > 500:
                    return True
            except Exception as e:  # 네트워크 일시 오류 재시도
                err = e
            await asyncio.sleep(1.5)
        print('실패:', t, err)
        return False


async def main():
    os.makedirs(OUT, exist_ok=True)
    ts = texts()
    proxy = os.environ.get('HTTPS_PROXY') or None
    sem = asyncio.Semaphore(6)
    res = await asyncio.gather(*[one(sem, t, proxy) for t in ts])
    man = {t: fname(t) for t, ok in zip(ts, res) if ok}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=0, sort_keys=True)
    keep = set(man.values()) | {'manifest.json'}
    for f in os.listdir(OUT):  # 더 이상 쓰이지 않는 파일 정리
        if f not in keep:
            os.remove(os.path.join(OUT, f))
    print('문구 %d개 중 %d개 완료' % (len(ts), len(man)))


asyncio.run(main())
