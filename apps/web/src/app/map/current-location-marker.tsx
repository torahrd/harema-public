'use client'

import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { useEffect, useId, useRef, useState } from 'react'
import {
  CURRENT_LOCATION_BEAM,
  CURRENT_LOCATION_SHAPE,
  beamWedgePath,
  nextHeading,
  sameLatLng,
  sampleMove,
  screenBeamAngle,
  startMove,
  type HeadingState,
  type LatLng,
  type Move,
} from '@harema/shared/current-location'
import { useReducedMotion } from './use-reduced-motion'

const { dotDiameter, dotRing, accuracyDiameter, markerBox } = CURRENT_LOCATION_SHAPE

const BOX_STYLE: React.CSSProperties = {
  position: 'relative',
  display: 'block',
  width: markerBox,
  height: markerBox,
}

const CENTERED: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
}

const ACCURACY_STYLE: React.CSSProperties = {
  ...CENTERED,
  width: accuracyDiameter,
  height: accuracyDiameter,
  background: 'var(--current-accuracy)',
}

const DOT_STYLE: React.CSSProperties = {
  ...CENTERED,
  width: dotDiameter,
  height: dotDiameter,
  boxSizing: 'border-box',
  background: 'var(--current-dot)',
  border: `${dotRing}px solid var(--current-dot-ring)`,
  boxShadow: 'var(--pin-shadow)',
}

const BEAM_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: markerBox,
  height: markerBox,
  overflow: 'visible',
  pointerEvents: 'none',
}

const BEAM_PATH = beamWedgePath(CURRENT_LOCATION_BEAM.radius, CURRENT_LOCATION_BEAM.halfAngleDeg)

/**
 * 現在地(spec §7)。Google マップに近い青い点で、位置が変わったら滑らかに移す。
 * 毎こまの更新はこの部品の中に閉じる(地図の画面全体を描き直さない)。
 * 進む向きへ扇形の光を出す。向きは続けて取れた位置の差から出し(方位の許可は使わない)、
 * 初めは光を出さない。止まっている間は最後の向きを保つ。
 * 座標はここで描くだけで、どこへも送らない。
 */
export function CurrentLocationMarker({
  position,
  accuracy,
}: {
  position: google.maps.LatLngLiteral
  accuracy: number | null
}) {
  const reduceMotion = useReducedMotion()
  const map = useMap()
  const gradientId = useId()
  const headingRef = useRef<HeadingState | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [mapHeading, setMapHeading] = useState<number | null>(null)
  const moveRef = useRef<Move | null>(null)
  const displayedRef = useRef<LatLng | null>(null)
  const [rendered, setRendered] = useState<LatLng | null>(null)
  const { lat, lng } = position

  // 位置は値(数)で比べる。親は watch のたびに新しいオブジェクトを渡すので、参照では比べない。
  useEffect(() => {
    const next: LatLng = { latitude: lat, longitude: lng }
    let frame = 0
    const step = (now: number) => {
      const move = moveRef.current
      if (!move) return
      const sampled = sampleMove(move, now, reduceMotion)
      displayedRef.current = sampled.position
      setRendered(sampled.position)
      setHeading(headingRef.current?.heading ?? null)
      if (!sampled.done) frame = requestAnimationFrame(step)
    }
    headingRef.current = nextHeading(headingRef.current, next, accuracy)
    if (!sameLatLng(moveRef.current?.to ?? null, next)) {
      moveRef.current = startMove(displayedRef.current, next, performance.now())
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [lat, lng, accuracy, reduceMotion])

  // 地図が回されたら、光が地面の上の向きを指すように角度を引き直す。
  useEffect(() => {
    if (!map) return
    const read = () => setMapHeading(map.getHeading() ?? 0)
    const frame = requestAnimationFrame(read)
    const listener = map.addListener('heading_changed', read)
    return () => {
      cancelAnimationFrame(frame)
      listener.remove()
    }
  }, [map])

  if (!rendered) return null
  return (
    <AdvancedMarker
      position={{ lat: rendered.latitude, lng: rendered.longitude }}
      zIndex={0}
      anchorLeft="-50%"
      anchorTop="-50%"
    >
      <span style={BOX_STYLE}>
        <span style={ACCURACY_STYLE} />
        {heading !== null ? (
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${markerBox} ${markerBox}`}
            style={{
              ...BEAM_STYLE,
              transform: `rotate(${screenBeamAngle(heading, mapHeading)}deg)`,
              transformOrigin: '50% 50%',
            }}
          >
            <defs>
              <radialGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                cx={CURRENT_LOCATION_BEAM.radius}
                cy={CURRENT_LOCATION_BEAM.radius}
                r={CURRENT_LOCATION_BEAM.radius}
              >
                {CURRENT_LOCATION_BEAM.stops.map(([offset, opacity]) => (
                  <stop
                    key={offset}
                    offset={offset}
                    style={{ stopColor: 'var(--current-dot)', stopOpacity: opacity }}
                  />
                ))}
              </radialGradient>
            </defs>
            <path d={BEAM_PATH} fill={`url(#${gradientId})`} />
          </svg>
        ) : null}
        <span style={DOT_STYLE} />
      </span>
    </AdvancedMarker>
  )
}
