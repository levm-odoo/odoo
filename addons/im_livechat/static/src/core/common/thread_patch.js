import { Thread } from "@mail/core/common/thread";

import { patch } from "@web/core/utils/patch";

patch(Thread.prototype, {
    get showVisitorDisconnected() {
        return (
            this.props.thread.channel_type === "livechat" &&
            this.store.self.isInternalUser &&
            this.props.thread.livechat_active &&
            this.props.thread.livechatVisitorMember?.persona.im_status != "online"
        );
    },
});
