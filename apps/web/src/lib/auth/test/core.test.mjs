// LR-A1(ID トークンの検証)・LR-A2(cookie)・LR-A3(更新の分類)・LR-A4(getVerifiedUser の判定)・
// LR-A10(next の判定)と、POST /auth/session の受付(LR-B6 の判定の核)。
// 実行: `pnpm --filter web test`(node の type stripping で core.ts を直接読む。stack・ネットワークは使わない)
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { describe, it } from 'node:test'
import {
  ID_TOKEN_MAX_LENGTH,
  SESSION_LIFETIME_SEC,
  acceptLogin,
  classifyRefreshResponse,
  classifySessionValidity,
  clearedCookieAttributes,
  createKeyStore,
  openSession,
  parseBearerAuthorization,
  parseSessionKeys,
  resolveTokenUser,
  resolveVerifiedUser,
  safeNextPath,
  sealSession,
  sessionCookieAttributes,
  updateSessionCookie,
  verifyIdToken,
} from '../core.ts'
import { NOW, PROJECT, baseClaims, certPem, newRsaKey, signToken } from './helpers.mjs'

const keyA = newRsaKey()
const keyB = newRsaKey()
const certs = { k1: certPem(keyA) }
const getKeyFrom = (list) => async (kid) => {
  const store = createKeyStore({ fetchCerts: async () => ({ certs: list, maxAgeSec: 3600 }) })
  return store.getKey(kid)
}
const verify = (token, extra = {}) =>
  verifyIdToken(token, { projectId: PROJECT, nowSec: NOW, getKey: getKeyFrom(certs), ...extra })
const good = (overrides) => signToken({ key: keyA, claims: baseClaims(overrides) })

