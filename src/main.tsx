import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PublicQuotePage, QuoteAssistant } from "./components/QuoteAssistant";
import "./index.css";

const isPublicQuotePage = window.location.pathname.replace(/\/+$/, "") === "/quote";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPublicQuotePage ? <PublicQuotePage /> : <><App /><QuoteAssistant /></>}
  </StrictMode>,
);
