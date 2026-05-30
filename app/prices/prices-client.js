"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Minus } from "lucide-react";

export function PricesClient() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("movers");
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/prices");
        const payload = await response.json();
        if (!response.ok) {
          setError(payload.error || "Unable to load price data.");
          return;
        }
        setProducts(payload.products || []);
      } catch {
        setError("Unable to load price data. Check your connection.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleExpanded(index) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const filtered = products.filter((product) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    const haystack = [product.name, product.brand, ...(product.vendors || [])].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "az") return textCompare(a.name, b.name);
    if (sort === "increases") {
      const aUp = a.priceChange !== null && a.priceChange > 0 ? a.priceChangePercent : -Infinity;
      const bUp = b.priceChange !== null && b.priceChange > 0 ? b.priceChangePercent : -Infinity;
      return bUp - aUp;
    }
    if (sort === "decreases") {
      const aDown = a.priceChange !== null && a.priceChange < 0 ? a.priceChangePercent : Infinity;
      const bDown = b.priceChange !== null && b.priceChange < 0 ? b.priceChangePercent : Infinity;
      return aDown - bDown;
    }
    const absA = a.priceChangePercent !== null ? Math.abs(a.priceChangePercent) : -1;
    const absB = b.priceChangePercent !== null ? Math.abs(b.priceChangePercent) : -1;
    return absB - absA;
  });

  const increases = products.filter((p) => p.priceChange !== null && p.priceChange > 0).length;
  const decreases = products.filter((p) => p.priceChange !== null && p.priceChange < 0).length;

  if (loading) {
    return (
      <div className="grid">
        <div className="panel" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p className="muted">Loading price data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid">
      {error ? <div className="panel" style={{ color: "var(--danger)" }}>{error}</div> : null}
      <div className="price-tracker-summary">
        <span>{products.length} products tracked</span>
        <span className="price-tracker-dot" />
        <span style={{ color: "var(--danger)" }}>{increases} with price increases</span>
        <span className="price-tracker-dot" />
        <span style={{ color: "var(--ok)" }}>{decreases} with decreases</span>
      </div>
      <div className="price-tracker-controls">
        <input
          className="input"
          placeholder="Search by product, brand, or vendor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="movers">Biggest movers</option>
          <option value="increases">Recent increases</option>
          <option value="decreases">Recent decreases</option>
          <option value="az">A-Z</option>
        </select>
      </div>
      {sorted.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p className="muted">{products.length === 0 ? "No price data available yet. Upload invoices with unit costs to start tracking." : "No products match your search."}</p>
        </div>
      ) : (
        <div className="price-tracker-grid">
          {sorted.map((product, index) => (
            <PriceCard
              key={index}
              product={product}
              expanded={expanded.has(index)}
              onToggle={() => toggleExpanded(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PriceCard({ product, expanded, onToggle }) {
  const hasChange = product.priceChange !== null && product.priceChange !== 0;
  const isUp = hasChange && product.priceChange > 0;
  const isDown = hasChange && product.priceChange < 0;
  const changeClass = isUp ? "up" : isDown ? "down" : "";
  const visibleHistory = expanded ? product.history : product.history.slice(-5);

  return (
    <div className="price-card">
      <div className="price-card-header">
        <div className="price-card-info">
          <strong className="price-card-name">{product.name}</strong>
          {product.brand || product.size ? (
            <span className="price-card-meta">
              {[product.brand, product.size].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </div>
        <div className="price-current">${Number(product.latestPrice).toFixed(2)}</div>
      </div>
      <div className="price-card-change-row">
        {hasChange ? (
          <span className={`price-change ${changeClass}`}>
            {isUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            <span>${Math.abs(product.priceChange).toFixed(2)}</span>
            <span>({Math.abs(product.priceChangePercent).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className="price-change neutral">
            <Minus size={14} />
            <span>No change</span>
          </span>
        )}
        <span className="price-card-seen">
          {product.lastSeen ? formatDate(product.lastSeen) : ""} {product.vendors?.length ? `· ${product.vendors[product.vendors.length - 1]}` : ""}
        </span>
      </div>
      {product.history.length > 1 ? (
        <div className="price-history">
          <button className="price-history-toggle" type="button" onClick={onToggle}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? "Hide history" : `View history (${product.history.length})`}
          </button>
          {(expanded || product.history.length <= 5) ? (
            <div className="price-history-list">
              {visibleHistory.map((entry, i) => (
                <div className="price-history-entry" key={i}>
                  <span className="price-history-date">{formatDate(entry.date)}</span>
                  <span className="price-history-cost">${Number(entry.unitCost).toFixed(2)}</span>
                  <span className="price-history-vendor">{entry.vendor}</span>
                  <Link className="price-history-link" href={`/review/${entry.invoiceId}`}>
                    {entry.invoiceNumber || "View"}
                  </Link>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function textCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}