describe('LR-A1 ID トークンの検証', () => {
  it('正: 手元の鍵の RS256・iss と aud が一致・exp が未来・iat が過去・sub が空でない・auth_time が過去', async () => {
    const result = await verify(good())
    assert.equal(result.ok, true)
    assert.equal(result.claims.sub, 'lr-a-uid-0001')
    assert.equal(result.claims.auth_time, NOW - 60)
  })

  it('provider: firebase.sign_in_provider の google.com / apple.com だけを読み、ほかと欠落は null(表示用・認可に使わない)', async () => {
    const providerOf = async (firebase) => (await verify(good({ firebase }))).claims.provider
    assert.equal(await providerOf({ sign_in_provider: 'google.com' }), 'google')
    assert.equal(await providerOf({ sign_in_provider: 'apple.com' }), 'apple')
    assert.equal(await providerOf({ sign_in_provider: 'password' }), null)
    assert.equal(await providerOf('google.com'), null)
    assert.equal(await providerOf(undefined), null)
  })

  const rejected = [
    ['別の kid(一覧に無い)', () => signToken({ key: keyA, kid: 'other', claims: baseClaims() }), 'kid'],
    ['同じ kid で別の署名', () => signToken({ key: keyB, claims: baseClaims() }), 'signature'],
    ['alg none', () => signToken({ alg: 'none', claims: baseClaims() }), 'alg'],
    ['HS256(公開鍵を秘密にした取り違え)', () => signToken({ alg: 'HS256', secret: certs.k1, claims: baseClaims() }), 'alg'],
    ['iss が別の project', () => good({ iss: 'https://securetoken.google.com/other' }), 'claims'],
    ['aud が別の project', () => good({ aud: 'other' }), 'claims'],
    ['exp が過去', () => good({ iat: NOW - 7200, exp: NOW - 3600 }), 'expired'],
    ['iat が未来', () => good({ iat: NOW + 3600, exp: NOW + 7200 }), 'issued_in_future'],
    ['auth_time 無し', () => good({ auth_time: undefined }), 'auth_time'],
    ['auth_time が未来', () => good({ auth_time: NOW + 3600 }), 'auth_time'],
    ['sub が空', () => good({ sub: '' }), 'claims'],
    ['sub 無し', () => good({ sub: undefined }), 'claims'],
    ['3 つに分かれない', () => 'abc.def', 'malformed'],
  ]
  for (const [name, make, reason] of rejected) {
    it(`負: ${name} → 拒む`, async () => {
      const result = await verify(make())
      assert.equal(result.ok, false)
      assert.equal(result.reason, reason)
    })
  }

  it('負: 署名の後ろを 1 文字変えると拒む', async () => {
    const token = good()
    const tampered = `${token.slice(0, -3)}${token.endsWith('AAA') ? 'BBB' : 'AAA'}`
    assert.equal((await verify(tampered)).ok, false)
  })

  it('負: payload を差し替えても拒む(署名は元の payload のもの)', async () => {
    const [h, , s] = good().split('.')
    const forged = Buffer.from(JSON.stringify(baseClaims({ sub: 'someone-else' }))).toString('base64url')
    assert.equal((await verify(`${h}.${forged}.${s}`)).ok, false)
  })

  it('負: ログインの受付は auth_time が 5 分より古いと拒む(stale_login)', async () => {
    const old = good({ auth_time: NOW - 6 * 60 })
    assert.equal((await verify(old)).ok, true)
    const strict = await verify(old, { maxAuthAgeSec: 300 })
    assert.equal(strict.ok, false)
    assert.equal(strict.reason, 'stale_login')
    assert.equal((await verify(good({ auth_time: NOW - 4 * 60 }), { maxAuthAgeSec: 300 })).ok, true)
  })

  it('一覧に無い kid は 1 回だけ取り直し、なお無ければ拒む', async () => {
    let fetches = 0
    let now = 1_000_000
    const store = createKeyStore({
      fetchCerts: async () => {
        fetches += 1
        return { certs, maxAgeSec: 3600 }
      },
      nowMs: () => now,
    })
    assert.equal((await store.getKey('k1')).ok, true)
    assert.equal(fetches, 1)
    // 取り直しの最短の間隔の内: 取り直さない
    assert.deepEqual(await store.getKey('nope'), { ok: false, reason: 'unknown_kid' })
    assert.equal(fetches, 1)
    // 間隔を過ぎた: 1 回だけ取り直し、なお無ければ拒む
    now += 11_000
    assert.deepEqual(await store.getKey('nope'), { ok: false, reason: 'unknown_kid' })
    assert.equal(fetches, 2)
  })

  it('新しい kid が一覧に増えたら、取り直しの後に受ける', async () => {
    let list = certs
    let now = 1_000_000
    const store = createKeyStore({ fetchCerts: async () => ({ certs: list, maxAgeSec: 3600 }), nowMs: () => now })
    assert.equal((await store.getKey('k1')).ok, true)
    list = { ...certs, k2: certPem(keyB) }
    now += 11_000
    assert.equal((await store.getKey('k2')).ok, true)
  })

  it('一覧の取得の失敗は拒む(fail-closed・理由は keys_unavailable)', async () => {
    const store = createKeyStore({
      fetchCerts: async () => {
        throw new Error('network')
      },
    })
    const result = await verifyIdToken(good(), { projectId: PROJECT, nowSec: NOW, getKey: (kid) => store.getKey(kid) })
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'keys_unavailable')
  })

  it('max-age を過ぎた一覧は取り直し、取り直しに失敗すれば古い一覧で受けない', async () => {
    let fail = false
    let now = 1_000_000
    const store = createKeyStore({
      fetchCerts: async () => {
        if (fail) throw new Error('down')
        return { certs, maxAgeSec: 60 }
      },
      nowMs: () => now,
    })
    assert.equal((await store.getKey('k1')).ok, true)
    now += 61_000
    fail = true
    assert.deepEqual(await store.getKey('k1'), { ok: false, reason: 'keys_unavailable' })
  })
})

