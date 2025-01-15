import { ImStatus } from "@mail/core/common/im_status";

import { Component, useEffect, useRef, useState } from "@odoo/owl";

import { CountryFlag } from "@mail/core/common/country_flag";
import { useHover } from "@mail/utils/common/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { useChildRef, useService } from "@web/core/utils/hooks";

class ChatBubblePreview extends Component {
    static props = ["chatWindow", "close"];
    static template = "mail.ChatBubblePreview";

    /** @returns {import("models").Thread} */
    get thread() {
        return this.props.chatWindow.thread;
    }

    get previewContent() {
        const lastMessage = this.thread?.newestPersistentOfAllMessage;
        if (!lastMessage) {
            return false;
        }
        return lastMessage.inlineBody;
    }
}

/**
 * @typedef {Object} Props
 * @extends {Component<Props, Env>}
 */
export class ChatBubble extends Component {
    static components = { CountryFlag, ImStatus };
    static props = ["chatWindow"];
    static template = "mail.ChatBubble";

    setup() {
        super.setup();
        this.store = useService("mail.store");
        const popoverRef = useChildRef();
        this.popover = usePopover(ChatBubblePreview, {
            animation: false,
            position: "left-middle",
            popoverClass:
                "o-mail-chatBubble-preview dropdown-menu bg-view border-0 p-0 overflow-visible rounded-3 mx-1",
            onClose: () => (this.state.showClose = false),
            ref: popoverRef,
        });
        this.env.bus.addEventListener("ChatBubble:preview-will-open", ({ detail }) => {
            if (detail === this) {
                return;
            }
            this.popover.close();
        });
        this.hover = useHover(["root", popoverRef], {
            onHover: () => {
                this.env.bus.trigger("ChatBubble:preview-will-open", this);
                this.popover.open(this.rootRef.el, { chatWindow: this.props.chatWindow });
            },
            onHovering: [100, () => (this.state.showClose = true)],
            onAway: () => this.popover.close(),
        });
        this.rootRef = useRef("root");
        this.state = useState({ bouncing: false, showClose: true });
        useEffect(
            () => {
                this.state.bouncing = this.thread.importantCounter ? true : this.state.bouncing;
            },
            () => [this.thread.importantCounter]
        );
    }

    /** @returns {import("models").Thread} */
    get thread() {
        return this.props.chatWindow.thread;
    }
}
