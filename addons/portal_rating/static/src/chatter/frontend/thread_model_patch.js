import { Thread } from "@mail/core/common/thread_model";

import { patch } from "@web/core/utils/patch";

patch(Thread.prototype, {
    get rpcParams() {
        return {
            ...super.rpcParams,
            ...(this.rating_value ? { rating_value: this.rating_value } : {}),
        };
    },
});
