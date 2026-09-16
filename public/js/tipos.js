/**
 * Los tipos de evento. Las claves TIENEN que coincidir con TIPOS_EVENTO de
 * src/esquemas.ts en la API: si allí se añade uno, se añade aquí.
 */
export const TIPOS = {
  ayuntamiento:  { nombre: 'Ayuntamiento',  emoji: '🏛️', color: '#2DD4BF' },
  bar:           { nombre: 'Bar',           emoji: '🍸', color: '#FFA53D' },
  discoteca:     { nombre: 'Discoteca',     emoji: '🎧', color: '#FF3D8A' },
  pub:           { nombre: 'Pub',           emoji: '🍺', color: '#38BDF8' },
  casual:        { nombre: 'Casual',        emoji: '✌️', color: '#A3E635' },
  manifestacion: { nombre: 'Manifestación', emoji: '📢', color: '#FF5A5A' },
  particular:    { nombre: 'Particular',    emoji: '🎉', color: '#A78BFA' },
}

export const tipoDe = (clave) => TIPOS[clave] ?? { nombre: clave, emoji: '📍', color: '#8B8FB3' }

/** Coinciden con CrearDenuncia en la API. */
export const MOTIVOS_DENUNCIA = {
  spam: 'Spam o publicidad engañosa',
  no_existe: 'Esta fiesta no existe',
  contenido_ofensivo: 'Contenido ofensivo',
  peligroso: 'Puede ser peligroso',
  otro: 'Otro motivo',
}
