/**
 * 신청부터 리포트 수신까지의 순서.
 *
 * ## 왜 한 곳에 모으는가
 *
 * 이 3단계가 **랜딩 섹션·신청 폼·신청 페이지 세 곳에 나온다.** 각자 적으면
 * 문구가 갈리고, 그러면 "영업일 1일"이 한 곳에서만 사라지는 식으로 약속이
 * 조용히 달라진다.
 *
 * ## 이 문구가 하는 일
 *
 * 확인 메일이 **회원가입 인증처럼 읽히는 것**을 막는다. 실제로 그렇게 읽혔다 —
 * 신청 직후 "메일함을 확인해 주세요" 화면 위에 `시작하기`(회원가입) 버튼이
 * 떠 있어서, 신청이 가입인지 아닌지 판단할 근거가 없었다.
 *
 * 무료 진단은 계정을 만들지 않는다. 리포트 링크(`aud_` + 난수) 자체가 비공개
 * 링크이고, 로그인 벽을 세우면 메일로 리포트를 받은 사람이 못 본다.
 * 그 사실을 신청 **전에** 말해야 한다.
 */

export const AUDIT_FLOW = [
  {
    label: '신청',
    short: '브랜드명·업종·이메일',
    body: '브랜드명·업종·이메일을 넣습니다. 카드 정보는 받지 않습니다.',
  },
  {
    label: '메일 확인',
    short: '메일함의 확인 링크 클릭',
    body: '확인 링크를 누르기 전에는 아무것도 실행되지 않습니다. 가입이 아니라 본인 확인입니다. 권한 없이 남의 주소로 신청하는 것을 막습니다.',
  },
  {
    label: '리포트 수신',
    short: '영업일 1일 이내 메일 도착',
    body: '영업일 1일 이내에 메일로 보내드립니다. 계정은 만들지 않습니다.',
  },
] as const

/** 계정이 없다는 사실. 여러 화면에서 같은 문장을 써야 한다 */
export const NO_ACCOUNT_NOTE = '가입이나 로그인은 필요 없습니다. 리포트는 메일로 갑니다.'

/**
 * 폼 안에 넣는 압축판. 세 단계를 한 줄씩만 보여준다.
 *
 * ★ 번호를 붙인다. 장식이 아니라 **실제 순서**이고, 읽는 사람이 "지금
 *   어디쯤인가"를 알아야 하는 정보다. (순서가 없는 목록에는 붙이지 않는다 —
 *   랜딩의 "리포트에 들어가는 것" 벤토 네 셀이 그 예다. 같은 이유로 이 세
 *   단계는 랜딩에서도 `<ol>`로 조판된다 — `marketing/flow-steps.tsx`.)
 */
export function FlowStrip({ className }: { className?: string }) {
  return (
    <ol className={className}>
      {AUDIT_FLOW.map((step, index) => (
        <li key={step.label} className="flex items-baseline gap-2.5 text-sm">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="font-medium">{step.label}</span>
          {/* 한국어라 mono를 걸지 않는다 — 글자마다 시스템 서체로 떨어져
              한 줄 안에서 서체가 갈린다. */}
          <span className="text-muted-foreground">{step.short}</span>
        </li>
      ))}
    </ol>
  )
}
