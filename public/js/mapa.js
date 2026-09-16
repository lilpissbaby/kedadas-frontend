/* global L */
import { CONFIG, TILE_PROVIDERS } from './config.js'
import { api, mensajeDe } from './api.js'
import { estado, cambiar, avisar } from './estado.js'
import { tipoDe } from './tipos.js'
import { estadoTemporal, escapar, debounce, guardado, distanciaM } from './util.js'
import { toast } from './ui.js'

/**
 * El mapa: Leaflet, las burbujas y la carga de eventos al moverse.
 *
 * Cada vez que el mapa se para, se pide a la API lo que hay en el círculo que
 * cubre la pantalla (tope 50 km). La petición anterior se cancela si aún no
 * había vuelto, así que arrastrar deprisa no amontona consultas.
 */

let mapa
let capaBurbujas
let marcadorYo
const marcadores = new Map() // id -> { marcador, firma }
let peticionEnCurso = null
let alPulsarBurbuja = () => {}

export const obtenerMapa = () => mapa

export function iniciarMapa({ onBurbuja }) {
  alPulsarBurbuja = onBurbuja

  const vista = guardado.leer('vista')
  mapa = L.map('mapa', {
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
    minZoom: 4,
    tapTolerance: 20,
  }).setView(vista?.centro ?? CONFIG.CENTRO_INICIAL, vista?.zoom ?? CONFIG.ZOOM_INICIAL)

  mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>')
  L.control.zoom({ position: 'bottomright' }).addTo(mapa)

  ponerTiles()
  capaBurbujas = L.layerGroup().addTo(mapa)

  const alMover = debounce(() => {
    const c = mapa.getCenter()
    guardado.escribir('vista', { centro: [c.lat, c.lng], zoom: mapa.getZoom() })
    cargarZona()
  }, 350)
  mapa.on('moveend', alMover)
  mapa.on('moveend', () => requestAnimationFrame(colocarNotas))
  mapa.on('zoomend', actualizarClaseZoom)
  actualizarClaseZoom()

  return mapa
}

function ponerTiles() {
  const proveedor = TILE_PROVIDERS[CONFIG.TILE_PROVIDER] ?? TILE_PROVIDERS.carto
  const url = proveedor.url.replace('{key}', encodeURIComponent(CONFIG.TILE_API_KEY || ''))
  const capa = L.tileLayer(url, { ...proveedor.options, attribution: proveedor.attribution }).addTo(mapa)

  // Si el proveedor falla (clave, cuota, dominio no autorizado), se cae a OSM
  // una sola vez en lugar de dejar el mapa en negro.
  let errores = 0
  capa.on('tileerror', () => {
    if (++errores < 3 || proveedor === TILE_PROVIDERS.osm) return
    capa.off('tileerror')
    mapa.removeLayer(capa)
    const osm = TILE_PROVIDERS.osm
    L.tileLayer(osm.url, { ...osm.options, attribution: osm.attribution }).addTo(mapa)
    console.warn(`Proveedor de mapa "${CONFIG.TILE_PROVIDER}" falla: usando OpenStreetMap.`)
  })
}

function actualizarClaseZoom() {
  const z = mapa.getZoom()
  const c = mapa.getContainer()
  c.classList.toggle('zoom-cerca', z >= 15)
  c.classList.toggle('zoom-lejos', z < 12)
}

/* ------------------------------------------------------------------ *
 *  Carga de eventos
 * ------------------------------------------------------------------ */

