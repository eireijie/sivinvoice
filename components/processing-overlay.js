"use client";

import { CheckCircle2, Loader2 } from "lucide-react";

export function ProcessingOverlay({ active, title, detail, steps = [] }) {
  if (!active) return null;

  return (
    <div className="processing-backdrop" role="status" aria-live="polite">
      <section className="processing-card">
        <div className="processing-orbit">
          <div className="processing-ring" />
          <Loader2 className="processing-spinner" size={34} />
        </div>
        <div>
          <div className="section-label"><span /> Processing</div>
          <h2>{title}</h2>
          <p className="muted">{detail}</p>
        </div>
        <div className="processing-steps">
          {steps.map((step, index) => (
            <div className="processing-step" key={step}>
              {index === 0 ? <Loader2 className="processing-step-spin" size={16} /> : <CheckCircle2 size={16} />}
              <span>{step}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
