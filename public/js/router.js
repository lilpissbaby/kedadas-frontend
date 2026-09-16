import { panel } from './ui.js'

/**
 * Router por hash. Cada pantalla que no es el mapa tiene una URL propia
 * (#/evento/abc, #/yo…), así que:
 *   - se pueden compartir enlaces a una fiesta,
 *   - el botón "atrás" del móvil cierra el panel en lugar de salir de la app,
 *   - nginx no necesita reglas especiales para cada ruta.
 *
 * Una vista es una función async (params, contenedor) que pinta dentro del
 * panel y puede devolver una función de limpieza (parar la música, quitar un
 * marcador temporal…), que se llama al salir.
 */

const rutas = []
let limpiezaActual = null
let generacion = 0

export function ruta(patron, vista, opciones = {}) {
  const claves = []
  const regex = new RegExp(
    '^' + patron.replace(/:(\w+)/g, (_, k) => (claves.push(k), '([^/]+)')) + '$',
  )
  rutas.push({ regex, claves, vista, opciones })
}

export function rutaActual() {
  return location.hash.replace(/^#/, '') || '/'
}

/**
 * Las entradas del historial creadas desde la app llevan { kedada: true }.
 * Así cerrarPanel sabe si puede hacer history.back() sin sacar a la persona
 * de la web (por ejemplo, si abrió un enlace compartido directamente).
 */
export function navegar(destino, { reemplazar = false } = {}) {
  const hash = destino === '/' ? location.pathname + location.search : '#' + destino
  if (reemplazar) history.replaceState(history.state, '', hash)
  else history.pushState({ kedada: true }, '', hash)
  resolver()
}

/**
 * Volver a la pantalla anterior (p. ej. de "editar" a la ficha) si la
 * anterior es de la app; si no, ir a `alternativa` sustituyendo la actual.
 */
export function volverOIr(alternativa) {
  if (history.state?.kedada) history.back()
  else navegar(alternativa, { reemplazar: true })
}

export function cerrarPanel() {
  if (rutaActual() === '/') return panel.cerrar()
  if (history.state?.kedada) history.back()
  else navegar('/', { reemplazar: true })
}

async function resolver() {
  const actual = rutaActual()
  const gen = ++generacion

  if (limpiezaActual) {
    try {
      limpiezaActual()
    } catch (e) {
      console.error(e)
    }
    limpiezaActual = null
  }

  if (actual === '/') {
    panel.cerrar()
    return
  }

  const [camino, busqueda = ''] = actual.split('?')
  for (const r of rutas) {
    const m = camino.match(r.regex)
    if (!m) continue
    const params = Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
    params.consulta = new URLSearchParams(busqueda)
    panel.abrir({ etiqueta: r.opciones.etiqueta ?? '', ancho: r.opciones.ancho })
    try {
      const limpieza = await r.vista(params, panel.cuerpo, () => gen !== generacion)
      // Si mientras cargaba se navegó a otra parte, limpiar ya.
      if (gen !== generacion) limpieza?.()
      else limpiezaActual = limpieza ?? null
    } catch (err) {
      console.error('Vista rota:', err)
    }
    return
  }

  // Ruta desconocida: al mapa.
  history.replaceState(null, '', location.pathname + location.search)
  panel.cerrar()
}

export function arrancarRouter() {
  // popstate cubre atrás/adelante y también cambios de hash escritos a mano.
  window.addEventListener('popstate', resolver)

  // Los enlaces internos (<a href="#/yo">) pasan por navegar() para quedar
  // marcados en el historial.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navegar(a.getAttribute('href').slice(1))
  })

  resolver()
}
