import { Store } from "@mail/core/common/store_service";
import { Record } from "@mail/model/record";

import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";
import { expirableStorage } from "./expirable_storage";

export const GUEST_TOKEN_STORAGE_KEY = "im_livechat_guest_token";
/** @type {import("models").Store} */
const StorePatch = {
    setup() {
        super.setup(...arguments);
        this.livechat_rule = Record.one("im_livechat.channel.rule");
        this.livechat_available = session.livechatData?.isAvailable;
        this.activeLivechats = Record.many("Thread", {
            inverse: "storeAsActiveLivechats",
            onUpdate() {
                if (this.activeLivechats.filter(({ isTransient }) => !isTransient).length === 0) {
                    return;
                }
                if (this.guest_token) {
                    expirableStorage.setItem(GUEST_TOKEN_STORAGE_KEY, this.guest_token);
                    this.store.env.services.bus_service.addChannel(
                        `mail.guest_${this.guest_token}`
                    );
                    return;
                }
                expirableStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
                this.store.env.services.bus_service.deleteChannel(`mail.guest_${this.guest_token}`);
            },
        });
        this.guest_token = Record.attr(null, {
            compute() {
                return expirableStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
            },
            eager: true,
        });
    },
};
patch(Store.prototype, StorePatch);
