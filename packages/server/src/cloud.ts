import type { GalaxyManifest } from '@solix/shared';

export interface PublishedGalaxy {
  slug: string;
  manifest: GalaxyManifest;
  publishedAt: number;
}

export class RegistryClient {
  constructor(
    private baseUrl: string = process.env.SOLIX_REGISTRY_URL ?? '',
    private apiKey: string | undefined = process.env.SOLIX_REGISTRY_KEY,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  async publish(
    slug: string,
    manifest: GalaxyManifest,
  ): Promise<PublishedGalaxy> {
    if (!this.isConfigured()) {
      throw new Error(
        'Registry URL not configured. Set SOLIX_REGISTRY_URL.',
      );
    }
    if (!this.apiKey) {
      throw new Error(
        'Registry API key required to publish. Set SOLIX_REGISTRY_KEY.',
      );
    }
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/galaxies/${encodeURIComponent(slug)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(manifest),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Publish failed: HTTP ${res.status} ${text}`);
    }
    return (await res.json()) as PublishedGalaxy;
  }

  async pull(slug: string): Promise<GalaxyManifest> {
    if (!this.isConfigured()) {
      throw new Error(
        'Registry URL not configured. Set SOLIX_REGISTRY_URL.',
      );
    }
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/galaxies/${encodeURIComponent(slug)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Pull failed: HTTP ${res.status} ${text}`);
    }
    const data = (await res.json()) as
      | GalaxyManifest
      | PublishedGalaxy;
    // Accept either a raw manifest or a {slug, manifest} envelope.
    if ('manifest' in data && data.manifest) {
      return data.manifest;
    }
    return data as GalaxyManifest;
  }

  async listSlugs(): Promise<string[]> {
    if (!this.isConfigured()) return [];
    const url = `${this.baseUrl.replace(/\/$/, '')}/v1/galaxies`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { slugs?: string[] } | string[];
      if (Array.isArray(data)) return data;
      return data.slugs ?? [];
    } catch {
      return [];
    }
  }
}
