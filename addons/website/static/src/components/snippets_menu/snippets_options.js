/** @odoo-module **/
import { registry } from "@web/core/registry";
import {
    SnippetOption,
    Box,
    LayoutColumn,
    Sizing,
    SizingX,
    SizingY,
    SizingGrid,
    SnippetMove,
    ColoredLevelBackground,
    BackgroundToggler,
    VerticalAlignment,
    CarouselHandler,
} from "@web_editor/components/snippets_menu/snippets_options";

import {
    onRendered,
    useSubEnv,
    xml,
} from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import options from "@web_editor/js/editor/snippets.options";
import {_t} from "@web/core/l10n/translation";
import {isImageSupportedForStyle} from "@web_editor/js/editor/image_processing";

registry.category("snippets_options").add("ContainerWidth", {
    template: "website.ContainerWidth",
    selector: "section, .s_carousel .carousel-item, s_quotes_carousel .carousel-item",
    exclude: "[data-snippet] :not(.oe_structure) > [data-snippet]",
    target: "> .container, > .container-fluid, > .o_container_small",
});

registry.category("snippets_options").add("Website.Layout", {
    component: LayoutColumn,
    template: "website.LayoutColumn",
    selector: "section, section.s_carousel_wrapper .carousel-item",
    target: "> *:has(> .row), > .s_allow_columns",
    exclude: ".s_masonry_block, .s_features_grid, .s_media_list, .s_showcase, .s_table_of_content, .s_process_steps, .s_image_gallery",
});

patch(SnippetOption.prototype, {
    setup() {
        super.setup(...arguments);
        this._website = useService("website");
    },
    async select() {
        await super.select(...arguments);
        await this._refreshPublicWidgets();
    },
    _refreshPublicWidgets() {
        return new Promise((resolve, reject) => this._website.websiteRootInstance.trigger_up("widgets_start_request", {
            onSuccess: resolve,
            onFailure: reject,
            editableMode: true,
        }));
    }
});

class Carousel extends CarouselHandler {
    setup() {
        super.setup();
        useSubEnv({
            validMethodNames: [...this.env.validMethodNames, "addSlide"],
        });
    }

    start() {
        let _slideTimestamp;
        this.onSlide = () => {
            _slideTimestamp = window.performance.now();
            setTimeout(() => this.props.toggleOverlay(false));
        };
        this.onSlid = () => {
            // slid.bs.carousel is most of the time fired too soon by bootstrap
            // since it emulates the transitionEnd with a setTimeout. We wait
            // here an extra 20% of the time before retargeting edition, which
            // should be enough...
            const _slideDuration = window.performance.now() - _slideTimestamp;
            setTimeout(() => {
                this.env.activateSnippet(this.target.querySelector(".carousel-item.active"));
                this.target.dispatchEvent(new Event("active_slide_targeted"));
            }, 0.2 * _slideDuration);
        };
        this.bsCarousel.pause();
        this.target.addEventListener("slide.bs.carousel", this.onSlide);
        this.target.addEventListener("slid.bs.carousel", this.onSlid);
    }
    /**
     * @override
     */
    async cleanForSave() {
        this.target.removeEventListener("slide.bs.carousel", this.onSlide);
        this.target.removeEventListener("slid.bs.carousel", this.onSlid);
        const items = this.getGalleryItems();
        items.forEach((el) => {
            el.classList.remove("next", "prev", "left", "right", "active");
        });
        items[0].classList.add("active");
        this.indicatorsEls.forEach((indicatorEl) => {
            indicatorEl.classList.remove("active");
            indicatorEl.replaceChildren();
        });
        this.indicatorsEls.item(0).classList.add("active");
    }
    /**
     * @override
     */
    onBuilt() {
        this.assignUniqueID();
    }
    /**
     * @override
     */
    onClone() {
        this.assignUniqueID();
    }
    /**
     * @override
     */
    async notify(name, data) {
        await super.notify(...arguments);
        if (name === "add_slide") {
            this.addSlide();
        }
    }

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Adds a slide.
     *
     * @see this.selectClass for parameters
     */
    addSlide(previewMode, widgetValue, params) {
        this.target
            .querySelectorAll("carousel-control-prev, .carousel-control-next, .carousel-indicators")
            .forEach((el) => {
                el.classList.remove("d-none");
            });
        const items = this.getGalleryItems();
        const active = items.find((el) => el.classList.contains("active"));

        const indicatorEl = document.createElement("li");
        indicatorEl.dataset.bsTarget = "#" + this.target.id;
        indicatorEl.dataset.bsSlideTo = items.length;
        this.indicatorsEls.item(0).parentElement.appendChild(indicatorEl);
        const newSlide = active.cloneNode(true);
        newSlide.classList.remove("active");
        active.parentElement.insertBefore(newSlide, active.nextSibling);
        this.bsCarousel.next();
    }

