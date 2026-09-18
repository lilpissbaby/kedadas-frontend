import { api, mensajeDe, ErrorApi } from '../api.js'
import { estado, avisar } from '../estado.js'
import { TIPOS, tipoDe } from '../tipos.js'
import { html, pintar, $, $$, aInputFecha, distanciaM, formatoDistancia } from '../util.js'
import { toast, esqueleto, pintarError, conBoton } from '../ui.js'
import { cancionValida, analizarCancion } from '../musica.js'
import { elegirUbicacion, centrarEn, localizar } from '../mapa.js'
import { navegar, volverOIr } from '../router.js'
import { pedirSesion } from '../sesion.js'
import { prepararImagen, urlImagen, ErrorImagen } from '../imagen.js'

/**
 * Crear y editar una fiesta. Las reglas de validación son las mismas que
 * CrearEvento/EditarEvento de la API (src/esquemas.ts), repetidas aquí sólo
 * para avisar antes de enviar. La que manda es siempre la de la API: si
 * responde con detalles, se marcan en el campo que toca.
 */

const TITULO_MIN = 3
const TITULO_MAX = 120
const DESC_MAX = 2000
const DURACION_MAX_MS = 7 * 24 * 3600 * 1000

/** Borrador de "crear" mientras dura la pestaña: cerrar sin querer no pierde lo escrito. */
let borrador = null

export async function vistaCrear(_, cont) {
  if (!estado.usuario) return pedirSesion('/crear', 'Entra para crear una fiesta')
  const inicio = new Date()
  inicio.setMinutes(0, 0, 0)
  inicio.setHours(inicio.getHours() + 1)
  const fin = new Date(inicio.getTime() + 4 * 3600 * 1000)

  const valores = borrador ?? {
    titulo: '',
    descripcion: '',
    tipo: '',
    lat: null,
    lng: null,
    empiezaEn: aInputFecha(inicio),
    terminaEn: aInputFecha(fin),
    cancionUrl: '',
    foto: { actual: null, nueva: null, quitada: false },
  }
  return montar(cont, { modo: 'crear', valores })
}

export async function vistaEditar({ id }, cont, cancelada) {
  if (!estado.usuario) return pedirSesion(`/evento/${id}/editar`, 'Entra para editar tu fiesta')
  pintar(cont, esqueleto())
  let evento
  try {
    ;({ evento } = await api.evento(id))
  } catch (err) {
    if (!cancelada()) pintarError(cont, mensajeDe(err), () => vistaEditar({ id }, cont, cancelada))
    return
  }
  if (cancelada()) return
  if (!evento.esMio) return pintarError(cont, 'Esta fiesta no es tuya, así que no puedes editarla.')

  const valores = {
    titulo: evento.titulo,
    descripcion: evento.descripcion ?? '',
    tipo: evento.tipo,
    lat: evento.lat,
    lng: evento.lng,
    empiezaEn: aInputFecha(evento.empiezaEn),
    terminaEn: aInputFecha(evento.terminaEn),
    cancionUrl: evento.cancionUrl ?? '',
    // actual: la que ya tiene en el servidor · nueva: la elegida ahora · quitada: volver al emoji
    foto: { actual: evento.imagen ?? null, nueva: null, quitada: false },
  }
  return montar(cont, { modo: 'editar', id, valores, original: { ...valores, teniaFoto: Boolean(evento.imagen) } })
}

