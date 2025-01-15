import { Store, storeService } from "@mail/core/common/store_service";

import { patch } from "@web/core/utils/patch";

storeService.dependencies.push("im_livechat.initialized");

patch(Store.prototype, {
    get initMessagingParams() {
        const params = super.initMessagingParams;
        params.init_messaging.channel_types = ["livechat"];
        return params;
    },
});
