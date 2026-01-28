import { createClient } from "@supabase/supabase-js";
import { addMinutes, addHours, subMinutes, setHours, setMinutes, isBefore, isAfter, startOfDay } from "date-fns";

export async function scheduleTaskNotifications(taskId: string, userId: string, dueDate: string, tenantId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const due = new Date(dueDate);

    // 1. Clear existing pending notifications for this task (to avoid duplicates or bad times)
    await supabase
        .from('notifications')
        .delete()
        .eq('task_id', taskId)
        .eq('sent_at', null); // Only delete pending ones

    // 2. Fetch User Settings
    const { data: settings } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

    // Default settings if not found
    const morningTimeStr = settings?.morning_time || '09:00:00';
    const advance30 = settings?.advance_30m_enabled !== false; // Default true
    const advance5 = settings?.advance_5m_enabled !== false;   // Default true

    const now = new Date();
    const notificationsToInsert = [];

    // Helper to parse time string "HH:MM:SS"
    const [mHour, mMinute] = morningTimeStr.split(':').map(Number);

    // --- A) Morning Alert ---
    // Morning alert happens on the DAY of the due date, at the specified morning time.
    // If due date is 2024-01-01 14:00, morning alert is 2024-01-01 09:00.
    const morningDate = new Date(due);
    morningDate.setHours(mHour, mMinute, 0, 0);

    // Only schedule if morning time is BEFORE the due time AND in the future
    // Also, if due time is 08:00 and morning is 09:00, maybe skipping is better? Rule said: "Manter morning_time fixo e se estiver depois do due_at, marcar morning como desnecessário"
    if (isBefore(morningDate, due) && isAfter(morningDate, now)) {
        notificationsToInsert.push({
            user_id: userId,
            task_id: taskId,
            kind: 'morning',
            title: 'Lembrete do Dia',
            message: `Você tem uma tarefa hoje: `, // Title will be appended dynamically or fetched? Better to store complete message. We need task title.
            scheduled_for: morningDate.toISOString(),
            tenant_id: tenantId
        });
    }

    // --- B) 30 Minutes Before ---
    if (advance30) {
        const date30 = subMinutes(due, 30);
        if (isAfter(date30, now)) {
            notificationsToInsert.push({
                user_id: userId,
                task_id: taskId,
                kind: 'before_30',
                title: 'Em 30 minutos',
                message: `Sua tarefa vence em breve.`,
                scheduled_for: date30.toISOString(),
                tenant_id: tenantId
            });
        }
    }



    // We need task details (title) to make messages better. 
    // Optimization: The caller might pass title, or we fetch it.
    // For now, let's fetch task title if we are inserting.

    // We need task details (title) to make messages better. 
    // Optimization: The caller might pass title, or we fetch it.
    // For now, let's fetch task title if we are inserting.

    const { data: task } = await supabase.from('tasks').select('description, title').eq('id', taskId).single();
    const taskTitle = task?.title || task?.description || 'Tarefa';

    // --- C) 5 Minutes Before ---
    if (advance5) {
        const date5 = subMinutes(due, 5);
        if (isAfter(date5, now)) {
            // Normal case: Time is in future
            notificationsToInsert.push({
                user_id: userId,
                task_id: taskId,
                kind: 'before_5',
                title: 'Em 5 minutos',
                message: `Começa em 5m: ${taskTitle}`,
                scheduled_for: date5.toISOString(),
                tenant_id: tenantId
            });
        } else if (isAfter(due, now)) {
            // Urgent case: We are within the 5 minute window, but task hasn't happened yet.
            // Notify immediately!
            notificationsToInsert.push({
                user_id: userId,
                task_id: taskId,
                kind: 'before_5',
                title: 'Atenção: Prazo Próximo',
                message: `Tarefa vence em menos de 5m: ${taskTitle}`,
                scheduled_for: new Date().toISOString(), // Immediate
                tenant_id: tenantId
            });
        }
    }

    if (notificationsToInsert.length > 0) {
        if (notificationsToInsert.some(n => n.kind === 'morning')) {
            notificationsToInsert.forEach(n => {
                if (n.kind === 'morning') n.message = `Você tem uma tarefa para hoje: ${taskTitle}`;
            });
        }
        if (notificationsToInsert.some(n => n.kind === 'before_30')) {
            notificationsToInsert.forEach(n => {
                if (n.kind === 'before_30') n.message = `Daqui a 30m: ${taskTitle}`;
            });
        }

        const { error } = await supabase.from('notifications').insert(notificationsToInsert);
        if (error) console.error("Error scheduling notifications:", error);
    }
}
