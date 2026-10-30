import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apex | Concept Preview",
  description: "Non-transactional preview of a founding-supplier storefront.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <SiteHeader />
    {children}
    <footer className="site-footer">
      <div className="container footer-inner">
        <span>APEX / WORKING CONCEPT</span>
        <span>No products, orders or payments are available.</span>
      </div>
    </footer>
  </body></html>;
}
