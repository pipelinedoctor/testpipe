export function printTable(rows: Array<[string, string]>, title?: string): void {
  const w = process.stdout.write.bind(process.stdout);
  if (title) w(`${title}\n`);
  for (const [label, value] of rows) {
    w(`  ${label.padEnd(20)} ${value}\n`);
  }
}