    //--------------------------------------------------------------------------
    // Internal
    //--------------------------------------------------------------------------

    /**
     * Creates a unique ID for the carousel and reassign data-attributes that
     * depend on it.
     */
    assignUniqueID() {
        const id = "myCarousel" + Date.now();
        this.target.id = id;
        const bsTarget = this.target.querySelector("[data-bs-target]");
        if (bsTarget) {
            bsTarget.dataset.bsTarget = "#" + id;
        }
        this.target.querySelectorAll("[data-bs-slide], [data-bs-slide-to]").forEach((el) => {
            if (el.getAttribute("data-bs-target")) {
                el.dataset.bsTarget = "#" + id;
            } else if (el.getAttribute("href")) {
                el.setAttribute("href", "#" + id);
            }
        });
    }
    /**
     * Gets the indicator parts of the carousel.
     *
     * @returns {NodeList}
     */
    get indicatorsEls() {
        return this.target.querySelectorAll(".carousel-indicators > *");
    }
    /**
     * @override
     */
    getGalleryItems() {
        return Array.from(this.target.querySelectorAll(".carousel-item"));
    }
    /**
     * @override
     */
    reorderItems(itemsEls, newItemPosition) {
        const carouselInnerEl = this.target.querySelector(".carousel-inner");
        // First, empty the content of the carousel.
        carouselInnerEl.replaceChildren();
        // Then fill it with the new slides.
        for (const itemsEl of itemsEls) {
            carouselInnerEl.append(itemsEl);
        }
        this.updateIndicatorAndActivateSnippet(newItemPosition);
    }
}
registry.category("snippets_options").add("Carousel", {
    template: "website.Carousel",
    component: Carousel,
    selector: "section",
    target: "> .carousel",
});

class CarouselItem extends SnippetOption {
    static isTopOption = true;
    static forceNoDeleteButton = true;

    setup() {
        super.setup();
        useSubEnv({
            validMethodNames: [...this.env.validMethodNames, "addSlideItem", "removeSlide", "switchToSlide"],
        });

        onRendered(() => {
            this.carouselEl = this.target.closest(".carousel");
        });
    }

