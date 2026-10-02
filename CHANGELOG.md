# Changelog

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
