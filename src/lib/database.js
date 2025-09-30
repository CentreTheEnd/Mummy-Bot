import { watchFile, unwatchFile } from 'fs'
import { fileURLToPath } from 'url'
import { JSONFilePreset } from 'lowdb/node'
import path, { join } from 'path'

const database = await JSONFilePreset(path.join(__dirname, 'database.json'), {
users: {},
chats: {},
stats: {},
settings: {},
bots: {}
})

async function loadDatabase() {
await database.read()
}

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
unwatchFile(file)
console.log("System Update 'database.js'")
import(`${file}?update=${Date.now()}`)
})

export { database, loadDatabase };
