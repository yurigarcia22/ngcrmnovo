"use client";

import { createContext, useContext } from "react";
import { getVocab, type Vocab } from "@/lib/vocab";

const VocabContext = createContext<Vocab>(getVocab(false));

export function VocabProvider({ vetOn, children }: { vetOn: boolean; children: React.ReactNode }) {
    return <VocabContext.Provider value={getVocab(vetOn)}>{children}</VocabContext.Provider>;
}

export function useVocab(): Vocab {
    return useContext(VocabContext);
}
