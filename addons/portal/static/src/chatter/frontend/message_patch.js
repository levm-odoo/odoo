import { Message } from "@mail/core/common/message";

import { patch } from "@web/core/utils/patch";

patch(Message.prototype, {
    get authorAvatarUrl() {
        if (this.env.inFrontendPortalChatter) {
            return `/mail/avatar/mail.message/${this.message.id}/author_avatar/50x50?access_token=${this.message.thread.access_token}&_hash=${this.message.thread.hash}&pid=${this.message.thread.id}`;
        }
        return super.authorAvatarUrl;
    },
});
