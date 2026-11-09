import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs `fn(signal)` whenever `deps` change and exposes { status, data, error, reload }.
 * Each run owns an AbortController: when deps change or the component unmounts the previous request is aborted and its
 * late response is ignored, so an old response can never overwrite newer state (supplier switching, rapid filter changes).
 * `keepData` keeps the previous data visible while reloading (lists); otherwise data is cleared on every new run.
 */
export function useAsync(fn, deps, { enabled = true, keepData = false } = {}) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', data: null, error: null })
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', data: null, error: null })
      return undefined
    }
    const controller = new AbortController()
    let active = true
    setState((s) => ({ status: 'loading', data: keepData ? s.data : null, error: null }))
    Promise.resolve()
      .then(() => fnRef.current(controller.signal))
      .then((data) => {
        if (active) setState({ status: 'success', data, error: null })
      })
      .catch((error) => {
        if (!active || error?.canceled) return
        setState((s) => ({ status: 'error', data: keepData ? s.data : null, error }))
      })
    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, isLoading: state.status === 'loading', reload }
}