describe('LR-A2 cookie', () => {
  const keys = parseSessionKeys(`k1:${randomBytes(32).toString('base64')},k0:${randomBytes(32).toString('base64')}`)
  const payload = {
    v: 1,
    sub: 'lr-a-uid-0001',
    rt: 'refresh-token-value',
    it: good(),
    exp: NOW + 3540,
    at: NOW - 60,
    ts: NOW - 60,
  }

  it('正: 暗号化 → 復号で同じ中身(先頭の鍵で暗号化し、残りの鍵でも復号できる)', () => {
    const sealed = sealSession(payload, keys)
    assert.match(sealed, /^v1\.k1\./)
    assert.deepEqual(openSession(sealed, keys, NOW), { ok: true, session: payload })
    // 鍵を作り直して先頭を替えても、一覧に残っている鍵の cookie は開く
    const rotated = [keys[1], keys[0]]
    assert.equal(openSession(sealed, rotated, NOW).ok, true)
  })

  it('正: 属性は HttpOnly・SameSite=Lax・Path=/・https のとき Secure・Max-Age が 30 日の残り', () => {
    const attrs = sessionCookieAttributes({ secure: true, session: payload, nowSec: NOW })
    assert.deepEqual(attrs, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      maxAge: payload.ts + SESSION_LIFETIME_SEC - NOW,
    })
    assert.equal(sessionCookieAttributes({ secure: false, session: payload, nowSec: NOW }).secure, false)
    assert.equal(clearedCookieAttributes(true).maxAge, 0)
  })

  it('負: 一覧に無い鍵 id → 拒む', () => {
    const sealed = sealSession(payload, keys)
    assert.deepEqual(openSession(sealed, [keys[1]], NOW), { ok: false, reason: 'unknown_key' })
  })

  it('負: 改ざん(本文・鍵 id の付け替え)→ 拒む', () => {
    const sealed = sealSession(payload, keys)
    const [v, id, body] = sealed.split('.')
    const flipped = `${body.slice(0, 20)}${body[20] === 'A' ? 'B' : 'A'}${body.slice(21)}`
    assert.equal(openSession(`${v}.${id}.${flipped}`, keys, NOW).ok, false)
    // 別の鍵 id を名乗らせると、その鍵では復号できない(AAD にも鍵 id が入っている)
    assert.equal(openSession(`${v}.k0.${body}`, keys, NOW).ok, false)
    assert.equal(openSession('garbage', keys, NOW).ok, false)
    assert.equal(openSession('v1.k1.AAAA', keys, NOW).ok, false)
  })

  it('負: 預かって 30 日を過ぎた cookie / auth_time から 30 日を過ぎた cookie → 拒む', () => {
    const sealed = sealSession(payload, keys)
    assert.deepEqual(openSession(sealed, keys, payload.ts + SESSION_LIFETIME_SEC), { ok: false, reason: 'expired' })
    assert.equal(openSession(sealed, keys, payload.ts + SESSION_LIFETIME_SEC - 1).ok, true)
    const oldLogin = sealSession({ ...payload, at: NOW - SESSION_LIFETIME_SEC - 10 }, keys)
    assert.equal(openSession(oldLogin, keys, NOW).ok, false)
  })

  it('SESSION_ENCRYPTION_KEYS の形の検査(値を例外の文に出さない)', () => {
    const material = randomBytes(32).toString('base64')
    assert.equal(parseSessionKeys(`k1:${material}`)[0].key.length, 32)
    for (const bad of ['', 'k1', 'k1:', `:${material}`, `k1:${randomBytes(16).toString('base64')}`, `k1:${material},k1:${material}`, `bad id:${material}`]) {
      assert.throws(() => parseSessionKeys(bad), (error) => !error.message.includes(material))
    }
  })
})

