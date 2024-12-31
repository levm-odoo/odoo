import publicWidget from "@web/legacy/js/public/public_widget";
import animations from "@website/js/content/snippets.animation";
import { extraMenuUpdateCallbacks } from "@website/js/content/menu";

publicWidget.registry.AnimatedPageBreadcrumb = animations.Animation.extend({
    selector: "div.o_page_breadcrumb",
    disabledInEditableMode: false,
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
        this._updatePageBreadcrumbOnResizeBound = this._updatePageBreadcrumbOnResize.bind(this);
        extraMenuUpdateCallbacks.push(this._updatePageBreadcrumbOnResizeBound);
        return this._super(...arguments);
    },
    /**
     * @override
     */
    destroy() {
        const indexCallback = extraMenuUpdateCallbacks.indexOf(this._updatePageBreadcrumbOnResizeBound);
        if (indexCallback >= 0) {
            extraMenuUpdateCallbacks.splice(indexCallback, 1);
        }
        this._super(...arguments);
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
        const wrapwrapEl = document.querySelector("div#wrapwrap");
        const headerHeight = wrapwrapEl
            ?.querySelector("header#top")
            ?.getBoundingClientRect().height;
        if (headerHeight && wrapwrapEl.classList.contains("o_header_overlay")) {
            this.el.style.top = `${headerHeight}px`;
        }
    },
});
