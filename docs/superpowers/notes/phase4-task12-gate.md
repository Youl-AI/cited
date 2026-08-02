# 4단계 Task 12 — 수동 게이트 체크리스트

> 2026-08-03 병합(`f9b080f`) 시점 작성. Task 0~11 완료·최종 리뷰 READY.
> Task 12는 실측 1회(~2,400원)가 들어 운영자 요청 시 별도 진행한다.
> 이 파일은 워크트리 장부(.superpowers/sdd/progress.md)에서 살려낸 인계 사항이다.

## 사전 조건

- [x] GitHub 저장소 Actions 시크릿 `CRON_SECRET` 등록 (2026-08-03 완료, Vercel 환경변수와 동일 값)
- [ ] Anthropic 크레딧 충전 (실측 1회 ~2,400원 + E2E 중 질의 생성 소액)
- [ ] Vercel 배포가 `f9b080f` 이후 커밋인지 확인

## E2E + 실측 루프 (계획서 Task 12 본문 참조)

- [ ] seed 스크립트로 테스트 계정 준비 → `pnpm plan:grant`
- [ ] 온보딩 완주 (브랜드 → 질의 에디터 → 동결) — LLM 인터셉트 E2E + 실계정 1회
- [ ] `workflow_dispatch` 수동 실행으로 첫 실측 1회 (Actions 스케줄은 기본 브랜치에서만 돔)
  - 비측정일이면 `force` 입력 체크 필요 (`?force=1` — 서버 월·수·금 게이트 우회, 추가 과금 주의)
- [ ] 대시보드에 점 1개 찍히는지 확인 (헤드라인·추이·히트맵·회차 목록)
- [ ] 측정 실패 시나리오: 운영자 메일 수신 확인

## 브라우저 전용 디자인 확인 (Task 11에서 이관 — dev DB가 없어 jsdom으로 대체했던 항목)

- [ ] 375px 폭: 추이·SoV x축 라벨 겹침 (SoV는 라벨이 이번에 처음 생김 — 위험 높음), 히트맵 가로 스크롤
- [ ] 히트맵 `color-mix` 실제 대비, P≥50 글자색 플립 경계 시각 확인
- [ ] OS "동작 줄이기" 켜고 전환 애니메이션 소거 확인 (§5)
- [ ] gemini/google 마커 판독성 (색 휘도 거의 같음 — 모양으로 구분되는지)
- [ ] 한글 keep-all 줄바꿈 품질 (온보딩·대시보드 전 화면)
- [ ] 온보딩 1~3단계 아이브로 조판·오류 문구 위치·에디터 mono 카운터

## 알려진 이연·백로그 (병합 시점 확정분)

- `result-view.tsx:309` 경쟁사 배지 `text-incomplete-fg` — **의도적 이연**: ResultView는 동결된 유료 리포트/PDF와 공유. 리포트·대시보드가 같이 뒤집히는 리트로핏 때 수정
- shadcn 프리미티브(button/badge/tabs) `transition-all` + 기본 이징 — §5 위반이나 공유 컴포넌트 경유. 리트로핏 백로그
- 브랜드 폼: 멀티도메인 입력 없음(프리필이 `selfDomains[0]`만) · 경쟁사 한도 초과분 조용히 절단(SoV 우호 방향) — 폼 개선 때 함께
- `points` 페이로드 무상한 (Business `historyMonths: null` — 주 3회 × 1년 ≈ 156 스냅샷/브랜드). 1년 내 상한 또는 페이지네이션
- 게이트가 페이지당 neon-http 3~4왕복 — 성능 백로그
- 디자인 grep 배터리에 raw-palette·이징 누락 패턴 없음 — 다음 디자인 작업 때 보강
- `judgeChange`가 n=0 표본에도 `incomparable` 반환 — 일반화 문장이 그 경우 부정확 (기존 결함)
- audit-templates.test.ts:160 주석 "15분 간격" (단언 아님)

## 구조적 미해결 (결제 도입 때 닫음)

- `currentPeriodEnd` null — 수동 청구 미납을 시스템이 모름. cron은 `status IN ('active','past_due')`로 계속 측정하며 원가만 태움. Toss 도입 때 만료 개념과 함께
- 동시 동결 quota 창 (두 브랜드가 각자 `queriesOnOtherBrands=0`을 읽는 레이스) — 스키마 변경 필요
- `--from-audit` 같은 진단을 두 구독이 물 수 있음 (운영자 CLI 전용이라 경미)
