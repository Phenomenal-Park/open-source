import { IconCard, IconChat, IconClock, IconLeaf, IconMap, IconPin, IconTrash } from "@/components/ui/icons";
import type { GuideIcon as G } from "@/lib/guides";
export function GuideIcon({ name }: { name: G }) {
  const p = { size: 28 };
  switch (name) {
    case "map": return <IconMap {...p} />;
    case "clock": return <IconClock {...p} />;
    case "card": return <IconCard {...p} />;
    case "leaf": return <IconLeaf {...p} />;
    case "trash": return <IconTrash {...p} />;
    case "chat": return <IconChat {...p} />;
    default: return <IconPin {...p} />;
  }
}
