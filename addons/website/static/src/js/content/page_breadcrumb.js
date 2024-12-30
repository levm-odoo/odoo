import publicWidget from "@web/legacy/js/public/public_widget";
import animations from "@website/js/content/snippets.animation";

publicWidget.registry.AnimatedPageBreadcrumb = animations.Animation.extend({
    selector: "div.o_page_breadcrumb",
    effects: [
        {
            startEvents: "resize",
            update: "_updatePageBreadcrumbOnResize",
        },
    ],

    /**
     * @override
     */
    start: function () {
        this._updatePageBreadcrumbOnResize();
        return this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Called when the window is resized
     *
     * @private
     */
    _updatePageBreadcrumbOnResize: function () {
        const wrapwrapEl = document?.querySelector("div#wrapwrap");
        const breadcrumbEl = wrapwrapEl?.querySelector("div.o_page_breadcrumb");
        const headerHeight = wrapwrapEl
            ?.querySelector("header#top")
            ?.getBoundingClientRect().height;
        if (breadcrumbEl && headerHeight) {
            if (wrapwrapEl.classList.contains("o_header_overlay")) {
                breadcrumbEl.style.top = "";
                breadcrumbEl.style.top = `${headerHeight}px`;
            } else {
                breadcrumbEl.style.top = "";
            }
        }
    },
});
