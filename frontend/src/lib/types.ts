export type UserRole = "admin" | "trainer" | "player";
export type MembershipRole = "trainer" | "player";
export type ActivityType = "training" | "match" | "meeting" | "event";
export type ActivityStatus = "scheduled" | "cancelled";
export type HomeAway = "home" | "away";
export type ResourceType = "pitch" | "dressing_room" | "room" | "other";
export type AvailabilityStatus =
  | "unknown"
  | "available"
  | "unavailable"
  | "maybe";
export type NotificationType =
  | "activity_created"
  | "activity_cancelled"
  | "activity_updated"
  | "selected"
  | "message"
  | "general";

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface UserCreatedOut {
  user: User;
  temporary_password: string | null;
}

export interface Team {
  id: string;
  name: string;
  season: string | null;
  category: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  team_id: string;
  role: MembershipRole;
  shirt_number: number | null;
  position: string | null;
  joined_at: string;
  user: User;
}

export interface TeamDetail extends Team {
  memberships: Membership[];
  feeders: Team[];
  dressing_rooms: Resource[];
}

export interface SquadEntry {
  user: User;
  team_id: string;
  team_name: string;
  is_callup: boolean;
  shirt_number: number | null;
  position: string | null;
  status: AvailabilityStatus;
  selected: boolean;
  note: string | null;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number | null;
  location: string | null;
}

export interface Activity {
  id: string;
  team_id: string;
  team_name: string | null;
  type: ActivityType;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location_text: string | null;
  opponent: string | null;
  home_away: HomeAway | null;
  status: ActivityStatus;
  created_at: string;
  resources: Resource[];
}

export interface Availability {
  id: string;
  activity_id: string;
  status: AvailabilityStatus;
  selected: boolean;
  note: string | null;
  updated_at: string;
  user: User;
}

export interface ActivityDetail extends Activity {
  availabilities: Availability[];
}

export interface Conflict {
  resource: Resource;
  activity_id: string;
  activity_title: string;
  start_time: string;
  end_time: string;
}

export interface Message {
  id: string;
  team_id: string;
  body: string;
  created_at: string;
  sender: User;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface DmContact {
  user: User;
  last_message: string | null;
  last_message_at: string | null;
  last_from_me: boolean;
  unread_count: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  related_activity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ---- Performance (trainer/admin only) ----
export interface PerformanceEntry {
  user: User;
  activity_id: string;
  performance_rating: number | null;
  mentality_rating: number | null;
  note: string | null;
  rated: boolean;
  updated_at: string | null;
}

export interface PerformancePoint {
  activity_id: string;
  activity_type: ActivityType;
  title: string;
  date: string;
  performance_rating: number | null;
  mentality_rating: number | null;
}

export interface PlayerPerformance {
  user: User;
  rated_count: number;
  avg_performance: number | null;
  avg_mentality: number | null;
  appearances: number;
  availability_pct: number | null;
  selection_rate: number | null;
  last_rated_at: string | null;
  history: PerformancePoint[];
}

export interface TeamPerformanceRow {
  user: User;
  rated_count: number;
  avg_performance: number | null;
  avg_mentality: number | null;
  appearances: number;
  availability_pct: number | null;
}

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lon: number;
  category: string | null;
  type: string | null;
}
