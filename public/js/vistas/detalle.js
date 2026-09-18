import { api, mensajeDe, ErrorApi } from '../api.js'
import { estado, avisar } from '../estado.js'
import { tipoDe } from '../tipos.js'
import { html, pintar, $, estadoTemporal, rangoFechas, formatoDistancia, distanciaM, plural, mesYAnio } from '../util.js'
import { toast, esqueleto, pintarError, avatar, burbujaTipo, confirmar, conBoton } from '../ui.js'
import { analizarCancion, crearReproductor } from '../musica.js'
import { urlImagen } from '../imagen.js'
import { centrarEn, resaltarBurbuja } from '../mapa.js'
import { navegar, cerrarPanel } from '../router.js'
import { pedirSesion } from '../sesion.js'

/**
 * Ficha de una fiesta: GET /api/eventos/:id.
 * Si se llega pulsando la burbuja, la canción arranca sola: el toque
 * en la burbuja es el gesto que el navegador exige para reproducir audio.
 */

let sonarAlAbrir = false
/** El evento que está pintado ahora mismo, con los datos más recientes. */
let actual = null
export const marcarSonarAlAbrir = () => (sonarAlAbrir = true)

export async function vistaDetalle({ id }, cont, cancelada) {
  const sonar = sonarAlAbrir
  sonarAlAbrir = false

  // Si ya lo tenemos del mapa, se pinta al instante y se completa al llegar la ficha.
  const previo = estado.eventos.get(id)
  if (previo) {
    pintarFicha(cont, { evento: previo, organizador: undefined, estoyApuntado: estado.apuntado.has(id) }, { sonar })
  } else {
    pintar(cont, esqueleto())
  }
  resaltarBurbuja(id)

  let datos
  try {
    datos = await api.evento(id)
  } catch (err) {
    if (cancelada()) return
    if (err instanceof ErrorApi && err.estado === 404) {
      estado.eventos.delete(id)
      avisar('eventos')
      pintarError(cont, 'Esta fiesta ya no existe o la han retirado.')
    } else {
      pintarError(cont, mensajeDe(err), () => vistaDetalle({ id }, cont, cancelada))
    }
    return () => resaltarBurbuja(null)
  }
  if (cancelada()) return

  // Sincronizar lo que sabemos con lo que dice el servidor.
  if (datos.estoyApuntado) estado.apuntado.add(id)
  else estado.apuntado.delete(id)
  if (estado.eventos.has(id)) {
    estado.eventos.set(id, datos.evento)
    avisar('eventos')
  }

  if (!previo) {
    centrarEn(datos.evento.lat, datos.evento.lng, 16)
    pintarFicha(cont, datos, { sonar })
  } else {
    // Sin repintar entero: si la música ya suena, no se corta.
    completarFicha(cont, datos)
  }

  return () => {
    resaltarBurbuja(null)
    // Al cerrar se quita el iframe: la música se para.
    $('.reproductor', cont)?.replaceChildren()
  }
}

