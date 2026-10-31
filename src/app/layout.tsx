import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex | Concept Preview",
  description: "Non-transactional preview of a founding-supplier storefront.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand" aria-label="Apex home"><span aria-hidden="true">▲</span> APEX</Link>
            <nav aria-label="Main navigation" className="apex-navigation">
              <details className="apex-menu">
                <summary aria-label="Open navigation menu">☰ <span>Menu</span></summary>
                <div className="apex-menu-panel">
                  <Link href="/catalog">Catalog</Link>
                  <Link href="/#approach">Approach</Link>
                  <Link href="/account/profile">My profile</Link>
                  <Link href="/account/sign-in">Account sign in</Link>
                </div>
              </details>
            </nav>
            <span className="demo-chip">DEMO ONLY</span>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>APEX / WORKING CONCEPT</span>
            <span>No products, orders or payments are available.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
