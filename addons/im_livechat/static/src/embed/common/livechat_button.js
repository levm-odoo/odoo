import { Component, useExternalListener, useRef, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";
import { debounce } from "@web/core/utils/timing";

const LIVECHAT_BUTTON_SIZE = 56;

export class LivechatButton extends Component {
    static template = "im_livechat.LivechatButton";
    static props = {};
    static DEBOUNCE_DELAY = 500;

    setup() {
        this.store = useState(useService("mail.store"));
        /** @type {import('@im_livechat/embed/common/livechat_service').LivechatService} */
        this.livechatService = useService("im_livechat.livechat");
        this.onClick = debounce(this.onClick.bind(this), LivechatButton.DEBOUNCE_DELAY, {
            leading: true,
        });
        this.ref = useRef("button");
        // this.position = useState({
        //     left: `calc(97% - ${LIVECHAT_BUTTON_SIZE}px)`,
        //     top: `calc(97% - ${LIVECHAT_BUTTON_SIZE}px)`,
        // });
        this.state = useState({
            animateNotification: this.isShown,
            hasAlreadyMovedOnce: false,
        });
        useExternalListener(document.body, "scroll", this._onScroll, { capture: true });
    }

    _onScroll(ev) {
        if (!this.ref.el || this.state.hasAlreadyMovedOnce) {
            return;
        }
        const container = ev.target;
        this.position.top =
            container.scrollHeight - container.scrollTop === container.clientHeight
                ? `calc(93% - ${LIVECHAT_BUTTON_SIZE}px)`
                : `calc(97% - ${LIVECHAT_BUTTON_SIZE}px)`;
    }

    onClick() {
        this.state.animateNotification = false;
        this.livechatService.open();
    }

    get isShown() {
        return this.store.livechat_available && this.store.activeLivechats.length === 0;
    }
}