    /**
     * @override
     */
    start() {
        // TODO: option title patch
        // const leftPanelEl = this.$overlay.data('$optionsSection')[0];
        // const titleTextEl = leftPanelEl.querySelector('we-title > span');
        // this.counterEl = document.createElement('span');
        // titleTextEl.appendChild(this.counterEl);

        return super.start(...arguments);
    }
    /**
     * Updates the slide counter.
     *
     * @override
     */
    async updateUI() {
        await super.updateUI(...arguments);
        const items = this.target.parentElement.children;
        const activeSlide = [...items].find((el) => el.classList.contains("active"));
        const updatedText = ` (${items.indexOf(activeSlide) + 1} / ${items.length})`;
        this.counterEl.textContent = updatedText;
    }
    /**
     * @override
     */
    async cleanForSave() {
        this.carouselEl.removeEventListener("active_slide_targeted", this.onActiveSlideTargeted);
        await super.cleanForSave()
    }
    /**
     * Gets the bootstrap instance of the carousel.
     */
    get bsCarousel() {
        const targetWindow = this.target.ownerDocument.defaultView;
        return targetWindow.Carousel.getOrCreateInstance(this.carouselEl);
    }
    /**
     * Gets the indicator parts of the carousel.
     *
     * @returns {NodeList}
     */
    get indicatorsEls() {
        return this.carouselEl.querySelectorAll(".carousel-indicators > *");
    }

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * @see this.selectClass for parameters
     */
    async addSlideItem(previewMode, widgetValue, params) {
        await this.props.notifyOptions("Carousel", {
            name: "add_slide",
        });
    }
    /**
     * Removes the current slide.
     *
     * @see this.selectClass for parameters.
     */
    removeSlide(previewMode) {
        const items = this.target.parentElement.children;
        const newLength = items.length - 1;

        if (!this.removing && newLength > 0) {
            // The active indicator is deleted to ensure that the other
            // indicators will still work after the deletion.
            const toDelete = [
                [...items].find((item) => item.classList.contains("active")),
                [...this.indicatorsEls].find(indicator => indicator.classList.contains("active")),
            ];
            this.onActiveSlideTargeted = () => {
                toDelete.forEach((el) => el.remove());
                // To ensure the proper functioning of the indicators, their
                // attributes must reflect the position of the slides.
                for (let i = 0; i < this.indicatorsEls.length; i++) {
                    this.indicatorsEls[i].setAttribute("data-bs-slide-to", i);
                }
                const controlsEls = this.carouselEl.querySelectorAll(
                    "carousel-control-prev, .carousel-control-next, .carousel-indicators");
                controlsEls.forEach((el) => el.classList.toggle("d-none", newLength === 1));
                this.carouselEl.dispatchEvent(new Event("content_changed")); // For what?
                // this.$carousel.trigger('content_changed');
                this.removing = false;
            };

            this.carouselEl.addEventListener("active_slide_targeted", this.onActiveSlideTargeted, { once: true });
            this.removing = true;
            this.bsCarousel.prev();
        }
    }
    /**
     * Goes to next slide or previous slide.
     *
     * @see this.selectClass for parameters
     */
    switchToSlide(previewMode, widgetValue, params) {
        switch (widgetValue) {
            case 'left':
                this.bsCarousel.prev();
                break;
            case 'right':
                this.bsCarousel.next();
                break;
        }
    }
}
registry.category("snippets_options").add("CarouselItem", {
    template: "website.CarouselItem",
    component: CarouselItem,
    selector: ".s_carousel .carousel-item, .s_quotes_carousel .carousel-item",
});

class GalleryElement extends SnippetOption {
    setup() {
        super.setup();
        useSubEnv({
            validMethodNames: [...this.env.validMethodNames, "position"],
        });
    }

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Allows to change the position of an item on the set.
     *
     * @see this.selectClass for parameters
     */
    async position(previewMode, widgetValue, params) {
        const optionName = this.target.classList.contains("carousel-item") ? "Carousel"
            : "GalleryImageList";
        await this.props.notifyOptions(optionName, {
            name: "reorder_items",
            data: {
                itemEl: this.target,
                position: widgetValue,
            },
        });
        // TODO: notify
        // this.trigger_up("option_update", {
        //     optionName: optionName,
        //     name: "reorder_items",
        //     data: {
        //         itemEl: this.target,
        //         position: widgetValue,
        //     },
        // });
    }
}
registry.category("snippets_options").add("GalleryElement", {
    template: "website.GalleryElement",
    component: GalleryElement,
    selector: ".s_image_gallery img, .s_carousel .carousel-item",
}, {
    sequence: 1,
});

registry.category("snippets_options").add("website.Box", {
    template: "website.Box",
    component: Box,
    selector: "section .row > div",
    exclude: ".s_col_no_bgcolor, .s_col_no_bgcolor.row > div, .s_image_gallery .row > div, .s_masonry_block .s_col_no_resize, .s_text_cover .row > .o_not_editable",
});
registry.category("snippets_options").add("website.CardBox", {
    template: "website.CardBox",
    component: Box,
    selector: ".s_three_columns .row > div, .s_comparisons .row > div",
    target: ".card",
});

