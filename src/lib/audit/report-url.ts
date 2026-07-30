/**
 * 리포트 링크의 기준 주소.
 *
 * ## 왜 이 모듈이 있는가
 *
 * 2026-07-30 첫 실사용에서 **리포트 메일이 `http://localhost:3000/audit/…`
 * 링크를 달고 나갔다.** 고객은 그 링크를 열 수 없다.
 *
 * 원인은 단순하다 — 운영자 CLI(`audit:run`)는 `.env.local`을 읽고, 거기
 * `NEXT_PUBLIC_APP_URL`은 개발용 `http://localhost:3000`이다. 웹 라우트에서는
 * 같은 값이 Vercel 환경변수라 옳지만, **CLI는 운영자 노트북에서 돈다.**
 * 같은 변수가 문맥에 따라 옳기도 하고 틀리기도 한다는 것이 함정이다.
 *
 * 조용히 틀리는 종류라 더 나쁘다. CLI는 "발송 완료"를 찍고, 메일도 실제로
 * 나가고, 로그도 정상이다. 링크를 눌러 본 사람만 안다 — 그리고 그건 고객이다.
 *
 * ## 방어
 *
 * 발송할 때 로컬 주소면 **거부한다.** 링크가 죽은 리포트는 안 보내느니만
 * 못하다 — 고객은 "받았는데 안 열린다"는 인상을 갖고, 그게 첫인상이 된다.
 *
 * 순수 모듈이다 — I/O 없음.
 */

/** `--dry`는 저장·발송을 하지 않으므로 링크가 죽어 있어도 무해하다. */
export type ReportUrlMode = 'send' | 'dry'

export interface ResolveReportUrlResult {
  baseUrl: string
  /** 발송해도 되는가. false면 이유가 `reason`에 있다 */
  ok: boolean
  reason?: string
}

/** 브라우저 밖에서는 열 수 없는 호스트 */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost')
  )
}

/**
 * @param configured `env.NEXT_PUBLIC_APP_URL` 또는 `--base-url`로 넘어온 값
 * @param mode 실제 발송인가, `--dry`인가
 */
export function resolveReportBaseUrl(
  configured: string,
  mode: ReportUrlMode,
): ResolveReportUrlResult {
  const trimmed = configured.trim()

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return {
      baseUrl: trimmed,
      ok: false,
      reason: `리포트 링크의 기준 주소를 해석할 수 없습니다: ${trimmed || '(비어 있음)'}`,
    }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      baseUrl: trimmed,
      ok: false,
      reason: `리포트 링크는 http(s)여야 합니다: ${trimmed}`,
    }
  }

  // 끝의 `/`를 떼어 `${base}/audit/${id}`가 `//audit`이 되지 않게 한다.
  const baseUrl = trimmed.replace(/\/+$/, '')

  // ★ dry는 통과시킨다. 저장도 발송도 하지 않으므로 링크가 로컬이어도
  //   아무에게도 가지 않고, 오히려 로컬에서 결과 화면을 열어보는 데 쓴다.
  if (mode === 'dry') return { baseUrl, ok: true }

  if (isLocalHost(url.hostname)) {
    return {
      baseUrl,
      ok: false,
      reason:
        `리포트 링크가 로컬 주소입니다 (${baseUrl}). 고객은 이 링크를 열 수 없습니다.\n` +
        '  운영자 CLI는 .env.local을 읽으므로 NEXT_PUBLIC_APP_URL이 개발용 값입니다.\n' +
        '  공개 주소를 명시해서 다시 실행하세요:\n' +
        '    pnpm audit:run <id> --base-url https://cited.co.kr',
    }
  }

  return { baseUrl, ok: true }
}

/** 리포트 화면의 전체 주소. 기준 주소는 이미 정규화돼 있어야 한다 */
export function reportUrl(baseUrl: string, auditId: string): string {
  return `${baseUrl}/audit/${auditId}`
}

/**
 * `--base-url <값>`을 읽는다. 없으면 null.
 *
 * `--base-url=<값>` 형태도 받는다 — 두 표기를 다 쓰는 것이 흔하고, 한쪽만
 * 지원하면 조용히 기본값(로컬)으로 떨어진다.
 */
export function parseBaseUrlFlag(argv: readonly string[]): string | null {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--base-url') return argv[i + 1] ?? ''
    if (arg.startsWith('--base-url=')) return arg.slice('--base-url='.length)
  }
  return null
}
