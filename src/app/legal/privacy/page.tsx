import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BUSINESS_INFO as B } from '@/lib/business-info'

export const metadata = { title: '개인정보처리방침' }

export default function PrivacyPage() {
  return (
    <>
      <h1>개인정보처리방침</h1>
      {/* ★ 시행일을 바꿀 때는 §13의 사전 고지 기간(7일 / 불리한 변경 30일)을 지켜야 한다.
          아래 '변경 예정' 안내가 그 고지 역할을 한다 — 공지사항 페이지가 아직 없다. */}
      <p>시행일: 2026년 7월 29일</p>
      <p>
        <strong>2026년 8월 6일 변경 예정.</strong> 무료 AI 인용 진단 기능을 제공하기 위해
        &lsquo;1. 수집하는 개인정보 항목&rsquo;에 무료 진단 신청 항목을 확정하고,
        &lsquo;7. 개인정보 처리 위탁&rsquo;과 &lsquo;8. 국외 이전&rsquo;에 생성형 AI 서비스
        제공자(OpenAI, Google, Anthropic)를 추가했습니다. 이 페이지에는 변경된 내용이 미리
        게시되어 있으며, 위 시행일부터 적용됩니다. 기존 회원의 회원·세션 정보 처리 방식은
        바뀌지 않습니다.
      </p>

      <h2>1. 수집하는 개인정보 항목</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>구분</TableHead>
            <TableHead>항목</TableHead>
            <TableHead>수집 시점</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="whitespace-normal">회원</TableCell>
            <TableCell className="whitespace-normal">이메일, 이름, 비밀번호(해시)</TableCell>
            <TableCell className="whitespace-normal">회원가입 시</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">로그인 세션(자동 생성)</TableCell>
            <TableCell className="whitespace-normal">
              접속 IP, 기기·브라우저 정보, 세션 식별값(쿠키)
            </TableCell>
            <TableCell className="whitespace-normal">로그인 시</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">무료 진단</TableCell>
            <TableCell className="whitespace-normal">
              이메일, 브랜드명, 업종, 경쟁사명, 자사 웹사이트 주소, 접속 IP의 해시값
            </TableCell>
            <TableCell className="whitespace-normal">진단 신청 시</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">결제</TableCell>
            <TableCell className="whitespace-normal">
              구독 플랜, 결제수단 식별자(빌링키), 결제 이력(금액·상태·일시)
            </TableCell>
            <TableCell className="whitespace-normal">
              (아직 제공되지 않는 기능) 유료 플랜 구독 시
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p>
        <strong>무료 진단에서 접속 IP는 원문을 저장하지 않습니다.</strong> 같은 사람이 하루에
        수십 건을 신청해 측정 비용을 소진시키는 것을 막기 위해 접속 IP의 단방향 해시값만
        저장하며, 해시값에서 원문 IP를 되돌릴 수 없습니다.
      </p>
      <p>
        진단 항목 중 일부는 결과를 만들기 위해 아래 &lsquo;8. 국외 이전&rsquo;에 적힌 생성형 AI
        서비스로 전송됩니다. 전송 범위는 항목마다 다릅니다.
      </p>
      <ul>
        <li>
          <strong>이메일 주소와 자사 웹사이트 주소는 어느 AI 서비스에도 전송되지 않습니다.</strong>{' '}
          이메일은 인증과 리포트 발송에만, 웹사이트 주소는 회사 서버 내부의 인용 출처 대조에만
          씁니다.
        </li>
        <li>
          답변을 수집하는 AI 서비스(OpenAI·Google)에는 <strong>브랜드명과 경쟁사명을 전송하지
          않습니다.</strong> 회사가 재는 것은 &ldquo;브랜드를 언급하지 않은 일반 소비자 질문에
          AI가 그 브랜드를 스스로 꺼내는가&rdquo;이므로, 브랜드명을 질문에 넣으면 측정 자체가
          성립하지 않습니다. 전송되는 것은 업종별로 미리 정해 둔 일반 질문뿐입니다. 다만 회사가
          준비한 업종 목록에 없는 업종을 직접 입력한 경우, 그 입력값은 질문 문장에 포함되어
          전송됩니다.
        </li>
        <li>
          언급 판정을 맡는 AI 서비스(Anthropic)에는 브랜드명·별칭·경쟁사명과 위에서 수집된 답변
          원문이 전송됩니다. 답변 원문은 회사가 작성한 것이 아니어서 어떤 내용이 포함될지 미리
          알 수 없습니다.
        </li>
      </ul>
      <p>
        이용자는 개인을 식별할 수 있는 정보를 브랜드명·업종·경쟁사명 등 입력란에 넣지 않아야
        합니다.
      </p>
      <p>
        <strong>유료 결제는 아직 제공되지 않는 기능입니다.</strong> 결제 항목은 해당 기능이
        실제로 열리는 시점부터 수집을 시작하며, 그 전까지는 수집하지 않습니다. 유료 결제가
        시작되면 카드번호·유효기간·CVC 등 결제 정보 원문은 회사 서버에 저장하지 않고,
        결제대행사가 발급한 빌링키만 보관할 예정입니다.
      </p>
      <p>
        <strong>로그인 세션 정보는 지금 실제로 수집됩니다.</strong> 이용자가 로그인하면 접속
        IP와 브라우저 정보가 원문 그대로 세션 정보에 함께 기록됩니다. 이는 계정 탈취 탐지와
        이상 접속 확인을 위한 것이며, 세션 유효기간은 최대 30일이고 서비스를 계속 이용하면
        만료 시점이 하루 단위로 갱신됩니다. 세션이 만료된 뒤 같은 세션으로 다시 접속하면 그
        시점에 자동으로 삭제되며, 만료 후 다시 접속하지 않는 세션도 하루 1회 자동으로
        실행되는 정리 작업이 찾아내어 일괄 삭제합니다.
      </p>

      <h2>2. 개인정보의 이용 목적</h2>
      <ul>
        <li>회원 식별 및 서비스 제공</li>
        <li>이메일 주소 인증(본인확인) — 회원가입 시 인증 메일을 발송합니다</li>
        <li>로그인 세션 관리, 계정 탈취 탐지 및 이상 접속 확인</li>
        <li>
          약관·방침 변경 등 서비스 공지 발송 (공지 발송 기능은 아직 제공되지 않습니다. 현재
          회사가 발송하는 메일은 회원가입 시의 이메일 인증 메일, 무료 진단 신청 시의 이메일
          인증 메일, 무료 진단 결과 리포트뿐이며, 공지가 필요한 시점부터 이 목적으로 이용을
          시작합니다.)
        </li>
        <li>
          유료 서비스 결제, 정산 및 세금계산서 발행, 측정 완료 알림, 결제·구독 관련 안내,
          전자상거래법 등 관계 법령에 따른 거래 기록 보존 의무 이행 (아직 제공되지 않는
          기능입니다. 유료 결제·측정 기능이 실제로 열리는 시점부터 이 목적으로 수집을
          시작합니다.)
        </li>
        <li>
          무료 진단 신청자의 이메일 주소 인증 — 신청 시 인증 메일을 발송하며, 인증된 신청에
          대해서만 진단을 실행합니다
        </li>
        <li>무료 진단 결과 리포트 작성 및 이메일 발송</li>
        <li>무료 진단 남용 방지 및 부정 이용 대응(접속 IP 해시값 기준의 신청 건수 제한)</li>
      </ul>

      <h2>3. 보유 및 이용 기간</h2>
      <ul>
        <li>
          회원 정보: 회원 탈퇴 시 개인을 식별할 수 없도록 지체 없이 익명화합니다. 다만 결제
          이력이 있는 경우 결제 관련 기록은 아래 &lsquo;결제 기록&rsquo;과 동일하게 5년간 별도
          보관합니다.
        </li>
        <li>
          로그인 세션 정보(접속 IP, 브라우저 정보): 세션 유효기간인 최대 30일. 서비스를 계속
          이용하면 만료 시점이 하루 단위로 갱신됩니다. 만료된 세션은 같은 세션으로 다시
          접속하는 시점에 삭제되며, 접속이 없더라도 하루 1회 자동으로 실행되는 정리 작업이
          만료된 세션을 일괄 삭제합니다.
        </li>
        <li>결제 기록: 전자상거래법에 따라 5년 (유료 결제 기능 도입 후 발생하는 기록부터)</li>
        <li>
          서비스 운영 로그: 회사가 별도 데이터베이스에 저장하지 않으며, 호스팅
          사업자(Vercel)와 오류 모니터링 도구(Sentry)의 표준 보존 정책을 따릅니다.
        </li>
        <li>
          무료 진단 기록(이메일, 브랜드명, 업종, 경쟁사명, 자사 웹사이트 주소, 결과 리포트):
          수집일로부터 1년. 다만 회원으로 가입한 경우 해당 기록은 회원 정보의 보유 기간을
          따릅니다.
        </li>
        <li>
          무료 진단 신청 IP의 해시값: 수집일로부터 1년(진단 기록과 같은 행에 보관되어 함께
          삭제됩니다). 남용 방지 판단에 실제로 쓰이는 기간은 최근 24시간이며, 그 이후에는
          조회되지 않습니다.
        </li>
      </ul>
      <p>
        위 기간은 회사가 보관을 약속하는 상한입니다. 로그인 세션 정보는 위와 같이 하루 1회
        자동 삭제 작업으로 보유기간이 집행됩니다. 회원 정보(탈퇴 시 익명화)와 결제 기록 등
        나머지 항목은 아직 자동 집행 시스템이 없어 현재는 수동 절차로 이행하며, 자동화는
        해당 기능이 열리는 시점에 맞춰 순차적으로 구축합니다.
      </p>

      <h2>4. 파기 절차 및 방법</h2>
      <p>
        회사는 개인정보의 보유기간이 경과하거나 처리 목적이 달성되는 등 개인정보가 불필요하게
        된 경우, 지체 없이 해당 개인정보를 파기합니다.
      </p>
      <p>
        회사는 개인정보를 전자적 파일 형태로만 보관하며, 별도의 종이 문서로 보관하지 않습니다.
        전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법으로 삭제합니다.
      </p>

      <h2>5. 개인정보의 안전성 확보 조치</h2>
      <p>회사는 개인정보 보호를 위해 다음과 같은 조치를 취하고 있습니다.</p>
      <ul>
        <li>비밀번호는 원문이 아니라 해시값으로 저장합니다.</li>
        <li>
          배포 환경에서는 HTTPS로만 서비스하며, 평문(http://) URL 설정은 부팅 단계에서
          차단됩니다.
        </li>
        <li>
          로그인 세션 쿠키에는 HttpOnly·SameSite 속성을 적용하고, 배포된 서비스에서는 Secure
          속성을 강제해 쿠키가 스크립트나 비암호화 연결로 노출되지 않도록 합니다.
        </li>
        <li>
          오류 모니터링 도구(Sentry)로 전송되는 정보에서 이메일·접속 IP 등 식별정보가 자동으로
          포함되지 않도록 설정하고, 오류 메시지에 섞여 들어올 수 있는 비밀정보도 전송 전에
          제거합니다.
        </li>
        <li>
          개인정보처리시스템에 대한 접근 권한은 업무상 필요한 최소한의 인원으로 제한합니다
          (2026년 7월 현재 회사는 1인이 운영하고 있습니다).
        </li>
      </ul>

      <h2>6. 개인정보의 제3자 제공</h2>
      <p>
        회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 사전에 동의한
        경우, 법령에 특별한 규정이 있는 경우, 또는 수사기관이 법령에서 정한 절차와 방법에 따라
        요청하는 경우에는 예외로 합니다.
      </p>
      <p>
        아래 &lsquo;7. 개인정보 처리 위탁&rsquo;에 명시된 수탁자는 회사의 지시와 통제 아래
        업무를 대행할 뿐이므로 제3자 제공에 해당하지 않습니다.
      </p>

      <h2>7. 개인정보 처리 위탁</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>수탁자</TableHead>
            <TableHead>위탁 업무</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="whitespace-normal">{B.hostingProvider}</TableCell>
            <TableCell className="whitespace-normal">서비스 호스팅</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Neon Inc.</TableCell>
            <TableCell className="whitespace-normal">데이터베이스 운영</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Resend Inc.</TableCell>
            <TableCell className="whitespace-normal">
              이메일 발송 (회원가입 이메일 인증, 무료 진단 이메일 인증, 무료 진단 결과 리포트)
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Sentry(Functional Software, Inc.)</TableCell>
            <TableCell className="whitespace-normal">
              오류 모니터링 (오류 모니터링 연동을 활성화한 경우에 한합니다)
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">OpenAI, L.L.C.</TableCell>
            <TableCell className="whitespace-normal">
              생성형 AI 답변 수집(ChatGPT) — 일반 소비자 질문을 보내고 그 답변을 받습니다.
              브랜드명·경쟁사명·이메일은 전송되지 않습니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Google LLC</TableCell>
            <TableCell className="whitespace-normal">
              생성형 AI 답변 수집(Gemini) — 일반 소비자 질문을 보내고 그 답변을 받습니다.
              브랜드명·경쟁사명·이메일은 전송되지 않습니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Anthropic PBC</TableCell>
            <TableCell className="whitespace-normal">
              수집된 답변의 브랜드 언급 판정(동명이의 구분 등) 및 브랜드 표기 별칭 생성 —
              브랜드명·별칭·경쟁사명과 답변 원문이 전송됩니다. 이메일은 전송되지 않습니다.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p>
        회사는 위탁계약 체결 시 개인정보보호법에 따라 수탁자가 개인정보를 안전하게 처리하도록
        관리·감독합니다. 위 목록은 현재 실제로 서비스를 호출·연동하고 있는 수탁자만 담고
        있습니다. 다만 Sentry는 오류 모니터링 연동을 활성화한 경우에만 실제로 전송이
        이루어지며, 연동을 활성화하지 않은 기간에는 아무 정보도 전송되지 않습니다. 회사는 이
        연동을 언제든 켜고 끌 수 있으므로 활성화 여부와 무관하게 미리 고지합니다.
      </p>
      <p>
        위 세 곳에 대한 위탁 범위는 서로 다릅니다. <strong>OpenAI와 Google에는 브랜드명·경쟁사명·
        이메일 주소를 전송하지 않으며</strong>, 업종별로 미리 정해 둔 일반 소비자 질문만
        전송합니다(회사가 준비한 업종 목록에 없는 업종을 직접 입력한 경우 그 입력값은 질문
        문장에 포함됩니다). <strong>Anthropic에는</strong> 판정을 위해 브랜드명·별칭·경쟁사명과
        수집된 답변 원문을 전송하며, 이메일 주소는 전송하지 않습니다. 답변 원문은 회사가 작성한
        것이 아니어서 어떤 내용이 포함될지 미리 알 수 없습니다. 회사는 위 세 곳 모두 이용자
        데이터를 모델 학습에 사용하지 않는 API 경로만 사용합니다.
      </p>
      <p>
        결제대행사, 네이버 AI 브리핑·Google AI 개요 등 검색 결과 수집에 사용할 API 제공자 등
        아직 제공되지 않는 기능에 필요한 처리위탁은 위 목록에 포함되어 있지 않으며, 해당 기능이
        실제로 제공되기 시작하는 시점에 이 표를 갱신하고 &lsquo;13. 방침의 변경&rsquo;에 따라
        고지합니다.
      </p>

      <h2>8. 국외 이전</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이전받는 자</TableHead>
            <TableHead>이전 국가</TableHead>
            <TableHead>이전 항목</TableHead>
            <TableHead>이전 목적</TableHead>
            <TableHead>보유·이용 기간</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="whitespace-normal">{B.hostingProvider}</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">서비스 이용 데이터 전반</TableCell>
            <TableCell className="whitespace-normal">서비스 호스팅</TableCell>
            <TableCell className="whitespace-normal">
              위탁계약 종료 시까지. 요청·실행 로그는 {B.hostingProvider}의 표준 로그 보존
              정책에 따라 그보다 짧은 기간만 보관된 후 삭제됩니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Neon Inc.</TableCell>
            {/* Neon은 미국 법인이지만 법 제28조의8 제2항이 요구하는 것은
                "이전되는 국가" = 데이터가 실제로 저장되는 곳이다. 이 서비스의
                DB는 AWS ap-southeast-1(싱가포르) 리전에 있다 — DATABASE_URL의
                호스트로 확인함. 리전을 옮기면 이 칸도 같이 고칠 것. */}
            <TableCell className="whitespace-normal">싱가포르</TableCell>
            <TableCell className="whitespace-normal">
              회원·브랜드·구독 정보 등 서비스 데이터베이스 전체
            </TableCell>
            <TableCell className="whitespace-normal">데이터베이스 운영</TableCell>
            <TableCell className="whitespace-normal">
              위탁계약 종료 시까지. 회사가 데이터베이스에서 삭제한 정보는 Neon의 표준
              백업·시점 복구 보존 기간이 지나면 백업에서도 삭제됩니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Resend Inc.</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">이메일 주소, 발송 콘텐츠</TableCell>
            <TableCell className="whitespace-normal">
              이메일 인증 및 무료 진단 결과 리포트 발송
            </TableCell>
            <TableCell className="whitespace-normal">
              Resend의 표준 데이터 보존 정책에 따라 발송 기록이 30일간 보관된 후 삭제됩니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Sentry(Functional Software, Inc.)</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">
              오류 발생 시 기술 로그(이메일·IP 등 식별정보는 전송 전 자동 제거)
            </TableCell>
            <TableCell className="whitespace-normal">
              오류 모니터링 (연동을 활성화한 경우에 한합니다)
            </TableCell>
            <TableCell className="whitespace-normal">
              Sentry의 표준 이벤트 보존 정책에 따라 보관된 후 삭제됩니다.
            </TableCell>
          </TableRow>
          {/* ★ 아래 세 곳은 무료 진단 실행 시에만 전송된다. 이전 항목에 이메일이
              없다는 점이 중요하다 — 실제로 보내지 않으므로 보낸다고 적으면 안 되고,
              나중에 보내게 되면 이 표를 먼저 고쳐야 한다. */}
          <TableRow>
            <TableCell className="whitespace-normal">OpenAI, L.L.C.</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">
              업종별 일반 소비자 질문. 목록에 없는 업종을 직접 입력한 경우 그 입력값이 질문에
              포함됩니다. 브랜드명·경쟁사명·이메일 주소는 이전하지 않습니다.
            </TableCell>
            <TableCell className="whitespace-normal">
              생성형 AI 답변 수집 (무료 진단 실행 시)
            </TableCell>
            <TableCell className="whitespace-normal">
              OpenAI의 표준 API 데이터 보존 정책에 따라 남용 모니터링 목적으로 보관된 후
              삭제됩니다. 모델 학습에는 이용되지 않습니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Google LLC</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">
              업종별 일반 소비자 질문. 목록에 없는 업종을 직접 입력한 경우 그 입력값이 질문에
              포함됩니다. 브랜드명·경쟁사명·이메일 주소는 이전하지 않습니다.
            </TableCell>
            <TableCell className="whitespace-normal">
              생성형 AI 답변 수집 (무료 진단 실행 시)
            </TableCell>
            <TableCell className="whitespace-normal">
              Google의 유료 API 데이터 처리 정책에 따라 보관된 후 삭제됩니다. 모델 학습에는
              이용되지 않습니다.
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Anthropic PBC</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">
              브랜드명, 브랜드 표기 별칭, 경쟁사명, 위 AI 서비스가 생성한 답변 원문. 이메일
              주소는 이전하지 않습니다.
            </TableCell>
            <TableCell className="whitespace-normal">
              답변의 브랜드 언급 판정 및 별칭 생성 (무료 진단 실행 시)
            </TableCell>
            <TableCell className="whitespace-normal">
              Anthropic의 표준 API 데이터 보존 정책에 따라 보관된 후 삭제됩니다. 모델 학습에는
              이용되지 않습니다.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p>
        위 이전은 모두 이용자가 서비스를 이용하거나 회사가 오류를 감지하는 시점, 또는 신청한
        무료 진단을 회사가 실행하는 시점에 네트워크를 통해 즉시 전송되는 방식으로 이루어집니다.
        이용자는 개인정보의 국외 이전을 거부할 권리가 있습니다. 다만 위 이전은 서비스
        제공(호스팅, 데이터베이스 운영, 이메일 발송, 생성형 AI 답변 수집·판정)에 필수적인
        처리이므로, 거부할 경우 서비스 이용이 제한되거나 불가능할 수 있습니다. 거부 의사는{' '}
        {B.email}로 알려주시기 바랍니다.
      </p>
      <p>
        이용자는 개인을 식별할 수 있는 정보를 브랜드명·업종·경쟁사명 등 진단 입력란에 넣지
        않아야 합니다. 유료 정기 측정과 네이버 AI 브리핑·Google AI 개요 수집은 아직 제공되지
        않는 기능이며, 그 기능에 새로 필요해지는 이전받는 자는 위 표에 없습니다. 해당 기능이
        실제로 제공되기 시작하는 시점에 이 표를 갱신하고 &lsquo;13. 방침의 변경&rsquo;에 따라
        고지합니다.
      </p>

      <h2>9. 자동 수집 장치(쿠키)의 설치·운영 및 거부</h2>
      <p>
        회사는 로그인 세션을 유지하기 위해 쿠키를 사용합니다. 이 쿠키는 최대 30일간(서비스를
        계속 이용하면 하루 단위로 갱신) 유지되는 쿠키로, 브라우저를 종료해도 만료 전까지는
        로그인 상태가 유지될 수 있습니다. 이용자를 식별할 수 있는 별도의 광고·추적 쿠키는
        사용하지 않습니다.
      </p>
      <p>
        이용자는 웹브라우저의 설정에서 쿠키 저장을 거부하거나 저장된 쿠키를 삭제할 수 있습니다.
        다만 로그인 세션 쿠키는 서비스 이용에 필수적이므로, 쿠키 저장을 거부할 경우 로그인이
        되지 않아 회원 전용 기능을 이용할 수 없습니다.
      </p>

      <h2>10. 이용자의 권리</h2>
      <p>
        이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.
        요청은 {B.email}로 접수하며, 회사는 관계 법령이 정한 기간 내에 조치하고 그 결과를
        알려드립니다. 계정 설정 화면에서 직접 열람·수정할 수 있는 기능은 순차적으로 제공될
        예정이며, 그 전까지는 위 연락처를 통해 요청해 주시기 바랍니다.
      </p>
      <p>
        회원 탈퇴를 원하는 경우에도 {B.email}로 요청합니다. 현재는 별도의 탈퇴 기능(버튼·API)
        없이 회사가 요청을 확인한 뒤 수동으로 처리하며, 요청을 받으면 지체 없이 처리합니다.
        탈퇴가 처리되면 위 &lsquo;3. 보유 및 이용 기간&rsquo;에 따라 개인정보가 익명화됩니다.
      </p>

      <h2>11. 개인정보 보호책임자</h2>
      <p>
        성명: {B.privacyOfficer || '사업자 등록 완료 후 지정 예정'}
        <br />
        직책: 대표 (부서 없음 — 2026년 7월 현재 1인이 운영하고 있어 별도 부서를 두지
        않습니다)
        <br />
        연락처: {B.email}
        {B.phone ? (
          <>
            <br />
            전화: {B.phone}
          </>
        ) : null}
      </p>
      <p>
        개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 연락처로 문의하실
        수 있습니다.
      </p>

      <h2>12. 권익침해 구제방법</h2>
      <p>
        개인정보 침해로 인한 신고나 상담이 필요한 경우 아래 기관에 문의할 수 있습니다.
        연락처·접수 방법은 각 기관의 홈페이지에서 최신 정보를 확인해 주시기 바랍니다.
      </p>
      <ul>
        <li>개인정보분쟁조정위원회 (국번없이 1833-6972, kopico.go.kr)</li>
        <li>개인정보침해신고센터 (국번없이 118, privacy.kisa.or.kr)</li>
        <li>대검찰청 (국번없이 1301, spo.go.kr)</li>
        <li>경찰청 사이버범죄 신고시스템 (국번없이 182, ecrm.police.go.kr)</li>
      </ul>

      <h2>13. 방침의 변경 및 이전 버전 열람</h2>
      <p>
        이 방침이 변경되는 경우 시행일 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스 내
        공지사항을 통해 고지합니다. 방침이 개정되면 이 페이지에는 항상 최신 버전만 게시되며,
        직전 버전의 전문은 새 시행일로부터 1년간 {B.email}로 요청하시면 제공해 드립니다.
      </p>
    </>
  )
}
