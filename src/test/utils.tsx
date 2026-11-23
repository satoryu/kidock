import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ApiProvider } from "../api/context";
import type { KidockApi } from "../api/types";

/** Renders `ui` inside an ApiProvider; the provider survives `rerender`. */
export function renderWithApi(ui: ReactElement, api: KidockApi) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ApiProvider api={api}>{children}</ApiProvider>
    ),
  });
}

/** Wraps every method in a call counter, keeping the original behavior. */
export function spyApi(api: KidockApi) {
  const calls: Array<{ method: keyof KidockApi; args: unknown[] }> = [];
  const wrapped = Object.fromEntries(
    (Object.keys(api) as Array<keyof KidockApi>).map((method) => [
      method,
      (...args: unknown[]) => {
        calls.push({ method, args });
        return (api[method] as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as unknown as KidockApi;
  return { api: wrapped, calls };
}
