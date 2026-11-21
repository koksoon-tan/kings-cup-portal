import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/dropzone/styles.css";
import { AuthProvider } from "./lib/auth";
import App from "./App";

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
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ModalsProvider>
    </MantineProvider>
  </React.StrictMode>,
);
