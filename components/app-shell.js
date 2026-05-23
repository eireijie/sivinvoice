"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileSearch, Files, GripVertical, Search, Settings, Store, Upload } from "lucide-react";
import { AuthStatus } from "@/components/auth-status";
import { GlobalInvoiceDrop } from "@/components/global-invoice-drop";
import { OnboardingTour } from "@/components/onboarding-tour";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, tourId: "dashboard" },
  { href: "/upload", label: "Upload Invoice", icon: Upload, tourId: "upload" },
  { href: "/batches", label: "Batch Upload", icon: Files, tourId: "batches", paidOnly: true },
  { href: "/invoices", label: "Invoices", icon: FileSearch, tourId: "invoices" },
  { href: "/search", label: "Search", icon: Search, tourId: "search" },
  { href: "/vendors", label: "Vendor History", icon: Store, tourId: "vendors" }
];

const bottomNav = [
  { href: "/settings", label: "Settings", icon: Settings, tourId: "settings" }
];

export function AppShell({ children, eyebrow, title, action }) {
  const pathname = usePathname();
  const [businessName, setBusinessName] = useState("SIV");
  const [branding, setBranding] = useState({ logoUrl: null, primary: "#009B72", secondary: "#22C58F", theme: "siv" });
  const [planId, setPlanId] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(248);
  const [sidebarLayout, setSidebarLayout] = useState("vertical");

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem("siv-sidebar-width"));
    if (Number.isFinite(savedWidth)) setSidebarWidth(clampSidebarWidth(savedWidth));
    const savedLayout = window.localStorage.getItem("siv-sidebar-layout");
    if (savedLayout === "horizontal" || savedLayout === "vertical") setSidebarLayout(savedLayout);
    let mounted = true;
    function handleBusinessName(event) {
      setBusinessName(event.detail?.name?.trim() || "SIV");
    }
    function handleBranding(event) {
      setBranding((current) => ({ ...current, ...(event.detail?.branding || {}) }));
    }
    function handleSidebarLayout(event) {
      const nextLayout = event.detail?.layout;
      if (nextLayout === "horizontal" || nextLayout === "vertical") setSidebarLayout(nextLayout);
    }
    async function loadBusinessName() {
      try {
        const response = await fetch("/api/workspace");
        if (!response.ok) return;
        const payload = await response.json();
        const nextName = payload.workspace?.organization?.name?.trim();
        if (mounted && nextName) setBusinessName(nextName);
        if (mounted && payload.workspace?.organization?.branding) setBranding((current) => ({ ...current, ...payload.workspace.organization.branding }));
        if (mounted) setPlanId(payload.workspace?.storage?.plan?.id || payload.workspace?.billing?.plan || "free");
      } catch {
        // Keep the public brand as the fallback when account details are unavailable.
        if (mounted) setPlanId("free");
      }
    }
    window.addEventListener("siv:business-name", handleBusinessName);
    window.addEventListener("siv:branding", handleBranding);
    window.addEventListener("siv:sidebar-layout", handleSidebarLayout);
    loadBusinessName();
    return () => {
      mounted = false;
      window.removeEventListener("siv:business-name", handleBusinessName);
      window.removeEventListener("siv:branding", handleBranding);
      window.removeEventListener("siv:sidebar-layout", handleSidebarLayout);
    };
  }, []);

  function startSidebarResize(event) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    document.body.classList.add("sidebar-resizing");

    function onPointerMove(moveEvent) {
      const nextWidth = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
      setSidebarWidth(nextWidth);
      window.localStorage.setItem("siv-sidebar-width", String(nextWidth));
    }

    function onPointerUp() {
      document.body.classList.remove("sidebar-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const sidebarHorizontal = sidebarLayout === "horizontal";
  const sidebarCompact = sidebarWidth <= 126 && !sidebarHorizontal;
  const shellClassName = ["shell", sidebarCompact ? "sidebar-compact" : "", sidebarHorizontal ? "sidebar-horizontal" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={shellClassName}
      data-brand-theme={branding.theme || "siv"}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
        "--accent": branding.primary || "#009B72",
        "--accent-secondary": branding.secondary || "#22C58F",
        "--accent-dark": darkenHex(branding.primary || "#009B72", 0.28),
        "--accent-soft": hexToRgba(branding.primary || "#009B72", 0.12),
        "--shadow-accent": `0 8px 24px ${hexToRgba(branding.primary || "#009B72", 0.24)}`
      }}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {branding.logoUrl ? <img alt="" className="brand-logo" src={branding.logoUrl} /> : "SIV"}
          </div>
          <span title={businessName}>{businessName}</span>
        </div>
        <nav className="nav">
          {nav.filter((item) => !item.paidOnly || (planId && planId !== "free")).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link className={active ? "active" : ""} data-tour={item.tourId} href={item.href} key={item.href} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link className={pathname.startsWith("/review") ? "active" : ""} data-tour="review" href="/review" title="Invoice Review">
            <FileSearch size={18} />
            <span>Invoice Review</span>
          </Link>
        </nav>
        <nav className="nav nav-bottom">
          <OnboardingTour label="Guide" launchClassName="nav-tour-button" />
          {bottomNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href);
            return (
              <Link className={active ? "active" : ""} data-tour={item.tourId} href={item.href} key={item.href} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          className="sidebar-resize-handle"
          type="button"
          onPointerDown={startSidebarResize}
          title="Drag to resize sidebar"
          aria-label="Drag to resize sidebar"
        >
          <GripVertical size={18} />
        </button>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <h1>{title}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AuthStatus />
            {action}
          </div>
        </div>
        {children}
      </main>
      <GlobalInvoiceDrop />
    </div>
  );
}

function clampSidebarWidth(width) {
  return Math.min(320, Math.max(84, Math.round(width)));
}

function darkenHex(hex, amount) {
  const rgb = parseHex(hex);
  if (!rgb) return "#006B50";
  return rgbToHex(rgb.map((channel) => Math.max(0, Math.round(channel * (1 - amount)))));
}

function hexToRgba(hex, alpha) {
  const rgb = parseHex(hex);
  if (!rgb) return `rgba(0, 155, 114, ${alpha})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function parseHex(hex) {
  const match = String(hex || "").match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = match[1];
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
}

function rgbToHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
