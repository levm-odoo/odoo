/** @odoo-module **/

import "@website/snippets/s_website_form/000";  // force deps
import publicWidget from '@web/legacy/js/public/public_widget';
import { renderToElement } from "@web/core/utils/render";
import { session } from "@web/session";

publicWidget.registry.s_website_form.include({
        /**
         * @override
         */
        start: function () {
            const res = this._super(...arguments);
            this.cleanTurnstile();
            if (!this.isEditable && !this.$('.s_turnstile').length && session.turnstile_site_key) {
                const mode = new URLSearchParams(window.location.search).get('cf') == 'show' ? 'always' : 'interaction-only';
                const turnstileContainer = renderToElement("website_cf_turnstile.turnstile_container", {
                    action: "website_form",
                    appearance: mode,
                    additionalClasses: "float-end",
                    errorGlobalCallback: "throwTurnstileErrorCode",
                    sitekey: session.turnstile_site_key,
                });
                const turnstileScript = renderToElement("website_cf_turnstile.turnstile_remote_script");
                const turnstileErrorGlobalScript = $(`<script class="s_turnstile">
                        // Rethrow the error, or we only will catch a "Script error" without any info 
                        // because of the script api.js originating from a different domain.
                        function throwTurnstileError(code) {
                            const error = new Error("Turnstile Error");
                            error.code = code;
                            throw error;
                        }
                    </script>
                `);
                $(turnstileContainer).add(turnstileErrorGlobalScript).add($(turnstileScript))
                .insertAfter('.s_website_form_send, .o_website_form_send');
            }
            return res;
        },

        /**
         * Remove potential existing loaded script/token
         */
        cleanTurnstile: function () {
            if (this.$('.s_turnstile').length) {
                this.$('.s_turnstile').remove();
            }
        },

        /**
         * @override
         * Discard all library changes to reset the state of the Html.
         */
        destroy: function () {
            this.cleanTurnstile();
            this._super(...arguments);
        },
});
