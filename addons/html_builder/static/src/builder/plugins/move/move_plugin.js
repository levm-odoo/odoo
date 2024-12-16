import { Plugin } from "@html_editor/plugin";
import {
    addMobileOrders,
    removeMobileOrders,
} from "@html_builder/builder/utils/column_layout_utils";
import { isMobileView } from "@html_builder/builder/utils/utils";

// TODO find where to define the selectors so they are not duplicated across files
const moveUpOrDown = {
    selector: [
        "section",
        ".s_accordion .accordion-item",
        ".s_showcase .row .row:not(.s_col_no_resize) > div",
        ".s_hr",
        // In snippets files
        ".s_pricelist_boxed_item",
        ".s_pricelist_cafe_item",
        ".s_product_catalog_dish",
        ".s_timeline_list_row",
        ".s_timeline_row",
    ].join(", "),
};

const moveLeftOrRight = {
    selector: [
        ".row:not(.s_col_no_resize) > div",
        ".nav-item",
        ".s_timeline_card", // timeline TODO custom function, other plugin ?
    ].join(", "),
    exclude: ".s_showcase .row .row > div",
};

function isMovable(el) {
    const canMoveUpOrDown = el.matches(moveUpOrDown.selector);
    const canMoveLeftOrRight =
        el.matches(moveLeftOrRight.selector) && !el.matches(moveLeftOrRight.exclude);
    return canMoveUpOrDown || canMoveLeftOrRight;
}

function getMoveDirection(el) {
    const canMoveVertically = el.matches(moveUpOrDown.selector);
    return canMoveVertically ? "vertical" : "horizontal";
}

export class MovePlugin extends Plugin {
    static id = "move";
    static dependencies = ["overlay", "history"];
    resources = {
        get_overlay_buttons: this.getActiveOverlayButtons.bind(this),
    };

    setup() {
        this.target = null;
        this.isMobileView = false;
        this.isGridItem = false;
    }

    getActiveOverlayButtons(target) {
        if (!isMovable(target)) {
            this.target = null;
            return [];
        }

        const buttons = [];
        this.target = target;
        this.refreshState();
        if (this.areArrowsDisplayed()) {
            if (this.hasPreviousSibling()) {
                const direction = getMoveDirection(this.target) === "vertical" ? "up" : "left";
                const button = {
                    class: `fa fa-fw fa-angle-${direction}`,
                    handler: this.onMoveClick.bind(this, "prev"),
                };
                buttons.push(button);
            }
            if (this.hasNextSibling()) {
                const direction = getMoveDirection(this.target) === "vertical" ? "down" : "right";
                const button = {
                    class: `fa fa-fw fa-angle-${direction}`,
                    handler: this.onMoveClick.bind(this, "next"),
                };
                buttons.push(button);
            }
        }
        return buttons;
    }

    refreshState() {
        this.isMobileView = isMobileView(this.target);
        this.isGridItem = this.target.classList.contains("o_grid_item");
    }

    // TODO check where to call it (SnippetMove > start).
    // refreshTarget() {
    //     // Needed for compatibility (with already dropped snippets).
    //     // If the target is a column, check if all the columns are either mobile
    //     // ordered or not. If they are not consistent, then we remove the mobile
    //     // order classes from all of them, to avoid issues.
    //     const parentEl = this.target.parentElement;
    //     if (parentEl.classList.contains("row")) {
    //         const columnEls = [...parentEl.children];
    //         const orderedColumnEls = columnEls.filter((el) => el.style.order);
    //         if (orderedColumnEls.length && orderedColumnEls.length !== columnEls.length) {
    //             removeMobileOrders(orderedColumnEls);
    //         }
    //     }
    // }

    areArrowsDisplayed() {
        const siblingsEl = [...this.target.parentNode.children];
        const visibleSiblingEl = siblingsEl.find(
            (el) => el !== this.target && window.getComputedStyle(el).display !== "none"
        );
        // The arrows are not displayed if:
        // - the target is a grid item and not in mobile view
        // - the target has no visible siblings
        return !!visibleSiblingEl && !(this.isGridItem && !this.isMobileView);
    }

    hasPreviousSibling() {
        return !!this.getPreviousOrNextVisibleSibling("prev");
    }

    hasNextSibling() {
        return !!this.getPreviousOrNextVisibleSibling("next");
    }

    getPreviousOrNextVisibleSibling(direction) {
        const siblingEls = [...this.target.parentNode.children];
        const visibleSiblingEls = siblingEls.filter(
            (el) => window.getComputedStyle(el).display !== "none"
        );
        const targetMobileOrder = this.target.style.order;
        // On mobile, if the target has a mobile order (which is independent
        // from desktop), consider these orders instead of the DOM order.
        if (targetMobileOrder && this.isMobileView) {
            visibleSiblingEls.sort((a, b) => parseInt(a.style.order) - parseInt(b.style.order));
        }
        const targetIndex = visibleSiblingEls.indexOf(this.target);
        const siblingIndex = direction === "prev" ? targetIndex - 1 : targetIndex + 1;
        if (siblingIndex === -1 || siblingIndex === visibleSiblingEls.length) {
            return false;
        }
        return visibleSiblingEls[siblingIndex];
    }

    /**
     * Move the element in the given direction
     *
     * @param {String} direction "prev" or "next"
     */
    onMoveClick(direction) {
        // TODO nav-item ? (=> specific plugin)
        // const isNavItem = this.target.classList.contains("nav-item");
        let hasMobileOrder = !!this.target.style.order;
        const siblingEls = this.target.parentNode.children;

        // If the target is a column, the ordering in mobile view is independent
        // from the desktop view. If we are in mobile view, we first add the
        // mobile order if there is none yet. In the case where we are not in
        // mobile view, the mobile order is reset.
        const parentEl = this.target.parentNode;
        if (this.isMobileView && parentEl.classList.contains("row") && !hasMobileOrder) {
            addMobileOrders(siblingEls);
            hasMobileOrder = true;
        } else if (!this.isMobileView && hasMobileOrder) {
            removeMobileOrders(siblingEls);
            hasMobileOrder = false;
        }

        const siblingEl = this.getPreviousOrNextVisibleSibling(direction);
        if (hasMobileOrder) {
            // Swap the mobile orders.
            const currentOrder = this.target.style.order;
            this.target.style.order = siblingEl.style.order;
            siblingEl.style.order = currentOrder;
        } else {
            // Swap the DOM elements.
            siblingEl.insertAdjacentElement(
                direction === "prev" ? "beforebegin" : "afterend",
                this.target
            );
        }

        // TODO scroll (data-no-scroll)
        // TODO update invisible dom

        this.dependencies.history.addStep();
    }
}
