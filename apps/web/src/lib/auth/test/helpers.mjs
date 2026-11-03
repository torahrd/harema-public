// 検査の道具(core.ts の検査だけが使う)。tools/auth-fixture には依存しない。
// 署名つきのトークンと自己署名の X.509 は node:crypto だけで作る(web の検証と同じ実装を共有しないため)。
import { createPublicKey, generateKeyPairSync, createSign, createHmac, randomBytes, sign as cryptoSign } from 'node:crypto'

export const PROJECT = 'demo-login-replace'
export const NOW = 1_800_000_000 // 検査の「今」(秒)

const DAY_MS = 86_400_000
function derLength(n) {
  if (n < 0x80) return Buffer.from([n])
  const bytes = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}
const tlv = (tag, ...bodies) => {
  const body = Buffer.concat(bodies)
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body])
}
const seq = (...b) => tlv(0x30, ...b)
const set = (...b) => tlv(0x31, ...b)
const SIG_ALG = seq(Buffer.from('06092a864886f70d01010b', 'hex'), Buffer.from([0x05, 0x00]))
const CN = Buffer.from('0603550403', 'hex')
function utcTime(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  return tlv(0x17, Buffer.from(s, 'ascii'))
}

export function certPem(privateKey) {
  const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
  const serial = randomBytes(16)
  serial[0] = (serial[0] & 0x7f) || 1
  const name = seq(set(seq(CN, tlv(0x0c, Buffer.from('test', 'utf8')))))
  const now = Date.now()
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, serial),
    SIG_ALG,
    name,
    seq(utcTime(now - DAY_MS), utcTime(now + 3650 * DAY_MS)),
    name,
    spki,
  )
  const signature = cryptoSign('sha256', tbs, privateKey)
  const cert = seq(tbs, SIG_ALG, tlv(0x03, Buffer.concat([Buffer.from([0x00]), signature])))
  const b64 = cert.toString('base64').replace(/(.{64})/g, '$1\n').trimEnd()
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`
}

export function newRsaKey() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
}

const b64u = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

export function baseClaims(overrides = {}) {
  return {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'lr-a-uid-0001',
    auth_time: NOW - 60,
    iat: NOW - 60,
    exp: NOW + 3600 - 60,
    role: 'authenticated',
    ...overrides,
  }
}

/** claims の値が undefined のキーは消す(欠落の負例)。 */
export function signToken({ alg = 'RS256', kid = 'k1', key, secret, claims = baseClaims() }) {
  const payload = Object.fromEntries(Object.entries(claims).filter(([, v]) => v !== undefined))
  const header = alg === 'none' ? { alg, typ: 'JWT' } : { alg, typ: 'JWT', kid }
  const input = `${b64u(header)}.${b64u(payload)}`
  if (alg === 'none') return `${input}.`
  if (alg === 'HS256') return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`
  return `${input}.${createSign('sha256').update(input).sign(key).toString('base64url')}`
}
