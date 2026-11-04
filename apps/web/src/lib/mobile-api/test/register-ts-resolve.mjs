// 検査だけ。`node --import ./src/lib/mobile-api/test/register-ts-resolve.mjs --test …` で読む(apps/mobile/src/auth/test/ の同名の file と同じ中身)。
// shared の barrel(`validations/index.ts` など)は拡張子なしの相対 import を使う(bundler 向け)。
// node の型除去は拡張子を補わないので、相対 import が解決できないとき `.ts` / `/index.ts` に解決し直す。
import { registerHooks } from 'node:module'

// 拡張子なし(ERR_MODULE_NOT_FOUND)とディレクトリ import(ERR_UNSUPPORTED_DIR_IMPORT)の両方が barrel で出る。
const RESOLVABLE_ERRORS = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'])

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../')
      if (!relative || !RESOLVABLE_ERRORS.has(error?.code)) throw error
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context)
        } catch {
          // 次の候補へ
        }
      }
      throw error
    }
  },
})
