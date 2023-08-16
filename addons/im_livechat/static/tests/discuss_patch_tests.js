/* @odoo-module */

import { Command } from "@mail/../tests/helpers/command";
import {
    afterNextRender,
    click,
    contains,
    insertText,
    start,
    startServer,
} from "@mail/../tests/helpers/test_utils";

QUnit.module("discuss (patch)");

QUnit.test("No call buttons", async (assert) => {
    const pyEnv = await startServer();
    const guestId = pyEnv["mail.guest"].create({ name: "Visitor 11" });
    pyEnv["discuss.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            Command.create({ guest_id: guestId }),
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone($, ".o-mail-Discuss-header button[title='Start a Call']");
    assert.containsNone($, ".o-mail-Discuss-header button[title='Show Call Settings']");
});

QUnit.test("No reaction button", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        anonymous_name: "Visitor 11",
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ guest_id: pyEnv["mail.guest"].create({ name: "Visitor" }) }),
        ],
    });
    pyEnv["mail.message"].create({
        body: "not empty",
        model: "discuss.channel",
        res_id: channelId,
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await click(".o-mail-Message");
    assert.containsNone($, "[title='Add a Reaction']");
});

QUnit.test("No reply button", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        anonymous_name: "Visitor 11",
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ guest_id: pyEnv["mail.guest"].create({ name: "Visitor" }) }),
        ],
    });
    pyEnv["mail.message"].create({
        body: "not empty",
        model: "discuss.channel",
        res_id: channelId,
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    await click(".o-mail-Message");
    assert.containsNone($, "[title='Reply']");
});

QUnit.test("add livechat in the sidebar on visitor sending first message", async (assert) => {
    const pyEnv = await startServer();
    pyEnv["res.users"].write([pyEnv.currentUserId], { im_status: "online" });
    const countryId = pyEnv["res.country"].create({ code: "be", name: "Belgium" });
    const livechatChannelId = pyEnv["im_livechat.channel"].create({
        user_ids: [pyEnv.currentUserId],
    });
    const guestId = pyEnv["mail.guest"].create({ name: "Visitor (Belgium)" });
    const channelId = pyEnv["discuss.channel"].create({
        anonymous_name: "Visitor (Belgium)",
        channel_member_ids: [
            [0, 0, { is_pinned: false, partner_id: pyEnv.currentPartnerId }],
            Command.create({ guest_id: guestId }),
        ],
        channel_type: "livechat",
        country_id: countryId,
        livechat_channel_id: livechatChannelId,
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { env, openDiscuss } = await start();
    await openDiscuss();
    assert.containsNone($, ".o-mail-DiscussSidebarCategory-livechat");
    // simulate livechat visitor sending a message
    const [channel] = pyEnv["discuss.channel"].searchRead([["id", "=", channelId]]);
    await afterNextRender(() =>
        pyEnv.withGuest(guestId, () =>
            env.services.rpc("/im_livechat/chat_post", {
                uuid: channel.uuid,
                message_content: "new message",
            })
        )
    );
    assert.containsOnce($, ".o-mail-DiscussSidebarCategory-livechat");
    assert.containsOnce(
        $,
        ".o-mail-DiscussSidebarCategory-livechat + .o-mail-DiscussSidebarChannel"
    );
    assert.containsOnce(
        $,
        ".o-mail-DiscussSidebarCategory-livechat + .o-mail-DiscussSidebarChannel:contains(Visitor (Belgium))"
    );
});

QUnit.test("reaction button should not be present on livechat", async (assert) => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        anonymous_name: "Visitor 11",
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
        channel_member_ids: [
            Command.create({ partner_id: pyEnv.currentPartnerId }),
            Command.create({ guest_id: pyEnv["mail.guest"].create({ name: "Visitor" }) }),
        ],
    });
    const { insertText, openDiscuss } = await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "Test");
    await click(".o-mail-Composer-send:not(:disabled)");
    await click(".o-mail-Message");
    assert.containsNone($, "[title='Add a Reaction']");
});

QUnit.test("invite button should be present on livechat", async (assert) => {
    const pyEnv = await startServer();
    const guestId = pyEnv["mail.guest"].create({ name: "Visitor 11" });
    const channelId = pyEnv["discuss.channel"].create({
        anonymous_name: "Visitor 11",
        channel_member_ids: [
            [0, 0, { partner_id: pyEnv.currentPartnerId }],
            Command.create({ guest_id: guestId }),
        ],
        channel_type: "livechat",
        livechat_operator_id: pyEnv.currentPartnerId,
    });
    const { openDiscuss } = await start();
    await openDiscuss(channelId);
    assert.containsOnce($, ".o-mail-Discuss button[title='Add Users']");
});

QUnit.test(
    "livechats are sorted by last activity time in the sidebar: most recent at the top",
    async (assert) => {
        const pyEnv = await startServer();
        const guestId_1 = pyEnv["mail.guest"].create({ name: "Visitor 11" });
        const guestId_2 = pyEnv["mail.guest"].create({ name: "Visitor 12" });
        pyEnv["discuss.channel"].create([
            {
                anonymous_name: "Visitor 11",
                channel_member_ids: [
                    [
                        0,
                        0,
                        {
                            last_interest_dt: "2021-01-01 10:00:00",
                            partner_id: pyEnv.currentPartnerId,
                        },
                    ],
                    Command.create({ guest_id: guestId_1 }),
                ],
                channel_type: "livechat",
                livechat_operator_id: pyEnv.currentPartnerId,
            },
            {
                anonymous_name: "Visitor 12",
                channel_member_ids: [
                    [
                        0,
                        0,
                        {
                            last_interest_dt: "2021-02-01 10:00:00",
                            partner_id: pyEnv.currentPartnerId,
                        },
                    ],
                    Command.create({ guest_id: guestId_2 }),
                ],
                channel_type: "livechat",
                livechat_operator_id: pyEnv.currentPartnerId,
            },
        ]);
        const { openDiscuss } = await start();
        await openDiscuss();
        await contains(".o-mail-DiscussSidebarChannel:eq(0):contains(Visitor 12)");
        await contains(".o-mail-DiscussSidebarChannel:eq(1):contains(Visitor 11)");
        // post a new message on the last channel
        await click(".o-mail-DiscussSidebarChannel:eq(1)");
        await insertText(".o-mail-Composer-input", "Blabla");
        await click(".o-mail-Composer-send:not(:disabled)");
        await contains(".o-mail-DiscussSidebarChannel", 2);
        await contains(".o-mail-DiscussSidebarChannel:eq(0):contains(Visitor 11)");
        await contains(".o-mail-DiscussSidebarChannel:eq(1):contains(Visitor 12)");
    }
);
