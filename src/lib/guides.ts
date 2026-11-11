// Practical guide content (§109–§111). Written per language, not machine-translated.
// Facts that vary by stall are stated as such; nothing here promises behaviour of every stall.

export type GuideIcon = "map" | "clock" | "card" | "leaf" | "trash" | "chat" | "pin";
export type Guide = { slug: string; icon: GuideIcon; highlight?: boolean; title: string; summary: string; body: { h?: string; p: string }[] };

const ko: Guide[] = [
  { slug: "how-to-use", icon: "map", title: "기본 이용", summary: "지도에서 명동 노점의 위치, 메뉴와 가격을 쉽고 빠르게 찾을 수 있어요.",
    body: [
      { p: "지도의 작은 네모 하나가 노점 하나예요. 색은 대표 카테고리를 나타내요. 네모를 누르면 대표 메뉴와 가격, 평점이 보여요." },
      { h: "필터", p: "‘영업 중’, ‘가격’, 카테고리를 조합해 원하는 노점만 강조해서 볼 수 있어요. 조건에 맞지 않는 노점도 흐리게 남아 있어 위치를 가늠할 수 있어요." },
      { h: "위치 표시", p: "‘유니클로 근처’처럼 가까운 건물을 기준으로 안내해요. 정확한 관계가 확인된 경우에만 ‘앞’, ‘맞은편’ 같은 표현을 써요." },
    ] },
  { slug: "opening-hours", icon: "clock", title: "영업시간", summary: "보통 평일 16:00–24:00, 주말 13:00–24:00이에요. 노점마다 다를 수 있어요.",
    body: [
      { p: "명동 노점은 대체로 평일 오후 4시쯤, 주말 오후 1시쯤 문을 열고 자정 무렵까지 운영해요." },
      { p: "개별 노점의 시간이 현장에서 확인되면 상세 페이지에 ‘확인된 영업시간’으로 표시해요. 표시가 없으면 일반 영업시간 기준이에요. 날씨나 행사에 따라 쉬는 날도 있어요." },
    ] },
  { slug: "payment", icon: "card", title: "결제", summary: "카드 결제 가능 여부는 노점마다 달라요. 소액 현금을 준비하면 편해요.",
    body: [
      { p: "카드를 받는 노점도 많지만, 현금만 받는 곳도 있어요. 상세 페이지에는 방문자가 알려준 카드·현금 결제 경험이 표시돼요." },
      { h: "가격 확인", p: "가격은 바뀔 수 있어요. 주문 전에 노점의 가격표를 한 번 더 확인해 주세요. 표시된 가격과 달랐다면 리뷰에서 ‘가격 다름’을 눌러 알려 주세요." },
    ] },
  { slug: "halal-dietary", icon: "leaf", title: "할랄·원재료", summary: "할랄 여부와 돼지고기·알코올 정보는 각 노점 상세 페이지에서 확인해 주세요.",
    body: [
      { p: "‘할랄 인증’은 인증 증빙을 확인한 경우에만 표시해요. 판매자가 할랄이라고만 밝힌 경우는 ‘독립 확인 안 됨’으로 구분해서 보여드려요." },
      { p: "알레르기나 식이 제한이 있다면 주문 전에 판매자에게 직접 확인하는 것이 가장 안전해요." },
    ] },
  { slug: "trash", icon: "trash", highlight: true, title: "쓰레기", summary: "다 먹은 쓰레기는 구매한 노점이나 가까운 노점에 버려도 되는지 물어보세요.",
    body: [
      { p: "명동 거리에는 쓰레기통이 많지 않아요. 노점에서 음식을 드신 뒤 나온 쓰레기는 구매한 노점이나 가까운 명동 노점에 가져가 버려도 되는지 물어보세요." },
      { p: "노점에서 받아주는 경우가 많으니 길거리에 버리지 말고 가까운 노점에 문의해 주세요. 다만 다른 곳에서 가져온 쓰레기까지 모든 노점이 받아야 하는 것은 아니에요." },
    ] },
  { slug: "report-info", icon: "chat", title: "정보 제보", summary: "가격, 영업 여부, 메뉴 변경 등 수정이 필요한 정보를 알려 주세요. 더 정확한 지도를 함께 만들 수 있어요.",
    body: [
      { p: "노점 상세 페이지 아래의 ‘정보가 다른가요? 제보하기’를 눌러 주세요. 로그인은 필요 없어요." },
      { p: "제보 하나로 바로 정보가 바뀌지는 않아요. 여러 제보와 현장 확인을 함께 살펴본 뒤 반영해요." },
    ] },
  { slug: "getting-there", icon: "pin", title: "찾아가는 법", summary: "지하철 4호선 명동역이나 2호선 을지로입구역에서 걸어서 갈 수 있어요.",
    body: [
      { p: "4호선 명동역에서 내려 명동 방향 출구(5~8번)로 나오면 노점 거리와 가까워요. 2호선 을지로입구역에서 내려 남쪽으로 걸어 내려와도 돼요." },
      { p: "지도에서 ‘내 위치’를 누르면 현재 위치와 주변 노점을 함께 볼 수 있어요." },
    ] },
];

