import { api, mensajeDe } from '../api.js'
import { estado } from '../estado.js'
import { tipoDe } from '../tipos.js'
import { html, pintar, $, $$, estadoTemporal, mesYAnio, plural, formatoDistancia, distanciaM } from '../util.js'
import { toast, esqueleto, pintarError, avatar, burbujaTipo, confirmar, conBoton } from '../ui.js'
import { navegar } from '../router.js'
import { pedirSesion, salir, borrarCuenta } from '../sesion.js'

/* ================================================================== *
 *  Mi perfil: GET /api/usuarios/yo + /api/yo/suscripciones + /api/yo/eventos
 * ================================================================== */

let pestanaRecordada = 'apuntado'

export async function vistaYo(_, cont, cancelada) {
  if (!estado.usuario) return pedirSesion('/yo', 'Entra para ver tu perfil')
  pintar(cont, esqueleto())

  let ficha
  try {
    ficha = await api.miFicha()
  } catch (err) {
    if (!cancelada()) pintarError(cont, mensajeDe(err), () => vistaYo(_, cont, cancelada))
    return
  }
  if (cancelada()) return
  const u = ficha.usuario

  pintar(
    cont,
    html`
    <section class="perfil">
      <header class="perfil-cabecera">
        ${avatar(u, 'grande')}
        <div>
          <h2 id="panel-titulo" tabindex="-1">${u.nombre ?? 'Sin nombre'}</h2>
          ${u.email ? html`<p class="tenue">${u.email} <span class="chapa-privado" title="Sólo lo ves tú">privado</span></p>` : ''}
          ${u.desde ? html`<p class="tenue">En Kedada desde ${mesYAnio(u.desde)}</p>` : ''}
        </div>
      </header>

      <div class="contadores">
        <div><b>${ficha.suscripciones}</b><span>${ficha.suscripciones === 1 ? 'apuntada' : 'apuntadas'}</span></div>
        <div><b>${ficha.eventosCreados}</b><span>${ficha.eventosCreados === 1 ? 'organizada' : 'organizadas'}</span></div>
      </div>

      <div class="pestanas" role="tablist">
        <button role="tab" data-pestana="apuntado" aria-selected="false">Me apunto</button>
        <button role="tab" data-pestana="organizo" aria-selected="false">Organizo</button>
      </div>
      <div class="pestana-contenido" role="tabpanel" data-contenido></div>

      <div class="perfil-acciones">
        <a class="btn btn-primario" href="#/crear">＋ Crear una fiesta</a>
        <button class="btn btn-secundario" data-accion="salir">Cerrar sesión</button>
      </div>

      <details class="zona-peligro">
        <summary>Borrar mi cuenta</summary>
        <p>Se borra tu perfil, las fiestas que has creado, tus suscripciones y tus denuncias. No hay vuelta atrás
          y no guardamos copia.</p>
        <button class="btn btn-peligro" data-accion="borrar-cuenta">Borrar mi cuenta y todo lo mío</button>
      </details>
    </section>`,
  )

  const contenido = $('[data-contenido]', cont)
  let verPasadas = false

  const mostrar = async (pestana) => {
    pestanaRecordada = pestana
    $$('[data-pestana]', cont).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pestana === pestana)))
    pintar(contenido, html`<div class="esq esq-bloque"></div><div class="esq esq-bloque"></div>`)
    try {
      if (pestana === 'apuntado') {
        const { eventos } = await api.misSuscripciones(verPasadas)
        if (cancelada()) return
        pintar(
          contenido,
          html`
          <label class="interruptor"><input type="checkbox" data-pasadas ${verPasadas ? 'checked' : ''}> Ver también las que ya pasaron</label>
          ${eventos.length
            ? html`<ul class="lista-eventos">${eventos.map((e) => filaEvento(e))}</ul>`
            : html`<div class="vacio pequeno"><p>Aún no te has apuntado a nada.</p><p class="tenue">Toca una burbuja del mapa y dale a «Me apunto».</p></div>`}`,
        )
        $('[data-pasadas]', contenido)?.addEventListener('change', (e) => {
          verPasadas = e.target.checked
          mostrar('apuntado')
        })
      } else {
        const { eventos } = await api.misEventos()
        if (cancelada()) return
        pintar(
          contenido,
          eventos.length
            ? html`<ul class="lista-eventos">${eventos.map((e) => filaEvento(e, { propio: true }))}</ul>`
            : html`<div class="vacio pequeno"><p>No has organizado nada todavía.</p><a class="btn btn-secundario" href="#/crear">Crear la primera</a></div>`,
        )
      }
    } catch (err) {
      if (!cancelada()) pintarError(contenido, mensajeDe(err), () => mostrar(pestana))
    }
  }

  cont.addEventListener('click', async (e) => {
    const pestana = e.target.closest('[data-pestana]')?.dataset.pestana
    if (pestana) return mostrar(pestana)

    const boton = e.target.closest('[data-accion]')
    if (boton?.dataset.accion === 'salir') {
      if (await salir()) {
        toast('Sesión cerrada')
        navegar('/', { reemplazar: true })
      }
    }
    if (boton?.dataset.accion === 'borrar-cuenta') {
      const ok = await confirmar({
        titulo: '¿Borrar tu cuenta?',
        texto: `Se borrarán tu perfil, ${plural(ficha.eventosCreados, 'fiesta creada', 'fiestas creadas')} y todas tus suscripciones. No se puede deshacer.`,
        aceptar: 'Borrar para siempre',
        peligro: true,
        exigirTexto: 'BORRAR',
      })
      if (!ok) return
      try {
        await conBoton(boton, 'Borrando…', borrarCuenta)
        toast('Cuenta borrada. Hasta pronto 👋', { ms: 5000 })
        navegar('/', { reemplazar: true })
      } catch (err) {
        toast(mensajeDe(err), { tipo: 'error' })
      }
    }
  })

  mostrar(pestanaRecordada)
  $('#panel-titulo', cont)?.focus({ preventScroll: true })
}

