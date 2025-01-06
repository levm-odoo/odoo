import { click, contains, openDiscuss, start, startServer } from "@mail/../tests/mail_test_helpers";
import { describe, test } from "@odoo/hoot";
import { Command, serverState } from "@web/../tests/web_test_helpers";
import { defineLivechatModels } from "./livechat_test_helpers";
import { withGuest } from "@mail/../tests/mock_server/mail_mock_server";
import { rpc } from "@web/core/network/rpc";

describe.current.tags("desktop");
defineLivechatModels();

test("closing a chat window with no message from admin side unpins it", async () => {
    const pyEnv = await startServer();
    const [partnerId_1, partnerId_2] = pyEnv["res.partner"].create([
        { name: "Partner 1" },
        { name: "Partner 2" },
    ]);
    pyEnv["res.users"].create([{ partner_id: partnerId_1 }, { partner_id: partnerId_2 }]);
    pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({
                unpin_dt: false,
                partner_id: serverState.partnerId,
            }),
            Command.create({ partner_id: partnerId_1 }),
        ],
        channel_type: "livechat",
    });
    pyEnv["discuss.channel"].create({
        channel_member_ids: [
            Command.create({
                unpin_dt: false,
                partner_id: serverState.partnerId,
            }),
            Command.create({ partner_id: partnerId_2 }),
        ],
        channel_type: "livechat",
    });
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-NotificationItem", { text: "Partner 2" });
    await click(".o-mail-ChatWindow-command[title*='Close Chat Window']", {
        parent: [".o-mail-ChatWindow", { text: "Partner 2" }],
    });
    await openDiscuss();
    await contains(".o-mail-DiscussSidebarChannel", { text: "Partner 1" });
    await contains(".o-mail-DiscussSidebarChannel", { count: 0, text: "Partner 2" });
});

test("Focus should not be stolen when a new livechat open", async () => {
    const pyEnv = await startServer();
    const [guestId1, guestId2] = pyEnv["mail.guest"].create([
        { name: "Visitor 11" },
        { name: "Visitor 12" },
    ]);
    const channelIds = pyEnv["discuss.channel"].create([
        {
            anonymous_name: "Visitor 11",
            channel_member_ids: [
                Command.create({
                    partner_id: serverState.partnerId,
                    last_interest_dt: "2021-01-03 10:00:00",
                }),
                Command.create({ guest_id: guestId1, last_interest_dt: "2021-01-03 10:00:00" }),
            ],
            channel_type: "livechat",
            livechat_operator_id: serverState.partnerId,
        },
        {
            anonymous_name: "Visitor 12",
            channel_member_ids: [
                Command.create({
                    partner_id: serverState.partnerId,
                    last_interest_dt: "2021-01-03 10:00:00",
                }),
                Command.create({ guest_id: guestId2, last_interest_dt: "2021-01-03 10:00:00" }),
            ],
            channel_type: "livechat",
            livechat_operator_id: serverState.partnerId,
        },
    ]);
    await start();
    await click(".o_menu_systray i[aria-label='Messages']");
    await click(".o-mail-NotificationItem", { text: "Visitor 11" });
    await contains(".o-mail-ChatWindow", { text: "Visitor 11" });
    await contains(".o-mail-Composer-input[placeholder='Message Visitor 11…']:focus");
    withGuest(guestId2, () =>
        rpc("/mail/message/post", {
            post_data: {
                body: "hu",
                message_type: "comment",
                subtype_xmlid: "mail.mt_comment",
            },
            thread_id: channelIds[1],
            thread_model: "discuss.channel",
        })
    );
    await contains(".o-mail-ChatWindow", { text: "Visitor 12" });
    await contains(".o-mail-ChatWindow:nth-child(2) .o-mail-Composer-input:focus");
});
