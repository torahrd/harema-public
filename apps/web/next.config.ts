import type { NextConfig } from "next";

// build 時に env を検証する(判断2・WP-05)。client.ts は module scope で
// clientEnvSchema.safeParse を eager 実行し、必須の NEXT_PUBLIC_* が欠けていれば
// 実 env 変数名を添えて throw する。ここで副作用 import することで、その throw を
// `next build` に伝播させ、env 不備をデプロイ前に止める。
// server.ts は 'server-only' 境界のため config からは import しない(NEXT_PUBLIC_* のみ検証)。
import "./src/env/client";
// 上書きの env(FIREBASE_AUTH_ORIGIN_OVERRIDE・FIREBASE_X509_URL_OVERRIDE)が VERCEL のある環境に
// 入っていたら、build と起動(next start)を失敗させる。env-guard.ts は相対 import を持たず、
// server-only でもないので config から読める(env/server.ts も同じ関数で起動時に確かめる)。
import { assertNoOverridesOnVercel } from "./src/lib/auth/env-guard";
// LP を先に出す間だけ、LP の外を Coming soon へ送る(env HAREMA_LP_ONLY=1 の build だけ)。
import { lpOnlyRedirects } from "./src/lib/lp-only";

assertNoOverridesOnVercel(process.env);

const nextConfig: NextConfig = {
  async redirects() {
    return lpOnlyRedirects(process.env);
  },
};

export default nextConfig;
