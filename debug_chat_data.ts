const { getConversations } = require('./frontend/app/actions');

async function test() {
    console.log("Fetching conversations...");
    const res = await getConversations();

    if (!res.success) {
        console.error("Error:", res.error);
        return;
    }

    const convs = res.data;
    console.log(`Found ${convs.length} conversations.`);

    // Check first conversation with messages
    const convWithMsg = convs.find(c => c.messages && c.messages.length > 0);

    if (convWithMsg) {
        console.log(`Deal: ${convWithMsg.title} (ID: ${convWithMsg.id})`);
        console.log(`Messages Count: ${convWithMsg.messages.length}`);
        console.log("First Message:", convWithMsg.messages[0]);
    } else {
        console.log("No conversations with messages found via getConversations.");
    }
}

test();
