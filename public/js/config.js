/**
 * Configuración del frontend. Es el ÚNICO fichero que cambia entre entornos.
 *
 * API_BASE vacío = la API está en el mismo dominio, bajo /api. Es lo que hay
 * que usar siempre que se pueda (nginx hace de proxy, ver nginx.conf): la
 * sesión viaja en una cookie SameSite=Lax y, si frontend y API están en
 * dominios distintos, el navegador no la manda y nadie puede iniciar sesión.
 */
export const CONFIG = {
  API_BASE: '',

  // Dónde se abre el mapa la primera vez, si la persona no ha dado su ubicación
  // y no hay una vista guardada de otra visita. [lat, lng]
  CENTRO_INICIAL: [41.1561, 1.1069], // Reus, Plaça Prim
  ZOOM_INICIAL: 14,

  // Proveedor de mapa base: 'carto' | 'maptiler' | 'stadia' | 'osm'
  TILE_PROVIDER: 'carto',

  // Desde finales de agosto de 2026 CARTO exige clave en sus basemaps raster.
  // Es pública por definición (va en un fichero estático): CARTO la ata al
  // dominio que declaraste al pedirla. Si cambias de dominio, pide otra.
  TILE_API_KEY: 'cb1_30iu_1_b834ca4f945bda44cc47f031',

  // Por encima de este radio la API responde 400 (tope duro de 50 km).
  RADIO_MAX_M: 50_000,
  // La API devuelve como mucho 100 por consulta.
  LIMITE_MAPA: 100,
}

export const TILE_PROVIDERS = {
  carto: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key={key}',
    options: { subdomains: 'abcd', maxZoom: 20 },
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    needsKey: true,
  },
  maptiler: {
    url: 'https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}{r}.png?key={key}',
    options: { maxZoom: 20 },
    attribution: '&copy; MapTiler &copy; OpenStreetMap',
    needsKey: true,
  },
  stadia: {
    url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key={key}',
    options: { maxZoom: 20 },
    attribution: '&copy; Stadia Maps &copy; OpenStreetMap',
    needsKey: true,
  },
  // Respaldo sin clave. Tiles claras: se invierten con CSS (.tiles-osm).
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { subdomains: 'abc', maxZoom: 19, className: 'tiles-osm' },
    attribution: '&copy; OpenStreetMap',
    needsKey: false,
  },
}
