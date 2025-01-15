import { ChatHub } from "@mail/core/common/chat_hub";
import { LivechatButton, LIVECHAT_BUTTON_SIZE } from "@im_livechat/embed/common/livechat_button";
import { patch } from "@web/core/utils/patch";
import { useExternalListener, useState } from "@odoo/owl";

ChatHub.components = { ...ChatHub.components, LivechatButton };

patch(ChatHub.prototype, {
    setup() {
        super.setup(...arguments);
        this.livechatState = useState({ hasAlreadyMovedOnce: false });
        useExternalListener(document.body, "scroll", this._onScroll, { capture: true });
    },
    _onScroll(ev) {
        if (!this.ref.el || this.state.hasAlreadyMovedOnce) {
            return;
        }
        const container = ev.target;
        this.position.top =
            container.scrollHeight - container.scrollTop === container.clientHeight
                ? `calc(93% - ${LIVECHAT_BUTTON_SIZE}px)`
                : `calc(97% - ${LIVECHAT_BUTTON_SIZE}px)`;
    },
});
