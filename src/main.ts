import { Plugin, Notice, setIcon, type App, type Command } from 'obsidian';
import { CHARACTERS, normalizeSettings, type Settings } from './core';
import { Companion, type FanCommand } from './companion';
import { NpcSettings } from './settings';

// Obsidian's command catalog/dispatcher is internal. Keep all access here,
// feature-detect it, and never replace or intercept another command's callback.
interface CommandManager {
  commands: Record<string, Command>;
  listCommands?: () => Command[];
  executeCommandById: (id: string) => boolean;
}
function commandManager(app: App): CommandManager | null {
  const manager = (app as unknown as { commands?: Partial<CommandManager> }).commands;
  return manager && manager.commands && typeof manager.executeCommandById === 'function' ? manager as CommandManager : null;
}
export function catalog(app: App): Command[] {
  const manager = commandManager(app);
  if (!manager) return [];
  return (typeof manager.listCommands === 'function' ? manager.listCommands() : Object.values(manager.commands))
    .filter(command => typeof command.id === 'string' && typeof command.name === 'string')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default class JustSimpleNpcPlugin extends Plugin {
  settings!: Settings;
  companion: Companion | null = null;
  private status: HTMLElement | null = null;
  private shuttingDown = false;
  private saving: Promise<void> = Promise.resolve();
  private call: HTMLButtonElement | null = null;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new NpcSettings(this.app, this));
    this.addCommand({ id: 'open-fan', name: 'Open favorites', callback: () => this.companion?.open(true) });
    this.addCommand({ id: 'recall', name: 'Call your companion here', callback: () => this.companion?.recall() });
    this.addCommand({ id: 'configure', name: 'Configure favorites', callback: () => this.openSettings() });
    this.app.workspace.onLayoutReady(() => {
      if (this.shuttingDown) return;
      this.status = this.addStatusBarItem(); this.status.classList.add('lnp-status');
      const call = this.status.createEl('button', { text: 'Pip', cls: 'lnp-call' });
      this.call = call; call.type = 'button'; this.updateName();
      this.registerDomEvent(call, 'click', () => this.companion?.recall(this.status!));
      this.registerDomEvent(call, 'contextmenu', event => { event.preventDefault(); this.openSettings(); });
      this.companion = new Companion(this.status.ownerDocument, {
        settings: () => this.settings,
        commands: () => this.fanCommands(),
        execute: id => this.execute(id),
        configure: () => this.openSettings(),
        decorateIcon: (el, icon) => setIcon(el, icon)
      });
      this.registerEvent(this.app.workspace.on('layout-change', () => this.companion?.refresh()));
    });
  }
  onunload(): void { this.shuttingDown = true; this.companion?.destroy(); this.companion = null; }
  saveSettings(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.settings)) as Settings;
    this.saving = this.saving.catch(() => {}).then(() => this.saveData(snapshot));
    this.updateName(); this.companion?.refresh(true); return this.saving;
  }
  private updateName(): void {
    const name = CHARACTERS.find(character => character.id === this.settings.character)!.name;
    if (this.call) { this.call.textContent = name; this.call.title = `Call ${name} here · right-click for settings`; this.call.setAttribute('aria-label', `Call ${name} here`); }
  }
  fanCommands(): FanCommand[] {
    const manager = commandManager(this.app);
    return this.settings.slots.slice(0, this.settings.count).filter(slot => slot.command).map(slot => {
      const command = manager?.commands[slot.command];
      return { id: slot.command, name: command?.name || slot.command, label: slot.label,
        icon: command?.icon, available: !!command };
    });
  }
  execute(id: string): void {
    try {
      const manager = commandManager(this.app);
      if (!manager?.commands[id]) { new Notice('This command is no longer available. Choose another in the companion settings.'); return; }
      if (!manager.executeCommandById(id)) new Notice('This command is not available in the current view.');
    } catch (error) { console.error('Just Simple NPC: command failed', error); new Notice('The command could not run.'); }
  }
  openSettings(): void {
    this.companion?.close(false);
    const settings = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    if (typeof settings?.open === 'function' && typeof settings.openTabById === 'function') {
      settings.open(); settings.openTabById(this.manifest.id);
    } else { commandManager(this.app)?.executeCommandById('app:open-settings'); }
  }
}
