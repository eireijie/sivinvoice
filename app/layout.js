import "./globals.css";
import { Toaster } from "@/components/toaster";

export const metadata = {
  title: "SIV",
  description: "Secure invoice storage and search for stores",
  manifest: "/manifest.webmanifest",
  applicationName: "SIV",
  appleWebApp: {
    capable: true,
    title: "SIV",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" }
    ],
    apple: "/icons/apple-touch-icon.svg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
try {
  var theme = window.localStorage.getItem("siv-theme") || "light";
  document.documentElement.dataset.theme = theme;
} catch (_) {}
            `
          }}
        />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function () {});
  });
}
            `
          }}
        />
        <Toaster />
      </body>
    </html>
  );
}
