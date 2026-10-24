# loa-sim: agent rules

## UI text: no filler (firm rule)

Every word on screen must earn its place. Filler text in the views is treated as a bug.

- Each visible string carries something the user needs to decide or act. If deleting it loses nothing, delete it.
- No sentences that restate a heading, describe what a control obviously does, reassure, hedge, or "explain" in
  passing ("This shows…", "Note that…", "Tip:", "Just pick…", "Here you can…").
- No subtitles under toggles, tabs or card titles.
- Labels, numbers and short facts over sentences. Status lines stay one line.
- A real explanation goes in one place the user opens on purpose (a dismissible card, a `title` tooltip, a fold), not
  inline in the flow.
- One name per thing, used everywhere (e.g. "runs", not "runs" here and "attempts" there).
- Before committing, read the diff for new user-visible text and cut what isn't needed.
