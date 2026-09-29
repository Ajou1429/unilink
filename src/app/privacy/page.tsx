import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 | UniLink",
  description: "UniLink 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-medium text-blue-700 hover:underline">
          UniLink 홈으로
        </Link>
        <h1 className="mt-6 text-3xl font-bold">개인정보처리방침</h1>
        <p className="mt-2 text-sm text-slate-600">시행일: 2026년 9월 29일</p>

        <div className="mt-8 space-y-8 leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900">1. 처리 목적</h2>
            <p className="mt-2">UniLink는 학습 일정, 과목, 노트 및 학습 기록을 관리하고 개인화된 학습 기능을 제공하기 위해 필요한 정보를 처리합니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">2. 처리하는 정보</h2>
            <p className="mt-2">회원 계정 정보, 사용자가 입력한 과목·시간표·일정·학습 기록, 그리고 사용자가 연결 및 선택한 Google Drive의 파일 식별정보·이름·수정 시각·폴더 정보 및 PDF 표시·동기화에 필요한 파일 정보를 처리할 수 있습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">3. Google Drive 연동</h2>
            <p className="mt-2">Google Drive 연동은 사용자가 직접 동의한 경우에만 시작됩니다. UniLink는 동기화와 파일 표시를 위해 Google Drive 읽기 권한만 요청하며, 사용자가 선택한 범위의 파일을 읽습니다. 사용자는 서비스의 Drive 연결 해제 기능 또는 Google 계정의 연결된 앱 관리에서 언제든 권한을 철회할 수 있습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">4. 보관 및 삭제</h2>
            <p className="mt-2">정보는 서비스 제공에 필요한 기간 동안 보관합니다. Drive 연결을 해제하면 Drive 접근 토큰과 연결 정보는 삭제됩니다. 이전에 서비스에 등록된 노트 및 학습 데이터는 사용자가 별도로 삭제하거나 계정 삭제를 요청할 때까지 남을 수 있습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">5. 제3자 제공 및 처리 위탁</h2>
            <p className="mt-2">UniLink는 서비스 운영을 위해 인증·데이터 저장 서비스와 Google Drive API를 이용합니다. 법령상 근거가 있거나 사용자의 동의가 있는 경우를 제외하고 개인정보를 판매하거나 제공하지 않습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">6. 문의 및 권리 행사</h2>
            <p className="mt-2">정보의 열람·정정·삭제 또는 처리 관련 문의는 <a className="text-blue-700 hover:underline" href="mailto:aunj1429@gmail.com">aunj1429@gmail.com</a>으로 보내주세요.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
