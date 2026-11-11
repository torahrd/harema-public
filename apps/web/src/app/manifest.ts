import type { MetadataRoute } from 'next'
import { SHARE_TARGET_ACTION, SHARE_TARGET_PARAMS } from '../lib/share-target'
import { THEME_COLOR } from './theme-color'

// アイコンは apps/mobile の Android アダプティブ アイコン(前景 + 背景の重ね)を 192 / 512 に縮めた
// 同じ 2 枚(public/pwa-*.png)を any と maskable の別の項目で使う(所有者の 2026-11-03 の決定・PR #69)。
// background_color は apps/mobile/app.json の起動画面の地 #11131A の写し。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'hareMa',
    short_name: 'hareMa',
    id: '/',
    start_url: '/map',
    scope: '/',
    // 今の iPhone の振る舞い(minimal-ui)を保ち、display_override を読む Chrome だけ standalone にする。
    display: 'minimal-ui',
    display_override: ['standalone'],
    background_color: '#11131A',
    theme_color: THEME_COLOR.light,
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    share_target: {
      action: SHARE_TARGET_ACTION,
      method: 'GET',
      enctype: 'application/x-www-form-urlencoded',
      params: { ...SHARE_TARGET_PARAMS },
    },
  }
}
