import "./globals.css";
import { MusicProvider } from "../context/MusicContext";
import AppShell from "../components/AppShell";

export const metadata = {
  title: "Ceepeefy — Studio Mode | Nocturne Audio",
  description: "Cinematic, high-fidelity music streaming web application built with Next.js.",
  icons: {
    icon: "/favicon.svg",
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
      </head>
      <body className="bg-[#0b1326] font-sans antialiased text-on-surface selection:bg-primary selection:text-black overflow-hidden">
        <MusicProvider>
          <AppShell>{children}</AppShell>
        </MusicProvider>
      </body>
    </html>
  );
}
