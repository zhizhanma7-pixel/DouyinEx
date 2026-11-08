import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { buildUserscript } from './build.js'

const output = new URL('../dist/douyinex.user.js', import.meta.url)
const shipped = await readFile(output)
const { outputFiles: [rebuilt] } = await buildUserscript({ write: false })
if (!shipped.equals(rebuilt.contents)) throw new Error('Userscript differs from a fresh source build. Run pnpm build.')

const hash = createHash('sha256').update(shipped).digest('hex')
await writeFile(new URL('douyinex.user.js.sha256', output), `${hash}  douyinex.user.js\n`)
console.log(`Verified douyinex.user.js · SHA-256 ${hash}`)
