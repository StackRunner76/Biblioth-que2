/** Blocs du tableau de bord, dans leur ordre par défaut. */
export const DASH_WIDGETS = ['livres', 'categories', 'auteurs', 'editeurs', 'par-categorie', 'par-auteur', 'recents'];

/**
 * Normalise une disposition enregistrée : ignore les blocs inconnus et les doublons,
 * puis ajoute à la fin les blocs manquants (ex. nouveau bloc après une mise à jour).
 */
export function normalizeLayout(layout) {
  const out = [];
  (Array.isArray(layout) ? layout : []).forEach((id) => {
    if (DASH_WIDGETS.includes(id) && !out.includes(id)) out.push(id);
  });
  DASH_WIDGETS.forEach((id) => { if (!out.includes(id)) out.push(id); });
  return out;
}

export const isDefaultLayout = (layout) => normalizeLayout(layout).every((id, i) => id === DASH_WIDGETS[i]);