const en: Guide[] = [
  { slug: "how-to-use", icon: "map", title: "How to use", summary: "Find Myeongdong street stalls, their menus and prices quickly on the map.",
    body: [
      { p: "Each small square on the map is one stall; its color shows the main category. Tap a square to see the signature item, price and rating." },
      { h: "Filters", p: "Combine “Open now”, “Price” and categories to highlight just the stalls you want. Other stalls stay faintly visible so you can still get your bearings." },
      { h: "Location hints", p: "We describe places relative to nearby buildings, like “Near UNIQLO”. Stronger wording such as “in front of” is used only when it has been checked on site." },
    ] },
  { slug: "opening-hours", icon: "clock", title: "Opening hours", summary: "Usually 16:00–24:00 on weekdays and 13:00–24:00 on weekends. Each stall may differ.",
    body: [
      { p: "Most Myeongdong stalls open around 4 pm on weekdays and 1 pm on weekends, and run until about midnight." },
      { p: "When a stall’s own hours have been checked, its page shows “Confirmed hours”. Otherwise you see the usual area hours. Stalls may close for weather or events." },
    ] },
  { slug: "payment", icon: "card", title: "Payment", summary: "Card acceptance varies by stall. Carrying some cash makes things easier.",
    body: [
      { p: "Many stalls take cards, but some are cash only. Each stall page shows what other visitors experienced when paying." },
      { h: "Checking prices", p: "Prices can change, so please check the stall’s price board before ordering. If it differed, tap “Price differed” in your review." },
    ] },
  { slug: "halal-dietary", icon: "leaf", title: "Halal & ingredients", summary: "Check halal, pork and alcohol information on each stall’s page.",
    body: [
      { p: "“Halal certified” is shown only when certification evidence has been checked. If a seller simply says the food is halal, we label it “not independently verified”." },
      { p: "If you have allergies or dietary restrictions, asking the seller directly before ordering is always safest." },
    ] },
  { slug: "trash", icon: "trash", highlight: true, title: "Trash", summary: "Finished eating? Ask the stall you bought from, or a nearby stall, if you can leave your trash with them.",
    body: [
      { p: "There are few public bins in Myeongdong. After eating, take your trash back to the stall you bought from or a nearby stall and ask if you can leave it there." },
      { p: "Many stalls are happy to take it, so please don’t leave trash on the street. Not every stall can accept trash brought from elsewhere, though." },
    ] },
  { slug: "report-info", icon: "chat", title: "Report updates", summary: "Tell us about price, opening or menu changes. Together we keep the map accurate.",
    body: [
      { p: "Tap “Something wrong? Let us know” at the bottom of any stall page. No login needed." },
      { p: "A single report doesn’t change the map right away. We combine reports with on-site checks before updating." },
    ] },
  { slug: "getting-there", icon: "pin", title: "Getting there", summary: "Walk from Myeongdong Station (Line 4) or Euljiro 1-ga Station (Line 2).",
    body: [
      { p: "From Myeongdong Station (Line 4), take an exit on the Myeongdong side (Exits 5–8) and you’ll be close to the stall streets. From Euljiro 1-ga Station (Line 2), walk south." },
      { p: "Tap “My location” on the map to see where you are and the stalls around you." },
    ] },
];