patch(Sizing.prototype, {
    /**
     * @override
     */
    start() {
        const defs = super.start(...arguments);
        const self = this;
        this.$handles.on("mousedown", function (ev) {
            // Since website is edited in an iframe, a div that goes over the
            // iframe is necessary to catch mousemove and mouseup events,
            // otherwise the iframe absorbs them.
            const $body = $(this.ownerDocument.body);
            if (!self.divEl) {
                self.divEl = document.createElement("div");
                self.divEl.style.position = "absolute";
                self.divEl.style.height = "100%";
                self.divEl.style.width = "100%";
                self.divEl.setAttribute("id", "iframeEventOverlay");
                $body.append(self.divEl);
            }
            const documentMouseUp = () => {
                // Multiple mouseup can occur if mouse goes out of the window
                // while moving.
                if (self.divEl) {
                    self.divEl.remove();
                    self.divEl = undefined;
                }
                $body.off("mouseup", documentMouseUp);
            };
            $body.on("mouseup", documentMouseUp);
        });
        return defs;
    },
    /**
     * @override
     */
    async updateUIVisibility() {
        await super.updateUIVisibility(...arguments);
        const nonDraggableClasses = [
            "s_table_of_content_navbar_wrap",
            "s_table_of_content_main",
        ];
        if (nonDraggableClasses.some(c => this.target.classList.contains(c))) {
            const moveHandleEl = this.$overlay[0].querySelector(".o_move_handle");
            moveHandleEl.classList.add("d-none");
        }
    },
});

registry.category("snippets_options").add("website.sizing_y", {
    component: SizingY,
    template: xml`<div class="d-none"/>`,
    selector: "section, .row > div, .parallax, .s_hr, .carousel-item, .s_rating",
    exclude: "section:has(> .carousel), .s_image_gallery .carousel-item, .s_col_no_resize.row > div, .s_col_no_resize",
});

registry.category("snippets_options").add("website.sizing_x", {
    component: SizingX,
    template: xml`<div class="d-none"/>`,
    selector: ".row > div",
    dropNear: ".row:not(.s_col_no_resize) > div",
    exclude: ".s_col_no_resize.row > div, .s_col_no_resize",
});

registry.category("snippets_options").add("website.sizing_grid", {
    component: SizingGrid,
    template: xml`<div class="d-none"/>`,
    selector: ".row > div",
    dropNear: ".row.o_grid_mode > div",
    exclude: ".s_col_no_resize.row > div, .s_col_no_resize",
});

registry.category("snippets_options").add("move_horizontally_opt", {
    template: "website.move_horizontally_opt",
    component: SnippetMove,
    selector: ".row:not(.s_col_no_resize) > div, .nav-item",
    exclude: ".s_showcase .row > div",
});

registry.category("snippets_options").add("VerticalAlignment", {
    component: VerticalAlignment,
    template: "website.VerticalAlignment",
    selector: ".s_text_image, .s_image_text, .s_three_columns",
    target: ".row",
});
/**
 * Background snippet options
 */
const baseOnlyBgImage = {
    selector: ".s_tabs .oe_structure > *, footer .oe_structure > *"
}
const bgSelectors = {
    onlyBgColor: {
        selector: "section .row > div, .s_text_highlight, .s_mega_menu_thumbnails_footer",
        exclude: ".s_col_no_bgcolor, .s_col_no_bgcolor.row > div, .s_masonry_block .row > div, .s_color_blocks_2 .row > div, .s_image_gallery .row > div, .s_text_cover .row > .o_not_editable",
        withImages: false,
        withColors: true,
        withColorCombinations: true,
        withGradients: true,
    },
    onlyBgImage: {
        selector: baseOnlyBgImage.selector,
        exclude: "",
        withVideos: true,
        withImages: true,
        withColors: false,
        withShapes: true,
        withColorCombinations: false,
        withGradients: true,
    }
}

function registerBackgroundOption(name, params) {
    const option = {};
    if (params.withColors && params.withColorCombinations) {
        option.component = ColoredLevelBackground;
    } else {
        option.component = BackgroundToggler;
    }
    option.template = "web_editor.ColoredLevelBackground";
    Object.assign(option, params);
    registry.category("snippets_options").add(name, option);
}

registerBackgroundOption("bothBgColorImage", {
    selector: "section, .carousel-item, .s_masonry_block .row > div, .s_color_blocks_2 .row > div, .parallax, .s_text_cover .row > .o_not_editable",
    exclude: baseOnlyBgImage.selector + ", .s_carousel_wrapper, .s_image_gallery .carousel-item, .s_google_map, .s_map, [data-snippet] :not(.oe_structure) > [data-snippet], .s_masonry_block .s_col_no_resize",
    withVideos: true,
    withImages: true,
    withColors: true,
    withShapes: true,
    withColorCombinations: true,
    withGradients: true,
});


