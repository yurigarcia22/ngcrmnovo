"use client";

/**
 * Cache local (localStorage) com TTL para snapshots de paginas pesadas (kanbans).
 * Padrao estilo stale-while-revalidate: na montagem, retorna o snapshot velho
 * imediatamente pra paint instantaneo, enquanto o fetch real roda em paralelo
 * e hidrata quando chega.
 *
 * Cada usuario+tenant tem seu proprio espaco. Limpa em logout.
 */

const PREFIX = "crm_cache_v1::";
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutos

interface CacheEnvelope<T> {
    v: number;
    ts: number;
    data: T;
}

function safeKey(key: string): string {
    return PREFIX + key;
}

export function readCache<T>(key: string, maxAgeMs: number = DEFAULT_TTL_MS): T | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(safeKey(key));
        if (!raw) return null;
        const env = JSON.parse(raw) as CacheEnvelope<T>;
        if (env.v !== 1) return null;
        if (Date.now() - env.ts > maxAgeMs) return null;
        return env.data;
    } catch {
        return null;
    }
}

export function writeCache<T>(key: string, data: T): void {
    if (typeof window === "undefined") return;
    try {
        const env: CacheEnvelope<T> = { v: 1, ts: Date.now(), data };
        const serialized = JSON.stringify(env);
        // Limita a 2MB por chave pra nao estourar quota
        if (serialized.length > 2_000_000) return;
        localStorage.setItem(safeKey(key), serialized);
    } catch {
        // Quota cheia, ignora
    }
}

export function clearCacheKey(key: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(safeKey(key));
    } catch { /* ignore */ }
}

export function clearAllCache(): void {
    if (typeof window === "undefined") return;
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
}
