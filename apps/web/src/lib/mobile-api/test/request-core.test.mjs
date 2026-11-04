// T-W3: mobile の受け口の純粋な核(判定の順・status・header・runMobileApi の「認証が通るまで先へ進まない」)。
// 実行: `pnpm --filter web test`(node の type stripping で request-core.ts と lib/auth/core.ts を直接読む)
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseBearerAuthorization } from '../../auth/core.ts'
import {
  MOBILE_API_BODY_MAX_LENGTH,
  mobileApiHeaders,
  parseMobileApiBody,
  parseMobileApiHead,
  readBoundedText,
  MOBILE_API_BODY_MAX_BYTES,
  runMobileApi,
  statusForTokenFailure,
} from '../request-core.ts'

const good = {
  method: 'POST',
  contentType: 'application/json',
  authorization: 'Bearer tok.en-1_2',
  bodyText: '{"a":1}',
}

/** 試験の入力(bodyText)を受け口の形(readBody)に。読まれた回数を数える。 */
let bodyReads = 0
function toInput({ bodyText, ...rest }) {
  return {
    ...rest,
    readBody: async () => {
      bodyReads += 1
      return bodyText
    },
  }
}

/** header の判定 → 本文の判定 を続けて行う(runMobileApi の検証を除いた順)。 */
async function parseMobileApiRequest(input, parseBearer) {
  const head = parseMobileApiHead(input, parseBearer)
  if (!head.ok) return head
  const body = await parseMobileApiBody(input.readBody)
  if (!body.ok) return body
  return { ok: true, token: head.token, body: body.body }
}

describe('parseMobileApiHead と parseMobileApiBody(形の判定)', () => {
  it('正: token と本文を返す(charset つきの Content-Type も通る)', async () => {
    assert.deepEqual(await parseMobileApiRequest(toInput(good), parseBearerAuthorization), {
      ok: true,
      token: 'tok.en-1_2',
      body: { a: 1 },
    })
    assert.equal(
      (await parseMobileApiRequest(toInput({ ...good, contentType: 'application/json; charset=utf-8' }), parseBearerAuthorization)).ok,
      true,
    )
  })

  const cases = [
    ['GET → 405', { method: 'GET' }, 405, 'method_not_allowed'],
    ['PUT → 405', { method: 'PUT' }, 405, 'method_not_allowed'],
    ['text/plain → 415', { contentType: 'text/plain' }, 415, 'unsupported_media_type'],
    ['Content-Type なし → 415', { contentType: null }, 415, 'unsupported_media_type'],
    ['application/jsonp → 415', { contentType: 'application/jsonp' }, 415, 'unsupported_media_type'],
    ['8,193 文字 → 413', { bodyText: 'x'.repeat(MOBILE_API_BODY_MAX_LENGTH + 1) }, 413, 'payload_too_large'],
    ['Authorization なし → 401', { authorization: null }, 401, 'unauthenticated'],
    ['Basic → 401', { authorization: 'Basic abc' }, 401, 'unauthenticated'],
    ['壊れた JSON(トークンあり)→ 400', { bodyText: '{"a":' }, 400, 'invalid_json'],
  ]
  for (const [name, override, status, error] of cases) {
    it(`負: ${name}`, async () => {
      assert.deepEqual(await parseMobileApiRequest(toInput({ ...good, ...override }), parseBearerAuthorization), {
        ok: false,
        status,
        error,
      })
    })
  }

  it('境界: 8,192 文字ちょうどは通る', async () => {
    const bodyText = JSON.stringify({ a: 'x'.repeat(MOBILE_API_BODY_MAX_LENGTH - 8) })
    assert.equal(bodyText.length, MOBILE_API_BODY_MAX_LENGTH)
    assert.equal((await parseMobileApiRequest(toInput({ ...good, bodyText }), parseBearerAuthorization)).ok, true)
  })

  it('Authorization の形が通らない要求は本文を読まない(readBody 0 回)', async () => {
    bodyReads = 0
    for (const authorization of [null, 'Basic abc', 'Bearer ']) {
      const result = await parseMobileApiRequest(
        toInput({ ...good, authorization, bodyText: 'x'.repeat(MOBILE_API_BODY_MAX_LENGTH + 1) }),
        parseBearerAuthorization,
      )
      assert.equal(result.status, 401)
    }
    assert.equal(bodyReads, 0)
  })

  it('readBody が上限超え(null)→ 413', async () => {
    const result = await parseMobileApiRequest({ ...toInput(good), readBody: async () => null }, parseBearerAuthorization)
    assert.deepEqual(result, { ok: false, status: 413, error: 'payload_too_large' })
  })

  it('query・本文のトークンは読まない(Authorization の header だけ)', async () => {
    const result = await parseMobileApiRequest(toInput({ ...good, authorization: null, bodyText: '{"token":"abc","access_token":"abc"}' }),
      parseBearerAuthorization,
    )
    assert.equal(result.ok, false)
    assert.equal(result.status, 401)
  })
})

