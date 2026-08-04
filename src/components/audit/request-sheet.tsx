import Link from 'next/link'
import { RequestForm } from '@/components/audit/request-form'
import { SPECIMEN } from '@/components/marketing/actuals'
import { SpecimenSheet } from '@/components/marketing/specimen-sheet'
import { PLANS, engineLabels } from '@/lib/plans'

/**
 * 신청서 한 장 — 접수 안내 레일 + 기입란이 한 계측 시트 안에서 헤어라인으로
 * 나뉜다. 신청서는 기입하는 문서라 유리가 아니라 시트다(specimen-sheet.tsx).
 *
 * 원래 랜딩의 신청 섹션이었다. 폼을 랜딩에 심는 안과 전용 페이지 안을 두고
 * 사용자가 **전용 페이지 단독안을 확정**했다(2026-08-04): 랜딩의 CTA 세 개가
 * 전부 `/audit/new`로 오고, 마감 대형 타이포가 랜딩의 Action을 맡는다.
 * 그래서 이 조판은 이 페이지의 전부다 — 첫 화면 콘텐츠이므로 호출부는
 * `Reveal`이 아니라 `.enter-rise`로 등장시킨다(audit/new/page.tsx 머리말).
 *
 * ## 레일 구성
 *
 * 네 클러스터: 경쟁사 분모 설명 · 질의 미리보기 · 측정 규격 · 방침/문의.
 * 폼 열이 더 길어서 생기는 세로 여분은 lg에서 `lg:mt-auto`로 클러스터
 * **사이에 고르게** 분배된다 — 바닥에 빈 공간이 고이지 않고 호흡이 된다.
 * 모바일(자연 높이)에서는 mt-auto가 0이라 기본 간격이 서고, 레일 → 기입란
 * 한 열로 접힌다.
 *
 * 레일의 측정 규격은 폼 안 FlowStrip(순서)과 겹치지 않는 정보만 싣는다 —
 * 무엇을 몇 번, 어디에 묻는지. 값은 전부 PLANS.free에서 온다.
 */
export function RequestSheet() {
  return (
    <SpecimenSheet>
      <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col border-b border-border bg-foreground/[0.02] p-6 sm:p-8 lg:border-r lg:border-b-0">
          {/* 히어로의 표시 규칙 설명이 이어지는 자리다. 경쟁사를 실제로
              입력하는 칸 바로 옆이라, 여기서 읽어야 결정에 쓸 수 있다. */}
          <p className="max-w-[34em] text-sm leading-relaxed text-muted-foreground">
            우리는 알려주신 브랜드만 셀 수 있습니다. 경쟁사를 적게 넣으면 점유율이 실제보다 높게
            보입니다. 리포트에 분모를 항상 함께 적는 이유입니다.
          </p>

          {/* ── 질의 미리보기 ────────────────────────────
              오른쪽 "업종" 칸과 직결되는 자리다: 업종 하나로 무슨 질문이
              만들어지는지 실물 한 줄로 즉답한다. 질의는 SPECIMEN(2026-07-30
              실측)에서 온다 — 랜딩의 "무엇을 묻는지 공개합니다"가 전체
              프로토콜이라면 여기는 기입 전 미리보기 한 줄이다. */}
          <div className="mt-8 border border-border bg-foreground/[0.04] p-5 lg:mt-auto">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              업종을 적으면 질문이 만들어집니다
            </p>
            <blockquote className="mt-3 border-l-2 border-primary/60 pl-3 text-sm leading-relaxed">
              {SPECIMEN.query}
            </blockquote>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              업종 &lsquo;패션&rsquo;에 실제로 쓰는 질의 중 하나입니다.
            </p>
          </div>

          {/* 측정 규격. mono는 숫자에만 건다 — 한글을 mono에 넣으면 글자마다
              시스템 서체로 떨어진다. */}
          <dl className="mt-8 border-t border-border text-sm lg:mt-auto">
            {(
              [
                [
                  '질의',
                  <>
                    <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개 ·
                    업종 고정 템플릿
                  </>,
                ],
                [
                  '측정',
                  <>
                    <span className="font-mono tabular-nums">1</span>회
                  </>,
                ],
                ['엔진', engineLabels(PLANS.free.engines).join(' · ')],
              ] as const
            ).map(([term, value]) => (
              <div
                key={term}
                className="flex items-baseline justify-between gap-4 border-b border-border py-3"
              >
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="text-right text-[0.875rem]">{value}</dd>
              </div>
            ))}
          </dl>

          {/* 처리 기준은 방침 문서가 원본이다 — 여기서 새 약속을 만들지 않고
              문서로 보낸다. 문의처도 같다: 푸터에만 있던 주소를 신청을
              망설이는 자리 옆에 내놓는다. */}
          <div className="mt-6 lg:mt-auto">
            <p className="text-xs leading-relaxed text-muted-foreground">
              적어주신 내용은 진단에만 씁니다. 처리 기준은{' '}
              <Link
                href="/legal/privacy"
                className="underline underline-offset-2 transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground"
              >
                개인정보처리방침
              </Link>
              에 있습니다.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              궁금한 점은{' '}
              <a
                href="mailto:contact@cited.co.kr"
                className="underline underline-offset-2 transition-colors duration-[var(--motion-micro)] ease-instrument hover:text-foreground"
              >
                contact@cited.co.kr
              </a>
              로 보내주세요.
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <RequestForm />
        </div>
      </div>
    </SpecimenSheet>
  )
}
