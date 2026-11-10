import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { SkinProvider } from "./components/Skin.tsx";
import "./style.css";
import "./theme.css";
import "./menu-art.css";
import "./mobile-feedback.css";
import "./mobile-viewport.css";
import "./board-hierarchy.css";
import "./portrait-board.css";
import "./table-objects.css";
import "./desktop-board.css";
import "./trade-controls.css";
import "./result-statistics.css";
import "./market-architecture.css";
import "./typography.css";
import "./hand-capacity.css";
import "./replay-controls.css";
import "./player-last-action.css";
import "./pixel-bazaar.css";
import "./hardware-theme.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SkinProvider>
      <App />
    </SkinProvider>
  </React.StrictMode>,
);
