import "./globals.css";
import { MusicProvider } from "../context/MusicContext";
import { PWAProvider } from "../context/PWAContext";
import AppShell from "../components/AppShell";
import InstallModal from "../components/InstallModal";
import PWAUpdateToast from "../components/PWAUpdateToast";
import { Analytics } from "@vercel/analytics/next";

export const viewport = {
  themeColor: "#0b1326",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export const metadata = {
  title: "Ceepeefy — Studio Mode | Nocturne Audio",
  description: "Cinematic, high-fidelity music streaming progressive web application.",
  applicationName: "Ceepeefy",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ceepeefy",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        {/* Universal PWA meta tags & apple touch icon fallback */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ceepeefy" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-[#0b1326] font-sans antialiased text-on-surface selection:bg-primary selection:text-black overflow-hidden overscroll-none">
        <PWAProvider>
          <MusicProvider>
            <AppShell>{children}</AppShell>
          </MusicProvider>
          <InstallModal />
          <PWAUpdateToast />
        </PWAProvider>
        <Analytics />
      </body>
    </html>
  );
}
