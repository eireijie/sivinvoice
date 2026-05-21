"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, FileSearch, Search, Sparkles, UploadCloud, X } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const steps = [
  {
    kind: "welcome",
    title: "Welcome to SIV",
    eyebrow: "Quick tour",
    icon: Sparkles,
    copy: "This tour walks you through the real workflow. You will see where to upload invoices, review saved records, search the vault, and manage your workspace.",
    actions: ["Start on the dashboard", "Upload your first invoice", "Review and save the invoice record"]
  },
  {
    target: "dashboard",
    href: "/dashboard",
    title: "Dashboard",
    eyebrow: "Step 1",
    icon: Sparkles,
    copy: "The dashboard is the overview page. After invoices are saved, this shows how many invoices, searchable records, and vendors are in the vault.",
    actions: ["Check recent invoices", "Open invoices that still need review", "Use the Upload button when you are ready to add records"]
  },
  {
    target: "upload",
    href: "/upload",
    title: "Upload Invoice",
    eyebrow: "Step 2",
    icon: UploadCloud,
    copy: "This is where new invoice records begin. Upload a PDF or image, then SIV stores the original file and reads the invoice text.",
    actions: ["Choose a PDF or image", "Wait for OCR and extraction", "Continue to the review page that opens after processing"]
  },
  {
    target: "review",
    href: "/review",
    title: "Invoice Review",
    eyebrow: "Step 3",
    icon: FileSearch,
    copy: "Review is the approval queue. New invoices that still need correction or approval appear here.",
    actions: ["Open invoices waiting for review", "Check vendor, store, date, and invoice number", "Save the reviewed invoice when it looks right"]
  },
  {
    target: "search",
    href: "/search",
    title: "Search",
    eyebrow: "Step 4",
    icon: Search,
    copy: "Search is how you find saved invoices later. Search by product name, partial name, size, SKU, UPC, vendor, or invoice details.",
    actions: ["Type a product name, vendor, SKU, or UPC", "Use filters if the list is long", "Open the original invoice from a matching result"]
  },
  {
    target: "invoices",
    href: "/invoices",
    title: "Invoices",
    eyebrow: "Step 5",
    icon: CheckCircle2,
    copy: "The Invoices page is the file cabinet. Use it to view saved invoices, open original PDFs, add manual entries, or delete records.",
    actions: ["Open a saved invoice", "Add a manual invoice if needed", "Remove duplicate or incorrect records"]
  }
];

const emptyRect = { top: 0, left: 0, width: 0, height: 0 };

