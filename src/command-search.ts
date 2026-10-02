interface SearchCommand { id: string; name: string }

function searchable(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Accept names and IDs with colons, hyphens, underscores or spaces. */
export function searchCommands<T extends SearchCommand>(commands: readonly T[], query: string): T[] {
  const needle = searchable(query), words = needle.split(/\s+/).filter(Boolean);
  return commands.map(command => {
    const id = searchable(command.id), name = searchable(command.name);
    const alias = command.id === 'app:toggle-left-sidebar' ? 'left sidebar barra izquierda panel izquierdo'
      : command.id === 'app:toggle-right-sidebar' ? 'right sidebar barra derecha panel derecho' : '';
    const rank = id === needle ? 0 : name === needle ? 1 : name.startsWith(needle) ? 2
      : alias && alias.includes(needle) ? 3 : words.every(word => name.includes(word)) ? 4 : 5;
    return { command, text: `${id} ${name} ${alias}`, rank };
  }).filter(item => words.every(word => item.text.includes(word)))
    .sort((a, b) => a.rank - b.rank || a.command.name.localeCompare(b.command.name))
    .map(item => item.command);
}
