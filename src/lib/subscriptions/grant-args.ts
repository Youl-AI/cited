/**
 * `plan:grant` 인자 파싱 — 순수 모듈. I/O 없음.
 *
 * ★ 'free'는 부여 대상이 아니다. free는 "구독 없음"의 다른 이름이고, 부여는
 *   돈 받은 고객에게만 한다(스펙 비용 전제 — 부여한 만큼 운영자 부담).
 */

export const GRANTABLE_PLANS = ['starter', 'business'] as const
export type GrantablePlan = (typeof GRANTABLE_PLANS)[number]

export interface GrantArgs {
  email: string
  plan: GrantablePlan
  queryPacks: number
  fromAuditId: string | null
}

export type ParsedGrant = { ok: true; args: GrantArgs } | { ok: false; reason: string }

function isGrantable(value: string): value is GrantablePlan {
  return (GRANTABLE_PLANS as readonly string[]).includes(value)
}

export function parseGrantArgs(argv: readonly string[]): ParsedGrant {
  const rest = [...argv]
  const option = (name: string): string | undefined => {
    const i = rest.indexOf(name)
    if (i < 0) return undefined
    const value = rest[i + 1]
    rest.splice(i, value === undefined ? 1 : 2)
    return value
  }

  const fromAuditId = option('--from-audit') ?? null
  const packsArg = option('--packs')

  const [emailRaw, planRaw] = rest
  if (!emailRaw || !planRaw) {
    return {
      ok: false,
      reason:
        '사용법: pnpm plan:grant <이메일> starter|business [--from-audit aud_xxx] [--packs N]',
    }
  }
  if (!isGrantable(planRaw)) {
    return { ok: false, reason: `알 수 없는 플랜: ${planRaw} (${GRANTABLE_PLANS.join(' | ')})` }
  }

  let queryPacks = 0
  if (packsArg !== undefined) {
    const n = Number(packsArg)
    // ★ 음수·소수를 조용히 정제하지 않는다 — resolveLimits의 sanitizePacks는
    //   저장된 값의 방어선이고, 운영자 입력 오타는 여기서 크게 멈춰야 한다.
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, reason: `--packs는 0 이상의 정수여야 합니다 (받은 값: ${packsArg})` }
    }
    queryPacks = n
  }

  return {
    ok: true,
    args: { email: emailRaw.trim().toLowerCase(), plan: planRaw, queryPacks, fromAuditId },
  }
}
