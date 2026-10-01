# Google 로그인 설정

Google Drive 연결과 UniLink 로그인은 서로 다른 OAuth 흐름입니다. Google 로그인은 `openid email profile`만 요청하며 Drive 파일 권한을 요청하지 않습니다.

1. Google Cloud 프로젝트 `UNILINK`의 웹 OAuth 클라이언트에 승인된 리디렉션 URI `https://lqwpcwzjbqeunqfliaso.supabase.co/auth/v1/callback`을 추가합니다. 기존 Drive용 `/functions/v1/google-auth/callback`은 유지합니다.
2. Supabase 프로젝트 `lqwpcwzjbqeunqfliaso`의 **Authentication → Sign In / Providers → Google**에서 같은 웹 클라이언트 ID와 그 클라이언트 시크릿을 입력하고 Google을 활성화합니다. 시크릿은 저장소, 빌드 환경변수, 채팅에 넣지 않습니다.
3. **Authentication → Sign In / Providers → User Signups**에서 **Allow manual linking**을 켭니다. 기존 일반 계정의 학습 데이터를 Google 로그인에서도 쓰려면, 먼저 일반 계정으로 로그인하여 **설정 → Google 계정 연결**을 실행해야 합니다. 표시 이름이나 이메일 앞부분이 같다는 이유만으로 계정을 합치지 않습니다.
4. **Authentication → URL Configuration**에 `https://ajou1429.github.io/unilink/dashboard`와 `https://ajou1429.github.io/unilink/settings`를 리디렉션 허용 URL로 추가합니다. 로컬 테스트가 필요하면 로컬호스트의 해당 경로도 추가합니다.
5. **Authentication → Sign In / Providers → Email**에서 최소 비밀번호 길이를 **10**, 요구 사항을 **영문 대문자·소문자·숫자·특수기호**로 설정합니다. `supabase/config.toml`은 로컬 개발 환경에만 자동 적용됩니다.

검증: 기존 일반 계정으로 로그인해 Google을 연결한 뒤 로그아웃하고 Google로 로그인합니다. 두 방식에서 같은 사용자 ID와 수업 데이터가 보여야 합니다. 신규 Google 계정은 별도의 Supabase Auth 사용자 ID를 가진 하나의 UniLink 계정으로 시작합니다. 기존 계정과 병합하려면 해당 기존 계정에서 연결해야 합니다. Google 로그인만으로 Google Drive가 연결되거나 Drive 권한이 부여되지는 않습니다.
