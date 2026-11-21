/**
 * 404 / 500 面の、言語によらない eyebrow(`<文脈> · <状態>`)。見出し・本文・ボタンの文言は辞書
 * (`@harema/shared/i18n` の `web.error`・`web.common.retry`)が正で、`error.tsx` と `global-error.tsx` が
 * 同じ辞書から読む(片方だけ直されて「同じ失敗の 2 つの言い方」が並ばないようにする。Tora 裁定 2026-08-06)。
 * `global-error.tsx` は eyebrow を持たない。
 */
export const NOT_FOUND_EYEBROW = 'NOT FOUND · 404'
export const ERROR_EYEBROW = 'ERROR · 500'
