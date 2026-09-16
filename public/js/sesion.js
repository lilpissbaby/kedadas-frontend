import { api, mensajeDe } from './api.js'
import { estado, cambiar, avisar } from './estado.js'
import { navegar, rutaActual } from './router.js'
import { toast } from './ui.js'

/**
 * Sesión. La cookie la pone y la quita la API; aquí sólo se pregunta quién
 * soy y se guarda en memoria. El frontend nunca ve el token.
 */

const CLAVE_VOLVER = 'kedada:volver-a'

export async function arrancarSesion() {
  const [salud, yo] = await Promise.allSettled([api.salud(), api.quienSoy()])
  cambiar('salud', salud.status === 'fulfilled' ? salud.value : null)
  if (salud.status === 'rejected') document.body.classList.add('sin-api')

  const usuario = yo.status === 'fulfilled' ? yo.value.usuario : null
  cambiar('usuario', usuario)
  if (usuario) await cargarApuntados()

  // Volviendo del login de Google: la API redirige a la raíz, así que el
  // destino se recuerda aquí (sessionStorage: sólo esta pestaña).
  let volver = null
  try {
    volver = sessionStorage.getItem(CLAVE_VOLVER)
    sessionStorage.removeItem(CLAVE_VOLVER)
  } catch {
    /* sin almacenamiento */
  }
  if (usuario && volver && !location.hash) history.replaceState(null, '', '#' + volver)
  return usuario
}

export async function cargarApuntados() {
  try {
    const { eventos } = await api.misSuscripciones()
    estado.apuntado = new Set(eventos.map((e) => e.id))
    avisar('eventos')
  } catch {
    /* no es crítico: el check se corrige al abrir cada ficha */
  }
}

/** Manda a la pantalla de entrar recordando adónde se quería ir. */
export function pedirSesion(volverA = '/', motivo = '') {
  recordarDestino(volverA)
  // Si la pantalla que pide sesión es la misma a la que hay que volver, se
  // sustituye en el historial: así "atrás" tras entrar no repite la pantalla.
  navegar(`/entrar${motivo ? '?motivo=' + encodeURIComponent(motivo) : ''}`, { reemplazar: rutaActual() === volverA })
}

export function recordarDestino(ruta) {
  try {
    sessionStorage.setItem(CLAVE_VOLVER, ruta)
  } catch {
    /* sin almacenamiento */
  }
}

export function destinoRecordado() {
  try {
    return sessionStorage.getItem(CLAVE_VOLVER) || '/'
  } catch {
    return '/'
  }
}

export function olvidarDestino() {
  try {
    sessionStorage.removeItem(CLAVE_VOLVER)
  } catch {
    /* sin almacenamiento */
  }
}

export function entrarConGoogle() {
  // Navegación completa, no fetch: Google tiene que ver la página.
  location.href = api.urlLoginGoogle()
}

export async function entrarComoDev(nombre) {
  const { usuario } = await api.entrarDev(nombre)
  cambiar('usuario', usuario)
  await cargarApuntados()
  return usuario
}

export async function salir() {
  try {
    await api.salir()
  } catch (err) {
    toast(mensajeDe(err), { tipo: 'error' })
    return false
  }
  estado.apuntado = new Set()
  cambiar('usuario', null)
  avisar('eventos') // quita los "esMio" y los checks del mapa
  return true
}

export async function borrarCuenta() {
  await api.borrarCuenta()
  estado.apuntado = new Set()
  cambiar('usuario', null)
}
