import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Building2,
  UserCog,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { dmUnreadCount } from "../lib/api";
import { Avatar, Logo } from "./ui";
import { NotificationBell } from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";

interface NavItem {
  to: string;
  label: string; // i18n key
  icon: typeof LayoutDashboard;
}

// The admin (club secretariaat) gets a management-focused console; trainers and
// players get the activity-focused experience.
const adminNav: NavItem[] = [
  { to: "/", label: "nav.overview", icon: LayoutDashboard },
  { to: "/teams", label: "nav.teams", icon: Users },
  { to: "/admin/users", label: "nav.people", icon: UserCog },
  { to: "/admin/resources", label: "nav.facilities", icon: Building2 },
];

const staffNav: NavItem[] = [
  { to: "/", label: "nav.dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "nav.calendar", icon: CalendarDays },
  { to: "/teams", label: "nav.teams", icon: Users },
  { to: "/messages", label: "nav.messages", icon: MessagesSquare },
];

// Trainers additionally get the per-player performance overview (players don't).
const trainerNav: NavItem[] = [
  { to: "/", label: "nav.dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "nav.calendar", icon: CalendarDays },
  { to: "/teams", label: "nav.teams", icon: Users },
  { to: "/performance", label: "nav.performance", icon: BarChart3 },
  { to: "/messages", label: "nav.messages", icon: MessagesSquare },
];

const SIDEBAR_KEY = "sidebar-collapsed";

export function Layout() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop-only: remember whether the user retracted the left menu to a rail.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "1",
  );
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const { data: dmUnread = 0 } = useQuery({
    queryKey: ["dm-unread"],
    queryFn: dmUnreadCount,
    refetchInterval: 20000,
    enabled: !!user && user.role !== "admin",
  });
  if (!user) return null;
  const me = user; // narrowed; keeps the nested render closure non-null

  const items =
    me.role === "admin"
      ? adminNav
      : me.role === "trainer"
        ? trainerNav
        : staffNav;

  function handleLogout() {
    logout();
    navigate("/login");
  }

  // The body is always laid out at w-64 — the container clips it to a w-16 rail
  // when `rail` is set, so icons never move and nothing reflows. Labels just
  // fade out. `showBrand` is for the mobile drawer (it overlays the header).
  function renderSidebar(rail: boolean, showBrand: boolean) {
    const fade = clsx("transition-opacity duration-150", rail && "opacity-0");
    return (
      <div className="flex h-full w-64 flex-col">
        {showBrand && (
          <div className="flex items-center gap-2.5 px-5 py-5">
            <Logo size={36} className="shrink-0" />
            <div className="leading-tight">
              <p className="font-bold text-slate-900">KSV Jabbeke</p>
              <p className="text-xs text-slate-400">{t("nav.tagline")}</p>
            </div>
          </div>
        )}

        {/* Only the navigation scrolls; the profile/logout block stays pinned. */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {items.map((item) => {
            const Icon = item.icon;
            const hasBadge = item.to === "/messages" && dmUnread > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={rail ? t(item.label) : undefined}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )
                }
              >
                <span className="relative shrink-0">
                  <Icon size={18} />
                  {hasBadge && rail && (
                    <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-white" />
                  )}
                </span>
                <span className={clsx("flex-1 truncate", fade)}>
                  {t(item.label)}
                </span>
                {hasBadge && (
                  <span
                    className={clsx(
                      "flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white",
                      fade,
                    )}
                  >
                    {dmUnread > 9 ? "9+" : dmUnread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={me.full_name} />
            <div className={clsx("min-w-0 flex-1 leading-tight", fade)}>
              <p className="truncate text-sm font-semibold text-slate-800">
                {me.full_name}
              </p>
              <p className="text-xs text-slate-400">{t(`roles.${me.role}`)}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title={rail ? t("nav.signOut") : undefined}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut size={18} className="shrink-0" />
            <span className={fade}>{t("nav.signOut")}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Full-width header — spans across the top, above the menu bar. */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2">
          {/* Mobile: open the drawer */}
          <button
            onClick={() => setMobileOpen(true)}
            title={t("nav.openMenu")}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <Menu size={20} />
          </button>
          {/* Desktop: retract the left menu to an icon rail (or expand it) */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? t("nav.expandMenu") : t("nav.collapseMenu")}
            className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <Logo size={32} className="shrink-0" />
          <span className="font-bold text-slate-900">KSV Jabbeke</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <NotificationBell />
        </div>
      </header>

      {/* Row beneath the header: sidebar + main content. */}
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar — pinned below the header with its own internal
            scroll. Collapsing clips it to a w-16 icon rail (no content reflow). */}
        <aside
          className={clsx(
            "sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-in-out lg:block",
            collapsed ? "w-16" : "w-64",
          )}
        >
          {renderSidebar(collapsed, false)}
        </aside>

        {/* Mobile sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-4 z-10 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
              {renderSidebar(false, true)}
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
