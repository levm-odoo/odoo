import { Component, onWillStart, onWillUpdateProps, useState } from "@odoo/owl";
import { getSnippetName } from "@html_builder/builder/utils/utils";
export class InvisibleElementsPanel extends Component {
    static template = "html_builder.InvisibleElementsPanel";
    static props = {
        invisibleEls: { type: Array },
        invisibleSelector: { type: String },
    };

    setup() {
        this.state = useState({ invisibleEntries: null });

        onWillStart(() => this.updateInvisibleElementsPanel(this.props.invisibleEls));

        onWillUpdateProps((nextProps) => {
            this.updateInvisibleElementsPanel(nextProps["invisibleEls"]);
        });
    }

    updateInvisibleElementsPanel(invisibleEls) {
        // descendantPerSnippet: a map with its keys set to invisible
        // snippets that have invisible descendants. The value corresponding
        // to an invisible snippet element is a list filled with all its
        // descendant invisible snippets except those that have a closer
        // invisible snippet ancestor.
        const descendantPerSnippet = new Map();
        // Filter the invisibleEls to only keep the root snippets
        // and create the map ("descendantPerSnippet") of the snippets and
        // their descendant snippets.
        const rootInvisibleSnippetEls = invisibleEls.filter((invisibleSnippetEl) => {
            const ancestorInvisibleEl = invisibleSnippetEl.parentElement.closest(
                this.props.invisibleSelector
            );
            if (!ancestorInvisibleEl) {
                return true;
            }
            const descendantSnippets = descendantPerSnippet.get(ancestorInvisibleEl) || [];
            descendantPerSnippet.set(ancestorInvisibleEl, [
                ...descendantSnippets,
                invisibleSnippetEl,
            ]);
            return false;
        });
        // Insert all the invisible snippets contained in "snippetEls" as
        // well as their descendants in the "parentEl" element. If
        // "snippetEls" is set to "rootInvisibleSnippetEls" and "parentEl"
        // is set to "$invisibleDOMPanelEl[0]", then fills the right
        // invisible panel like this:
        // rootInvisibleSnippet
        //     └ descendantInvisibleSnippet
        //          └ descendantOfDescendantInvisibleSnippet
        //               └ etc...
        const createInvisibleEntries = (snippetEls, isDescendant) =>
            snippetEls.map((snippetEl) => {
                const descendantSnippetEls = descendantPerSnippet.get(snippetEl);
                // An element is considered as "RootParent" if it has one or
                // more invisible descendants but is not a descendant.
                const invisibleElement = {
                    snippetEl: snippetEl,
                    name: getSnippetName(snippetEl),
                    isRootParent: !isDescendant && !!descendantSnippetEls,
                    isDescendant,
                    isVisible: snippetEl.dataset.invisible !== "1",
                    children: [],
                };
                if (descendantSnippetEls) {
                    invisibleElement.children = createInvisibleEntries(descendantSnippetEls, true);
                }
                return invisibleElement;
            });
        this.state.invisibleEntries = createInvisibleEntries(rootInvisibleSnippetEls, false);
    }

    toggleElementVisibility(invisibleEntry) {
        const toggleVisibility = (snippetEl) => {
            const show = this.env.editor.shared.visibilityPlugin.toggleTargetVisibility(snippetEl);
            invisibleEntry.isVisible = show;
            this.env.editor.shared["builder-options"].updateContainers(snippetEl);
            // TODO _disableUndroppableSnippets
        };

        // When toggling the visibility of an element to "Hide", also toggle all
        // its descendants.
        if (invisibleEntry.isVisible) {
            invisibleEntry.children.forEach((child) => {
                if (child.isVisible) {
                    this.toggleElementVisibility(child);
                }
            });
        } else if (invisibleEntry.parents && !invisibleEntry.parents.isVisible) {
            // When toggling the visibility of an element to "Show", also toggle
            // all its parents.
            this.toggleElementVisibility(invisibleEntry.parents);
        }
        toggleVisibility(invisibleEntry.snippetEl);
    }
}