const ja: Guide[] = [
  { slug: "how-to-use", icon: "map", title: "基本の使い方", summary: "明洞の屋台の場所、メニュー、価格を地図ですばやく探せます。",
    body: [
      { p: "地図上の小さな四角ひとつが屋台ひとつです。色は代表カテゴリーを表します。四角をタップすると代表メニュー、価格、評価が表示されます。" },
      { h: "フィルター", p: "「営業中」「価格」とカテゴリーを組み合わせて、見たい屋台だけを強調できます。条件に合わない屋台も薄く表示されるので位置の目安になります。" },
      { h: "場所の表し方", p: "「ユニクロ付近」のように近くの建物を基準に案内します。「前」「向かい」などの表現は現地で確認できた場合だけ使います。" },
    ] },
  { slug: "opening-hours", icon: "clock", title: "営業時間", summary: "平日16:00–24:00、週末13:00–24:00が一般的です。屋台によって異なります。",
    body: [
      { p: "明洞の屋台は、平日は16時ごろ、週末は13時ごろから深夜0時ごろまで営業するのが一般的です。" },
      { p: "屋台ごとの時間が現地で確認できた場合は、詳細ページに「確認済みの営業時間」と表示します。天候やイベントで休むこともあります。" },
    ] },
  { slug: "payment", icon: "card", title: "支払い", summary: "カードが使えるかは屋台によって異なります。少額の現金があると安心です。",
    body: [
      { p: "カードが使える屋台も多いですが、現金のみの屋台もあります。詳細ページでは利用者が伝えた支払いの体験を確認できます。" },
      { h: "価格の確認", p: "価格は変わることがあります。注文前に屋台の価格表を確認してください。表示と違った場合は口コミで「価格が違った」を選んで教えてください。" },
    ] },
  { slug: "halal-dietary", icon: "leaf", title: "ハラール・原材料", summary: "ハラールや豚肉・アルコールの情報は各屋台の詳細ページで確認してください。",
    body: [
      { p: "「ハラール認証」は認証の証明を確認できた場合のみ表示します。店主がハラールと言っているだけの場合は「第三者未確認」と区別して表示します。" },
      { p: "アレルギーや食事制限がある方は、注文前に店主に直接確認するのがいちばん安全です。" },
    ] },
  { slug: "trash", icon: "trash", highlight: true, title: "ゴミ", summary: "食べ終わったゴミは、買った屋台や近くの屋台に捨ててよいか聞いてみてください。",
    body: [
      { p: "明洞の通りにはゴミ箱が多くありません。食べ終わったら、買った屋台や近くの屋台に持っていき、捨ててよいか聞いてみてください。" },
      { p: "受け取ってくれる屋台が多いので、道に捨てずに近くの屋台に声をかけてください。ただし、よそで出たゴミまですべての屋台が受け取れるわけではありません。" },
    ] },
  { slug: "report-info", icon: "chat", title: "情報の報告", summary: "価格、営業状況、メニューの変更などを教えてください。一緒に正確な地図を作りましょう。",
    body: [
      { p: "屋台の詳細ページ下の「情報が違う？お知らせください」から送れます。ログインは不要です。" },
      { p: "報告1件ですぐに情報が変わるわけではありません。複数の報告と現地確認をもとに反映します。" },
    ] },
  { slug: "getting-there", icon: "pin", title: "行き方", summary: "地下鉄4号線・明洞駅、2号線・乙支路入口駅から歩いて行けます。",
    body: [
      { p: "4号線・明洞駅の明洞側の出口（5〜8番）を出ると屋台通りの近くです。2号線・乙支路入口駅からは南へ歩いて向かえます。" },
      { p: "地図の「現在地」をタップすると、今いる場所と周りの屋台を一緒に確認できます。" },
    ] },
];

