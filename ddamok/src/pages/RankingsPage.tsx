import { Leaderboard } from "../components/Leaderboard.tsx";
import { AdSlot, AD_SLOTS } from "../components/AdSlot.tsx";

/** 랭킹 화면(광고 있음) */
export function RankingsPage() {
  return (
    <main className="page narrow">
      <section className="panel">
        <Leaderboard />
      </section>
      <AdSlot slot={AD_SLOTS.rankings} />
    </main>
  );
}
