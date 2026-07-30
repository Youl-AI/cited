import { z } from 'zod'
import { PLANS } from '@/lib/plans'

/**
 * 무료 진단 신청 폼의 입력 검증.
 *
 * 순수 모듈이다 — DB·네트워크를 타지 않는다. 라우트(`/api/audit/request`)가
 * 이 결과를 그대로 리포지토리에 넘기므로, **통과한 키가 곧 컬럼 목록**이다.
 * 여기에 필드를 늘리면 `src/lib/db/schema.ts`의 `freeAudits`도 같이 봐야 한다.
 */

/** 무료 플랜의 경쟁사 한도와 같아야 한다. 다르면 화면과 제품이 어긋난다. */
export const MAX_COMPETITORS = PLANS.free.maxCompetitors

/**
 * 브랜드명·카테고리·경쟁사명 공통. 100자 제한이 없으면 신청 테이블에 소설이 들어온다.
 *
 * ★ 메시지를 한국어로 준다. 라우트가 **첫 이슈의 메시지를 그대로 응답에 담고**
 *   폼이 그것을 그대로 띄우므로, 기본값으로 두면 한국 고객에게
 *   `Invalid email address`가 보인다(실제로 그랬다).
 */
const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}을(를) 입력해 주세요`)
    .max(100, `${label}은(는) 100자를 넘을 수 없습니다`)

/**
 * 사용자 입력에서 호스트명만 뽑는다.
 *
 * ★ 2026-07-30(2) 추가. 인용 출처의 소유 판정에 쓴다(Task 6). 브랜드명에서
 *   도메인을 **추측하지 않는 이유**가 여기 있다 — `무신사`가 `musinsa.com`인지
 *   `musinsa.co.kr`인지 알 수 없고, 틀린 추측은 "당신 사이트는 한 번도 인용되지
 *   않았습니다"라는 리포트의 가장 강한 문장을 근거 없이 만든다.
 *
 * ★ 파싱 실패를 조용히 버리지 않는다. 아래 스키마가 거부하고 폼이 알려준다 —
 *   조용히 버리면 고객은 넣었다고 믿고, 리포트에는 그 줄이 없다.
 */
export function parseHostname(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  try {
    // 스킴이 없으면 URL이 던진다. 붙여서 다시 시도한다.
    //
    // ★ 이 접두사 붙이기 때문에 **결과 protocol은 항상 http: 아니면 https:다.**
    //   정규식이 맞으면 입력이 그 두 스킴 중 하나이고, 안 맞으면 우리가 https를
    //   붙인다. 그래서 별도의 스킴 검사가 없다 — 넣어 봤지만 절대 발동하지 않는
    //   죽은 분기였다(변이 테스트로 확인). `javascript:`·`data:`는 파싱 자체가
    //   실패하고 `ftp://a.com`·`file:///x`는 점 없는 호스트('ftp','file')가 되어
    //   아래에서 걸러진다.
    //
    //   **위 접두사 로직을 바꾸면 스킴 검사를 다시 넣어야 한다.** 이 값은
    //   리포트에 그대로 실린다.
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    // URL이 호스트명을 이미 소문자로 정규화한다. 인용 출처 도메인과 문자열로
    // 비교하므로 표기가 갈리면 못 맞춘다.
    const host = url.hostname
    // 점이 없으면 호스트명이 아니다 ('무신사', 'localhost').
    if (!host.includes('.')) return null
    // ★ `www.`만 떼고 다른 서브도메인은 남긴다. 무조건 첫 라벨을 떼면
    //   `corp.musinsa.com`이 `musinsa.com`이 되어 남의 사이트를 고객 것으로 센다.
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return null
  }
}

export const auditRequestSchema = z
  .object({
    brandName: nameField('브랜드명'),
    category: nameField('업종'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email('이메일 주소 형식이 올바르지 않습니다')),
    // 개별 값의 trim·중복 제거는 아래 transform이 한다. 여기서는 길이만 막는다 —
    // `nameField`를 쓰면 빈 칸을 남긴 사용자가 거부당한다.
    competitors: z
      .array(z.string().max(100, '경쟁사 이름은 100자를 넘을 수 없습니다'))
      .optional()
      .default([]),
    /** 고객 사이트 주소. 선택. `https://` 유무·경로·`www.`가 섞여 들어온다 */
    siteUrl: z.string().trim().optional().default(''),
  })
  .transform((v) => ({
    ...v,
    // 빈 값·중복·자기 자신을 걷어낸 뒤에 개수를 센다. 사용자가 실수로
    // 빈 칸을 남기거나 같은 값을 두 번 넣은 것 때문에 거부당하면 안 된다.
    // `v.brandName`은 위 `name`이 이미 trim한 값이다.
    competitors: [
      ...new Set(
        v.competitors.map((c) => c.trim()).filter((c) => c.length > 0 && c !== v.brandName),
      ),
    ],
    // 빈 값은 통과시키고(선택 항목), 값이 있는데 파싱이 안 되면 아래에서 거부한다.
    selfDomains: v.siteUrl
      ? [parseHostname(v.siteUrl)].filter((h): h is string => h !== null)
      : [],
  }))
  .refine((v) => v.competitors.length <= MAX_COMPETITORS, {
    message: `경쟁사는 최대 ${MAX_COMPETITORS}개까지 등록할 수 있습니다`,
    path: ['competitors'],
  })
  .refine((v) => !v.siteUrl || v.selfDomains.length > 0, {
    message: '사이트 주소를 알아볼 수 없습니다. 예: musinsa.com',
    path: ['siteUrl'],
  })

export type AuditRequestInput = z.infer<typeof auditRequestSchema>

export function parseAuditRequest(input: unknown): AuditRequestInput {
  return auditRequestSchema.parse(input)
}
