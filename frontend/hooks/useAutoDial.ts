import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ColdLead } from "@/types/cold-lead";

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

        const cleanPhone = contactLead.telefone.replace(/\D/g, "");
        let sipPhone = cleanPhone;

        if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            sipPhone = "+55" + cleanPhone;
        } else if (!cleanPhone.startsWith("+") && cleanPhone.length > 11) {
            sipPhone = "+" + cleanPhone;
        }

        try {
            window.location.href = `sip:${sipPhone}`;
            lastDialedLeadId.current = contactLead.id;
        } catch (error) {
            console.error("Auto dial error:", error);
            toast.error("O navegador bloqueou a discagem. Tente clicar em 'Discar Agora'.");
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