function montar(cont, { modo, id, valores, original }) {
  const v = valores
  duracionPrevia = +new Date(v.terminaEn) - +new Date(v.empiezaEn) || null

  pintar(
    cont,
    html`
    <form class="formulario" novalidate>
      <h2 id="panel-titulo" tabindex="-1">${modo === 'crear' ? 'Crear una fiesta' : 'Editar la fiesta'}</h2>

      <label class="campo" data-campo="titulo">
        <span class="campo-etiqueta">¿Qué se celebra?</span>
        <input type="text" name="titulo" value="${v.titulo}" maxlength="${TITULO_MAX}" required
          placeholder="Ej. Verbena en la plaza del barrio" autocomplete="off" enterkeyhint="next">
        <span class="campo-error" aria-live="polite"></span>
      </label>

      <div class="campo" data-campo="imagen">
        <span class="campo-etiqueta">Imagen de la burbuja <small>opcional</small></span>
        ${estado.salud?.imagenes
          ? html`<div class="selector-foto">
              <span class="vista-burbuja" data-vista-burbuja aria-hidden="true"></span>
              <div class="selector-foto-acciones">
                <label class="btn btn-secundario boton-archivo">
                  <span data-texto-foto>📷 Elegir foto</span>
                  <input type="file" accept="image/*" class="oculto-visual" data-archivo>
                </label>
                <button type="button" class="btn btn-fantasma" data-accion="quitar-foto" hidden>Quitar</button>
              </div>
            </div>
            <span class="campo-ayuda">Sale dentro de tu burbuja en el mapa y arriba en la ficha. Si no pones ninguna, se usa el emoji del tipo.</span>`
          : html`<span class="campo-ayuda">Las fotos no están activadas en este servidor todavía: tu burbuja llevará el emoji del tipo.</span>`}
        <span class="campo-error" aria-live="polite"></span>
      </div>

      <fieldset class="campo" data-campo="tipo">
        <legend class="campo-etiqueta">Tipo</legend>
        <div class="rejilla-tipos">
          ${Object.entries(TIPOS).map(
            ([clave, t]) => html`
            <label class="opcion-tipo t-${clave}">
              <input type="radio" name="tipo" value="${clave}" ${v.tipo === clave ? 'checked' : ''} required>
              <span class="opcion-tipo-emoji" aria-hidden="true">${t.emoji}</span>
              <span>${t.nombre}</span>
            </label>`,
          )}
        </div>
        <span class="campo-error" aria-live="polite"></span>
      </fieldset>

      <div class="campo" data-campo="ubicacion">
        <span class="campo-etiqueta">¿Dónde?</span>
        <div class="ubicacion-elegida" data-ubicacion></div>
        <div class="fila-botones">
          <button type="button" class="btn btn-secundario" data-accion="usar-mi-ubicacion">📍 Donde estoy</button>
          <button type="button" class="btn btn-secundario" data-accion="elegir-en-mapa">🗺️ Elegir en el mapa</button>
        </div>
        <span class="campo-error" aria-live="polite"></span>
      </div>

      <div class="fila-campos">
        <label class="campo" data-campo="empiezaEn">
          <span class="campo-etiqueta">Empieza</span>
          <input type="datetime-local" name="empiezaEn" value="${v.empiezaEn}" required>
          <span class="campo-error" aria-live="polite"></span>
        </label>
        <label class="campo" data-campo="terminaEn">
          <span class="campo-etiqueta">Termina</span>
          <input type="datetime-local" name="terminaEn" value="${v.terminaEn}" required>
          <span class="campo-error" aria-live="polite"></span>
        </label>
      </div>

      <label class="campo" data-campo="cancionUrl">
        <span class="campo-etiqueta">La canción de tu fiesta <small>opcional</small></span>
        <input type="url" name="cancionUrl" value="${v.cancionUrl}" inputmode="url" autocomplete="off"
          placeholder="Pega un enlace de Spotify, YouTube, SoundCloud…">
        <span class="campo-ayuda" data-cancion-ayuda>Suena cuando alguien toca tu burbuja en el mapa.</span>
        <span class="campo-error" aria-live="polite"></span>
      </label>

      <label class="campo" data-campo="descripcion">
        <span class="campo-etiqueta">Cuéntalo <small>opcional</small></span>
        <textarea name="descripcion" rows="4" maxlength="${DESC_MAX}"
          placeholder="Ambiente, precio, si hay que llevar algo, cómo encontraros…">${v.descripcion}</textarea>
        <span class="campo-ayuda contador" data-contador>${v.descripcion.length}/${DESC_MAX}</span>
        <span class="campo-error" aria-live="polite"></span>
      </label>

      <div class="formulario-pie">
        <button type="submit" class="btn btn-primario btn-grande">${modo === 'crear' ? 'Publicar en el mapa' : 'Guardar cambios'}</button>
        ${modo === 'crear'
          ? html`<p class="letra-pequena">Es pública: la verá cualquiera que mire el mapa por esta zona. No publiques direcciones de casas particulares sin permiso.</p>`
          : ''}
      </div>
    </form>`,
  )

  const form = $('form', cont)
  const leer = () => ({
    titulo: form.titulo.value,
    descripcion: form.descripcion.value,
    tipo: form.tipo.value,
    lat: v.lat,
    lng: v.lng,
    empiezaEn: form.empiezaEn.value,
    terminaEn: form.terminaEn.value,
    cancionUrl: form.cancionUrl.value.trim(),
    foto: v.foto,
  })

  /* --- foto --- */
  const pintarFoto = () => {
    const vista = $('[data-vista-burbuja]', form)
    if (!vista) return
    const tipo = form.tipo.value || 'particular'
    vista.className = `vista-burbuja t-${tipo}`
    const src = v.foto.nueva?.vistaPrevia ?? (!v.foto.quitada ? urlImagen(v.foto.actual?.mini) : '')
    if (src) {
      const img = document.createElement('img')
      img.src = src
      img.alt = ''
      vista.replaceChildren(img)
    } else {
      vista.textContent = form.tipo.value ? tipoDe(tipo).emoji : '🖼️'
    }
    const hayFoto = Boolean(src)
    $('[data-accion="quitar-foto"]', form).hidden = !hayFoto
    $('[data-texto-foto]', form).textContent = hayFoto ? '📷 Cambiar foto' : '📷 Elegir foto'
  }
  pintarFoto()

  $('[data-archivo]', form)?.addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = '' // para poder volver a elegir la misma
    if (!archivo) return
    const texto = $('[data-texto-foto]', form)
    texto.textContent = 'Preparando…'
    limpiarError(form, 'imagen')
    try {
      const preparada = await prepararImagen(archivo)
      if (v.foto.nueva) URL.revokeObjectURL(v.foto.nueva.vistaPrevia)
      v.foto.nueva = { ...preparada, idSubido: null }
      v.foto.quitada = false
      if (modo === 'crear') borrador = leer()
    } catch (err) {
      if (!(err instanceof ErrorImagen)) console.error(err)
      marcarErrores(form, [{ campo: 'imagen', problema: err instanceof ErrorImagen ? err.message : 'No se ha podido abrir la foto' }])
    }
    pintarFoto()
  })

  const pintarUbicacion = () => {
    const hueco = $('[data-ubicacion]', form)
    if (v.lat == null) {
      pintar(hueco, html`<span class="tenue">Aún no has marcado el sitio</span>`)
      return
    }
    const dist = estado.posicion ? distanciaM(estado.posicion[0], estado.posicion[1], v.lat, v.lng) : null
    pintar(
      hueco,
      html`<span class="ubicacion-ok">✓ Sitio marcado</span>
        <span class="tenue">${dist != null ? (dist < 30 ? 'donde estás ahora' : `a ${formatoDistancia(dist)} de ti`) : `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`}</span>`,
    )
  }
  pintarUbicacion()

  const ayudaCancion = () => {
    const url = form.cancionUrl.value.trim()
    const ayuda = $('[data-cancion-ayuda]', form)
    const info = url && cancionValida(url) ? analizarCancion(url) : null
    ayuda.textContent = info
      ? `${info.icono} ${info.servicio}${info.embed ? ' · se reproducirá en la ficha' : ' · se abrirá en su web'}`
      : 'Suena cuando alguien toca tu burbuja en el mapa.'
  }
  ayudaCancion()

  form.addEventListener('input', (e) => {
    if (!e.target.name) return
    limpiarError(form, e.target.name === 'tipo' ? 'tipo' : e.target.name)
    if (e.target.name === 'tipo') pintarFoto()
    if (e.target.name === 'descripcion') $('[data-contador]', form).textContent = `${form.descripcion.value.length}/${DESC_MAX}`
    if (e.target.name === 'cancionUrl') ayudaCancion()
    if (e.target.name === 'empiezaEn') ajustarFin(form)
    if (e.target.name === 'terminaEn') {
      const dur = new Date(form.terminaEn.value) - new Date(form.empiezaEn.value)
      if (dur > 0) duracionPrevia = dur
    }
    if (modo === 'crear') borrador = leer()
  })

  form.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion
    if (accion === 'quitar-foto') {
      if (v.foto.nueva) URL.revokeObjectURL(v.foto.nueva.vistaPrevia)
      v.foto.nueva = null
      v.foto.quitada = true
      limpiarError(form, 'imagen')
      pintarFoto()
      if (modo === 'crear') borrador = leer()
    }
    if (accion === 'usar-mi-ubicacion') {
      const p = estado.posicion ?? (await localizar({ volar: false }))
      if (!p) return
      v.lat = p[0]
      v.lng = p[1]
      limpiarError(form, 'ubicacion')
      pintarUbicacion()
      centrarEn(v.lat, v.lng, 17)
      if (modo === 'crear') borrador = leer()
    }
    if (accion === 'elegir-en-mapa') {
      const p = await elegirUbicacion({ inicial: v.lat != null ? [v.lat, v.lng] : null })
      if (!p) return
      v.lat = p[0]
      v.lng = p[1]
      limpiarError(form, 'ubicacion')
      pintarUbicacion()
      if (modo === 'crear') borrador = leer()
    }
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const datos = leer()
    const errores = validar(datos, modo)
    marcarErrores(form, errores)
    if (errores.length) return

    const boton = form.querySelector('[type="submit"]')
    try {
      // La foto se sube primero y sólo una vez: si luego la API rechaza otro
      // campo y se reintenta, se reutiliza el id en vez de subirla otra vez.
      const nueva = v.foto.nueva
      if (nueva && !nueva.idSubido) {
        const { id: idImagen } = await conBoton(boton, 'Subiendo foto…', () => api.subirImagen(nueva))
        nueva.idSubido = idImagen
      }

      if (modo === 'crear') {
        const { evento } = await conBoton(boton, 'Publicando…', () => api.crearEvento(aCuerpo(datos)))
        if (nueva) URL.revokeObjectURL(nueva.vistaPrevia)
        borrador = null
        estado.eventos.set(evento.id, evento)
        avisar('eventos')
        toast('¡Tu fiesta ya está en el mapa! 🎉')
        centrarEn(evento.lat, evento.lng, 16)
        navegar(`/evento/${evento.id}`, { reemplazar: true })
      } else {
        const cambios = diferencias(original, datos)
        if (!Object.keys(cambios).length) {
          toast('No has cambiado nada')
          return
        }
        const { evento } = await conBoton(boton, 'Guardando…', () => api.editarEvento(id, cambios))
        if (estado.eventos.has(id)) estado.eventos.set(id, evento)
        avisar('eventos')
        toast('Cambios guardados')
        volverOIr(`/evento/${id}`)
      }
    } catch (err) {
      // Si la API no reconoce la foto, la próxima vez se vuelve a subir.
      if (err.detalles?.some?.((d) => d.campo === 'imagen') && v.foto.nueva) v.foto.nueva.idSubido = null
      if (err instanceof ErrorApi && Array.isArray(err.detalles) && err.detalles.length) {
        marcarErrores(
          form,
          err.detalles.map((d) => ({ campo: d.campo === 'lng' || d.campo === 'lat' ? 'ubicacion' : d.campo, problema: d.problema })),
        )
      }
      if (err.estado !== 401) toast(mensajeDe(err), { tipo: 'error' })
    }
  })

  return () => {
    // Al salir de editar, la vista previa ya no sirve. La de crear se queda con el borrador.
    if (modo === 'editar' && v.foto.nueva) URL.revokeObjectURL(v.foto.nueva.vistaPrevia)
  }
}

