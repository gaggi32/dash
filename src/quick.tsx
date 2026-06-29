import React from "react";
import ReactDOM from "react-dom/client";
import QuickAdd from "./quick/QuickAdd";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuickAdd />
  </React.StrictMode>,
);
