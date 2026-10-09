# Changelog

## 0.7.3

Thanks to [u/gamarala_in_distress](https://www.reddit.com/user/gamarala_in_distress/) for asking ["does it drain resources on idle ?"](https://www.reddit.com/r/ObsidianMD/comments/1wuvon6/comment/pescsxd/). That question prompted a closer look at animation work and this performance update.

- Replace continuous frame polling with a clock that sleeps between animation deadlines. Cancel pending companion animation when Obsidian is hidden or unfocused.
- Update walking at 30 Hz and stationary behaviors at the sprite cadence, about 12.5 Hz. Keep direct pointer dragging and 60 Hz falling with the same gravity and landing pause.
- Stop continuous companion animation when reduced motion leaves it at rest; pointer interaction wakes it as needed.
- Write position, size, labels and state attributes only when their values change. Preserve crisp pixel alignment and the zero-size overlay that protects Windows title-bar dragging.
- Share one settings animation clock per document. Paint only visible previews, allocate their surfaces on first visible paint, and release clocks, observers and listeners when settings close.
- Add scheduling and preview tests covering 30, 60, 120 and 144 Hz displays, pause/resume, reduced motion and cleanup.

### What idle means

A visible companion still performs animation work while you are not typing: it walks, blinks and reacts to the pointer. This release reduces unnecessary work; it does not promise zero CPU while the character is animated. Its animation clock stops when the Obsidian window is hidden or unfocused. With reduced motion enabled, a resting companion has no continuous animation loop.

### Verification

All 26 tests, lint, TypeScript checks and the production build pass. In the same controlled 10-second walking test, update calls fell from 600 to 300 and DOM attribute writes from 1,980 to 300, while travel remained 240 CSS pixels. That comparison uses native DOM/canvas in an isolated document with a virtual 60 Hz clock: these are operation counts, not CPU or battery percentages. The actual Obsidian settings window animates only the visible previews through one shared clock and releases all preview groups on close. Dragging, the four head directions, command selection and fall timing were also checked.

## 0.7.2

- Keep command bubbles and their tails opaque on hover and keyboard focus when a theme supplies translucent hover colors, so note text underneath cannot show through.

## 0.7.1

- Fix the Windows title bar becoming unresponsive to window dragging after maximizing Obsidian and restoring it down.
- Give the NPC overlay a zero-size anchor instead of a full-window rectangle, so Obsidian's native non-draggable overlay rule cannot cover the title-bar drag regions.
- Preserve the visible character, command bubbles, pointer interaction and pick-up/fall behavior in all three sizes.

## 0.7.0

- Import a custom NPC from a PNG sprite sheet inside the vault, with a name, animated preview and explicit activation.
- Define the version 1 format: 8 × 8 cells, 16 × 24 logical pixels, 60 required frames covering all thirteen behaviors and four reserved cells.
- Accept native 128 × 192 sheets and uniform integer enlargements, including 1024 × 1536; validate PNG headers, dimensions, size, frame contents and transparent corners before activation.
- Preserve real alpha or remove an edge-connected solid background automatically or with explicit magenta keying. Reject painted checkerboards and preserve enclosed matching character details.
- Keep mouse tracking, four head directions, command bubbles, crisp display scaling, dragging, gentle falling and reduced motion for custom characters.
- Reload chosen sheets when edited, follow vault renames and fall back to Pip for missing or invalid files while retaining the saved selection. Forgetting a sheet leaves the PNG intact.
- Ship downloadable Pip, Arden and Nova sheets, blank templates, labeled guides, the original Rue reference and a detailed image-generation prompt with transparency guidance.
- Add reproducible sheet exports, importer regression tests and a screenshot of the custom companion settings.

## 0.6.0

- Drag the companion to pick it up and move it; all three characters raise and fidget their hands while lifted.
- Release to fall with gravity and a limited speed, land without bouncing, and sit for two seconds before resuming normal behavior.
- Keep clicks and hover commands separate from dragging; handle pointer capture, cancellation, Escape, window changes and background pause.
- Respect reduced motion with a still lifted pose and an immediate return to the floor.
- Add the three new interaction behaviors to the read-only settings gallery.
- Make the command picker accept names, IDs and colon/hyphen/underscore variants, with sidebar search aliases and exact ID matches first.
- Include registered commands that Obsidian's listed catalog may omit, without duplicates.
- Add regression tests for acceleration, floor contact, refresh-rate independence and sidebar command searches.

## 0.5.1

- Use **Medium** as the default character size for new installations. Existing saved sizes stay unchanged.

## 0.5.0

- Make settings searchable through Obsidian's declarative settings API. Requires Obsidian 1.13.0 or later.
- Keep the three animated character cards and read-only behavior gallery, with cleanup when settings close or refresh.
- Use native settings headings, inline slider values and Obsidian's DOM helpers.
- Use each element's own window for animation timing and DOM creation.
- Shorten the plugin's command names to **Open favorites** and **Configure favorites**; command IDs and saved choices stay compatible.
- Replace CSS `!important` overrides with scoped selectors.
- Add the official Obsidian ESLint rules and a CSS check to local checks and CI.
- Build releases from tagged source in GitHub Actions and attest all three installable assets.
- Publish only `main.js`, `manifest.json` and `styles.css`; update manual installation instructions.

## 0.4.0

First public release under the **Just Simple NPC** name.

- Rename the plugin and repository to Just Simple NPC / `just-simple-npc`.
- Update installation instructions, command names and project links.
- Refresh the settings screenshot with the new plugin name.
- Preserve the three characters, pixel rendering, behaviors and command fan.
- Keep existing choices when migrating the previous development installation.

## 0.3.1

Initial development release as Little NPC.

- Three original pixel companions: Pip, Arden and Nova.
- Eight autonomous activities, plus mouse attention and a command fan.
- Four head directions, including upward glances; short necks and clear greeting poses.
- Up to six fixed favorite commands with optional short labels.
- Small, Medium and Large sizes with uniform physical-pixel rendering.
- Animated settings previews and a read-only gallery of all ten behaviors.
- Configurable walking speed, attention distance and hover delay.
- Status-bar recall, keyboard navigation and preserved editor focus and selection.
- Background pause and reduced-motion support.
