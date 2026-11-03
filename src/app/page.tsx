import Link from "next/link";

const values = [
  { number: "01", title: "Explore the collection", detail: "Browse the catalog by category and discover the latest product details." },
  { number: "02", title: "Clear product information", detail: "Compare product descriptions, pricing, and availability in one place." },
  { number: "03", title: "One Apex experience", detail: "A streamlined storefront with dedicated account and supplier tools." },
];

export default function Home() {
  return <main className="apex-home">
    <section className="apex-brand-hero">
      <div className="container apex-brand-hero-inner">
        <div className="apex-hero-copy">
          <p className="eyebrow">APEX ANABOLICS / OFFICIAL STORE</p>
          <h1>ELEVATE<br />RESEARCH.<br /><span>RAISE THE STANDARD.</span></h1>
          <p className="lead">Precision-focused discovery. Explore the Apex catalog, find product details, and check availability in a streamlined shopping experience.</p>
          <div className="actions">
            <Link className="button primary" href="/catalog">Browse the catalog <span aria-hidden="true">→</span></Link>
            <Link className="button secondary" href="/#approach">Why Apex</Link>
          </div>
          <p className="notice">Checkout is currently unavailable. No orders or payments can be placed.</p>
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
      <div><p className="eyebrow">THE APEX EXPERIENCE</p><h2>One storefront. Dedicated workspaces.</h2><p>Explore product information or sign in to manage your account and supplier workspace.</p></div>
      <Link href="/account/sign-in">Account sign in →</Link>
    </section>
  </main>;
}
