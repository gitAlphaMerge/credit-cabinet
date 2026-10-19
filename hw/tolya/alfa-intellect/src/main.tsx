import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import "./redesign.css";
import "./motion.css";
import "./chat.css";
import "./cabinet.css";
import "./financing.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
