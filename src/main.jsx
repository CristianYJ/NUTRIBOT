import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PwaWelcome from "./PwaWelcome.jsx";
import PwaInstall from "./PwaInstall.jsx";
import { initializePwa } from "./pwa.js";
import "./pwa.css";
import "./styles.css";
import "./template-theme.css";
import "./account.css";
initializePwa();
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PwaWelcome>
      <PwaInstall />
      <App />
    </PwaWelcome>
  </React.StrictMode>,
);

import "./pantry-chat.css";
import "./landing.css";