describe('LR-A3 更新の分類', () => {
  const keys = parseSessionKeys(`k1:${randomBytes(32).toString('base64')}`)
  const session = (overrides = {}) => ({
    v: 1,
    sub: 'lr-a-uid-0001',
    rt: 'rt-old',
    it: good({ exp: NOW + 120 }),
    exp: NOW + 120, // 残り 2 分(5 分未満)
    at: NOW - 600,
    ts: NOW - 600,
    ...overrides,
  })
  const run = (payload, response) => {
    const calls = []
    const result = updateSessionCookie(sealSession(payload, keys), {
      keys,
      nowSec: NOW,
      fetchRefresh: async (rt) => {
        calls.push(rt)
        return response
      },
      verifyIdToken: (token) => verify(token),
    })
    return result.then((r) => ({ ...r, calls }))
  }
  const refreshedBody = (claims = {}) => ({
    id_token: good({ auth_time: NOW - 600, iat: NOW, exp: NOW + 3600, ...claims }),
    refresh_token: 'rt-new',
  })

  it('残りが 5 分以上なら取り直さない', async () => {
    const result = await run(session({ exp: NOW + 600 }), { status: 200, body: refreshedBody() })
    assert.deepEqual(result.change, { kind: 'none' })
    assert.equal(result.calls.length, 0)
  })

  it('正: 200 → cookie を書き直す(auth_time と預かり始めの時刻は不変・期限と更新用の鍵が替わる)', async () => {
    const result = await run(session(), { status: 200, body: refreshedBody() })
    assert.equal(result.change.kind, 'set')
    const opened = openSession(result.change.value, keys, NOW)
    assert.equal(opened.ok, true)
    assert.equal(opened.session.at, NOW - 600)
    assert.equal(opened.session.ts, NOW - 600)
    assert.equal(opened.session.rt, 'rt-new')
    assert.equal(opened.session.exp, NOW + 3600)
    assert.deepEqual(result.calls, ['rt-old'])
  })

  it('負: 400 → cookie を消し未ログイン', async () => {
    const result = await run(session(), { status: 400, body: { error: { message: 'TOKEN_EXPIRED' } } })
    assert.deepEqual(result.change, { kind: 'clear' })
    assert.equal(result.session, null)
  })

  for (const [name, response] of [
    ['通信の失敗・時間切れ', { status: null, body: null }],
    ['429', { status: 429, body: null }],
    ['500', { status: 500, body: null }],
    ['503', { status: 503, body: { error: {} } }],
    ['401(設定の誤りでも出るので全員を消さない)', { status: 401, body: null }],
    ['200 だが応答の中身が不備', { status: 200, body: { id_token: 5 } }],
  ]) {
    it(`負: ${name} → cookie を変えない(Set-Cookie を出さない)`, async () => {
      const result = await run(session(), response)
      assert.deepEqual(result.change, { kind: 'none' })
      assert.equal(result.session.rt, 'rt-old')
    })
  }

  it('負: 取り直した ID トークンの署名・sub・auth_time が元と違えば受けない(30 日の起点を延ばさせない)', async () => {
    const forged = signToken({ key: keyB, claims: baseClaims({ auth_time: NOW - 600, iat: NOW, exp: NOW + 3600 }) })
    assert.deepEqual((await run(session(), { status: 200, body: { id_token: forged, refresh_token: 'x' } })).change, { kind: 'none' })
    assert.deepEqual((await run(session(), { status: 200, body: refreshedBody({ sub: 'someone-else' }) })).change, { kind: 'none' })
    assert.deepEqual((await run(session(), { status: 200, body: refreshedBody({ auth_time: NOW - 10 }) })).change, { kind: 'none' })
  })

  it('負: 預かってから 30 日を過ぎた → 消す(取り直さない)', async () => {
    const result = await run(session({ ts: NOW - SESSION_LIFETIME_SEC - 1 }), { status: 200, body: refreshedBody() })
    assert.deepEqual(result.change, { kind: 'clear' })
    assert.equal(result.calls.length, 0)
  })

  it('cookie が無ければ何もしない / 開けない cookie は消す', async () => {
    const deps = { keys, nowSec: NOW, fetchRefresh: async () => ({ status: 500, body: null }), verifyIdToken: verify }
    assert.deepEqual((await updateSessionCookie(undefined, deps)).change, { kind: 'none' })
    assert.deepEqual((await updateSessionCookie('v1.zz.AAAA', deps)).change, { kind: 'clear' })
  })

  it('分類の関数: 400 だけが失効', () => {
    assert.equal(classifyRefreshResponse(400, null).kind, 'revoked')
    assert.equal(classifyRefreshResponse(200, refreshedBody()).kind, 'refreshed')
    assert.equal(classifyRefreshResponse(null, null).kind, 'transient')
  })
})

