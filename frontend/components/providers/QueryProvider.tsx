"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/**
 * Provider global do TanStack Query.
 *
 * Estrategia:
 * - Cache em memoria compartilhado entre todas as paginas/componentes do app.
 * - staleTime 30s: durante este intervalo, dados saidos do cache nao disparam
 *   refetch. Apos 30s, o proximo uso refaz fetch em background (stale-while-
 *   revalidate). Mutations invalidam queries especificas via queryKey.
 * - gcTime 30min: cache fica em memoria por ate 30min mesmo sem assinante.
 * - Persistencia em localStorage: cache sobrevive a F5 e navegacao normal.
 *   Limite de tamanho protegido pelo persister (max ~5MB localStorage).
 * - refetchOnWindowFocus: ao voltar pra aba, refaz queries staled.
 */

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () => new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 30_000,
                    gcTime: 30 * 60_000,
                    refetchOnWindowFocus: true,
                    refetchOnReconnect: true,
                    retry: 1,
                },
                mutations: {
                    retry: 0,
                },
            },
        }),
    );

    // Persistencia (apenas no cliente)
    useEffect(() => {
        if (typeof window === "undefined") return;
        const persister = createSyncStoragePersister({
            storage: window.localStorage,
            key: "crm_rq_cache_v1",
            throttleTime: 1000,
        });
        const [unsubscribe] = persistQueryClient({
            queryClient,
            persister,
            maxAge: 1000 * 60 * 60 * 24, // 24h
            // Bump deste valor invalida TODO o cache persistido no proximo load.
            // v2: limpa cache antigo que listava funis de cold_call no /leads
            // (antes do filtro kind='deals').
            buster: "v2",
        });
        return () => { unsubscribe(); };
    }, [queryClient]);

    // Hooks de foco/online sao default no client, mas garantimos:
    useEffect(() => {
        focusManager.setEventListener((handleFocus) => {
            if (typeof window === "undefined") return () => {};
            const onFocus = () => handleFocus(true);
            const onBlur = () => handleFocus(false);
            window.addEventListener("focus", onFocus);
            window.addEventListener("blur", onBlur);
            return () => {
                window.removeEventListener("focus", onFocus);
                window.removeEventListener("blur", onBlur);
            };
        });
        onlineManager.setEventListener((setOnline) => {
            if (typeof window === "undefined") return () => {};
            const onOnline = () => setOnline(true);
            const onOffline = () => setOnline(false);
            window.addEventListener("online", onOnline);
            window.addEventListener("offline", onOffline);
            return () => {
                window.removeEventListener("online", onOnline);
                window.removeEventListener("offline", onOffline);
            };
        });
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {process.env.NODE_ENV === "development" && (
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            )}
        </QueryClientProvider>
    );
}
