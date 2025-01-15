import { Plugin } from "@html_editor/plugin";
import { Component, onWillDestroy, useEnv } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { defaultBuilderComponents } from "../builder_components/default_builder_components";
import { withSequence } from "@html_editor/utils/resource";
import { useDomState } from "../builder_components/utils";
import { getScrollingElement } from "@web/core/utils/scrolling";

class AnimateOptionPlugin extends Plugin {
    static id = "AnimateOption";
    resources = {
        builder_options: [
            withSequence(20, {
                OptionComponent: AnimateOption,
                selector: ".o_animable, section .row > div, img, .fa, .btn, .o_animated_text",
                exclude:
                    "[data-oe-xpath], .o_not-animable, .s_col_no_resize.row > div, .s_col_no_resize",
                // todo: to implement
                // textSelector: ".o_animated_text",
            }),
        ],
        builder_actions: this.getActions(),
        normalize_handlers: this.normalize.bind(this),
        clean_for_save_handlers: this.cleanForSave.bind(this),
    };

    setup() {
        this.scrollingElement = getScrollingElement(this.document);
    }

    getActions() {
        const effectWithFadein = ["onAppearance", "onScroll"];
        return {
            setAnimationMode: {
                // todo: to remove after having the commit of louis
                isApplied: () => true,
                clean: ({ editingElement, value: effectName, dependencyManager, nextAction }) => {
                    this.scrollingElement.classList.remove("o_wanim_overflow_xy_hidden");
                    editingElement.classList.remove(
                        "o_animating",
                        "o_animate_both_scroll",
                        "o_visible",
                        "o_animated",
                        "o_animate_out"
                    );
                    editingElement.style.animationDelay = "";
                    editingElement.style.animationPlayState = "";
                    editingElement.style.animationName = "";
                    editingElement.style.visibility = "";

                    if (effectName === "onScroll") {
                        delete editingElement.dataset.scrollZoneStart;
                        delete editingElement.dataset.scrollZoneEnd;
                    }
                    if (effectName === "onHover") {
                        // todo: to implement
                        // this.trigger_up("option_update", {
                        //     optionName: "ImageTools",
                        //     name: "disable_hover_effect",
                        // });
                    }

                    const isNextEffectFadein = effectWithFadein.includes(nextAction.value);
                    if (!isNextEffectFadein) {
                        this.removeEffectAndDirectionClasses(
                            dependencyManager,
                            editingElement.classList
                        );
                        editingElement.style.setProperty("--wanim-intensity", "");
                        editingElement.style.animationDuration = "";
                        this.setImagesLazyLoading(editingElement, true);
                    }
                },
                apply: ({ editingElement, value: effectName }) => {
                    if (effectWithFadein.includes(effectName)) {
                        editingElement.classList.add("o_anim_fade_in");
                        this.setImagesLazyLoading(editingElement, false);
                    }
                    if (effectName === "onScroll") {
                        editingElement.dataset.scrollZoneStart = 0;
                        editingElement.dataset.scrollZoneEnd = 100;
                    }
                    if (effectName === "onHover") {
                        // todo: to implement
                        // Pause the history until the hover effect is applied in
                        // "setImgShapeHoverEffect". This prevents saving the intermediate
                        // steps done (in a tricky way) up to that point.
                        // this.options.wysiwyg.odooEditor.historyPauseSteps();
                        // this.trigger_up("option_update", {
                        //     optionName: "ImageTools",
                        //     name: "enable_hover_effect",
                        // });
                    }
                },
            },
            setAnimateIntensity: {
                getValue: ({ editingElement }) => {
                    const intensity = parseInt(
                        window
                            .getComputedStyle(editingElement)
                            .getPropertyValue("--wanim-intensity")
                    );
                    return intensity;
                },
                apply: ({ editingElement, value }) => {},
            },
            forceAnimation: {
                // todo: to remove after having the commit of louis
                isActive: () => true,
                apply: () => {
                    console.warn("todo");
                },
            },
        };
    }