function pintarFicha(cont, { evento: ev, organizador, estoyApuntado }, { sonar }) {
  actual = ev
  const tipo = tipoDe(ev.tipo)
  const temporal = estadoTemporal(ev)
  const cancion = analizarCancion(ev.cancionUrl)
  const dist = estado.posicion ? distanciaM(estado.posicion[0], estado.posicion[1], ev.lat, ev.lng) : null
  const terminada = temporal.clave === 'terminada'
  const foto = urlImagen(ev.imagen?.grande)

  pintar(
    cont,
    html`
    <article class="ficha t-${ev.tipo}" data-id="${ev.id}">
      ${foto
        ? html`<figure class="ficha-portada">
            <img class="portada-fondo" src="${foto}" alt="" aria-hidden="true" decoding="async">
            <img class="portada-imagen" src="${foto}" alt="Imagen de ${ev.titulo}" decoding="async" data-respaldo="${tipo.emoji}">
          </figure>`
        : ''}
      <header class="ficha-cabecera">
        ${foto ? '' : burbujaTipo(ev.tipo, 'grande')}
        <div class="ficha-etiquetas">
          <span class="pastilla pastilla-tipo">${tipo.nombre}</span>
          <span class="pastilla pastilla-${temporal.clave}">${temporal.clave === 'ahora' ? html`<i class="punto-vivo"></i>` : ''}${temporal.texto}</span>
        </div>
        <h2 class="ficha-titulo" id="panel-titulo" tabindex="-1">${ev.titulo}</h2>
      </header>

      ${cancion
        ? html`<section class="musica" aria-label="Canción">
            <div class="reproductor"></div>
            ${cancion.embed
              ? html`<button class="btn-escuchar" data-accion="escuchar">
                  <span class="btn-escuchar-icono" aria-hidden="true">▶</span>
                  <span><b>Escuchar la canción</b><small>${cancion.servicio}</small></span>
                  <span class="ecualizador" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                </button>`
              : html`<a class="btn-escuchar" href="${cancion.abrir}" target="_blank" rel="noopener noreferrer">
                  <span class="btn-escuchar-icono" aria-hidden="true">↗</span>
                  <span><b>Escuchar la canción</b><small>Abrir en ${cancion.servicio}</small></span>
                </a>`}
          </section>`
        : ''}

      <ul class="ficha-datos">
        <li><span class="icono" aria-hidden="true">🕒</span><span>${rangoFechas(ev)}</span></li>
        <li>
          <span class="icono" aria-hidden="true">📍</span>
          <span>${dist != null ? `A ${formatoDistancia(dist)} de ti` : 'En el mapa'}
            <button class="enlace" data-accion="ver-mapa">Centrar</button></span>
        </li>
        <li class="fila-apuntados"><span class="icono" aria-hidden="true">🙋</span><span data-suscritos>${textoSuscritos(ev.suscritos)}</span></li>
      </ul>

      <div class="organizador" data-organizador>${filaOrganizador(ev, organizador)}</div>

      ${ev.descripcion ? html`<p class="ficha-descripcion">${ev.descripcion}</p>` : ''}

      <div class="ficha-acciones">
        <button class="btn btn-primario btn-apuntarse ${estoyApuntado ? 'activo' : ''}" data-accion="apuntarse"
          aria-pressed="${estoyApuntado ? 'true' : 'false'}" ${terminada ? 'disabled' : ''}>
          ${terminada ? 'Ya ha terminado' : estoyApuntado ? '✓ Me apunto' : 'Me apunto'}
        </button>
        <a class="btn btn-secundario" href="https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}"
          target="_blank" rel="noopener noreferrer">Cómo llegar</a>
        <button class="btn btn-secundario btn-icono" data-accion="compartir" aria-label="Compartir">↗</button>
      </div>

      <footer class="ficha-pie" data-pie>${pieFicha(ev)}</footer>
    </article>`,
  )

  cont.addEventListener('click', (e) => manejarClick(e, cont), { signal: nuevaSenal(cont) })
  if (sonar && cancion?.embed) empezarMusica(cont, ev, cancion)
  $('#panel-titulo', cont)?.focus({ preventScroll: true })
}

/** Rellena lo que sólo trae la ficha completa, sin tocar el reproductor. */
function completarFicha(cont, { evento, organizador, estoyApuntado }) {
  actual = evento
  const org = $('[data-organizador]', cont)
  if (org) pintar(org, filaOrganizador(evento, organizador))
  const pie = $('[data-pie]', cont)
  if (pie) pintar(pie, pieFicha(evento))
  pintarBotonApuntarse(cont, estoyApuntado, evento.suscritos)
}

const textoSuscritos = (n) => (n > 0 ? `${plural(n, 'persona se apunta', 'personas se apuntan')}` : 'Aún no se ha apuntado nadie')

function filaOrganizador(ev, organizador) {
  if (organizador === undefined) return html`<div class="organizador-cargando esq esq-linea"></div>`
  if (organizador === null) return html`<span class="organizador-anonimo">Organizador desconocido</span>`
  return html`
    <a class="organizador-enlace" href="#/usuario/${encodeURIComponent(organizador.id)}">
      ${avatar(organizador)}
      <span><small>${ev.esMio ? 'La organizas tú' : 'Organiza'}</small><b>${organizador.nombre}</b>
      ${organizador.desde ? html`<small>En Kedada desde ${mesYAnio(organizador.desde)}</small>` : ''}</span>
      <span class="flecha" aria-hidden="true">›</span>
    </a>`
}

function pieFicha(ev) {
  if (ev.esMio) {
    return html`
      <a class="btn btn-secundario" href="#/evento/${ev.id}/editar">Editar</a>
      <button class="btn btn-peligro-suave" data-accion="borrar">Borrar</button>`
  }
  return html`<a class="enlace enlace-tenue" href="#/evento/${ev.id}/denunciar">Denunciar esta fiesta</a>`
}

