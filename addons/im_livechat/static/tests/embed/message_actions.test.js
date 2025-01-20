import { waitNotifications } from "@bus/../tests/bus_test_helpers";

import {
    defineLivechatModels,
    loadDefaultEmbedConfig,
} from "@im_livechat/../tests/livechat_test_helpers";
import {
    click,
    contains,
    insertText,
    start,
    startServer,
    triggerHotkey,
} from "@mail/../tests/mail_test_helpers";
import { describe, test } from "@odoo/hoot";

describe.current.tags("desktop");
defineLivechatModels();

test("Only two quick actions are shown", async () => {
    // This is desired because 2 actions share a same icon
    // "Add a reaction" and "View reactions".
    await startServer();
    await loadDefaultEmbedConfig();
    const env = await start({ authenticateAs: false });
    await click(".o-livechat-LivechatButton");
    await contains(".o-mail-ChatWindow");
    await insertText(".o-mail-Composer-input", "Hello World!");
    triggerHotkey("Enter");
    // message data from post contains no reaction, wait now to avoid overriding newer value later
    await waitNotifications([env, "discuss.channel/new_message"]);
    await click("[title='Add a Reaction']");
    await click(".o-mail-QuickReactionMenu button", { text: "😅" });
    await contains(".o-mail-MessageReaction", { text: "😅" });
    await contains(".o-mail-Message-actions i", { count: 3 });
    await contains("[title='Add a Reaction']");
    await contains("[title='Reply']");
    await contains("[title='Expand']");
    await click("[title='Expand']");
    await contains(".o-mail-Message-actions i, .o-mail-Message-moreMenu i", { count: 8 });
    await contains("[title='View Reactions']");
    await contains("[title='Mark as Unread']");
    await contains("[title='Edit']");
    await contains("[title='Delete']");
    await contains("[title='Copy Link']");
});