export async function cargarZona() {
  if (!mapa) return
  const centro = mapa.getCenter()
  const esquina = mapa.getBounds().getNorthEast()
  const radioPantalla = distanciaM(centro.lat, centro.lng, esquina.lat, esquina.lng)
  const radio = Math.round(Math.min(Math.max(radioPantalla, 100), CONFIG.RADIO_MAX_M))

  document.body.classList.toggle('zona-demasiado-grande', radioPantalla > CONFIG.RADIO_MAX_M * 1.2)

  peticionEnCurso?.abort()
  const control = new AbortController()
  peticionEnCurso = control
  document.body.classList.add('cargando-mapa')

  try {
    const { eventos } = await api.cercanos(
      {
        lng: centro.lng.toFixed(5),
        lat: centro.lat.toFixed(5),
        r: radio,
        tipo: estado.filtros.tipo || undefined,
        limite: CONFIG.LIMITE_MAPA,
      },
      control.signal,
    )
    estado.eventos = new Map(eventos.map((e) => [e.id, e]))
    document.body.classList.toggle('zona-llena', eventos.length >= CONFIG.LIMITE_MAPA)
    avisar('eventos')
    document.body.classList.remove('sin-api')
  } catch (err) {
    if (err.name === 'AbortError') return
    if (err.codigo === 'sin_conexion') {
      document.body.classList.add('sin-api')
      if (!estado.eventos.size) document.getElementById('hoja-titulo').textContent = 'Sin conexión'
    } else {
      console.error(err)
      toast(mensajeDe(err), { tipo: 'error' })
    }
  } finally {
    if (peticionEnCurso === control) {
      peticionEnCurso = null
      document.body.classList.remove('cargando-mapa')
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Burbujas estilo "notas de Instagram": el círculo del tipo con una
 *  nota encima que dice qué pasa. La nota sólo se ve de cerca (CSS).
 * ------------------------------------------------------------------ */

function firmaDe(ev) {
  const t = estadoTemporal(ev).clave
  return [ev.titulo, ev.tipo, ev.lat, ev.lng, t, Boolean(ev.cancionUrl), estado.apuntado.has(ev.id), ev.esMio].join('|')
}

function iconoDe(ev) {
  const tipo = tipoDe(ev.tipo)
  const temporal = estadoTemporal(ev).clave
  const nota = ev.titulo.length > 26 ? ev.titulo.slice(0, 24).trimEnd() + '…' : ev.titulo
  const clases = ['burbuja', `t-${ev.tipo}`, `cuando-${temporal}`]
  if (estado.apuntado.has(ev.id)) clases.push('apuntado')
  if (ev.esMio) clases.push('mio')

  return L.divIcon({
    className: 'burbuja-envoltorio',
    // Se escapa todo: el título lo escribe cualquiera.
    html: `<div class="${clases.join(' ')}">
        <span class="burbuja-nota">${ev.cancionUrl ? '<span class="nota-musica" aria-hidden="true">♪</span> ' : ''}${escapar(nota)}</span>
        <span class="burbuja-circulo" aria-hidden="true">${tipo.emoji}</span>
        ${temporal === 'ahora' ? '<span class="burbuja-vivo" aria-hidden="true"></span>' : ''}
      </div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  })
}

/** Pinta sólo lo que cambia: sin parpadeo al moverse. */
export function pintarBurbujas(lista) {
  const visibles = new Set(lista.map((e) => e.id))

  for (const [id, { marcador }] of marcadores) {
    if (!visibles.has(id)) {
      capaBurbujas.removeLayer(marcador)
      marcadores.delete(id)
    }
  }

  for (const ev of lista) {
    const firma = firmaDe(ev)
    const existente = marcadores.get(ev.id)
    if (existente?.firma === firma) continue

    const temporal = estadoTemporal(ev).clave
    const z = temporal === 'ahora' ? 1000 : temporal === 'pronto' ? 500 : 0

    if (existente) {
      existente.marcador.setLatLng([ev.lat, ev.lng]).setIcon(iconoDe(ev)).setZIndexOffset(z)
      existente.firma = firma
      continue
    }

    const marcador = L.marker([ev.lat, ev.lng], {
      icon: iconoDe(ev),
      zIndexOffset: z,
      keyboard: true,
      title: ev.titulo,
      alt: `${tipoDe(ev.tipo).nombre}: ${ev.titulo}`,
      riseOnHover: true,
    })
    marcador.on('click', () => alPulsarBurbuja(ev.id))
    marcador.addTo(capaBurbujas)
    marcadores.set(ev.id, { marcador, firma })
  }
  if (resaltada) marcadores.get(resaltada)?.marcador.getElement()?.querySelector('.burbuja')?.classList.add('resaltada')
  requestAnimationFrame(colocarNotas)
}

export function resaltarBurbuja(id) {
  resaltada = id
  for (const [otro, { marcador }] of marcadores) {
    marcador.getElement()?.classList.toggle('resaltada', otro === id)
  }
  colocarNotas()
}
let resaltada = null

/**
 * Las notas se pisan en cuanto hay varias fiestas juntas. Se enseñan por
 * prioridad (la resaltada, lo que pasa ahora, lo que empieza pronto, a lo que
 * vas…) y una nota que choca con otra ya colocada se queda escondida hasta
 * que acercas el mapa. Con 100 burbujas como máximo, el doble bucle sobra.
 */
function colocarNotas() {
  if (!mapa) return
  const prioridad = { ahora: 0, pronto: 1, luego: 2, terminada: 3 }
  const candidatos = []
  for (const [id, { marcador }] of marcadores) {
    const el = marcador.getElement()?.querySelector('.burbuja')
    if (!el) continue
    el.classList.remove('nota-visible')
    const ev = estado.eventos.get(id)
    if (!ev) continue
    let p = prioridad[estadoTemporal(ev).clave] * 10
    if (estado.apuntado.has(id) || ev.esMio) p -= 5
    if (id === resaltada) p = -100
    candidatos.push({ el, p })
  }
  if (mapa.getZoom() < 15) {
    // De lejos sólo la resaltada lleva nota.
    candidatos.find((c) => c.p === -100)?.el.classList.add('nota-visible')
    return
  }
  candidatos.sort((a, b) => a.p - b.p)
  const puestas = []
  const MARGEN = 4
  for (const { el } of candidatos) {
    const r = el.querySelector('.burbuja-nota').getBoundingClientRect()
    const choca = puestas.some(
      (o) => r.left < o.right + MARGEN && r.right > o.left - MARGEN && r.top < o.bottom + MARGEN && r.bottom > o.top - MARGEN,
    )
    if (choca) continue
    el.classList.add('nota-visible')
    puestas.push(r)
  }
}

export function centrarEn(lat, lng, zoom) {
  const z = Math.max(zoom ?? 16, mapa.getZoom())
  // En móvil el panel tapa la mitad de abajo: el punto se sube para que se vea.
  const movil = window.matchMedia('(max-width: 899px)').matches
  const panelAbierto = document.body.classList.contains('panel-abierto')
  if (movil && panelAbierto) {
    const p = mapa.project([lat, lng], z).add([0, window.innerHeight * 0.25])
    mapa.flyTo(mapa.unproject(p, z), z, { duration: 0.6 })
  } else {
    mapa.flyTo([lat, lng], z, { duration: 0.6 })
  }
}

/* ------------------------------------------------------------------ *
 *  Ubicación de la persona
 * ------------------------------------------------------------------ */

/**
 * Pide la ubicación. Sólo se llama tras un gesto (botón) o si el permiso ya
 * estaba concedido. La posición vive en memoria: no se guarda en ningún sitio
 * ni se manda a la API salvo como centro de la consulta.
 */
export function localizar({ volar = true, silencioso = false } = {}) {
  return new Promise((resolver) => {
    if (!('geolocation' in navigator)) {
      if (!silencioso) toast('Tu navegador no permite obtener la ubicación')
      return resolver(null)
    }
    document.body.classList.add('localizando')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.body.classList.remove('localizando')
        const p = [pos.coords.latitude, pos.coords.longitude]
        cambiar('posicion', p)
        ponerMarcadorYo(p, pos.coords.accuracy)
        if (volar) mapa.flyTo(p, Math.max(mapa.getZoom(), 15), { duration: 0.8 })
        resolver(p)
      },
      (err) => {
        document.body.classList.remove('localizando')
        if (!silencioso) {
          const mensajes = {
            1: 'Has bloqueado la ubicación. Actívala en los ajustes del navegador para ver lo que tienes cerca.',
            2: 'No se ha podido saber dónde estás. Prueba en un sitio con mejor señal.',
            3: 'La ubicación está tardando demasiado. Vuelve a intentarlo.',
          }
          toast(mensajes[err.code] ?? 'No se ha podido obtener tu ubicación', { tipo: 'error', ms: 5000 })
        }
        resolver(null)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  })
}

function ponerMarcadorYo([lat, lng], precision) {
  if (marcadorYo) {
    marcadorYo.punto.setLatLng([lat, lng])
    marcadorYo.circulo.setLatLng([lat, lng]).setRadius(precision)
    return
  }
  marcadorYo = {
    circulo: L.circle([lat, lng], {
      radius: precision,
      className: 'precision-yo',
      interactive: false,
    }).addTo(mapa),
    punto: L.marker([lat, lng], {
      icon: L.divIcon({ className: 'yo-envoltorio', html: '<div class="yo-punto"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false,
      zIndexOffset: 2000,
      keyboard: false,
    }).addTo(mapa),
  }
}

/** Si el permiso ya estaba concedido de otra visita, se usa sin preguntar. */
export async function localizarSiYaHayPermiso() {
  try {
    const permiso = await navigator.permissions?.query({ name: 'geolocation' })
    if (permiso?.state === 'granted') return localizar({ silencioso: true })
    return permiso?.state ?? 'prompt'
  } catch {
    return 'prompt'
  }
}

/* ------------------------------------------------------------------ *
 *  Modo "elegir ubicación" para crear o mover una fiesta.
 *  Chincheta fija en el centro de la pantalla: se mueve el mapa, no el pin.
 *  Es más preciso con el dedo que tocar un punto.
 * ------------------------------------------------------------------ */

export function elegirUbicacion({ inicial } = {}) {
  return new Promise((resolver) => {
    const barra = document.getElementById('eligiendo')
    const texto = document.getElementById('eligiendo-texto')
    document.body.classList.add('eligiendo-ubicacion')
    barra.hidden = false

    if (inicial) mapa.setView(inicial, Math.max(mapa.getZoom(), 17))
    else if (estado.posicion) mapa.setView(estado.posicion, Math.max(mapa.getZoom(), 17))
    else mapa.setZoom(Math.max(mapa.getZoom(), 16))

    const actualizar = () => {
      const c = mapa.getCenter()
      const dist = estado.posicion ? distanciaM(estado.posicion[0], estado.posicion[1], c.lat, c.lng) : null
      texto.textContent = dist != null && dist < 30 ? 'Justo donde estás' : 'Mueve el mapa hasta el sitio exacto'
    }
    actualizar()
    mapa.on('move', actualizar)

    const terminar = (valor) => {
      mapa.off('move', actualizar)
      document.body.classList.remove('eligiendo-ubicacion')
      barra.hidden = true
      barra.removeEventListener('click', alClick)
      document.removeEventListener('keydown', alTecla)
      resolver(valor)
    }
    const alClick = (e) => {
      const accion = e.target.closest('[data-accion]')?.dataset.accion
      if (accion === 'confirmar-ubicacion') {
        const c = mapa.getCenter()
        terminar([c.lat, c.lng])
      }
      if (accion === 'cancelar-ubicacion') terminar(null)
      if (accion === 'ubicacion-yo') localizar()
    }
    const alTecla = (e) => e.key === 'Escape' && terminar(null)
    barra.addEventListener('click', alClick)
    document.addEventListener('keydown', alTecla)
  })
}
