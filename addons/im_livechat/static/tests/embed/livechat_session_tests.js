/* @odoo-module */

import { startServer } from "@bus/../tests/helpers/mock_python_environment";

import { loadDefaultConfig, start } from "@im_livechat/../tests/embed/helper/test_utils";
import { LivechatButton } from "@im_livechat/embed/core_ui/livechat_button";

import { click, contains, insertText } from "@mail/../tests/helpers/test_utils";

import { mockTimeout, triggerHotkey } from "@web/../tests/helpers/utils";

QUnit.module("livechat session");

QUnit.test("Session is reset after failing to persist the channel", async (assert) => {
    await startServer();
    await loadDefaultConfig();
    const { advanceTime } = mockTimeout();
    start({
        mockRPC(route, args) {
            if (route === "/im_livechat/get_session" && args.persisted) {
                return false;
            }
        },
    });
    await click(".o-livechat-LivechatButton");
    await insertText(".o-mail-Composer-input", "Hello World!");
    triggerHotkey("Enter");
    await contains(".o_notification:contains(No available collaborator, please try again later.)");
    await contains(".o-livechat-LivechatButton");
    await advanceTime(LivechatButton.DEBOUNCE_DELAY + 10);
    await click(".o-livechat-LivechatButton");
    await contains(".o-mail-ChatWindow");
});

QUnit.test("Thread state is saved on the session", async (assert) => {
    await startServer();
    await loadDefaultConfig();
    const env = await start();
    await click(".o-livechat-LivechatButton");
    await contains(".o-mail-ChatWindow-content");
    assert.strictEqual(env.services["im_livechat.livechat"].sessionCookie.state, "open");
    await click(".o-mail-ChatWindow-header");
    await contains(".o-mail-ChatWindow-content", 0);
    assert.strictEqual(env.services["im_livechat.livechat"].sessionCookie.state, "folded");
    await click(".o-mail-ChatWindow-header");
    await contains(".o-mail-ChatWindow-content");
    assert.strictEqual(env.services["im_livechat.livechat"].sessionCookie.state, "open");
});

QUnit.test("Seen message is saved on the session", async (assert) => {
    await startServer();
    await loadDefaultConfig();
    const env = await start();
    await click(".o-livechat-LivechatButton");
    assert.notOk(env.services["im_livechat.livechat"].sessionCookie.seen_message_id);
    await insertText(".o-mail-Composer-input", "Hello World!");
    triggerHotkey("Enter");
    await contains(".o-mail-Message", 2);
    assert.strictEqual(
        env.services["im_livechat.livechat"].sessionCookie.seen_message_id,
        env.services["im_livechat.livechat"].thread.newestMessage.id
    );
});
