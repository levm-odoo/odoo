import { markEventHandled } from "@web/core/utils/misc";

import {
    Component,
    onMounted,
    onPatched,
    onWillPatch,
    onWillStart,
    onWillUnmount,
    useEffect,
    useRef,
    useState,
} from "@odoo/owl";

import { loadBundle } from "@web/core/assets";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";
import { useAutofocus, useService } from "@web/core/utils/hooks";
import { fuzzyLookup } from "@web/core/utils/search";

/**
 *
 * @param {import("@web/core/utils/hooks").Ref} [ref]
 * @param {Object} props
 * @param {import("@web/core/popover/popover_service").PopoverServiceAddOptions} [options]
 * @param {function} [props.onSelect]
 * @param {function} [props.onClose]
 */
export function useEmojiPicker(ref, props, options = {}) {
    const targets = [];
    const state = useState({ isOpen: false });
    const newOptions = {
        ...options,
        onClose: () => {
            state.isOpen = false;
            options.onClose?.();
        },
    };
    const popover = usePopover(EmojiPicker, { ...newOptions, animation: false });
    props.storeScroll = {
        scrollValue: 0,
        set: (value) => {
            props.storeScroll.scrollValue = value;
        },
        get: () => {
            return props.storeScroll.scrollValue;
        },
    };

    /**
     * @param {import("@web/core/utils/hooks").Ref} ref
     */
    function add(ref, onSelect, { show = false } = {}) {
        const toggler = () => toggle(ref, onSelect);
        targets.push([ref, toggler]);
        if (!ref.el) {
            return;
        }
        ref.el.addEventListener("click", toggler);
        ref.el.addEventListener("mouseenter", loadEmoji);
        if (show) {
            ref.el.click();
        }
    }

    function toggle(ref, onSelect = props.onSelect) {
        if (popover.isOpen) {
            popover.close();
        } else {
            state.isOpen = true;
            popover.open(ref.el, { ...props, onSelect });
        }
    }

    if (ref) {
        add(ref);
    }
    onMounted(() => {
        for (const [ref, toggle] of targets) {
            if (!ref.el) {
                continue;
            }
            ref.el.addEventListener("click", toggle);
            ref.el.addEventListener("mouseenter", loadEmoji);
        }
    });
    onWillPatch(() => {
        for (const [ref, toggle] of targets) {
            if (!ref.el) {
                continue;
            }
            ref.el.removeEventListener("click", toggle);
            ref.el.removeEventListener("mouseenter", loadEmoji);
        }
    });
    onPatched(() => {
        for (const [ref, toggle] of targets) {
            if (!ref.el) {
                continue;
            }
            ref.el.addEventListener("click", toggle);
            ref.el.addEventListener("mouseenter", loadEmoji);
        }
    });
    Object.assign(state, { add });
    return state;
}

const loadingListeners = [];

export const loader = {
    loadEmoji: () => loadBundle("web.assets_emoji"),
    /** @type {{ emojiValueToShortcode: Object<string, string> }} */
    loaded: undefined,
    onEmojiLoaded(cb) {
        loadingListeners.push(cb);
    },
};

/**
 * @returns {import("@web/core/emoji_picker/emoji_data")}
 */
export async function loadEmoji() {
    const res = { categories: [], emojis: [] };
    try {
        await loader.loadEmoji();
        const { getCategories, getEmojis } = odoo.loader.modules.get(
            "@web/core/emoji_picker/emoji_data"
        );
        res.categories = getCategories();
        res.emojis = getEmojis();
        return res;
    } catch {
        // Could be intentional (tour ended successfully while emoji still loading)
        return res;
    } finally {
        if (!loader.loaded) {
            loader.loaded = { emojiValueToShortcode: {} };
            for (const emoji of res.emojis) {
                const value = emoji.codepoints;
                const shortcode = emoji.shortcodes[0];
                loader.loaded.emojiValueToShortcode[value] = shortcode;
                for (const listener of loadingListeners) {
                    listener();
                }
                loadingListeners.length = 0;
            }
        }
    }
}

export const EMOJI_PER_ROW = 9;
export const EMOJI_PICKER_PROPS = [
    "close?",
    "onClose?",
    "onSelect",
    "state?",
    "storeScroll?",
    "class?",
    "style?",
];

export class EmojiPicker extends Component {
    static props = EMOJI_PICKER_PROPS;
    static template = "web.EmojiPicker";

    categories = null;
    emojis = null;
    shouldScrollElem = null;
    lastSearchTerm;

