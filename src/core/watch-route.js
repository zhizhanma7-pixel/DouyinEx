/**
 * @param {Window} win
 * @param {() => void} update
 */
export function watchRoute(win, update) {
  win.addEventListener('popstate', update)
  win.addEventListener('urlchange', update)
  // The interval covers pushState and replaceState when Tampermonkey's hook is unavailable.
  const timer = win.onurlchange === null ? undefined : win.setInterval(update, 500)

  return () => {
    win.removeEventListener('popstate', update)
    win.removeEventListener('urlchange', update)
    if (timer !== undefined) win.clearInterval(timer)
  }
}
