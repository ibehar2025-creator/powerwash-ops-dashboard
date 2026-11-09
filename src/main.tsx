import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import "./index.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App failed to start", error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="mx-auto max-w-md p-6 pt-20 text-slate-900">
      <h1 className="text-xl font-bold">The app couldn't open</h1>
      <p className="mt-3 text-sm">Check your connection, then try opening it again.</p>
      <button type="button" className="primary-button mt-4" onClick={() => window.location.reload()}>Try again</button>
    </main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary><AuthGate><App /></AuthGate></AppErrorBoundary>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
