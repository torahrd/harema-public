import { notFound } from 'next/navigation'

// /en/... の当たらない道を、en の 404 に集める。
export default function EnNotFoundCatchAll() {
  notFound()
}
