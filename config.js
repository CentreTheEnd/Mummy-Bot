import { watchFile, unwatchFile } from 'fs'
import { fileURLToPath } from 'url'


global.system = {
  authFolder: "Session",
  linkedFolder: "Linked",
  pairingCode: "",
  isAuth: false,
  watermark: "Mummy - Bot"
};


let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
unwatchFile(file)
console.log("Update 'config.js'")
import(`${file}?update=${Date.now()}`)
})
