'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { USERNAME_MAX_LENGTH } from '@harema/shared/constants'
import {
  codePointLength,
  hasForbiddenUsernameCharacter,
  usernameSchema,
} from '@harema/shared/validations'
import { abortOnboarding, completeOnboarding } from './actions'
import { ActionError } from '../_auth-ui/action-error'

/**
 * M1(ユーザー名の入力・登録・中止)の 1 段。同意はログイン画面の 2 つのチェック(harema#7 2026-11-02)。
 * ロジック(completeOnboarding / abortOnboarding / page ガード / RPC / username スキーマ)は据え置き、
 * ここは UI と配線のみ。見た目はログインと同じ全画面の Quiet Signal(globals.css 7. の `.qs`)。
 * 朱(vermilion)は印だけに使い、字には使わない(失敗は × の印 + 墨の字の ActionError)。
 */

// design の M1 error 文言(逐語)。不可視・制御・方向制御文字を検出したときだけ出す。
// 文ごとに 1 ブロック。WebKit は文の途中("含まれています。除い / て、")で折るので、折り位置を
// 版面に委ねずここで決める。列が狭い(320px)ときだけ、第1文が内部でもう一度折れる。
const INVISIBLE_CHAR_ERROR = [
  '見えない文字（制御文字）が含まれています。',
  '除いて、もう一度お試しください。',
] as const
// 登録の失敗パス。主ボタンの下に × の印と 1 文で示す。
const ACTION_ERROR = 'うまくいきませんでした。もう一度お試しください。'
// 中止の失敗(login-replace の FREEZE: compare-v3 の ⑤)。中止のボタンの下に 2 文を出す。
const ABORT_ERROR = ['中止できませんでした。', '少し待って、もう一度お試しください。'] as const
// 登録の中止(プライバシーポリシー第 3 条 4 項)の文言と注記。所有者の決定(harema#7・2026-11-02・案 A):
// 同意はログイン画面で済むので「同意せずに」を外し、規約とポリシーの「登録の中止」と同じ語にした。注記は今のまま。
const ABORT_LABEL = '登録を中止する'
const ABORT_NOTE = '中止すると登録は行われません。'

/**
 * 先頭の空白を落とす。補足文言「前後の空白は除かれます」の前半を入力時点で実行する扱いで、空白だけを
 * 打った入力は未入力と同じ `0/15` に落ちる。末尾は従来どおり「登録する」押下時の `usernameSchema`
 * の trim が担当し、内部空白は §8 の寛容ルールどおり残す。
 */
function stripLeadingSpaces(value: string): string {
  // 文字クラスに入れてあるのは半角 U+0020 と全角 U+3000 の 2 文字(見た目では区別できないので明記する)。
  return value.replace(/^[ 　]+/, '')
}

