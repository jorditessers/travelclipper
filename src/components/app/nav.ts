import {
  BarChart3,
  Bookmark,
  BookOpen,
  Building2,
  ClipboardCheck,
  Compass,
  LayoutDashboard,
  History,
  Sparkles,
  Megaphone,
  Link2,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/constants";

export type NavItem = { title: string; to: string; icon: LucideIcon };

export const NAV: Record<AppRole, NavItem[]> = {
  accommodation_partner: [
    { title: "Dashboard", to: "/accommodation/dashboard", icon: LayoutDashboard },
    { title: "Accommodations", to: "/accommodation/accommodations", icon: Building2 },
    { title: "Bookings", to: "/accommodation/bookings", icon: BookOpen },
    { title: "Analytics", to: "/accommodation/analytics", icon: BarChart3 },
    { title: "Settings", to: "/accommodation/settings", icon: Settings },
  ],
  distribution_partner: [
    { title: "Dashboard", to: "/distribution/dashboard", icon: LayoutDashboard },
    { title: "Discover", to: "/distribution/discover", icon: Compass },
    { title: "Saved", to: "/distribution/saved", icon: Bookmark },
    { title: "Links", to: "/distribution/links", icon: Link2 },
    { title: "Bookings", to: "/distribution/bookings", icon: BookOpen },
    { title: "Settings", to: "/distribution/settings", icon: Settings },
  ],
  admin: [
    { title: "Overview", to: "/admin/overview", icon: LayoutDashboard },
    { title: "Review queue", to: "/admin/review", icon: ClipboardCheck },
    { title: "Users", to: "/admin/users", icon: Users },
    { title: "Accommodations", to: "/admin/accommodations", icon: Building2 },
    { title: "Bookings", to: "/admin/bookings", icon: BookOpen },
    { title: "Distribution Partners", to: "/admin/partners", icon: Megaphone },
    { title: "KPI insights", to: "/admin/insights", icon: Sparkles },
    { title: "Audit log", to: "/admin/audit", icon: History },
    { title: "Settings", to: "/admin/settings", icon: Settings },
  ],
};

export const ROLE_LABEL: Record<AppRole, string> = {
  accommodation_partner: "Accommodation Partner",
  distribution_partner: "Distribution Partner",
  admin: "Admin",
};
