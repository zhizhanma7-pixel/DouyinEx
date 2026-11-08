/** @param {Document} document @param {string} text @param {() => void} onClick */
export function actionButton(document, text, onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = text
  button.addEventListener('click', onClick)
  return button
}
