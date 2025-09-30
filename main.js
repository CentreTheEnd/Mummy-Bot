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

