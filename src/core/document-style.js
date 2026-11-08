/** @param {Document} document @param {string} css */
export function installDocumentStyle(document, css) {
  const Sheet = document.defaultView?.CSSStyleSheet
  if (Sheet && 'adoptedStyleSheets' in document && typeof Sheet.prototype.replaceSync === 'function') {
    const sheet = new Sheet()
    sheet.replaceSync(css)
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    return () => { document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet) }
  }
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  return () => style.remove()
}
