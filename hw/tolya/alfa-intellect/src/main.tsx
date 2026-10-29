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
import "./push-loading.css";
import "./hero-title.css";
import "./about.css";
import "./appearance";
import "./design-system.css";
import "./future-products.css";
import "./site-polish.css";
import "./hero-float.css";
import "./bank-typography.css";
import "./omega-cabinet.css";
import "./how-it-works.css";
import "./brand.css";
import "./design-system";
import { RequestActivity } from "./RequestActivity";
import { installRequestActivity } from "./request-activity";
import { startUiSounds } from "./ui-sounds";
startUiSounds();
installRequestActivity();
import { startTabIdentity } from "./tabIdentity";
startTabIdentity();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <RequestActivity />
    </ErrorBoundary>
  </React.StrictMode>,
);
import "./brand-cursor.css";

import "./ui-scale.css";

import "./cfa-preview.css";

import "./public-navigation.css";
