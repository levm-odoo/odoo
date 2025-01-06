import { contains, onRpcBefore, start, startServer } from "@mail/../tests/mail_test_helpers";
import { withGuest } from "@mail/../tests/mock_server/mail_mock_server";
import { describe, test } from "@odoo/hoot";
import {
    asyncStep,
    Command,
    mockService,
    patchWithCleanup,
    serverState,
    waitForSteps,
} from "@web/../tests/web_test_helpers";

import { browser } from "@web/core/browser/browser";
import { rpc } from "@web/core/network/rpc";
import { defineLivechatModels } from "./livechat_test_helpers";

describe.current.tags("mobile");
defineLivechatModels();

test("Fallback to Odoo notification on ServiceWorkerError", async () => {
    patchWithCleanup(browser, {
        Notification: class Notification {
            static get permission() {
                return "granted";
            }
            constructor() {
                throw new Error("ServiceWorkerRegistration error");
            }
        },
    });
    patchWithCleanup(window, {
        Notification: class Notification {
            static get permission() {
                return "granted";
            }
            constructor() {
                throw new Error("ServiceWorkerRegistration error");
            }
        },
    });
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
            asyncStep(`/mail/data - ${JSON.stringify(args)}`);
        }
    });
    mockService("presence", { isOdooFocused: () => false });
    await start();
    await waitForSteps([
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
                body: "Hello world!",
                message_type: "comment",
                subtype_xmlid: "mail.mt_comment",
            },
            thread_model: "discuss.channel",
            thread_id: channelId,
        })
    );
    await contains(".o_notification:has(.o_notification_bar.bg-info)", { text: "Hello world!" });
});
