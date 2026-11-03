/**
 * OGP 取得の接続先 IP 判定(spec §11.1-7)。private・loopback・link-local・reserved を遮断する。
 *
 * 判定は「URL 文字列の見た目」ではなく **実際に接続する IP** に対して行う —— 公開 DNS 名が
 * 127.0.0.1 に解決される DNS rebinding は、ホスト名の照合では原理的に止められないため。呼ぶのは
 * fetch-og-title.ts の custom lookup(http / https 両 agent)で、解決されたアドレスをここに通す。
 *
 * このモジュールは意図的に **純関数だけ・'server-only' 無し・node builtin の import 無し** に
 * してある(検証が Node から直接 import して全レンジの表を回せるようにするため)。
 *
 * 分類できない入力は **遮断側に倒す**(fail-closed)。
 */

/** ドット表記の 4 オクテットを 32bit 整数へ。 */
const ipv4 = (a: number, b: number, c: number, d: number): number =>
  ((a << 24) | (b << 16) | (c << 8) | d) >>> 0

const BLOCKED_IPV4_RANGES: ReadonlyArray<{ network: number; prefix: number }> = [
  { network: ipv4(0, 0, 0, 0), prefix: 8 }, // "this network"
  { network: ipv4(10, 0, 0, 0), prefix: 8 }, // private
  { network: ipv4(100, 64, 0, 0), prefix: 10 }, // CGNAT
  { network: ipv4(127, 0, 0, 0), prefix: 8 }, // loopback
  { network: ipv4(169, 254, 0, 0), prefix: 16 }, // link-local(クラウドのメタデータ 169.254.169.254 を含む)
  { network: ipv4(172, 16, 0, 0), prefix: 12 }, // private
  { network: ipv4(192, 0, 0, 0), prefix: 24 }, // IETF protocol assignments
  { network: ipv4(192, 0, 2, 0), prefix: 24 }, // TEST-NET-1
  { network: ipv4(192, 88, 99, 0), prefix: 24 }, // 6to4 relay anycast(廃止済み)
  { network: ipv4(192, 168, 0, 0), prefix: 16 }, // private
  { network: ipv4(198, 18, 0, 0), prefix: 15 }, // benchmarking
  { network: ipv4(198, 51, 100, 0), prefix: 24 }, // TEST-NET-2
  { network: ipv4(203, 0, 113, 0), prefix: 24 }, // TEST-NET-3
  { network: ipv4(224, 0, 0, 0), prefix: 4 }, // multicast
  { network: ipv4(240, 0, 0, 0), prefix: 4 }, // reserved(255.255.255.255 のブロードキャストを含む)
]

const IPV6_GROUPS = 8

/**
 * ドット表記の IPv4 を 32bit 整数へ。10 進 4 オクテットの正規形だけを受ける ——
 * 先頭 0 埋め(`010.0.0.1`)は実装によって 8 進と解釈され、判定と接続先がズレるため拒否する。
 */
function parseIpv4(value: string): number | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  let result = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    if (part.length > 1 && part.startsWith('0')) return null
    const octet = Number(part)
    if (octet > 255) return null
    result = result * 256 + octet
  }
  return result
}

/** IPv6 を 8 グループの数値配列へ。`::` の省略と末尾の IPv4 記法(`::ffff:127.0.0.1`)を解く。 */
function parseIpv6(value: string): number[] | null {
  // zone id(`fe80::1%en0`)は判定に使わない。
  const zoneIndex = value.indexOf('%')
  let text = zoneIndex === -1 ? value : value.slice(0, zoneIndex)
  if (!text.includes(':')) return null

  // 末尾が IPv4 記法なら、等価な 2 グループの 16 進へ置き換えてから通常の経路で解く。
  const lastColon = text.lastIndexOf(':')
  const lastPart = text.slice(lastColon + 1)
  if (lastPart.includes('.')) {
    const embedded = parseIpv4(lastPart)
    if (embedded === null) return null
    const high = Math.floor(embedded / 0x10000)
    const low = embedded % 0x10000
    text = `${text.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`
  }

  const doubleColon = text.indexOf('::')
  let headText = text
  let tailText = ''
  if (doubleColon !== -1) {
    if (text.indexOf('::', doubleColon + 1) !== -1) return null
    headText = text.slice(0, doubleColon)
    tailText = text.slice(doubleColon + 2)
  }

  const head = headText === '' ? [] : headText.split(':')
  const tail = tailText === '' ? [] : tailText.split(':')

  const parseGroup = (group: string): number | null =>
    /^[0-9a-fA-F]{1,4}$/.test(group) ? Number.parseInt(group, 16) : null

  const groups: number[] = []
  for (const group of head) {
    const parsed = parseGroup(group)
    if (parsed === null) return null
    groups.push(parsed)
  }

  const tailGroups: number[] = []
  for (const group of tail) {
    const parsed = parseGroup(group)
    if (parsed === null) return null
    tailGroups.push(parsed)
  }

  if (doubleColon === -1) {
    return groups.length === IPV6_GROUPS ? groups : null
  }
  const omitted = IPV6_GROUPS - groups.length - tailGroups.length
  // `::` は 1 グループ以上の省略でなければならない。
  if (omitted < 1) return null
  return [...groups, ...Array<number>(omitted).fill(0), ...tailGroups]
}

function isBlockedIpv4(address: number): boolean {
  return BLOCKED_IPV4_RANGES.some(({ network, prefix }) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    return ((address & mask) >>> 0) === network
  })
}

function isBlockedIpv6(groups: number[]): boolean {
  const [g0, g1] = groups
  if (g0 === undefined || g1 === undefined) return true

  const leading = groups.slice(0, 6)
  const embedded = (groups[6] ?? 0) * 0x10000 + (groups[7] ?? 0)
  // IPv4-mapped(::ffff:a.b.c.d)と IPv4-compatible(::a.b.c.d)は IPv4 として判定する。
  // 見落とすと `::ffff:127.0.0.1` で loopback が素通りする。
  const isMapped =
    leading.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  const isCompatible = leading.every((group) => group === 0) && embedded !== 0
  if (isMapped || isCompatible) {
    return isBlockedIpv4(embedded)
  }

  // 6to4(2002:V4ADDR::/48)と NAT64(64:ff9b::/96)は IPv6 の中に IPv4 を運ぶ。埋め込みを取り出して
  // 同じ IPv4 表で判定しないと、2002:7f00:1:: / 64:ff9b::7f00:1 で loopback へ到達できてしまう。
  if (g0 === 0x2002) {
    return isBlockedIpv4((g1 * 0x10000 + (groups[2] ?? 0)) >>> 0)
  }
  if (g0 === 0x0064 && g1 === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return isBlockedIpv4(embedded)
  }

  if (groups.every((group) => group === 0)) return true // :: 未指定
  if (leading.every((group) => group === 0) && embedded === 1) return true // ::1 loopback
  if ((g0 & 0xfe00) === 0xfc00) return true // fc00::/7 ULA
  if ((g0 & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true // 2001:db8::/32 documentation
  return false
}

/**
 * 接続してはいけないアドレスなら true。解釈できない文字列も true(fail-closed)。
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIpv4(ip)
  if (v4 !== null) return isBlockedIpv4(v4)

  const v6 = parseIpv6(ip)
  if (v6 !== null) return isBlockedIpv6(v6)

  return true
}
