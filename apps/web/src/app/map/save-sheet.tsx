'use client'

import { unstable_rethrow, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MEMO_MAX_LENGTH,
  SAVED_PLACE_STATUSES,
  SOURCE_TEXT_MAX_LENGTH,
  type SavedPlaceStatus,
} from '@harema/shared/constants'
import {
  savePlaceInputSchema,
  sourceUrlSchema,
  type SavePlaceInput,
} from '@harema/shared/validations'
import { EXTERNAL_ARROW } from '@/app/places/[id]/place-detail-copy'
import { sourceChipUrl, sourceLinkLabel } from '@/lib/external-link'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import {
  deleteSavedPlace,
  deleteSavedPlaceFromDetail,
  fetchSourceTitle,
  resolveSavedPlace,
  savePlace,
} from './save-actions'
import {
  CTA_LABELS,
  DELETE_LABEL,
  MEMO_LABEL,
  MEMO_PLACEHOLDER,
  SAVE_FAILED,
  SOURCE_HELPER,
  SOURCE_LABEL,
  SOURCE_PLACEHOLDER,
  SOURCE_TITLE_UNREADABLE,
  STATUS_LABEL,
  STATUS_LABELS,
  STATUS_REVERT_NOTE,
} from './save-sheet-copy'
import { PlaceDetailsDisclosure } from './place-details-disclosure'
import { initialSheetFields } from './sheet-initial'
import type { MapLaunchContext } from './types'
import { useSheetViewport } from './use-sheet-viewport'
import { LABEL_EN, LABEL_JA, META, heading } from '../text-styles'

/**
 * S1 保存/編集ボトムシート(design C-1 = 新規 / C-2 = 編集を 1 コンポーネントで)。起動元に
 * 依存しない props で受けるので、WP-09 の一覧・WP-10 の詳細からも同じ形で差せる。
 *
 * 造形は design C-1 / C-2 の ±0 移植に、返却された S1 の高さ・スクロール・キーボードの規則を
 * 重ねたもの。骨格は 3 層 —— 上固定(グラブ + 店名 + 住所)/ 流れる領域(状態以下)/ 下固定
 * (主 CTA)。高さは内容なりで、上限 85svh に達したときだけ中身がスクロールする(全画面化しない
 * ので、外側をタップして閉じる余地が常に残る)。
 *
 * 「削除する」は WP-10(C-3 の確認ダイアログとセット)で、この下固定へ足す。押せないボタンを
 * 先に置かない(S-4 裁定)。
 */

/** 退場の尺。globals.css の `--dur-slow: 240ms` と一致させる(退場後に親へ返す)。 */
const EXIT_MS = 240

/**
 * キーボードが下がりきるのを待つ上限。visualViewport の resize が来ればそこで進むので、
 * これは資源が来なかったときの保険(待ち続けてシートが閉じないことを防ぐ)。
 */
const KEYBOARD_SETTLE_MS = 320

/** 未評価の初期状態。ここへ戻す遷移だけが不可(spec §6.2・§8)。権威はサーバ側にある。 */
const UNRATED_STATUS: SavedPlaceStatus = 'want_to_go'

/** 流れる領域の下限。これを割るときは上固定を削り、下固定(主 CTA)を最後まで残す。 */
const FLOW_MIN_HEIGHT = 96

/** 金のフォーカスリング。--accent は light / dark で同値なので mode 追従の必要が無い。 */
const FOCUS_RING = '0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent)'

/** 見出しラベル(design C-1 39 / 45 / 47 行)。tracking は design 逐語の .16em。 */
const CAPS_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  ...LABEL_JA,
}

/** ヘルパ行 / 注記 / 失敗行の共通造形(design C-1 49 行 / C-2 101 行)。 */
const NOTE_STYLE: React.CSSProperties = {
  margin: '7px 0 0',
  ...META,
  color: 'var(--fg-2)',
}