class ScrollButton extends SnippetOption {
    /**
     * @override
     */
    setup() {
        super.setup();
        this.env.validMethodNames.push("toggleButton", "showScrollButton");
    }
    /**
     * @override
     */
    async start() {
        await super.start(...arguments);
        this.$button = this.$('.o_scroll_button');
    }

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * @see this.selectClass for parameters
     */
    async showScrollButton(previewMode, widgetValue, params) {
        if (widgetValue) {
            this.$button.show();
        } else {
            if (previewMode) {
                this.$button.hide();
            } else {
                this.$button.detach();
            }
        }
    }
    /**
     * Toggles the scroll down button.
     */
    toggleButton(previewMode, widgetValue, params) {
        if (widgetValue) {
            if (!this.$button.length) {
                const anchor = document.createElement('a');
                anchor.classList.add(
                    'o_scroll_button',
                    'mb-3',
                    'rounded-circle',
                    'align-items-center',
                    'justify-content-center',
                    'mx-auto',
                    'bg-primary',
                    'o_not_editable',
                );
                anchor.href = '#';
                anchor.contentEditable = "false";
                anchor.title = _t("Scroll down to next section");
                const arrow = document.createElement('i');
                arrow.classList.add('fa', 'fa-angle-down', 'fa-3x');
                anchor.appendChild(arrow);
                this.$button = $(anchor);
            }
            this.$target.append(this.$button);
        } else {
            this.$button.detach();
        }
    }
    /**
     * @override
     */
    async selectClass(previewMode, widgetValue, params) {
        await super.selectClass(...arguments);
        // If a "d-lg-block" class exists on the section (e.g., for mobile
        // visibility option), it should be replaced with a "d-lg-flex" class.
        // This ensures that the section has the "display: flex" property
        // applied, which is the default rule for both "height" option classes.
        if (params.possibleValues.includes("o_half_screen_height")) {
            if (widgetValue) {
                this.$target[0].classList.replace("d-lg-block", "d-lg-flex");
            } else if (this.$target[0].classList.contains("d-lg-flex")) {
                // There are no known cases, but we still make sure that the
                // <section> element doesn't have a "display: flex" originally.
                this.$target[0].classList.remove("d-lg-flex");
                const sectionStyle = window.getComputedStyle(this.$target[0]);
                const hasDisplayFlex = sectionStyle.getPropertyValue("display") === "flex";
                this.$target[0].classList.add(hasDisplayFlex ? "d-lg-flex" : "d-lg-block");
            }
        }
    }

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    computeWidgetState(methodName, params) {
        switch (methodName) {
            case 'toggleButton':
                return !!this.$button.parent().length;
        }
        return super.computeWidgetState(...arguments);
    }
    /**
     * @override
     */
    computeWidgetVisibility(widgetName, params) {
        if (widgetName === 'fixed_height_opt') {
            return (this.$target[0].dataset.snippet === 's_image_gallery');
        }
        return super.computeWidgetVisibility(...arguments);
    }
}
registry.category("snippets_options").add("website.ScrollButton", {
    component: ScrollButton,
    template: "website.ScrollButton",
    selector: "section",
    exclude: "[data-snippet] :not(.oe_structure) > [data-snippet]",
})

class WebsiteAnimate extends SnippetOption {
    /**
     * @override
     */
    setup() {
        super.setup();
        this.env.validMethodNames.push("animationMode", "animationIntensity", "forceAnimation", "isAnimationTypeSelection");
        this.$overlay = $(this.props.overlayEl);
    }

