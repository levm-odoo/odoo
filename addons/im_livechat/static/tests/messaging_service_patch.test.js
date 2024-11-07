import { contains, onRpcBefore, start, startServer } from "@mail/../tests/mail_test_helpers";
import { withGuest } from "@mail/../tests/mock_server/mail_mock_server";
import { describe, test } from "@odoo/hoot";
import {
    asyncStep,
    Command,
    mockService,
    serverState,
    waitForSteps,
} from "@web/../tests/web_test_helpers";

import { rpc } from "@web/core/network/rpc";
import { defineLivechatModels } from "./livechat_test_helpers";

describe.current.tags("desktop");
defineLivechatModels();

test("Notify message received out of focus", async () => {
    const pyEnv = await startServer();
    const guestId = pyEnv["mail.guest"].create({ name: "Visitor" });
    const channelId = pyEnv["discuss.channel"].create({
        name: "Livechat 1",
        channel_type: "livechat",
        channel_member_ids: [
            Command.create({ partner_id: serverState.partnerId }),
            Command.create({ guest_id: guestId }),
        ],
    });
    onRpcBefore("/mail/data", async (args) => {
        if (args.init_messaging) {
<<<<<<< master
            asyncStep(`/mail/data - ${JSON.stringify(args)}`);
||||||| 760a6df27f099a596ed35efde41f7fc2b6479fb6
            step(`/mail/action - ${JSON.stringify(args)}`);
=======
            step(`/mail/data - ${JSON.stringify(args)}`);
>>>>>>> 0eea914ec97919688ced2176325e44df8e2c5d63
        }
    });
    mockService("presence", { isOdooFocused: () => false });
    await start();
<<<<<<< master
    await waitForSteps([
||||||| 760a6df27f099a596ed35efde41f7fc2b6479fb6
    await assertSteps([
        `/mail/action - ${JSON.stringify({
=======
    await assertSteps([
>>>>>>> 0eea914ec97919688ced2176325e44df8e2c5d63
        `/mail/data - ${JSON.stringify({
            init_messaging: {},
            failures: true,
            systray_get_activities: true,
            context: {
                lang: "en",
                tz: "taht",
                uid: serverState.userId,
                allowed_company_ids: [1],
            },
        })}`,
    ]);
    // send after init_messaging because bus subscription is done after init_messaging
    await withGuest(guestId, () =>
        rpc("/mail/message/post", {
            post_data: {
                body: "Hello",
                message_type: "comment",
                subtype_xmlid: "mail.mt_comment",
            },
            thread_model: "discuss.channel",
            thread_id: channelId,
        })
    );
    await contains(".o_notification:has(.o_notification_bar.bg-info)", { text: "Hello" });
});
