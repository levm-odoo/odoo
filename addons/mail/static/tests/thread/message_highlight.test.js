import {
    click,
    defineMailModels,
    isInViewportOf,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { Thread } from "@mail/core/common/thread";
import { describe, test } from "@odoo/hoot";
<<<<<<< saas-18.1
import { delay, tick } from "@odoo/hoot-dom";
||||||| 19076c99bf075253492eb24117849fd1a8483bc5
import { tick } from "@odoo/hoot-dom";
=======
import { advanceTime, Deferred, tick } from "@odoo/hoot-dom";
>>>>>>> 0fe43b77f91ba6012e6b1c13571332b646a322cb
import { patchWithCleanup } from "@web/../tests/web_test_helpers";

defineMailModels();
describe.current.tags("desktop");

test("can highlight messages that are not yet loaded", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "general" });
    let middleMessageId;
    for (let i = 0; i < 200; i++) {
        const messageId = pyEnv["mail.message"].create({
            body: `message ${i}`,
            model: "discuss.channel",
            res_id: channelId,
        });
        if (i === 100) {
            middleMessageId = messageId;
        }
    }
    await pyEnv["discuss.channel"].set_message_pin(channelId, middleMessageId, true);
    await start();
    await openDiscuss(channelId);
    await tick(); // Wait for the scroll to first unread to complete.
    await isInViewportOf(".o-mail-Message:contains(message 199)", ".o-mail-Thread");
    await click("a[data-oe-type='highlight']");
    await isInViewportOf(".o-mail-Message:contains(message 100)", ".o-mail-Thread");
});

test("can highlight message (slow ref registration)", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "general" });
    let middleMessageId;
    for (let i = 0; i < 200; i++) {
        const messageId = pyEnv["mail.message"].create({
            body: `message ${i}`,
            model: "discuss.channel",
            res_id: channelId,
        });
        if (i === 100) {
            middleMessageId = messageId;
        }
    }
    await pyEnv["discuss.channel"].set_message_pin(channelId, middleMessageId, true);
    let slowRegisterMessageDef;
    patchWithCleanup(Thread.prototype, {
<<<<<<< saas-18.1
        async registerMessageRef() {
            if (slowRegisterMessageRef) {
                // Ensure scroll is made even when messages are mounted later.
                await delay(250);
            }
            super.registerMessageRef(...arguments);
||||||| 19076c99bf075253492eb24117849fd1a8483bc5
        async registerMessageRef() {
            if (slowRegisterMessageRef) {
                // Ensure scroll is made even when messages are mounted later.
                await new Promise((res) => setTimeout(res, 250));
            }
            super.registerMessageRef(...arguments);
=======
        async registerMessageRef(...args) {
            // Ensure scroll is made even when messages are mounted later.
            await slowRegisterMessageDef;
            return super.registerMessageRef(...args);
>>>>>>> 0fe43b77f91ba6012e6b1c13571332b646a322cb
        },
    });
    await start();
    await openDiscuss(channelId);
    await tick(); // Wait for the scroll to first unread to complete.
    await isInViewportOf(".o-mail-Message:contains(message 199)", ".o-mail-Thread");
    slowRegisterMessageDef = new Deferred();
    await click("a[data-oe-type='highlight']");
    await advanceTime(1000);
    slowRegisterMessageDef.resolve();
    await isInViewportOf(".o-mail-Message:contains(message 100)", ".o-mail-Thread");
});
