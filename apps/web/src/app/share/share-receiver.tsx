'use client'

import { parseSharedItems } from '@harema/shared/share-parse'
import { useEffect } from 'react'
import { handoffFromParsed, putPendingShare } from '@/lib/share-pending'
import { itemsFromShareParams } from '@/lib/share-target'

// 届いた title・text・url を iOS と同じ分け方で分け、同じタブの sessionStorage に置いて /map へ送る。
// 画面には何も出さない。戻り先の引数は読まない(開いたリダイレクトを作らない)。
export function ShareReceiver() {
  useEffect(() => {
    const items = itemsFromShareParams(new URLSearchParams(window.location.search))
    const handoff = handoffFromParsed(parseSharedItems(items), Date.now())
    if (handoff !== null) putPendingShare(handoff)
    window.location.replace('/map')
  }, [])
  return null
}
