import { tauriApi } from "./tauriApi";
import type { KidockApi } from "./types";

/**
 * Chooses the backend. `VITE_API_MOCK=true` (e.g. `npm run dev:mock`) runs the
 * UI in a plain browser against in-memory sample files. The mock is imported
 * dynamically so it is not shipped in production builds.
 */
export async function loadApi(): Promise<KidockApi> {
  if (import.meta.env.VITE_API_MOCK === "true") {
    const [{ createMockApi }, { sampleSeed }] = await Promise.all([
      import("./mockApi"),
      import("./sampleFiles"),
    ]);
    return createMockApi(sampleSeed, { delayMs: 150 });
  }
  return tauriApi;
}
