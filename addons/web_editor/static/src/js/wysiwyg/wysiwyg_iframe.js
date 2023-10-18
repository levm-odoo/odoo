/** @odoo-module **/

import { Wysiwyg } from '@web_editor/js/wysiwyg/wysiwyg';
import { patch } from "@web/core/utils/patch";
import { isMobileOS } from "@web/core/browser/feature_detection";
import { useService } from '@web/core/utils/hooks';

let jsAssets;

/**
 * Add option (inIframe) to load Wysiwyg in an iframe.
 **/

patch(Wysiwyg.prototype, {
    /**
     * Add options to load Wysiwyg in an iframe.
     *
     * @override
     * @param {boolean} options.inIframe
     **/
    init() {
        super.init();
        if (this.options.inIframe) {
            this._onUpdateIframeId = 'onLoad_' + this.id;
        }
    },
    /**
     * @override
     */
    setup() {
        super.setup();
        this.http = useService("http");
    },
    /**
     * @override
     **/
    async startEdition() {
        if (!this.options.inIframe) {
            return super.startEdition();
        } else {
            await this._loadIframe();
            return super.startEdition();
        }
    },

    /**
     * @override
     **/
    destroy() {
        if (this.options.inIframe) {
            this.$iframe?.[0].contentDocument.removeEventListener('scroll', this._onScroll, true);
        }
        super.destroy();
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     **/
    _getEditorOptions() {
        const options = super._getEditorOptions(...arguments);
        if (!("getContextFromParentRect" in options)) {
            options.getContextFromParentRect = () => {
                return this.$iframe && this.$iframe.length ? this.$iframe[0].getBoundingClientRect() : { top: 0, left: 0 };
            };
        }
        return options;
    },
    /**
     * Create iframe, inject css and create a link with the content,
     * then inject the target inside.
     *
     * @private
     * @returns {Promise}
     */
    _loadIframe() {
        var self = this;
        const isEditableRoot = this.$editable === this.$root;
        this.$editable = $('<div class="note-editable oe_structure odoo-editor-editable"></div>');
        this.$el.removeClass('note-editable oe_structure odoo-editor-editable');
        if (isEditableRoot) {
            this.$root = this.$editable;
        }
        this.$iframe = $('<iframe class="wysiwyg_iframe o_iframe">').css({
            width: '100%'
        });
        var avoidDoubleLoad = 0; // this bug only appears on some configurations.

        // resolve promise on load
        var def = new Promise(function (resolve) {
            window.top[self._onUpdateIframeId] = function (_avoidDoubleLoad) {
                if (_avoidDoubleLoad !== avoidDoubleLoad) {
                    console.warn('Wysiwyg iframe double load detected');
                    return;
                }
                delete window.top[self._onUpdateIframeId];
                var $iframeTarget = self.$iframe.contents().find('#iframe_target');
                // copy the html in itself to have the node prototypes relative
                // to this window rather than the iframe window.
                const $targetClone = $iframeTarget.clone();
                $targetClone.find('script').remove();
                $iframeTarget.html($targetClone.html());
                self.$iframeBody = $iframeTarget;
                $iframeTarget.attr("isMobile", isMobileOS());
                const $utilsZone = $('<div class="iframe-utils-zone">');
                self.$utilsZone = $utilsZone;

                const $iframeWrapper = $('<div class="iframe-editor-wrapper odoo-editor">');
                const $codeview = $('<textarea class="o_codeview d-none"/>');
                self.$editable.addClass('o_editable oe_structure');

                $iframeTarget.append($codeview);
                $iframeTarget.append($iframeWrapper);
                $iframeTarget.append($utilsZone);
                $iframeWrapper.append(self.$editable);

                self.options.toolbarHandler = $('#web_editor-top-edit', self.$iframe[0].contentWindow.document);
                $iframeTarget.on('click', '.o_fullscreen_btn', function () {
                    $("body").toggleClass("o_field_widgetTextHtml_fullscreen");
                    var full = $("body").hasClass("o_field_widgetTextHtml_fullscreen");
                    self.$iframe.parents().toggleClass('o_form_fullscreen_ancestor', full);
                    $(window).trigger("resize"); // induce a resize() call and let other backend elements know (the navbar extra items management relies on this)
                });
                resolve();
            };
        });
        this.$iframe.data('loadDef', def); // for unit test

        // inject content in iframe

        this.$iframe.on('load', function onLoad (ev) {
            var _avoidDoubleLoad = ++avoidDoubleLoad;
            self._getIframeContent(_avoidDoubleLoad).then(function (iframeContent) {
                if (_avoidDoubleLoad !== avoidDoubleLoad) {
                    console.warn('Wysiwyg immediate iframe double load detected');
                    return;
                }
                self.$iframe[0].contentWindow.document
                    .open("text/html", "replace")
                    .write(`<!DOCTYPE html><html${
                        self.options.iframeHtmlClass ? ' class="' + self.options.iframeHtmlClass +'"' : ''
                    }>${iframeContent}</html>`);
            });
            self.options.document = self.$iframe[0].contentWindow.document;
        });

        this.$el.append(this.$iframe);

        return def.then(() => {
            this.options.onIframeUpdated();
        });
    },

    _insertSnippetMenu() {
        if (this.options.inIframe) {
            return this.snippetsMenu.appendTo(this.$utilsZone);
        } else {
            return super._insertSnippetMenu(...arguments);
        }
    },
    /**
     * Get assets for the iframe.
     *
     * @private
     * @returns {Promise}
     */
    async _getIframeContent(avoidDoubleLoad) {
        jsAssets = jsAssets || "web_editor.wysiwyg_iframe_editor_assets";
        const bundleNames = [jsAssets];
        if (this.options.iframeCssAssets) {
            bundleNames.push(this.options.iframeCssAssets);
        }
        return this.http.post(
            `/web_editor/wysiwyg_iframe`,
            {
                avoidDoubleLoad,
                bundleNames: bundleNames.join(","),
                onUpdateIframeId: this._onUpdateIframeId,
                csrf_token: odoo.csrf_token,
            },
            "text"
        );
    },

    /**
     * Bind the blur event on the iframe so that it would not blur when using
     * the sidebar.
     *
     * @override
     */
    _bindOnBlur() {
        if (!this.options.inIframe) {
            super._bindOnBlur(...arguments);
        } else {
            this.$iframe[0].contentWindow.addEventListener('blur', this._onBlur);
        }
    },

    /**
     * When the editable is inside an iframe, we want to update the toolbar
     * position in 2 scenarios:
     * 1. scroll event in the top document, if the iframe is a descendant of
     * the scroll container.
     * 2. scroll event in the iframe's document.
     * 
     * @override
     */
    _onScroll(ev) {
        if (this.options.inIframe) {
            const iframeDocument = this.$iframe[0].contentDocument;
            const scrollInIframe = ev.target === iframeDocument || ev.target.ownerDocument === iframeDocument;
            if (ev.target.contains(this.$iframe[0]))  {
                this.scrollContainer = ev.target;
                this.odooEditor.updateToolbarPosition();
            } else if (scrollInIframe) {
                // UpdateToolbarPosition needs a scroll container in the top document.
                this.scrollContainer = this.$iframe[0];
                this.odooEditor.updateToolbarPosition();
            }
        } else {
            return super._onScroll(...arguments);
        }
    },

    /**
     * @override
     */
    _configureToolbar(options) {
        super._configureToolbar(...arguments);
        if (this.options.inIframe && !options.snippets) {
            this.$iframe[0].contentDocument.addEventListener('scroll', this._onScroll, true);
        }
    },
});
