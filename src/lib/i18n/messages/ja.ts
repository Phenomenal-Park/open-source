import type { Messages } from "./ko";
const ja: Messages = {
  siteName: "明洞屋台マップ",
  seoTitle: "明洞屋台マップ – 屋台グルメ・ショッピングの価格と場所",
  metaDescription: "明洞の屋台の場所、メニュー、価格、辛さ、営業時間、口コミ評価を地図でまとめてチェック。",
  nav: { map: "地図", rankings: "ランキング", guides: "ガイド", search: "検索", language: "言語", theme: "表示", themeSystem: "端末設定", themeLight: "ライト", themeDark: "ダーク", menu: "メニュー", close: "閉じる", back: "戻る" },
  ticker: { label: "今週の評価ランキング", rank: "{n}位", empty: "今週の評価を集計中です" },
  filters: {
    open: "営業中", price: "価格", priceUnder: "{p}以下", priceAny: "すべての価格", halal: "ハラール", card: "カード可", clear: "解除",
    sheetTitle: "絞り込み", reset: "リセット", foodType: "カテゴリー", nSelected: "{n}件選択中", status: "営業状況", all: "すべて", extra: "その他", halalOk: "ハラールあり", cardOk: "カード可", priceBand: "価格帯",
    bands: ["〜3,000ウォン", "3,000〜5,000ウォン", "5,000〜10,000ウォン", "10,000ウォン〜"], apply: "適用する（{n}件の屋台を表示）",
  },
  stall: {
    details: "詳細を見る", repMenu: "代表メニュー", otherMenu: "その他", others: "{list} ほか", openNow: "営業中", closedNow: "営業時間外",
    usualHours: "通常の営業時間", usualHoursNote: "明洞の屋台の一般的な営業時間です", verifiedHours: "確認済みの営業時間", closed: "定休", nextDay: "翌{t}",
    priceVaries: "価格はさまざま", priceUnknown: "価格未確認", tabMenu: "価格・メニュー", tabReviews: "口コミ", tabPhotos: "写真",
    moreMenu: "+ ほか{n}品を見る", lessMenu: "閉じる", directions: "経路", showOnMap: "地図で見る", lastVerified: "{date} 現地確認",
    noPhotos: "まだ写真がありません", payment: "支払い", cardWorked: "カード利用できた（{n}件）", cardFailed: "カード利用できず（{n}件）", cashUsed: "現金払い（{n}件）",
    paymentUnknown: "支払い方法は未確認", dietary: "食事制限の情報", dietaryUnknown: "未確認", notActive: "最近この屋台の営業は確認されていません",
    report: "情報が違う？お知らせください", seafood: "シーフード",
  },
  claims: {
    halal_certified: "ハラール認証 — 証明書確認済み", seller_claims_halal: "店主がハラールと表示 — 第三者未確認", no_pork_confirmed: "豚肉不使用（確認済み）",
    no_alcohol_confirmed: "アルコール不使用（確認済み）", contains_pork: "豚肉を含む", contains_alcohol: "アルコールを含む", vegetarian: "ベジタリアン", unconfirmed: "未確認",
  },
  spice: {
    notSpicy: "辛くない", l1: "ピリ辛", l2: "かなり辛い", l3: "辛いもの好きな方に", unknown: "未確認",
    operator: "表示の辛さ", community: "利用者の体感", votes: "{n}人の意見", ask: "どのくらい辛かったですか？", disclaimer: "辛さの感じ方には個人差があります。", yourVote: "あなたの意見",
  },
  hint: { near: "{p}付近", in_front: "{p}前", opposite: "{p}向かい", beside: "{p}横" },
  weekdays: ["月", "火", "水", "木", "金", "土", "日"],
  weekdaysLong: ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"],
  review: {
    defaultNickname: "明洞のお客さん", write: "口コミを書く", helpNext: "次の旅行者に教えてください。", overall: "評価", taste: "味", value: "コスパ", kindness: "接客",
    optional: "任意", facts: "確認したこと", priceMatched: "価格どおり", priceDifferent: "価格が違った", cardOk: "カード可", cashUsed: "現金で支払い", openNow: "営業していた",
    textPlaceholder: "いかがでしたか？（任意）", nicknamePlaceholder: "ニックネーム（任意）", submit: "投稿", thanks: "ありがとうございます！次の旅行者の役に立ちます。",
    viewOriginal: "原文を見る", viewTranslation: "翻訳を見る", none: "まだ口コミがありません。最初の口コミをどうぞ。", ratingRequired: "評価を選んでください。",
    justNow: "たった今", minutes: "{n}分前", hours: "{n}時間前", days: "{n}日前",
  },
  rankings: { title: "今週の評価ランキング", basis: "直近7日間の利用者評価にもとづく", overall: "総合", byCategory: "カテゴリー別", empty: "今週はまだ評価が十分ではありません。", reviews: "{n}件の評価" },
  map: {
    locate: "現在地", locationWhy: "近くの屋台までの距離を表示するために現在地を使います。位置情報は保存しません。", allow: "現在地を使う",
    locationDenied: "位置情報がオフになっています。ブラウザの設定で許可してください。", zoomIn: "拡大", zoomOut: "縮小",
    schematic: "地図キー未設定のため簡易表示中", stallsShown: "屋台{n}件", noResults: "条件に合う屋台がありません", visited: "訪れた屋台を評価する",
    whichStall: "どの屋台でしたか？", noneNearby: "近くに屋台が見つかりません", away: "約{n}m",
  },
  search: { placeholder: "メニュー・商品を検索（例：いちご大福）", foods: "メニュー", stalls: "屋台", empty: "見つかりませんでした", broad: "関連する屋台" },
  report: { title: "情報の報告", closed: "営業していない", price_changed: "価格が違う", menu_changed: "メニューが違う", moved: "場所が違う", other: "その他", text: "詳しく（任意）", send: "送信", thanks: "ありがとうございます！確認して反映します。" },
  ads: { label: "広告" },
  common: { cancel: "キャンセル", save: "保存", close: "閉じる", loading: "読み込み中…", error: "問題が発生しました。もう一度お試しください。", retry: "再試行", tooMany: "リクエストが多すぎます。しばらくしてからお試しください。" },
  footer: { about: "現地確認と利用者の報告をもとに作られています。", privacy: "プライバシー" },
};
export default ja;
