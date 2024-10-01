import { markEventHandled } from "@web/core/utils/misc";

import {
    App,
    Component,
    onMounted,
    onPatched,
    onWillPatch,
    onWillStart,
    onWillUnmount,
    useComponent,
    useEffect,
    useExternalListener,
    useRef,
    useState,
    xml,
} from "@odoo/owl";

import { loadBundle } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { usePopover } from "@web/core/popover/popover_hook";
import { fuzzyLookup } from "@web/core/utils/search";
import { useAutofocus, useService } from "@web/core/utils/hooks";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { Deferred } from "../utils/concurrency";
import { Dialog } from "../dialog/dialog";
import { getTemplate } from "@web/core/templates";

export function useEmojiPicker(...args) {
    return usePicker(EmojiPicker, ...args);
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

/** @returns {Promise<{ categories: Object[], emojis: Object[] }>")} */
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

export const PICKER_PROPS = [
    "PickerComponent?",
    "close?",
    "onClose?",
    "onSelect",
    "state?",
    "storeScroll?",
    "mobile?",
];

export class EmojiPicker extends Component {
    static props = [...PICKER_PROPS, "class?"];
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
        this.frequentEmojiService = useState(useService("web.frequent.emoji"));
        useAutofocus();
        onWillStart(async () => {
            const { categories, emojis } = await loadEmoji();
            this.categories = categories;
            this.emojis = emojis;
            this.emojiByCodepoints = Object.fromEntries(
                this.emojis.map((emoji) => [emoji.codepoints, emoji])
            );
            this.recentCategory = {
                name: "Frequently used",
                displayName: _t("Frequently used"),
                title: "🕓",
                sortId: 0,
            };
            this.state.categoryId = this.recentEmojis.length
                ? this.recentCategory.sortId
                : this.categories[0].sortId;
        });
        onMounted(() => {
            if (this.emojis.length === 0) {
                return;
            }
            // detect amount of emojis per row for navigation
            const emojis = Array.from(
                this.gridRef.el.querySelectorAll(
                    ".o-EmojiPicker-category[data-category='1'] ~ .o-Emoji"
                )
            );
            const baseOffset = emojis[0].offsetTop;
            const breakIndex = emojis.findIndex((item) => item.offsetTop > baseOffset);
            this.EMOJI_PER_ROW = breakIndex === -1 ? emojis.length : breakIndex;
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
            return fuzzyLookup(this.searchTerm, recent, (emoji) => [
                emoji.name,
                ...emoji.keywords,
                ...emoji.emoticons,
                ...emoji.shortcodes,
            ]);
        }
        return recent.slice(0, 42);
    }

    onClick(ev) {
        markEventHandled(ev, "emoji.selectEmoji");
    }

    onKeydown(ev) {
        switch (ev.key) {
            case "ArrowUp": {
                const newIndex = Math.max(this.state.activeEmojiIndex - this.EMOJI_PER_ROW, 0);
                const prevEl = this.gridRef.el.querySelector(
                    `.o-Emoji[data-index='${this.state.activeEmojiIndex}']`
                );
                const newEl = this.gridRef.el.querySelector(`.o-Emoji[data-index='${newIndex}']`);
                if (prevEl.dataset.category === newEl.dataset.category) {
                    this.state.activeEmojiIndex = newIndex;
                    if (!isElementVisible(newEl, this.gridRef.el, { offset: 50 })) {
                        // top-offset takes sticky section into account
                        this.gridRef.el.scrollTop -= this.gridRef.el.clientHeight / 2;
                    }
                    break;
                }
                const targetEls = this.gridRef.el.querySelectorAll(
                    `.o-Emoji[data-category='${newEl.dataset.category}']`
                );
                let idx = targetEls.length - 1;
                const prevCol =
                    parseInt(prevEl.dataset.index) - parseInt(targetEls[idx].dataset.index) - 1;
                while (idx % this.EMOJI_PER_ROW !== prevCol && idx > 0) {
                    idx--;
                }
                this.state.activeEmojiIndex = parseInt(targetEls[idx].dataset.index);
                if (!isElementVisible(newEl, this.gridRef.el, { offset: 50 })) {
                    // top-offset takes sticky section into account
                    this.gridRef.el.scrollTop -= this.gridRef.el.clientHeight / 2;
                }
                break;
            }
            case "ArrowDown": {
                const newIndex = Math.min(
                    this.state.activeEmojiIndex + this.EMOJI_PER_ROW,
                    this.itemsNumber - 1
                );
                const prevEl = this.gridRef.el.querySelector(
                    `.o-Emoji[data-index='${this.state.activeEmojiIndex}']`
                );
                const newEl = this.gridRef.el.querySelector(`.o-Emoji[data-index='${newIndex}']`);
                if (prevEl.dataset.category === newEl.dataset.category) {
                    this.state.activeEmojiIndex = newIndex;
                    if (!isElementVisible(newEl, this.gridRef.el, { offset: 20 })) {
                        this.gridRef.el.scrollTop += this.gridRef.el.clientHeight / 2;
                    }
                    break;
                }
                const prevEls = this.gridRef.el.querySelectorAll(
                    `.o-Emoji[data-category='${prevEl.dataset.category}']`
                );
                const prevCol =
                    (parseInt(prevEl.dataset.index) - parseInt(prevEls[0].dataset.index)) %
                    this.EMOJI_PER_ROW;
                const targetEls = this.gridRef.el.querySelectorAll(
                    `.o-Emoji[data-category='${newEl.dataset.category}']`
                );
                let idx = Math.min(this.EMOJI_PER_ROW - 1, targetEls.length);
                while (idx % this.EMOJI_PER_ROW > prevCol && idx > 0) {
                    idx--;
                }
                this.state.activeEmojiIndex = parseInt(targetEls[idx].dataset.index);
                if (!isElementVisible(newEl, this.gridRef.el, { offset: 10 })) {
                    this.gridRef.el.scrollTop += this.gridRef.el.clientHeight / 2;
                }
                break;
            }
            case "ArrowRight": {
                if (this.state.activeEmojiIndex + 1 === this.itemsNumber) {
                    break;
                }
                this.state.activeEmojiIndex++;
                const newEl = this.gridRef.el.querySelector(
                    `.o-Emoji[data-index='${this.state.activeEmojiIndex}']`
                );
                if (!isElementVisible(newEl, this.gridRef.el, { offset: 20 })) {
                    this.gridRef.el.scrollTop += this.gridRef.el.clientHeight / 2;
                }
                ev.preventDefault();
                break;
            }
            case "ArrowLeft": {
                const newIndex = Math.max(this.state.activeEmojiIndex - 1, 0);
                if (newIndex !== this.state.activeEmojiIndex) {
                    this.state.activeEmojiIndex = newIndex;
                    const newEl = this.gridRef.el.querySelector(
                        `.o-Emoji[data-index='${this.state.activeEmojiIndex}']`
                    );
                    if (!isElementVisible(newEl, this.gridRef.el, { offset: 50 })) {
                        // top-offset takes sticky section into account
                        this.gridRef.el.scrollTop -= this.gridRef.el.clientHeight / 2;
                    }
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
            return fuzzyLookup(this.searchTerm, emojisToDisplay, (emoji) => [
                emoji.name,
                ...emoji.keywords,
                ...emoji.emoticons,
                ...emoji.shortcodes,
            ]);
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
        let resetOnSelect = !ev.shiftKey;
        const res = this.props.onSelect(codepoints, resetOnSelect);
        if (res === false) {
            resetOnSelect = false;
        }
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
        const res = document.elementFromPoint(coords.x + 10, coords.y + 10);
        if (!res) {
            return;
        }
        this.state.categoryId = parseInt(res.dataset.category);
        console.log(this.state.categoryId);
    }
}

/**
 * @param {() => {}} PickerComponent
 * @param {import("@web/core/utils/hooks").Ref} [ref]
 * @param {Object} props
 * @param {import("@web/core/popover/popover_service").PopoverServiceAddOptions} [options]
 * @param {function} [props.onSelect] function that is invoked when an item in picker has been selected.
 *   When explicit value `false` is returned, this will keep the picker open (= it won't auto-close it)
 * @param {function} [props.onClose]
 */
export function usePicker(PickerComponent, ref, props, options = {}) {
    const component = useComponent();
    const targets = [];
    const state = useState({ isOpen: false });
    const ui = useState(useService("ui"));
    const dialog = useService("dialog");
    let remove;
    const newOptions = {
        ...options,
        onClose: () => {
            state.isOpen = false;
            options.onClose?.();
        },
    };
    const popover = usePopover(PickerComponent, { ...newOptions, animation: false });
    props.storeScroll = {
        scrollValue: 0,
        set: (value) => {
            props.storeScroll.scrollValue = value;
        },
        get: () => props.storeScroll.scrollValue,
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

    function open(ref, openProps) {
        state.isOpen = true;
        if (ui.isSmall) {
            const def = new Deferred();
            const pickerMobileProps = {
                PickerComponent,
                onSelect: (...args) => {
                    const func = openProps?.onSelect ?? props?.onSelect;
                    const res = func?.(...args);
                    def.resolve(true);
                    return res;
                },
            };
            if (ref.el) {
                pickerMobileProps.close = () => remove();
                const app = new App(PickerMobile, {
                    name: "Popout",
                    env: component.env,
                    props: pickerMobileProps,
                    getTemplate,
                });
                app.mount(ref.el);
                remove = () => {
                    state.isOpen = false;
                    props.onClose?.();
                    app.destroy();
                };
            } else {
                remove = dialog.add(PickerMobileInDialog, pickerMobileProps, {
                    context: component,
                    onClose: () => {
                        state.isOpen = false;
                        return def.resolve(false);
                    },
                });
            }
            return def;
        }
        return popover.open(ref.el, props);
    }

    function close() {
        remove?.();
        popover.close?.();
    }

    function toggle(ref, onSelect = props.onSelect) {
        if (state.isOpen) {
            close();
        } else {
            open(ref, { ...props, onSelect });
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
    Object.assign(state, { open, close, toggle });
    return state;
}

class PickerMobile extends Component {
    static props = [...PICKER_PROPS, "onClose?"];
    static template = xml`
        <t t-component="props.PickerComponent" t-props="pickerProps"/>
    `;

    get pickerProps() {
        return {
            ...this.props,
            onSelect: (...args) => this.props.onSelect(...args),
            mobile: true,
        };
    }
}

class PickerMobileInDialog extends PickerMobile {
    static components = { Dialog };
    static props = [...PICKER_PROPS, "onClose?"];
    static template = xml`
        <Dialog size="'lg'" header="false" footer="false" contentClass="'o-discuss-mobileContextMenu d-flex position-absolute bottom-0 rounded-0 h-50 bg-100'" bodyClass="'p-1'">
            <div class="h-100" t-ref="root">
                <t t-component="props.PickerComponent" t-props="pickerProps"/>
            </div>
        </Dialog>
    `;

    setup() {
        super.setup();
        this.root = useRef("root");
        useExternalListener(
            window,
            "click",
            (ev) => {
                if (ev.target !== this.root.el && !this.root.el.contains(ev.target)) {
                    this.props.close?.();
                }
            },
            { capture: true }
        );
    }
}

function isElementVisible(el, holder, { offset = 0 } = {}) {
    holder = holder || document.body;
    const { top, bottom, height } = el.getBoundingClientRect();
    let { top: holderTop, bottom: holderBottom } = holder.getBoundingClientRect();
    holderTop += offset;
    holderBottom -= offset;

    return top - offset <= holderTop ? holderTop - top <= height : bottom - holderBottom <= height;
}
