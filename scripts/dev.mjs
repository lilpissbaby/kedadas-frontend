#!/usr/bin/env node
/**
 * Servidor de desarrollo. Cero dependencias: sólo Node 18+.
 *
 *   node scripts/dev.mjs                 # frontend en http://localhost:3000
 *   API=http://localhost:8787 PUERTO=3000 node scripts/dev.mjs
 *
 * Hace lo mismo que nginx en producción:
 *   - sirve public/,
 *   - reenvía /api/* a la API (por defecto `npm run dev` de api-fiestas, en :8787),
 *   - manda las MISMAS cabeceras de seguridad, leídas de nginx/cabeceras.conf.
 *     Si algo rompe el CSP, se ve aquí en la consola del navegador y no en
 *     producción.
 *
 * En PowerShell: $env:API = 'http://localhost:8787'; node scripts/dev.mjs
 */

import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLICO = join(RAIZ, 'public')
const PUERTO = Number(process.env.PUERTO ?? 3000)
const API = new URL(process.env.API ?? 'http://localhost:8787')

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

/** Las cabeceras de nginx/cabeceras.conf, para no mantenerlas en dos sitios. */
function leerCabeceras() {
  const conf = readFileSync(join(RAIZ, 'nginx', 'cabeceras.conf'), 'utf8')
  const cabeceras = {}
  for (const m of conf.matchAll(/^\s*add_header\s+([\w-]+)\s+"([^"]*)"/gm)) cabeceras[m[1]] = m[2]
  return cabeceras
}
const SEGURIDAD = leerCabeceras()

async function servirEstatico(req, res) {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let fichero = normalize(join(PUBLICO, ruta))
  if (!fichero.startsWith(PUBLICO)) return responder(res, 403, 'Fuera de public/')

  try {
    const info = await stat(fichero)
    if (info.isDirectory()) fichero = join(fichero, 'index.html')
  } catch {
    // Igual que try_files … /index.html
    fichero = join(PUBLICO, 'index.html')
  }

  try {
    const cuerpo = await readFile(fichero)
    res.writeHead(200, {
      ...SEGURIDAD,
      'Content-Type': TIPOS[extname(fichero)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : cuerpo)
  } catch {
    responder(res, 404, 'No encontrado')
  }
}

function reenviarApi(req, res) {
  const destino = new URL(req.url, API)
  const cabeceras = { ...req.headers, host: API.host, 'x-forwarded-host': req.headers.host, 'x-forwarded-proto': 'http' }

  const salida = http.request(destino, { method: req.method, headers: cabeceras }, (r) => {
    res.writeHead(r.statusCode ?? 502, { ...r.headers, 'cache-control': 'no-store' })
    r.pipe(res)
  })
  salida.on('error', (err) => {
    console.error(`  ✗ API en ${API.origin} no responde (${err.code}). ¿Has arrancado \`npm run dev\` en api-fiestas?`)
    responder(res, 502, JSON.stringify({ error: { codigo: 'sin_api', mensaje: `No hay API en ${API.origin}` } }), 'application/json')
  })
  req.pipe(salida)
}

function responder(res, estado, texto, tipo = 'text/plain; charset=utf-8') {
  res.writeHead(estado, { ...SEGURIDAD, 'Content-Type': tipo })
  res.end(texto)
}

http
  .createServer((req, res) => {
    const inicio = Date.now()
    res.on('finish', () => {
      if (req.url.startsWith('/api/')) console.log(`  ${req.method.padEnd(6)} ${res.statusCode} ${req.url} ${Date.now() - inicio}ms`)
    })
    if (req.url.startsWith('/api/')) return reenviarApi(req, res)
    if (req.method !== 'GET' && req.method !== 'HEAD') return responder(res, 405, 'Sólo GET')
    return servirEstatico(req, res)
  })
  .listen(PUERTO, () => {
    console.log(`\n  Kedada en  http://localhost:${PUERTO}`)
    console.log(`  API       ${API.origin}  (cámbiala con la variable API)\n`)
  })
