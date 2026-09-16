import { api, mensajeDe } from '../api.js'
import { estado, avisar } from '../estado.js'
import { MOTIVOS_DENUNCIA } from '../tipos.js'
import { html, pintar, $ } from '../util.js'
import { toast, conBoton } from '../ui.js'
import { navegar, cerrarPanel, volverOIr } from '../router.js'
import { pedirSesion } from '../sesion.js'

/** POST /api/eventos/:id/denuncia. A las 5 denuncias la API la oculta sola. */
export async function vistaDenuncia({ id }, cont) {
  if (!estado.usuario) return pedirSesion(`/evento/${id}/denunciar`, 'Entra para denunciar una fiesta')
  const ev = estado.eventos.get(id)

  pintar(
    cont,
    html`
    <form class="formulario" novalidate>
      <h2 id="panel-titulo" tabindex="-1">Denunciar${ev ? html` «${ev.titulo}»` : ''}</h2>
      <p class="tenue">Lo revisamos a mano. Si varias personas la denuncian, se oculta del mapa mientras tanto.
        El organizador no sabe quién ha sido.</p>

      <fieldset class="campo">
        <legend class="campo-etiqueta">¿Qué pasa?</legend>
        <div class="lista-motivos">
          ${Object.entries(MOTIVOS_DENUNCIA).map(
            ([clave, texto]) => html`<label class="motivo"><input type="radio" name="motivo" value="${clave}" required> ${texto}</label>`,
          )}
        </div>
      </fieldset>

      <label class="campo">
        <span class="campo-etiqueta">Cuéntanos algo más <small>opcional</small></span>
        <textarea name="comentario" rows="3" maxlength="500" placeholder="Cualquier detalle nos ayuda a revisarlo"></textarea>
      </label>

      <div class="fila-botones">
        <button type="button" class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
        <button type="submit" class="btn btn-peligro">Enviar denuncia</button>
      </div>
    </form>`,
  )

  const form = $('form', cont)
  $('[data-accion="cancelar"]', form).addEventListener('click', cerrarPanel)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const motivo = form.motivo.value
    if (!motivo) return toast('Elige un motivo')
    try {
      const r = await conBoton(form.querySelector('[type="submit"]'), 'Enviando…', () =>
        api.denunciar(id, motivo, form.comentario.value.trim()),
      )
      if (r.ocultadoAutomaticamente) {
        estado.eventos.delete(id)
        avisar('eventos')
        toast('Gracias. La fiesta se ha ocultado mientras la revisamos.', { ms: 5000 })
        navegar('/', { reemplazar: true })
      } else {
        toast('Gracias por avisar. Lo revisaremos.')
        volverOIr(`/evento/${id}`)
      }
    } catch (err) {
      if (err.codigo === 'conflicto') {
        toast('Ya habías denunciado esta fiesta.')
        volverOIr(`/evento/${id}`)
      } else if (err.estado !== 401) toast(mensajeDe(err), { tipo: 'error' })
    }
  })
  $('#panel-titulo', cont)?.focus({ preventScroll: true })
}
