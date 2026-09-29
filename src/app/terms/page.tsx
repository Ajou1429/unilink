import Link from "next/link";

export const metadata = {
  title: "이용약관 | UniLink",
  description: "UniLink 이용약관",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link href="/" className="text-sm font-medium text-blue-700 hover:underline">
          UniLink 홈으로
        </Link>
        <h1 className="mt-6 text-3xl font-bold">이용약관</h1>
        <p className="mt-2 text-sm text-slate-600">시행일: 2026년 9월 29일</p>

        <div className="mt-8 space-y-8 leading-7 text-slate-700">
          <section>
            <h2 className="text-xl font-semibold text-slate-900">1. 서비스 목적</h2>
            <p className="mt-2">UniLink는 대학생의 과목, 시간표, 일정, 노트 및 학습 기록 관리를 지원하는 서비스입니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">2. 계정과 이용자의 책임</h2>
            <p className="mt-2">이용자는 정확한 정보를 제공하고 자신의 계정 접근 수단을 안전하게 관리해야 합니다. 타인의 계정·자료를 무단으로 이용하거나 서비스 운영을 방해해서는 안 됩니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">3. Google Drive 연동</h2>
            <p className="mt-2">Drive 연동은 이용자의 선택 기능입니다. 이용자는 연결할 Google 계정과 동기화할 폴더를 직접 선택하며, 언제든 연결을 해제할 수 있습니다. UniLink는 이용자의 동의 없이 Drive 파일을 수정하거나 삭제하지 않습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">4. 서비스 변경 및 중단</h2>
            <p className="mt-2">서비스 개선, 보안, 외부 플랫폼 정책 또는 운영상 필요한 경우 기능의 일부를 변경하거나 중단할 수 있습니다. 중요한 변경 사항은 서비스 내 공지 또는 합리적인 방법으로 안내합니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">5. 문의</h2>
            <p className="mt-2">서비스 이용 문의는 <a className="text-blue-700 hover:underline" href="mailto:aunj1429@gmail.com">aunj1429@gmail.com</a>으로 보내주세요.</p>
          </section>
        </div>
      </article>
    </main>
  );
}
