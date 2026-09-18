import { estado, escuchar } from './estado.js'
import { eventosApi } from './api.js'
import { html, pintar, $ } from './util.js'
import { avatar, toast } from './ui.js'
import { ruta, navegar, rutaActual, cerrarPanel, arrancarRouter } from './router.js'
import { iniciarMapa, cargarZona, localizar, localizarSiYaHayPermiso } from './mapa.js'
import { iniciarFiltros, iniciarHoja, iniciarLista } from './lista.js'
import { arrancarSesion, pedirSesion } from './sesion.js'
import { vistaDetalle, marcarSonarAlAbrir } from './vistas/detalle.js'
import { vistaCrear, vistaEditar } from './vistas/formulario.js'
import { vistaYo, vistaUsuario } from './vistas/perfil.js'
import { vistaEntrar } from './vistas/entrar.js'
import { vistaDenuncia } from './vistas/denuncia.js'
import { vigilarImagenesRotas } from './imagen.js'

/* ---------------- rutas ---------------- */

ruta('/evento/:id', vistaDetalle, { etiqueta: 'Ficha de la fiesta' })
ruta('/evento/:id/editar', vistaEditar, { etiqueta: 'Editar fiesta' })
ruta('/evento/:id/denunciar', vistaDenuncia, { etiqueta: 'Denunciar fiesta' })
ruta('/crear', vistaCrear, { etiqueta: 'Crear fiesta' })
ruta('/yo', vistaYo, { etiqueta: 'Mi perfil' })
ruta('/usuario/:id', vistaUsuario, { etiqueta: 'Perfil' })
ruta('/entrar', vistaEntrar, { etiqueta: 'Entrar' })

/* ---------------- cabecera ---------------- */

function pintarCuenta(usuario) {
  const hueco = $('#cuenta')
  pintar(
    hueco,
    usuario
      ? html`<a class="boton-cuenta" href="#/yo" aria-label="Mi perfil (${usuario.nombre ?? 'sin nombre'})">${avatar(usuario)}</a>`
      : html`<a class="btn btn-entrar" href="#/entrar">Entrar</a>`,
  )
}

/* ---------------- arranque ---------------- */

async function arrancar() {
  vigilarImagenesRotas()
  iniciarMapa({
    onBurbuja: (id) => {
      // El toque en la burbuja es el gesto que deja sonar la canción.
      marcarSonarAlAbrir()
      const enFicha = /^\/evento\/[^/]+$/.test(rutaActual())
      navegar(`/evento/${id}`, { reemplazar: enFicha })
    },
  })
  iniciarFiltros()
  iniciarHoja()
  iniciarLista()

  escuchar('usuario', (u) => {
    pintarCuenta(u)
    // esMio y los checks dependen de quién mira: se vuelve a pedir la zona.
    cargarZona()
  })
  pintarCuenta(null)

  // Un 401 en cualquier sitio = la sesión caducó o no había.
  eventosApi.addEventListener('no-autenticado', () => {
    if (estado.usuario) toast('Tu sesión ha caducado. Vuelve a entrar.')
    estado.usuario = null
    pintarCuenta(null)
    if (!rutaActual().startsWith('/entrar')) pedirSesion(rutaActual())
  })

  // Botones fijos
  $('#boton-localizar').addEventListener('click', async () => {
    const p = await localizar()
    if (p) $('#aviso-ubicacion')?.remove()
  })
  $('#boton-crear').addEventListener('click', () => navegar('/crear'))
  $('#panel-cerrar').addEventListener('click', cerrarPanel)
  $('#reintentar-api').addEventListener('click', () => location.reload())
  $('#panel-fondo').addEventListener('click', cerrarPanel)

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('panel-abierto') && !document.body.classList.contains('eligiendo-ubicacion')) {
      cerrarPanel()
    }
  })

  await arrancarSesion()
  arrancarRouter()
  cargarZona()

  // Ubicación: si ya se concedió en otra visita, se usa. Si no, se invita
  // (nunca se pide sola al abrir: el navegador lo penaliza y asusta).
  const permiso = await localizarSiYaHayPermiso()
  if (permiso === 'prompt' || permiso === 'denied') $('#aviso-ubicacion').hidden = false
  $('#aviso-ubicacion [data-accion="activar"]')?.addEventListener('click', async () => {
    $('#aviso-ubicacion').hidden = true
    await localizar()
  })
  $('#aviso-ubicacion [data-accion="descartar"]')?.addEventListener('click', () => {
    $('#aviso-ubicacion').hidden = true
  })
}

arrancar().catch((err) => {
  console.error('No arranca:', err)
  toast('La app no ha podido arrancar. Recarga la página.', { tipo: 'error', ms: 10_000 })
})
