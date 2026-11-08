/** @param {Document} document */
export function createLocalDownload(document) {
  const urls = document.defaultView?.URL
  const link = document.createElement('a')
  link.hidden = true
  let address = ''

  function clear() {
    if (address) urls?.revokeObjectURL(address)
    address = ''
    link.removeAttribute('href')
    link.hidden = true
  }

  return {
    link,
    clear,
    /** @param {Blob} blob @param {string} kind @param {string} extension */
    prepare(blob, kind, extension) {
      if (!urls || typeof urls.createObjectURL !== 'function') return false
      try {
        const next = urls.createObjectURL(blob)
        clear()
        address = next
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        link.download = `douyinex-${kind}-${timestamp}.${extension}`
        link.href = address
        link.textContent = `下载 ${extension.toUpperCase()}`
        link.hidden = false
        return true
      } catch {
        return false
      }
    },
  }
}
