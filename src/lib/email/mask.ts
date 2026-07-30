/**
 * 이메일 주소 마스킹. 순수 함수 하나만 있는 모듈이다.
 *
 * ★ `./send`가 아니라 별도 파일에 두는 이유: `./templates`도 이 함수를 쓴다
 *   (운영자 알림에 신청자 주소를 마스킹해 넣는다). `./send`에서 import하면
 *   순수 모듈인 templates가 Resend SDK와 `@/lib/env`(server-only)를 끌고 오게
 *   되고, "템플릿은 네트워크를 타지 않는다"는 성질이 조용히 깨진다.
 *
 *   `./send`는 하위 호환을 위해 이 함수를 그대로 re-export한다.
 */

/** 로그·에러 문자열에서 이메일 주소를 마스킹한다. `reader@example.com` → `r***@e***.com` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const tld = dot >= 0 ? domain.slice(dot) : ''
  return `${local[0] ?? ''}***@${domain[0] ?? ''}***${tld}`
}
