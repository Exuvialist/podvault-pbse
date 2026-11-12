import type { FileRecord, VaultConfig } from './types.js';

/**
 * Public, non-secret projection of the vault: this is what a Pod neighbour or a
 * semantic client may read. No ciphertext, no IVs, no wrapped keys, no KDF params.
 */
export function buildManifest(config: VaultConfig, files: FileRecord[]): Record<string, unknown> {
  const sorted = [...files].sort((a, b) => a.id.localeCompare(b.id));
  const base = config.webId.replace(/#.*$/, '');
  const nodes = sorted.map((file) => ({
    '@id': `${base}#file-${file.id}`,
    '@type': 'schema:DigitalDocument',
    'schema:name': file.name,
    'pv:category': file.category,
    'pv:size': file.size,
    'pv:sha256': file.sha256,
    'schema:dateCreated': file.createdAt,
  }));

  return {
    '@context': {
      pv: 'https://podvault.app/ns#',
      schema: 'https://schema.org/',
      solid: 'https://www.w3.org/ns/solid/terms#',
    },
    '@id': config.webId,
    '@type': 'pv:Vault',
    'pv:owner': config.webId,
    'pv:createdAt': config.createdAt,
    'pv:fileCount': sorted.length,
    'pv:files': sorted.map((file) => ({ '@id': `${base}#file-${file.id}` })),
    '@graph': nodes,
  };
}

function lit(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

function iri(value: string): string {
  const safe = value.replace(/[<>"\s]/g, (c) => encodeURIComponent(c));
  return `<${safe}>`;
}

/** Deterministic Turtle for the same graph. Good enough for a Pod listing / debugging. */
export function manifestToTurtle(manifest: Record<string, unknown>): string {
  const id = String(manifest['@id'] ?? '');
  const files = (manifest['pv:files'] as Array<{ '@id': string }> | undefined) ?? [];
  const graph = (manifest['@graph'] as Array<Record<string, unknown>> | undefined) ?? [];

  const lines: string[] = [
    '@prefix pv: <https://podvault.app/ns#> .',
    '@prefix schema: <https://schema.org/> .',
    '@prefix solid: <https://www.w3.org/ns/solid/terms#> .',
    '',
  ];

  const head = [
    `${iri(id)} a pv:Vault`,
    `  pv:owner ${iri(String(manifest['pv:owner'] ?? ''))}`,
    `  pv:createdAt ${lit(String(manifest['pv:createdAt'] ?? ''))}`,
    `  pv:fileCount ${Number(manifest['pv:fileCount'] ?? 0)}`,
  ];
  if (files.length > 0) head.push(`  pv:files ${files.map((f) => iri(f['@id'])).join(', ')}`);
  lines.push(`${head.join(' ;\n')} .`, '');

  for (const node of graph) {
    const props = [
      `  a ${String(node['@type'] ?? 'schema:DigitalDocument')}`,
      `  schema:name ${lit(String(node['schema:name'] ?? ''))}`,
      `  pv:category ${lit(String(node['pv:category'] ?? ''))}`,
      `  pv:size ${Number(node['pv:size'] ?? 0)}`,
      `  pv:sha256 ${lit(String(node['pv:sha256'] ?? ''))}`,
      `  schema:dateCreated ${lit(String(node['schema:dateCreated'] ?? ''))}`,
    ];
    lines.push(`${iri(String(node['@id'] ?? ''))} ${props.join(' ;\n')} .`, '');
  }

  return lines.join('\n');
}