    //--------------------------------------------------------------------------
    // SnippetOption overrides
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    async start() {
        await super.start(...arguments);
        // Animations for which the "On Scroll" and "Direction" options are not
        // available.
        this.limitedAnimations = ['o_anim_flash', 'o_anim_pulse', 'o_anim_shake', 'o_anim_tada', 'o_anim_flip_in_x', 'o_anim_flip_in_y'];
        this.isAnimatedText = this.target.classList.contains('o_animated_text');
        this.$optionsSection = this.$overlay.data('$optionsSection'); // TODO for animation in text
        this.$scrollingElement = $().getScrollingElement(this.target.ownerDocument);
    }
    /**
     * @override
     */
    onBuilt() {
        this.target.classList.toggle('o_animate_preview', this.target.classList.contains('o_animate'));
    }
    /**
     * @override
     */
    onFocus() {
        // TODO animation in text
        if (this.isAnimatedText) {
            // For animated text, the animation options must be in the editor
            // toolbar.
            this.options.wysiwyg.toolbarEl.append(this.$el[0]);
            this.$optionsSection.addClass('d-none');
        }
    }
    /**
     * @override
     */
    onBlur() {
        // TODO animation in text.
        if (this.isAnimatedText) {
            // For animated text, the options must be returned to their
            // original location as they were moved in the toolbar.
            this.$optionsSection.append(this.$el);
        }
    }
    /**
     * @override
     */
    cleanForSave() {
        if (this.target.closest('.o_animate')) {
            // As images may have been added in an animated element, we must
            // remove the lazy loading on them.
            this.toggleImagesLazyLoading(false);
        }
    }
    /**
     * @override
     */
    async selectClass(previewMode, widgetValue, params) {
        await super.selectClass(...arguments);
        if (params.forceAnimation && params.name !== 'o_anim_no_effect_opt' && previewMode !== 'reset') {
            this.forceAnimation();
        }
        if (params.isAnimationTypeSelection) {
            this.target.classList.toggle('o_animate_preview', this.target.classList.contains("o_animate"));
        }
    }
    /**
     * @override
     */
    async selectDataAttribute(previewMode, widgetValue, params) {
        await super.selectDataAttribute(...arguments);
        if (params.forceAnimation) {
            this.forceAnimation();
        }
    }
    /**
     * @override
     */
    computeWidgetVisibility(widgetName, params) {
        const hasAnimateClass = this.target.classList.contains("o_animate");
        switch (widgetName) {
            case 'no_animation_opt': {
                return !this.isAnimatedText;
            }
            case 'animation_effect_opt': {
                return hasAnimateClass;
            }
            case 'animation_trigger_opt': {
                return !this.target.closest('.dropdown');
            }
            case 'animation_on_scroll_opt':
            case 'animation_direction_opt': {
                if (widgetName === "animation_direction_opt" && !hasAnimateClass) {
                    return false;
                }
                return !this.limitedAnimations.some(className => this.target.classList.contains(className));
            }
            case 'animation_intensity_opt': {
                if (!hasAnimateClass) {
                    return false;
                }
                const possibleDirections = this.requestUserValueWidgets('animation_direction_opt')[0].possibleValues["selectClass"];
                if (this.target.classList.contains('o_anim_fade_in')) {
                    for (const targetClass of this.target.classList) {
                        // Show "Intensity" if "Fade in" + direction is not
                        // "In Place" ...
                        if (possibleDirections.indexOf(targetClass) >= 0) {
                            return true;
                        }
                    }
                    // ... but hide if "Fade in" + "In Place" direction.
                    return false;
                }
                return true;
            }
            case 'animation_on_hover_opt': { // TODO when Image options will be done
                const [hoverEffectOverlayWidget] = this.requestUserValueWidgets("hover_effect_overlay_opt");
                if (hoverEffectOverlayWidget) {
                    const hoverEffectWidget = hoverEffectOverlayWidget.getParent();
                    const imageToolsOpt = hoverEffectWidget.getParent();
                    return !imageToolsOpt._isDeviceShape() && !imageToolsOpt._isAnimatedShape();
                }
                return false;
            }
        }
        return super.computeWidgetVisibility(...arguments);
    }
    /**
     * @override
     */
    computeVisibility(methodName, params) {
        if (this.$target[0].matches('img')) {
            return isImageSupportedForStyle(this.target);
        }
        return super.computeVisibility(...arguments);
    }
    /**
     * @override
     */
    computeWidgetState(methodName, params) {
        if (methodName === 'animationIntensity') {
            return window.getComputedStyle(this.target).getPropertyValue('--wanim-intensity');
        }
        return super.computeWidgetState(...arguments);
    }

    //--------------------------------------------------------------------------
    // Option specific
    //--------------------------------------------------------------------------

