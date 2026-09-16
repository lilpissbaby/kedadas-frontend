import { api, mensajeDe } from '../api.js'
import { estado } from '../estado.js'
import { html, pintar, $ } from '../util.js'
import { toast, conBoton, avatar } from '../ui.js'
import { navegar } from '../router.js'
import { entrarConGoogle, entrarComoDev, destinoRecordado, olvidarDestino } from '../sesion.js'

/**
 * Entrar. No hay registro: entrar ES registrarse (la API crea la ficha en el
 * primer login). Con MODO_DEV en la API aparece además un acceso sin Google
 * para desarrollar; en producción esa parte no se pinta y la ruta da 404.
 */
export async function vistaEntrar({ consulta }, cont) {
  if (estado.usuario) {
    navegar(destinoRecordado(), { reemplazar: true })
    olvidarDestino()
    return
  }

  const salud = estado.salud
  const motivo = consulta.get('motivo')
  const hayGoogle = salud?.loginGoogle
  const hayDev = salud?.modoDev

  pintar(
    cont,
    html`
    <div class="entrar">
      <div class="entrar-marca" aria-hidden="true">K</div>
      <h2 id="panel-titulo" tabindex="-1">${motivo || 'Entra en Kedada'}</h2>
      <p class="tenue">Con tu cuenta puedes apuntarte a fiestas, crear las tuyas y avisar si algo no está bien.
        No hace falta registrarse: la primera vez que entras se crea tu perfil.</p>

      <button class="btn btn-google" data-accion="google" ${hayGoogle ? '' : 'disabled'}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continuar con Google
      </button>
      ${!hayGoogle ? html`<p class="aviso-pequeno">El login con Google aún no está configurado en este servidor.</p>` : ''}

      ${hayDev
        ? html`
        <section class="dev-login" aria-labelledby="dev-t">
          <h3 id="dev-t"><span class="chapa-dev">MODO_DEV</span> Entrar sin Google</h3>
          <p class="aviso-pequeno">Sólo existe mientras la API tenga MODO_DEV. Crea el usuario si no existe.</p>
          <form class="fila-form" data-form="dev" novalidate>
            <input type="text" name="nombre" placeholder="ana" minlength="2" maxlength="40" required
              autocomplete="off" autocapitalize="off" aria-label="Nombre de prueba">
            <button class="btn btn-secundario" type="submit">Entrar</button>
          </form>
          <div class="dev-usuarios" data-dev-usuarios></div>
        </section>`
        : ''}

      <p class="letra-pequena">Al entrar aceptas que guardemos tu nombre, tu correo y tu foto de Google para mostrar
        quién organiza cada fiesta. Tu correo nunca aparece en tu perfil público y puedes borrar tu cuenta
        con todo lo tuyo cuando quieras desde tu perfil.</p>
    </div>`,
  )

  $('[data-accion="google"]', cont)?.addEventListener('click', entrarConGoogle)

  if (hayDev) {
    const form = $('[data-form="dev"]', cont)
    const entrar = async (nombre) => {
      try {
        await conBoton(form.querySelector('button'), 'Entrando…', () => entrarComoDev(nombre))
        toast(`Hola, ${estado.usuario.nombre} 👋`)
        const destino = destinoRecordado()
        olvidarDestino()
        navegar(destino, { reemplazar: true })
      } catch (err) {
        console.error(err)
        const detalle = err.detalles?.[0]?.problema
        toast(detalle ?? mensajeDe(err), { tipo: 'error' })
      }
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const nombre = form.nombre.value.trim()
      if (nombre.length < 2) return toast('Pon al menos 2 caracteres')
      entrar(nombre)
    })

    // Atajos a los usuarios de prueba que ya existen.
    api
      .usuariosDev()
      .then(({ usuarios }) => {
        const hueco = $('[data-dev-usuarios]', cont)
        if (!hueco || !usuarios.length) return
        pintar(
          hueco,
          html`${usuarios.slice(0, 8).map((u) => html`<button class="chip-usuario" data-nombre="${u.nombre}">${avatar(u, 'mini')}${u.nombre}</button>`)}`,
        )
        hueco.addEventListener('click', (e) => {
          const b = e.target.closest('[data-nombre]')
          if (b) entrar(b.dataset.nombre)
        })
      })
      .catch(() => {})
  }

  $('#panel-titulo', cont)?.focus({ preventScroll: true })
}
