'use client'

import {
  AdvancedMarker,
  APILoadingStatus,
  ColorScheme,
  Map,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps'
import { useEffect, useMemo } from 'react'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  type SavedPlaceStatus,
} from '@harema/shared/constants'
import { clientEnv } from '@/env/client'
import { MapsLoadFailCard } from '../map/maps-load-fail-card'
import { ListPin } from './list-pin'
import {
  cameraForMarkers,
  markersForTab,
  MAX_FIT_ZOOM,
  type ListMarkerRow,
} from './list-map-layout'

/** `useMap(id)` で同じ地図を参照するための instance id。 */
const SAVED_MAP_INSTANCE_ID = 'harema-saved-map'

/** 範囲合わせの余白(px)。 */
const FIT_PADDING = 40

type SavedListMapProps = {
  rows: readonly ListMarkerRow<SavedPlaceStatus>[]
  status: SavedPlaceStatus
  /** 押して選んだ行の id(なければ null)。 */
  selectedId: string | null
  /** ピンを押した。Places は呼ばない(一覧を動かすのは呼び出し側)。 */
  onSelect: (id: string) => void
  /** 地図の何も無い所を押した。 */
  onClear: () => void
}

/**
 * 一覧の上の地図(Issue 37)。`<Map>` は 1 つで key を持たず、作り直しの props
 * (id・mapId・colorScheme)は定数 —— タブを替えても地図を作り直さない(Map loads を増やさない)。
 * ピンは DB の座標だけで描き、Places は呼ばない。
 */
export function SavedListMap({ rows, status, selectedId, onSelect, onClear }: SavedListMapProps) {
  const apiStatus = useApiLoadingStatus()

  if (apiStatus === APILoadingStatus.FAILED) {
    // Maps JS 本体が読めない。地図は 1 枚も描けないので下地を出さず、地図画面と同じカードを出す。
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }} />
        <MapsLoadFailCard />
      </div>
    )
  }

  return (
    <Map
      id={SAVED_MAP_INSTANCE_ID}
      mapId={clientEnv.googleMapsMapId}
      colorScheme={ColorScheme.FOLLOW_SYSTEM}
      defaultCenter={DEFAULT_MAP_CENTER}
      defaultZoom={DEFAULT_MAP_ZOOM}
      disableDefaultUI
      gestureHandling="greedy"
      clickableIcons={false}
      onClick={onClear}
      style={{ width: '100%', height: '100%' }}
    >
      <SavedListMarkers
        rows={rows}
        status={status}
        selectedId={selectedId}
        onSelect={onSelect}
        onClear={onClear}
      />
    </Map>
  )
}

function SavedListMarkers({ rows, status, selectedId, onSelect }: SavedListMapProps) {
  const map = useMap(SAVED_MAP_INSTANCE_ID)
  const markers = useMemo(() => markersForTab(rows, status), [rows, status])

  // 範囲合わせは、地図ができたときとタブが変わったときだけ走る。markers は rows(サーバから
  // 渡る不変の配列)と status だけから作るので、行の取得の完了・失敗の描き直しでは変わらない。
  // 取得の状態など描き直しのたびに変わる値を依存に足すと fitBounds が走り、利用者が動かした
  // 地図が戻る。
  useEffect(() => {
    if (map === null) return
    const camera = cameraForMarkers(markers, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM)
    if (camera.kind === 'center') {
      map.setCenter(camera.center)
      map.setZoom(camera.zoom)
      return
    }
    map.fitBounds(camera.bounds, FIT_PADDING)
    // 近すぎて zoom が上限を超えたら、最初の idle で戻す。
    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      const zoom = map.getZoom()
      if (zoom !== undefined && zoom > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM)
    })
    return () => listener.remove()
  }, [map, markers])

  return (
    <>
      {markers.map((marker) => (
        <AdvancedMarker
          key={marker.id}
          position={marker.position}
          zIndex={marker.id === selectedId ? 10 : marker.status === 'visit_again' ? 2 : 1}
          onClick={() => onSelect(marker.id)}
        >
          <ListPin
            status={marker.status}
            number={marker.number}
            selected={marker.id === selectedId}
          />
        </AdvancedMarker>
      ))}
    </>
  )
}
