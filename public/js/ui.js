import { $, html, pintar, iniciales, urlSegura } from './util.js'
import { tipoDe } from './tipos.js'
import { urlImagen } from './imagen.js'

/* ------------------------------------------------------------------ *
 *  Toast
 * ------------------------------------------------------------------ */

let temporizadorToast
export function toast(mensaje, { tipo = 'info', ms = 3200 } = {}) {
  const el = $('#toast')
  el.textContent = mensaje
  el.dataset.tipo = tipo
  el.classList.add('visible')
  clearTimeout(temporizadorToast)
  temporizadorToast = setTimeout(() => el.classList.remove('visible'), ms)
}

/* ------------------------------------------------------------------ *
 *  Panel: el contenedor donde se pintan las vistas (detalle, crear,
 *  perfil…). En móvil es una hoja que sube desde abajo; en escritorio,
 *  una columna a la derecha. Lo abre y cierra el router.
 * ------------------------------------------------------------------ */

export const panel = {
  get el() {
    return $('#panel')
  },
  get cuerpo() {
    return $('#panel-cuerpo')
  },
  abrir({ etiqueta = '', ancho = false } = {}) {
    const el = this.el
    el.setAttribute('aria-label', etiqueta)
    el.classList.toggle('ancho', ancho)
    el.hidden = false
    document.body.classList.add('panel-abierto')
    // Contenedor nuevo en cada vista: se van con él todos los listeners de
    // la vista anterior y no se acumulan.
    const viejo = this.cuerpo
    const nuevo = viejo.cloneNode(false)
    viejo.replaceWith(nuevo)
    // Un frame para que la transición arranque desde el estado cerrado.
    requestAnimationFrame(() => el.classList.add('abierto'))
    this.cuerpo.scrollTop = 0
  },
  cerrar() {
    const el = this.el
    el.classList.remove('abierto')
    document.body.classList.remove('panel-abierto')
    setTimeout(() => {
      if (!el.classList.contains('abierto')) {
        el.hidden = true
        this.cuerpo.replaceChildren()
      }
    }, 280)
  },
  estaAbierto() {
    return this.el.classList.contains('abierto')
  },
}

/** Esqueleto de carga genérico para el panel. */
export function esqueleto() {
  return html`
    <div class="esqueleto" aria-busy="true" aria-label="Cargando">
      <div class="esq esq-circulo"></div>
      <div class="esq esq-linea ancha"></div>
      <div class="esq esq-linea"></div>
      <div class="esq esq-bloque"></div>
      <div class="esq esq-linea"></div>
    </div>`
}

/** Estado de error dentro del panel, con reintento. */
export function pintarError(contenedor, mensaje, reintentar) {
  pintar(
    contenedor,
    html`<div class="vacio">
      <div class="vacio-emoji">😵‍💫</div>
      <p>${mensaje}</p>
      ${reintentar ? html`<button class="btn btn-secundario" data-accion="reintentar">Reintentar</button>` : ''}
    </div>`,
  )
  contenedor.querySelector('[data-accion="reintentar"]')?.addEventListener('click', reintentar)
}

/* ------------------------------------------------------------------ *
 *  Avatar de persona y "burbuja" de tipo
 * ------------------------------------------------------------------ */

export function avatar(usuario, clase = '') {
  const foto = urlSegura(usuario?.foto)
  if (foto) {
    // no-referrer: las fotos de Google fallan a veces si llevan Referer.
    return html`<span class="avatar ${clase}"><img src="${foto}" alt="" referrerpolicy="no-referrer" loading="lazy"></span>`
  }
  return html`<span class="avatar avatar-letras ${clase}" aria-hidden="true">${iniciales(usuario?.nombre)}</span>`
}

/**
 * Círculo del evento: su foto si la tiene, si no el emoji del tipo. El borde
 * siempre lleva el color del tipo (por clase t-bar, t-pub…, por el CSP).
 */
export function burbujaTipo(tipo, clase = '', imagen = null) {
  const emoji = tipoDe(tipo).emoji
  const src = urlImagen(imagen?.mini)
  if (src) {
    return html`<span class="burbuja-tipo con-foto t-${tipo} ${clase}" aria-hidden="true"><img src="${src}" alt="" loading="lazy" decoding="async" data-respaldo="${emoji}"></span>`
  }
  return html`<span class="burbuja-tipo t-${tipo} ${clase}" aria-hidden="true">${emoji}</span>`
}

/* ------------------------------------------------------------------ *
 *  Confirmación propia (window.confirm bloquea y no se puede estilar)
 * ------------------------------------------------------------------ */

export function confirmar({ titulo, texto, aceptar = 'Aceptar', peligro = false, exigirTexto = '' }) {
  return new Promise((resolver) => {
    const capa = document.createElement('div')
    capa.className = 'dialogo-capa'
    pintar(
      capa,
      html`<div class="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
        <h2 id="dlg-t">${titulo}</h2>
        <p id="dlg-d">${texto}</p>
        ${exigirTexto
          ? html`<label class="campo"><span class="campo-etiqueta">Escribe <b>${exigirTexto}</b> para confirmar</span>
              <input type="text" autocomplete="off" autocapitalize="characters" data-confirmar></label>`
          : ''}
        <div class="dialogo-botones">
          <button class="btn btn-secundario" data-r="no">Cancelar</button>
          <button class="btn ${peligro ? 'btn-peligro' : 'btn-primario'}" data-r="si" ${exigirTexto ? 'disabled' : ''}>${aceptar}</button>
        </div>
      </div>`,
    )
    document.body.appendChild(capa)
    const si = capa.querySelector('[data-r="si"]')
    const entrada = capa.querySelector('[data-confirmar]')
    entrada?.addEventListener('input', () => {
      si.disabled = entrada.value.trim().toUpperCase() !== exigirTexto
    })

    const terminar = (valor) => {
      document.removeEventListener('keydown', teclas, true)
      capa.remove()
      resolver(valor)
    }
    const teclas = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        terminar(false)
      }
    }
    document.addEventListener('keydown', teclas, true)
    capa.addEventListener('click', (e) => {
      if (e.target === capa) terminar(false)
      const r = e.target.closest('[data-r]')?.dataset.r
      if (r === 'no') terminar(false)
      if (r === 'si' && !si.disabled) terminar(true)
    })
    requestAnimationFrame(() => (entrada ?? capa.querySelector('[data-r="no"]')).focus())
  })
}

/** Deshabilita un botón mientras dura una promesa, con texto de espera. */
export async function conBoton(boton, textoEspera, tarea) {
  const original = boton.innerHTML
  boton.disabled = true
  boton.classList.add('cargando')
  if (textoEspera) boton.textContent = textoEspera
  try {
    return await tarea()
  } finally {
    boton.disabled = false
    boton.classList.remove('cargando')
    boton.innerHTML = original
  }
}
