# 배포 안내 (Supabase + Cloudflare Workers + Google Maps)

현장 조사용 알파 배포 절차입니다. 순서대로 하면 됩니다. 약 30–40분 걸립니다. 호스팅은 상업적 이용을 위해 Vercel 대신 **Cloudflare** 를 사용합니다.

## 준비물
- GitHub 계정 (이미 있음: `Phenomenal-Park/open-source`)
- Supabase 계정 — https://supabase.com (무료 플랜으로 시작 가능)
- Cloudflare 계정 — https://dash.cloudflare.com (무료 플랜으로 시작 가능, 상업적 이용 가능)
- Google Cloud 계정 — https://console.cloud.google.com (지도 키 발급용, 결제 수단 등록 필요)

> 비밀번호·키 값은 채팅에 붙여넣지 말고 각 대시보드에만 입력하세요.

---

## 1단계 — Supabase (데이터베이스 + 로그인)
1. Supabase에서 **New project** 생성. 지역은 **Northeast Asia (Seoul)** 권장. 데이터베이스 비밀번호는 안전한 곳에 보관.
2. 왼쪽 **SQL Editor** → 새 쿼리 → 저장소의 `supabase/production-setup.sql` 내용을 전부 붙여넣고 **Run**. (처음 한 번만, 빈 프로젝트에서)
3. **Authentication → Sign In / Providers** 에서 **Allow new users to sign up 끄기** (아무나 가입 못 하게).
4. **Authentication → Users → Add user** 로 관리자 계정(이메일 + 비밀번호) 생성. "Auto Confirm User" 체크.
5. **Project Settings → API (또는 API Keys)** 에서 다음 두 값을 메모:
   - Project URL (`https://xxxx.supabase.co`)
   - **anon / publishable** 키 (⚠️ `service_role` / `secret` 키는 절대 사용하지 않음)

## 2단계 — 서버 비밀값 만들기
아무 긴 무작위 문자열이면 됩니다. 예: 비밀번호 생성기로 40자 이상 생성.
이 값을 **MSM_SERVER_SECRET** 이라고 부릅니다. Cloudflare(4단계)와 Supabase(아래) 두 곳에 같은 값을 넣습니다.

Supabase **SQL Editor** 에서 `supabase/production-after-setup.sql` 내용을 붙여넣고, 두 자리를 바꾼 뒤 Run:
- `PASTE_MSM_SERVER_SECRET_HERE` → 위 비밀값
- `PASTE_OWNER_EMAIL_HERE` → 1-4에서 만든 관리자 이메일

마지막 줄 결과에 관리자 이메일과 `owner` 가 보이면 성공입니다.

## 3단계 — Google Maps 키
1. Google Cloud Console → 새 프로젝트 → **APIs & Services → Library → Maps JavaScript API** 사용 설정.
2. **Credentials → Create credentials → API key**.
3. 키 제한(중요): **Application restrictions = Websites**, 허용 주소에 `https://<배포주소>/*` (4단계 후 추가) / **API restrictions = Maps JavaScript API** 만.

## 4단계 — Cloudflare Workers 배포
1. Cloudflare 대시보드 → **Workers & Pages → Create → Import a repository** → GitHub 연결 → `Phenomenal-Park/open-source` 선택.
2. 설정:
   - Project name: `myeongdong-street-map` (`wrangler.jsonc` 의 name 과 같게)
   - Production branch: `main` (PR 병합 후)
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
3. **Build variables** (빌드할 때 화면 코드에 들어가는 값):

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 1-5의 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1-5의 anon/publishable 키 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 3단계 지도 키 |
| `NEXT_PUBLIC_SITE_URL` | 배포 주소 (예: `https://myeongdong-street-map.<계정>.workers.dev`) — 첫 배포 후 채우고 재배포 |
| `NEXT_PUBLIC_ADS_ENABLED` | `false` |

4. 배포 후 Worker → **Settings → Variables and Secrets** 에 `MSM_SERVER_SECRET`(2단계 비밀값)을 **Type = Secret** 으로 추가. (빌드에는 필요 없음)
   ⚠️ `MSM_LOCAL_*` 변수는 넣지 않습니다. `SERVICE_ROLE` 이 들어간 변수가 있으면 앱이 일부러 시작을 거부합니다.
5. 배포가 끝나면 `*.workers.dev` 주소가 나옵니다 → `NEXT_PUBLIC_SITE_URL` 채우고 다시 배포, 지도 키 제한에도 그 주소 추가.
   나중에 도메인을 사면 Worker → **Settings → Domains & Routes** 에서 연결합니다.

> 로컬에서 확인: `npm run cf:preview` (Cloudflare 런타임으로 실행). 직접 배포: `npx wrangler login` 후 `npm run cf:deploy`.

## 5단계 — 확인
- `https://<주소>/ko` → 지도 화면 (노점은 아직 0개 — 정상)
- `https://<주소>/admin/login` → 관리자 로그인 → `/admin/field` 에서 "다음 M-001" 이 보이면 성공
- 휴대폰으로 열고 "내 위치" 버튼 → 위치 허용

## 6단계 — 현장 조사 전 보안 (권장)
1. `/admin/security` 에서 인증 앱(Google Authenticator 등) 등록
2. Supabase SQL Editor: `update app_settings set require_mfa = true;`
3. 정식 공개 전: Supabase 유료 플랜의 백업/PITR 사용, `docs/SECURITY.md` 의 체크리스트 진행

## 현장 요원 추가
Supabase **Authentication → Users → Add user** 로 계정을 만든 뒤 SQL Editor:
```sql
insert into admin_profiles (user_id, role, display_name)
select id, 'field_worker', '이름' from auth.users where email = '요원이메일';
```

## 비용 참고 (요금은 각 서비스에서 최신 정보 확인)
- Supabase 무료 플랜: 알파 테스트에는 충분. 자동 백업·PITR은 유료 플랜.
- Cloudflare Workers 무료 플랜: 하루 요청 수 한도가 있으며, 넘으면 유료 플랜(월 소액)으로 전환. 상업적 이용 가능.
- Google Maps: 월 무료 사용량 범위가 있으며 초과 시 과금. 키 제한과 예산 알림 설정 권장.
