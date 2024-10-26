import { Plugin } from "@html_editor/plugin";
import { EmojiPicker } from "@web/core/emoji_picker/emoji_picker";
import { _t } from "@web/core/l10n/translation";

export class EmojiPlugin extends Plugin {
    static id = "emoji";
    static dependencies = ["history", "overlay", "dom", "selection"];
    static shared = ["showEmojiPicker"];
    resources = {
        user_commands: [
            {
                id: "addEmoji",
                label: _t("Emoji"),
                description: _t("Add an emoji"),
                icon: "fa-smile-o",
                run: this.showEmojiPicker.bind(this),
            },
        ],
        powerboxItems: [
            {
                category: "widget",
                commandId: "addEmoji",
            },
        ],
    };

    setup() {
        this.overlay = this.dependencies.overlay.createOverlay(EmojiPicker, {
            hasAutofocus: true,
            className: "popover",
        });
    }

    /**
     * @param {Object} options
     * @param {HTMLElement} options.target - The target element to position the overlay.
     * @param {Function} [options.onSelect] - The callback function to handle the selection of an emoji.
     * If not provided, the emoji will be inserted into the editor and a step will be trigerred.
     */
    showEmojiPicker({ target, onSelect } = {}) {
        this.overlay.open({
            props: {
                close: () => {
                    this.overlay.close();
                    this.dependencies.selection.focusEditable();
                },
                onSelect: (str) => {
                    if (onSelect) {
                        onSelect(str);
                        return;
                    }
                    this.dependencies.dom.domInsert(str);
                    this.dependencies.history.addStep();
                },
            },
            target,
        });
    }
}
