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
      <p>시행일: 2026년 7월 29일</p>

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
              브랜드명, 업종, 이메일, 접속 IP의 해시값
            </TableCell>
            <TableCell className="whitespace-normal">
              (아직 제공되지 않는 기능) 진단 요청 및 결과 열람 시
            </TableCell>
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
        <strong>무료 진단과 유료 결제는 아직 제공되지 않는 기능입니다.</strong> 위 두 항목은
        해당 기능이 실제로 열리는 시점부터 수집을 시작하며, 그 전까지는 수집하지 않습니다.
        무료 진단이 시작되면 접속 IP는 원문이 아니라 남용 방지 목적의 단방향 해시값으로만
        수집할 예정입니다(해시값에서 원문을 되돌릴 수 없습니다). 유료 결제가 시작되면
        카드번호·유효기간·CVC 등 결제 정보 원문은 회사 서버에 저장하지 않고, 결제대행사가
        발급한 빌링키만 보관할 예정입니다.
      </p>
      <p>
        <strong>로그인 세션 정보는 지금 실제로 수집됩니다.</strong> 이용자가 로그인하면 접속
        IP와 브라우저 정보가 원문 그대로 세션 정보에 함께 기록됩니다. 이는 계정 탈취 탐지와
        이상 접속 확인을 위한 것이며, 세션 유효기간은 최대 30일이고 서비스를 계속 이용하면
        만료 시점이 하루 단위로 갱신됩니다. 세션이 만료된 뒤 같은 세션으로 다시 접속하면 그
        시점에 자동으로 삭제됩니다. 다만 만료 이후 다시 접속하지 않는 세션은 이 삭제를
        일으킬 다음 접속 자체가 없어 삭제되지 않고 데이터베이스에 남을 수 있으며, 접속 없는
        만료 세션을 찾아 일괄 삭제하는 절차는 아직 구축되어 있지 않습니다.
      </p>

      <h2>2. 개인정보의 이용 목적</h2>
      <ul>
        <li>회원 식별 및 서비스 제공</li>
        <li>로그인 세션 관리, 계정 탈취 탐지 및 이상 접속 확인</li>
        <li>서비스 공지 발송</li>
        <li>
          유료 서비스 결제, 정산 및 세금계산서 발행, 측정 완료 알림, 결제·구독 관련 안내,
          전자상거래법 등 관계 법령에 따른 거래 기록 보존 의무 이행 (아직 제공되지 않는
          기능입니다. 유료 결제·측정 기능이 실제로 열리는 시점부터 이 목적으로 수집을
          시작합니다.)
        </li>
        <li>
          무료 진단 남용 방지 및 부정 이용 대응 (아직 제공되지 않는 기능입니다. 무료 진단
          기능이 실제로 열리는 시점부터 이 목적으로 수집을 시작합니다.)
        </li>
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
          이용하면 만료 시점이 하루 단위로 갱신됩니다. 세션이 만료된 뒤 같은 세션으로 다시
          접속하면 그 시점에 삭제됩니다. 다만 접속이 없는 채로 만료된 세션은 삭제를 일으킬
          다음 접속 자체가 없어 삭제되지 않고 남을 수 있으며, 접속 없는 만료 세션을 찾아
          일괄 삭제하는 절차는 아직 없습니다.
        </li>
        <li>결제 기록: 전자상거래법에 따라 5년 (유료 결제 기능 도입 후 발생하는 기록부터)</li>
        <li>
          서비스 운영 로그: 회사가 별도 데이터베이스에 저장하지 않으며, 호스팅
          사업자(Vercel)와 오류 모니터링 도구(Sentry)의 표준 보존 정책을 따릅니다.
        </li>
        <li>
          무료 진단 기록: 수집일로부터 1년 (무료 진단 기능 도입 후 발생하는 기록부터). 다만
          회원으로 가입한 경우 해당 기록은 회원 정보의 보유 기간을 따릅니다.
        </li>
      </ul>
      <p>
        위 기간은 회사가 보관을 약속하는 상한이며, 현재는 수동 절차로 이행합니다. 보유기간을
        자동으로 집행하는 시스템은 아직 구축되어 있지 않습니다.
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
            <TableCell className="whitespace-normal">인증·알림 이메일 발송</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Sentry(Functional Software, Inc.)</TableCell>
            <TableCell className="whitespace-normal">오류 모니터링</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p>
        회사는 위탁계약 체결 시 개인정보보호법에 따라 수탁자가 개인정보를 안전하게 처리하도록
        관리·감독합니다. 위 목록은 현재 실제로 서비스를 호출·연동하고 있는 수탁자만 담고
        있습니다. 결제대행사, 측정에 사용하는 AI·검색 API 제공자 등 아직 제공되지 않는 기능에
        필요한 처리위탁은 위 목록에 포함되어 있지 않으며, 해당 기능이 실제로 제공되기 시작하는
        시점에 이 표를 갱신하고 &lsquo;13. 방침의 변경&rsquo;에 따라 고지합니다.
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
            <TableCell className="whitespace-normal">위탁계약 종료 시까지</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Neon Inc.</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">
              회원·브랜드·구독 정보 등 서비스 데이터베이스 전체
            </TableCell>
            <TableCell className="whitespace-normal">데이터베이스 운영</TableCell>
            <TableCell className="whitespace-normal">위탁계약 종료 시까지</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Resend Inc.</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">이메일 주소, 발송 콘텐츠</TableCell>
            <TableCell className="whitespace-normal">인증·알림 이메일 발송</TableCell>
            <TableCell className="whitespace-normal">발송 완료 후 지체 없이 파기</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">Sentry(Functional Software, Inc.)</TableCell>
            <TableCell className="whitespace-normal">미국</TableCell>
            <TableCell className="whitespace-normal">
              오류 발생 시 기술 로그(이메일·IP 등 식별정보는 전송 전 자동 제거)
            </TableCell>
            <TableCell className="whitespace-normal">오류 모니터링</TableCell>
            <TableCell className="whitespace-normal">위탁계약 종료 시까지</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p>
        위 이전은 모두 이용자가 서비스를 이용하거나 회사가 오류를 감지하는 시점에 네트워크를
        통해 즉시 전송되는 방식으로 이루어집니다. 이용자는 개인정보의 국외 이전을 거부할 권리가
        있습니다. 다만 위 이전은 서비스 제공(호스팅, 데이터베이스 운영, 이메일 발송)에 필수적인
        처리이므로, 거부할 경우 서비스 이용이 제한되거나 불가능할 수 있습니다. 거부 의사는{' '}
        {B.email}로 알려주시기 바랍니다.
      </p>
      <p>
        측정 기능이 도입되면 이용자가 등록한 브랜드명과 질의문이 AI·검색 API 제공자에게
        전송됩니다. 이용자는 개인을 식별할 수 있는 정보를 브랜드명이나 질의문에 입력하지
        않아야 하며, 회사는 해당 기능 도입 시 이 항을 갱신하여 이전받는 자와 이전 국가를
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
        <li>경찰청 사이버범죄 신고시스템 (182, ecrm.police.go.kr)</li>
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