describe('statusForTokenFailure と header', () => {
  it('確定した拒否は 401・一時の失敗は 503・知らない理由は 401', () => {
    for (const r of ['rejected', 'expired', 'session_invalid']) assert.equal(statusForTokenFailure(r), 401)
    for (const r of ['keys_unavailable', 'session_unavailable']) assert.equal(statusForTokenFailure(r), 503)
    assert.equal(statusForTokenFailure('something_new'), 401)
  })

  it('全ての status で Cache-Control: no-store があり、Set-Cookie と Access-Control-* が無い', () => {
    for (const status of [200, 400, 401, 404, 405, 413, 415, 500, 502, 503]) {
      const headers = mobileApiHeaders(status)
      assert.equal(headers['Cache-Control'], 'no-store', `status ${status}`)
      for (const name of Object.keys(headers)) {
        assert.ok(!/^set-cookie$/i.test(name), `status ${status}: ${name}`)
        assert.ok(!/^access-control-/i.test(name), `status ${status}: ${name}`)
      }
    }
  })

  it('401 には WWW-Authenticate: Bearer・それ以外には付けない', () => {
    assert.equal(mobileApiHeaders(401)['WWW-Authenticate'], 'Bearer')
    assert.equal(mobileApiHeaders(503)['WWW-Authenticate'], undefined)
    assert.equal(mobileApiHeaders(200)['WWW-Authenticate'], undefined)
  })
})