export function OnboardingTour({ label = "Tour", launchClassName = "button ghost tour-launch" }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [targetRect, setTargetRect] = useState(emptyRect);
  const [mounted, setMounted] = useState(false);

  const storageKey = user?.id ? `siv:onboarding:${user.id}` : "";
  const activeKey = user?.id ? `siv:onboarding-active:${user.id}` : "";
  const current = steps[stepIndex];
  const isWelcome = current.kind === "welcome";
  const Icon = current.icon;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("siv-tour-open", open);
    return () => {
      document.body.classList.remove("siv-tour-open");
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setUser(data.user || null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !user || !storageKey) return;
    const metadataComplete = Boolean(user.user_metadata?.siv_onboarding_completed_at);
    const localComplete = window.localStorage.getItem(storageKey) === "complete";
    const active = window.localStorage.getItem(activeKey) === "true";
    const snoozed = window.sessionStorage.getItem(`${activeKey}:snoozed`) === "true";
    const savedStep = Number(window.localStorage.getItem(`${activeKey}:step`));
    if (Number.isFinite(savedStep) && savedStep >= 0 && savedStep < steps.length) setStepIndex(savedStep);
    if (((!metadataComplete && !localComplete) || active) && !snoozed) {
      setOpen(true);
      window.localStorage.setItem(activeKey, "true");
    }
  }, [ready, user, storageKey, activeKey]);

  useEffect(() => {
    if (!activeKey || !open) return;
    window.localStorage.setItem(`${activeKey}:step`, String(stepIndex));
  }, [activeKey, open, stepIndex]);

  useLayoutEffect(() => {
    if (!open || isWelcome) {
      setTargetRect(emptyRect);
      return;
    }

    function updateTarget() {
      const element = document.querySelector(`[data-tour="${current.target}"]`);
      if (!element) {
        setTargetRect(emptyRect);
        return;
      }
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }

    updateTarget();
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [open, isWelcome, current.target]);

  async function completeTour() {
    setOpen(false);
    if (storageKey) window.localStorage.setItem(storageKey, "complete");
    if (activeKey) {
      window.localStorage.removeItem(activeKey);
      window.localStorage.removeItem(`${activeKey}:step`);
      window.sessionStorage.removeItem(`${activeKey}:snoozed`);
    }
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.updateUser({
        data: {
          ...(user?.user_metadata || {}),
          siv_onboarding_completed_at: new Date().toISOString()
        }
      });
    } catch {
      // Local completion still prevents repeated popups if metadata update fails.
    }
  }

  function openTour() {
    setStepIndex(0);
    setOpen(true);
    if (activeKey) {
      window.localStorage.setItem(activeKey, "true");
      window.sessionStorage.removeItem(`${activeKey}:snoozed`);
    }
  }

  function skipTour() {
    completeTour();
  }

  function closeForNow() {
    setOpen(false);
    if (activeKey) {
      window.localStorage.removeItem(activeKey);
      window.sessionStorage.setItem(`${activeKey}:snoozed`, "true");
    }
  }

  function next() {
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }

  function previous() {
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  function openCurrentPage() {
    if (current.href) router.push(current.href);
  }

  const tooltipStyle = isWelcome
    ? {}
    : {
        top: Math.min(Math.max(targetRect.top + targetRect.height / 2 - 118, 18), Math.max(window.innerHeight - 260, 18)),
        left: Math.max(16, Math.min(targetRect.left + targetRect.width + 22, window.innerWidth - 462))
      };

  const tourOverlay = open ? (
    <div className={isWelcome ? "tour-layer welcome" : "tour-layer"} role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <button className="tour-skip" type="button" onClick={skipTour}>Skip tour</button>
          <button className="tour-close" type="button" onClick={closeForNow} aria-label="Close tour">
            <X size={18} />
          </button>
          {!isWelcome && targetRect.width ? (
            <div
              className="tour-spotlight"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12
              }}
            />
          ) : null}
          <section className={isWelcome ? "tour-card tour-welcome-card" : "tour-card tour-popover"} style={tooltipStyle}>
            <div className="tour-top">
              <div className="gradient-icon"><Icon size={24} /></div>
              <div>
                <span>{current.eyebrow}</span>
                <h2 id="tour-title">{current.title}</h2>
              </div>
            </div>
            <p>{current.copy}</p>
            {current.actions?.length ? (
              <ul className="tour-checklist">
                {current.actions.map((action) => (
                  <li key={action}><CheckCircle2 size={15} />{action}</li>
                ))}
              </ul>
            ) : null}
            <div className="tour-progress" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}>
              {steps.map((step, index) => (
                <button
                  className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}
                  key={step.title}
                  onClick={() => setStepIndex(index)}
                  type="button"
                  aria-label={`Go to ${step.title}`}
                />
              ))}
            </div>
            <div className="tour-actions">
              <button className="button ghost" type="button" disabled={stepIndex === 0} onClick={previous}>
                <ChevronLeft size={16} />
                Back
              </button>
              {!isWelcome && current.href ? (
                <button className="button secondary" type="button" onClick={openCurrentPage}>
                  Open page
                </button>
              ) : null}
              {stepIndex === steps.length - 1 ? (
                <button className="button" type="button" onClick={completeTour}>
                  Finish
                  <CheckCircle2 size={16} />
                </button>
              ) : (
                <button className="button" type="button" onClick={next}>
                  Next
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </section>
        </div>
  ) : null;

  return (
    <>
      <button className={launchClassName} type="button" onClick={openTour}>
        <Sparkles size={16} />
        <span>{label}</span>
      </button>
      {mounted && tourOverlay ? createPortal(tourOverlay, document.body) : null}
    </>
  );
}