/* ---------------- validación y envío ---------------- */

function validar(d, modo) {
  const e = []
  const titulo = d.titulo.trim()
  if (titulo.length < TITULO_MIN) e.push({ campo: 'titulo', problema: `Mínimo ${TITULO_MIN} caracteres` })
  if (!d.tipo) e.push({ campo: 'tipo', problema: 'Elige qué tipo de fiesta es' })
  if (d.lat == null) e.push({ campo: 'ubicacion', problema: 'Marca dónde es' })
  const a = new Date(d.empiezaEn)
  const b = new Date(d.terminaEn)
  if (!d.empiezaEn || Number.isNaN(+a)) e.push({ campo: 'empiezaEn', problema: 'Pon cuándo empieza' })
  if (!d.terminaEn || Number.isNaN(+b)) e.push({ campo: 'terminaEn', problema: 'Pon cuándo termina' })
  else if (b <= a) e.push({ campo: 'terminaEn', problema: 'Tiene que terminar después de empezar' })
  else if (b - a > DURACION_MAX_MS) e.push({ campo: 'terminaEn', problema: 'Una fiesta no puede durar más de 7 días' })
  if (modo === 'crear' && a < Date.now() - 24 * 3600 * 1000) e.push({ campo: 'empiezaEn', problema: 'No se pueden crear fiestas que ya han pasado' })
  if (d.cancionUrl && !cancionValida(d.cancionUrl))
    e.push({ campo: 'cancionUrl', problema: 'Sólo enlaces de Spotify, YouTube, Apple Music, SoundCloud o Bandcamp' })
  return e
}

