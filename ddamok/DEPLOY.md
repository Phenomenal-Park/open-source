# 따목 Cloudflare 배포 안내

화면(정적 파일) + API(Workers) + 계정·기보(D1) + 온라인 대국·매칭(Durable Objects)을 Cloudflare 한 곳에서 돌린다.

## 1. 준비 (한 번)

```bash
cd ddamok
npm install
npx wrangler login            # 브라우저로 Cloudflare 계정 로그인 (또는 CLOUDFLARE_API_TOKEN 환경변수)
npx wrangler d1 create ddamok # 출력된 database_id 를 wrangler.jsonc 의 database_id 에 넣는다
```

## 2. 인증 메일 (필수 — 없으면 가입은 되지만 인증 메일이 가지 않는다)

Cloudflare Email Service(메일 발송, 현재 베타)를 쓴다. 대시보드에서 보낼 도메인을 등록한 뒤 `wrangler.jsonc` 에 추가:

```jsonc
"send_email": [{ "name": "EMAIL" }],
"vars": { ..., "MAIL_FROM": "따목 <no-reply@내도메인>" }
```

- 아무 주소로나 보내려면 Workers 유료 플랜(월 5달러)과 직접 가진 도메인이 필요하다는 안내가 있다 — 배포 시점의 Cloudflare 문서를 확인한다.
- 코드(worker/mail.ts)는 `env.EMAIL.send({ to, from, subject, text })` 형식을 쓴다. 베타라 형식이 바뀌었으면 이 파일만 고친다.

## 3. 배포

```bash
npm run deploy   # 화면 빌드 → D1 테이블 만들기(원격) → Worker 배포
```

끝나면 `https://ddamok.<계정>.workers.dev` 주소가 나온다. 휴대폰에서 열고 "홈 화면에 추가"하면 앱처럼 쓸 수 있다.
도메인을 붙이려면 대시보드 Workers → ddamok → 설정 → 도메인.

## 4. 광고 (선택)

프로필·기보 화면에만 광고 자리가 있다(대국 화면에는 없음). 애드센스 승인 후 빌드할 때 넣는다:

```bash
VITE_ADSENSE_CLIENT=ca-pub-XXXX VITE_ADSENSE_SLOT_PROFILE=1111 VITE_ADSENSE_SLOT_RECORDS=2222 npm run deploy
```

## 주의

- **CPU 한도:** 무료 플랜 Workers는 요청당 CPU 10ms다. 비밀번호 해시(PBKDF2 10만 회)는 이를 넘을 수 있다. 가입·로그인이 실패하면
  유료 플랜으로 바꾸거나 `PBKDF2_ITERATIONS` 를 낮춘다(보안이 약해진다). 배포 후 실제로 확인해야 한다.
- **비밀값:** 이 프로젝트는 비밀 키를 쓰지 않는다(세션 토큰은 해시만 저장, 비밀번호는 PBKDF2).
- **점수 보정:** 하루 한 번(UTC 18:17) 9단 비율을 확인해 0.05~0.1%를 벗어나면 조정한다(사람 2000명 이상일 때부터).
- **개인정보 처리방침:** `/privacy` 는 초안이다. 운영자 연락처를 채우고 검토한 뒤 공개한다.