describe('LR-A4 getVerifiedUser の判定', () => {
  const keys = parseSessionKeys(`k1:${randomBytes(32).toString('base64')}`)
  const payload = (overrides = {}) => ({
    v: 1,
    sub: 'lr-a-uid-0001',
    rt: 'rt',
    it: good(),
    exp: NOW + 3540,
    at: NOW - 60,
    ts: NOW - 60,
    ...overrides,
  })
  const resolve = async (raw, validity, extra = {}) => {
    const log = { cleared: 0, dbCalls: 0 }
    const user = await resolveVerifiedUser(raw, {
      keys,
      nowSec: NOW,
      verifyIdToken: (token) => verify(token),
      checkSessionValidity: async () => {
        log.dbCalls += 1
        return validity
      },
      clearCookie: () => {
        log.cleared += 1
      },
      ...extra,
    })
    return { user, ...log, get cleared() { return log.cleared } }
  }

  it('正: 署名が有効で session_is_valid() が真 → 利用者', async () => {
    const result = await resolve(sealSession(payload(), keys), 'valid')
    assert.deepEqual(result.user, { id: 'lr-a-uid-0001', authTime: NOW - 60, provider: null })
    assert.equal(result.cleared, 0)
  })

  it('負: DB が偽 → cookie を消し未ログイン', async () => {
    const result = await resolve(sealSession(payload(), keys), 'invalid')
    assert.equal(result.user, null)
    assert.equal(result.cleared, 1)
  })

  it('負: DB の通信エラー・時間切れ・5xx → その要求だけ未ログイン(cookie は変えない)', async () => {
    const result = await resolve(sealSession(payload(), keys), 'unavailable')
    assert.equal(result.user, null)
    assert.equal(result.cleared, 0)
  })

  it('負: cookie が無い・開けない → 未ログイン(開けない cookie は消す)・DB を呼ばない', async () => {
    const none = await resolve(undefined, 'valid')
    assert.equal(none.user, null)
    assert.equal(none.dbCalls, 0)
    const broken = await resolve('v1.k1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'valid')
    assert.equal(broken.user, null)
    assert.equal(broken.cleared, 1)
    assert.equal(broken.dbCalls, 0)
  })

  it('負: ID トークンの期限切れ(更新の一時の失敗の間)→ 未ログイン・cookie は変えない・DB を呼ばない', async () => {
    const expired = signToken({ key: keyA, claims: baseClaims({ iat: NOW - 7200, exp: NOW - 3600 }) })
    const result = await resolve(sealSession(payload({ it: expired, exp: NOW - 3600 }), keys), 'valid')
    assert.equal(result.user, null)
    assert.equal(result.cleared, 0)
    assert.equal(result.dbCalls, 0)
  })

  it('負: 署名が通らない ID トークン → 未ログイン・cookie を消す・DB を呼ばない', async () => {
    const forged = signToken({ key: keyB, claims: baseClaims() })
    const result = await resolve(sealSession(payload({ it: forged }), keys), 'valid')
    assert.equal(result.user, null)
    assert.equal(result.cleared, 1)
    assert.equal(result.dbCalls, 0)
  })

  it('負: 公開鍵の一覧が取れない → 未ログイン・cookie は変えない・DB を呼ばない', async () => {
    const result = await resolve(sealSession(payload(), keys), 'valid', {
      verifyIdToken: async () => ({ ok: false, reason: 'keys_unavailable' }),
    })
    assert.equal(result.user, null)
    assert.equal(result.cleared, 0)
    assert.equal(result.dbCalls, 0)
  })

  it('負: 一覧に無い kid(鍵の入れ替わり直後)→ 未ログイン・cookie は変えない・DB を呼ばない', async () => {
    const result = await resolve(sealSession(payload(), keys), 'valid', {
      verifyIdToken: async () => ({ ok: false, reason: 'kid' }),
    })
    assert.equal(result.user, null)
    assert.equal(result.cleared, 0)
    assert.equal(result.dbCalls, 0)
  })

  it('負: cookie の sub と ID トークンの sub が違う → 未ログイン・cookie を消す', async () => {
    const result = await resolve(sealSession(payload({ sub: 'someone-else' }), keys), 'valid')
    assert.equal(result.user, null)
    assert.equal(result.cleared, 1)
  })

  it('DB の応答の分類: 偽と 401/403 は失効・真は有効・通信エラーと 5xx は判定できない', () => {
    assert.equal(classifySessionValidity({ data: true, status: 200, hadError: false }), 'valid')
    assert.equal(classifySessionValidity({ data: false, status: 200, hadError: false }), 'invalid')
    assert.equal(classifySessionValidity({ data: null, status: 401, hadError: true }), 'invalid')
    assert.equal(classifySessionValidity({ data: null, status: 403, hadError: true }), 'invalid')
    assert.equal(classifySessionValidity({ data: null, status: 0, hadError: true }), 'unavailable')
    assert.equal(classifySessionValidity({ data: null, status: 500, hadError: true }), 'unavailable')
    assert.equal(classifySessionValidity({ data: null, status: 503, hadError: true }), 'unavailable')
    assert.equal(classifySessionValidity({ data: null, status: 200, hadError: false }), 'unavailable')
  })
})

describe('Bearer の判定(resolveTokenUser)', () => {
  const run = async (token, validity, extra = {}, options = {}) => {
    const log = { dbCalls: 0 }
    const result = await resolveTokenUser(
      token,
      {
        verifyIdToken: (t) => verify(t),
        checkSessionValidity: async () => {
          log.dbCalls += 1
          return validity
        },
        ...extra,
      },
      options,
    )
    return { result, log }
  }

  it('(a) parseBearerAuthorization: 正しい形だけトークンを返す', () => {
    assert.equal(parseBearerAuthorization('Bearer abc.DEF_ghi-123'), 'abc.DEF_ghi-123')
    assert.equal(parseBearerAuthorization(`Bearer ${'a'.repeat(ID_TOKEN_MAX_LENGTH)}`), 'a'.repeat(ID_TOKEN_MAX_LENGTH))
    for (const bad of [
      'bearer abc',
      'BEARER abc',
      'Bearer  abc',
      'Bearer abc ',
      ' Bearer abc',
      'Bearer ',
      'Bearer',
      `Bearer ${'a'.repeat(ID_TOKEN_MAX_LENGTH + 1)}`,
      'Basic abc',
      'Bearer abc def',
      'Bearer a+b',
      'Bearer abc\n',
      '',
      null,
    ]) {
      assert.equal(parseBearerAuthorization(bad), null, `拒むべき: ${JSON.stringify(bad)}`)
    }
  })

  it('(b) 署名が通らない → rejected・DB を呼ばない', async () => {
    const forged = signToken({ key: keyB, claims: baseClaims() })
    const { result, log } = await run(forged, 'valid')
    assert.deepEqual(result, { ok: false, reason: 'rejected' })
    assert.equal(log.dbCalls, 0)
  })

  it('(c) 期限切れ → expired・DB を呼ばない', async () => {
    const expired = signToken({ key: keyA, claims: baseClaims({ iat: NOW - 7200, exp: NOW - 3600 }) })
    const { result, log } = await run(expired, 'valid')
    assert.deepEqual(result, { ok: false, reason: 'expired' })
    assert.equal(log.dbCalls, 0)
  })

  it('(d) 鍵の一覧が取れない・一覧に無い kid → keys_unavailable・DB を呼ばない', async () => {
    const unavailable = await run(good(), 'valid', { verifyIdToken: async () => ({ ok: false, reason: 'keys_unavailable' }) })
    assert.deepEqual(unavailable.result, { ok: false, reason: 'keys_unavailable' })
    assert.equal(unavailable.log.dbCalls, 0)
    const otherKid = await run(signToken({ key: keyA, kid: 'other', claims: baseClaims() }), 'valid')
    assert.deepEqual(otherKid.result, { ok: false, reason: 'keys_unavailable' })
    assert.equal(otherKid.log.dbCalls, 0)
  })

  it('(e) DB が偽・401 → session_invalid', async () => {
    const fake = await run(good(), 'invalid')
    assert.deepEqual(fake.result, { ok: false, reason: 'session_invalid' })
    assert.equal(fake.log.dbCalls, 1)
    assert.equal(classifySessionValidity({ data: null, status: 401, hadError: true }), 'invalid')
  })

  it('(f) DB の通信の失敗・5xx → session_unavailable', async () => {
    const down = await run(good(), 'unavailable')
    assert.deepEqual(down.result, { ok: false, reason: 'session_unavailable' })
    assert.equal(classifySessionValidity({ data: null, status: 503, hadError: true }), 'unavailable')
  })

  it('(g) 有効 → { id: sub, authTime, provider }', async () => {
    const { result } = await run(good({ firebase: { sign_in_provider: 'apple.com' } }), 'valid')
    assert.deepEqual(result, { ok: true, user: { id: 'lr-a-uid-0001', authTime: NOW - 60, provider: 'apple' } })
  })

  it('(h) expectedSub が違う → rejected・DB を呼ばない / 同じなら通る', async () => {
    const wrong = await run(good(), 'valid', {}, { expectedSub: 'someone-else' })
    assert.deepEqual(wrong.result, { ok: false, reason: 'rejected' })
    assert.equal(wrong.log.dbCalls, 0)
    const same = await run(good(), 'valid', {}, { expectedSub: 'lr-a-uid-0001' })
    assert.equal(same.result.ok, true)
  })
})

describe('POST /auth/session の受付(LR-B6 の判定の核)', () => {
  const keys = parseSessionKeys(`k1:${randomBytes(32).toString('base64')}`)
  const appUrl = 'http://localhost:3000'
  const deps = {
    appUrl,
    keys,
    nowSec: NOW,
    verifyIdToken: (token, maxAuthAgeSec) => verify(token, { maxAuthAgeSec }),
  }
  const request = (overrides = {}, tokenOverrides) => ({
    origin: appUrl,
    contentType: 'application/json',
    bodyText: JSON.stringify({ idToken: tokenOverrides ?? good(), refreshToken: 'rt-1', next: '/saved' }),
    ...overrides,
  })

  it('正: cookie の値と戻り先を返す(auth_time が 5 分以内)', async () => {
    const result = await acceptLogin(request(), deps)
    assert.equal(result.ok, true)
    assert.equal(result.next, '/saved')
    assert.equal(result.session.ts, NOW)
    assert.equal(openSession(result.value, keys, NOW).ok, true)
  })

  const denied = [
    ['別の Origin', request({ origin: 'https://evil.example' }), 403],
    ['Origin 無し', request({ origin: null }), 403],
    ['フォームの Content-Type', request({ contentType: 'application/x-www-form-urlencoded' }), 403],
    ['別の aud', request({}, good({ aud: 'other' })), 401],
    ['alg none', request({}, signToken({ alg: 'none', claims: baseClaims() })), 401],
    ['期限切れ', request({}, good({ iat: NOW - 7200, exp: NOW - 3600 })), 401],
    ['auth_time が 6 分前', request({}, good({ auth_time: NOW - 6 * 60 })), 401],
    ['別の鍵の署名', request({}, signToken({ key: keyB, claims: baseClaims() })), 401],
  ]
  for (const [name, input, status] of denied) {
    it(`負: ${name} → ${status}(cookie の値を返さない)`, async () => {
      const result = await acceptLogin(input, deps)
      assert.equal(result.ok, false)
      assert.equal(result.status, status)
      assert.equal('value' in result, false)
    })
  }

  it('負: 本文が JSON でない・欄が足りない → 400 / 大きすぎる → 413', async () => {
    assert.equal((await acceptLogin(request({ bodyText: 'x' }), deps)).status, 400)
    assert.equal((await acceptLogin(request({ bodyText: JSON.stringify({ idToken: good() }) }), deps)).status, 400)
    assert.equal((await acceptLogin(request({ bodyText: 'x'.repeat(9000) }), deps)).status, 413)
  })

  it('next が危険なら /map', async () => {
    const body = JSON.stringify({ idToken: good(), refreshToken: 'rt', next: '//evil.example' })
    assert.equal((await acceptLogin(request({ bodyText: body }), deps)).next, '/map')
  })
})

describe('LR-A10 next の判定', () => {
  const appUrl = 'http://localhost:3000'
  for (const [input, expected] of [
    ['/saved', '/saved'],
    ['/places/abc?x=1#y', '/places/abc?x=1#y'],
    ['/', '/'],
    ['//evil.example', '/map'],
    ['/\\evil.example', '/map'],
    ['https://evil.example', '/map'],
    ['http://localhost:3000/saved', '/map'],
    ['/\t/evil.example', '/map'],
    ['/a\nb', '/map'],
    ['saved', '/map'],
    ['', '/map'],
    [undefined, '/map'],
    [42, '/map'],
  ]) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(safeNextPath(input, appUrl), expected)
    })
  }
})
