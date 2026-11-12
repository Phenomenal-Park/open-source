const ko = {
  siteName: "명동 노점 지도",
  seoTitle: "명동 노점 지도 – 길거리 음식·쇼핑 노점 가격과 위치",
  metaDescription: "명동 노점의 위치, 메뉴, 가격, 맵기, 영업시간과 방문자 평점을 지도에서 한눈에 확인하세요.",
  nav: { map: "지도", rankings: "랭킹", guides: "가이드", search: "검색", language: "언어", theme: "화면 모드", themeSystem: "기기 설정", themeLight: "라이트", themeDark: "다크", menu: "메뉴", close: "닫기", back: "뒤로" },
  ticker: { label: "이번 주 평점 랭킹", rank: "{n}위", empty: "이번 주 평가를 모으고 있어요" },
  filters: {
    open: "영업 중", price: "가격", priceUnder: "{p} 이하", priceAny: "전체 가격", halal: "할랄", card: "카드", clear: "필터 해제",
    sheetTitle: "필터", reset: "초기화", foodType: "음식 종류", nSelected: "{n}개 선택됨", status: "영업 상태", all: "전체", extra: "기타 조건", halalOk: "할랄 가능", cardOk: "카드 결제 가능", priceBand: "가격대",
    bands: ["~3,000원", "3,000~5,000원", "5,000~10,000원", "10,000원~"], apply: "적용하기 (총 {n}개 노점 표시)",
  },
  stall: {
    details: "상세 보기", repMenu: "대표 메뉴", otherMenu: "기타 메뉴", others: "{list} 외", openNow: "영업 중", closedNow: "영업 전·종료",
    usualHours: "일반 영업시간", usualHoursNote: "명동 노점 일반 영업시간 기준", verifiedHours: "확인된 영업시간", closed: "휴무", nextDay: "익일 {t}",
    priceVaries: "가격 다양", priceUnknown: "가격 미확인", tabMenu: "가격·메뉴", tabReviews: "리뷰", tabPhotos: "사진",
    moreMenu: "+ 메뉴 {n}개 더보기", lessMenu: "접기", directions: "길찾기", showOnMap: "지도에서 보기", lastVerified: "{date} 현장 확인",
    noPhotos: "아직 사진이 없어요", payment: "결제", cardWorked: "카드 결제 성공 {n}건", cardFailed: "카드 결제 실패 {n}건", cashUsed: "현금 결제 {n}건",
    paymentUnknown: "결제 정보 미확인", dietary: "식이 정보", dietaryUnknown: "식이 정보 미확인", notActive: "현재 이 노점의 운영이 확인되지 않아요",
    report: "정보가 다른가요? 제보하기", seafood: "해산물",
  },
  claims: {
    halal_certified: "할랄 인증 — 증빙 확인", seller_claims_halal: "판매자 할랄 표시 — 독립 확인 안 됨", no_pork_confirmed: "돼지고기 없음 확인",
    no_alcohol_confirmed: "알코올 없음 확인", contains_pork: "돼지고기 포함", contains_alcohol: "알코올 포함", vegetarian: "채식", unconfirmed: "미확인",
  } as Record<string, string>,
  spice: {
    notSpicy: "안 매움", l1: "살짝 매콤", l2: "꽤 매움", l3: "매운맛을 좋아하는 분께 추천", unknown: "미확인",
    operator: "표시 맵기", community: "이용자 체감", votes: "{n}명 의견", ask: "이 메뉴, 얼마나 매웠나요?", disclaimer: "맵기는 사람마다 다르게 느낄 수 있어요.", yourVote: "내 의견",
  },
  hint: { near: "{p} 근처", in_front: "{p} 앞", opposite: "{p} 맞은편", beside: "{p} 옆" },
  weekdays: ["월", "화", "수", "목", "금", "토", "일"],
  weekdaysLong: ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"],
  review: {
    defaultNickname: "명동손님", write: "리뷰 쓰기", helpNext: "다음 여행자에게 알려주세요.", overall: "별점", taste: "맛", value: "가성비", kindness: "친절도",
    optional: "선택", facts: "확인한 내용", priceMatched: "가격 맞음", priceDifferent: "가격 다름", cardOk: "카드 가능", cashUsed: "현금 결제", openNow: "지금 영업 중",
    textPlaceholder: "어땠나요? (선택)", nicknamePlaceholder: "닉네임 (선택)", submit: "등록", thanks: "고마워요! 다음 여행자에게 큰 도움이 돼요.",
    viewOriginal: "원문 보기", viewTranslation: "번역 보기", none: "아직 리뷰가 없어요. 첫 리뷰를 남겨 주세요.", ratingRequired: "별점을 선택해 주세요.",
    justNow: "방금", minutes: "{n}분 전", hours: "{n}시간 전", days: "{n}일 전",
  },
  rankings: { title: "이번 주 평점 랭킹", basis: "최근 7일 이용자 평가 기준", overall: "전체", byCategory: "카테고리별", empty: "아직 이번 주 평가가 충분하지 않아요.", reviews: "{n}개 평가" },
  map: {
    locate: "내 위치", locationWhy: "주변 노점까지의 거리를 보여드리기 위해 현재 위치를 사용해요. 위치는 저장하지 않아요.", allow: "위치 사용",
    locationDenied: "위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.", zoomIn: "확대", zoomOut: "축소",
    schematic: "지도 키가 없어 간략 지도로 표시 중", stallsShown: "노점 {n}곳", noResults: "조건에 맞는 노점이 없어요", visited: "방문한 노점 평가하기",
    whichStall: "어느 노점이었나요?", noneNearby: "가까운 노점을 찾지 못했어요", away: "약 {n}m",
  },
  search: { placeholder: "메뉴·상품 검색 (예: 딸기모찌)", foods: "메뉴", stalls: "노점", empty: "검색 결과가 없어요", broad: "관련 노점" },
  report: { title: "정보 제보", closed: "영업하지 않아요", price_changed: "가격이 달라요", menu_changed: "메뉴가 달라요", moved: "위치가 달라요", other: "기타", text: "자세히 알려주세요 (선택)", send: "보내기", thanks: "제보 고마워요! 확인 후 반영할게요." },
  ads: { label: "광고" },
  common: { cancel: "취소", save: "저장", close: "닫기", loading: "불러오는 중…", error: "문제가 생겼어요. 다시 시도해 주세요.", retry: "다시 시도", tooMany: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." },
  footer: { about: "명동 노점 지도는 현장 확인 정보와 방문자 제보로 만들어져요.", privacy: "개인정보 처리방침" },
};
export default ko;
export type Messages = typeof ko;
