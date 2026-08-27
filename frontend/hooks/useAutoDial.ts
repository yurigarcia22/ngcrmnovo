import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ColdLead } from "@/types/cold-lead";
import { dial } from "@/lib/dialer";

interface UseAutoDialOptions {
    enabled: boolean;
    lead: ColdLead | null;
}

export function useAutoDial({ enabled, lead }: UseAutoDialOptions) {
    const lastDialedLeadId = useRef<string | null>(null);

    // Call function that can be triggered manually as well
    const dialContact = (contactLead: ColdLead | null = lead) => {
        if (!contactLead || !contactLead.telefone) {
            toast.error("Este lead não possui um número de telefone válido.");
            return;
        }

        // Usa o discador configurado nesta maquina (MicroSIP/Windows, Smart SIP/Mac...)
        const ok = dial(contactLead.telefone);
        if (ok) {
            lastDialedLeadId.current = contactLead.id;
        } else {
            toast.error("Nao foi possivel abrir o discador. Confira em 'Discador' na barra do cold-call.");
        }
    };

    useEffect(() => {
        if (!enabled || !lead) return;

        // Skip if we already dialed this lead automatically
        if (lastDialedLeadId.current === lead.id) return;

        const timeoutId = setTimeout(() => {
            dialContact(lead);
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [enabled, lead?.id]); // Depend on lead.id to avoid unnecessary re-renders when other fields change

    return { dialContact };
}
