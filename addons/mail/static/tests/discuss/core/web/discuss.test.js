import {
    SIZES,
    assertSteps,
    click,
    contains,
    defineMailModels,
    insertText,
    onRpcBefore,
    openDiscuss,
    patchUiSize,
    start,
    startServer,
    step,
    triggerHotkey,
} from "@mail/../tests/mail_test_helpers";
import { describe, test } from "@odoo/hoot";
import { Command, onRpc, serverState } from "@web/../tests/web_test_helpers";

import { pick } from "@web/core/utils/objects";

describe.current.tags("desktop");
defineMailModels();

test("can create a new channel [REQUIRE FOCUS]", async () => {
    const pyEnv = await startServer();
    onRpcBefore((route, args) => {
        if (
            route.startsWith("/mail") ||
            route.startsWith("/discuss/channel/messages") ||
            route.startsWith("/discuss/search")
        ) {
            step(`${route} - ${JSON.stringify(args)}`);
        }
    });
    onRpc((params) => {
        if (params.model === "discuss.channel" && params.method === "channel_create") {
            step(
                `${params.route} - ${JSON.stringify(
                    pick(params, "args", "kwargs", "method", "model")
                )}`
            );
        }
    });
    await start();
    await assertSteps([
        `/mail/action - ${JSON.stringify({
            init_messaging: {},
            failures: true,
            systray_get_activities: true,
            context: { lang: "en", tz: "taht", uid: serverState.userId, allowed_company_ids: [1] },
        })}`,
    ]);
    await openDiscuss();
    await assertSteps([
        `/mail/data - ${JSON.stringify({
            channels_as_member: true,
            context: { lang: "en", tz: "taht", uid: serverState.userId, allowed_company_ids: [1] },
        })}`,
        '/mail/inbox/messages - {"limit":30}',
    ]);
    await insertText("input[placeholder='Find or start a conversation']", "abc");
    await contains(".o-mail-DiscussSidebarChannel", { count: 0 });
    await assertSteps([
        `/discuss/search - ${JSON.stringify({
            term: "abc",
        })}`,
    ]);
    await click(".o-mail-SearchThread-suggestion");
    await click(".form-check-label", { text: "Channel" });
    await click(".btn", { text: "Create" });
    await contains(".o-mail-DiscussSidebarChannel");
    await contains(".o-mail-Discuss-content .o-mail-Message", { count: 0 });
    const [channelId] = pyEnv["discuss.channel"].search([["name", "=", "abc"]]);
    const [selfMember] = pyEnv["discuss.channel.member"].search_read([
        ["channel_id", "=", channelId],
        ["partner_id", "=", serverState.partnerId],
    ]);
    await assertSteps([
        `/web/dataset/call_kw/discuss.channel/channel_create - ${JSON.stringify({
            args: ["abc", null],
            kwargs: {
                context: {
                    lang: "en",
                    tz: "taht",
                    uid: serverState.userId,
                    allowed_company_ids: [1],
                },
            },
            method: "channel_create",
            model: "discuss.channel",
        })}`,
        `/discuss/channel/messages - {"channel_id":${channelId},"limit":60,"around":${selfMember.new_message_separator}}`,
    ]);
});

test("can join a chat conversation", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Mario" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    onRpcBefore((route, args) => {
        if (route.startsWith("/mail") || route.startsWith("/discuss")) {
            step(`${route} - ${JSON.stringify(args)}`);
        }
    });
    onRpc((params) => {
        if (
            params.model === "discuss.channel" &&
            ["search_read", "channel_create", "channel_get"].includes(params.method)
        ) {
            step(
                `${params.route} - ${JSON.stringify(
                    pick(params, "args", "kwargs", "method", "model")
                )}`
            );
        }
    });
    await start();
    await assertSteps([
        `/mail/action - ${JSON.stringify({
            init_messaging: {},
            failures: true,
            systray_get_activities: true,
            context: { lang: "en", tz: "taht", uid: serverState.userId, allowed_company_ids: [1] },
        })}`,
    ]);
    await openDiscuss();
    await assertSteps([
        `/mail/data - ${JSON.stringify({
            channels_as_member: true,
            context: { lang: "en", tz: "taht", uid: serverState.userId, allowed_company_ids: [1] },
        })}`,
        '/mail/inbox/messages - {"limit":30}',
    ]);
    await insertText("input[placeholder='Find or start a conversation']", "mario");
    await contains(".o-mail-DiscussSidebarChannel", { count: 0 });
    await click(".o-mail-SearchThread-suggestion", { text: "Mario" });
    await contains(".o-mail-SearchThread-suggestion", { count: 0 });
    triggerHotkey("Enter");
    await contains(".o-mail-DiscussSidebarChannel");
    await contains(".o-mail-Message", { count: 0 });
    const channelId = pyEnv["discuss.channel"].search([["name", "=", "Mario, Mitchell Admin"]]);
    await assertSteps([
        `/discuss/search - {"term":"mario"}`,
        `/web/dataset/call_kw/discuss.channel/channel_get - ${JSON.stringify({
            args: [],
            kwargs: {
                partners_to: [partnerId],
                force_open: true,
                context: {
                    lang: "en",
                    tz: "taht",
                    uid: serverState.userId,
                    allowed_company_ids: [1],
                },
            },
            method: "channel_get",
            model: "discuss.channel",
        })}`,
        `/discuss/channel/messages - {"channel_id":${channelId},"limit":60,"around":0}`,
    ]);
});

