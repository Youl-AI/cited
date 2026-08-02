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

const GRANT_OPTIONS = ['--from-audit', '--packs'] as const

const USAGE = '사용법: pnpm plan:grant <이메일> starter|business [--from-audit aud_xxx] [--packs N]'

function isGrantable(value: string): value is GrantablePlan {
  return (GRANTABLE_PLANS as readonly string[]).includes(value)
}

function isGrantOption(name: string): boolean {
  return (GRANT_OPTIONS as readonly string[]).includes(name)
}

/**
 * 이메일 정규화 — `user.email`은 소문자 unique다. grant·revoke가 같이 쓴다
 * (규칙이 갈라지면 한쪽에서만 조회가 빗나간다).
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * ★ 이 파서는 **모르는 것을 조용히 넘기지 않는다.** 부여는 실패보다 "틀린 성공"이
 *   훨씬 비싸다 — 돈 낸 고객이 팩 0개를 받거나(`--packs=3`이 무시됨), 크몽 연결이
 *   빠진 채 부여가 성공한다(`--from-audit=aud_x`가 무시됨). 둘 다 CLI는 "부여 완료"를
 *   찍고, 증상은 몇 주 뒤 고객이 보는 빈 온보딩 폼으로 처음 나타난다.
 *
 *   그래서 세 가지를 지킨다.
 *   1. `--flag 값`과 `--flag=값`을 **둘 다** 받는다. 한쪽만 받으면 나머지 표기가
 *      조용히 기본값으로 떨어진다 — `audit/report-url.ts`의 `parseBaseUrlFlag`가
 *      같은 이유로 이미 두 표기를 받고 있다.
 *   2. 모르는 `--` 토큰은 이름을 대서 **거부**한다 (`--pack` 같은 오타).
 *   3. 값이 없거나 값 자리에 또 플래그가 오면 거부한다
 *      (`--from-audit --packs 2` → fromAuditId='--packs'로 저장되던 자리).
 */
export function parseGrantArgs(argv: readonly string[]): ParsedGrant {
  const positional: string[] = []
  const options = new Map<string, string>()

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const eq = arg.indexOf('=')
    const name = eq < 0 ? arg : arg.slice(0, eq)
    if (!isGrantOption(name)) {
      return {
        ok: false,
        reason: `알 수 없는 옵션: ${name}\n  쓸 수 있는 옵션: ${GRANT_OPTIONS.join(', ')}\n  ${USAGE}`,
      }
    }
    if (options.has(name)) {
      return { ok: false, reason: `${name}가 두 번 넘어왔습니다 — 한 번만 지정하세요.\n  ${USAGE}` }
    }

    let value: string | undefined
    if (eq >= 0) {
      value = arg.slice(eq + 1)
    } else {
      value = argv[i + 1]
      i += 1
    }
    if (value === undefined || value === '' || value.startsWith('--')) {
      return {
        ok: false,
        reason:
          `${name}에 값이 없습니다 (받은 값: ${value === undefined || value === '' ? '(없음)' : value}).\n` +
          `  표기: ${name} <값> 또는 ${name}=<값>\n  ${USAGE}`,
      }
    }
    options.set(name, value)
  }

  // ★ trim을 검사 **앞에** 둔다. 뒤에 두면 공백뿐인 이메일이 여기를 통과해
  //   `가입된 계정이 없습니다: `처럼 이름이 빈 메시지로 나간다 — 운영자가
  //   무엇을 잘못 쳤는지 알 수 없다.
  const email = normalizeEmail(positional[0] ?? '')
  const planRaw = positional[1]
  if (!email || !planRaw) {
    return { ok: false, reason: USAGE }
  }
  const extra = positional.slice(2)
  if (extra.length > 0) {
    // `plan:grant a@b.co starter 3`처럼 플래그 이름을 빠뜨린 경우다. 무시하면
    // 팩 3개가 조용히 사라진다.
    return { ok: false, reason: `인자가 너무 많습니다: ${extra.join(' ')}\n  ${USAGE}` }
  }
  if (!isGrantable(planRaw)) {
    return { ok: false, reason: `알 수 없는 플랜: ${planRaw} (${GRANTABLE_PLANS.join(' | ')})` }
  }

  let queryPacks = 0
  const packsArg = options.get('--packs')
  if (packsArg !== undefined) {
    // ★ 음수·소수를 조용히 정제하지 않는다 — resolveLimits의 sanitizePacks는
    //   저장된 값의 방어선이고, 운영자 입력 오타는 여기서 크게 멈춰야 한다.
    // ★ Number()를 바로 쓰지 않는 이유: '1e3'을 1000으로, '0x10'을 16으로 받는다.
    //   운영자가 친 적 없는 한도가 그대로 청구·측정 원가가 된다. 십진 정수만 받는다.
    if (!/^\d+$/.test(packsArg)) {
      return {
        ok: false,
        reason: `--packs는 0 이상의 십진 정수여야 합니다 (받은 값: ${packsArg})`,
      }
    }
    queryPacks = Number(packsArg)
  }

  return {
    ok: true,
    args: { email, plan: planRaw, queryPacks, fromAuditId: options.get('--from-audit') ?? null },
  }
}