function aCuerpo(d) {
  return {
    titulo: d.titulo.trim(),
    descripcion: d.descripcion.trim() || undefined,
    tipo: d.tipo,
    lng: d.lng,
    lat: d.lat,
    // datetime-local está en hora local; toISOString lo pasa a UTC para la API.
    empiezaEn: new Date(d.empiezaEn).toISOString(),
    terminaEn: new Date(d.terminaEn).toISOString(),
    cancionUrl: d.cancionUrl || undefined,
    imagen: d.foto?.nueva?.idSubido || undefined,
  }
}

/** PATCH sólo con lo que ha cambiado. Quitar la canción es mandar null. */
function diferencias(o, d) {
  const c = {}
  if (d.titulo.trim() !== o.titulo) c.titulo = d.titulo.trim()
  if (d.descripcion.trim() !== o.descripcion) c.descripcion = d.descripcion.trim()
  if (d.tipo !== o.tipo) c.tipo = d.tipo
  if (d.lat !== o.lat || d.lng !== o.lng) {
    c.lat = d.lat
    c.lng = d.lng
  }
  if (d.empiezaEn !== o.empiezaEn) c.empiezaEn = new Date(d.empiezaEn).toISOString()
  if (d.terminaEn !== o.terminaEn) c.terminaEn = new Date(d.terminaEn).toISOString()
  if (d.cancionUrl !== o.cancionUrl) c.cancionUrl = d.cancionUrl || null
  if (d.foto.nueva?.idSubido) c.imagen = d.foto.nueva.idSubido
  else if (d.foto.quitada && o.teniaFoto) c.imagen = null
  return c
}

