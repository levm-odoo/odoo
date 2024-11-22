import { Plugin } from "@html_editor/plugin";
import { closestElement } from "@html_editor/utils/dom_traversal";
import { parseHTML } from "@html_editor/utils/html";
import { withSequence } from "@html_editor/utils/resource";
import { _t } from "@web/core/l10n/translation";
import { closestBlock } from "@html_editor/utils/blocks";
import { paragraphRelatedElements } from "@html_editor/utils/dom_info";
import { fillEmpty } from "@html_editor/utils/dom";

function isAvailable(selection) {
    return !closestElement(selection.anchorNode, ".o_editor_banner");
}
export class BannerPlugin extends Plugin {
    static id = "banner";
    static dependencies = ["history", "dom", "emoji", "selection"];
    resources = {
        user_commands: [
            {
                id: "banner_info",
                title: _t("Banner Info"),
                description: _t("Insert an info banner"),
                icon: "fa-info-circle",
                isAvailable,
                run: () => {
                    this.insertBanner(_t("Banner Info"), "💡", "info");
                },
            },
            {
                id: "banner_success",
                title: _t("Banner Success"),
                description: _t("Insert a success banner"),
                icon: "fa-check-circle",
                isAvailable,
                run: () => {
                    this.insertBanner(_t("Banner Success"), "✅", "success");
                },
            },
            {
                id: "banner_warning",
                title: _t("Banner Warning"),
                description: _t("Insert a warning banner"),
                icon: "fa-exclamation-triangle",
                isAvailable,
                run: () => {
                    this.insertBanner(_t("Banner Warning"), "⚠️", "warning");
                },
            },
            {
                id: "banner_danger",
                title: _t("Banner Danger"),
                description: _t("Insert a danger banner"),
                icon: "fa-exclamation-circle",
                isAvailable,
                run: () => {
                    this.insertBanner(_t("Banner Danger"), "❌", "danger");
                },
            },
        ],
        powerbox_categories: withSequence(20, { id: "banner", name: _t("Banner") }),
        powerbox_items: [
            {
                commandId: "banner_info",
                categoryId: "banner",
            },
            {
                commandId: "banner_success",
                categoryId: "banner",
            },
            {
                commandId: "banner_warning",
                categoryId: "banner",
            },
            {
                commandId: "banner_danger",
                categoryId: "banner",
            },
        ],
        power_buttons_visibility_predicates: ({ anchorNode }) =>
            !closestElement(anchorNode, ".o_editor_banner"),
    };

    setup() {
        this.addDomListener(this.editable, "click", (e) => {
            if (e.target.classList.contains("o_editor_banner_icon")) {
                this.onBannerEmojiChange(e.target);
            }
        });
    }

    insertBanner(title, emoji, alertClass) {
        const selection = this.dependencies.selection.getEditableSelection();
        const blockEl = closestBlock(selection.anchorNode);
        let bannerContentNode;
        if (paragraphRelatedElements.includes(blockEl.tagName)) {
            bannerContentNode = this.document.createElement(blockEl.nodeName);
            bannerContentNode.append(...blockEl.childNodes);
        } else if (blockEl.nodeName === "LI") {
            bannerContentNode = this.document.createElement("p");
            bannerContentNode.append(...blockEl.childNodes);
            fillEmpty(blockEl);
        } else {
            bannerContentNode = this.document.createElement("p");
            fillEmpty(bannerContentNode);
        }
        const bannerElement = parseHTML(
            this.document,
            `<div class="o_editor_banner user-select-none o_not_editable lh-1 d-flex align-items-center alert alert-${alertClass} pb-0 pt-3" role="status" contenteditable="false">
                <i class="o_editor_banner_icon mb-3 fst-normal" aria-label="${title}">${emoji}</i>
                <div class="w-100 px-3" contenteditable="true">
                    ${bannerContentNode.outerHTML}
                </div>
            </div>`
        ).childNodes[0];
        this.dependencies.dom.insert(bannerElement);
        this.dependencies.dom.setTag({ tagName: "P" });
        // If the first child of editable is contenteditable false element
        // a chromium bug prevents selecting the container. Prepend a
        // zero-width space so it's no longer the first child.
        if (this.editable.firstChild === bannerElement) {
            const zws = document.createTextNode("\u200B");
            bannerElement.before(zws);
        }
        this.dependencies.selection.setCursorEnd(
            bannerElement.querySelector(`.o_editor_banner > div > ${bannerContentNode.tagName}`)
        );
        this.dependencies.history.addStep();
    }

    onBannerEmojiChange(iconElement) {
        this.dependencies.emoji.showEmojiPicker({
            target: iconElement,
            onSelect: (emoji) => {
                iconElement.textContent = emoji;
                this.dependencies.history.addStep();
            },
        });
    }
}
