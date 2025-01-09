import { renderToElement } from "@web/core/utils/render";
import options from "@web_editor/js/editor/snippets.options";

options.registry.countdownInlineTemplates = options.registry.SelectTemplate.extend({
    /**
     * @constructor
     */
    init() {
        this._super(...arguments);
        this.containerSelector = '> .s_countdown_inline_wrapper';
        this.selectTemplateWidgetName = 'countdown_inline_template_opt';
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Hide the "subtle colors" option when the default color is defined.
     *
     * @override
     */
    _computeWidgetVisibility: function(widgetName, params) {
        if (widgetName === "subtle_colors_opt") {
            const defaultColors = this.$target[0].classList.contains('o_countdown_default');
            return !defaultColors;
        }
        return this._super(...arguments);
    },
});

options.registry.countdownInline = options.Class.extend({
    events: Object.assign({}, options.Class.prototype.events || {}, {
        'click .toggle-edit-message': '_onToggleEndMessageClick',
    }),

    /**
     * Remove any preview classes, if present.
     *
     * @override
     */
    async cleanForSave() {
        this.$target[0].querySelector(".s_countdown_inline_wrapper")?.classList.remove("s_countdown_none");
        this.$target[0].querySelector(".s_countdown_inline_end_message")?.classList.remove("s_countdown_enable_preview");
    },

    //--------------------------------------------------------------------------
    // Options
    //--------------------------------------------------------------------------

    /**
     * Changes the countdown action at zero.
     *
     * @see this.selectClass for parameters
     */
    endAction(previewMode, widgetValue, params) {
        const endMessageEl = this.$target[0].querySelector(".s_countdown_inline_end_message");
        this.$target[0].dataset.endAction = widgetValue;
        if (widgetValue === 'message' || widgetValue === 'message_no_countdown') {
            if (!endMessageEl) {
                const message = this.endMessage || renderToElement('website.s_countdown_inline.end_message');
                this.$target[0].append(message);
            }
            this.$target[0].classList.toggle('hide-countdown', widgetValue === 'message_no_countdown');
        } else {
            if (this.showEndMessage) {
                this._onToggleEndMessageClick();
            }
            if (endMessageEl) {
                this.endMessage = new DOMParser().parseFromString(endMessageEl.outerHTML, 'text/html').body.firstElementChild;
                endMessageEl.remove();
            }
        }
    },

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    async updateUIVisibility() {
        await this._super(...arguments);

        // End Message UI
        this.updateUIEndMessage();
    },
    /**
     * @see this.updateUI
     */
    updateUIEndMessage() {
        const endMessageEl = this.$target[0].querySelector('.s_countdown_inline_end_message');
        const countdownWrapperEl = this.$target[0].querySelector('.s_countdown_inline_wrapper');
        countdownWrapperEl.classList.toggle("s_countdown_none", this.showEndMessage === true && this.$target[0].classList.contains("hide-countdown"));
        if(endMessageEl) {
            endMessageEl.classList.toggle("s_countdown_enable_preview", this.showEndMessage === true);
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _computeWidgetState(methodName, params) {
        if (methodName === 'endAction') {
            return this.$target[0].dataset[methodName];
        }
        return this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Handlers
    //--------------------------------------------------------------------------

    /**
     * @private
     */
    _onToggleEndMessageClick() {
        this.showEndMessage = !this.showEndMessage;
        this.$el[0].querySelector(".toggle-edit-message").classList.toggle('text-success', this.showEndMessage);
        this.updateUIEndMessage();
        this.trigger_up('cover_update');
    },
});