export function OnboardingForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [aborting, setAborting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [abortFailed, setAbortFailed] = useState(false)

  // IME の変換中は先頭空白の除去を止めるためのフラグ(再描画を起こす必要がないので ref)。
  const isComposingRef = useRef(false)

  const busy = submitting || aborting
  // カウンタは生のコードポイント数(不可視文字も数える → 表示との「ずれ」が検出の手がかり・design COUNT)。
  const count = codePointLength(username)
  const hasForbidden = hasForbiddenUsernameCharacter(username.trim())
  // client / server 同一の usernameSchema(§8)で通過可否を判定する(trim + 1〜15 + 不可視文字拒否)。
  const canProceed = usernameSchema.safeParse(username).success

  const applyUsername = (value: string) => {
    // 15 コードポイントで停止(design MAX)。絵文字・サロゲートペアを壊さないよう配列で数える。
    // 先頭空白を落とすかどうかは呼び出し側の判断(onChangeUsername は IME 変換中だけ生値のまま
    // 通し、handleCompositionEnd が確定値に対して落とす)。ここは受け取った値をそのまま切り詰める
    // だけで、除去済みの値なら落とした分だけ本文を入れられる。
    const next = [...value].slice(0, USERNAME_MAX_LENGTH).join('')
    setUsername(next)
    if (actionError) setActionError(null)
  }

  const onChangeUsername = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    // 変換中は生値のまま通す。先頭にスペースを打ってから変換を始める入力を壊さないため。
    applyUsername(isComposingRef.current ? raw : stripLeadingSpaces(raw))
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  // compositionend と change の発火順はブラウザ差があるので、確定値にも必ず 1 回正規化を通す。
  const handleCompositionEnd = (event: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false
    applyUsername(stripLeadingSpaces(event.currentTarget.value))
  }

  // Server Action の呼び出しはネットワーク断で reject する。捕まえないと submitting が true の
  // まま残り「登録する」が押せなくなる(復帰にリロードが要る)。到達不能も失敗の一種
  // として ACTION_ERROR に畳み、finally で submitting を必ず戻す(login-form の onSubmit と同型)。
  const onRegister = async () => {
    if (!canProceed || busy) return
    setSubmitting(true)
    setActionError(null)
    setAbortFailed(false)
    try {
      const result = await completeOnboarding({ username })
      if (result.ok) {
        router.replace('/map')
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      setActionError(ACTION_ERROR)
    } catch {
      setActionError(ACTION_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const onAbort = async () => {
    if (busy) return
    setAborting(true)
    setActionError(null)
    setAbortFailed(false)
    try {
      const result = await abortOnboarding()
      if (result.ok) {
        router.replace('/')
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      if (result.reason === 'onboarded') {
        // 登録が済んでいた(別のタブで先に完了していた)。何も消されていないので /map へ
        router.replace('/map')
        return
      }
      setAbortFailed(true)
    } catch {
      setAbortFailed(true)
    } finally {
      setAborting(false)
    }
  }

  // 数の色: 上限に達したら墨(ink)、それ以外は小さい札の色。朱は字に使わない(Quiet Signal)ので、
  // 見えない文字のときは枠を朱にし、字の色は墨にする。
  const counterColor = hasForbidden || count >= USERNAME_MAX_LENGTH ? 'var(--qs-fg)' : 'var(--qs-fg3)'

  // 全画面の Quiet Signal(所有者の決定 2026-11-02 案 A: ログインと同じ列・最大 480px・左右 24px)。
  // 2026-07 の「ぼかした地図の上のカード」はこれで覆した(design-signup/DESIGN.md)。
  return (
    <main className="qs qs-page">
      <div className="qs-lg">
        <p className="qs-lab">WELCOME · USERNAME</p>
        <h1 className="qs-h1">ユーザー名の入力</h1>
        <p className="qs-lede">
          <span className="qs-ln">あなたにだけ見える名前です。</span>
          <span className="qs-ln">あとから、いつでも変えられます。</span>
        </p>

        <div className="qs-fg">
          <label htmlFor="username" className="qs-lab">
            USERNAME
          </label>
          <div className="qs-field" data-invalid={hasForbidden || undefined}>
            <input
              id="username"
              value={username}
              onChange={onChangeUsername}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onKeyDown={(event) => {
                // Safari は変換を確定する Enter を compositionend の後に keyCode 229 で送る(WebKit Bug 165004)。
                // その Enter で登録しないよう、変換中の 3 つの印を全部見る。
                if (
                  event.key === 'Enter' &&
                  !isComposingRef.current &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault()
                  void onRegister()
                }
              }}
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="例: そら"
              aria-invalid={hasForbidden || undefined}
            />
            <span className="qs-count" style={{ color: counterColor }}>
              {count}/{USERNAME_MAX_LENGTH}
            </span>
          </div>
          {hasForbidden && <ActionError lines={INVISIBLE_CHAR_ERROR} className="qs-fg-err" />}
        </div>

        <p className="qs-help">1〜15字。日本語・英数・記号・絵文字が使えます。前後の空白は除かれます。</p>

        <button
          type="button"
          className="qs-btn qs-btn-p qs-go"
          onClick={onRegister}
          disabled={!canProceed || busy}
          aria-busy={submitting}
        >
          登録する
          {submitting && <span className="spinner" aria-hidden="true" />}
        </button>

        {actionError && <ActionError lines={[actionError]} className="qs-go-err" />}

        {/* 登録の中止 = 文字は ink・下線だけ vermilion(FREEZE ⑤)。 */}
        <div className="qs-abort">
          <button
            type="button"
            className="qs-tb"
            onClick={onAbort}
            disabled={busy}
            aria-busy={aborting}
          >
            {ABORT_LABEL}
            {aborting && <span className="spinner" aria-hidden="true" />}
          </button>
          {abortFailed && <ActionError lines={ABORT_ERROR} />}
          <p className="qs-abort-note">{ABORT_NOTE}</p>
        </div>
      </div>
    </main>
  )
}
