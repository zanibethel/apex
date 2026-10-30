import Link from "next/link";

const values = [
  { number: "01", title: "Easy discovery", detail: "Simple category navigation, purposeful search and mobile-first layout." },
  { number: "02", title: "Clean information", detail: "Consistent product detail and transparent availability, when approved content is ready." },
  { number: "03", title: "Supplier operations", detail: "A future protected workspace for inventory, demo orders and reporting." },
];

export default function Home() {
  return (
    <main>
      <section className="hero container">
        <div>
          <p className="eyebrow">FOUNDING SUPPLIER / CONCEPT PREVIEW</p>
          <h1>Distinct by design.<br /><em>Simple by nature.</em></h1>
          <p className="lead">A premium, clear storefront experience built from the ground up. This first release shows the visual direction and navigation framework.</p>
          <div className="actions">
            <Link className="button primary" href="/catalog">Explore catalog concept</Link>
            <Link className="button secondary" href="/#approach">Our approach</Link>
          </div>
          <p className="notice">Preview only. No live products, ordering or payments.</p>
        </div>
        <div className="hero-mark" aria-hidden="true"><span>A</span><small>PRECISION / CLARITY</small></div>
      </section>
      <section id="approach" className="feature-band">
        <div className="container">
          <p className="eyebrow">OUR APPROACH</p>
          <h2>Premium should feel effortless.</h2>
          <div className="feature-grid">
            {values.map((value) => (
              <article key={value.number} className="feature-card">
                <span className="card-number">{value.number}</span>
                <h3>{value.title}</h3>
                <p>{value.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="container bottom-message">
        <div>
          <p className="eyebrow">BUILD STATUS</p>
          <h2>Foundation in progress.</h2>
          <p>Private supplier management and verified account access are available for testing. Public products, checkout and payments are not yet enabled.</p>
        </div>
        <Link href="/catalog">View the placeholder catalog →</Link>
      </section>
    </main>
  );
}
