/**
 * Module served in place of a program that failed to compile (dev server only).
 *
 * It draws the Elm error report full-screen, keeps the dependency imports alive so Bun keeps
 * watching them, and exports a stub `Elm` whose `init` calls are remembered in
 * `import.meta.hot.data.pendingInits`; the real module replays them once it compiles.
 */
export const errorModule = (html: string, dependencies: string[]): string => `
${dependencies.map((dep) => `import ${JSON.stringify(dep)};`).join("\n")}

const pendingInits = import.meta.hot.data.pendingInits || (import.meta.hot.data.pendingInits = [])
const stubApp = { ports: new Proxy({}, { get: () => ({ subscribe() {}, unsubscribe() {}, send() {} }) }) }
const stub = (path) => new Proxy(
  { init: (args) => { pendingInits.push({ path, args }); return stubApp } },
  { get: (target, key) => key in target ? target[key] : (typeof key === "string" ? stub(path ? path + "." + key : key) : undefined) },
)
export const Elm = stub("")
export default Elm

import.meta.hot.accept()

const ID = "bun-elm-plugin-error"
const existing = document.getElementById(ID)
if (existing) existing.remove()
const overlay = document.createElement("div")
overlay.id = ID
overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;overflow:auto;background:rgba(20,22,27,.97);color:#d7dae0;padding:32px;box-sizing:border-box;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"
overlay.innerHTML = '<div style="color:#ff6b6b;font-weight:bold;margin-bottom:16px;font-size:14px">Elm compile error</div><pre style="margin:0;white-space:pre;tab-size:4">' + ${JSON.stringify(html)} + '</pre>'
document.body.appendChild(overlay)

import.meta.hot.dispose(() => { overlay.remove() })
`;
