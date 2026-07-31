import { z } from 'zod'
import { isRegionalCategory } from '@/lib/audit/queries'
import { parseHostname } from '@/lib/audit/request-schema'

/**
 * 온보딩 1단계(브랜드 정보) 검증 — 순수 모듈.
 *
 * 무료 진단 폼(`request-schema.ts`)과 규칙을 공유하되 두 가지가 다르다:
 *  1. 지역형 업종을 거부하지 않고 **지역을 요구한다** — 셀프서비스 온보딩은
 *     지역 없이는 성립하지 않는다(스펙 ②). "지역은 CLI만"은 무료 폼의 결정이다.
 *  2. 경쟁사 한도가 플랜에 따른다(`maxCompetitors` 인자).
 */

const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}을(를) 입력해 주세요`)
    .max(100, `${label}은(는) 100자를 넘을 수 없습니다`)

export function brandFormSchema(maxCompetitors: number) {
  return z
    .object({
      name: nameField('브랜드명'),
      category: nameField('업종'),
      region: z.string().trim().max(50, '지역은 50자를 넘을 수 없습니다').optional().default(''),
      competitors: z
        .array(z.string().max(100, '경쟁사 이름은 100자를 넘을 수 없습니다'))
        .optional()
        .default([]),
      siteUrl: z.string().trim().optional().default(''),
    })
    .transform((v) => ({
      name: v.name,
      category: v.category,
      // 전국형은 지역을 버린다 — generateAuditQueries와 같은 규칙 (붙이면 전국
      // 브랜드 질문이 지역 질문으로 변질된다).
      region: isRegionalCategory(v.category) ? v.region : '',
      competitors: [
        ...new Set(v.competitors.map((c) => c.trim()).filter((c) => c.length > 0 && c !== v.name)),
      ],
      siteUrl: v.siteUrl,
      selfDomains: v.siteUrl
        ? [parseHostname(v.siteUrl)].filter((h): h is string => h !== null)
        : [],
    }))
    .refine((v) => v.competitors.length <= maxCompetitors, {
      message: `경쟁사는 최대 ${maxCompetitors}개까지 등록할 수 있습니다`,
      path: ['competitors'],
    })
    .refine((v) => !isRegionalCategory(v.category) || v.region.length > 0, {
      message:
        '이 업종은 지역이 필요합니다 (예: 강남). 지역 없이 물으면 AI가 "어디 사세요?"부터 묻습니다.',
      path: ['region'],
    })
    .refine((v) => !v.siteUrl || v.selfDomains.length > 0, {
      message: '사이트 주소를 알아볼 수 없습니다. 예: musinsa.com',
      path: ['siteUrl'],
    })
}

export type BrandFormValues = z.infer<ReturnType<typeof brandFormSchema>>
