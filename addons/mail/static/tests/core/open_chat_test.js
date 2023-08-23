/* @odoo-module */

import { Command } from "@mail/../tests/helpers/command";
import { afterNextRender, start, startServer } from "@mail/../tests/helpers/test_utils";

import { makeFakeNotificationService } from "@web/../tests/helpers/mock_services";

QUnit.module("Open Chat test", {});

QUnit.test("openChat: display notification for partner without user", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    const { env } = await start({
        services: {
            notification: makeFakeNotificationService((message) => {
                assert.step("notification");
                assert.strictEqual(
                    message,
                    "You can only chat with partners that have a dedicated user."
                );
            }),
        },
    });
    await env.services["mail.thread"].openChat({ partnerId });
    assert.verifySteps(["notification"]);
});

QUnit.test("openChat: display notification for wrong user", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["res.users"].create({});
    const { env } = await start({
        services: {
            notification: makeFakeNotificationService((message) => {
                assert.step("notification");
                assert.strictEqual(message, "You can only chat with existing users.");
            }),
        },
    });
    // userId not in the server data
    await env.services["mail.thread"].openChat({ userId: 4242 });
    assert.verifySteps(["notification"]);
});

QUnit.test("openChat: open new chat for user", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["res.users"].create({ partner_id: partnerId });
    const { env } = await start();
    assert.containsNone(document.body, ".o-mail-ChatWindow");
    await afterNextRender(() => {
        env.services["mail.thread"].openChat({ partnerId });
    });
    assert.containsOnce(document.body, ".o-mail-ChatWindow");
});

QUnit.test("openChat: open existing chat for user", async (assert) => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({});
    pyEnv["res.users"].create({ partner_id: partnerId });
    pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({
                partner_id: pyEnv.currentPartnerId,
                fold_state: "open",
                is_minimized: true,
            }),
            Command.create({ partner_id: partnerId }),
        ],
        channel_type: "chat",
    });
    const { env } = await start();
    assert.containsOnce(document.body, ".o-mail-ChatWindow");
    await afterNextRender(() => {
        env.services["mail.thread"].openChat({ partnerId });
    });
    assert.containsOnce(document.body, ".o-mail-ChatWindow");
});
