import { CONFIG } from './config.js'

/**
 * Cliente de la API. Cada ruta de la API tiene aquí UNA función, y el resto
 * del frontend no hace fetch por su cuenta: si cambia una ruta, se cambia aquí.
 *
 * Errores: la API siempre responde { error: { codigo, mensaje, detalles? } }.
 * Aquí se convierte en ErrorApi para que las vistas puedan decidir por código
 * (no_autenticado → abrir login, peticion_invalida → marcar campos, …).
 */

export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, detalles) {
    super(mensaje)
    this.estado = estado
    this.codigo = codigo
    this.detalles = detalles
  }
}

/** Cualquier 401 lo escucha la app para abrir la pantalla de entrar. */
export const eventosApi = new EventTarget()

async function pedir(metodo, ruta, { cuerpo, formulario, consulta, senal } = {}) {
  let url = `${CONFIG.API_BASE}${ruta}`
  if (consulta) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(consulta)) if (v != null && v !== '') q.set(k, v)
    const s = q.toString()
    if (s) url += `?${s}`
  }

  let respuesta
  try {
    respuesta = await fetch(url, {
      method: metodo,
      credentials: 'include', // la sesión va en cookie httpOnly
      // Con FormData el navegador pone él mismo el Content-Type con el boundary.
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: formulario ?? (cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined),
      signal: senal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ErrorApi(0, 'sin_conexion', 'No hay conexión con el servidor. Revisa tu red.')
  }

  if (respuesta.status === 204) return null

  // 502/503/504 los da el proxy (nginx o dev.mjs) cuando la API no responde:
  // para quien usa la app es lo mismo que no tener conexión.
  if ([502, 503, 504].includes(respuesta.status)) {
    throw new ErrorApi(respuesta.status, 'sin_conexion', 'No hay conexión con el servidor. Prueba en un momento.')
  }

  const datos = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    const e = datos?.error
    const error = new ErrorApi(
      respuesta.status,
      e?.codigo ?? 'error_interno',
      e?.mensaje ?? `Error ${respuesta.status}`,
      e?.detalles,
    )
    if (respuesta.status === 401) eventosApi.dispatchEvent(new CustomEvent('no-autenticado', { detail: error }))
    throw error
  }
  return datos
}

export const api = {
  /* --- estado del despliegue --- */
  salud: () => pedir('GET', '/api/salud'),

  /* --- eventos --- */
  cercanos: ({ lng, lat, r, tipo, limite }, senal) =>
    pedir('GET', '/api/eventos', { consulta: { lng, lat, r, tipo, limite }, senal }),
  evento: (id) => pedir('GET', `/api/eventos/${encodeURIComponent(id)}`),
  crearEvento: (datos) => pedir('POST', '/api/eventos', { cuerpo: datos }),
  editarEvento: (id, cambios) => pedir('PATCH', `/api/eventos/${encodeURIComponent(id)}`, { cuerpo: cambios }),
  borrarEvento: (id) => pedir('DELETE', `/api/eventos/${encodeURIComponent(id)}`),
  denunciar: (id, motivo, comentario) =>
    pedir('POST', `/api/eventos/${encodeURIComponent(id)}/denuncia`, { cuerpo: { motivo, comentario: comentario || undefined } }),

  /* --- imágenes (R2) --- */
  /** Sube los dos tamaños y devuelve { id, imagen }. El id se manda luego como `imagen` del evento. */
  subirImagen: ({ grande, mini }) => {
    const fd = new FormData()
    fd.set('grande', grande, grande.type === 'image/jpeg' ? 'grande.jpg' : 'grande.webp')
    fd.set('mini', mini, mini.type === 'image/jpeg' ? 'mini.jpg' : 'mini.webp')
    return pedir('POST', '/api/imagenes', { formulario: fd })
  },

  /* --- suscripciones --- */
  apuntarse: (id) => pedir('POST', `/api/eventos/${encodeURIComponent(id)}/suscripcion`),
  desapuntarse: (id) => pedir('DELETE', `/api/eventos/${encodeURIComponent(id)}/suscripcion`),
  misSuscripciones: (pasadas = false) => pedir('GET', '/api/yo/suscripciones', { consulta: { pasadas: pasadas ? '1' : '' } }),
  misEventos: () => pedir('GET', '/api/yo/eventos'),

  /* --- usuarios --- */
  miFicha: () => pedir('GET', '/api/usuarios/yo'),
  perfil: (id) => pedir('GET', `/api/usuarios/${encodeURIComponent(id)}`),

  /* --- sesión --- */
  quienSoy: () => pedir('GET', '/api/sesion/yo'),
  salir: () => pedir('POST', '/api/sesion/salir'),
  borrarCuenta: () => pedir('DELETE', '/api/sesion/yo'),
  urlLoginGoogle: () => `${CONFIG.API_BASE}/api/sesion/google`,

  /* --- sólo con MODO_DEV en la API (404 en producción) --- */
  entrarDev: (nombre) => pedir('POST', '/api/usuarios/dev', { cuerpo: { nombre } }),
  usuariosDev: () => pedir('GET', '/api/usuarios/dev/lista'),
}

/** Mensaje legible de cualquier error, para un toast. */
export function mensajeDe(err) {
  if (err instanceof ErrorApi) {
    if (err.codigo === 'demasiadas_peticiones') return 'Vas muy rápido. Espera un momento y vuelve a probar.'
    if (err.estado >= 500) return 'Algo ha fallado en el servidor. Prueba otra vez en un rato.'
    return err.message
  }
  return 'Algo ha fallado. Prueba otra vez.'
}
