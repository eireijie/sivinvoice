"use client";

import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#666", marginTop: 8 }}>An unexpected error occurred. Try reloading the page.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "8px 20px", cursor: "pointer", borderRadius: 6, border: "1px solid #ccc", background: "#fff" }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
