import { estado, escuchar } from './estado.js'
import { TIPOS, tipoDe } from './tipos.js'
import { html, pintar, $, estadoTemporal, encajaCuando, distanciaM, formatoDistancia, plural } from './util.js'
import { burbujaTipo } from './ui.js'
import { pintarBurbujas, obtenerMapa, cargarZona } from './mapa.js'

/**
 * Filtros de la barra superior y lista de la hoja inferior.
 * Son la misma información que el mapa, ordenada: primero lo que está
 * pasando ahora, luego por cercanía.
 */

const CUANDO = [
  ['todo', 'Cuando sea'],
  ['ahora', 'Ahora'],
  ['hoy', 'Hoy'],
  ['finde', 'Este finde'],
]

export function iniciarFiltros() {
  const barra = $('#filtros')
  const pintarBarra = () =>
    pintar(
      barra,
      html`
      <div class="grupo-chips" role="radiogroup" aria-label="Cuándo">
        ${CUANDO.map(
          ([clave, texto]) =>
            html`<button class="chip ${estado.filtros.cuando === clave ? 'activo' : ''}" role="radio"
              aria-checked="${estado.filtros.cuando === clave}" data-cuando="${clave}">${texto}</button>`,
        )}
      </div>
      <span class="separador-chips" aria-hidden="true"></span>
      <div class="grupo-chips" role="radiogroup" aria-label="Tipo">
        <button class="chip ${!estado.filtros.tipo ? 'activo' : ''}" role="radio" aria-checked="${!estado.filtros.tipo}" data-tipo="">Todo</button>
        ${Object.entries(TIPOS).map(
          ([clave, t]) =>
            html`<button class="chip t-${clave} ${estado.filtros.tipo === clave ? 'activo' : ''}" role="radio"
              aria-checked="${estado.filtros.tipo === clave}" data-tipo="${clave}"><span aria-hidden="true">${t.emoji}</span> ${t.nombre}</button>`,
        )}
      </div>`,
    )
  pintarBarra()

  barra.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if ('cuando' in b.dataset) {
      estado.filtros.cuando = b.dataset.cuando
      pintarBarra()
      refrescarVista()
    }
    if ('tipo' in b.dataset) {
      estado.filtros.tipo = b.dataset.tipo
      pintarBarra()
      // El tipo lo filtra la API: con 100 resultados como máximo, filtrar en el
      // cliente dejaría fuera fiestas del tipo buscado.
      cargarZona()
    }
  })
}

export function eventosVisibles() {
  const ahora = new Date()
  return [...estado.eventos.values()].filter((e) => encajaCuando(e, estado.filtros.cuando, ahora))
}

export function refrescarVista() {
  const lista = eventosVisibles()
  pintarBurbujas(lista)
  pintarLista(lista)
}

