import {
    click,
    contains,
    defineMailModels,
    insertText,
    onRpcBefore,
    openDiscuss,
    start,
    startServer,
} from "@mail/../tests/mail_test_helpers";
import { Composer } from "@mail/core/common/composer";
import { beforeEach, describe, test } from "@odoo/hoot";
import { asyncStep, patchWithCleanup, waitForSteps } from "@web/../tests/web_test_helpers";

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

test('do not send typing notification on typing "/" command', async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "channel" });
    let testEnded = false;
    onRpcBefore("/discuss/channel/notify_typing", () => {
        if (!testEnded) {
            asyncStep("notify_typing");
        }
    });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "/");
    await waitForSteps([]); // No rpc done
    testEnded = true;
});

test.skip('do not send typing notification on typing after selecting suggestion from "/" command', async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "channel" });
    let testEnded = false;
    onRpcBefore("/discuss/channel/notify_typing", () => {
        if (!testEnded) {
            asyncStep("notify_typing");
        }
    });
    await start();
    await openDiscuss(channelId);
    await insertText(".o-mail-Composer-input", "/");
    await click(":nth-child(1 of .o-mail-Suggestion)");
    await contains(".o-mail-Suggestion strong", { count: 0 });
    await insertText(".o-mail-Composer-input", " is user?");
    await waitForSteps([]); // No rpc done"
    testEnded = true;
});

test("send is_typing on adding emoji", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({ name: "channel" });
    let testEnded = false;
    onRpcBefore("/discuss/channel/notify_typing", () => {
        if (!testEnded) {
            asyncStep("notify_typing");
        }
    });
    await start();
    await openDiscuss(channelId);
    await click("button[title='Add Emojis']");
    await insertText("input[placeholder='Search emoji']", "Santa Claus");
    await click(".o-Emoji", { text: "🎅" });
    await waitForSteps(["notify_typing"]);
    testEnded = true;
});

test.skip("add an emoji after a command", async () => {
    const pyEnv = await startServer();
    const channelId = pyEnv["discuss.channel"].create({
        name: "General",
        channel_type: "channel",
    });
    await start();
    await openDiscuss(channelId);
    await contains(".o-mail-Composer-input", { text: "" });
    await insertText(".o-mail-Composer-input", "/");
    await click(":nth-child(1 of .o-mail-Suggestion)");
    await contains(".o-mail-Composer-input", { text: "/who " });
    await click("button[title='Add Emojis']");
    await click(".o-Emoji", { text: "😊" });
    await contains(".o-mail-Composer-input", { text: "/who 😊" });
});
