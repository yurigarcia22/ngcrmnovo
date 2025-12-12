const { getMessages, getDeals } = require('./frontend/app/actions');

async function test() {
    console.log("Fetching deals...");
    const dealsRes = await getDeals();
    if (!dealsRes.success || !dealsRes.data) {
        console.error("Failed to fetch deals:", dealsRes.error);
        return;
    }

    const deals = dealsRes.data;
    console.log(`Found ${deals.length} deals.`);

    if (deals.length > 0) {
        const deal = deals[0];
        console.log(`Testing messages for Deal ID: ${deal.id} (${deal.title})`);

        const msgRes = await getMessages(deal.id);
        if (msgRes.success) {
            console.log(`Messages found: ${msgRes.data.length}`);
            if (msgRes.data.length > 0) {
                console.log("Sample message:", msgRes.data[0]);
            }
        } else {
            console.error("Failed to fetch messages:", msgRes.error);
        }
    }
}

test();
