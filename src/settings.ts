import { PluginSettingTab, Setting, SuggestModal, Notice, type App, type Command, type SettingDefinitionItem } from 'obsidian';
import type JustSimpleNpcPlugin from './main';
import { catalog } from './main';
import { ACTIONS, CHARACTERS, SIZES, normalizeSettings, type Action, type Character } from './core';
import { drawSprite } from './sprite';
import { PixelSurface, pixelMetrics } from './pixel-grid';
import { searchCommands } from './command-search';

class CommandPicker extends SuggestModal<Command> {
  private commands: Command[];
  constructor(app: App, private choose: (command: Command) => void) {
    super(app); this.commands = catalog(app); this.setPlaceholder('Find a command by name or ID…');
    this.emptyStateText = 'No matching commands'; this.limit = 80;
  }
  getSuggestions(query: string): Command[] {
    return searchCommands(this.commands, query);
  }
  renderSuggestion(command: Command, el: HTMLElement): void {
    el.createDiv({ text: command.name }); el.createDiv({ text: command.id, cls: 'lnp-command-id' });
  }
  onChooseSuggestion(command: Command): void { this.choose(command); }
}

export class NpcSettings extends PluginSettingTab {
  private previewStops = new Set<() => void>();
  constructor(app: App, private npc: JustSimpleNpcPlugin) {
    super(app, npc); npc.register(() => this.stopPreviews());
  }
  hide(): void { this.stopPreviews(); }
  private stopPreviews(): void { for (const stop of this.previewStops) stop(); }

