import { notFound } from 'next/navigation'

// どの道にも当たらない URL を、(site) の 404 に集める。
export default function NotFoundCatchAll() {
  notFound()
}