describe('runMobileApi(認証が通るまで先へ進まない)', () => {
  const harness = (verification, { handler } = {}) => {
    const calls = { verify: 0, create: 0, handler: 0, createdWith: null, handlerContext: null }
    const deps = {
      parseBearer: parseBearerAuthorization,
      verifyToken: async () => {
        calls.verify += 1
        if (verification instanceof Error) throw verification
        return verification
      },
      createClient: (token) => {
        calls.create += 1
        calls.createdWith = token
        return { client: token }
      },
      handler:
        handler ??
        (async (context) => {
          calls.handler += 1
          calls.handlerContext = context
          return { status: 200, body: { ok: true } }
        }),
    }
    return { calls, deps }
  }

  it('(i) verifyToken が失敗(5 つの理由)→ createClient と handler は 0 回・status は 401 か 503', async () => {
    const expected = {
      rejected: 401,
      expired: 401,
      session_invalid: 401,
      keys_unavailable: 503,
      session_unavailable: 503,
    }
    for (const [reason, status] of Object.entries(expected)) {
      const { calls, deps } = harness({ ok: false, reason })
      const out = await runMobileApi(toInput(good), deps)
      assert.equal(out.status, status, reason)
      assert.equal(out.body.ok, false)
      assert.equal(calls.verify, 1)
      assert.equal(calls.create, 0, `${reason}: createClient`)
      assert.equal(calls.handler, 0, `${reason}: handler`)
      assert.equal(out.headers['Cache-Control'], 'no-store')
    }
  })

  it('(i-2) verifyToken が投げた → 503・createClient と handler は 0 回', async () => {
    const { calls, deps } = harness(new Error('boom: secret detail'))
    const out = await runMobileApi(toInput(good), deps)
    assert.equal(out.status, 503)
    assert.equal(calls.create, 0)
    assert.equal(calls.handler, 0)
    assert.ok(!JSON.stringify(out.body).includes('boom'))
  })

  it('(ii) 405・415・401(header なし・形が違う)では verifyToken も readBody も 0 回', async () => {
    const bad = [{ method: 'GET' }, { contentType: 'text/plain' }, { authorization: null }, { authorization: 'Basic abc' }]
    const statuses = [405, 415, 401, 401]
    for (const [i, override] of bad.entries()) {
      bodyReads = 0
      const { calls, deps } = harness({ ok: true, user: { id: 'u' } })
      const out = await runMobileApi(toInput({ ...good, ...override }), deps)
      assert.equal(out.status, statuses[i])
      assert.equal(calls.verify, 0, `status ${statuses[i]}: verifyToken`)
      assert.equal(bodyReads, 0, `status ${statuses[i]}: readBody`)
      assert.equal(calls.create, 0)
      assert.equal(calls.handler, 0)
    }
  })

  it('(ii-2) ログインが通らない(形だけの Bearer・検証の失敗・検証が投げた)ときは本文を読まない(readBody 0 回)', async () => {
    for (const verification of [{ ok: false, reason: 'rejected' }, { ok: false, reason: 'keys_unavailable' }, new Error('boom')]) {
      bodyReads = 0
      const { calls, deps } = harness(verification)
      const out = await runMobileApi(toInput({ ...good, authorization: 'Bearer attacker' }), deps)
      assert.ok(out.status === 401 || out.status === 503)
      assert.equal(calls.verify, 1)
      assert.equal(bodyReads, 0, '検証が通る前に本文を読まない')
      assert.equal(calls.create, 0)
      assert.equal(calls.handler, 0)
    }
  })

  it('(ii-3) ログインが通った後の 413・400 では createClient と handler は 0 回', async () => {
    const bad = [{ bodyText: 'x'.repeat(MOBILE_API_BODY_MAX_LENGTH + 1) }, { bodyText: 'not json' }]
    const statuses = [413, 400]
    for (const [i, override] of bad.entries()) {
      const { calls, deps } = harness({ ok: true, user: { id: 'u' } })
      const out = await runMobileApi(toInput({ ...good, ...override }), deps)
      assert.equal(out.status, statuses[i])
      assert.equal(calls.verify, 1)
      assert.equal(calls.create, 0)
      assert.equal(calls.handler, 0)
    }
  })

  it('(iii) handler が投げたら 500・本文は { ok: false, error: "internal" } ちょうどで例外の文を含まない', async () => {
    const { deps } = harness(
      { ok: true, user: { id: 'u' } },
      {
        handler: async () => {
          throw new Error('SECRET stack detail')
        },
      },
    )
    const out = await runMobileApi(toInput(good), deps)
    assert.equal(out.status, 500)
    assert.deepEqual(out.body, { ok: false, error: 'internal' })
    assert.ok(!JSON.stringify(out).includes('SECRET'))
    assert.equal(out.headers['Cache-Control'], 'no-store')
  })

  it('(iv) 正: createClient に渡るのは header のトークン・handler は 1 回で user / client / body を受ける', async () => {
    const { calls, deps } = harness({ ok: true, user: { id: 'u-1' } })
    const out = await runMobileApi(toInput(good), deps)
    assert.equal(out.status, 200)
    assert.deepEqual(out.body, { ok: true })
    assert.equal(calls.verify, 1)
    assert.equal(calls.create, 1)
    assert.equal(calls.createdWith, 'tok.en-1_2')
    assert.equal(calls.handler, 1)
    assert.deepEqual(calls.handlerContext, {
      user: { id: 'u-1' },
      supabase: { client: 'tok.en-1_2' },
      body: { a: 1 },
    })
  })

  it('handler が返した status(400 など)はそのまま・header は no-store', async () => {
    const { deps } = harness(
      { ok: true, user: { id: 'u' } },
      { handler: async () => ({ status: 400, body: { ok: false, error: 'invalid_input' } }) },
    )
    const out = await runMobileApi(toInput(good), deps)
    assert.equal(out.status, 400)
    assert.equal(out.headers['Cache-Control'], 'no-store')
  })
})

describe('readBoundedText(上限を数えながら読む)', () => {
  function streamOf(chunks) {
    let cancelled = false
    const stream = new ReadableStream({
      pull(controller) {
        const next = chunks.shift()
        if (next === undefined) controller.close()
        else controller.enqueue(new TextEncoder().encode(next))
      },
      cancel() {
        cancelled = true
      },
    })
    return { stream, wasCancelled: () => cancelled }
  }

  it('上限以内は全部を文字列で返す(複数の chunk・日本語)', async () => {
    const { stream } = streamOf(['{"a":"保', '存"}'])
    assert.equal(await readBoundedText(stream, 64), '{"a":"保存"}')
  })

  it('上限を超えたら null を返し、残りを読まずに stream を cancel する', async () => {
    const chunks = ['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(10), 'never-read']
    const { stream, wasCancelled } = streamOf(chunks)
    assert.equal(await readBoundedText(stream, 15), null)
    assert.equal(wasCancelled(), true)
    assert.ok(chunks.includes('never-read'), '上限を超えた後の chunk は読まない')
  })

  it('本文が無い(null)→ 空文字', async () => {
    assert.equal(await readBoundedText(null, 10), '')
  })

  it('上限は UTF-8 の最悪(1 文字 4 byte)× 文字数の上限', () => {
    assert.equal(MOBILE_API_BODY_MAX_BYTES, MOBILE_API_BODY_MAX_LENGTH * 4)
  })
})