type SaveSheetProps = {
  context: MapLaunchContext
  /** 共有から来た出典。新規のときだけ出典の欄に入れる(編集では DB の値を上書きしない)。 */
  initialSourceText?: string | null
  /** 保存せずに閉じた。 */
  onClose: () => void
  /** 保存 / 更新 / 削除が通った。退場アニメの後に呼ばれる。遷移先は呼び出し元の担当
   * (WP-10 S9。`deleted` は map-screen.tsx / place-detail-screen.tsx がそれぞれ持つ)。
   * `deleteRedirectsToSaved` が true のときは削除成功時にサーバ側 redirect が先に発火するため、
   * この呼び出しの `'deleted'` 分岐には実務上到達しない(AD-N1 是正)。 */
  onSaved: (mode: 'created' | 'updated' | 'deleted') => void
  /** true のとき、削除確定は `deleteSavedPlaceFromDetail`(サーバ側 `redirect('/saved')`)を
   * 呼ぶ。省略時(地図からの起動)は従来どおり `deleteSavedPlace` を呼び、`onSaved('deleted')`
   * 経由で呼び出し元が遷移を決める(AD-N1 是正・WP-10-irregular-ad-n1-2026-08-26 §3.2)。 */
  deleteRedirectsToSaved?: boolean
  /** Places ライブラリ。**省略 = 「詳細情報」の行を出さない。** 地図の画面から開いた S1 だけが渡す(店舗詳細から
   * 開く編集は渡さない)。行を押した時だけ営業時間・電話・website を取る(所有者の決定 2026-11-08・harema#121)。 */
  placesLibrary?: google.maps.PlacesLibrary | null
}

