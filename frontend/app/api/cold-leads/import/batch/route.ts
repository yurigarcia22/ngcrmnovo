import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';
import { canonicalizeNichoOrDefault, nichoKey } from '@/lib/nicho';
import {
    canonicalPhoneOrNull,
    chunk,
    isColdCallStageOfTenant,
    isMemberOfTenant,
    listTenantNichos,
    parseStageId,
} from '@/lib/cold-leads-api';

// Blocos de insercao (cold_leads e import_row_results)
const INSERT_CHUNK = 500;
// O assistente manda ~500 linhas por chamada; acima disso recusa (corpo/timeout).
const MAX_ROWS_PER_REQUEST = 2000;
// Quantos motivos de erro por linha voltam na resposta (o resto fica em import_row_results)
const MAX_ERRORS_IN_RESPONSE = 50;

// Lista fechada de campos que o mapeamento pode preencher. tenant_id, id, status
// e stage_id NUNCA vem do mapeamento (o cliente manda o mapping e a rota usa service role).
const ALLOWED_FIELDS = new Set([
    'nome', 'telefone', 'email', 'nicho', 'site_url', 'instagram_url',
    'google_meu_negocio_url', 'notas', 'responsavel_id',
]);
// Campo personalizado criado no ColumnMapper: 'cf_' + slug
const CUSTOM_FIELD_RE = /^cf_[a-z0-9_]{1,60}$/;

type RowResult = {
    batch_id: string;
    row_number: number;
    status: 'imported' | 'skipped' | 'error';
    errors: string[] | null;
    warnings: string[] | null;
    raw_json: any;
    normalized_json: any;
    lead_id: string | null;
};

