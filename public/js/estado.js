/**
 * Estado compartido de la app. Deliberadamente mínimo: un objeto y un
 * mecanismo de aviso. Sin framework, cada vista se suscribe a lo que le importa.
 */

const oyentes = new Map() // clave -> Set<fn>

export const estado = {
  /** @type {null | {id:string, nombre?:string, foto?:string, email?:string}} */
  usuario: null,
  /** Lo que devuelve /api/salud: modoDev, loginGoogle… */
  salud: null,
  /** Eventos cargados del mapa, por id. */
  eventos: new Map(),
  /** Filtros de la barra. tipo va a la API; cuando se aplica en el cliente. */
  filtros: { tipo: '', cuando: 'todo' },
  /** [lat, lng] de la persona si ha dado permiso. Sólo en memoria, nunca se guarda. */
  posicion: null,
  /** Ids a los que estoy apuntado, para pintar el check en burbujas y lista. */
  apuntado: new Set(),
}

export function cambiar(clave, valor) {
  estado[clave] = valor
  avisar(clave)
}

export function avisar(clave) {
  for (const fn of oyentes.get(clave) ?? []) fn(estado[clave])
}

export function escuchar(clave, fn) {
  if (!oyentes.has(clave)) oyentes.set(clave, new Set())
  oyentes.get(clave).add(fn)
  return () => oyentes.get(clave).delete(fn)
}
