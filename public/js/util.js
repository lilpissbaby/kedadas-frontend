/* Utilidades sin estado. Nada aquí toca el DOM de la app ni la API. */

/**
 * Plantillas HTML con escape automático. Todo lo que se interpola se escapa
 * salvo que venga envuelto en crudo(): así un título con <script> se pinta
 * como texto y no hay que acordarse de escapar a mano en cada sitio.
 */
const CRUDO = Symbol('crudo')
export const crudo = (s) => ({ [CRUDO]: String(s) })

export function escapar(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

export function html(partes, ...valores) {
  let salida = ''
  partes.forEach((p, i) => {
    salida += p
    if (i < valores.length) salida += aTexto(valores[i])
  })
  return crudo(salida)
}

function aTexto(v) {
  if (v == null || v === false) return ''
  if (Array.isArray(v)) return v.map(aTexto).join('')
  if (typeof v === 'object' && CRUDO in v) return v[CRUDO]
  return escapar(v)
}

/** Pinta una plantilla html`` dentro de un elemento. */
export function pintar(el, plantilla) {
  el.innerHTML = aTexto(plantilla)
  return el
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel)
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)]

/** Sólo acepta URLs http(s). Evita javascript: y data: en href y src. */
export function urlSegura(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

/* ---------------- distancias ---------------- */

export function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000
  const rad = (d) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function formatoDistancia(m) {
  if (m == null || Number.isNaN(m)) return ''
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')} km`
}

/* ---------------- fechas ---------------- */

const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const fmtDia = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

const inicioDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const diasEntre = (a, b) => Math.round((inicioDia(b) - inicioDia(a)) / 86_400_000)

export const hora = (d) => fmtHora.format(new Date(d))
export const mesYAnio = (d) => fmtMes.format(new Date(d))

function diaRelativo(fecha, ahora = new Date()) {
  const n = diasEntre(ahora, fecha)
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n === -1) return 'Ayer'
  return fmtDia.format(fecha).replace('.', '')
}

/**
 * Estado temporal de un evento: lo que decide si la burbuja late, si sale
 * atenuada y qué etiqueta lleva.
 */
export function estadoTemporal(ev, ahora = new Date()) {
  const empieza = new Date(ev.empiezaEn)
  const termina = new Date(ev.terminaEn)
  if (termina <= ahora) return { clave: 'terminada', texto: 'Terminada' }
  if (empieza <= ahora) {
    return { clave: 'ahora', texto: `Ahora · hasta las ${hora(termina)}` }
  }
  const min = (empieza - ahora) / 60_000
  if (min < 60) return { clave: 'pronto', texto: `En ${Math.max(1, Math.round(min))} min` }
  if (min < 180) return { clave: 'pronto', texto: `${diaRelativo(empieza, ahora)} · ${hora(empieza)}` }
  return { clave: 'luego', texto: `${diaRelativo(empieza, ahora)} · ${hora(empieza)}` }
}

/** "Hoy 22:00 – 04:00" o "Sáb 20 sep 23:00 – dom 21 sep 06:00". */
export function rangoFechas(ev) {
  const a = new Date(ev.empiezaEn)
  const b = new Date(ev.terminaEn)
  const mismoDiaONoche = diasEntre(a, b) === 0 || (diasEntre(a, b) === 1 && b.getHours() < 12)
  if (mismoDiaONoche) return `${diaRelativo(a)} · ${hora(a)} – ${hora(b)}`
  return `${diaRelativo(a)} ${hora(a)} – ${diaRelativo(b).toLowerCase()} ${hora(b)}`
}

/** Para <input type="datetime-local">, en hora local. */
export function aInputFecha(d) {
  const f = new Date(d)
  const p = (n) => String(n).padStart(2, '0')
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}T${p(f.getHours())}:${p(f.getMinutes())}`
}

/** Filtro "cuándo" de la barra. Se aplica en el cliente sobre lo ya cargado. */
export function encajaCuando(ev, cuando, ahora = new Date()) {
  const empieza = new Date(ev.empiezaEn)
  const termina = new Date(ev.terminaEn)
  if (termina <= ahora) return false
  switch (cuando) {
    case 'ahora':
      return empieza <= ahora
    case 'hoy': {
      // "Hoy" en fiesta incluye la madrugada: hasta las 6:00 del día siguiente.
      const corte = inicioDia(ahora)
      corte.setDate(corte.getDate() + 1)
      corte.setHours(6)
      return empieza < corte
    }
    case 'finde': {
      // Días desde el último viernes: vie 0, sáb 1, dom 2, lun 3 … jue 6.
      const n = (ahora.getDay() - 5 + 7) % 7
      const viernes = inicioDia(ahora)
      viernes.setDate(viernes.getDate() + (n <= 2 ? -n : 7 - n))
      viernes.setHours(16)
      const lunes = new Date(viernes)
      lunes.setDate(lunes.getDate() + 3)
      lunes.setHours(8)
      return empieza < lunes && termina > viernes
    }
    default:
      return true
  }
}

/* ---------------- varios ---------------- */

export function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`
}

export const iniciales = (nombre = '?') =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?'

/** localStorage puede no existir (modo privado, WebView): nunca debe romper nada. */
export const guardado = {
  leer(clave, porDefecto = null) {
    try {
      const v = localStorage.getItem(`kedada:${clave}`)
      return v == null ? porDefecto : JSON.parse(v)
    } catch {
      return porDefecto
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem(`kedada:${clave}`, JSON.stringify(valor))
    } catch {
      /* sin almacenamiento: se vive sin recordar */
    }
  },
}
