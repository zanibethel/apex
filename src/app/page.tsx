import Link from "next/link";

const values = [
  { number: "01", title: "Explore categories", detail: "A focused, mobile-friendly catalog with clear category navigation." },
  { number: "02", title: "Product clarity", detail: "Consistent product details and availability when approved catalog content is ready." },
  { number: "03", title: "Private workspaces", detail: "Secure supplier and administrator tools for managing the shared storefront." },
];

export default function Home() {
  return <main className="apex-home">
    <section className="apex-brand-hero">
      <div className="container apex-brand-hero-inner">
        <div className="apex-hero-copy">
          <p className="eyebrow">APEX ANABOLICS / CONCEPT PREVIEW</p>
          <h1>ELEVATE<br />RESEARCH.<br /><span>RAISE THE STANDARD.</span></h1>
          <p className="lead">Precision-focused discovery. A premium experience built for clarity, performance, and control.</p>
          <div className="actions">
            <Link className="button primary" href="/catalog">Explore catalog <span aria-hidden="true">→</span></Link>
            <Link className="button secondary" href="/#approach">Explore Apex</Link>
          </div>
          <p className="notice">Private concept preview. No live products, ordering or payments.</p>
        </div>
        <div className="apex-hero-art" aria-hidden="true"><span className="apex-hero-triangle">▲</span><span className="apex-hero-ring" /></div>
      </div>
    </section>
    <section id="approach" className="feature-band apex-brand-features">
      <div className="container">
        <p className="eyebrow">BUILT WITH INTENTION</p>
        <h2>Performance in every detail.</h2>
        <div className="feature-grid">{values.map(value => <article key={value.number} className="feature-card"><span className="card-number">{value.number}</span><h3>{value.title}</h3><p>{value.detail}</p></article>)}</div>
      </div>
    </section>
    <section className="container bottom-message">
      <div><p className="eyebrow">FOUNDATION / PRIVATE PREVIEW</p><h2>One storefront. Dedicated workspaces.</h2><p>Customer discovery and role-based supplier and admin tools are being tested together before launch.</p></div>
      <Link href="/account/sign-in">Account sign in →</Link>
    </section>
  </main>;
}
