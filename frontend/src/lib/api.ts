import axios from "axios";
import type {
  Activity,
  ActivityDetail,
  Availability,
  AvailabilityStatus,
  Conflict,
  DeleteScope,
  DirectMessage,
  DmContact,
  EditScope,
  GeocodeResult,
  Membership,
  MembershipRole,
  Message,
  Notification,
  PerformanceEntry,
  PlayerPerformance,
  RecurrenceSpec,
  RecurringCreateResult,
  Resource,
  ResourceType,
  SquadEntry,
  Team,
  TeamDetail,
  TeamPerformanceRow,
  User,
  UserCreatedOut,
  UserRole,
} from "./types";

const TOKEN_KEY = "club_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

/** Extract a readable message from an Axios error / FastAPI error body. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (detail?.message) return detail.message;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    return err.message;
  }
  return "Something went wrong";
}

// ---- Auth ----
export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const { data } = await api.post("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data.access_token as string;
}
export const getMe = () => api.get<User>("/auth/me").then((r) => r.data);
export const changePassword = (current_password: string, new_password: string) =>
  api.post("/auth/change-password", { current_password, new_password });

// ---- Users (admin) ----
export const listUsers = (params?: { role?: UserRole; search?: string }) =>
  api.get<User[]>("/users", { params }).then((r) => r.data);
export const createUser = (payload: {
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  password?: string | null;
  team_id?: string | null;
  shirt_number?: number | null;
  position?: string | null;
}) => api.post<UserCreatedOut>("/users", payload).then((r) => r.data);
export const updateUser = (id: string, payload: Partial<User>) =>
  api.patch<User>(`/users/${id}`, payload).then((r) => r.data);
export const resetUserPassword = (id: string) =>
  api.post<UserCreatedOut>(`/users/${id}/reset-password`).then((r) => r.data);
export const deleteUser = (id: string) => api.delete(`/users/${id}`);

// ---- Teams ----
export const listTeams = () => api.get<Team[]>("/teams").then((r) => r.data);
export const getTeam = (id: string) =>
  api.get<TeamDetail>(`/teams/${id}`).then((r) => r.data);
export const createTeam = (payload: {
  name: string;
  season?: string | null;
  category?: string | null;
}) => api.post<Team>("/teams", payload).then((r) => r.data);
export const updateTeam = (id: string, payload: Partial<Team>) =>
  api.patch<Team>(`/teams/${id}`, payload).then((r) => r.data);
export const deleteTeam = (id: string) => api.delete(`/teams/${id}`);

export const addMember = (
  teamId: string,
  payload: {
    user_id: string;
    role: MembershipRole;
    shirt_number?: number | null;
    position?: string | null;
  },
) => api.post<Membership>(`/teams/${teamId}/members`, payload).then((r) => r.data);
export const updateMember = (
  teamId: string,
  membershipId: string,
  payload: Partial<Membership>,
) =>
  api
    .patch<Membership>(`/teams/${teamId}/members/${membershipId}`, payload)
    .then((r) => r.data);
export const removeMember = (teamId: string, membershipId: string) =>
  api.delete(`/teams/${teamId}/members/${membershipId}`);

// Feeder / call-up links
export const addFeeder = (teamId: string, feederTeamId: string) =>
  api
    .post<Team>(`/teams/${teamId}/feeders`, { feeder_team_id: feederTeamId })
    .then((r) => r.data);
export const removeFeeder = (teamId: string, feederTeamId: string) =>
  api.delete(`/teams/${teamId}/feeders/${feederTeamId}`);

// Home dressing rooms assigned to a team (reserved automatically)
export const setTeamDressingRooms = (teamId: string, resourceIds: string[]) =>
  api
    .put<Resource[]>(`/teams/${teamId}/dressing-rooms`, {
      resource_ids: resourceIds,
    })
    .then((r) => r.data);

// ---- Resources ----
export const listResources = () =>
  api.get<Resource[]>("/resources").then((r) => r.data);
export const createResource = (payload: {
  name: string;
  type: ResourceType;
  capacity?: number | null;
  location?: string | null;
}) => api.post<Resource>("/resources", payload).then((r) => r.data);
export const updateResource = (id: string, payload: Partial<Resource>) =>
  api.patch<Resource>(`/resources/${id}`, payload).then((r) => r.data);
export const deleteResource = (id: string) => api.delete(`/resources/${id}`);

// ---- Activities ----
export interface ActivityCreatePayload {
  team_id: string;
  type: Activity["type"];
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  location_text?: string | null;
  opponent?: string | null;
  home_away?: Activity["home_away"];
  resource_ids: string[];
}
export const listActivities = (params?: {
  team_id?: string;
  date_from?: string;
  date_to?: string;
}) => api.get<Activity[]>("/activities", { params }).then((r) => r.data);
export const getActivity = (id: string) =>
  api.get<ActivityDetail>(`/activities/${id}`).then((r) => r.data);
export const getSquad = (id: string) =>
  api.get<SquadEntry[]>(`/activities/${id}/squad`).then((r) => r.data);
export const checkConflicts = (payload: ActivityCreatePayload) =>
  api.post<Conflict[]>("/activities/check-conflicts", payload).then((r) => r.data);
export const createActivity = (payload: ActivityCreatePayload, force = false) =>
  api
    .post<ActivityDetail>("/activities", payload, { params: { force } })
    .then((r) => r.data);
export const createRecurringActivity = (
  payload: ActivityCreatePayload & { recurrence: RecurrenceSpec },
  force = false,
) =>
  api
    .post<RecurringCreateResult>("/activities/recurring", payload, {
      params: { force },
    })
    .then((r) => r.data);
export const updateActivity = (
  id: string,
  payload: Partial<ActivityCreatePayload>,
  force = false,
  scope: EditScope = "one",
) =>
  api
    .patch<ActivityDetail>(`/activities/${id}`, payload, {
      params: { force, scope },
    })
    .then((r) => r.data);
export const cancelActivity = (id: string, scope: DeleteScope = "one") =>
  api
    .post<ActivityDetail>(`/activities/${id}/cancel`, null, { params: { scope } })
    .then((r) => r.data);
export const deleteActivity = (id: string, scope: DeleteScope = "one") =>
  api.delete(`/activities/${id}`, { params: { scope } });
export const setAvailability = (
  activityId: string,
  status: AvailabilityStatus,
  note?: string | null,
) =>
  api
    .put<Availability>(`/activities/${activityId}/availability`, { status, note })
    .then((r) => r.data);
export const setSelection = (
  activityId: string,
  user_id: string,
  selected: boolean,
) =>
  api
    .put<Availability>(`/activities/${activityId}/selection`, { user_id, selected })
    .then((r) => r.data);

// ---- Messages ----
export const listMessages = (teamId: string) =>
  api.get<Message[]>(`/teams/${teamId}/messages`).then((r) => r.data);
export const postMessage = (teamId: string, body: string) =>
  api.post<Message>(`/teams/${teamId}/messages`, { body }).then((r) => r.data);

// ---- Direct messages ----
export const listDmContacts = () =>
  api.get<DmContact[]>("/dm/contacts").then((r) => r.data);
export const getConversation = (userId: string) =>
  api.get<DirectMessage[]>(`/dm/conversation/${userId}`).then((r) => r.data);
export const sendDirectMessage = (userId: string, body: string) =>
  api
    .post<DirectMessage>(`/dm/conversation/${userId}`, { body })
    .then((r) => r.data);
export const dmUnreadCount = () =>
  api.get<{ count: number }>("/dm/unread-count").then((r) => r.data.count);

// ---- Calendar subscription ----
export const getCalendarSubscription = () =>
  api
    .get<{ token: string; path: string }>("/calendar/subscription")
    .then((r) => r.data);
export const resetCalendarSubscription = () =>
  api
    .post<{ token: string; path: string }>("/calendar/subscription/reset")
    .then((r) => r.data);

/** Build the absolute feed URL the calendar app subscribes to. */
export function calendarFeedUrl(path: string): string {
  const raw = import.meta.env.VITE_API_URL || "/api";
  let origin = window.location.origin;
  try {
    if (raw.startsWith("http")) origin = new URL(raw).origin;
  } catch {
    /* keep window origin */
  }
  return origin + path;
}