  getControlValue(key: string): unknown {
    const label = /^slots\.([0-5])\.label$/.exec(key);
    if (label) return this.npc.settings.slots[Number(label[1])].label;
    if (key === 'scale') return SIZES.find(size => size.scale === this.npc.settings.scale)!.name;
    if (key === 'count') return String(this.npc.settings.count);
    return super.getControlValue(key);
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    const label = /^slots\.([0-5])\.label$/.exec(key);
    if (label && typeof value === 'string') this.npc.settings.slots[Number(label[1])].label = value.slice(0, 100);
    else if (key === 'character') this.npc.settings.character = normalizeSettings({ ...this.npc.settings, character: value }).character;
    else if (key === 'scale' || key === 'count' || key === 'speed' || key === 'proximity' || key === 'hoverDelay') {
      const numeric = key === 'scale' ? SIZES.find(size => size.name === value)?.scale : Number(value);
      this.npc.settings[key] = normalizeSettings({ ...this.npc.settings, [key]: numeric })[key];
    } else return;
    await this.npc.saveSettings();
    if (key === 'character') this.update();
    else if (key === 'count') this.refreshDomState();
  }
  private persist(refresh = false): void {
    void this.npc.saveSettings().then(() => { if (refresh) this.update(); }).catch(error => this.reportSaveError(error));
  }
  private reportSaveError(error: unknown): void {
    console.error('Just Simple NPC: settings could not be saved', error);
    new Notice('Your companion settings could not be saved.');
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const character = CHARACTERS.find(item => item.id === this.npc.settings.character)!;
    const commands = catalog(this.app);
    const favorites: SettingDefinitionItem & { type: 'group' } = {
      type: 'group', heading: 'Favorite commands', items: [{
        name: 'Number of slots',
        desc: 'Up to six fixed commands in your chosen order. No usage tracking. Hidden slots keep their configuration.',
        control: { type: 'dropdown', key: 'count', options: Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => [String(i), String(i)])) }
      }]
    };
    for (let index = 0; index < 6; index++) {
      const slot = this.npc.settings.slots[index];
      const name = commands.find(command => command.id === slot.command)?.name;
      const visible = () => index < this.npc.settings.count;
      favorites.items!.push({
        name: `Command ${index + 1}`,
        desc: slot.command ? name || `Unavailable: ${slot.command}` : 'Empty slot', visible,
        aliases: ['favorite', 'bubble', 'shortcut'],
        render: setting => {
          setting.settingEl.addClass('lnp-slot-command');
          setting.addButton(button => button.setButtonText(slot.command ? 'Change' : 'Choose').onClick(() => {
            new CommandPicker(this.app, command => { this.npc.settings.slots[index].command = command.id; this.persist(true); }).open();
          })).addExtraButton(button => button.setIcon('x').setTooltip('Clear this slot').onClick(() => {
            this.npc.settings.slots[index] = { command: '', label: '' }; this.persist(true);
          }));
        }
      }, {
        name: `Command ${index + 1} label`,
        desc: 'Optional. Long labels are shortened; the tooltip keeps the full command name.', visible,
        control: { type: 'text', key: `slots.${index}.label`, placeholder: name ? name.slice(0, 23) : 'Use command name' }
      });
    }
    return [{
      name: `Meet ${character.name}`, searchable: false,
      desc: 'A little company at the edge of your workspace. Move closer and your companion looks at you; hover to open your favorites.',
      render: setting => {
        this.containerEl.addClass('lnp-settings');
        setting.setHeading(); setting.settingEl.addClass('lnp-settings-hero');
        const canvas = setting.settingEl.createEl('canvas', { prepend: true });
        const stop = this.preview(canvas, 'wave', character.id);
        return () => { stop(); canvas.remove(); };
      }
    }, {
      type: 'group', heading: 'Your companion', items: [{
        name: 'Character', desc: 'Choose Pip, Arden or Nova.', aliases: ['Pip', 'Arden', 'Nova', 'knight', 'robot'],
        render: setting => {
          setting.settingEl.addClass('lnp-character-setting');
          const cards = setting.controlEl.createDiv({ cls: 'lnp-characters' });
          const stops: (() => void)[] = [];
          for (const choice of CHARACTERS) {
            const card = cards.createEl('button', { cls: 'lnp-character', type: 'button', attr: {
              'aria-pressed': String(choice.id === character.id), 'aria-label': `Choose ${choice.name}`
            } });
            stops.push(this.preview(card.createEl('canvas'), choice.id === character.id ? 'wave' : 'idle', choice.id));
            card.createEl('strong', { text: choice.name }); card.createSpan({ text: choice.description });
            card.addEventListener('click', () => {
              void this.setControlValue('character', choice.id).catch(error => this.reportSaveError(error));
            });
          }
          return () => { for (const stop of stops) stop(); cards.remove(); };
        }
      }, {
        name: 'Character size', desc: 'Three sizes, adjusted to your display so every pixel is a crisp square. Small characters keep a comfortable hover area.',
        control: { type: 'dropdown', key: 'scale', options: Object.fromEntries(SIZES.map(size => [size.name, size.name])) }
      }]
    }, favorites, {
      type: 'group', heading: 'Companion', items: [{
        name: 'Walking speed', desc: 'Pixels per second. A gentle stroll is 24.',
        control: { type: 'slider', key: 'speed', min: 8, max: 48, step: 2 }
      }, {
        name: 'Attention distance', desc: 'How close the mouse must be before your companion stops to look at it.',
        control: { type: 'slider', key: 'proximity', min: 80, max: 240, step: 10 }
      }, {
        name: 'Hover delay', desc: 'Milliseconds before the fan opens. Click or press Enter to open immediately.',
        control: { type: 'slider', key: 'hoverDelay', min: 0, max: 800, step: 20 }
      }, {
        name: `Bring ${character.name} back`, desc: 'Use the recall button in the status bar, or right-click the character to return to these settings.',
        render: setting => { setting.addButton(button => button.setButtonText(`Call ${character.name}`).onClick(() => this.npc.companion?.recall())); }
      }]
    }, {
      name: 'NPC actions · read-only',
      desc: `Live previews of all ${ACTIONS.length} behaviors. Individual behaviors will be configurable in a future version.`,
      aliases: ACTIONS.map(action => action.name),
      render: setting => {
        setting.setHeading(); setting.settingEl.addClass('lnp-gallery-setting');
        const list = setting.settingEl.createDiv({ cls: 'lnp-actions' });
        const stops: (() => void)[] = [];
        for (const action of ACTIONS) {
          const item = list.createDiv({ cls: 'lnp-action' });
          const row = new Setting(item).setName(action.name).setDesc(action.description);
          stops.push(this.preview(row.settingEl.createEl('canvas', { prepend: true }), action.id, character.id));
        }
        return () => { for (const stop of stops) stop(); list.remove(); };
      }
    }, {
      name: 'A quiet companion', searchable: false,
      desc: 'Pauses while Obsidian is in the background. Respects reduced motion. Everything stays in this vault; there are no network requests.'
    }];
  }

  private preview(canvas: HTMLCanvasElement, action: Action, character: Character): () => void {
    canvas.setAttribute('aria-hidden', 'true');
    const win = canvas.ownerDocument.defaultView!;
    const surface = new PixelSurface(canvas);
    const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
    const start = win.performance.now(); let last = -Infinity, frame = 0, stopped = false;
    const paint = (time: number) => {
      surface.resize(pixelMetrics(2, win.devicePixelRatio)); surface.align(win.devicePixelRatio);
      drawSprite(surface.context, { action, character, time, actionTime: time, direction: 1,
        gazeX: Math.sin(time * .8), gazeY: Math.cos(time * .6) - .6, reduced: reduced.matches });
      surface.present();
    };
    paint(.8);
    const stop = () => { stopped = true; win.cancelAnimationFrame(frame); this.previewStops.delete(stop); };
    const animate = (now: number) => {
      if (stopped) return;
      if (!canvas.isConnected) { stop(); return; }
      if (now - last >= 100 && !canvas.ownerDocument.hidden) { paint((now - start) / 1000); last = now; }
      frame = win.requestAnimationFrame(animate);
    };
    this.previewStops.add(stop); frame = win.requestAnimationFrame(animate);
    return stop;
  }
}
