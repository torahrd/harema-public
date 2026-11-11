// manifest.ts(Web Share Target・インストールの条件・アイコン)。実行: `pnpm --filter web test`
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import manifest from '../../app/manifest.ts'
import { THEME_COLOR } from '../../app/theme-color.ts'
import { SHARE_TARGET_ACTION, SHARE_TARGET_PARAMS } from '../share-target.ts'

const m = manifest()
const pngSize = (name) => {
  const buf = readFileSync(new URL(`../../../public/${name}`, import.meta.url))
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('manifest', () => {
  it('WST-M1 インストールの条件', () => {
    assert.equal(m.name, 'hareMa')
    assert.equal(m.short_name, 'hareMa')
    assert.equal(m.start_url, '/map')
    assert.equal(m.scope, '/')
    assert.equal(m.id, '/')
    assert.equal(m.display, 'minimal-ui')
    assert.deepEqual(m.display_override, ['standalone'])
    assert.equal(m.background_color, '#11131A')
    assert.equal(m.theme_color, THEME_COLOR.light)
    assert.equal('prefer_related_applications' in m, false)
  })

  it('WST-M2 アイコン', () => {
    assert.equal(m.icons?.length, 4)
    for (const purpose of ['any', 'maskable']) {
      for (const [size, src] of [['192x192', '/pwa-192.png'], ['512x512', '/pwa-512.png']]) {
        const hit = m.icons.filter((i) => i.purpose === purpose && i.sizes === size)
        assert.equal(hit.length, 1, `${purpose} ${size}`)
        assert.equal(hit[0].type, 'image/png')
        assert.equal(hit[0].src, src)
      }
    }
    assert.deepEqual(pngSize('pwa-192.png'), { width: 192, height: 192 })
    assert.deepEqual(pngSize('pwa-512.png'), { width: 512, height: 512 })
  })

  it('WST-M3 共有の受け口', () => {
    assert.deepEqual(m.share_target, {
      action: '/share',
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      params: { title: 'title', text: 'text', url: 'url' },
    })
    assert.equal(m.share_target.action, SHARE_TARGET_ACTION)
    assert.deepEqual(m.share_target.params, SHARE_TARGET_PARAMS)
  })
})
