/** Values substituted into `{name}` placeholders. A numeric `count` also selects plural forms. */
export type StringParams = Record<string, string | number>;

export interface StringTableOptions {
  /** Receives missing-key warnings. Defaults to console.warn. */
  warn?: (message: string) => void;
  /** Initial locale. Defaults to 'en'. */
  locale?: string;
}

export interface RegisterOptions {
  /** Replace keys that are already registered for this locale instead of throwing. */
  override?: boolean;
}

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$/;
const PLACEHOLDER = /\{(\w+)\}/g;
const FALLBACK_LOCALE = 'en';

function assertLocale(locale: string): void {
  if (typeof locale !== 'string') {
    throw new TypeError(`Locale must be a string, got ${typeof locale}`);
  }
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    throw new RangeError(`Invalid locale tag: "${locale}"`);
  }
}

function interpolate(text: string, params: StringParams | undefined): string {
  if (!params) return text;
  return text.replace(PLACEHOLDER, (match: string, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) && params[name] !== undefined
      ? String(params[name])
      : match,
  );
}

export class StringTable {
  private readonly tables = new Map<string, Map<string, string>>();
  private readonly pluralRules = new Map<string, Intl.PluralRules>();
  private readonly warned = new Set<string>();
  private readonly warn: (message: string) => void;
  private current: string;

  constructor(opts: StringTableOptions = {}) {
    const locale = opts.locale ?? FALLBACK_LOCALE;
    assertLocale(locale);
    this.current = locale;
    this.warn = opts.warn ?? ((message: string) => console.warn(message));
  }

  get locale(): string {
    return this.current;
  }

  setLocale(locale: string): void {
    assertLocale(locale);
    this.current = locale;
  }

  /**
   * Adds a table for one locale. Validation runs over the whole table before anything is
   * added, so a bad entry leaves the store unchanged. The returned function removes exactly
   * the keys this call added and restores any value it overrode. Calling it again does nothing.
   */
  register(locale: string, table: Record<string, string>, opts: RegisterOptions = {}): () => void {
    assertLocale(locale);
    if (typeof table !== 'object' || table === null || Array.isArray(table)) {
      throw new TypeError('String table must be an object');
    }
    const entries = Object.entries(table);
    for (const [key, value] of entries) {
      if (!KEY_PATTERN.test(key)) {
        throw new Error(`Invalid string key "${key}"`);
      }
      if (typeof value !== 'string') {
        throw new TypeError(`String value for "${key}" must be a string`);
      }
    }

    const existing = this.tables.get(locale);
    if (opts.override !== true && existing) {
      for (const [key] of entries) {
        if (existing.has(key)) {
          throw new Error(`Duplicate string key "${key}" for locale "${locale}"`);
        }
      }
    }

    let map = existing;
    if (!map) {
      map = new Map<string, string>();
      this.tables.set(locale, map);
    }
    const added: Array<{ key: string; previous: string | undefined }> = [];
    for (const [key, value] of entries) {
      added.push({ key, previous: map.get(key) });
      map.set(key, value);
    }

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const target = this.tables.get(locale);
      if (!target) return;
      for (const { key, previous } of added) {
        if (previous === undefined) target.delete(key);
        else target.set(key, previous);
      }
    };
  }

  t(key: string, params?: StringParams): string {
    const count = typeof params?.count === 'number' ? params.count : undefined;
    for (const locale of this.lookupChain()) {
      const text = this.find(locale, key, count);
      if (text !== undefined) return interpolate(text, params);
    }
    if (!this.warned.has(key)) {
      this.warned.add(key);
      this.warn(`Missing string key: ${key}`);
    }
    return `[[${key}]]`;
  }

  /** True when the plain key exists in the current locale or in 'en'. */
  has(key: string): boolean {
    return this.lookupChain().some((locale) => this.tables.get(locale)?.has(key) === true);
  }

  private lookupChain(): string[] {
    return this.current === FALLBACK_LOCALE ? [FALLBACK_LOCALE] : [this.current, FALLBACK_LOCALE];
  }

  private find(locale: string, key: string, count: number | undefined): string | undefined {
    const table = this.tables.get(locale);
    if (!table) return undefined;
    if (count !== undefined) {
      const category = this.rulesFor(locale).select(count);
      const plural = table.get(`${key}.${category}`) ?? table.get(`${key}.other`);
      if (plural !== undefined) return plural;
    }
    return table.get(key);
  }

  private rulesFor(locale: string): Intl.PluralRules {
    let rules = this.pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      this.pluralRules.set(locale, rules);
    }
    return rules;
  }
}
