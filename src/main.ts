import { Plugin, Notice, setIcon, TFile, normalizePath, type App, type Command } from 'obsidian';
import { CHARACTERS, normalizeSettings, type Settings } from './core';
import { Companion, type FanCommand } from './companion';
import { NpcSettings } from './settings';
import { CustomSprite } from './custom-sprite';
import { drawSprite, type SpritePose } from './sprite';
import type { BackgroundMode } from './sheet-pixels';

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
  const commands = [...Object.values(manager.commands), ...(typeof manager.listCommands === 'function' ? manager.listCommands() : [])];
  return [...new Map(commands.filter(command => typeof command.id === 'string' && typeof command.name === 'string')
    .map(command => [command.id, command])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default class JustSimpleNpcPlugin extends Plugin {
  settings!: Settings;
  companion: Companion | null = null;
  customSprite: CustomSprite | null = null;
  customError = '';
  private customRevision = 0;
  private settingTab: NpcSettings | null = null;
  private status: HTMLElement | null = null;
  private shuttingDown = false;
  private saving: Promise<void> = Promise.resolve();
  private call: HTMLButtonElement | null = null;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    if (this.settings.customPath) await this.reloadCustom(true);
    this.settingTab = new NpcSettings(this.app, this); this.addSettingTab(this.settingTab);
    this.registerEvent(this.app.vault.on('modify', file => { if (file.path === this.settings.customPath) void this.reloadCustom(true); }));
    this.registerEvent(this.app.vault.on('create', file => { if (file.path === this.settings.customPath) void this.reloadCustom(true); }));
    this.registerEvent(this.app.vault.on('delete', file => {
      if (file.path === this.settings.customPath) { this.customRevision++; this.customSprite = null; this.customError = 'The selected PNG was deleted. Choose another sheet, or restore this file.'; this.updateName(); this.companion?.refresh(true); this.refreshCustomSettings(); }
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (oldPath === this.settings.customPath) { this.settings.customPath = file.path; void this.saveSettings().then(() => this.reloadCustom(true)).catch(error => console.error('Just Simple NPC: renamed sheet could not be saved', error)); }
    }));
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
        name: () => this.currentName(),
        paint: (context, pose) => this.paint(context, pose, this.settings.character === 'custom'),
        commands: () => this.fanCommands(),
        execute: id => this.execute(id),
        configure: () => this.openSettings(),
        decorateIcon: (el, icon) => setIcon(el, icon)
      });
      this.registerEvent(this.app.workspace.on('layout-change', () => this.companion?.refresh()));
    });
  }
  onunload(): void { this.shuttingDown = true; this.customRevision++; this.customSprite = null; this.companion?.destroy(); this.companion = null; }
  saveSettings(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.settings)) as Settings;
    this.saving = this.saving.catch(() => {}).then(() => this.saveData(snapshot));
    this.updateName(); this.companion?.refresh(true); return this.saving;
  }
  private updateName(): void {
    const name = this.currentName();
    if (this.call) { this.call.textContent = name; this.call.title = `Call ${name} here · right-click for settings`; this.call.setAttribute('aria-label', `Call ${name} here`); }
  }
  currentName(): string {
    return this.settings.character === 'custom' ? this.customSprite ? this.settings.customName : 'Pip'
      : CHARACTERS.find(character => character.id === this.settings.character)!.name;
  }
  paint(context: CanvasRenderingContext2D, pose: SpritePose, custom = false): void {
    if (custom && this.customSprite) this.customSprite.draw(context, pose); else drawSprite(context, pose);
  }
  private async readCustom(path: string, background: BackgroundMode): Promise<CustomSprite> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'png') throw new Error('Choose an existing PNG file inside this vault.');
    if (file.stat.size > 12 * 1024 * 1024) throw new Error('Use a PNG smaller than 12 MB.');
    return CustomSprite.load(await this.app.vault.readBinary(file), this.app.workspace.containerEl.ownerDocument, background);
  }
  async chooseCustom(path: string): Promise<void> {
    const revision = ++this.customRevision, normalized = normalizePath(path);
    const sheet = await this.readCustom(normalized, this.settings.customBackground);
    if (revision !== this.customRevision || this.shuttingDown) return;
    this.customSprite = sheet; this.customError = ''; this.settings.customPath = normalized;
    await this.saveSettings();
  }
  async changeCustomBackground(mode: BackgroundMode): Promise<void> {
    const revision = ++this.customRevision;
    const sheet = this.settings.customPath ? await this.readCustom(this.settings.customPath, mode) : null;
    if (revision !== this.customRevision || this.shuttingDown) return;
    this.customSprite = sheet; this.customError = ''; this.settings.customBackground = mode;
    await this.saveSettings();
  }
  async reloadCustom(notify = false): Promise<void> {
    const revision = ++this.customRevision;
    try {
      const sheet = this.settings.customPath ? await this.readCustom(this.settings.customPath, this.settings.customBackground) : null;
      if (revision !== this.customRevision || this.shuttingDown) return;
      this.customSprite = sheet; this.customError = '';
    } catch (error) {
      if (revision !== this.customRevision || this.shuttingDown) return;
      this.customSprite = null; this.customError = error instanceof Error ? error.message : 'This sprite sheet could not be loaded.';
      if (notify && this.settings.character === 'custom') new Notice(`${this.customError} Pip is here until the sheet is fixed.`);
    }
    this.updateName(); this.companion?.refresh(true); this.refreshCustomSettings();
  }
  private refreshCustomSettings(): void { if (this.settingTab?.containerEl.isConnected && this.settingTab.containerEl.isShown()) this.settingTab.update(); }
  async clearCustom(): Promise<void> {
    this.customRevision++; this.customSprite = null; this.customError = ''; this.settings.customPath = '';
    if (this.settings.character === 'custom') this.settings.character = 'pip';
    await this.saveSettings();
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
