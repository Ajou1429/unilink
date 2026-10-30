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
        <p className="mt-2 text-sm text-slate-600">시행일: 2026년 10월 30일</p>

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
            <p className="mt-2">Google Drive 연동은 사용자가 직접 동의한 경우에만 시작됩니다. 기존 자료 조회·동기화에는 Drive 읽기 권한을, 사용자가 실행한 노트 업로드와 폴더 생성에는 앱에서 생성하거나 사용을 허용한 파일을 관리하는 권한(drive.file)을 요청합니다. 동기화 대상 폴더 선택은 서비스 내부 설정이며 읽기 권한 자체를 해당 폴더로 제한하지는 않습니다. 사용자는 Drive 연결 해제 또는 Google 계정의 연결된 앱 관리에서 권한을 철회할 수 있습니다. 서비스에서 노트를 삭제해도 Drive 원본은 자동 삭제하지 않습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">4. 보관 및 삭제</h2>
            <p className="mt-2">정보는 서비스 제공에 필요한 기간 동안 보관합니다. Drive 연결을 해제하면 Drive 접근 토큰과 연결 정보는 삭제됩니다. 이전에 서비스에 등록된 노트 및 학습 데이터는 사용자가 별도로 삭제하거나 계정 삭제를 요청할 때까지 남을 수 있습니다.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-900">5. 제3자 제공 및 처리 위탁</h2>
            <p className="mt-2">UniLink는 서비스 운영을 위해 인증·데이터 저장 서비스와 Google Drive API를 이용합니다. 법령상 근거가 있거나 사용자의 동의가 있는 경우를 제외하고 개인정보를 판매하거나 제공하지 않습니다.</p>
            <p className="mt-2">사용자가 PDF 자료 분석에 별도로 동의하고 분석을 실행하면 해당 PDF를 OpenAI API에 전송합니다. 수업 주제·과제·시험 후보와 근거 페이지·인용문, 자료 버전 및 분석 처리 정보를 저장하며, 확인한 항목만 학습 목표와 일정에 등록합니다. 노트 삭제 시 연결된 분석 기록은 삭제됩니다. 이미 확인해 등록한 학습 주제와 일정은 별도로 삭제할 때까지 남을 수 있습니다.</p>
            <p className="mt-2">과목 지식 분석에 동의한 뒤 계획 추천을 요청하면 선택한 학습 목표에 연결된 PDF의 구조와 필요한 진도 구간을 분석하고, 추출한 교육과정·개념·요구 수준·근거를 저장하여 이후 코칭에 재사용합니다. 외부 자료 검색에 별도로 동의한 경우 추출된 주제·개념·요구 수준을 OpenAI 검색 도구에 전달합니다. 검색 요청에는 원본 PDF 전체나 사용자 계정 정보·이해도·학습 이력을 포함하지 않습니다. 과목별 검색 근거는 학습 목표를 삭제하면 함께 삭제됩니다.</p>
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
