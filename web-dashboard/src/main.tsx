import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { StatusProvider } from "./components/StatusRegion";
import { installBluekeyErrorReporting } from "./lib/bluekeyErrorReporter";
import "./styles.css";

installBluekeyErrorReporting();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StatusProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StatusProvider>
  </React.StrictMode>,
);
