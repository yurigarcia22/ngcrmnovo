const { createClient } = require('@supabase/supabase-js');

// Mock environment variables since we are running standalone
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://twsnyobgvwvuqjgemrca.supabase.co';
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3c255b2Jndnd1cWpnZW1yY2EiLCJ..." // I need to get this from environment or assume user has it.
// Actually I cannot read the env file directly via read_file safely if it's .env.local and I don't know the path precisely or if it's encrypted.
// I will try to read .env.local first to get the key.


if (!SERVICE_KEY) {
    console.error("Please set SUPABASE_SERVICE_ROLE_KEY env var");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function test() {
    console.log("Fetching deals with messages via Supabase Direct...");

    // Mimic the query in getConversations
    const { data: deals, error } = await supabase
        .from('deals')
        .select(`
            id,
            title,
            contacts (id, name),
            messages (
                id,
                content,
                media_url
            )
        `)
        .order('updated_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${deals.length} deals.`);

    deals.forEach(d => {
        console.log(`Deal: ${d.title} (${d.id})`);
        console.log(`Contact: ${d.contacts?.name}`);
        console.log(`Messages: ${d.messages ? d.messages.length : 0}`);
        if (d.messages && d.messages.length > 0) {
            console.log("  First msg:", d.messages[0].content);
            console.log("  Has media:", !!d.messages[0].media_url);
        }
    });
}

test();
