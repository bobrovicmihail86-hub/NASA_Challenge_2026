/* Space Mission Design — English content helpers.
 *
 * The English edition keeps the display strings inside the data files
 * themselves (data/config.js, data/cards.js, data/missions.js), so the old
 * translation pack is gone. This thin shim only preserves the small API that
 * the multiplayer client (app/play.js) and the server still call:
 * EN.name(id) — display name of a card / destination / profile / mission;
 * EN.text(id) — the matching description (card text, tip or mission history).
 */
(function (root) {
  const cfg = root.CONFIG || {};
  const tips = [cfg.points, cfg.trajectories, cfg.dataTypes, cfg.facilities];

  const cards = root.CARDS || {};
  const byId = {};
  Object.keys(cards).forEach(function (group) {
    const list = cards[group];
    if (!Array.isArray(list)) return;
    list.forEach(function (card) { if (card && card.id) byId[card.id] = card; });
  });

  const missions = {};
  (root.MISSIONS || []).forEach(function (mission) { missions[mission.id] = mission; });

  function tipOf(id, field) {
    for (let i = 0; i < tips.length; i += 1) {
      const entry = tips[i] && tips[i][id];
      if (entry && entry[field]) return entry[field];
    }
    return '';
  }

  const EN = {
    /** Display name by id, falling back to the raw id. */
    name: function (id) {
      const card = byId[id];
      if (card && card.name) return card.name;
      const tip = tipOf(id, 'name');
      if (tip) return tip;
      const mission = missions[id];
      if (mission && mission.name) return mission.name;
      return String(id || '');
    },

    /** Card text, destination/profile tip or mission history by id. */
    text: function (id) {
      const card = byId[id];
      if (card) return card.text || '';
      const tip = tipOf(id, 'tip');
      if (tip) return tip;
      const mission = missions[id];
      return mission ? (mission.history || '') : '';
    }
  };

  root.EN = EN;
})(typeof globalThis !== 'undefined' ? globalThis : this);
