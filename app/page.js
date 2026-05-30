import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, Search, ShieldCheck, UploadCloud } from "lucide-react";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

const storeTypes = ["Independent stores", "Retail teams", "Managers", "Bookkeepers", "Receiving teams"];

const workflow = [
  {
    icon: UploadCloud,
    title: "Upload invoices",
    copy: "Add PDFs, scans, or photos from one store or many. Every original stays saved in your vault."
  },
  {
    icon: ShieldCheck,
    title: "Keep records safe",
    copy: "Vendor, date, invoice number, totals, and item details stay organized with the original file."
  },
  {
    icon: Search,
    title: "Find what you need",
    copy: "Look up old invoices by vendor, date, invoice number, item, or cost and open the original."
  }
];

const comparisonRows = [
  ["Search across years of invoice history", true, false],
  ["Records organized by store and vendor", true, false],
  ["Open the original invoice from any record", true, false],
  ["Cost and item history available on demand", true, false],
  ["Workspace access for the people who need it", true, false],
  ["Original invoices kept in one searchable place", true, false]
];

export default function HomePage() {
  return (
    <main className="marketing">
      <div className="marketing-nav-wrap">
        <nav className="marketing-nav">
          <Link className="marketing-brand" href="/">
            <span className="brand-mark">SIV</span>
            <span>Secure Invoice Vault</span>
          </Link>
          <div className="marketing-links">
            <a href="#workflow">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login">Log in</Link>
            <Link className="button" href="/signup">Create account <ArrowRight size={16} /></Link>
          </div>
        </nav>
      </div>

      <section className="hero-section product-hero">
        <div className="hero-text">
          <div className="hero-kicker"><span /> Secure invoice vault</div>
          <h1>One secure home for every invoice.</h1>
          <p>
            SIV helps stores keep years of invoices safe, organized, and easy to pull up when someone needs a record.
          </p>
          <form className="hero-email" action="/signup">
            <input aria-label="Email" name="email" placeholder="Work email" type="email" />
            <button type="submit">Get started now <ArrowRight size={16} /></button>
          </form>
          <div className="hero-trust">
            <CheckCircle2 size={15} />
            <span>Save invoices once and keep them easy to find later</span>
          </div>
          <div className="hero-proof">
            <div><strong>5+ yrs</strong><span>of invoice history</span></div>
            <div><strong>&lt; 5s</strong><span>to find any record</span></div>
            <div><strong>100%</strong><span>originals preserved</span></div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-visual-glow" />
          <div className="hero-orbit" aria-hidden="true" />
          <div className="floating-file floating-file-one" aria-hidden="true">
            <span>INV</span>
            <strong>10428</strong>
          </div>
          <div className="floating-file floating-file-two" aria-hidden="true">
            <span>PDF</span>
            <strong>Saved</strong>
          </div>
          <div className="invoice-console">
            <div className="invoice-console-header">
              <div>
                <span>Invoice Vault</span>
                <strong>May vendor records</strong>
              </div>
              <div className="console-status">Ready</div>
            </div>
            <div className="console-metrics">
              <div><strong>248</strong><span>invoices saved</span></div>
              <div><strong>12</strong><span>vendors</span></div>
              <div><strong>3</strong><span>stores</span></div>
            </div>
            <div className="hero-preview-search">
              <Search size={14} />
              <span>Search vendor, invoice number, date...</span>
            </div>
            <div className="hero-preview-rows">
              <PreviewRow accent name="Vendor invoice INV-10428" sub="May 2, 2026 · original PDF saved" badge="Open" />
              <PreviewRow name="April vendor statement" sub="Stored with date, total, and vendor" badge="Saved" />
              <PreviewRow name="Monthly cost records" sub="Item and total history kept together" badge="History" />
              <PreviewRow name="Scanned invoice archive" sub="Original files stay attached" badge="Vault" />
            </div>
            <div className="activity-rail" aria-hidden="true">
              <span />
              <p>Invoice stored</p>
              <strong>available anytime</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="logo-strip" aria-label="Ideal users">
        <span>Designed for</span>
        <div>
          {storeTypes.map((type) => <strong key={type}>{type}</strong>)}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading">
          <div className="section-label"><span /> Simple record keeping</div>
          <h2>Turn paper trails into organized records.</h2>
        </div>
        <div className="workflow-grid">
          {workflow.map((item, index) => <WorkflowCard key={item.title} index={index + 1} {...item} />)}
        </div>
      </section>

      <section className="dark-band proof-band">
        <div>
          <div className="section-label inverted"><span /> Everyday invoice access</div>
          <h2>Stop losing time in folders and file cabinets.</h2>
          <p>Find old vendor records, check costs, and reopen the exact PDF or image without digging through boxes, folders, or message threads.</p>
        </div>
        <div className="stat-row">
          <MiniStat value="5+ yrs" label="avg. invoice history" />
          <MiniStat value="< 5s" label="to find any record" />
          <MiniStat value="100%" label="originals preserved" />
        </div>
      </section>

      <section className="comparison-section" id="comparison">
        <div className="section-heading">
          <div className="section-label"><span /> Why SIV</div>
          <h2>Document storage is not enough.</h2>
          <p>Folders can hold files, but stores still need a cleaner way to find the right invoice, vendor, date, cost, or item record.</p>
        </div>
        <div className="comparison-card">
          <div className="comparison-row comparison-head">
            <span>Capability</span>
            <strong>SIV</strong>
            <strong>Folders and manual search</strong>
          </div>
          {comparisonRows.map(([label, siv, manual]) => (
            <div className="comparison-row" key={label}>
              <span>{label}</span>
              <CheckCell active={siv} />
              <CheckCell active={manual} />
            </div>
          ))}
        </div>
      </section>

      <section className="testimonial-section">
        <article>
          <p>&ldquo;Instead of opening scan after scan, the team finds the right invoice and opens the original record immediately.&rdquo;</p>
          <span>Store Manager &mdash; Independent liquor retailer</span>
        </article>
        <article>
          <p>&ldquo;The value is not just saving PDFs. It is keeping invoice history safe, organized, and easy to access when you actually need it.&rdquo;</p>
          <span>Owner &mdash; Multi-location beverage store</span>
        </article>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-label"><span /> Pricing</div>
        <h2>Simple pricing for stores that want invoice records under control.</h2>
        <div className="pricing-grid">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId];
            return (
              <Price
                copy={plan.tagline}
                featured={plan.id === "pro"}
                items={plan.features}
                key={plan.id}
                name={plan.name}
                planId={plan.id}
                price={plan.price}
              />
            );
          })}
        </div>
      </section>

      <section className="final-cta">
        <div>
          <h2>Give every invoice a permanent home.</h2>
          <p>Start by uploading invoices and giving your team one place to store, find, and reopen every record.</p>
        </div>
        <Link className="button" href="/signup">Get started now <ArrowRight size={16} /></Link>
      </section>

      <footer className="marketing-footer">
        <div className="marketing-footer-inner">
          <span className="marketing-footer-copy">© 2026 Secure Invoice Vault. Invoice storage and record lookup for stores.</span>
          <div className="marketing-footer-links">
            <a href="#workflow">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Create account</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PreviewRow({ name, sub, badge, accent = false }) {
  return (
    <div className={accent ? "hero-preview-row accent" : "hero-preview-row"}>
      <div>
        <div className="hero-preview-row-name">{name}</div>
        <div className="hero-preview-row-sub">{sub}</div>
      </div>
      <div className="hero-preview-row-badge">{badge}</div>
    </div>
  );
}

function WorkflowCard({ icon: Icon, index, title, copy }) {
  return (
    <article className="workflow-card">
      <div className="workflow-card-top">
        <div className="gradient-icon"><Icon size={24} /></div>
        <span>{String(index).padStart(2, "0")}</span>
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}

function MiniStat({ value, label }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function CheckCell({ active }) {
  return (
    <div className={active ? "comparison-check active" : "comparison-check"}>
      {active ? <CheckCircle2 size={18} /> : <span />}
    </div>
  );
}

function Price({ name, price, copy, items, planId, featured = false }) {
  const isFree = price === "$0";
  return (
    <article className={featured ? "price-card featured" : "price-card"}>
      <h3>{name}</h3>
      <strong>{price}<span>{price.startsWith("$") ? "/mo" : ""}</span></strong>
      <p>{copy}</p>
      <ul>
        {items.map((item) => <li key={item}><CheckCircle2 size={16} />{item}</li>)}
      </ul>
      <Link className={featured ? "button" : "button secondary"} href={`/signup?plan=${planId}`}>
        {isFree ? "Get started free" : "Create account"}
      </Link>
    </article>
  );
}
