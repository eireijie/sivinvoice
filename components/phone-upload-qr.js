"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Camera, ExternalLink, QrCode, X } from "lucide-react";

export function PhoneUploadQr({ mode = "invoice" }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState("");
  const uploadUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/mobile-upload?mode=${mode}`;
  }, [mode]);

  useEffect(() => {
    if (!open || !uploadUrl) return;
    QRCode.toDataURL(uploadUrl, {
      margin: 1,
      width: 280,
      color: {
        dark: "#071827",
        light: "#ffffff"
      }
    }).then(setQr).catch(() => setQr(""));
  }, [open, uploadUrl]);

  return (
    <>
      <section className="panel phone-upload-card">
        <div>
          <span className="badge"><Camera size={14} /> Phone upload</span>
          <h2>Scan from your phone</h2>
          <p className="muted">Open a clean upload-only screen on your phone for taking photos or attaching files.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => setOpen(true)}>
          <QrCode size={16} />
          Show QR
        </button>
      </section>

      {open ? (
        <div className="plan-modal-backdrop" role="dialog" aria-modal="true" aria-label="Phone upload QR code">
          <div className="panel phone-qr-modal">
            <div className="selected-files-header">
              <div>
                <span className="badge">Phone upload</span>
                <h2>Scan this QR code</h2>
                <p className="muted">Your phone will open a page that only allows file upload.</p>
              </div>
              <button className="button ghost icon-only" type="button" onClick={() => setOpen(false)} aria-label="Close QR code">
                <X size={18} />
              </button>
            </div>
            <div className="phone-qr-box">
              {qr ? <img src={qr} alt="Phone upload QR code" /> : <QrCode size={64} />}
            </div>
            <a className="button secondary" href={uploadUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open link
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