/** Si mueves el inicio, el final se mueve con él y mantiene la duración. */
let duracionPrevia = null
function ajustarFin(form) {
  const a = new Date(form.empiezaEn.value)
  const b = new Date(form.terminaEn.value)
  if (Number.isNaN(+a)) return
  // Mantener la duración siempre, no sólo cuando el final queda antes del inicio.
  if (duracionPrevia || Number.isNaN(+b) || b <= a) form.terminaEn.value = aInputFecha(new Date(+a + (duracionPrevia ?? 4 * 3600 * 1000)))
}

function marcarErrores(form, errores) {
  $$('.campo.con-error', form).forEach((c) => c.classList.remove('con-error'))
  $$('.campo-error', form).forEach((s) => (s.textContent = ''))
  for (const { campo, problema } of errores) {
    const caja = form.querySelector(`[data-campo="${campo}"]`)
    if (!caja) continue
    caja.classList.add('con-error')
    const hueco = caja.querySelector('.campo-error')
    if (hueco && !hueco.textContent) hueco.textContent = problema
  }
  const primero = form.querySelector('.con-error')
  if (primero) {
    primero.scrollIntoView({ block: 'center', behavior: 'smooth' })
    primero.querySelector('input, textarea')?.focus({ preventScroll: true })
  }
}

function limpiarError(form, campo) {
  const caja = form.querySelector(`[data-campo="${campo}"]`)
  if (!caja) return
  caja.classList.remove('con-error')
  const hueco = caja.querySelector('.campo-error')
  if (hueco) hueco.textContent = ''
}
