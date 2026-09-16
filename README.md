# Kedada · frontend

El mapa de fiestas. HTML, CSS y JavaScript sin frameworks ni paso de build:
lo que hay en `public/` es exactamente lo que se sirve.

Habla con la API de `api-fiestas` y la usa entera: mapa por cercanía, ficha,
crear, editar y borrar, apuntarse, denunciar, perfiles, login y borrar cuenta.

## Arrancar en local

Necesitas la API corriendo (`npm run dev` en `api-fiestas`, con `MODO_DEV="1"`).

```bash
node scripts/dev.mjs
```

Abre http://localhost:3000. No hay `npm install`: el servidor de desarrollo
sólo usa Node.

`scripts/dev.mjs` hace lo mismo que nginx en producción: sirve `public/`,
reenvía `/api/*` a `http://localhost:8787` y manda las mismas cabeceras de
seguridad, incluido el CSP. Si algo rompe el CSP lo verás en la consola del
navegador aquí, no en producción.

```powershell
# otra dirección para la API o cambiar el puerto, en PowerShell:
$env:API = 'http://localhost:8787'; $env:PUERTO = '3000'; node scripts/dev.mjs
```

Con `MODO_DEV` puedes entrar sin Google desde la pantalla de login (sale un
recuadro naranja con los usuarios de prueba que haya). Sin `MODO_DEV` ese
recuadro no aparece.

## Por qué la API va detrás del mismo dominio

La sesión viaja en una cookie `httpOnly` con `SameSite=Lax`. Si el frontend
estuviera en `kedada.tenebrum.online` y la API en `*.workers.dev`, el navegador
no mandaría la cookie en los `fetch` y **nadie podría iniciar sesión**. Por eso
nginx reenvía `/api/` al Worker: para el navegador todo es un único sitio, sin
CORS y con la cookie funcionando.

## Desplegar en el VPS

```bash
cp .env.example .env        # API_UPSTREAM=api-fiestas.TU-SUBDOMINIO.workers.dev
docker compose up -d
```

Sigue el patrón del homelab: sin puertos publicados y unido a `proxy_network`.
Añade el `.conf` del subdominio en el reverse proxy como con cualquier otra app.

**En la API**, además de lo que ya pedía su README:

| Variable | Valor |
|---|---|
| `ORIGEN_WEB` | `https://kedada.tenebrum.online` (a donde vuelve tras entrar con Google) |
| `GOOGLE_REDIRECT_URI` | `https://kedada.tenebrum.online/api/sesion/google/callback` |

La segunda es obligatoria con este montaje: las cookies del login (`state` y
PKCE) se ponen en el dominio del frontend, así que Google tiene que volver a
ese mismo dominio. Registra esa misma URL en Google Cloud Console.

En local no hace falta nada de esto salvo que quieras probar Google: entonces
pon `ORIGEN_WEB=http://localhost:3000` en el `.dev.vars` de la API.

## Estructura

```
public/
  index.html            esqueleto: mapa, barra, hoja de la lista, panel
  css/app.css           todo el estilo (tokens arriba)
  js/
    config.js           LO ÚNICO que cambia entre entornos: centro inicial, mapa base
    api.js              una función por ruta de la API; nadie más hace fetch
    estado.js           estado compartido mínimo con avisos
    router.js           rutas por hash (#/evento/:id, #/yo…) y el botón atrás
    mapa.js             Leaflet, burbujas, carga por zona, geolocalización
    lista.js            filtros y lista ordenada (ahora → pronto → luego, por distancia)
    musica.js           enlace de Spotify/YouTube/SoundCloud/Apple → reproductor
    sesion.js           quién soy, entrar, salir, borrar cuenta
    ui.js               panel, toasts, confirmaciones
    util.js             plantillas con escape, fechas, distancias
    tipos.js            los tipos de evento (deben coincidir con la API)
    vistas/             una pantalla por fichero
  vendor/leaflet/       Leaflet 1.9.4 servido desde aquí, sin CDN
  fonts/                Space Grotesk (OFL), sólo para títulos
nginx/
  kedada.conf.template  servidor + proxy /api (la imagen de nginx rellena ${API_UPSTREAM})
  cabeceras.conf        cabeceras de seguridad y CSP, compartidas con dev.mjs
scripts/dev.mjs         servidor de desarrollo sin dependencias
docker-compose.yml
```

## Decisiones que vas a encontrar en el código

**Nada de CDN.** Leaflet y la fuente van en `public/`. El CSP es `'self'` para
scripts, estilos y fuentes. Sin peticiones a unpkg ni a Google Fonts (que,
además, es un problema de RGPD en Europa).

**Sin `style=""` en el HTML generado.** El CSP no lleva `'unsafe-inline'`.
Los colores de cada tipo van por clase (`.t-bar`, `.t-pub`…), definidas al
principio de `app.css`. Si añades un tipo en la API, añádelo en `js/tipos.js`
**y** su clase en el CSS.

**Todo lo que escribe la gente pasa por `html\`\``** (en `util.js`), que
escapa por defecto. No uses `innerHTML` con cadenas montadas a mano.

**La canción no se carga hasta que alguien toca.** Los reproductores de
Spotify, YouTube, etc. son iframes de terceros que ponen cookies. Se crean al
pulsar la burbuja (y entonces suenan solos: ese toque es el gesto que exige el
navegador) o el botón de escuchar. YouTube va por `youtube-nocookie.com`. Si la
API admite un servicio nuevo, hay que tocar `musica.js` y `frame-src` en
`nginx/cabeceras.conf`.

**La ubicación nunca se guarda.** Se pide sólo al pulsar el botón, o sin
preguntar si el permiso ya estaba concedido de otra visita. Vive en memoria y
sólo sale como centro de la consulta. Lo único que se guarda en el navegador es
la última vista del mapa (centro y zoom), para abrir donde lo dejaste.

**Mapa por zona, no por radio fijo.** Cada vez que el mapa se para se pide el
círculo que cubre la pantalla (tope de 50 km de la API) y se cancela la
petición anterior si no había vuelto. El filtro de tipo va a la API (con 100
resultados como máximo, filtrar en el cliente dejaría fuera fiestas); el de
"cuándo" se aplica en el cliente sobre lo cargado.

**Las notas de las burbujas no se pisan.** Se colocan por prioridad (la
seleccionada, lo que pasa ahora, lo que empieza pronto, a lo que vas) y la que
chocaría con otra se esconde hasta que acercas el mapa.

**Cada pantalla tiene URL.** `#/evento/:id` se puede compartir, y el botón
atrás del móvil cierra el panel en vez de salir de la web.

## Lo que falta (y por qué no está)

- **Fotos o carteles de las fiestas**: la API no tiene dónde guardarlas. Irá con
  R2 cuando toque, no en Mongo.
- **Dirección escrita**: la API guarda coordenadas, no calle. "Cómo llegar"
  abre Google Maps con las coordenadas.
- **Ver todas las fiestas de otra persona**: no hay ruta en la API; el perfil
  público enseña las suyas que ya estén cargadas en la zona del mapa.
- **Pantalla de moderación**: la denuncia funciona y oculta a las 5, pero no hay
  panel para revisarlas.
- **App instalable offline**: hay manifest (se puede añadir a la pantalla de
  inicio), pero no service worker. A propósito: una caché mal hecha deja a la
  gente con versiones viejas y es lo último que queremos en un MVP.
