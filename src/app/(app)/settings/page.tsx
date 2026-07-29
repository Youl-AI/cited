import { requireUser } from '@/lib/session'

export const metadata = { title: '설정' }

// 머리글의 "설정" 링크가 가리키는 곳. 내용은 5단계에서 채운다.
// 지금 비어 있어도 스텁이 필요한 이유: 라우트가 없으면 루트 not-found가
// 라우트 그룹 **바깥에서** 렌더링돼 머리글·내비·워드마크가 통째로 사라진다.
// 로그인한 사용자가 링크 하나 눌렀다가 셸을 잃고 뒤로가기 말고는 돌아올
// 길이 없어지는 것보다, "준비 중" 한 줄이 정직하고 안전하다.
//
// ★ requireUser()는 (app)/layout.tsx에도 있지만 여기서 다시 부른다.
//   레이아웃은 소프트 내비게이션에서 재실행되지 않는다 — 자세한 이유는
//   (app)/layout.tsx 주석 참고.
export default async function SettingsPage() {
  await requireUser()
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">설정</h1>
      <p className="text-muted-foreground">준비 중입니다.</p>
    </div>
  )
}
