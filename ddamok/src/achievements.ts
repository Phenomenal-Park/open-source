// 업적(뱃지). 어떤 업적에 어떤 뱃지를 줄지는 아직 정하지 않았다 — 정해지면 여기 목록에 넣는다.
// 서버는 사람마다 받은 뱃지 id 목록(users.badges)을 들고 있고, 화면은 닉네임 오른쪽에 작게 보여 준다.
export interface Achievement {
  id: string;
  /** 뱃지 그림(이모지·짧은 기호) */
  icon: string;
  /** 업적 이름·설명 — 언어별 */
  name: Record<"ko" | "en" | "ja", string>;
  desc: Record<"ko" | "en" | "ja", string>;
}

export const ACHIEVEMENTS: readonly Achievement[] = [];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
