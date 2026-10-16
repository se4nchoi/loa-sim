# Pinned builds and character order

- Save a simulation, then choose **Pin** in its saved-simulation menu (or **Pin build to character list**).
- The shortcut appears beneath its character. Character names, Open, and Load/refresh retain their existing behavior.
- A build URL includes `c` and `build`. Opening it uses the saved simulation's complete baseline, without changing
  the character's selected snapshot. Build working copies have separate autosave keys, including the simulation ID.
- Refreshing a character does not modify its saved builds. Unpin removes only the shortcut; deleting the saved
  simulation removes the shortcut too. To preserve edited build settings as a named plan, save a simulation.
- Build CP in the character list describes the saved plan, not its unsaved working copy. Log distribution from a
  newer character load is not attached to an older build baseline.
- Drag a character's handle, use Up/Down while it is focused, or choose Move up/down from its adjacent menu.
  Pinned builds move with their parent. Roster and searched Characters retain separate orders.
- Orders are browser-local under `loa-sim:character-order:v1:{roster|characters}`. New characters append after
  ordered entries; refresh preserves the custom order. Reset order returns to the source list's ordering.

Regression coverage checks persistence, source refresh/new entries, section independence, saved-plan pinning,
and isolation of regular/build autosaves. Browser checks cover pin/open, independent honing edits, drag,
keyboard reorder, reload persistence, and a 390px layout.
