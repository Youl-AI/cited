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
            <TableCell className="whitespace-normal">무료 진단</TableCell>
            <TableCell className="whitespace-normal">
              브랜드명, 업종, 이메일, 접속 IP의 해시값
            </TableCell>
            <TableCell className="whitespace-normal">진단 요청 및 결과 열람 시</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">결제</TableCell>
            <TableCell className="whitespace-normal">
              구독 플랜, 결제수단 식별자(빌링키), 결제 이력(금액·상태·일시)
            </TableCell>
            <TableCell className="whitespace-normal">유료 플랜 구독 시</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="whitespace-normal">자동 생성</TableCell>
            <TableCell className="whitespace-normal">
              IP 주소, 기기·브라우저 정보, 쿠키, 세션 토큰
            </TableCell>
            <TableCell className="whitespace-normal">서비스 이용 시</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p>
        <strong>카드번호·유효기간·CVC 등 결제 정보 원문은 회사 서버에 저장하지 않습니다.</strong>{' '}
        결제대행사가 발급한 빌링키만 보관합니다.
      </p>
      <p>
        접속 IP는 원문을 저장하지 않고, 남용 방지 목적의 단방향 해시값만 보관합니다. 원문에서
        해시값을 역산할 수 없습니다.
      </p>

      <h2>2. 개인정보의 이용 목적</h2>
      <ul>
        <li>회원 식별 및 서비스 제공</li>
        <li>유료 서비스 결제, 정산 및 세금계산서 발행</li>
        <li>측정 완료 알림, 결제·구독 관련 안내, 서비스 공지 발송</li>
        <li>무료 진단 남용 방지 및 부정 이용 대응</li>
        <li>전자상거래법 등 관계 법령에 따른 거래 기록 보존 의무 이행</li>
      </ul>

      <h2>3. 보유 및 이용 기간</h2>
      <ul>
        <li>
          회원 정보: 회원 탈퇴 시 개인을 식별할 수 없도록 지체 없이 익명화합니다. 다만 결제
          이력이 있는 경우 결제 관련 기록은 아래 &lsquo;결제 기록&rsquo;과 동일하게 5년간 별도
          보관합니다.
        </li>
        <li>결제 기록: 전자상거래법에 따라 5년</li>
        <li>접속 로그: 통신비밀보호법에 따라 3개월</li>
        <li>
          무료 진단 기록: 수집일로부터 1년. 다만 회원으로 가입한 경우 해당 기록은 회원 정보의
          보유 기간을 따릅니다.
        </li>
      </ul>

      <h2>4. 개인정보 처리 위탁</h2>
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
        관리·감독합니다. 위 목록에 없는 처리위탁(예: 결제대행사, 측정에 사용하는 AI·검색 API
        제공자)은 하지 않으며, 해당 기능이 실제로 제공되기 시작하는 시점에 이 표를 갱신하고
        &lsquo;8. 방침의 변경&rsquo;에 따라 고지합니다.
      </p>

      <h2>5. 국외 이전</h2>
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

      <h2>6. 이용자의 권리</h2>
      <p>
        이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.
        요청은 {B.email}로 접수하며, 회사는 관계 법령이 정한 기간 내에 조치하고 그 결과를
        알려드립니다. 계정 설정 화면에서 직접 열람·수정할 수 있는 기능은 순차적으로 제공될
        예정이며, 그 전까지는 위 연락처를 통해 요청해 주시기 바랍니다.
      </p>

      <h2>7. 개인정보 보호책임자</h2>
      <p>
        성명: {B.privacyOfficer || '사업자 등록 완료 후 지정 예정'}
        <br />
        연락처: {B.email}
      </p>
      <p>
        개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 위 연락처로 문의하실
        수 있습니다.
      </p>

      <h2>8. 방침의 변경</h2>
      <p>
        이 방침이 변경되는 경우 시행일 7일 전(이용자에게 불리한 변경은 30일 전)부터 서비스 내
        공지사항을 통해 고지합니다.
      </p>
    </>
  )
}
