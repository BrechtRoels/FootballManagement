import { Dumbbell, Trophy, Users, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "./ui";
import type {
  ActivityStatus,
  ActivityType,
  AvailabilityStatus,
} from "../lib/types";

const activityMeta: Record<
  ActivityType,
  { color: "brand" | "steel" | "ink"; icon: typeof Trophy }
> = {
  training: { color: "steel", icon: Dumbbell },
  match: { color: "brand", icon: Trophy },
  meeting: { color: "ink", icon: Users },
  event: { color: "steel", icon: CalendarDays },
};

export function ActivityTypeBadge({ type }: { type: ActivityType }) {
  const { t } = useTranslation();
  const m = activityMeta[type];
  const Icon = m.icon;
  return (
    <Badge color={m.color}>
      <Icon size={12} />
      {t(`activityType.${type}`)}
    </Badge>
  );
}

export function activityIcon(type: ActivityType) {
  return activityMeta[type].icon;
}
export function activityColor(type: ActivityType) {
  return activityMeta[type].color;
}

export function StatusBadge({ status }: { status: ActivityStatus }) {
  const { t } = useTranslation();
  return status === "cancelled" ? (
    <Badge color="red">{t("activityStatus.cancelled")}</Badge>
  ) : (
    <Badge color="steel">{t("activityStatus.scheduled")}</Badge>
  );
}

const availabilityColor: Record<
  AvailabilityStatus,
  "brand" | "ink" | "amber" | "slate"
> = {
  available: "brand",
  unavailable: "ink",
  maybe: "amber",
  unknown: "slate",
};

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  const { t } = useTranslation();
  return <Badge color={availabilityColor[status]}>{t(`availability.${status}`)}</Badge>;
}
