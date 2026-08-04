# 자체 호스팅 서체

## SUIT-Variable.woff2

앱 본문·제목 서체. `src/app/layout.tsx`가 `next/font/local`로 싣고 `--font-suit`로
노출한다(`globals.css`의 `--font-sans` 체인 맨 앞).

| 항목 | 값 |
| --- | --- |
| 서체 | SUIT Variable (가변, weight 100–900) |
| 버전 | **2.0.5** |
| 정본 저장소 | [`sun-typeface/SUIT`](https://github.com/sun-typeface/SUIT) |
| 다운로드 URL | `https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2.0.5/fonts/variable/woff2/SUIT-Variable.woff2` |
| 크기 | 624,536 B (610 KiB) |
| sha256 | `aa894a204d5a6fbae259dac6868d350cbd373a390caee0313f92946af741df23` |
| git blob sha1 | `89d7e4c28fe8069a8110a79dc7ca3cd446745de9` |
| 라이선스 | **SIL Open Font License 1.1** — 원문 `./OFL.txt` |

라이선스 요지: 자체 호스팅·웹 임베드는 자유, 판매 금지 아님(서체 자체를 파는 것만
금지), **저작권 고지 유지 필요** — 그래서 `OFL.txt`를 저장소에 함께 둔다.
예약 서체명(Reserved Font Name)은 "SUIT"이므로 파일을 수정(서브셋 포함)해서
재배포할 일이 생기면 이름을 바꿔야 한다. 내부 서브셋 후 자체 호스팅만 하는 것은
재배포가 아니라 문제없다.

### ⚠ 재다운로드 시 주의 — `sunn-us/SUIT`를 쓰지 말 것

리뉴얼 계획서 초안은 `sunn-us/SUIT@latest`를 가리켰다. 2026-08-03 실측 기준
**그 저장소의 기본 브랜치는 비워져 있고, 남아 있는 `fonts/static/woff2/SUIT.css`
(93 B)는 외부 추적 픽셀을 부른다**:

```css
body { background-image: url("https://sunnamemicrosystems.free.beeceptor.com/pixel.png"); }
```

지금 커밋된 woff2는 그 브랜치가 아니라 `2.0.5` 브랜치에서 내려왔고(jsDelivr 응답의
`x-jsd-version: 2.0.5`), 정본 `sun-typeface/SUIT`의 파일과 **바이트 동일**임을
위 sha256·blob sha로 대조해 확인했다. 즉 커밋된 파일 자체는 깨끗하다. 다만
`sunn-us/SUIT@latest`는 언제든 다른 것을 내려줄 수 있는 경로이므로,
**앞으로는 태그 고정한 `sun-typeface/SUIT@2.0.5`만 쓴다.**

### 무결성 재검증

```bash
sha256sum src/app/fonts/SUIT-Variable.woff2
# aa894a204d5a6fbae259dac6868d350cbd373a390caee0313f92946af741df23

git hash-object src/app/fonts/SUIT-Variable.woff2
# 89d7e4c28fe8069a8110a79dc7ca3cd446745de9
#   ← GitHub API가 보고하는 sun-typeface/SUIT의 해당 blob sha와 같은 값
```

610 KiB는 정상 크기다. woff2 헤더의 `length` 필드(`0x00098798` = 624,536)가 실제
파일 크기와 일치하고, 압축 해제 시 `totalSfntSize`는 1,412,980 B다.

### 왜 CDN 링크가 아니라 저장소에 두는가

런타임에 서드파티 CDN을 타지 않기 위해서다. next/font가 빌드 때 우리 도메인의
`/_next/static/media/`로 해시명과 함께 복사하고 `@font-face`를 발행하므로, 사용자
브라우저는 jsDelivr에 접속하지 않는다(추적·가용성·CSP 모두 우리 통제 안에 남는다).
