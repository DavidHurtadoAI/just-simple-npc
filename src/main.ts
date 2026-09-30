import { Plugin, PluginSettingTab, Setting, SuggestModal, Notice, setIcon, type App, type Command } from 'obsidian';
import { ACTIONS, CHARACTERS, SIZES, normalizeSettings, type Action, type Character, type Settings } from './core';
import { Companion, type FanCommand } from './companion';
import { drawSprite } from './sprite';
import { PixelSurface, pixelMetrics } from './pixel-grid';

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
function catalog(app: App): Command[] {
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
    this.addCommand({ id: 'open-fan', name: 'Open favorite commands', callback: () => this.companion?.open(true) });
    this.addCommand({ id: 'recall', name: 'Call your companion here', callback: () => this.companion?.recall() });
    this.addCommand({ id: 'configure', name: 'Configure favorite commands', callback: () => this.openSettings() });
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
      if (!manager?.commands[id]) { new Notice('This command is no longer available. Choose another in Just Simple NPC settings.'); return; }
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

class CommandPicker extends SuggestModal<Command> {
  private commands: Command[];
  constructor(app: App, private choose: (command: Command) => void) {
    super(app); this.commands = catalog(app); this.setPlaceholder('Find a command…');
    this.emptyStateText = 'No matching commands'; this.limit = 80;
  }
  getSuggestions(query: string): Command[] {
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.commands.filter(command => words.every(word => `${command.name} ${command.id}`.toLocaleLowerCase().includes(word)));
  }
  renderSuggestion(command: Command, el: HTMLElement): void {
    el.createDiv({ text: command.name }); el.createDiv({ text: command.id, cls: 'lnp-command-id' });
  }
  onChooseSuggestion(command: Command): void { this.choose(command); }
}

class NpcSettings extends PluginSettingTab {
  private previewFrame = 0;
  private previewWindow: Window | null = null;
  constructor(app: App, private npc: JustSimpleNpcPlugin) { super(app, npc); npc.register(() => this.stopPreview()); }
  hide(): void { this.stopPreview(); }
  private stopPreview(): void { this.previewWindow?.cancelAnimationFrame(this.previewFrame); this.previewFrame = 0; this.previewWindow = null; }
  display(): void {
    this.stopPreview();
    const { containerEl: el } = this; el.empty(); el.classList.add('lnp-settings');
    const character = CHARACTERS.find(item => item.id === this.npc.settings.character)!;
    const previews: { surface: PixelSurface; size: number; action: Action; character: Character }[] = [];
    const preview = (canvas: HTMLCanvasElement, action: Action, id: Character, size = 2) => {
      canvas.setAttribute('aria-hidden', 'true');
      const surface = new PixelSurface(canvas);
      surface.resize(pixelMetrics(size, canvas.ownerDocument.defaultView!.devicePixelRatio));
      drawSprite(surface.context, { action, character: id, time: .8, actionTime: .8, direction: 1, gazeX: 1, gazeY: -1, reduced: false });
      surface.present(); previews.push({ surface, size, action, character: id });
    };
    const hero = el.createDiv({ cls: 'lnp-settings-hero' });
    preview(hero.createEl('canvas'), 'wave', character.id);
    const welcome = hero.createDiv(); welcome.createEl('h2', { text: `Meet ${character.name}` });
    welcome.createEl('p', { text: 'A little company at the edge of your workspace. Move closer and your companion looks at you; hover to open your favorite commands.' });
    new Setting(el).setName('Your companion').setHeading();
    const characters = el.createDiv({ cls: 'lnp-characters' });
    for (const choice of CHARACTERS) {
      const card = characters.createEl('button', { cls: 'lnp-character' }); card.type = 'button';
      card.setAttribute('aria-pressed', `${choice.id === character.id}`); card.setAttribute('aria-label', `Choose ${choice.name}`);
      preview(card.createEl('canvas'), choice.id === character.id ? 'wave' : 'idle', choice.id);
      card.createEl('strong', { text: choice.name }); card.createEl('span', { text: choice.description });
      card.addEventListener('click', async () => { this.npc.settings.character = choice.id; await this.npc.saveSettings(); this.display(); });
    }
    new Setting(el).setName('Character size').setDesc('Three sizes, adjusted to your display so every pixel is a crisp square. Small characters keep a comfortable hover area.')
      .addDropdown(dropdown => {
        for (const size of SIZES) dropdown.addOption(`${size.scale}`, size.name);
        dropdown.setValue(`${this.npc.settings.scale}`).onChange(async value => { this.npc.settings.scale = Number(value); await this.npc.saveSettings(); });
      });
    new Setting(el).setName('Favorite commands').setHeading();
    el.createEl('p', { text: 'Your choices stay in this order. No usage tracking. Leave a slot empty to show fewer bubbles.', cls: 'setting-item-description' });
    new Setting(el).setName('Number of slots').setDesc('Up to six fixed commands in the fan. Hidden slots keep their configuration.')
      .addDropdown(dropdown => {
        for (let i = 1; i <= 6; i++) dropdown.addOption(`${i}`, `${i}`);
        dropdown.setValue(`${this.npc.settings.count}`).onChange(async value => { this.npc.settings.count = Number(value); await this.npc.saveSettings(); this.display(); });
      });
    const manager = commandManager(this.app);
    if (!manager) el.createEl('p', { text: 'The command catalog is unavailable in this version of Obsidian.', cls: 'lnp-warning' });
    this.npc.settings.slots.slice(0, this.npc.settings.count).forEach((slot, index) => {
      const card = el.createDiv({ cls: 'lnp-slot' });
      const name = manager?.commands[slot.command]?.name;
      new Setting(card).setName(`Command ${index + 1}`).setDesc(slot.command ? name || `Unavailable: ${slot.command}` : 'Empty slot')
        .addButton(button => button.setButtonText(slot.command ? 'Change' : 'Choose').onClick(() => {
          new CommandPicker(this.app, async command => { slot.command = command.id; await this.npc.saveSettings(); this.display(); }).open();
        }))
        .addExtraButton(button => button.setIcon('x').setTooltip('Clear this slot').onClick(async () => { slot.command = ''; slot.label = ''; await this.npc.saveSettings(); this.display(); }));
      new Setting(card).setName('Short label').setDesc('Optional. Long names are shortened; the full command name remains in the tooltip.')
        .addText(text => text.setPlaceholder(name ? name.slice(0, 23) : 'Use command name').setValue(slot.label).onChange(value => { slot.label = value.slice(0, 100); void this.npc.saveSettings(); }));
    });
    new Setting(el).setName('Companion').setHeading();
    new Setting(el).setName('Walking speed').setDesc('Pixels per second. A gentle stroll is 24.')
      .addSlider(slider => slider.setLimits(8, 48, 2).setValue(this.npc.settings.speed).setDynamicTooltip().onChange(value => { this.npc.settings.speed = value; void this.npc.saveSettings(); }));
    new Setting(el).setName('Attention distance').setDesc('How close the mouse must be before your companion stops to look at it.')
      .addSlider(slider => slider.setLimits(80, 240, 10).setValue(this.npc.settings.proximity).setDynamicTooltip().onChange(value => { this.npc.settings.proximity = value; void this.npc.saveSettings(); }));
    new Setting(el).setName('Hover delay').setDesc('Milliseconds before the fan opens. Click or press Enter to open immediately.')
      .addSlider(slider => slider.setLimits(0, 800, 20).setValue(this.npc.settings.hoverDelay).setDynamicTooltip().onChange(value => { this.npc.settings.hoverDelay = value; void this.npc.saveSettings(); }));
    new Setting(el).setName(`Bring ${character.name} back`).setDesc('Your companion also has a small recall button in the status bar. Right-click the character to return to these settings.')
      .addButton(button => button.setButtonText(`Call ${character.name}`).onClick(() => this.npc.companion?.recall()));
    new Setting(el).setName('NPC actions · read-only').setHeading();
    el.createEl('p', { text: 'All ten behaviors are shown below with live previews of your selected character. This gallery is read-only; individual behaviors will be configurable in a future version.', cls: 'setting-item-description' });
    const list = el.createDiv({ cls: 'lnp-actions' });
    for (const action of ACTIONS) {
      const item = list.createDiv({ cls: 'lnp-action' });
      preview(item.createEl('canvas'), action.id, character.id);
      const description = item.createDiv(); description.createEl('strong', { text: action.name }); description.createEl('p', { text: action.description });
    }
    el.createEl('p', { text: 'Your companion pauses while Obsidian is in the background. Reduced motion is respected. Everything stays in this vault; there are no network requests.', cls: 'lnp-footnote' });
    const win = el.ownerDocument.defaultView!; this.previewWindow = win;
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    const start = win.performance.now(); let last = 0;
    const animate = (now: number) => {
      if (this.previewWindow !== win || !el.isConnected) return;
      if (now - last >= 100 && !el.ownerDocument.hidden) {
        const time = (now - start) / 1000;
        for (const item of previews) {
          item.surface.resize(pixelMetrics(item.size, win.devicePixelRatio)); item.surface.align(win.devicePixelRatio);
          drawSprite(item.surface.context, { action: item.action, character: item.character, time, actionTime: time, direction: 1, gazeX: Math.sin(time * .8), gazeY: Math.cos(time * .6) - .6, reduced: reduced.matches });
          item.surface.present();
        }
        last = now;
      }
      this.previewFrame = win.requestAnimationFrame(animate);
    };
    this.previewFrame = win.requestAnimationFrame(animate);
  }
}
