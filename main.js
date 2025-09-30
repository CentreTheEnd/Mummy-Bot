import fs from 'fs/promises'
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, watch } from 'fs'
import path, { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createRequire } from 'module'
import yargs from 'yargs'
import { spawn, execSync } from 'child_process'
import syntaxerror from 'syntax-error'
import readline from 'readline'
import P from 'pino'
import os, { tmpdir } from 'os'
import { format } from 'util'
import pkg from '@whiskeysockets/baileys'

import './config.js'

import { database, loadDatabase } from './src/lib/database.js'
import { makeWASocket, protoType, serialize } from './src/lib/simple.js'

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString()
}
global.__dirname = function dirname(pathURL) {
return path.dirname(global.__filename(pathURL, true))
}
global.__require = function require(dir = import.meta.url) {
return createRequire(dir)
}

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())

global.timestamp = {
start: new Date()
}

global.db = database 
global.loadDatabase = loadDatabase

const { 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore, 
  Browsers, 
  useMultiFileAuthState, 
  useSingleFileAuthState,
  jidNormalizedUser, 
  PHONENUMBER_MCC
} = pkg

const __dirname = global.__dirname(import.meta.url)
const authFolder = join(__dirname, global.dir.session)
const authFile = join(authFolder, 'creds.json');

const question = (text) => {
const rl = readline.createInterface({
input: process.stdin,
output: process.stdout
})
return new Promise((resolve) => {
rl.question(text, (answer) => {
rl.close()
resolve(answer.trim())
})
})
}

protoType()
serialize()

function verificationAuthFolder() {
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }
}

function verificationAuthFile() {
  return fs.existsSync(authFile);
}


async function loadAuthState() {
let state, saveCreds
verificationAuthFolder()
  
if (!verificationAuthFile) {
  console.log('\nLoad Session from: MultiFile');
  ({ state, saveCreds } = await useMultiFileAuthState(authFolder))
} else {
  console.log('\nLoad Session from: SingleFile');
  ({ state, saveCreds } = await useSingleFileAuthState(authFile))
}
return { state, saveCreds }
}

async function loadAuth(method, phone) {
  const { state, saveCreds } = await loadAuthState()
  const { version: baileysVersion } = await fetchLatestBaileysVersion()

  const connectionOptions = {
   version: baileysVersion,
   logger: P({ level: 'silent' }),
   printQRInTerminal: method === 'qr',
   browser: Browsers.ubuntu('Safari'),
   markOnlineOnConnect: true,
   emitOwnEvents: true,
   auth: {
     creds: state.creds,
     keys: makeCacheableSignalKeyStore(state.keys, P().child({
         level: 'silent',
         stream: 'store'
      }))
    }
  }
}

global.conn = makeWASocket(connectionOptions)
conn.isInit = false
if (phone && method === 'code') {
if (verificationAuthFile && !conn.authState.creds.registered) {
setTimeout(async () => {
let code = await conn.requestPairingCode(phone)
code = code?.match(/.{1,4}/g)?.join("-") || code
console.log()
  }, 3000)
}
}

process.on('uncaughtException', console.error)
let isInit = true
let handler = await import('./handler.js')
global.reloadHandler = async function (restatConn) {
try {
const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
if (Object.keys(Handler || {}).length) handler = Handler
} catch (e) {
console.error(e)
}
if (restatConn) {
const oldChats = global.conn.chats
try {
global.conn.ws.close()
} catch {}
conn.ev.removeAllListeners()
global.conn = makeWASocket(connectionOptions, {
chats: oldChats
})
isInit = true
}
if (!isInit) {
conn.ev.off('messages.upsert', conn.handler)
conn.ev.off('group-participants.update', conn.participantsUpdate)
conn.ev.off('message.delete', conn.onDelete)
conn.ev.off('connection.update', conn.connectionUpdate)
conn.ev.off('creds.update', conn.credsUpdate)
}

conn.handler = handler.handler.bind(global.conn)
conn.participantsUpdate = handler.participantsUpdate.bind(global.conn)
conn.onDelete = handler.deleteUpdate.bind(global.conn)
conn.connectionUpdate = authConnection.bind(global.conn)
conn.credsUpdate = saveCreds.bind(global.conn)
  
conn.ev.on('messages.upsert', conn.handler)
conn.ev.on('group-participants.update', conn.participantsUpdate)
conn.ev.on('message.delete', conn.onDelete)
conn.ev.on('connection.update', conn.connectionUpdate)
conn.ev.on('creds.update', conn.credsUpdate)
isInit = false
return true
}

const pluginFolder = global.__dirname(join(__dirname, './src/plugins/index'))
const pluginFilter = filename => /\.js$/.test(filename)
global.plugins = {}
async function filesInit() {
for (let filename of readdirSync(pluginFolder).filter(pluginFilter)) {
try {
let file = global.__filename(join(pluginFolder, filename))
const module = await import(file)
global.plugins[filename] = module.default || module
} catch (e) {
conn.logger.error(e)
delete global.plugins[filename]
}
}
}
filesInit().catch(console.error)
global.reload = async (_ev, filename) => {
if (pluginFilter(filename)) {
let dir = global.__filename(join(pluginFolder, filename), true)
if (filename in global.plugins) {
if (existsSync(dir)) conn.logger.info(`Memuat ulang plugin '${filename}'`)
else {
conn.logger.warn(`Plugin '${filename}' telah dihapus`)
return delete global.plugins[filename]
}
} else conn.logger.info(`Memuat plugin baru: '${filename}'`)
let err = syntaxerror(readFileSync(dir), filename, {
sourceType: 'module',
allowAwaitOutsideFunction: true
})
if (err) {
conn.logger.error([
`❌ Plugin Error: '${filename}'`,
`🧠 Message: ${err.message}`,
`📍 Line: ${err.line}, Column: ${err.column}`,
`🔎 ${err.annotated}`
].join('\n'))
return
}
try {
const module = (await import(`${global.__filename(dir)}?update=${Date.now()}`))
global.plugins[filename] = module.default || module
} catch (e) {
conn.logger.error(`❌ Terjadi kesalahan saat memuat plugin '${filename}'\n${format(e)}`)
} finally {
global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
}
}
}
Object.freeze(global.reload)
watch(pluginFolder, global.reload)
await global.reloadHandler()
}

async function authConnection(update) {
const { receivedPendingNotifications, connection, lastDisconnect, isOnline, isNewLogin } = update
if (isNewLogin) conn.isInit = true
if (connection === 'connecting') {
console.log()
}
if (connection === "open") {
console.log()
}
if (isOnline === false) {
console.log()
console.log()
console.log()
}
if (receivedPendingNotifications) {
console.log()
}
if (connection === 'close') {
console.log()
console.log()
}
global.timestamp.connect = new Date
if (lastDisconnect && lastDisconnect.error) {
const { statusCode } = lastDisconnect.error.output || {}
if (statusCode !== DisconnectReason.loggedOut) {
await global.reloadHandler(true)
console.log()
}
}
if (global.db.data == null) await global.loadDatabase()
}