function pintarLista(lista) {
  const mapa = obtenerMapa()
  const referencia = estado.posicion ?? (mapa ? [mapa.getCenter().lat, mapa.getCenter().lng] : null)
  const ahora = new Date()
  const orden = { ahora: 0, pronto: 1, luego: 2, terminada: 3 }

  const conDatos = lista
    .map((e) => ({
      e,
      t: estadoTemporal(e, ahora),
      d: referencia ? distanciaM(referencia[0], referencia[1], e.lat, e.lng) : null,
    }))
    .sort((a, b) => orden[a.t.clave] - orden[b.t.clave] || (a.d ?? 0) - (b.d ?? 0))

  const enVivo = conDatos.filter((x) => x.t.clave === 'ahora').length
  $('#hoja-titulo').textContent = conDatos.length ? plural(conDatos.length, 'fiesta por aquí', 'fiestas por aquí') : 'Nada por aquí'
  $('#hoja-resumen').textContent = enVivo ? `${enVivo} en marcha ahora` : ''

  const cont = $('#lista-eventos')
  if (!conDatos.length) {
    pintar(
      cont,
      html`<div class="vacio pequeno">
        <div class="vacio-emoji" aria-hidden="true">🌙</div>
        <p>${estado.filtros.tipo || estado.filtros.cuando !== 'todo' ? 'Nada con estos filtros en esta zona.' : 'No hay fiestas en esta zona todavía.'}</p>
        <p class="tenue">Aleja el mapa, cambia los filtros o <a href="#/crear">monta la tuya</a>.</p>
      </div>`,
    )
    return
  }

  pintar(
    cont,
    html`<ul class="lista-eventos">
      ${conDatos.map(
        ({ e, t, d }) => html`
        <li>
          <a class="fila-evento cuando-${t.clave}" href="#/evento/${e.id}" data-id="${e.id}">
            ${burbujaTipo(e.tipo)}
            <span class="fila-evento-info">
              <b>${e.titulo}</b>
              <small>${t.clave === 'ahora' ? html`<i class="punto-vivo"></i>` : ''}${t.texto} · ${tipoDe(e.tipo).nombre}</small>
            </span>
            <span class="fila-evento-extra">
              ${d != null ? html`<span>${formatoDistancia(d)}</span>` : ''}
              <span class="marcas">${e.cancionUrl ? html`<span title="Tiene canción">♪</span>` : ''}${estado.apuntado.has(e.id) ? html`<span class="marca-apuntado" title="Te apuntas">✓</span>` : ''}${e.esMio ? html`<span title="La organizas tú">★</span>` : ''}</span>
            </span>
          </a>
        </li>`,
      )}
    </ul>`,
  )
}

/* ------------------------------------------------------------------ *
 *  Hoja inferior (móvil): tres alturas, se arrastra o se toca el asa.
 * ------------------------------------------------------------------ */

export function iniciarHoja() {
  const hoja = $('#hoja')
  const asa = $('#hoja-asa')
  const alturas = ['baja', 'media', 'alta']
  let nivel = 'baja'

  const poner = (n) => {
    nivel = n
    hoja.dataset.nivel = n
    asa.setAttribute('aria-expanded', String(n !== 'baja'))
  }
  poner('baja')

  asa.addEventListener('click', () => poner(nivel === 'baja' ? 'media' : nivel === 'media' ? 'alta' : 'baja'))

  // Arrastre con el dedo desde la cabecera.
  let inicioY = null
  let movido = false
  const cabecera = $('#hoja-cabecera')
  cabecera.addEventListener('pointerdown', (e) => {
    inicioY = e.clientY
    movido = false
  })
  cabecera.addEventListener('pointermove', (e) => {
    if (inicioY == null) return
    const dy = e.clientY - inicioY
    // La captura se pide sólo al empezar a arrastrar: si se pidiera en
    // pointerdown, el click del asa acabaría en la cabecera y no haría nada.
    if (!movido && Math.abs(dy) > 8) {
      movido = true
      cabecera.setPointerCapture(e.pointerId)
    }
    if (movido) hoja.style.setProperty('--arrastre', `${dy}px`)
  })
  const soltar = (e) => {
    if (inicioY == null) return
    const dy = e.clientY - inicioY
    inicioY = null
    hoja.style.removeProperty('--arrastre')
    if (!movido) return
    const i = alturas.indexOf(nivel)
    if (dy < -40) poner(alturas[Math.min(i + 1, 2)])
    else if (dy > 40) poner(alturas[Math.max(i - 1, 0)])
  }
  cabecera.addEventListener('pointerup', soltar)
  cabecera.addEventListener('pointercancel', soltar)

  // Tocar una fila baja la hoja para que se vea el mapa y la ficha.
  $('#lista-eventos').addEventListener('click', (e) => {
    if (e.target.closest('.fila-evento')) poner('baja')
  })

  return { poner }
}

export function iniciarLista() {
  escuchar('eventos', refrescarVista)
  escuchar('posicion', refrescarVista)
  // Las etiquetas "En 20 min" / "Ahora" caducan solas: se repinta cada minuto.
  setInterval(refrescarVista, 60_000)
}