test("can create a group chat conversation", async () => {
    const pyEnv = await startServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        { name: "Mario" },
        { name: "Luigi" },
    ]);
    pyEnv["res.users"].create([{ partner_id: partnerId_1 }, { partner_id: partnerId_2 }]);
    await start();
    await openDiscuss();
    await insertText("input[placeholder='Find or start a conversation']", "Friendly Friends");
    await click(".o-mail-SearchThread-suggestion", { text: "Create a new conversation" });
    await click(".o-mail-CreateThreadDialog button:contains(Invite People)");
    await click(".o-discuss-ChannelInvitation-selectable", { text: "Mario" });
    await click(".o-discuss-ChannelInvitation-selectable", { text: "Luigi" });
    await click(".btn", { text: "Create" });
    await contains(".o-mail-DiscussSidebarChannel");
    await contains(".o-mail-Message", { count: 0 });
});

test("mobile chat search should allow to create group chat", async () => {
    patchUiSize({ size: SIZES.SM });
    await start();
    await openDiscuss();
    await contains("button.active", { text: "Inbox" });
    await click("button", { text: "Chat" });
    await click("button", { text: "Start a conversation" });
    await insertText("input[placeholder='Start a conversation']", "Rainbow Panda");
    await click(".o-mail-SearchThread-suggestion:contains('Create a new group chat')");
    await contains(".modal-title:contains('Create Group Chat')");
});

test("chat search should not be visible when clicking outside of the field", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Panda" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    await start();
    await openDiscuss();
    await insertText("input[placeholder='Find or start a conversation']", "Panda");
    await contains(".o-mail-SearchThread-suggestion");
    await click(".o-mail-DiscussSidebar");
    await contains(".o-mail-SearchThread-suggestion", { count: 0 });
});

test("Chat is added to discuss on other tab that the one that joined", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Jerry Golay" });
    pyEnv["res.users"].create({ partner_id: partnerId });
    const env1 = await start({ asTab: true });
    const env2 = await start({ asTab: true });
    await openDiscuss(undefined, { target: env1 });
    await openDiscuss(undefined, { target: env2 });
    await insertText("input[placeholder='Find or start a conversation']", "Jer", { target: env1 });
    await click(".o-mail-SearchThread-suggestion", { text: "Jerry Golay", target: env1 });
    triggerHotkey("Enter");
    await contains(".o-mail-DiscussSidebarChannel", { target: env1, text: "Jerry Golay" });
    await contains(".o-mail-DiscussSidebarChannel", { target: env2, text: "Jerry Golay" });
});

test("no conversation selected when opening non-existing channel in discuss", async () => {
    await startServer();
    await start();
    await openDiscuss(200); // non-existing id
    await contains("h4", { text: "No conversation selected." });
    await contains(".o-mail-DiscussSidebarCategory-channel .oi-chevron-down");
    await click(".o-mail-DiscussSidebar .btn", { text: "Channels" }); // check no crash
    await contains(".o-mail-DiscussSidebarCategory-channel .oi-chevron-right");
});

test("can access portal partner profile from avatar popover", async () => {
    const pyEnv = await startServer();
    const joelPartnerId = pyEnv["res.partner"].create({
        name: "Joel",
        user_ids: [Command.create({ name: "Joel", share: true })],
    });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: joelPartnerId }),
        ],
    });
    pyEnv["mail.message"].create({
        author_id: joelPartnerId,
        body: "Hello!",
        message_type: "comment",
        model: "discuss.channel",
        res_id: channelId,
    });
    await start();
    await openDiscuss(channelId);
    await click(".o-mail-Message-avatar", {
        parent: [".o-mail-Message", { text: "Joel" }],
    });
    await click("button", { text: "View Profile" });
    await contains(".o_form_view");
    await contains(".o_field_widget[name='name'] .o_input", { value: "Joel" });
});

test("Preserve letter case and accents when creating channel from sidebar", async () => {
    await start();
    await openDiscuss();
    await insertText("input[placeholder='Find or start a conversation']", "Crème brûlée Fan Club");
    await click(".o-mail-SearchThread-suggestion");
    await click(".btn", { text: "Create" });
    await contains(".o-mail-Discuss-threadName", { value: "Crème brûlée Fan Club" });
});
