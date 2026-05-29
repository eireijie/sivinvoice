"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, FileSearch, Files, GripVertical, Search, Settings, Store, Upload } from "lucide-react";
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

const defaultBranding = { logoUrl: null, primary: "#009B72", secondary: "#22C58F", theme: "siv" };
const mobileModeKey = "siv-mobile-mode-v2";

export function AppShell({ children, eyebrow, title, action }) {
  const pathname = usePathname();
  const [businessName, setBusinessName] = useState(() => cachedString("siv-business-name", "SIV"));
  const [branding, setBranding] = useState(() => cachedJson("siv-branding", defaultBranding));
  const [planId, setPlanId] = useState(() => cachedString("siv-plan-id", ""));
  const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebarWidth(cachedNumber("siv-sidebar-width", 248)));
  const [sidebarLayout, setSidebarLayout] = useState(() => {
    const saved = cachedString("siv-sidebar-layout", "vertical");
    return saved === "horizontal" || saved === "vertical" ? saved : "vertical";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem(mobileModeKey) !== "content";
  });

  useEffect(() => {
    let mounted = true;
    function handleBusinessName(event) {
      const nextName = event.detail?.name?.trim() || "SIV";
      window.localStorage.setItem("siv-business-name", nextName);
      setBusinessName(nextName);
    }
    function handleBranding(event) {
      setBranding((current) => {
        const nextBranding = { ...current, ...(event.detail?.branding || {}) };
        window.localStorage.setItem("siv-branding", JSON.stringify(nextBranding));
        return nextBranding;
      });
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
        const nextPlan = payload.workspace?.storage?.plan?.id || payload.workspace?.billing?.plan || "free";
        if (mounted && nextName) {
          setBusinessName(nextName);
          window.localStorage.setItem("siv-business-name", nextName);
        }
        if (mounted && payload.workspace?.organization?.branding) {
          const nextBranding = { ...defaultBranding, ...payload.workspace.organization.branding };
          setBranding(nextBranding);
          window.localStorage.setItem("siv-branding", JSON.stringify(nextBranding));
        }
        if (mounted) {
          setPlanId(nextPlan);
          window.localStorage.setItem("siv-plan-id", nextPlan);
        }
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
  const visibleNav = nav.filter((item) => !item.paidOnly || !planId || planId !== "free");
  const shellClassName = [
    "shell",
    sidebarCompact ? "sidebar-compact" : "",
    sidebarHorizontal ? "sidebar-horizontal" : "",
    mobileMenuOpen ? "mobile-menu-open" : "mobile-page-open"
  ]
    .filter(Boolean)
    .join(" ");

  function openMobilePage() {
    if (typeof window !== "undefined") window.sessionStorage.setItem(mobileModeKey, "content");
    setMobileMenuOpen(false);
  }

  function openMobileMenu() {
    if (typeof window !== "undefined") window.sessionStorage.setItem(mobileModeKey, "menu");
    setMobileMenuOpen(true);
  }

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
        "--shadow-accent": `0 8px 24px ${hexToRgba(branding.primary || "#009B72", 0.24)}`,
        "--sidebar": darkenHex(branding.primary || "#009B72", 0.74),
        "--sidebar-2": darkenHex(branding.secondary || "#22C58F", 0.68),
        "--sidebar-glow": hexToRgba(branding.secondary || "#22C58F", 0.2)
      }}
    >
      <section className="mobile-menu-screen" aria-label="Mobile navigation">
        <div className="mobile-menu-brand">
          <div className="brand-mark">
            {branding.logoUrl ? <img alt="" className="brand-logo" src={branding.logoUrl} /> : "SIV"}
          </div>
          <div>
            <strong title={businessName}>{businessName}</strong>
            <span>Invoice vault</span>
          </div>
        </div>
        <nav className="mobile-menu-nav">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link data-tour={item.tourId} href={item.href} key={item.href} onClick={openMobilePage}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <Link data-tour="review" href="/review" onClick={openMobilePage}>
            <FileSearch size={20} />
            <span>Invoice Review</span>
          </Link>
        </nav>
        <div className="mobile-menu-footer">
          <Link href="/settings" onClick={openMobilePage}>
            <Settings size={18} />
            <span>Settings</span>
          </Link>
          <OnboardingTour label="Guide" launchClassName="mobile-menu-guide" />
          <AuthStatus label="Exit" />
        </div>
      </section>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {branding.logoUrl ? <img alt="" className="brand-logo" src={branding.logoUrl} /> : "SIV"}
          </div>
          <span title={businessName}>{businessName}</span>
        </div>
        <nav className="nav">
          {visibleNav.map((item) => {
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
        <div className="mobile-content-header">
          <button type="button" onClick={openMobileMenu}>
            <ArrowLeft size={18} />
            Menu
          </button>
          <span>{title}</span>
        </div>
        <div className="topbar">
          <div>
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
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

function cachedString(key, fallback) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function cachedNumber(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
}

function cachedJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    return { ...fallback, ...JSON.parse(window.localStorage.getItem(key) || "{}") };
  } catch {
    return fallback;
  }
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
