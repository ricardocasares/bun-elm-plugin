/** Ambient types for `import { Elm } from "./Main.elm"`. Add `"bun-elm-plugin/client"` to tsconfig `types`. */
declare module "*.elm" {
  export interface ElmApp {
    ports: Record<string, { subscribe?: (cb: (data: any) => void) => void; unsubscribe?: (cb: (data: any) => void) => void; send?: (data: any) => void }>;
  }
  export interface ElmModule {
    init: (options?: { node?: Element | null; flags?: unknown }) => ElmApp;
  }
  export interface ElmNamespace {
    [name: string]: ElmModule & ElmNamespace;
  }
  export const Elm: ElmNamespace;
  export default Elm;
}
