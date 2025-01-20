import { Plugin } from "@html_editor/plugin";
import { reactive } from "@odoo/owl";
import { rotate } from "@web/core/utils/arrays";
import { SuggestionList } from "./suggestion_list";
import { renderToElement } from "@web/core/utils/render";
import { rightPos } from "@html_editor/utils/position";
import { stateToUrl } from "@web/core/browser/router";
import { escape } from "@web/core/utils/strings";
import { debounce } from "@web/core/utils/timing";
import { ConnectionAbortedError } from "@web/core/network/rpc";

export class SuggestionPlugin extends Plugin {
    static id = "suggestion";
    static dependencies = [
        "input",
        "overlay",
        "selection",
        "history",
        "userCommand",
        "dom",
        "delete",
    ];
    resources = {
        beforeinput_handlers: this.onBeforeInput.bind(this),
        input_handlers: this.onInput.bind(this),
        delete_handlers: this.detect.bind(this),
        post_undo_handlers: this.detect.bind(this),
        post_redo_handlers: this.detect.bind(this),
    };

    setup() {
        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.overlay = this.dependencies.overlay.createOverlay(SuggestionList);
        this.supportedDelimiters = ["@", "#", ":"];
        this.param = {
            delimiter: undefined,
            term: "",
        };
        this.lastFetchedSearch = undefined;
        this.searchState = reactive({
            count: 0,
            items: undefined,
            isFetching: false,
        });
        this.suggestionListState = reactive({});
        this.debouncedFetchSuggestions = debounce(this.fetchSuggestions.bind(this), 250);
        this.addDomListener(this.editable.ownerDocument, "keydown", this.onKeyDown);
    }

    get suggestionService() {
        return this.config.suggestionService;
    }

    get isSearchMoreSpecificThanLastFetch() {
        return this.param.term.startsWith(this.lastFetchedSearch.term);
    }

    get thread() {
        const composer = this.config.mailServices?.composer.props.composer;
        return composer?.thread || composer?.message.thread;
    }

    onKeyDown(ev) {
        if (!this.overlay.isOpen) {
            return;
        }
        const key = ev.key;
        switch (key) {
            case "Escape":
                this.closeSuggestionList();
                break;
            case "Enter":
            case "Tab":
                ev.preventDefault();
                ev.stopImmediatePropagation();
                this.applySuggestion(
                    this.suggestionListState.suggestions[this.suggestionListState.currentIndex]
                );
                break;
            case "ArrowUp": {
                ev.preventDefault();
                this.suggestionListState.currentIndex = rotate(
                    this.suggestionListState.currentIndex,
                    this.suggestionListState.suggestions,
                    -1
                );
                break;
            }
            case "ArrowDown": {
                ev.preventDefault();
                this.suggestionListState.currentIndex = rotate(
                    this.suggestionListState.currentIndex,
                    this.suggestionListState.suggestions,
                    1
                );
                break;
            }
            case "ArrowLeft":
            case "ArrowRight": {
                this.closeSuggestionList();
                break;
            }
        }
    }

    onBeforeInput(ev) {
        const char = ev.data;
        if (this.supportedDelimiters.includes(char)) {
            this.historySavePointRestore = this.dependencies.history.makeSavePoint();
        }
    }

    onInput(ev) {
        const char = ev.data;
        if (this.supportedDelimiters.includes(char)) {
            if (char === ":" && !this.isCannedResponseDelimiter()) {
                return;
            }
            this.param.delimiter = char;
            this.openSuggestionList();
        } else {
            this.detect();
        }
    }

    isCannedResponseDelimiter() {
        const selection = this.dependencies.selection.getEditableSelection();
        const offset = selection.startOffset - 1;
        if (offset - 1 < 0) {
            return false;
        }
        const charBeforeCursor = selection.startContainer.nodeValue[offset - 1];
        if (charBeforeCursor !== ":") {
            return false;
        }
        return true;
    }

    openSuggestionList() {
        this.closeSuggestionList();
        const selection = this.dependencies.selection.getEditableSelection();
        this.offset = selection.startOffset - 1;
        this.param.term = "";
        const results = this.suggestionService.searchSuggestions(this.param, {
            thread: this.thread,
        });
        this.updateSuggestionList(results);
        this.fetch();
        this.shouldUpdate = true;
    }

    /**
     * @param {PowerboxCommand[]} suggestions
     */
    updateSuggestionList(suggestions) {
        Object.assign(this.suggestionListState, {
            suggestions,
            currentIndex: 0,
        });
        this.overlay.open({
            props: {
                document: this.document,
                close: () => this.overlay.close(),
                state: this.suggestionListState,
                activateSuggestion: (currentIndex) => {
                    this.suggestionListState.currentIndex = currentIndex;
                },
                applySuggestion: this.applySuggestion.bind(this),
            },
        });
    }

    closeSuggestionList() {
        if (!this.overlay.isOpen) {
            return;
        }
        this.shouldUpdate = false;
        this.overlay.close();
    }

