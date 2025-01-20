import {
    click,
    contains,
    defineMailModels,
    insertText,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { beforeEach, describe, test } from "@odoo/hoot";
import { mockDate } from "@odoo/hoot-mock";
import { Command, patchWithCleanup, serverState } from "@web/../tests/web_test_helpers";

import { Composer } from "@mail/core/common/composer";
import { press } from "@odoo/hoot-dom";

describe.current.tags("desktop");
defineMailModels();

beforeEach(() => {
    // Simulate real user interactions
    patchWithCleanup(Composer.prototype, {
        isEventTrusted() {
            return true;
        },
    });
});

test.skip('display command suggestions on typing "/"', async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_type: "channel",
    });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-SuggestionList");
    await contains(".o-mail-SuggestionList .o-open", { count: 0 });
    await insertText(".o-mail-Composer-input", "/");
    await contains(".o-mail-SuggestionList .o-open");
});

test.skip("use a command for a specific channel type", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ channel_type: "chat" });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-SuggestionList");
    await contains(".o-mail-SuggestionList .o-open", { count: 0 });
    await contains(".o-mail-Composer-input", { text: "" });
    await insertText(".o-mail-Composer-input", "/");
    await click(".o-mail-Suggestion strong", { text: "who" });
    await contains(".o-mail-Composer-input", { text: "/who " });
});

test.skip("command suggestion should only open if command is the first character", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_type: "channel",
    });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-SuggestionList");
    await contains(".o-mail-SuggestionList .o-open", { count: 0 });
    await contains(".o-mail-Composer-input", { text: "" });
    await insertText(".o-mail-Composer-input", "bluhbluh ");
    await contains(".o-mail-Composer-input", { text: "bluhbluh " });
    await insertText(".o-mail-Composer-input", "/");
    // weak test, no guarantee that we waited long enough for the potential list to open
    await contains(".o-mail-SuggestionList .o-open", { count: 0 });
});

test.skip("Sort partner suggestions by recent chats", async () => {
    mockDate("2023-01-03 12:00:00"); // so that it's after last interest (mock server is in 2019 by default!)
    const pyEnv = await startServer();
    const [partner_1, partner_2, partner_3] = pyEnv["res.partner"].create([
        { name: "User 1" },
        { name: "User 2" },
        { name: "User 3" },
    ]);
    pyEnv["res.users"].create([
        { partner_id: partner_1 },
        { partner_id: partner_2 },
        { partner_id: partner_3 },
    ]);
    pyEnv["discuss.channel"].create([
        {
            name: "General",
            channel_type: "channel",
            channel_member_ids: [
                Command.create({ partner_id: serverState.partnerId }),
                Command.create({ partner_id: partner_1 }),
                Command.create({ partner_id: partner_2 }),
                Command.create({ partner_id: partner_3 }),
            ],
        },
        {
            channel_member_ids: [
                Command.create({
                    last_interest_dt: "2023-01-01 00:00:00",
                    partner_id: serverState.partnerId,
                }),
                Command.create({ partner_id: partner_1 }),
            ],
            channel_type: "chat",
        },
        {
            channel_member_ids: [
                Command.create({
                    last_interest_dt: "2023-01-01 00:00:10",
                    partner_id: serverState.partnerId,
                }),
                Command.create({ partner_id: partner_2 }),
            ],
            channel_type: "chat",
        },
        {
            channel_member_ids: [
                Command.create({
                    last_interest_dt: "2023-01-01 00:00:20",
                    partner_id: serverState.partnerId,
                }),
                Command.create({ partner_id: partner_3 }),
            ],
            channel_type: "chat",
        },
    ]);
    await start();
    await openDiscuss();
    await click(".o-mail-DiscussSidebarChannel", { text: "User 2" });
    await insertText(".o-mail-Composer-input", "This is a test");
    await press("Enter");
    await contains(".o-mail-Message-content", { text: "This is a test" });
    await click(".o-mail-DiscussSidebarChannel", { text: "General" });
    await insertText(".o-mail-Composer-input[placeholder='Message #General…']", "@");
    await insertText(".o-mail-Composer-input", "User");
    await contains(".o-mail-Suggestion strong", { count: 3 });
    await contains(":nth-child(1 of .o-mail-Suggestion) strong", { text: "User 2" });
    await contains(":nth-child(2 of .o-mail-Suggestion) strong", { text: "User 3" });
    await contains(":nth-child(3 of .o-mail-Suggestion) strong", { text: "User 1" });
});

test.skip("mention suggestion are shown after deleting a character", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_type: "channel",
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: partnerId }),
        ],
    });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "@John D");
    await contains(".o-mail-Suggestion strong", { text: "John Doe" });
    await insertText(".o-mail-Composer-input", "a");
    await contains(".o-mail-Suggestion strong", { count: 0, text: "John D" });
    // Simulate pressing backspace
    const textarea = document.querySelector(".o-mail-Composer-input");
    textarea.value = textarea.value.slice(0, -1);
    await contains(".o-mail-Suggestion strong", { text: "John Doe" });
});

test.skip("command suggestion are shown after deleting a character", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "John Doe" });
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_type: "channel",
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: partnerId }),
        ],
    });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "/he");
    await contains(".o-mail-Suggestion strong", { text: "help" });
    await insertText(".o-mail-Composer-input", "e");
    await contains(".o-mail-Suggestion strong", { count: 0, text: "help" });
    // Simulate pressing backspace
    const textarea = document.querySelector(".o-mail-Composer-input");
    textarea.value = textarea.value.slice(0, -1);
    await contains(".o-mail-Suggestion strong", { text: "help" });
});

test.skip("mention suggestion displays OdooBot before archived partners", async () => {
    const pyEnv = await startServer();
    const partnerId = pyEnv["res.partner"].create({ name: "Jane", active: false });
    const channelId = pyEnv["discuss.channel"].create({
        name: "Our channel",
        channel_type: "group",
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ partner_id: partnerId }),
            Command.create({ partner_id: serverState.odoobotId }),
        ],
    });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "@");
    await contains(".o-mail-Suggestion", { count: 3 });
    await contains(".o-mail-Suggestion", {
        text: "Mitchell Admin",
        before: [
            ".o-mail-Suggestion",
            {
                text: "OdooBot",
                before: [".o-mail-Suggestion", { text: "Jane" }],
            },
        ],
    });
});