export async function POST(request: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        // Usuario pela sessao (cookies). O client service role nao tem usuario,
        // por isso created_by ficava nulo.
        const ssr = await createServerClient();
        const { data: { user } } = await ssr.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
        }
        const tenantId = await getTenantId();

        const body = await request.json();
        const { headers, rows, mapping } = body ?? {};
        const defaults = body?.defaults ?? {};
        const rowOffset = Number.isInteger(body?.rowOffset) && body.rowOffset > 0 ? body.rowOffset : 0;
        const isFinal = body?.final !== false; // chamada unica (sem lotes) = final

        if (!Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: 'Nenhum dado para importar' }, { status: 400 });
        }
        if (rows.length > MAX_ROWS_PER_REQUEST) {
            return NextResponse.json(
                { error: `Envie no máximo ${MAX_ROWS_PER_REQUEST} linhas por vez.` },
                { status: 400 }
            );
        }
        if (!Array.isArray(headers) || !mapping || typeof mapping !== 'object') {
            return NextResponse.json({ error: 'Cabeçalhos ou mapeamento de colunas inválidos' }, { status: 400 });
        }

        // 0. Mapeamento: so campos permitidos (o resto e ignorado)
        const fieldMap: { index: number; field: string }[] = [];
        const safeMapping: Record<string, string> = {};
        for (const [header, rawField] of Object.entries(mapping as Record<string, unknown>)) {
            const field = String(rawField ?? '');
            if (!ALLOWED_FIELDS.has(field) && !CUSTOM_FIELD_RE.test(field)) continue;
            const index = headers.indexOf(header);
            if (index === -1) continue;
            fieldMap.push({ index, field });
            safeMapping[header] = field;
        }
        if (!fieldMap.some((m) => m.field === 'telefone')) {
            return NextResponse.json({ error: 'Mapeie a coluna de telefone para importar.' }, { status: 400 });
        }

        // 0.1 Defaults escolhidos na tela: etapa precisa ser de um funil cold_call do tenant
        let defaultStageId: number | null = null;
        if (defaults.stageId) {
            defaultStageId = parseStageId(defaults.stageId);
            if (!defaultStageId || !(await isColdCallStageOfTenant(supabase, tenantId, defaultStageId))) {
                return NextResponse.json(
                    { error: 'A etapa escolhida não pertence a um funil de cold call desta empresa.' },
                    { status: 400 }
                );
            }
        }
        let defaultOwnerId: string | null = null;
        if (defaults.ownerId) {
            if (!(await isMemberOfTenant(supabase, tenantId, String(defaults.ownerId)))) {
                return NextResponse.json({ error: 'Responsável padrão inválido para esta empresa.' }, { status: 400 });
            }
            defaultOwnerId = String(defaults.ownerId);
        }

        // Membros do tenant (so se a planilha tiver coluna de responsavel mapeada)
        let memberIds: Set<string> | null = null;
        if (fieldMap.some((m) => m.field === 'responsavel_id')) {
            const { data: members, error: membersError } = await supabase
                .from('profiles')
                .select('id')
                .eq('tenant_id', tenantId);
            if (membersError) throw new Error(`Falha ao carregar responsáveis: ${membersError.message}`);
            memberIds = new Set((members ?? []).map((m: any) => String(m.id)));
        }

        // Nichos existentes do tenant (paginado, sem teto de 1000 linhas)
        const existingNichos = await listTenantNichos(supabase, tenantId);

        // 1. Lote de importacao: cria na primeira chamada, reaproveita nas seguintes
        let batchId: string;
        let prevCounts = { valid_rows: 0, error_rows: 0, warning_rows: 0 };
        if (body?.batchId) {
            const { data: existingBatch, error: findError } = await supabase
                .from('import_batches')
                .select('id, valid_rows, error_rows, warning_rows')
                .eq('id', String(body.batchId))
                .eq('tenant_id', tenantId)
                .maybeSingle();
            if (findError) throw new Error(`Falha ao carregar o lote de importação: ${findError.message}`);
            if (!existingBatch) {
                return NextResponse.json({ error: 'Lote de importação não encontrado.' }, { status: 404 });
            }
            batchId = existingBatch.id;
            prevCounts = {
                valid_rows: existingBatch.valid_rows ?? 0,
                error_rows: existingBatch.error_rows ?? 0,
                warning_rows: existingBatch.warning_rows ?? 0,
            };
        } else {
            const totalRows = Number.isInteger(body?.totalRows) && body.totalRows > 0 ? body.totalRows : rows.length;
            const { data: batch, error: batchError } = await supabase
                .from('import_batches')
                .insert({
                    tenant_id: tenantId,
                    file_name: typeof body?.fileName === 'string' && body.fileName ? body.fileName : 'Import via Wizard',
                    total_rows: totalRows,
                    status: 'processing',
                    mapping_json: safeMapping,
                    defaults_json: { ownerId: defaultOwnerId, stageId: defaultStageId, tags: defaults.tags ?? [] },
                    created_by: user.id,
                })
                .select('id')
                .single();

            if (batchError || !batch) {
                console.error('Batch creation error:', batchError);
                return NextResponse.json({ error: 'Erro ao iniciar lote de importação. Verifique se as migrações foram rodadas.' }, { status: 500 });
            }
            batchId = batch.id;
        }

        const tags: string[] = Array.isArray(defaults.tags) ? defaults.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

        const rowResults: RowResult[] = [];
        // Linhas validas, na ordem; telefone canonico e unico dentro desta chamada
        const pending: { rowNumber: number; raw: any; lead: Record<string, any>; warnings: string[] }[] = [];
        const seenPhones = new Map<string, number>();
        let invalid = 0;
        let duplicates = 0;
        let failed = 0;
        let imported = 0;

        // 2. Processa as linhas
        for (let i = 0; i < rows.length; i++) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            const rowNumber = rowOffset + i + 1;
            const rowErrors: string[] = [];
            const rowWarnings: string[] = [];

            // Mesmo conjunto de chaves em todas as linhas: o upsert em lote manda
            // null pra chave ausente (e nao o default da coluna).
            const leadData: Record<string, any> = {
                nome: null,
                telefone: null,
                email: null,
                nicho: null,
                site_url: null,
                instagram_url: null,
                google_meu_negocio_url: null,
                notas: null,
                responsavel_id: defaultOwnerId,
                stage_id: defaultStageId, // null -> trigger poe na etapa de entrada do funil padrao
                tentativas: 0,
                custom_fields: {} as Record<string, any>,
            };

            let telefoneRaw: string | null = null;
            for (const { index, field } of fieldMap) {
                let value = row[index];
                if (value === null || value === undefined) continue;
                value = typeof value === 'string' ? value.trim() : String(value).trim();
                if (!value) continue;

                if (CUSTOM_FIELD_RE.test(field)) {
                    leadData.custom_fields[field] = value;
                } else if (field === 'notas') {
                    leadData.notas = leadData.notas ? leadData.notas + '\n' + value : value;
                } else if (field === 'telefone') {
                    telefoneRaw = value;
                } else if (field === 'responsavel_id') {
                    if (memberIds?.has(value)) {
                        leadData.responsavel_id = value;
                    } else {
                        rowWarnings.push(`Responsável "${value}" não encontrado; usado o padrão.`);
                    }
                } else if (field === 'email') {
                    leadData.email = value.toLowerCase();
                } else {
                    leadData[field] = value;
                }
            }

            // Tags: cold_leads nao tem coluna de tags, entao vao nas notas
            if (tags.length > 0) {
                const tagString = `Tags: ${tags.join(', ')}`;
                leadData.notas = leadData.notas ? leadData.notas + '\n' + tagString : tagString;
            }

            // nicho NOT NULL: une apelidos e casa com existente; vazio vira "Não informado"
            leadData.nicho = canonicalizeNichoOrDefault(leadData.nicho, existingNichos);
            if (!existingNichos.some((e) => nichoKey(e) === nichoKey(leadData.nicho))) {
                existingNichos.push(leadData.nicho);
            }

            // Validacao: nome e telefone (NOT NULL) obrigatorios
            if (!leadData.nome) rowErrors.push('Nome é obrigatório');
            if (!telefoneRaw) {
                rowErrors.push('Telefone é obrigatório');
            } else {
                const telefone = canonicalPhoneOrNull(telefoneRaw);
                if (!telefone) rowErrors.push(`Telefone inválido (${telefoneRaw})`);
                else leadData.telefone = telefone;
            }

            // tenant_id sempre do servidor, depois do mapeamento
            leadData.tenant_id = tenantId;

            if (rowErrors.length > 0) {
                invalid++;
                rowResults.push({
                    batch_id: batchId, row_number: rowNumber, status: 'error',
                    errors: rowErrors, warnings: rowWarnings.length ? rowWarnings : null,
                    raw_json: row, normalized_json: leadData, lead_id: null,
                });
                continue;
            }

            const firstRow = seenPhones.get(leadData.telefone);
            if (firstRow !== undefined) {
                duplicates++;
                rowResults.push({
                    batch_id: batchId, row_number: rowNumber, status: 'skipped',
                    errors: [`Telefone repetido na planilha (igual à linha ${firstRow})`],
                    warnings: rowWarnings.length ? rowWarnings : null,
                    raw_json: row, normalized_json: leadData, lead_id: null,
                });
                continue;
            }
            seenPhones.set(leadData.telefone, rowNumber);
            pending.push({ rowNumber, raw: row, lead: leadData, warnings: rowWarnings });
        }

        // 3. Insere em blocos de 500. Telefone que ja existe no tenant e ignorado pelo
        // indice unico (tenant_id, telefone) e conta como duplicado. Sem status: o
        // trigger deriva da etapa.
        for (const part of chunk(pending, INSERT_CHUNK)) {
            const { data: inserted, error: insertError } = await supabase
                .from('cold_leads')
                .upsert(part.map((p) => p.lead), { onConflict: 'tenant_id,telefone', ignoreDuplicates: true })
                .select('id, telefone');

            if (insertError) {
                console.error('Batch import chunk error:', insertError);
                failed += part.length;
                for (const p of part) {
                    rowResults.push({
                        batch_id: batchId, row_number: p.rowNumber, status: 'error',
                        errors: [`Erro ao gravar: ${insertError.message}`],
                        warnings: p.warnings.length ? p.warnings : null,
                        raw_json: p.raw, normalized_json: p.lead, lead_id: null,
                    });
                }
                continue;
            }

            const idByPhone = new Map<string, string>();
            for (const r of inserted ?? []) idByPhone.set(String(r.telefone), String(r.id));
            for (const p of part) {
                const leadId = idByPhone.get(p.lead.telefone) ?? null;
                if (leadId) imported++;
                else duplicates++;
                rowResults.push({
                    batch_id: batchId, row_number: p.rowNumber,
                    status: leadId ? 'imported' : 'skipped',
                    errors: leadId ? null : ['Já existe um lead com esse telefone'],
                    warnings: p.warnings.length ? p.warnings : null,
                    raw_json: p.raw, normalized_json: p.lead, lead_id: leadId,
                });
            }
        }

        // 4. Resultado por linha (auditoria). Os leads ja foram gravados: falha aqui
        // nao desfaz a importacao, mas volta como aviso em vez de ser ignorada.
        const warnings: string[] = [];
        rowResults.sort((a, b) => a.row_number - b.row_number);
        for (const part of chunk(rowResults, INSERT_CHUNK)) {
            const { error: auditError } = await supabase.from('import_row_results').insert(part);
            if (auditError) {
                console.error('Import row results error:', auditError);
                warnings.push(`Não foi possível salvar o detalhe de ${part.length} linhas: ${auditError.message}`);
            }
        }

        // 5. Atualiza o lote (soma com as chamadas anteriores do mesmo lote)
        const totals = {
            valid_rows: prevCounts.valid_rows + imported,
            error_rows: prevCounts.error_rows + invalid + failed,
            warning_rows: prevCounts.warning_rows + duplicates, // duplicados ignorados
        };
        const batchStatus = !isFinal
            ? 'processing'
            : (totals.valid_rows === 0 && totals.error_rows > 0 ? 'failed' : 'completed');
        const { error: batchUpdateError } = await supabase
            .from('import_batches')
            .update({ ...totals, status: batchStatus })
            .eq('id', batchId)
            .eq('tenant_id', tenantId);
        if (batchUpdateError) {
            console.error('Batch update error:', batchUpdateError);
            warnings.push(`Não foi possível atualizar o lote de importação: ${batchUpdateError.message}`);
        }

        const rowErrors = rowResults
            .filter((r) => r.status === 'error')
            .slice(0, MAX_ERRORS_IN_RESPONSE)
            .map((r) => `Linha ${r.row_number}: ${(r.errors ?? []).join('; ')}`);

        if (imported === 0 && failed > 0) {
            return NextResponse.json({
                error: 'Erro ao gravar os leads deste lote.',
                imported, duplicates, invalid, failed, batchId, errors: rowErrors, warnings,
            }, { status: 500 });
        }

        return NextResponse.json({
            message: 'Importação finalizada',
            imported,
            duplicates,
            invalid,
            failed,
            batchId,
            errors: rowErrors,
            warnings,
        });

    } catch (err: any) {
        console.error('Batch import error:', err);
        return NextResponse.json({ error: 'Erro interno do servidor: ' + err.message }, { status: 500 });
    }
}