    /**
     * Sets the animation mode.
     *
     * @see this.selectClass for parameters
     */
    animationMode(previewMode, widgetValue, params) {
        const targetClassList = this.target.classList;
        this.$scrollingElement[0].classList.remove('o_wanim_overflow_xy_hidden');
        targetClassList.remove('o_animating', 'o_animate_both_scroll', 'o_visible', 'o_animated', 'o_animate_out');
        this.target.style.animationDelay = '';
        this.target.style.animationPlayState = '';
        this.target.style.animationName = '';
        this.target.style.visibility = '';
        if (widgetValue === 'onScroll') {
            this.target.dataset.scrollZoneStart = 0;
            this.target.dataset.scrollZoneEnd = 100;
        } else {
            delete this.target.dataset.scrollZoneStart;
            delete this.target.dataset.scrollZoneEnd;
        }
        if (params.activeValue === "o_animate_on_hover") { // TODO when Image options will be done
            this.trigger_up("option_update", {
                optionName: "ImageTools",
                name: "disable_hover_effect",
            });
        }
        if ((!params.activeValue || params.activeValue === "o_animate_on_hover")
                && widgetValue && widgetValue !== "onHover") {
            // If "Animation" was on "None" or "o_animate_on_hover" and it is no
            // longer, it is set to "fade_in" by default.
            targetClassList.add('o_anim_fade_in');
            this.toggleImagesLazyLoading(false);
        }
        if (!widgetValue || widgetValue === "onHover") {
            const possibleEffects = this.requestUserValueWidgets('animation_effect_opt')[0].possibleValues["selectClass"];
            const possibleDirections = this.requestUserValueWidgets('animation_direction_opt')[0].possibleValues["selectClass"];
            const possibleEffectsAndDirections = possibleEffects.concat(possibleDirections);
            // Remove the classes added by "Effect" and "Direction" options if
            // "Animation" is "None".
            for (const targetClass of targetClassList.value.split(/\s+/g)) {
                if (possibleEffectsAndDirections.indexOf(targetClass) >= 0) {
                    targetClassList.remove(targetClass);
                }
            }
            this.target.style.setProperty('--wanim-intensity', '');
            this.target.style.animationDuration = '';
            this.toggleImagesLazyLoading(true);
        }
        if (widgetValue === "onHover") { // TODO when Image options will be done
            this.trigger_up("option_update", {
                optionName: "ImageTools",
                name: "enable_hover_effect",
            });
        }
    }
    /**
     * Sets the animation intensity.
     *
     * @see this.selectClass for parameters
     */
    animationIntensity(previewMode, widgetValue, params) {
        this.target.style.setProperty('--wanim-intensity', widgetValue);
        this.forceAnimation();
    }
    /**
     *
     */
    async forceAnimation() {
        this.$target.css('animation-name', 'dummy');

        if (this.target.classList.contains('o_animate_on_scroll')) {
            // Trigger a DOM reflow.
            void this.target.offsetWidth;
            this.$target.css('animation-name', '');
            this.target.ownerDocument.defaultView.dispatchEvent(new Event("resize"));
        } else {
            // Trigger a DOM reflow (Needed to prevent the animation from
            // being launched twice when previewing the "Intensity" option).
            await new Promise(resolve => setTimeout(resolve));
            this.target.classList.add('o_animating');
            this.props.updateOverlay(); // TODO overlayVisible: true ?
            this.$scrollingElement[0].classList.add('o_wanim_overflow_xy_hidden');
            this.$target.css('animation-name', '');
            this.$target.one('webkitAnimationEnd oanimationend msAnimationEnd animationend', () => {
                this.$scrollingElement[0].classList.remove('o_wanim_overflow_xy_hidden');
                this.target.classList.remove('o_animating');
            });
        }
    }
    /**
     * Removes or adds the lazy loading on images because animated images can
     * appear before or after their parents and cause bugs in the animations.
     * To put "lazy" back on the "loading" attribute, we simply remove the
     * attribute as it is automatically added on page load.
     *
     * @param {Boolean} lazy
     */
    toggleImagesLazyLoading(lazy) {
        const imgEls = this.target.matches('img')
            ? [this.target]
            : this.target.querySelectorAll('img');
        for (const imgEl of imgEls) {
            if (lazy) {
                // Let the automatic system add the loading attribute
                imgEl.removeAttribute('loading');
            } else {
                imgEl.loading = 'eager';
            }
        }
    }
}
registry.category("snippets_options").add("website.WebsiteAnimate", {
    component: WebsiteAnimate,
    template: "website.WebsiteAnimate",
    selector: ".o_animable, section .row > div, img, .fa, .btn, .o_animated_text",
    exclude: "[data-oe-xpath], .o_not-animable, .s_col_no_resize.row > div, .s_col_no_resize",
});