// ---- Performance (trainer/admin only) ----
export interface RatingInput {
  user_id: string;
  performance_rating?: number | null;
  mentality_rating?: number | null;
  note?: string | null;
}
export const rateSquad = (activityId: string, ratings: RatingInput[]) =>
  api
    .put<PerformanceEntry[]>(`/performance/activities/${activityId}/ratings`, {
      ratings,
    })
    .then((r) => r.data);
export const getActivityPerformance = (activityId: string) =>
  api
    .get<PerformanceEntry[]>(`/performance/activities/${activityId}`)
    .then((r) => r.data);
export const getPlayerPerformance = (userId: string, teamId?: string) =>
  api
    .get<PlayerPerformance>(`/performance/players/${userId}`, {
      params: teamId ? { team_id: teamId } : undefined,
    })
    .then((r) => r.data);
export const getTeamPerformance = (teamId: string) =>
  api.get<TeamPerformanceRow[]>(`/performance/teams/${teamId}`).then((r) => r.data);

// ---- Address geocoding ----
// Pass several queries (e.g. a club name AND its town) to look both up at once.
export const geocodeAddress = (q: string | string[]) => {
  const params = new URLSearchParams();
  (Array.isArray(q) ? q : [q]).forEach((s) => {
    if (s && s.trim()) params.append("q", s.trim());
  });
  return api
    .get<GeocodeResult[]>(`/geocode?${params.toString()}`)
    .then((r) => r.data);
};

// ---- Notifications ----
export const listNotifications = (unread_only = false) =>
  api
    .get<Notification[]>("/notifications", { params: { unread_only } })
    .then((r) => r.data);
export const markNotificationRead = (id: string) =>
  api.post(`/notifications/${id}/read`);
export const markAllNotificationsRead = () => api.post("/notifications/read-all");

// ---- Web Push ----
export const getVapidPublicKey = () =>
  api.get<{ key: string }>("/push/vapid-public-key").then((r) => r.data.key);
export const savePushSubscription = (sub: PushSubscriptionJSON) =>
  api.post("/push/subscribe", sub);
export const deletePushSubscription = (endpoint: string) =>
  api.post("/push/unsubscribe", { endpoint });
