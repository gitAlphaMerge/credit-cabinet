import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import "./redesign.css";
import "./vendor/animate-keyframes.css";
import "./motion.css";
import "./chat.css";
import "./cabinet.css";
import "./financing.css";
import "./journey-workspace.css";
import "./c10-polish.css";
import "./side-rail.css";
import "./graphite.css";
import "./palettes.css";
import "./appearance.css";
import "./hero-title.css";
import "./about.css";
import "./appearance";
import { startTabIdentity } from "./tabIdentity";
startTabIdentity();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