function pintarBotonApuntarse(cont, apuntado, suscritos) {
  const btn = $('[data-accion="apuntarse"]', cont)
  if (!btn || btn.disabled) return
  btn.classList.toggle('activo', apuntado)
  btn.setAttribute('aria-pressed', String(apuntado))
  btn.textContent = apuntado ? '✓ Me apunto' : 'Me apunto'
  const s = $('[data-suscritos]', cont)
  if (s && suscritos != null) s.textContent = textoSuscritos(suscritos)
}

/* Un AbortController por pintado, para no acumular listeners al repintar. */
const senales = new WeakMap()
function nuevaSenal(cont) {
  senales.get(cont)?.abort()
  const c = new AbortController()
  senales.set(cont, c)
  return c.signal
}

async function manejarClick(e, cont) {
  const boton = e.target.closest('[data-accion]')
  if (!boton) return
  const ev = actual
  if (!ev || $('.ficha', cont)?.dataset.id !== ev.id) return

  switch (boton.dataset.accion) {
    case 'escuchar': {
      const cancion = analizarCancion(ev.cancionUrl)
      if (cancion?.embed) empezarMusica(cont, ev, cancion)
      break
    }
    case 'ver-mapa':
      centrarEn(ev.lat, ev.lng, 17)
      if (window.matchMedia('(max-width: 899px)').matches) cerrarPanel()
      break
    case 'apuntarse':
      await alternarApuntarse(cont, boton, ev)
      break
    case 'compartir':
      await compartir(ev)
      break
    case 'borrar':
      await borrar(ev, boton)
      break
  }
}

function empezarMusica(cont, ev, cancion) {
  const hueco = $('.reproductor', cont)
  const boton = $('[data-accion="escuchar"]', cont)
  if (!hueco || hueco.childElementCount) return
  hueco.appendChild(crearReproductor(cancion, ev.titulo))
  hueco.classList.add('activo')
  boton?.remove()
}

async function alternarApuntarse(cont, boton, ev) {
  if (!estado.usuario) return pedirSesion(`/evento/${ev.id}`, 'Entra para apuntarte a fiestas')

  const estaba = estado.apuntado.has(ev.id)
  // Optimista: se cambia ya y se deshace si falla.
  pintarBotonApuntarse(cont, !estaba, (ev.suscritos ?? 0) + (estaba ? -1 : 1))
  boton.disabled = true
  try {
    const r = estaba ? await api.desapuntarse(ev.id) : await api.apuntarse(ev.id)
    if (r.suscrito) estado.apuntado.add(ev.id)
    else estado.apuntado.delete(ev.id)
    const actualizado = { ...ev, suscritos: r.suscritos }
    if (actual?.id === ev.id) actual = actualizado
    if (estado.eventos.has(ev.id)) estado.eventos.set(ev.id, actualizado)
    avisar('eventos')
    boton.disabled = false
    pintarBotonApuntarse(cont, r.suscrito, r.suscritos)
    if (r.suscrito && !estaba) toast('¡Apuntado! La tienes en tu perfil 🎉')
  } catch (err) {
    boton.disabled = false
    pintarBotonApuntarse(cont, estaba, ev.suscritos)
    if (err.estado !== 401) toast(mensajeDe(err), { tipo: 'error' })
  }
}

async function compartir(ev) {
  const url = `${location.origin}${location.pathname}#/evento/${ev.id}`
  const datos = { title: ev.titulo, text: `${ev.titulo} · ${rangoFechas(ev)}`, url }
  try {
    if (navigator.share) return await navigator.share(datos)
    await navigator.clipboard.writeText(url)
    toast('Enlace copiado')
  } catch (err) {
    if (err?.name !== 'AbortError') toast('No se ha podido compartir')
  }
}

async function borrar(ev, boton) {
  const ok = await confirmar({
    titulo: '¿Borrar esta fiesta?',
    texto: `"${ev.titulo}" desaparecerá del mapa y de los perfiles de quienes se habían apuntado. No se puede deshacer.`,
    aceptar: 'Borrar',
    peligro: true,
  })
  if (!ok) return
  try {
    await conBoton(boton, 'Borrando…', () => api.borrarEvento(ev.id))
    estado.eventos.delete(ev.id)
    estado.apuntado.delete(ev.id)
    avisar('eventos')
    toast('Fiesta borrada')
    navegar('/', { reemplazar: true })
  } catch (err) {
    toast(mensajeDe(err), { tipo: 'error' })
  }
}