    detect() {
        if (!this.shouldUpdate) {
            return;
        }
        const selection = this.dependencies.selection.getEditableSelection();
        this.searchNode = selection.startContainer;
        if (!this.isValidDetecting(selection)) {
            this.closeSuggestionList();
            this.clear();
            return;
        }
        const searchTerm = this.searchNode.nodeValue.slice(this.offset + 1, selection.endOffset);
        if (searchTerm.includes(" ")) {
            this.closeSuggestionList();
            return;
        }
        this.param.term = searchTerm;
        this.search();
        this.fetch();
    }

    search() {
        const suggestions = this.suggestionService.searchSuggestions(this.param, {
            thread: this.thread,
            sort: true,
        });
        if (!suggestions?.length && !this.searchState.isFetching) {
            this.closeSuggestionList();
            this.shouldUpdate = true;
            return;
        }
        // arbitrary limit to avoid displaying too many elements at once
        // ideally a load more mechanism should be introduced
        const limit = 8;
        suggestions.length = Math.min(suggestions.length, limit);
        this.updateSuggestionList(suggestions);
        return suggestions;
    }

    fetch() {
        const composer = this.config.mailServices?.composer.props.composer;
        if (!this.param.delimiter) {
            return; // nothing else to fetch
        }
        if (composer && composer.store.self.type !== "partner") {
            return; // guests cannot access fetch suggestion method
        }
        if (
            this.lastFetchedSearch?.count === 0 &&
            (!this.param.delimiter || this.isSearchMoreSpecificThanLastFetch)
        ) {
            return; // no need to fetch since this is more specific than last and last had no result
        }
        this.debouncedFetchSuggestions();
    }

    async fetchSuggestions() {
        let resetFetchingState = true;
        try {
            this.abortController?.abort();
            this.abortController = new AbortController();
            this.searchState.isFetching = true;
            await this.suggestionService.fetchSuggestions(this.param, {
                thread: this.thread,
                abortSignal: this.abortController.signal,
            });
        } catch (e) {
            if (e instanceof ConnectionAbortedError) {
                resetFetchingState = false;
                return;
            }
            this.lastFetchedSearch = null;
        } finally {
            if (resetFetchingState) {
                this.searchState.isFetching = false;
            }
        }
        const results = this.search();
        this.lastFetchedSearch = {
            ...this.param,
            count: results?.length ?? 0,
        };
    }

    isValidDetecting(selection) {
        return (
            selection.endContainer === this.searchNode &&
            this.searchNode.nodeValue?.[this.offset] === this.param.delimiter &&
            selection.endOffset >= this.offset
        );
    }

    clear() {
        Object.assign(this.param, {
            delimiter: undefined,
            term: "",
        });
    }

    insert(option) {
        if (option.partner) {
            this.config.mailServices?.composer.props.composer.mentionedPartners.add({
                id: option.partner.id,
                type: "partner",
            });
            const partnerBlock = renderToElement("mail.Suggestion.Partner", {
                href: stateToUrl({ model: "res.partner", resId: option.partner.id }),
                partnerId: option.partner.id,
                displayName: option.partner.name,
            });
            this.dependencies.dom.insert(partnerBlock);
            const [anchorNode, anchorOffset] = rightPos(partnerBlock);
            this.dependencies.selection.setSelection({ anchorNode, anchorOffset });
            this.dependencies.dom.insert("\u00A0");
        }
        if (option.thread) {
            this.config.mailServices?.composer.props.composer.mentionedChannels.add({
                model: "discuss.channel",
                id: option.thread.id,
            });
            const thread = option.thread;
            let className, text;
            if (thread.parent_channel_id) {
                className = "o_channel_redirect o_channel_redirect_asThread";
                text = escape(`#${thread.parent_channel_id.displayName} > ${thread.displayName}`);
            } else {
                className = "o_channel_redirect";
                text = escape(`#${thread.displayName}`);
            }
            const threadBlock = renderToElement("mail.Suggestion.Thread", {
                href: stateToUrl({ model: "discuss.channel", resId: thread.id }),
                threadId: option.thread.id,
                displayName: text,
                className,
            });
            this.dependencies.dom.insert(threadBlock);
            const [anchorNode, anchorOffset] = rightPos(threadBlock);
            this.dependencies.selection.setSelection({ anchorNode, anchorOffset });
            this.dependencies.dom.insert("\u00A0");
        }
        if (option.cannedResponse) {
            this.config.mailServices?.composer.props.composer.cannedResponses.push(
                option.cannedResponse
            );
            this.dependencies.dom.insert(option.description);
        }
    }

    applySuggestion(suggestion) {
        this.historySavePointRestore();
        if (this.param.delimiter === ":") {
            // remove extra colon from the left of the cursor
            this.dependencies.delete.delete("backward", "character");
        }
        this.insert(suggestion);
        this.dependencies.history.addStep();
        this.closeSuggestionList();
        this.clear();
        this.dependencies.selection.focusEditable();
    }
}
