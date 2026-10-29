import Link from "next/link";

const collections = ["Collection 01", "Collection 02", "Collection 03"];

export const metadata = { title: "Catalog Preview | Apex", robots: { index: false, follow: false } };

export default function CatalogPreview() {
  return (
    <main className="container catalog">
      <Link className="back" href="/">← Home</Link>
      <p className="eyebrow">CATALOG / STRUCTURE PREVIEW</p>
      <h1>Find it quickly.<br /><em>Understand it clearly.</em></h1>
      <p className="lead">These are placeholder categories, not real merchandise. Supplier-approved descriptions and images will be added in a later review.</p>
      <div className="catalog-grid">
        {collections.map((title, index) => (
          <article className="catalog-card" key={title}>
            <div className="catalog-art" aria-hidden="true">0{index + 1}</div>
            <div className="catalog-info">
              <p className="eyebrow">PREVIEW CATEGORY</p>
              <h2>{title}</h2>
              <p>Approved content pending.</p>
            </div>
          </article>
        ))}
      </div>
      <p className="notice">Concept preview only. No checkout, ordering or live inventory.</p>
    </main>
  );
}
