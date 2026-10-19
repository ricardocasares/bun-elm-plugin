/**
 * Client-side hot-swap runtime appended to every compiled Elm entry module.
 *
 * Adapted from vite-plugin-elm (https://github.com/hmsk/vite-plugin-elm, MIT) which in turn is
 * based on elm-hot by Keith Lazuka (https://github.com/klazuka/elm-hot, MIT).
 *
 * Differences from the Vite version:
 *  - Elm 0.19.1+ only (symbols are `$elm$...`), so no `eval`-based symbol lookup.
 *  - Bun has no `import.meta.hot.invalidate()`; a changed `init` falls back to `location.reload()`.
 *  - Every `import.meta.hot.*` call is written out in full so Bun's dead-code elimination can strip it.
 */
const TAG = "[bun-elm-plugin]";

const runtime = `
if (import.meta.hot) {
  const instances = import.meta.hot.data.instances || (import.meta.hot.data.instances = {})
  let uid = import.meta.hot.data.uid || 0

  if (Object.keys(instances).length === 0) console.log("${TAG} HMR enabled")

  const cancellers = []
  let initializingInstance = null
  let swappingInstance = null

  import.meta.hot.accept()

  import.meta.hot.dispose((data) => {
    data.instances = instances
    data.uid = uid

    _Scheduler_binding = () => _Scheduler_fail(new Error("${TAG} Inactive Elm instance."))

    if (cancellers.length) {
      console.log("${TAG} Killing " + cancellers.length + " running processes...")
      try {
        cancellers.forEach((cancel) => { cancel() })
      } catch (e) {
        console.warn("${TAG} Kill process error: ", e.message)
      }
    }
  })

  const getId = () => ++uid

  const findPublicModules = (parent, path) => {
    let modules = []
    Object.keys(parent).forEach((key) => {
      const child = parent[key]
      const currentPath = path ? path + '.' + key : key
      if ('init' in child) {
        modules.push({ path: currentPath, module: child })
      } else {
        modules = [ ...modules, ...findPublicModules(child, currentPath) ]
      }
    })
    return modules
  }

  const registerInstance = (domNode, flags, path, portSubscribes, portSends) => {
    const id = getId()
    const instance = {
      id, path, domNode, flags, portSubscribes, portSends,
      lastState: null,
      initialState: null
    }
    return instances[id] = instance
  }

  const isFullscreenApp = () =>
    typeof $elm$browser$Browser$application !== 'undefined' || typeof $elm$browser$Browser$document !== 'undefined'

  const wrapDomNode = (node) => {
    const dummyNode = document.createElement("div")
    dummyNode.setAttribute("data-elm-hot", "true")
    dummyNode.style.height = "inherit"
    const parentNode = node.parentNode
    parentNode.replaceChild(dummyNode, node)
    dummyNode.appendChild(node)
    return dummyNode
  }

  const wrapPublicModule = (path, module) => {
    const originalInit = module.init
    if (originalInit) {
      module.init = (args) => {
        let elm
        const portSubscribes = {}
        const portSends = {}
        let domNode = null
        let flags = undefined
        if (typeof args !== 'undefined') {
          domNode = args['node'] && !isFullscreenApp() ? wrapDomNode(args['node']) : document.body
          flags = args['flags']
        } else {
          domNode = document.body
        }
        initializingInstance = registerInstance(domNode, flags, path, portSubscribes, portSends)
        elm = originalInit(args)
        wrapPorts(elm, portSubscribes, portSends)
        initializingInstance = null
        return elm
      }
    } else {
      console.error("${TAG} Could not find a public module to wrap at path " + path)
    }
  }

  const swap = (Elm, instance) => {
    console.log("${TAG} Hot-swapping module:", instance.path)
    swappingInstance = instance

    const containerNode = instance.domNode
    while (containerNode.lastChild) {
      containerNode.removeChild(containerNode.lastChild)
    }

    const m = getAt(instance.path.split('.'), Elm)
    if (m) {
      const args = { flags: instance.flags }
      if (containerNode !== document.body) {
        const nodeForEmbed = document.createElement("div")
        containerNode.appendChild(nodeForEmbed)
        args.node = nodeForEmbed
      }
      const elm = m.init(args)

      Object.keys(instance.portSubscribes).forEach((portName) => {
        if (portName in elm.ports && 'subscribe' in elm.ports[portName]) {
          const handlers = instance.portSubscribes[portName]
          if (!handlers.length) return
          console.log("${TAG} Reconnect", handlers.length + " handlers(s) to port '" + portName + "' (" + instance.path + ").")
          handlers.forEach(elm.ports[portName].subscribe)
        } else {
          delete instance.portSubscribes[portName]
          console.log("${TAG} Port was removed:", portName)
        }
      })

      Object.keys(instance.portSends).forEach((portName) => {
        if (portName in elm.ports && 'send' in elm.ports[portName]) {
          instance.portSends[portName] = elm.ports[portName].send
        } else {
          delete instance.portSends[portName]
          console.log("${TAG} Port was removed:", portName)
        }
      })
    } else {
      console.log("${TAG} Module was removed:", instance.path)
    }
    swappingInstance = null
  }

  const wrapPorts = (elm, portSubscribes, portSends) => {
    const portNames = Object.keys(elm.ports || {})
    if (portNames.length) {
      portNames
        .filter(name => "subscribe" in elm.ports[name])
        .forEach((portName) => {
          const port = elm.ports[portName]
          const subscribe = port.subscribe
          const unsubscribe = port.unsubscribe
          elm.ports[portName] = Object.assign(port, {
            subscribe: (handler) => {
              if (!portSubscribes[portName]) {
                portSubscribes[portName] = [handler]
              } else {
                portSubscribes[portName].push(handler)
              }
              return subscribe.call(port, handler)
            },
            unsubscribe: (handler) => {
              const list = portSubscribes[portName]
              if (list && list.indexOf(handler) !== -1) {
                list.splice(list.lastIndexOf(handler), 1)
              } else {
                console.warn("${TAG} ports." + portName + ".unsubscribe: handler not subscribed")
              }
              return unsubscribe.call(port, handler)
            }
          })
        })

      portNames
        .filter(name => "send" in elm.ports[name])
        .forEach((portName) => {
          const port = elm.ports[portName]
          portSends[portName] = port.send
          elm.ports[portName] = Object.assign(port, {
            send: (val) => portSends[portName].call(port, val)
          })
        })
    }

    return portSubscribes
  }

  const isDebuggerModel = (model) =>
    model && (model.hasOwnProperty("expando") || model.hasOwnProperty("expandoModel")) && model.hasOwnProperty("state")

  const findNavKey = (rootModel) => {
    const queue = []
    if (isDebuggerModel(rootModel)) {
      queue.push({ value: rootModel['state'], keypath: ['state'] })
    } else {
      queue.push({ value: rootModel, keypath: [] })
    }

    while (queue.length !== 0) {
      const item = queue.shift()
      if (typeof item.value === "undefined" || item.value === null) continue
      if (item.value.hasOwnProperty("elm-hot-nav-key")) return item
      if (typeof item.value !== "object") continue

      for (const propName in item.value) {
        if (!item.value.hasOwnProperty(propName)) continue
        const newKeypath = item.keypath.slice()
        newKeypath.push(propName)
        queue.push({ value: item.value[propName], keypath: newKeypath })
      }
    }
    return null
  }

  const getAt = (keyPath, obj) => keyPath.reduce((xs, x) => (xs && xs[x]) ? xs[x] : null, obj)
  const removeNavKeyListeners = (navKey) => {
    window.removeEventListener("popstate", navKey.value)
    window.navigator.userAgent.indexOf("Trident") < 0 || window.removeEventListener("hashchange", navKey.value)
  }

  const serializeModel = (model) => JSON.stringify(model.state && model.state.a ? model.state.a : model)

  const initialize = _Platform_initialize
  _Platform_initialize = (flagDecoder, args, init, update, subscriptions, stepperBuilder) => {
    const instance = initializingInstance || swappingInstance
    let tryFirstRender = !!swappingInstance

    const hookedInit = (args) => {
      const initialStateTuple = init(args)
      if (swappingInstance) {
        let oldModel = swappingInstance.lastState
        const newModel = initialStateTuple.a

        if (serializeModel(newModel) !== swappingInstance.initialState) {
          console.log("${TAG} Initial state changed. Reloading page.")
          window.location.reload()
        }

        if (typeof $elm$browser$Browser$application !== "undefined" && typeof $elm$browser$Browser$Navigation !== "undefined") {
          const oldKeyLoc = findNavKey(oldModel)
          const newKeyLoc = findNavKey(newModel)
          let error = null
          if (newKeyLoc === null) {
            error = "could not find Browser.Navigation.Key in the new app model"
          } else if (oldKeyLoc === null) {
            error = "could not find Browser.Navigation.Key in the old app model"
          } else if (newKeyLoc.keypath.toString() !== oldKeyLoc.keypath.toString()) {
            error = "the location of the Browser.Navigation.Key in the model has changed."
          } else {
            removeNavKeyListeners(oldKeyLoc.value)
            const parentKeyPath = oldKeyLoc.keypath.slice(0, -1)
            const lastSegment = oldKeyLoc.keypath.slice(-1)[0]
            const oldParent = getAt(parentKeyPath, oldModel)
            oldParent[lastSegment] = newKeyLoc.value
          }

          if (error !== null) {
            console.error("${TAG} Hot-swapping", instance.path + " not possible: " + error)
            oldModel = newModel
          }
        }
        initialStateTuple.a = oldModel
        initialStateTuple.b = $elm$core$Platform$Cmd$none
      } else {
        initializingInstance.lastState = initialStateTuple.a
        initializingInstance.initialState = serializeModel(initialStateTuple.a)
      }

      return initialStateTuple
    }

    const hookedStepperBuilder = (sendToApp, model) => {
      let result
      if (tryFirstRender) {
        tryFirstRender = false
        try {
          result = stepperBuilder(sendToApp, model)
        } catch (e) {
          throw new Error("${TAG} Hot-swapping " + instance.path + " is not possible, please reload page. Error: " + e.message)
        }
      } else {
        result = stepperBuilder(sendToApp, model)
      }

      return (nextModel, isSync) => {
        if (instance) instance.lastState = nextModel
        return result(nextModel, isSync)
      }
    }

    return initialize(flagDecoder, args, hookedInit, update, subscriptions, hookedStepperBuilder)
  }

  const originalBinding = _Scheduler_binding
  _Scheduler_binding = (originalCallback) => originalBinding(function () {
    const cancel = originalCallback.apply(this, arguments)
    if (cancel) {
      cancellers.push(cancel)
      return () => {
        cancellers.splice(cancellers.indexOf(cancel), 1)
        return cancel()
      }
    }
  })

  const swapInstances = (Elm) => {
    const removedInstances = []
    Object.entries(instances).forEach(([id, instance]) => {
      if (instance.domNode.parentNode) {
        swap(Elm, instance)
      } else {
        removedInstances.push(id)
      }
    })

    removedInstances.forEach((id) => {
      delete instances[id]
    })

    findPublicModules(Elm).forEach((m) => {
      wrapPublicModule(m.path, m.module)
    })
  }

  swapInstances(Elm)

  // init calls made against the stub while a compile error overlay was showing.
  const pendingInits = import.meta.hot.data.pendingInits || []
  import.meta.hot.data.pendingInits = []
  pendingInits.forEach(({ path, args }) => {
    const m = getAt(path.split('.'), Elm)
    if (m) m.init(args)
    else console.error("${TAG} Module " + path + " is not exported by the compiled program")
  })
}
`;

// elm-hot needs a marker on Browser.Navigation.Key to find it inside the model.
// https://github.com/klazuka/elm-hot/blob/master/src/inject.js#L16
const markNavKey = (esm: string): string => {
  const needle = "function() { key.a(onUrlChange(_Browser_getUrl())); };";
  return esm.includes("$elm$browser$Browser$application")
    ? esm.replace(needle, `${needle}\n\tkey['elm-hot-nav-key'] = true;\n`)
    : esm;
};

/** Elm's `--debug` build warns on every load; silence it since the dev server reloads constantly. */
const trimDebugMessage = (code: string): string =>
  code.replace(/(console\.warn\('Compiled in DEBUG mode)/, "// $1");

export const injectHMR = (compiledESM: string): string =>
  trimDebugMessage(markNavKey(compiledESM)) + runtime;
