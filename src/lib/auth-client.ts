'use client'

import { createAuthClient } from 'better-auth/react'
import { clientEnv } from '@/lib/env.client'

// ★ 여기서 '@/lib/env'(server-only)를 import하면 안 된다. 이 모듈은 클라이언트
//   번들에 들어가므로 공개 변수만 있는 '@/lib/env.client'를 쓴다.
//   (server-only가 섞이면 `pnpm build`가 즉시 실패한다.)
export const authClient = createAuthClient({
  baseURL: clientEnv.NEXT_PUBLIC_APP_URL,
})

export const { signIn, signUp, signOut, useSession } = authClient