const zhCN: Guide[] = [
  { slug: "how-to-use", icon: "map", title: "基本使用", summary: "在地图上快速找到明洞街摊的位置、菜单和价格。",
    body: [
      { p: "地图上的每个小方块代表一个摊位，颜色表示主要类别。点击方块即可查看招牌菜、价格和评分。" },
      { h: "筛选", p: "组合“营业中”“价格”和类别，可以只突出显示想看的摊位。不符合条件的摊位会变淡但仍然可见，方便判断位置。" },
      { h: "位置说明", p: "我们以附近建筑为参照，例如“优衣库附近”。只有经过实地确认，才会使用“门前”“对面”等更具体的说法。" },
    ] },
  { slug: "opening-hours", icon: "clock", title: "营业时间", summary: "一般工作日16:00–24:00，周末13:00–24:00。各摊位可能不同。",
    body: [
      { p: "明洞街摊大多在工作日下午4点左右、周末下午1点左右开始营业，一直到午夜前后。" },
      { p: "如果某个摊位的营业时间经过实地确认，详情页会显示“已确认的营业时间”，否则显示一般营业时间。遇到天气或活动也可能休息。" },
    ] },
  { slug: "payment", icon: "card", title: "付款", summary: "是否可以刷卡因摊位而异，建议准备一些现金。",
    body: [
      { p: "很多摊位可以刷卡，但也有只收现金的。详情页会显示其他游客的付款经历。" },
      { h: "确认价格", p: "价格可能会变动，下单前请再看一下摊位的价目表。如果和显示的不一样，请在评价中选择“价格不同”。" },
    ] },
  { slug: "halal-dietary", icon: "leaf", title: "清真·食材", summary: "清真、猪肉和酒精信息请在各摊位详情页查看。",
    body: [
      { p: "只有核实过认证证明，才会显示“清真认证”。如果只是摊主自称清真，会标注为“未经独立核实”。" },
      { p: "如有过敏或饮食限制，下单前直接向摊主确认最安全。" },
    ] },
  { slug: "trash", icon: "trash", highlight: true, title: "垃圾", summary: "吃完后，可以问问购买的摊位或附近的摊位能否帮忙丢垃圾。",
    body: [
      { p: "明洞街上垃圾桶不多。吃完后，请把垃圾拿回购买的摊位或附近的摊位，问一下能不能放在那里。" },
      { p: "很多摊位都愿意帮忙，请不要丢在街上。不过，并不是每个摊位都能接收从别处带来的垃圾。" },
    ] },
  { slug: "report-info", icon: "chat", title: "反馈信息", summary: "价格、营业情况、菜单有变化时请告诉我们，一起让地图更准确。",
    body: [
      { p: "在摊位详情页底部点击“信息有误？告诉我们”即可，无需登录。" },
      { p: "单条反馈不会立即改变信息，我们会结合多条反馈和实地确认后再更新。" },
    ] },
  { slug: "getting-there", icon: "pin", title: "怎么去", summary: "从地铁4号线明洞站或2号线乙支路入口站步行即可到达。",
    body: [
      { p: "在4号线明洞站从明洞方向的出口（5–8号）出站，就在街摊附近。也可以从2号线乙支路入口站出站后向南步行。" },
      { p: "点击地图上的“我的位置”，可以同时看到自己的位置和周围的摊位。" },
    ] },
];

const GUIDES: Record<string, Guide[]> = { ko, en, ja, "zh-cn": zhCN };
export const GUIDE_SLUGS = ko.map((g) => g.slug);

export function getGuides(locale: string): Guide[] {
  return GUIDES[locale] ?? GUIDES.en;
}
export function getGuide(locale: string, slug: string): Guide | undefined {
  return getGuides(locale).find((g) => g.slug === slug);
}
export const GUIDE_LABELS: Record<string, { title: string; legend: string; legendNote: string; weekday: string; weekend: string; note: string; read: string }> = {
  ko: { title: "이용 가이드", legend: "지도 색상 안내", legendNote: "지도에 표시되는 색상은 노점의 대표 카테고리예요.", weekday: "평일", weekend: "주말", note: "※ 노점별로 영업시간이 다를 수 있어요.", read: "자세히" },
  en: { title: "Guide", legend: "Map colors", legendNote: "Marker colors show each stall’s main category.", weekday: "Weekdays", weekend: "Weekends", note: "※ Hours vary by stall.", read: "More" },
  ja: { title: "ご利用ガイド", legend: "地図の色について", legendNote: "地図の色は屋台の代表カテゴリーを表します。", weekday: "平日", weekend: "週末", note: "※ 屋台によって営業時間は異なります。", read: "詳しく" },
  "zh-cn": { title: "使用指南", legend: "地图颜色说明", legendNote: "地图上的颜色代表摊位的主要类别。", weekday: "工作日", weekend: "周末", note: "※ 各摊位营业时间可能不同。", read: "详情" },
};
