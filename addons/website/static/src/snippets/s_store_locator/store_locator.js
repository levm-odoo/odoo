import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { generateGMapLink, generateGMapIframe } from "@website/js/utils";

export class StoreLocator extends Interaction {
    static selector = ".s_store_locator";

    start() {
        if (!this.el.querySelector(".s_store_locator_embedded")) {
            // The iframe is not found inside the snippet. This is probably due
            // to the sanitization of a field during the save, like in a product
            // description field. In such cases, reconstruct the iframe.
            const dataset = this.el.dataset;
            if (dataset.mapAddress) {
                const iframeEl = generateGMapIframe();
                this.el.querySelector(".s_store_locator_color_filter").before(iframeEl);
                this.services.website_cookies.manageIframeSrc(iframeEl, generateGMapLink(dataset));
            }
        }
    }
}

registry
    .category("public.interactions")
    .add("website.store_locator", StoreLocator);