function filaEvento(e, { propio = false } = {}) {
  const t = estadoTemporal(e)
  return html`
    <li>
      <a class="fila-evento ${t.clave === 'terminada' ? 'pasada' : ''}" href="#/evento/${e.id}">
        ${burbujaTipo(e.tipo, '', e.imagen)}
        <span class="fila-evento-info">
          <b>${e.titulo}</b>
          <small>${tipoDe(e.tipo).nombre} · ${t.texto}</small>
          ${propio && e.oculto ? html`<small class="aviso-oculto">Oculta tras ${plural(e.denuncias, 'denuncia', 'denuncias')}: nadie la ve en el mapa</small>` : ''}
          ${propio && !e.oculto && e.denuncias > 0 ? html`<small class="aviso-denuncias">${plural(e.denuncias, 'denuncia', 'denuncias')}</small>` : ''}
        </span>
        <span class="fila-evento-extra">🙋 ${e.suscritos}</span>
      </a>
    </li>`
}

/* ================================================================== *
 *  Perfil público de otra persona: GET /api/usuarios/:id (sin email)
 * ================================================================== */

export async function vistaUsuario({ id }, cont, cancelada) {
  if (estado.usuario?.id === id) return navegar('/yo', { reemplazar: true })
  pintar(cont, esqueleto())

  let datos
  try {
    datos = await api.perfil(id)
  } catch (err) {
    if (!cancelada()) pintarError(cont, err.estado === 404 ? 'Esta persona ya no tiene cuenta.' : mensajeDe(err))
    return
  }
  if (cancelada()) return
  const u = datos.usuario

  // La API no lista las fiestas de otra persona; enseñamos las que ya están
  // cargadas en el mapa de esta zona.
  const cerca = [...estado.eventos.values()]
    .filter((e) => e.creadoPor === id)
    .sort((a, b) => new Date(a.empiezaEn) - new Date(b.empiezaEn))

  pintar(
    cont,
    html`
    <section class="perfil">
      <header class="perfil-cabecera">
        ${avatar(u, 'grande')}
        <div>
          <h2 id="panel-titulo" tabindex="-1">${u.nombre}</h2>
          ${u.desde ? html`<p class="tenue">En Kedada desde ${mesYAnio(u.desde)}</p>` : ''}
        </div>
      </header>
      <div class="contadores">
        <div><b>${datos.eventosCreados}</b><span>${datos.eventosCreados === 1 ? 'fiesta organizada' : 'fiestas organizadas'}</span></div>
      </div>
      <h3 class="subtitulo">En esta zona del mapa</h3>
      ${cerca.length
        ? html`<ul class="lista-eventos">${cerca.map((e) => {
            const d = estado.posicion ? formatoDistancia(distanciaM(estado.posicion[0], estado.posicion[1], e.lat, e.lng)) : ''
            return html`<li><a class="fila-evento" href="#/evento/${e.id}">${burbujaTipo(e.tipo, '', e.imagen)}
              <span class="fila-evento-info"><b>${e.titulo}</b><small>${estadoTemporal(e).texto}</small></span>
              <span class="fila-evento-extra">${d}</span></a></li>`
          })}</ul>`
        : html`<p class="tenue">No tiene nada en la zona que estás mirando.</p>`}
    </section>`,
  )
  $('#panel-titulo', cont)?.focus({ preventScroll: true })
}
