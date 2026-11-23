import React from "react";
import ReactDOM from "react-dom/client";
import { ApiProvider } from "./api/context";
import { loadApi } from "./api";
import { App } from "./components/App";
import "./styles.css";

loadApi().then((api) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ApiProvider api={api}>
        <App />
      </ApiProvider>
    </React.StrictMode>,
  );
});
