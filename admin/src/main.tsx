import "./demo/polyfill";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router";
import { IS_DEMO, DemoGate } from "@demo";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "@fontsource/rye/400.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/dropzone/styles.css";
import { AuthProvider } from "./lib/auth";
import App from "./App";

// Hash routing in demo mode so it works from any static URL.
const Router = IS_DEMO ? HashRouter : BrowserRouter;

const theme = createTheme({
  primaryColor: "grape",
  defaultRadius: "md",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-right" />
      <ModalsProvider>
        <AuthProvider>
          <DemoGate>
            <Router>
              <App />
            </Router>
          </DemoGate>
        </AuthProvider>
      </ModalsProvider>
    </MantineProvider>
  </React.StrictMode>,
);
