/* @odoo-module */

import { Composer } from "@mail/core/common/composer";
import { Message as MessageModel } from "@mail/core/common/message_model";
import { Store } from "@mail/core/common/store_service";
import { threadActionsRegistry } from "@mail/core/common/thread_actions";
import { Thread } from "@mail/core/common/thread_model";
import { ThreadService } from "@mail/core/common/thread_service";

import { patch } from "@web/core/utils/patch";
import { SESSION_STATE } from "./livechat_service";

patch(Composer.prototype, {
    get allowUpload() {
        return false;
    },
});

patch(MessageModel.prototype, {
    get hasActions() {
        return false;
    },
});

patch(Thread.prototype, {
    get hasMemberList() {
        return false;
    },
});

patch(ThreadService.prototype, {
    async fetchNewMessages(thread) {
        if (
            thread.type === "livechat" &&
            this.env.services["im_livechat.livechat"].state !== SESSION_STATE.PERSISTED
        ) {
            return;
        }
        return super.fetchNewMessages(...arguments);
    },
});

patch(Store.prototype, {
    setup() {
        super.setup(...arguments);
        this.hasLinkPreviewFeature = false;
    },
});

const allowedThreadActions = new Set(["fold-chat-window", "close", "restart"]);
for (const [actionName] of threadActionsRegistry.getEntries()) {
    if (!allowedThreadActions.has(actionName)) {
        threadActionsRegistry.remove(actionName);
    }
}
threadActionsRegistry.addEventListener("UPDATE", ({ operation, key }) => {
    if (operation === "add" && !allowedThreadActions.has(key)) {
        threadActionsRegistry.remove(key);
    }
});
