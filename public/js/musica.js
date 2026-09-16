/**
 * La canción del evento. La API sólo admite enlaces de Spotify, YouTube,
 * Apple Music, SoundCloud y Bandcamp (no se suben audios: derechos, coste y
 * moderación). Aquí se convierte cada enlace en su reproductor oficial.
 *
 * Los reproductores son iframes de terceros y ponen sus propias cookies, así
 * que NUNCA se cargan solos: sólo cuando la persona pulsa la burbuja o el
 * botón de escuchar. Mientras tanto se pinta un botón nuestro, sin peticiones.
 *
 * Si se añade un servicio en la API (esquemas.ts → urlCancion), hay que
 * añadirlo aquí, en HOSTS_PERMITIDOS y en frame-src del CSP de nginx.conf.
 */

export const HOSTS_PERMITIDOS = [
  'open.spotify.com',
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
  'music.apple.com',
  'soundcloud.com',
  'bandcamp.com',
]

/** Misma regla que la API, para avisar antes de enviar el formulario. */
export function cancionValida(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.replace(/^www\./, '')
    return HOSTS_PERMITIDOS.some((p) => host === p || host.endsWith('.' + p))
  } catch {
    return false
  }
}

/**
 * @returns {{ servicio: string, icono: string, embed: string|null, alto: number, abrir: string } | null}
 */
export function analizarCancion(url) {
  if (!url || !cancionValida(url)) return null
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')

  // --- Spotify: /track/ID, /intl-es/track/ID, /album/ID, /playlist/ID ---
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|artist)\/([A-Za-z0-9]+)/)
    return {
      servicio: 'Spotify',
      icono: '🟢',
      embed: m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=kedada&theme=0` : null,
      alto: m && m[1] === 'track' ? 80 : 152,
      abrir: u.href,
    }
  }

  // --- YouTube y YouTube Music ---
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    let id = null
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
    else if (u.searchParams.get('v')) id = u.searchParams.get('v')
    else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1] ?? null
    const valido = id && /^[\w-]{6,20}$/.test(id)
    return {
      servicio: host.startsWith('music.') ? 'YouTube Music' : 'YouTube',
      icono: '🔴',
      // nocookie: no pone cookies de seguimiento hasta que se reproduce.
      embed: valido ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&modestbranding=1` : null,
      alto: 200,
      abrir: u.href,
    }
  }

  // --- SoundCloud ---
  if (host.endsWith('soundcloud.com')) {
    const embed = new URL('https://w.soundcloud.com/player/')
    embed.searchParams.set('url', u.href)
    embed.searchParams.set('auto_play', 'true')
    embed.searchParams.set('visual', 'false')
    embed.searchParams.set('hide_related', 'true')
    embed.searchParams.set('show_comments', 'false')
    embed.searchParams.set('color', '#ff3d8a')
    return { servicio: 'SoundCloud', icono: '🟠', embed: embed.href, alto: 120, abrir: u.href }
  }

  // --- Apple Music: basta con cambiar el host ---
  if (host === 'music.apple.com') {
    const esCancion = u.searchParams.has('i') || u.pathname.includes('/song/')
    return {
      servicio: 'Apple Music',
      icono: '🍎',
      embed: `https://embed.music.apple.com${u.pathname}${u.search}`,
      alto: esCancion ? 175 : 260,
      abrir: u.href,
    }
  }

  // --- Bandcamp: su reproductor necesita un id numérico que no va en la URL ---
  if (host.endsWith('bandcamp.com')) {
    return { servicio: 'Bandcamp', icono: '🔵', embed: null, alto: 0, abrir: u.href }
  }

  return null
}

/** Crea el iframe del reproductor. Se llama sólo tras un toque de la persona. */
export function crearReproductor(info, titulo) {
  const iframe = document.createElement('iframe')
  iframe.src = info.embed
  iframe.title = `Canción de ${titulo} en ${info.servicio}`
  iframe.height = String(info.alto)
  iframe.loading = 'eager'
  iframe.allow = 'autoplay; encrypted-media; clipboard-write; picture-in-picture'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.className = 'reproductor-iframe'
  // Sin allow-same-origin el reproductor no funciona; sin allow-scripts, tampoco.
  // Lo que sí se quita: que pueda navegar la página principal.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation')
  return iframe
}
