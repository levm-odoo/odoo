import { MediaDialog } from "@web_editor/components/media_dialog/media_dialog";
import options from "@web_editor/js/editor/snippets.options";

options.registry.Accordion = options.Class.extend({
    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Allows to select a font awesome icon with media dialog.
     */
    async defineCustomIcon(previewMode, widgetValue, params) {
        const media = document.createElement("i");
        media.className = params.customActiveIcon === "true" ? this.$target[0].dataset.activeCustomIcon : this.$target[0].dataset.inactiveCustomIcon;
        this.call("dialog", "add", MediaDialog, {
            noImages: true,
            noDocuments: true,
            noVideos: true,
            media,
            save: icon => {
                const customClass = icon.className;
                const activeIconsEls = this.$target[0].querySelectorAll(".o_custom_icon_active i");
                const inactiveIconsEls = this.$target[0].querySelectorAll(".o_custom_icon_inactive i");
                const iconsEls = params.customActiveIcon === "true" ? activeIconsEls : inactiveIconsEls;
                iconsEls.forEach(iconEl => {
                    iconEl.removeAttribute("class");
                    iconEl.classList.add(...customClass.split(" "));
                });
                if (iconsEls === activeIconsEls) {
                    this.$target[0].dataset.activeCustomIcon = customClass;
                } else {
                    this.$target[0].dataset.inactiveCustomIcon = customClass;
                }
            }
        });
    },
    /**
     * Allows to add the necessary HTML structure for custom icons
     */
    customIcon(previewMode, widgetValue, params) {
        const accordionButtonEls = this.$target[0].querySelectorAll(".accordion-button");
        const activeCustomIcon = this.$target[0].dataset.activeCustomIcon || "fa fa-arrow-up";
        const inactiveCustomIcon = this.$target[0].dataset.inactiveCustomIcon || "fa fa-arrow-down";
        const customIconsEls = params.selectIcons ?
            `<span class="o_custom_icon_active position-absolute top-0 end-0 bottom-0 start-0 d-flex align-items-center justify-content-center">
                <i class="${activeCustomIcon}"></i>
            </span>
            <span class="o_custom_icon_inactive position-absolute top-0 end-0 bottom-0 start-0 d-flex align-items-center justify-content-center">
                <i class="${inactiveCustomIcon}"></i>
            </span>` : "";
        if (widgetValue) {
            if (widgetValue === "custom") {
                this.$target[0].dataset.activeCustomIcon = activeCustomIcon;
                this.$target[0].dataset.inactiveCustomIcon = inactiveCustomIcon;
            }
            accordionButtonEls.forEach(item => {
                const customIconWrapEl = item.querySelector(".o_custom_icons_wrap");
                if (customIconWrapEl) {
                    customIconWrapEl.innerHTML = customIconsEls;
                } else {
                    const newCustomIconWrapEl = document.createElement("span");
                    newCustomIconWrapEl.className = "o_custom_icons_wrap position-relative d-block flex-shrink-0 overflow-hidden";
                    item.appendChild(newCustomIconWrapEl);
                    newCustomIconWrapEl.innerHTML = customIconsEls;
                }
            });
        } else {
            accordionButtonEls.forEach(item => {
                const customIconWrapEl = item.querySelector(".o_custom_icons_wrap");
                if (customIconWrapEl) {
                    customIconWrapEl.remove();
                }
            });
        }
        if (widgetValue != "custom" && !previewMode) {
            delete this.$target[0].dataset.activeCustomIcon;
            delete this.$target[0].dataset.inactiveCustomIcon;
        }
    },
});
