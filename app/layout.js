import "./globals.css";
import { ErrorBoundary } from "@/components/error-boundary";

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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
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
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
