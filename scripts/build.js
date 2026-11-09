import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)

export async function buildUserscript({ dev = false, write = true } = {}) {
  const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  const license = await readFile(new URL('LICENSE', root), 'utf8')
  const metadata = [
    '// ==UserScript==',
    '// @name         DouyinEx',
    '// @namespace    https://github.com/zhizhanma7-pixel/DouyinEx',
    `// @version      ${version}`,
    '// @description  Local settings and enhancements for Douyin Web Live',
    '// @license      MIT',
    '// @match        https://live.douyin.com/*',
    '// @run-at       document-idle',
    '// @noframes',
    '// @grant        window.onurlchange',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_deleteValue',
    '// @grant        GM_registerMenuCommand',
    '// @grant        GM_unregisterMenuCommand',
    '// ==/UserScript==',
  ].join('\n')

  return build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: ['src/main.js'],
    outfile: dev ? 'dist/douyinex.dev.user.js' : 'dist/douyinex.user.js',
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: dev ? 'inline' : false,
    banner: { js: `${metadata}\n\n/*\n${license.trim()}\n*/` },
    write,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildUserscript({ dev: process.argv.includes('--dev') })
}