    setup() {
        this.gridRef = useRef("emoji-grid");
        this.ui = useState(useService("ui"));
        this.isMobileOS = isMobileOS();
        this.state = useState({
            activeEmojiIndex: 0,
            categoryId: null,
            searchTerm: "",
        });
        this.frequentEmojiService = useState(useService("mail.frequent.emoji"));
        useAutofocus();
        onWillStart(async () => {
            const { categories, emojis } = await loadEmoji();
            this.categories = categories;
            this.emojis = emojis;
            this.emojiByCodepoints = Object.fromEntries(
                this.emojis.map((emoji) => [emoji.codepoints, emoji])
            );
            this.state.categoryId = this.categories[0]?.sortId;
            this.recentCategory = {
                name: "Frequently used",
                displayName: _t("Frequently used"),
                title: "🕓",
                sortId: 0,
            };
        });
        onMounted(() => {
            if (this.emojis.length === 0) {
                return;
            }
            this.highlightActiveCategory();
            if (this.props.storeScroll) {
                this.gridRef.el.scrollTop = this.props.storeScroll.get();
            }
        });
        onPatched(() => {
            if (this.emojis.length === 0) {
                return;
            }
            if (this.shouldScrollElem) {
                this.shouldScrollElem = false;
                const getElement = () =>
                    this.gridRef.el.querySelector(
                        `.o-EmojiPicker-category[data-category="${this.state.categoryId}"`
                    );
                const elem = getElement();
                if (elem) {
                    elem.scrollIntoView();
                } else {
                    this.shouldScrollElem = getElement;
                }
            }
        });
        useEffect(
            () => {
                if (this.searchTerm) {
                    this.gridRef.el.scrollTop = 0;
                    this.state.categoryId = null;
                } else {
                    if (this.lastSearchTerm) {
                        this.gridRef.el.scrollTop = 0;
                    }
                    this.highlightActiveCategory();
                }
                this.lastSearchTerm = this.searchTerm;
            },
            () => [this.searchTerm]
        );
        onWillUnmount(() => {
            if (!this.gridRef.el) {
                return;
            }
            if (this.props.storeScroll) {
                this.props.storeScroll.set(this.gridRef.el.scrollTop);
            }
        });
    }

    get searchTerm() {
        return this.props.state ? this.props.state.searchTerm : this.state.searchTerm;
    }

    set searchTerm(value) {
        if (this.props.state) {
            this.props.state.searchTerm = value;
        } else {
            this.state.searchTerm = value;
        }
    }

    get itemsNumber() {
        return this.recentEmojis.length + this.getEmojis().length;
    }

    get recentEmojis() {
        const recent = Object.entries(this.frequentEmojiService.all)
            .sort(([, usage_1], [, usage_2]) => usage_2 - usage_1)
            .map(([codepoints]) => this.emojiByCodepoints[codepoints]);
        if (this.searchTerm && recent.length > 0) {
            return fuzzyLookup(this.searchTerm, recent, (emoji) =>
                [emoji.name, ...emoji.keywords, ...emoji.emoticons, ...emoji.shortcodes].join(" ")
            );
        }
        return recent.slice(0, 42);
    }

    onClick(ev) {
        markEventHandled(ev, "emoji.selectEmoji");
    }

    onKeydown(ev) {
        switch (ev.key) {
            case "ArrowUp": {
                const newIndex = this.state.activeEmojiIndex - EMOJI_PER_ROW;
                if (newIndex >= 0) {
                    this.state.activeEmojiIndex = newIndex;
                }
                break;
            }
            case "ArrowDown": {
                const newIndex = this.state.activeEmojiIndex + EMOJI_PER_ROW;
                if (newIndex < this.itemsNumber) {
                    this.state.activeEmojiIndex = newIndex;
                }
                break;
            }
            case "ArrowRight": {
                if (this.state.activeEmojiIndex + 1 === this.itemsNumber) {
                    break;
                }
                this.state.activeEmojiIndex++;
                ev.preventDefault();
                break;
            }
            case "ArrowLeft": {
                const newIndex = Math.max(this.state.activeEmojiIndex - 1, 0);
                if (newIndex !== this.state.activeEmojiIndex) {
                    this.state.activeEmojiIndex = newIndex;
                    ev.preventDefault();
                }
                break;
            }
            case "Enter":
                ev.preventDefault();
                this.gridRef.el
                    .querySelector(
                        `.o-EmojiPicker-content .o-Emoji[data-index="${this.state.activeEmojiIndex}"]`
                    )
                    ?.click();
                break;
            case "Escape":
                this.props.close?.();
                this.props.onClose?.();
                ev.stopPropagation();
        }
    }

    getEmojis() {
        let emojisToDisplay = [...this.emojis];
        const recentEmojis = this.recentEmojis;
        if (recentEmojis.length > 0 && this.searchTerm) {
            emojisToDisplay = emojisToDisplay.filter((emoji) => !recentEmojis.includes(emoji));
        }
        if (this.searchTerm.length > 1) {
            return fuzzyLookup(this.searchTerm, emojisToDisplay, (emoji) =>
                [emoji.name, ...emoji.keywords, ...emoji.emoticons, ...emoji.shortcodes].join(" ")
            );
        }
        return emojisToDisplay;
    }

    selectCategory(ev) {
        const id = Number(ev.currentTarget.dataset.id);
        this.searchTerm = "";
        this.state.categoryId = id;
        this.shouldScrollElem = true;
    }

    selectEmoji(ev) {
        const codepoints = ev.currentTarget.dataset.codepoints;
        const resetOnSelect = !ev.shiftKey && !this.ui.isSmall;
        this.props.onSelect(codepoints, resetOnSelect);
        this.frequentEmojiService.incrementEmojiUsage(codepoints);
        if (resetOnSelect) {
            this.gridRef.el.scrollTop = 0;
            this.props.close?.();
            this.props.onClose?.();
        }
    }

    highlightActiveCategory() {
        if (!this.gridRef || !this.gridRef.el) {
            return;
        }
        const coords = this.gridRef.el.getBoundingClientRect();
        const res = document.elementFromPoint(coords.x, coords.y + 1); // +1 for Firefox
        if (!res) {
            return;
        }
        this.state.categoryId = parseInt(res.dataset.category);
    }
}
