import { CONFIG } from './config.js'

/**
 * Fotos del dispositivo para la burbuja y la ficha.
 *
 * Todo se hace en el navegador antes de subir nada:
 *   - se respeta la orientación de la foto (las del móvil vienen giradas),
 *   - se generan dos tamaños: "grande" (lado mayor 1080 px) para la ficha y
 *     "mini" (160×160 recortada al centro) para la burbuja del mapa,
 *   - se vuelven a codificar en WebP (o JPEG si el navegador no sabe WebP),
 *     lo que QUITA LOS METADATOS: una foto de móvil trae el GPS de donde se
 *     hizo. La API, además, rechaza cualquier imagen que aún los lleve.
 *
 * Los límites coinciden con los de la API (src/lib/imagenes.ts).
 */

const LADO_GRANDE = 1080
const LADO_MINI = 160
const MAX_GRANDE = 1_400_000 // la API admite 1,5 MB: margen
const MAX_MINI = 90_000 // la API admite 100 KB
const MAX_ORIGINAL = 25 * 1024 * 1024

export class ErrorImagen extends Error {}

/**
 * @param {File} archivo
 * @returns {Promise<{ grande: Blob, mini: Blob, vistaPrevia: string }>}
 */
export async function prepararImagen(archivo) {
  if (!archivo.type.startsWith('image/')) throw new ErrorImagen('Eso no es una imagen')
  if (archivo.size > MAX_ORIGINAL) throw new ErrorImagen('La foto es enorme (más de 25 MB). Prueba con otra.')

  const origen = await decodificar(archivo)
  try {
    const { width: w, height: h } = origen

    // Grande: cabe en 1080×1080 sin deformar.
    const escala = Math.min(1, LADO_GRANDE / Math.max(w, h))
    const lienzoGrande = dibujar(origen, 0, 0, w, h, Math.round(w * escala), Math.round(h * escala))

    // Mini: cuadrado del centro, que es lo que se ve dentro del círculo.
    const lado = Math.min(w, h)
    const lienzoMini = dibujar(origen, (w - lado) / 2, (h - lado) / 2, lado, lado, LADO_MINI, LADO_MINI)

    const grande = await codificar(lienzoGrande, MAX_GRANDE, 0.82)
    const mini = await codificar(lienzoMini, MAX_MINI, 0.78)
    return { grande, mini, vistaPrevia: URL.createObjectURL(mini) }
  } finally {
    origen.close?.()
  }
}

async function decodificar(archivo) {
  // createImageBitmap aplica la orientación EXIF y es rápido; si no está o
  // no entiende el formato, se prueba con <img>.
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' })
    } catch {
      /* se intenta con <img> */
    }
  }
  const url = URL.createObjectURL(archivo)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new ErrorImagen('Tu navegador no puede abrir esta foto (¿HEIC?). Prueba con una JPG o PNG.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function dibujar(origen, sx, sy, sw, sh, ancho, alto) {
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.max(1, ancho)
  lienzo.height = Math.max(1, alto)
  const ctx = lienzo.getContext('2d')
  // Fondo por si la imagen tiene transparencia y acaba en JPEG.
  ctx.fillStyle = '#12162a'
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(origen, sx, sy, sw, sh, 0, 0, lienzo.width, lienzo.height)
  return lienzo
}

const aBlob = (lienzo, tipo, calidad) => new Promise((ok) => lienzo.toBlob(ok, tipo, calidad))

async function codificar(lienzo, maximo, calidad) {
  // Safari antiguo no codifica WebP y devuelve PNG en silencio: se detecta y se usa JPEG.
  let tipo = 'image/webp'
  let blob = await aBlob(lienzo, tipo, calidad)
  if (!blob || blob.type !== 'image/webp') {
    tipo = 'image/jpeg'
    blob = await aBlob(lienzo, tipo, calidad)
  }
  // Si aún pesa demasiado, bajar calidad poco a poco.
  while (blob && blob.size > maximo && calidad > 0.35) {
    calidad -= 0.12
    blob = await aBlob(lienzo, tipo, calidad)
  }
  if (!blob || blob.size > maximo) throw new ErrorImagen('No se ha podido reducir la foto lo suficiente. Prueba con otra.')
  return blob
}

/** Las URLs de la API son rutas (/api/imagenes/…). Con API_BASE se completan. */
export function urlImagen(ruta) {
  if (typeof ruta !== 'string' || !ruta.startsWith('/api/imagenes/')) return ''
  return `${CONFIG.API_BASE}${ruta}`
}

/**
 * Si una imagen falla (la han borrado, sin red), se cambia por el emoji del
 * tipo. Un solo listener para toda la app: el CSP no permite onerror="".
 */
export function vigilarImagenesRotas() {
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target
      if (!(img instanceof HTMLImageElement) || !img.dataset.respaldo) return
      const span = document.createElement('span')
      span.className = 'respaldo-emoji'
      span.textContent = img.dataset.respaldo
      img.replaceWith(span)
    },
    true,
  )
}
