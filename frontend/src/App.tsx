import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import type { UserRole } from "./lib/types";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CalendarPage from "./pages/CalendarPage";
import TeamsPage from "./pages/TeamsPage";
import TeamDetailPage from "./pages/TeamDetailPage";
import ActivityDetailPage from "./pages/ActivityDetailPage";
import PlayerPerformancePage from "./pages/PlayerPerformancePage";
import PerformancePage from "./pages/PerformancePage";
import MessagesPage from "./pages/MessagesPage";
import UsersPage from "./pages/admin/UsersPage";
import ResourcesPage from "./pages/admin/ResourcesPage";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";

/** Home route: admins get the management console, everyone else the dashboard. */
function HomeRoute() {
  const { user } = useAuth();
  return user?.role === "admin" ? <AdminOverviewPage /> : <DashboardPage />;
}

function RequireAuth({
  children,
  roles,
}: {
  children: JSX.Element;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Loading your club…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role))
    return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <Loading />
          ) : user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage />
          )
        }
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRoute />} />
        <Route
          path="/calendar"
          element={
            <RequireAuth roles={["trainer", "player"]}>
              <CalendarPage />
            </RequireAuth>
          }
        />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/teams/:teamId" element={<TeamDetailPage />} />
        <Route
          path="/activities/:activityId"
          element={
            <RequireAuth roles={["trainer", "player"]}>
              <ActivityDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/performance"
          element={
            <RequireAuth roles={["trainer", "admin"]}>
              <PerformancePage />
            </RequireAuth>
          }
        />
        <Route
          path="/players/:userId/performance"
          element={
            <RequireAuth roles={["trainer", "admin"]}>
              <PlayerPerformancePage />
            </RequireAuth>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireAuth roles={["trainer", "player"]}>
              <MessagesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth roles={["admin"]}>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/resources"
          element={
            <RequireAuth roles={["admin"]}>
              <ResourcesPage />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
