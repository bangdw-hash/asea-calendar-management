/**
 * ASEA Meet — Google Apps Script JWT 프록시
 *
 * 이 코드를 Google Apps Script에 붙여넣고 웹앱으로 배포하세요.
 *
 * 스크립트 속성 (⚙️ 프로젝트 설정 → 스크립트 속성)에 아래 3개를 추가하세요:
 *   JAAS_APP_ID      : jaas.8x8.vc 앱 ID (예: vpaas-magic-cookie-xxxxx)
 *   JAAS_KEY_ID      : API Key ID
 *   JAAS_PRIVATE_KEY : .pem 파일 전체 내용 (-----BEGIN RSA PRIVATE KEY----- 포함)
 */

var PROPS = PropertiesService.getScriptProperties();

function doGet(e) {
  var action = e.parameter.action || '';
  var result;
  try {
    if (action === 'host_token') {
      result = _makeHostToken(e.parameter.room || '', e.parameter.topic || '');
    } else if (action === 'ping') {
      result = { ok: true, msg: 'ASEA Meet Proxy 정상 작동 중' };
    } else {
      result = { error: '알 수 없는 action: ' + action };
    }
  } catch (err) {
    result = { error: err.message || String(err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── 호스트 JWT 생성 ── */
function _makeHostToken(room, topic) {
  var appId      = PROPS.getProperty('JAAS_APP_ID')      || '';
  var keyId      = PROPS.getProperty('JAAS_KEY_ID')      || '';
  var privateKey = PROPS.getProperty('JAAS_PRIVATE_KEY') || '';

  if (!appId || !keyId || !privateKey) {
    throw new Error('스크립트 속성(JAAS_APP_ID / JAAS_KEY_ID / JAAS_PRIVATE_KEY)을 설정해주세요.');
  }

  var now     = Math.floor(Date.now() / 1000);
  var exp     = now + 7200; // 2시간 유효

  /* JWT Header */
  var header = _b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }));

  /* JWT Payload */
  var payload = _b64url(JSON.stringify({
    iss:        'chat',
    iat:        now,
    exp:        exp,
    nbf:        now - 10,
    aud:        'jitsi',
    sub:        appId,
    room:       room,
    context: {
      user: {
        name:       'ASEA 호스트',
        email:      'asea@asea.or.kr',
        avatar:     '',
        moderator:  'true'
      },
      features: {
        livestreaming: 'true',
        recording:     'true',
        transcription: 'true',
        'outbound-call': 'false'
      }
    }
  }));

  /* 서명 */
  var sigInput   = header + '.' + payload;
  var signature  = _signRS256(sigInput, privateKey);

  return { token: sigInput + '.' + signature, exp: exp };
}

/* ── RSA-SHA256 서명 ── */
function _signRS256(data, pemKey) {
  var key = pemKey
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  var keyBytes  = Utilities.base64Decode(key);
  var dataBytes = Utilities.newBlob(data).getBytes();
  var sig       = Utilities.computeRsaSha256Signature(dataBytes, keyBytes);
  return _b64urlBytes(sig);
}

/* ── Base64URL 인코딩 ── */
function _b64url(str) {
  return _b64urlBytes(Utilities.newBlob(str).getBytes());
}
function _b64urlBytes(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
