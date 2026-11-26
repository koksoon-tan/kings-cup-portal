import "./demo/polyfill";
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/rye/400.css";
import "@fontsource/barlow-condensed/400.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./styles.css";
import { AccountProvider } from "./lib/account";
import { DemoGate } from "@demo";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoGate>
      <AccountProvider>
        <App />
      </AccountProvider>
    </DemoGate>
  </React.StrictMode>,
);
