import { createContext, useContext, type ReactNode } from "react";
import type { KidockApi } from "./types";

const ApiContext = createContext<KidockApi | null>(null);

export function ApiProvider({ api, children }: { api: KidockApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): KidockApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside <ApiProvider>");
  return api;
}
