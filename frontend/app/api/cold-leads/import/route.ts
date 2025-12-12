import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import * as XLSX from 'xlsx';
import { ColdLeadInsert } from '@/types/cold-lead';

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet) as any[];

        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ error: 'Arquivo vazio ou formato inválido' }, { status: 400 });
        }

        const validLeads: ColdLeadInsert[] = [];
        const errors: string[] = [];

        // Expected columns: Nome, Telefone, Nicho, Site, Instagram, Google, Notas
        rawData.forEach((row, index) => {
            const lineNum = index + 2; // +1 header, +1 1-based index

            const nome = row['Nome'] || row['nome'];
            const telefone = row['Telefone'] || row['telefone'];
            const nicho = row['Nicho'] || row['nicho'];

            if (!nome || !telefone || !nicho) {
                errors.push(`Linha ${lineNum}: Campos obrigatórios (Nome, Telefone, Nicho) faltando.`);
                return;
            }

            validLeads.push({
                nome: String(nome).trim(),
                telefone: String(telefone).trim(),
                nicho: String(nicho).trim(),
                site_url: row['Site'] || row['site'] || null,
                instagram_url: row['Instagram'] || row['instagram'] || null,
                google_meu_negocio_url: row['Google'] || row['google'] || null,
                notas: row['Notas'] || row['notas'] || null,
                status: 'novo_lead',
                tentativas: 0
            });
        });

        if (validLeads.length === 0) {
            return NextResponse.json({
                error: 'Nenhum lead válido encontrado.',
                details: errors
            }, { status: 400 });
        }

        const { error: insertError } = await supabase
            .from('cold_leads')
            .insert(validLeads);

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({
            message: 'Importação concluída',
            totalImported: validLeads.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error('Import error:', err);
        return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 });
    }
}
