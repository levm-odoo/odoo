import {
    childNodesPhrasingAnalysis,
    isMediaElement,
    isProtected,
    isProtecting,
} from "@html_editor/utils/dom_info";
import { Plugin } from "../plugin";
import { fillEmpty } from "@html_editor/utils/dom";
import {
    BASE_CONTAINER_CLASS,
    SUPPORTED_BASE_CONTAINER_NAMES,
    BaseContainerFactory,
} from "../utils/base_container";
import { withSequence } from "@html_editor/utils/resource";

export class BaseContainerPlugin extends Plugin {
    static id = "baseContainer";
    static shared = [
        "createBaseContainer",
        "getDefaultNodeName",
        "getGlobalSelector",
        "getFactory",
        "getSelector",
        "isEligibleForBaseContainer",
    ];
    baseContainerFactory = new BaseContainerFactory(this.config.baseContainer, this.document);
    // Register one of the predicates for `not_eligible_for_base_container_predicates`
    // as a property for optimization, see variants of `isEligibleForBaseContainer`.
    hasNonPhrasingContentPredicate = (element) => {
        const analysis = childNodesPhrasingAnalysis(element);
        return analysis.flowContent.length !== 0;
    };
    // The `unsplittable` predicate for `not_eligible_for_base_container_predicates`
    // is defined in this file and not in split_plugin because it has to be removed
    // in a specific case: see `isEligibleForBaseContainerAllowUnsplittable`.
    isUnsplittablePredicate = (element) => {
        return this.delegateTo("unsplittable_node_predicates", element);
    };
    resources = {
        // `baseContainer` normalization should occur after every other normalization
        // because a `div` may only have the baseContainer identity if it does not
        // already have an other incompatible identity given by another plugin.
        normalize_handlers: withSequence(1000000, this.normalizeDivBaseContainers.bind(this)),
        unsplittable_node_predicates: (node) => {
            if (node.nodeName !== "DIV") {
                return false;
            }
            return !this.isEligibleForBaseContainerAllowUnsplittable(node);
        },
        not_eligible_for_base_container_predicates: [
            (node) => {
                return (
                    !node ||
                    node.nodeType !== Node.ELEMENT_NODE ||
                    !SUPPORTED_BASE_CONTAINER_NAMES.includes(node.tagName) ||
                    isProtected(node) ||
                    isProtecting(node) ||
                    isMediaElement(node)
                );
            },
            this.isUnsplittablePredicate,
            this.hasNonPhrasingContentPredicate,
        ],
        system_classes: [BASE_CONTAINER_CLASS],
    };

    createBaseContainer(nodeName = this.baseContainerFactory.nodeName) {
        return this.getFactory(nodeName).create();
    }

    getDefaultNodeName() {
        return this.baseContainerFactory.nodeName;
    }

    getGlobalSelector() {
        return BaseContainerFactory.selector;
    }

    getFactory(nodeName = this.baseContainerFactory.nodeName) {
        return nodeName === this.baseContainerFactory.nodeName
            ? this.baseContainerFactory
            : new BaseContainerFactory(nodeName, this.document);
    }

    getSelector(nodeName = this.baseContainerFactory.nodeName) {
        return this.getFactory(nodeName).selector;
    }

    /**
     * Evaluate if an element is eligible to become a baseContainer (i.e. an
     * unmarked div which could receive baseContainer attributes to inherit
     * paragraph-like features).
     *
     * This function considers unsplittable and childNodes.
     */
    isEligibleForBaseContainer(element) {
        return !this.delegateTo("not_eligible_for_base_container_predicates", element);
    }

    /**
     * Evaluate if an element would be eligible to become a baseContainer
     * without considering unsplittable.
     *
     * This function is only meant to be used during `unsplittable_node_predicates` to
     * avoid an infinite loop. A `div` without `oe_unbreakable` class is unsplittable
     * unless it is eligible to be a baseContainer.
     */
    isEligibleForBaseContainerAllowUnsplittable(element) {
        const predicates = new Set(this.getResource("not_eligible_for_base_container_predicates"));
        predicates.delete(this.isUnsplittablePredicate);
        for (const predicate of predicates) {
            if (predicate(element)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Evaluate if an element would be eligible to become a baseContainer
     * without considering its childNodes.
     *
     * This function is only meant to be used internally, to avoid having to
     * compute childNodes multiple times in more complex operations.
     */
    shallowIsEligibleForBaseContainer(element) {
        const predicates = new Set(this.getResource("not_eligible_for_base_container_predicates"));
        predicates.delete(this.hasNonPhrasingContentPredicate);
        for (const predicate of predicates) {
            if (predicate(element)) {
                return false;
            }
        }
        return true;
    }

    normalizeDivBaseContainers(element = this.editable) {
        const newBaseContainers = [];
        const divSelector = `div:not(.${BASE_CONTAINER_CLASS})`;
        const targets = [...element.querySelectorAll(divSelector)];
        if (element.matches(divSelector)) {
            targets.unshift(element);
        }
        for (const div of targets) {
            if (
                // Ensure that newly created `div` baseContainers are never themselves
                // children of a baseContainer. BaseContainers should always only
                // contain phrasing content (even `div`), because they could be
                // converted to an element which can actually only contain phrasing
                // content. In practice a div should never be a child of a
                // baseContainer, since a baseContainer should only contain
                // phrasingContent.
                !div.parentElement?.matches(BaseContainerFactory.selector) &&
                this.shallowIsEligibleForBaseContainer(div)
            ) {
                const analysis = childNodesPhrasingAnalysis(div);
                if (analysis.flowContent.length === 0) {
                    div.classList.add(BASE_CONTAINER_CLASS);
                    newBaseContainers.push(div);
                    if (analysis.childNodes.length === 0) {
                        fillEmpty(div);
                    }
                }
            }
        }
    }
}