export function SaveSheet({
  context,
  initialSourceText,
  onClose,
  onSaved,
  deleteRedirectsToSaved,
  placesLibrary,
}: SaveSheetProps) {
  const router = useRouter()

  const [entered, setEntered] = useState(false)
  const [closePending, setClosePending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /** 退場後に親へ返すもの。'close' 以外は保存または削除が通っている。 */
  const outcomeRef = useRef<'close' | 'created' | 'updated' | 'deleted'>('close')
  /** キーボードの沈降を待つ上限の締切(閉じ始めた時刻 + KEYBOARD_SETTLE_MS)。 */
  const settleDeadlineRef = useRef(0)

  const [resolving, setResolving] = useState(true)
  /** DB にある現在の状態。null = まだ保存されていない(= 新規)。遷移制約の判定に使う。 */
  const [existingStatus, setExistingStatus] = useState<SavedPlaceStatus | null>(
    null,
  )
  const [status, setStatus] = useState<SavedPlaceStatus>(UNRATED_STATUS)
  const [memo, setMemo] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [titleUnreadable, setTitleUnreadable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** D5(削除確認)が開いているか。 */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  /** 削除のサーバ往復中。D5 のボタンとスクリムを塞ぎ、二重送信を防ぐ。 */
  const [deleting, setDeleting] = useState(false)

  const [memoFocused, setMemoFocused] = useState(false)
  const [sourceFocused, setSourceFocused] = useState(false)
  const [scrollable, setScrollable] = useState(false)

  /** 取得済みタイトルがどの URL のものか。同一 URL を取りに行かない(S-16)。 */
  const lastFetchedUrlRef = useRef<string | null>(null)
  /** 外向きの取得は同時 1 本(S-16)。再描画に関わらないので ref。 */
  const fetchingTitleRef = useRef(false)
  /** paste は change の直前に来る。値が入った後で取得を発火するための橋渡し。 */
  const pastedRef = useRef(false)
  /** 解決の結果を受ける effect から、後ろで定義する maybeFetchTitle を呼ぶための橋渡し。 */
  const maybeFetchTitleRef = useRef<(raw: string) => Promise<void>>(async () => {})
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const focusedFieldRef = useRef<HTMLElement | null>(null)

  const mode = existingStatus === null ? 'create' : 'edit'
  const busy = resolving || saving || deleting
  const chipUrl = sourceChipUrl(sourceText)
  const linkLabel = chipUrl === null ? '' : sourceLinkLabel(chipUrl)
  const visible = entered && !leaving
  const revertBlocked =
    existingStatus !== null && existingStatus !== UNRATED_STATUS

  const fieldFocused = memoFocused || sourceFocused
  // 閉じている間も基準を凍結する。沈降の途中で取り直すと、キーボードがまだ出ているのに
  // keyboardInset が 0 になり、「下がりきってから続く」という待ちが最初の resize で消える。
  const { maxHeight, keyboardInset } = useSheetViewport(
    fieldFocused || closePending,
  )
  const keyboardOpen = keyboardInset > 0

  // サーバへ送る全量。lat/lng・行 id・新規/編集の別は構造的に持たない(spec §11.1-8)。
  const input: SavePlaceInput = {
    googlePlaceId: context.googlePlaceId,
    status,
    memo,
    sourceText,
    sourceTitle,
  }
  // 通過可否は client / server 同一の savePlaceInputSchema で判定する(spec §8)。サーバは
  // これを信用せず必ず再検証する —— こちらは押せるかどうかの表示にだけ効く。
  const canSave = savePlaceInputSchema.safeParse(input).success

  // 入場は退場の鏡像(同じ 240ms / 同じイージング)。マウント直後の 1 フレームで倒す。
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  /**
   * 新規か編集かは**サーバに問う**。地図が持つ savedPlaces は no_thanks を除外しているので、
   * クライアント側では「もういい」で保存済みの店を新規と誤判定する。シートは待たずに開き、解決するまで CTA にスピナーを出して入力を止める。
   */
  useEffect(() => {
    let cancelled = false
    resolveSavedPlace(context.googlePlaceId)
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          if (result.reason === 'unauthenticated') {
            router.replace('/login')
            return
          }
          // 解決できなくても保存はできる(サーバが既存行の有無で判定し直し、競合は 23505 で
          // 失敗になる)。黙って新規として開かず、失敗したことは 1 行で示す。
          setSaveError(SAVE_FAILED)
          return
        }
        const initial = initialSheetFields(result, initialSourceText, UNRATED_STATUS)
        if (result.mode === 'edit') {
          setExistingStatus(initial.existingStatus)
          setStatus(initial.status)
          setMemo(initial.memo)
          setSourceText(initial.sourceText)
          setSourceTitle(initial.sourceTitle)
          // 保存済みのタイトルは、保存済みの出典のためのもの。blur で取り直さない。
          lastFetchedUrlRef.current = result.sourceText.trim() || null
        } else if (initial.fetchTitleFor !== null) {
          // 共有の出典を入れ、貼ったときと同じくタイトルを 1 回取りに行く(同じ URL は取りに行かない規則のまま)。
          setSourceText(initial.sourceText)
          void maybeFetchTitleRef.current(initial.fetchTitleFor)
        }
      })
      .catch(() => {
        if (!cancelled) setSaveError(SAVE_FAILED)
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [context.googlePlaceId, initialSourceText, router])

  // 区切り(下固定の上辺 1px・下端のフェード)はスクロールできるときだけ引く。中身は chip の
  // 出入りや編集で伸び縮みするので、領域と中身の両方を観測する。
  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    const update = () =>
      setScrollable(scroller.scrollHeight > scroller.clientHeight + 1)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  // 打っている欄と主ボタンが同時に見えるように、フォーカス中の欄を流れる領域の上へ寄せる。
  // キーボードで領域が縮んだ後にもう一度寄せ直す(出るのはフォーカスより後)。
  useEffect(() => {
    const field = focusedFieldRef.current
    if (!fieldFocused || !field) return
    field.scrollIntoView({ block: 'start' })
  }, [fieldFocused, keyboardInset])

  const beginClose = useCallback(() => {
    // キーボードが出ていたら先に下げる。シートはそれに続く(同時に飛ばさない)。
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    settleDeadlineRef.current = Date.now() + KEYBOARD_SETTLE_MS
    setClosePending(true)
  }, [])

  // キーボードが下がりきってからシートを送る。visualViewport の resize でここが引き直され、
  // 0 になった時点で退場に移る。沈降の途中は resize が何度も来るので、待ちの上限は閉じ始めた
  // 時刻から測る(イベントごとに測り直すと、上限が際限なく先送りされる)。
  useEffect(() => {
    if (!closePending || leaving) return
    const wait =
      keyboardInset === 0
        ? 0
        : Math.max(0, settleDeadlineRef.current - Date.now())
    const id = window.setTimeout(() => setLeaving(true), wait)
    return () => window.clearTimeout(id)
  }, [closePending, leaving, keyboardInset])

  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => {
      const outcome = outcomeRef.current
      if (outcome === 'close') onClose()
      else onSaved(outcome)
    }, EXIT_MS)
    return () => window.clearTimeout(id)
  }, [leaving, onClose, onSaved])

  // 外側タップで閉じ、未保存の入力は確認なしで破棄する(裁定)。送信中だけは結果を取りこぼす
  // ので受け付けない(新規/編集の解決待ちは読み取りだけなので、待たせずに閉じられる)。
  const requestClose = useCallback(() => {
    if (saving || closePending) return
    beginClose()
  }, [saving, closePending, beginClose])

  const applyMemo = (value: string) => {
    // コードポイントで止める(サロゲートペアを割らない)。UTF-16 の .length では切らない。
    setMemo([...value].slice(0, MEMO_MAX_LENGTH).join(''))
    if (saveError) setSaveError(null)
  }

  const applySourceText = (value: string): string => {
    const next = [...value].slice(0, SOURCE_TEXT_MAX_LENGTH).join('')
    setSourceText(next)
    if (saveError) setSaveError(null)
    // 取得済みタイトルはその URL のためのもの。出典が変わったら chip を落とし、取り直せる状態へ
    // 戻す(✕ で消したときは出典が変わらないので、その URL では取り直さないまま)。
    if (next.trim() !== lastFetchedUrlRef.current) {
      lastFetchedUrlRef.current = null
      setSourceTitle('')
      setTitleUnreadable(false)
    }
    return next
  }

  /**
   * 出典から og:title を取りに行く(paste と blur の 2 トリガー・S-8)。http / https として
   * 解釈できない自由記述は取りに行かない(S-12)—— そのまま source_text として保存できる。
   */
  const maybeFetchTitle = async (raw: string) => {
    const value = raw.trim()
    if (fetchingTitleRef.current) return
    if (value.length === 0 || value === lastFetchedUrlRef.current) return
    if (!sourceUrlSchema.safeParse(value).success) return

    fetchingTitleRef.current = true
    lastFetchedUrlRef.current = value
    setTitleUnreadable(false)
    try {
      const result = await fetchSourceTitle(value)
      if (result.ok) {
        setSourceTitle(result.title)
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      if (result.reason === 'unavailable') {
        setTitleUnreadable(true)
      }
    } catch {
      setTitleUnreadable(true)
    } finally {
      fetchingTitleRef.current = false
    }
  }

  useEffect(() => {
    maybeFetchTitleRef.current = maybeFetchTitle
  })

  const handleSave = async () => {
    if (busy || closePending || !canSave) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await savePlace(input)
      if (result.ok) {
        outcomeRef.current = result.mode
        beginClose()
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      if (result.reason === 'conflict') {
        // 別タブ等で先に保存された(23505)。成功に畳まず、編集として開き直して押し直せる
        // ようにする。打ちかけのメモ・出典は残す(サーバの値で上書きしない)。
        const again = await resolveSavedPlace(context.googlePlaceId)
        if (again.ok && again.mode === 'edit') {
          setExistingStatus(again.status)
        }
      }
      setSaveError(SAVE_FAILED)
    } catch {
      setSaveError(SAVE_FAILED)
    } finally {
      // 例外でも失敗でも押し直せる状態へ戻す(握ると操作不能になる・spec §6.1)。成功したときは
      // シートが退場中なので、スピナーを残したまま畳む。
      if (outcomeRef.current === 'close') setSaving(false)
    }
  }

  /**
   * D5 の「削除する」確定。**このモジュールで削除を起こす唯一の口**(D5 のキャンセル・背景タップは
   * `deleteSavedPlace` を一度も呼ばない)。成功したら、既存の保存成功と同じ退場経路
   * (`beginClose` → 退場後に `onSaved('deleted')`)へ合流させる —— 消えた行を編集し続けさせない
   * ため。遷移先(`/saved` への `router.replace` / `/map` の再描画)は呼び出し元の担当(WP-10 S9。
   * map-screen.tsx / place-detail-screen.tsx)。
   */
  const handleDeleteConfirm = async () => {
    // `deleting` 単独ではなく `busy`(= resolving || saving || deleting)で塞ぐ(AD-D2a
    // repair 2026-08-25)。保存中の CTA はスクリムの後ろでも Tab で到達できてしまうため
    // (半分 (b)。既存の S1 モダリティ欠如は非ゴール §1.3-7 によりこの WP では直さない)、
    // 「削除の確認を開く → 保存を始める → 確定する」という順で 1 行に対して upsert と
    // delete が同時に走り得た。ガードをここで揃えるだけで、その並走を止める。
    if (busy) return
    setDeleting(true)
    try {
      // AD-N1 是正(WP-10-irregular-ad-n1-2026-08-26 §3.2-1):詳細画面はサーバ側 redirect の
      // 経路(`deleteSavedPlaceFromDetail`)を、地図はこれまでどおり `deleteSavedPlace` を呼ぶ。
      // 前者は成功時に `redirect()` が Error を throw する(`next/navigation` の公式仕様)ため、
      // この `try` は正常 return しない。
      const result = await (deleteRedirectsToSaved
        ? deleteSavedPlaceFromDetail(context.googlePlaceId)
        : deleteSavedPlace(context.googlePlaceId))
      if (result.ok) {
        setDeleteConfirmOpen(false)
        outcomeRef.current = 'deleted'
        beginClose()
        return
      }
      if (result.reason === 'unauthenticated') {
        router.replace('/login')
        return
      }
      // 失敗は D5 を畳んでシート側の既存の失敗表示に合流させる(新しい面を作らない)。
      setDeleteConfirmOpen(false)
      setSaveError(SAVE_FAILED)
    } catch (error) {
      // AD-N1 是正(§3.2-2):`deleteSavedPlaceFromDetail` の成功は `redirect()` の throw として
      // 届く。これを通常の失敗として握り潰さない —— `unstable_rethrow` は Next のナビゲーション
      // / notFound 制御用の Error だけを再送出し、それ以外(本当の失敗)はここを素通りして下の
      // 既存の失敗表示に合流する(裁定 AD-IRR-B。欠くと成功した不可逆削除に対して
      // `setSaveError(SAVE_FAILED)` が出る)。
      unstable_rethrow(error)
      setDeleteConfirmOpen(false)
      setSaveError(SAVE_FAILED)
    } finally {
      setDeleting(false)
    }
  }

  const handleFieldFocus = (
    event: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    focusedFieldRef.current = event.currentTarget
  }

  const showAddress = !keyboardOpen && context.formattedAddress.length > 0

  const fieldStyle = (focused: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    border: `1px solid ${focused ? 'var(--border-accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-control)',
    padding: '11px 12px',
    fontFamily: 'var(--ff-sans)',
    // 16px は iOS がフォーカス時に自動ズームしない下限。プレースホルダもこの寸を継がせる。
    fontSize: 16,
    color: 'var(--fg-1)',
    background: 'var(--surface)',
    outline: 'none',
    boxShadow: focused ? FOCUS_RING : 'none',
    scrollMarginTop: 8,
    transition:
      'border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)',
  })

  return (
    <>
      <div
        onClick={requestClose}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          background: 'var(--sheet-scrim)',
          opacity: visible ? 1 : 0,
          transition: 'opacity var(--dur-slow) var(--ease)',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // キーボードのぶんだけ持ち上げる。0 のときは画面下端に貼り付く。
          bottom: keyboardInset,
          zIndex: 21,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          maxHeight,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
          padding: '10px 0 0',
          boxShadow: visible ? 'var(--sheet-shadow)' : 'none',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition:
            'transform var(--dur-slow) var(--ease), box-shadow var(--dur-slow) var(--ease), bottom var(--dur-fast) var(--ease)',
        }}
      >
        {/* 上固定 —— どの店を編集中か見失わないための帯。流れる領域が下限を割るときは、ここが
            削られて下固定(主 CTA)が残る。
            flex の縮みは「元の高さ × 率」の割合で配られるので、両方が率 1 だとシートが上限に
            当たるたびに帯も一緒に削られ、キーボード中に店名の行の下半分が切れた(WP-08 D3)。
            流れる領域の率を 1000 にして、先にそちらを下限 96 まで縮め、下限で止まった後の不足
            だけを帯に回す(帯の率を 1 未満にすると、率の和が 1 未満の規則で不足が帯に回らない)。
            店名は折り返して全部見せる(所有者 2026-11-02・D3 案 C)。 */}
        <div
          style={{
            flex: '0 1 auto',
            minHeight: 0,
            overflow: 'hidden',
            padding: '0 20px',
          }}
        >
          {/* グラブの下 / 住所の下 / 下固定の余白は新規と編集で違う。design と返却造形の非対称を
              そのまま写す(揃えない)。キーボード時だけは両モードとも同じ寸に詰まる。 */}
          <div
            aria-hidden
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'var(--border-strong)',
              margin: keyboardOpen
                ? '0 auto 12px'
                : mode === 'create'
                  ? '0 auto 16px'
                  : '0 auto 14px',
            }}
          />
          {/* 店名が空の POI では行そのものを出さない(空の 19px 行も代替文字列も置かない)。 */}
          {context.displayName.length > 0 && (
            <div
              style={{
                ...heading(keyboardOpen ? 18 : 20),
                color: 'var(--fg-1)',
                ...(showAddress ? null : { marginBottom: 14 }),
              }}
            >
              {context.displayName}
            </div>
          )}
          {showAddress && (
            <div
              style={{
                ...META,
                color: 'var(--fg-2)',
                margin: mode === 'create' ? '4px 0 18px' : '4px 0 14px',
              }}
            >
              {context.formattedAddress}
            </div>
          )}
        </div>

        {/* 流れる領域 —— 地図へスクロールを抜けさせない(overscroll-behavior: contain)。 */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            // 縮む率 1000 = 帯より先に縮む(上の帯の注記)。
            flex: '1 1000 auto',
            minHeight: FLOW_MIN_HEIGHT,
          }}
        >
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              minWidth: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              padding: '0 20px',
            }}
          >
            <div
              ref={contentRef}
              style={{
                opacity: busy ? 0.5 : 1,
                transition: 'opacity var(--dur) var(--ease)',
              }}
            >
              {/* 「状態」ラベルは design C-1 にだけあり C-2 には無い。非対称をそのまま写す。 */}
              {mode === 'create' && (
                <div style={{ ...CAPS_LABEL_STYLE, marginBottom: 8 }}>
                  {STATUS_LABEL}
                </div>
              )}

              <div
                role="group"
                aria-label={STATUS_LABEL}
                style={{
                  display: 'flex',
                  background: 'var(--bg-sunken)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-control)',
                  padding: 3,
                  gap: 3,
                }}
              >
                {SAVED_PLACE_STATUSES.map((value) => {
                  const selected = status === value
                  // 表示上の制約であって権威ではない。逆戻りの最終判定はサーバが行う。
                  const blocked = value === UNRATED_STATUS && revertBlocked
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      disabled={busy || blocked}
                      onClick={() => setStatus(value)}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '9px 0',
                        border: 0,
                        ...META,
                        cursor: busy || blocked ? 'default' : 'pointer',
                        ...(selected
                          ? {
                              fontWeight: 700,
                              color: 'var(--fg-1)',
                              background: 'var(--surface)',
                              // 外の枠(角 8・枠 1・内側の余白 3)と同心にするため 8 − 1 − 3 = 4。
                              borderRadius: 4,
                              boxShadow: 'var(--segment-selected-shadow)',
                            }
                          : blocked
                            ? {
                                color: 'var(--fg-muted)',
                                opacity: 0.55,
                                background: 'transparent',
                              }
                            : { color: 'var(--fg-2)', background: 'transparent' }),
                      }}
                    >
                      {STATUS_LABELS[value]}
                    </button>
                  )
                })}
              </div>
              {revertBlocked && <p style={NOTE_STYLE}>{STATUS_REVERT_NOTE}</p>}

              <label
                htmlFor="save-sheet-memo"
                style={{
                  ...CAPS_LABEL_STYLE,
                  margin: mode === 'create' ? '18px 0 8px' : '16px 0 8px',
                }}
              >
                {MEMO_LABEL}
              </label>
              <textarea
                id="save-sheet-memo"
                className="sheet-field"
                value={memo}
                disabled={busy}
                placeholder={MEMO_PLACEHOLDER}
                onFocus={(event) => {
                  handleFieldFocus(event)
                  setMemoFocused(true)
                }}
                onBlur={() => setMemoFocused(false)}
                onChange={(event) => applyMemo(event.target.value)}
                style={{
                  ...fieldStyle(memoFocused),
                  // 3 行目以降が欄の下端で半分のぞかないよう、下の余白を 0 にして高さを行の整数倍にする
                  // (上の余白 11px + 2 行 × 27px + 枠 2px)。下に余白があると、そこに次の行の上端が映る。
                  padding: '11px 12px 0',
                  height: 67,
                  lineHeight: '27px',
                  resize: 'none',
                }}
              />

              <label
                htmlFor="save-sheet-source"
                style={{ ...CAPS_LABEL_STYLE, margin: '16px 0 8px' }}
              >
                {SOURCE_LABEL}
              </label>
              <input
                id="save-sheet-source"
                className="sheet-field"
                type="text"
                inputMode="url"
                autoComplete="off"
                value={sourceText}
                disabled={busy}
                placeholder={SOURCE_PLACEHOLDER}
                onFocus={(event) => {
                  handleFieldFocus(event)
                  setSourceFocused(true)
                }}
                onPaste={() => {
                  pastedRef.current = true
                }}
                onChange={(event) => {
                  const next = applySourceText(event.target.value)
                  if (pastedRef.current) {
                    pastedRef.current = false
                    void maybeFetchTitle(next)
                  }
                }}
                onBlur={(event) => {
                  setSourceFocused(false)
                  void maybeFetchTitle(event.currentTarget.value)
                }}
                style={fieldStyle(sourceFocused)}
              />

              {sourceTitle.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-control)',
                    padding: '8px 10px',
                    marginTop: 8,
                  }}
                >
                  {chipUrl === null ? (
                    <>
                      <span
                        style={{
                          flex: 'none',
                          ...LABEL_EN,
                          color: 'var(--accent)',
                          border: '1px solid var(--accent)',
                          borderRadius: 'var(--radius-chip)',
                          padding: '2px 5px',
                        }}
                      >
                        OGP
                      </span>
                      {/* 外部由来の文字列。HTML としては解釈させない(テキストのまま描く)。 */}
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          ...META,
                          color: 'var(--fg-1)',
                        }}
                      >
                        {sourceTitle}
                      </span>
                    </>
                  ) : (
                    <a
                      href={busy ? undefined : chipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'inherit',
                        textDecoration: 'none',
                        cursor: busy ? 'default' : 'pointer',
                        margin: '-8px 0 -8px -10px',
                        padding: '8px 0 8px 10px',
                      }}
                    >
                      <span
                        style={{
                          flex: 'none',
                          ...LABEL_EN,
                          color: 'var(--accent)',
                          border: '1px solid var(--accent)',
                          borderRadius: 'var(--radius-chip)',
                          padding: '2px 5px',
                        }}
                      >
                        OGP
                      </span>
                      {/* 外部由来の文字列。HTML としては解釈させない(テキストのまま描く)。 */}
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          ...META,
                          color: 'var(--fg-1)',
                        }}
                      >
                        {sourceTitle}
                      </span>
                      <span style={{ flex: 'none', ...META, color: 'var(--fg-1)' }}>{EXTERNAL_ARROW}</span>
                    </a>
                  )}
                  {/* ✕ は chip だけを消す。出典の文字は 1 字も変えず、その URL では取り直さない。 */}
                  <button
                    type="button"
                    aria-label="閉じる"
                    disabled={busy}
                    onClick={() => setSourceTitle('')}
                    style={{
                      flex: 'none',
                      display: 'flex',
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--fg-muted)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M6 6l12 12 M18 6l-12 12" />
                    </svg>
                  </button>
                </div>
              ) : chipUrl !== null && linkLabel.length > 0 ? (
                <a
                  href={busy ? undefined : chipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-control)',
                    padding: '8px 10px',
                    marginTop: 8,
                    color: 'inherit',
                    textDecoration: 'none',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      ...META,
                      color: 'var(--fg-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {linkLabel}
                  </span>
                  <span style={{ flex: 'none', ...META, color: 'var(--fg-1)' }}>{EXTERNAL_ARROW}</span>
                </a>
              ) : titleUnreadable ? (
                <p style={NOTE_STYLE}>{SOURCE_TITLE_UNREADABLE}</p>
              ) : (
                <p style={NOTE_STYLE}>{SOURCE_HELPER}</p>
              )}

              {/* 詳細情報(営業時間・電話・website)。店舗詳細と同じ部品。出典の注記の後・流れる領域の末尾。 */}
              {placesLibrary !== undefined ? (
                <SheetPlaceDetails
                  key={context.googlePlaceId}
                  places={placesLibrary}
                  googlePlaceId={context.googlePlaceId}
                />
              ) : null}
            </div>
          </div>

          {/* 区切りが要るときだけ引く。面色から透明への 24px。 */}
          {scrollable && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 24,
                background:
                  'linear-gradient(to bottom, transparent, var(--surface))',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* 下固定 —— 主 CTA は常に見えている。上辺の 1px は流れる領域との境で、区切りが要らない
            ときは透明にする(引かないぶんで高さが跳ねないように)。
            余白は新規と編集で違う:編集は返却造形の下固定 `14px 20px 24px`、新規は単一列で描かれた
            面の CTA 上 18px + シート下端 26px がこの層に来る。 */}
        <div
          style={{
            flex: 'none',
            padding: keyboardOpen
              ? '12px 20px 14px'
              : mode === 'create'
                ? '18px 20px 26px'
                : '14px 20px 24px',
            borderTop: `1px solid ${scrollable ? 'var(--border-subtle)' : 'transparent'}`,
          }}
        >
          {saveError && (
            <p
              role="alert"
              style={{
                margin: '0 0 12px',
                ...META,
                color: 'var(--akane-text)',
              }}
            >
              {saveError}
            </p>
          )}
          <button
            type="button"
            className="btn-hairline"
            onClick={handleSave}
            disabled={busy || !canSave}
            aria-busy={busy}
            style={{
              ...(keyboardOpen ? { paddingTop: 14, paddingBottom: 14 } : {}),
              ...(busy || !canSave ? { opacity: 0.5, cursor: 'default' } : {}),
            }}
          >
            {CTA_LABELS[mode]}{' '}
            {busy ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <span className="arrow">→</span>
            )}
          </button>

          {/* 編集状態のみ(A4 / C-W6)。新規(非編集)シートには出さない。 */}
          {mode === 'edit' && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setDeleteConfirmOpen(true)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                justifyContent: 'center',
                marginTop: 10,
                color: 'var(--akane-text)',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              {DELETE_LABEL}
            </button>
          )}
        </div>
      </div>

      {deleteConfirmOpen && (
        <DeleteConfirmDialog
          displayName={context.displayName}
          pending={deleting}
          onCancel={() => {
            if (!deleting) setDeleteConfirmOpen(false)
          }}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </>
  )
}

/** 閉じた時の行の下の余白。下固定の CTA の上の間隔と足して、店舗詳細の「行の罫 → 編集する」(22px)とそろえる。 */
const SHEET_DETAILS_END_CLOSED = 6
/** 開いた時の行の下の余白。流れる領域の下端のぼかし(24px)の外に枠の下の縁を出す(Tora 2026-11-09 案 3)。 */
const SHEET_DETAILS_END_OPEN = 'var(--sp-5)'

/** 地図から開いた S1 の「詳細情報」。開いた時だけ下の余白を広げる。店の切り替えで key ごと作り直す。 */
function SheetPlaceDetails({ places, googlePlaceId }: { places: google.maps.PlacesLibrary | null; googlePlaceId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 15,
        marginTop: 16,
        paddingBottom: open ? SHEET_DETAILS_END_OPEN : SHEET_DETAILS_END_CLOSED,
      }}
    >
      <PlaceDetailsDisclosure places={places} googlePlaceId={googlePlaceId} onExpandedChange={setOpen} />
    </div>
  )
}
