'use server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function finishSetup(formData: FormData) {
    const cookieStore = await cookies()

    // 1. Cria o cliente do Supabase lendo os cookies do navegador
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    // Em Server Actions, apenas tentamos setar, mas ignoramos erros se não der
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // O middleware cuida da atualização da sessão
                    }
                },
            },
        }
    )

    // 2. Verifica quem é o usuário
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        console.error('Erro de Auth:', authError)
        throw new Error('Sessão inválida ou expirada. Faça login novamente.')
    }

    // 3. Captura os dados do formulário
    const fullName = formData.get('fullName') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (password !== confirmPassword) {
        throw new Error('As senhas não coincidem.')
    }

    // 4. Atualiza a senha
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) throw new Error('Erro ao atualizar senha: ' + updateError.message)

    // 5. Atualiza o nome no perfil
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id)

    if (profileError) throw new Error('Erro ao atualizar perfil: ' + profileError.message)

    // 6. Marcar convite como aceito (Usando Service Role pois o usuário comum pode não ter permissão de escrita em invites)
    const supabaseAdmin = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            cookies: {
                getAll() { return [] },
                setAll() { }
            }
        }
    )

    // Busca o convite pelo email do usuário logado
    const { error: inviteError } = await supabaseAdmin
        .from('team_invites')
        .update({
            status: 'accepted',
            accepted_at: new Date().toISOString()
        })
        .eq('email', user.email)
        .eq('status', 'pending')

    if (inviteError) {
        console.error("Erro ao marcar convite como aceito:", inviteError)
        // Não vamos travar o fluxo se isso falhar, mas é bom logar
    }

    // 7. Sucesso! Vai pro Dashboard
    redirect('/')
}