    removeEffectAndDirectionClasses(dependencyManager, targetClassList) {
        const classes = getSelectableClasses(dependencyManager, "animation_effect_opt").concat(
            getSelectableClasses(dependencyManager, "animation_direction_opt")
        );
        const classesToRemove = intersect(classes, [...targetClassList]);
        for (const className of classesToRemove) {
            targetClassList.remove(className);
        }
    }

    /**
     * Removes or adds the lazy loading on images because animated images can
     * appear before or after their parents and cause bugs in the animations.
     * To put "lazy" back on the "loading" attribute, we simply remove the
     * attribute as it is automatically added on page load.
     *
     * @private
     * @param {Boolean} isLazy
     */
    setImagesLazyLoading(editingElement, isLazy) {
        const imgEls = editingElement.matches("img")
            ? [editingElement]
            : editingElement.querySelectorAll("img");
        for (const imgEl of imgEls) {
            if (isLazy) {
                // Let the automatic system add the loading attribute
                imgEl.removeAttribute("loading");
            } else {
                imgEl.loading = "eager";
            }
        }
    }

    normalize(root) {
        const previewEls = [...root.querySelectorAll(".o_animate_preview")];
        if (root.classList.contains("o_animate_preview")) {
            previewEls.push(root);
        }
        for (const el of previewEls) {
            if (el.classList.contains("o_animate")) {
                el.classList.remove("o_animate_preview");
            }
        }

        const animateEls = [...root.querySelectorAll(".o_animate")];
        if (root.classList.contains("o_animate")) {
            animateEls.push(root);
        }
        for (const el of animateEls) {
            if (!el.classList.contains("o_animate_preview")) {
                el.classList.add("o_animate_preview");
            }
        }
    }
    cleanForSave({ root }) {
        for (const el of root.querySelectorAll(".o_animate_preview")) {
            el.classList.remove("o_animate_preview");
        }
    }
}
registry.category("website-plugins").add(AnimateOptionPlugin.id, AnimateOptionPlugin);

class AnimateOption extends Component {
    static template = "html_builder.AnimateOption";
    static components = { ...defaultBuilderComponents };
    static props = {};

    setup() {
        const env = useEnv();

        const dependencyManager = env.dependencyManager;

        this.state = useDomState((editingElement) => {
            const hasAnimateClass = editingElement.classList.contains("o_animate");
            return {
                hasAnimateClass: hasAnimateClass,
                canHover: editingElement.tagName === "IMG",
                isLimitedAnimation: this.limitedAnimations.some((className) =>
                    editingElement.classList.contains(className)
                ),
                showIntensity: this.shouldShowIntensity(
                    editingElement,
                    dependencyManager,
                    hasAnimateClass
                ),
            };
        });
    }
    get limitedAnimations() {
        // Animations for which the "On Scroll" and "Direction" options are not
        // available.
        return [
            "o_anim_flash",
            "o_anim_pulse",
            "o_anim_shake",
            "o_anim_tada",
            "o_anim_flip_in_x",
            "o_anim_flip_in_y",
        ];
    }

    shouldShowIntensity(editingElement, dependencyManager, hasAnimateClass) {
        if (!hasAnimateClass) {
            return false;
        }
        if (!editingElement.classList.contains("o_anim_fade_in")) {
            return true;
        }

        const possibleDirections = getSelectableClasses(
            dependencyManager,
            "animation_direction_opt"
        ).filter(Boolean);
        const hasDirection = possibleDirections.some((direction) =>
            editingElement.classList.contains(direction)
        );

        return hasDirection;
    }
}

/**
 * Returns the selectable classes for the given dependency.
 *
 * @returns {Array<string>}
 */
function getSelectableClasses(dependencyManager, dependency) {
    function getClassActions(item) {
        return item
            .getActions()
            .map((action) => action.actionId === "classAction" && action.actionParam.split(/\s+/))
            .filter(Boolean)
            .flat();
    }
    const items = dependencyManager.get(dependency)?.getSelectableItems() || [];
    return [...new Set(items.map(getClassActions).flat())];
}

function intersect(a, b) {
    return a.filter((value) => b.includes(value));
}
