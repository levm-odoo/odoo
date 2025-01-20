import { Store } from "@mail/core/common/store_service";

import { patch } from "@web/core/utils/patch";

patch(Store.prototype, {
    async getMessagePostParams({ postData }) {
        const params = await super.getMessagePostParams(...arguments);
        if (postData.rating_value) {
            params.post_data.rating_value = postData.rating_value;
        }
        return params;
    },

    // async getMessageUpdateParams({ updateData }) {
    //     const params = await super.getMessageUpdateParams(...arguments);
    //     if (updateData.rating_value) {
    //         params.rating_value = updateData.rating_value;
    //     }
    //     return params;
    // },
});
