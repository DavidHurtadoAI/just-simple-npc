# Changelog

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
