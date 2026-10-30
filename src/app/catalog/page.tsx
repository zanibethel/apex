import Link from "next/link";
import { readPublishedCatalog, readPublishedCategories } from "@/lib/supabase/public-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog Preview | Apex", robots: { index: false, follow: false } };

const previewCollections = ["Collection 01", "Collection 02", "Collection 03"];

export default async function CatalogPreview({searchParams}: {searchParams: Promise<{category?: string}>}) {
  const params = await searchParams;
  const categories = await readPublishedCategories();
  const selected = categories.find(category => category.id === params.category);
  const result = await readPublishedCatalog(selected?.id);
  return (
    <main className="container catalog">
      <Link className="back" href="/">← Home</Link>
      <p className="eyebrow">CATALOG / STRUCTURE PREVIEW</p>
      <h1>Find it quickly.<br /><em>Understand it clearly.</em></h1>
      <p className="lead">A protected technical preview of the public catalog. No checkout or live inventory is available.</p>
      {categories.length > 0 && <nav aria-label="Product categories" className="actions">
        <Link className="button secondary" href="/catalog">All products</Link>
        {categories.map(category => <Link className="button secondary" key={category.id}
          href={"/catalog?category=" + encodeURIComponent(category.id)}>{category.name}</Link>)}
      </nav>}
      {selected && <p className="eyebrow">Category: {selected.name}</p>}
      {result.state === "connected" ? (
        result.products.length > 0 ? (
          <div className="catalog-grid">
            {result.products.map((product) => (
              <article className="catalog-card" key={product.id}>
                <div className="catalog-art" aria-hidden="true">A</div>
                <div className="catalog-info">
                  <p className="eyebrow">PUBLIC CATALOG PREVIEW</p>
                  <h2>{product.name}</h2>
                  <p>{product.description ?? "Additional details pending review."}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="catalog-empty" role="status">
            <h2>Catalog connection established.</h2>
            <p>No published entries yet. Supplier-approved content will be added after onboarding and review.</p>
          </div>
        )
      ) : (
        <>
          <p className="notice">{result.state === "unconfigured" ? "Standalone UI preview — the Supabase connection is not configured in this environment." : "Catalog data is temporarily unavailable. This preview does not fall back to unverified merchandise."}</p>
          <div className="catalog-grid">
            {previewCollections.map((title, index) => (
              <article className="catalog-card" key={title}>
                <div className="catalog-art" aria-hidden="true">0{index + 1}</div>
                <div className="catalog-info">
                  <p className="eyebrow">DESIGN PLACEHOLDER</p>
                  <h2>{title}</h2>
                  <p>Not real merchandise.</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="notice">Concept preview only. No checkout, ordering or live inventory.</p>
    </main>
  );
}
